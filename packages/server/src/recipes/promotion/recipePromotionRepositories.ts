import Database from 'better-sqlite3';
import type { Recipe, RecipeBuilderDraftRecipe, RecipeBuilderJob, RecipeBuilderParsedRow, RecipeBuilderResolutionRow } from '@fifoflow/shared';
import { initializeRecipeTemplateLibraryDb } from '../builder/persistence/sqliteTemplateSchema.js';
import { initializeRecipeBuilderDb } from '../builder/persistence/sqliteSchema.js';
import { initializeRecipePromotionDb } from './persistence/sqliteSchema.js';
import type {
  RecipeBuilderPromotionLink,
  RecipeIngredientRecord,
  RecipePromotionDraftContext,
  RecipePromotionEvent,
  RecipePromotionRepository,
  RecipeVersionRecord,
} from './types.js';

export class SQLiteRecipePromotionRepository implements RecipePromotionRepository {
  constructor(private readonly db: Database.Database) {
    initializeRecipeTemplateLibraryDb(db);
    initializeRecipeBuilderDb(db);
    initializeRecipePromotionDb(db);
  }

  async withTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const result = await work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async loadDraftContext(jobId: number | string): Promise<RecipePromotionDraftContext | null> {
    const jobRow = this.db.prepare('SELECT * FROM recipe_builder_jobs WHERE id = ? LIMIT 1').get(jobId) as JobRow | undefined;
    if (!jobRow) {
      return null;
    }
    const draftRow = this.db.prepare('SELECT * FROM recipe_builder_draft_recipes WHERE recipe_builder_job_id = ? LIMIT 1').get(jobId) as DraftRow | undefined;
    if (!draftRow) {
      return null;
    }
    const parsedRows = this.db.prepare(
      'SELECT * FROM recipe_builder_parsed_rows WHERE recipe_builder_job_id = ? ORDER BY line_index ASC',
    ).all(jobId) as ParsedRow[];
    const resolutionRows = this.db.prepare(
      'SELECT * FROM recipe_builder_resolution_rows WHERE recipe_builder_job_id = ? ORDER BY parsed_row_id ASC',
    ).all(jobId) as ResolutionRow[];

    return {
      job: mapJobRow(jobRow),
      draft: mapDraftRow(draftRow),
      parsed_rows: parsedRows.map(mapParsedRow),
      resolution_rows: resolutionRows.map(mapResolutionRow),
    };
  }

  async getActivePromotionLink(draftId: number | string): Promise<RecipeBuilderPromotionLink | null> {
    const row = this.db.prepare(
      `
        SELECT *
        FROM recipe_builder_promotion_links
        WHERE recipe_builder_draft_recipe_id = ?
          AND active = 1
        LIMIT 1
      `,
    ).get(draftId) as PromotionLinkRow | undefined;
    return row ? mapPromotionLinkRow(row) : null;
  }

  async createRecipe(input: { name: string; type: Recipe['type']; notes?: string | null }): Promise<Recipe> {
    const result = this.db.prepare(
      'INSERT INTO recipes (name, type, notes) VALUES (?, ?, ?)',
    ).run(input.name, input.type, input.notes ?? null);
    const recipe = await this.getRecipeById(Number(result.lastInsertRowid));
    if (!recipe) {
      throw new Error('Failed to load created recipe.');
    }
    return recipe;
  }

  async getRecipeById(id: number | string): Promise<Recipe | null> {
    const row = this.db.prepare('SELECT * FROM recipes WHERE id = ? LIMIT 1').get(id) as RecipeRow | undefined;
    return row ? mapRecipeRow(row) : null;
  }

  async createRecipeVersion(input: {
    recipe_id: number | string;
    yield_quantity: number | null;
    yield_unit: string | null;
    source_builder_job_id: number | string;
    source_builder_draft_recipe_id: number | string;
    source_template_id: number | string | null;
    source_template_version_id: number | string | null;
    source_text_snapshot: string | null;
  }): Promise<RecipeVersionRecord> {
    const nextVersion = this.db.prepare(
      'SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM recipe_versions WHERE recipe_id = ?',
    ).get(input.recipe_id) as { next_version: number };

    const result = this.db.prepare(
      `
        INSERT INTO recipe_versions (
          recipe_id,
          version_number,
          status,
          yield_quantity,
          yield_unit,
          source_builder_job_id,
          source_builder_draft_recipe_id,
          source_template_id,
          source_template_version_id,
          source_text_snapshot
        ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.recipe_id,
      nextVersion.next_version,
      input.yield_quantity,
      input.yield_unit,
      input.source_builder_job_id,
      input.source_builder_draft_recipe_id,
      input.source_template_id,
      input.source_template_version_id,
      input.source_text_snapshot,
    );

    return this.getRecipeVersionById(Number(result.lastInsertRowid));
  }

  async replaceRecipeIngredients(
    recipeVersionId: number | string,
    ingredients: Array<Omit<RecipeIngredientRecord, 'id' | 'recipe_version_id' | 'created_at'>>,
  ): Promise<RecipeIngredientRecord[]> {
    this.db.prepare('DELETE FROM recipe_ingredients WHERE recipe_version_id = ?').run(recipeVersionId);
    const insert = this.db.prepare(
      `
        INSERT INTO recipe_ingredients (
          recipe_version_id,
          line_index,
          source_parsed_row_id,
          source_resolution_row_id,
          raw_ingredient_text,
          canonical_ingredient_id,
          inventory_item_id,
          quantity_normalized,
          unit_normalized,
          preparation_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const ingredient of ingredients) {
      insert.run(
        recipeVersionId,
        ingredient.line_index,
        ingredient.source_parsed_row_id,
        ingredient.source_resolution_row_id,
        ingredient.raw_ingredient_text,
        ingredient.canonical_ingredient_id,
        ingredient.inventory_item_id,
        ingredient.quantity_normalized,
        ingredient.unit_normalized,
        ingredient.preparation_note,
      );
    }

    return this.listRecipeIngredients(recipeVersionId);
  }

  async createPromotionEvent(input: Omit<RecipePromotionEvent, 'id' | 'created_at'>): Promise<RecipePromotionEvent> {
    const result = this.db.prepare(
      `
        INSERT INTO recipe_promotion_events (
          recipe_builder_job_id,
          recipe_builder_draft_recipe_id,
          action_type,
          status,
          promoted_recipe_id,
          promoted_recipe_version_id,
          notes,
          created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.recipe_builder_job_id,
      input.recipe_builder_draft_recipe_id,
      input.action_type,
      input.status,
      input.promoted_recipe_id,
      input.promoted_recipe_version_id,
      input.notes,
      input.created_by,
    );
    return this.getPromotionEventById(Number(result.lastInsertRowid));
  }

  async upsertPromotionLink(input: Omit<RecipeBuilderPromotionLink, 'id' | 'created_at'>): Promise<RecipeBuilderPromotionLink> {
    const existing = this.db.prepare(
      `
        SELECT *
        FROM recipe_builder_promotion_links
        WHERE recipe_builder_draft_recipe_id = ?
          AND active = 1
        LIMIT 1
      `,
    ).get(input.recipe_builder_draft_recipe_id) as PromotionLinkRow | undefined;

    if (!existing) {
      const result = this.db.prepare(
        `
          INSERT INTO recipe_builder_promotion_links (
            recipe_builder_draft_recipe_id,
            recipe_id,
            recipe_version_id,
            active
          ) VALUES (?, ?, ?, ?)
        `,
      ).run(
        input.recipe_builder_draft_recipe_id,
        input.recipe_id,
        input.recipe_version_id,
        input.active ? 1 : 0,
      );
      return this.getPromotionLinkById(Number(result.lastInsertRowid));
    }

    this.db.prepare(
      `
        UPDATE recipe_builder_promotion_links
        SET recipe_id = ?,
            recipe_version_id = ?,
            active = ?
        WHERE id = ?
      `,
    ).run(input.recipe_id, input.recipe_version_id, input.active ? 1 : 0, existing.id);

    return this.getPromotionLinkById(existing.id);
  }

  async markDraftPromoted(jobId: number | string, _draftId: number | string): Promise<void> {
    this.db.prepare(
      `
        UPDATE recipe_builder_jobs
        SET status = 'CREATED',
            updated_at = datetime('now')
        WHERE id = ?
      `,
    ).run(jobId);
    this.db.prepare(
      `
        UPDATE recipe_builder_draft_recipes
        SET completeness_status = 'CREATED',
            updated_at = datetime('now')
        WHERE recipe_builder_job_id = ?
      `,
    ).run(jobId);
  }

  async listPromotionEvents(jobId: number | string): Promise<RecipePromotionEvent[]> {
    const rows = this.db.prepare(
      'SELECT * FROM recipe_promotion_events WHERE recipe_builder_job_id = ? ORDER BY id ASC',
    ).all(jobId) as PromotionEventRow[];
    return rows.map(mapPromotionEventRow);
  }

  async listRecipeVersions(recipeId: number | string): Promise<RecipeVersionRecord[]> {
    const rows = this.db.prepare(
      'SELECT * FROM recipe_versions WHERE recipe_id = ? ORDER BY version_number ASC',
    ).all(recipeId) as RecipeVersionRow[];
    return rows.map(mapRecipeVersionRow);
  }

  async listRecipeIngredients(recipeVersionId: number | string): Promise<RecipeIngredientRecord[]> {
    const rows = this.db.prepare(
      'SELECT * FROM recipe_ingredients WHERE recipe_version_id = ? ORDER BY line_index ASC',
    ).all(recipeVersionId) as RecipeIngredientRow[];
    return rows.map(mapRecipeIngredientRow);
  }

  private getRecipeVersionById(id: number): RecipeVersionRecord {
    const row = this.db.prepare('SELECT * FROM recipe_versions WHERE id = ? LIMIT 1').get(id) as RecipeVersionRow;
    return mapRecipeVersionRow(row);
  }

  private getPromotionEventById(id: number): RecipePromotionEvent {
    const row = this.db.prepare('SELECT * FROM recipe_promotion_events WHERE id = ? LIMIT 1').get(id) as PromotionEventRow;
    return mapPromotionEventRow(row);
  }

  private getPromotionLinkById(id: number): RecipeBuilderPromotionLink {
    const row = this.db.prepare('SELECT * FROM recipe_builder_promotion_links WHERE id = ? LIMIT 1').get(id) as PromotionLinkRow;
    return mapPromotionLinkRow(row);
  }
}

interface RecipeRow {
  id: number;
  name: string;
  type: Recipe['type'];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface JobRow extends RecipeBuilderJob {}
interface DraftRow extends RecipeBuilderDraftRecipe {}
interface ParsedRow extends RecipeBuilderParsedRow {}
interface ResolutionRow extends RecipeBuilderResolutionRow {}
interface RecipeVersionRow extends RecipeVersionRecord {}
interface RecipeIngredientRow extends RecipeIngredientRecord {}
interface PromotionEventRow extends RecipePromotionEvent {}
interface PromotionLinkRow {
  id: number;
  recipe_builder_draft_recipe_id: number;
  recipe_id: number;
  recipe_version_id: number;
  active: number;
  created_at: string;
}

function mapRecipeRow(row: RecipeRow): Recipe {
  return row;
}

function mapJobRow(row: JobRow): RecipeBuilderJob {
  return row;
}

function mapDraftRow(row: DraftRow): RecipeBuilderDraftRecipe {
  return row;
}

function mapParsedRow(row: ParsedRow): RecipeBuilderParsedRow {
  return row;
}

function mapResolutionRow(row: ResolutionRow): RecipeBuilderResolutionRow {
  return row;
}

function mapRecipeVersionRow(row: RecipeVersionRow): RecipeVersionRecord {
  return row;
}

function mapRecipeIngredientRow(row: RecipeIngredientRow): RecipeIngredientRecord {
  return row;
}

function mapPromotionEventRow(row: PromotionEventRow): RecipePromotionEvent {
  return row;
}

function mapPromotionLinkRow(row: PromotionLinkRow): RecipeBuilderPromotionLink {
  return {
    ...row,
    active: Boolean(row.active),
  };
}
