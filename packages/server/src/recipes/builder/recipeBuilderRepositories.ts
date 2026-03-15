import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import type {
  RecipeBuilderDraftRecipe,
  RecipeBuilderJob,
  RecipeBuilderParsedRow,
  RecipeBuilderResolutionRow,
} from '@fifoflow/shared';
import { normalizeIngredientLookup } from '../../mapping/ingredients/canonicalIngredientResolver.js';
import { buildTemplateIngredientRowKey } from '../../mapping/templates/templateIngredientMappingEngine.js';
import { initializeRecipeBuilderDb } from './persistence/sqliteSchema.js';
import { initializeRecipeTemplateLibraryDb } from './persistence/sqliteTemplateSchema.js';
import type {
  RecipeBuilderPersistenceRepository,
  RecipeBuilderRequest,
  RecipeBuilderSource,
  RecipeBuilderTemplateSourceRow,
} from './types.js';

export class SQLiteRecipeBuilderRepository implements RecipeBuilderSource, RecipeBuilderPersistenceRepository {
  constructor(private readonly db: Database.Database) {
    initializeRecipeTemplateLibraryDb(db);
    initializeRecipeBuilderDb(db);
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

  async createJob(input: RecipeBuilderRequest): Promise<RecipeBuilderJob> {
    const sourceHash = buildBuilderSourceHash(input);
    const result = this.db.prepare(
      `
        INSERT INTO recipe_builder_jobs (
          source_type,
          source_text,
          source_template_id,
          source_template_version_id,
          draft_name,
          status,
          source_hash
        ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
      `,
    ).run(
      input.source_type,
      input.source_type === 'freeform' ? input.source_text : null,
      input.source_type === 'template' ? input.source_template_id : null,
      input.source_type === 'template' ? (input.source_template_version_id ?? null) : null,
      input.draft_name ?? null,
      sourceHash,
    );

    return this.getJobById(Number(result.lastInsertRowid));
  }

  async getJob(jobId: number | string): Promise<RecipeBuilderJob | null> {
    const row = this.db.prepare('SELECT * FROM recipe_builder_jobs WHERE id = ? LIMIT 1').get(jobId) as JobRow | undefined;
    return row ? mapJobRow(row) : null;
  }

  async updateJobStatus(jobId: number | string, status: RecipeBuilderJob['status']): Promise<RecipeBuilderJob> {
    this.db.prepare(
      `
        UPDATE recipe_builder_jobs
        SET status = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `,
    ).run(status, jobId);
    return this.getJobById(Number(jobId));
  }

  async listTemplateSourceRows(templateId: number, templateVersionId?: number | null): Promise<RecipeBuilderTemplateSourceRow[]> {
    const version = templateVersionId == null
      ? this.db.prepare(
          `
            SELECT id
            FROM recipe_template_versions
            WHERE recipe_template_id = ?
              AND is_active = 1
            LIMIT 1
          `,
        ).get(templateId) as { id: number } | undefined
      : { id: templateVersionId };

    if (!version) {
      return [];
    }

    const rows = this.db.prepare(
      `
        SELECT
          t.id AS template_id,
          t.name AS template_name,
          t.category AS template_category,
          v.id AS template_version_id,
          v.version_number AS template_version_number,
          i.ingredient_name AS ingredient_name,
          i.qty AS qty,
          i.unit AS unit,
          i.sort_order AS sort_order
        FROM recipe_template_ingredients i
        INNER JOIN recipe_template_versions v ON v.id = i.recipe_template_version_id
        INNER JOIN recipe_templates t ON t.id = v.recipe_template_id
        WHERE t.id = ?
          AND v.id = ?
        ORDER BY i.sort_order ASC
      `,
    ).all(templateId, version.id) as TemplateSourceRow[];

    const rowsWithMappings = rows.map((row) => {
      const rowKey = buildTemplateIngredientRowKey({
        template_id: row.template_id,
        template_name: row.template_name,
        template_category: row.template_category,
        template_version_id: row.template_version_id,
        template_version_number: row.template_version_number,
        template_version_source_hash: '',
        ingredient_name: row.ingredient_name,
        normalized_ingredient_name: normalizeIngredientLookup(row.ingredient_name),
        qty: Number(row.qty),
        unit: row.unit,
        sort_order: row.sort_order,
      });

      const mapping = this.db.prepare(
        `
          SELECT
            m.mapped_canonical_ingredient_id AS mapped_canonical_ingredient_id,
            m.mapping_status AS template_mapping_status,
            c.canonical_name AS mapped_canonical_name
          FROM template_ingredient_mappings m
          LEFT JOIN canonical_ingredients c ON c.id = m.mapped_canonical_ingredient_id
          WHERE m.template_ingredient_row_key = ?
            AND m.active = 1
          LIMIT 1
        `,
      ).get(rowKey) as { mapped_canonical_ingredient_id: number | null; template_mapping_status: RecipeBuilderTemplateSourceRow['template_mapping_status']; mapped_canonical_name: string | null } | undefined;

      return {
        template_id: row.template_id,
        template_name: row.template_name,
        template_category: row.template_category,
        template_version_id: row.template_version_id,
        template_version_number: row.template_version_number,
        ingredient_name: row.ingredient_name,
        qty: Number(row.qty),
        unit: row.unit,
        sort_order: row.sort_order,
        mapped_canonical_ingredient_id: mapping?.mapped_canonical_ingredient_id ?? null,
        mapped_canonical_name: mapping?.mapped_canonical_name ?? null,
        template_mapping_status: mapping?.template_mapping_status ?? null,
      } satisfies RecipeBuilderTemplateSourceRow;
    });

    return rowsWithMappings;
  }

  async replaceParsedRows(
    jobId: number | string,
    rows: Array<Omit<RecipeBuilderParsedRow, 'id' | 'recipe_builder_job_id' | 'created_at' | 'updated_at'>>,
  ): Promise<RecipeBuilderParsedRow[]> {
    this.db.prepare('DELETE FROM recipe_builder_parsed_rows WHERE recipe_builder_job_id = ?').run(jobId);
    const insert = this.db.prepare(
      `
        INSERT INTO recipe_builder_parsed_rows (
          recipe_builder_job_id,
          line_index,
          raw_line_text,
          quantity_raw,
          quantity_normalized,
          unit_raw,
          unit_normalized,
          ingredient_text,
          preparation_note,
          parse_status,
          parser_confidence,
          explanation_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const row of rows) {
      insert.run(
        jobId,
        row.line_index,
        row.raw_line_text,
        row.quantity_raw,
        row.quantity_normalized,
        row.unit_raw,
        row.unit_normalized,
        row.ingredient_text,
        row.preparation_note,
        row.parse_status,
        row.parser_confidence,
        row.explanation_text,
      );
    }

    return this.listParsedRows(jobId);
  }

  async replaceResolutionRows(
    jobId: number | string,
    rows: Array<Omit<RecipeBuilderResolutionRow, 'id' | 'recipe_builder_job_id' | 'created_at' | 'updated_at'>>,
  ): Promise<RecipeBuilderResolutionRow[]> {
    this.db.prepare('DELETE FROM recipe_builder_resolution_rows WHERE recipe_builder_job_id = ?').run(jobId);
    const insert = this.db.prepare(
      `
        INSERT INTO recipe_builder_resolution_rows (
          parsed_row_id,
          recipe_builder_job_id,
          canonical_ingredient_id,
          canonical_match_status,
          canonical_confidence,
          canonical_match_reason,
          inventory_item_id,
          inventory_mapping_status,
          quantity_normalization_status,
          review_status,
          explanation_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const row of rows) {
      insert.run(
        row.parsed_row_id,
        jobId,
        row.canonical_ingredient_id,
        row.canonical_match_status,
        row.canonical_confidence,
        row.canonical_match_reason,
        row.inventory_item_id,
        row.inventory_mapping_status,
        row.quantity_normalization_status,
        row.review_status,
        row.explanation_text,
      );
    }

    return this.listResolutionRows(jobId);
  }

  async upsertDraftRecipe(
    draft: Omit<RecipeBuilderDraftRecipe, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<{ action: 'created' | 'updated'; record: RecipeBuilderDraftRecipe }> {
    const existing = this.db.prepare(
      'SELECT * FROM recipe_builder_draft_recipes WHERE recipe_builder_job_id = ? LIMIT 1',
    ).get(draft.recipe_builder_job_id) as DraftRow | undefined;

    if (!existing) {
      const result = this.db.prepare(
        `
          INSERT INTO recipe_builder_draft_recipes (
            recipe_builder_job_id,
            draft_name,
            yield_quantity,
            yield_unit,
            completeness_status,
            costability_status,
            ingredient_row_count,
            ready_row_count,
            review_row_count,
            blocked_row_count,
            unresolved_canonical_count,
            unresolved_inventory_count,
            source_recipe_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        draft.recipe_builder_job_id,
        draft.draft_name,
        draft.yield_quantity,
        draft.yield_unit,
        draft.completeness_status,
        draft.costability_status,
        draft.ingredient_row_count,
        draft.ready_row_count,
        draft.review_row_count,
        draft.blocked_row_count,
        draft.unresolved_canonical_count,
        draft.unresolved_inventory_count,
        draft.source_recipe_type,
      );
      return { action: 'created', record: this.getDraftRecipeById(Number(result.lastInsertRowid)) };
    }

    this.db.prepare(
      `
        UPDATE recipe_builder_draft_recipes
        SET draft_name = ?,
            yield_quantity = ?,
            yield_unit = ?,
            completeness_status = ?,
            costability_status = ?,
            ingredient_row_count = ?,
            ready_row_count = ?,
            review_row_count = ?,
            blocked_row_count = ?,
            unresolved_canonical_count = ?,
            unresolved_inventory_count = ?,
            source_recipe_type = ?,
            updated_at = datetime('now')
        WHERE recipe_builder_job_id = ?
      `,
    ).run(
      draft.draft_name,
      draft.yield_quantity,
      draft.yield_unit,
      draft.completeness_status,
      draft.costability_status,
      draft.ingredient_row_count,
      draft.ready_row_count,
      draft.review_row_count,
      draft.blocked_row_count,
      draft.unresolved_canonical_count,
      draft.unresolved_inventory_count,
      draft.source_recipe_type,
      draft.recipe_builder_job_id,
    );

    return { action: 'updated', record: this.getDraftRecipeByJobId(draft.recipe_builder_job_id) };
  }

  async listParsedRows(jobId: number | string): Promise<RecipeBuilderParsedRow[]> {
    const rows = this.db.prepare(
      'SELECT * FROM recipe_builder_parsed_rows WHERE recipe_builder_job_id = ? ORDER BY line_index ASC',
    ).all(jobId) as ParsedRow[];
    return rows.map(mapParsedRow);
  }

  async listResolutionRows(jobId: number | string): Promise<RecipeBuilderResolutionRow[]> {
    const rows = this.db.prepare(
      'SELECT * FROM recipe_builder_resolution_rows WHERE recipe_builder_job_id = ? ORDER BY parsed_row_id ASC',
    ).all(jobId) as ResolutionRow[];
    return rows.map(mapResolutionRow);
  }

  async getDraftRecipe(jobId: number | string): Promise<RecipeBuilderDraftRecipe | null> {
    const row = this.db.prepare(
      'SELECT * FROM recipe_builder_draft_recipes WHERE recipe_builder_job_id = ? LIMIT 1',
    ).get(jobId) as DraftRow | undefined;
    return row ? mapDraftRow(row) : null;
  }

  private getJobById(id: number): RecipeBuilderJob {
    const row = this.db.prepare('SELECT * FROM recipe_builder_jobs WHERE id = ? LIMIT 1').get(id) as JobRow;
    return mapJobRow(row);
  }

  private getDraftRecipeById(id: number): RecipeBuilderDraftRecipe {
    const row = this.db.prepare('SELECT * FROM recipe_builder_draft_recipes WHERE id = ? LIMIT 1').get(id) as DraftRow;
    return mapDraftRow(row);
  }

  private getDraftRecipeByJobId(jobId: number | string): RecipeBuilderDraftRecipe {
    const row = this.db.prepare('SELECT * FROM recipe_builder_draft_recipes WHERE recipe_builder_job_id = ? LIMIT 1').get(jobId) as DraftRow;
    return mapDraftRow(row);
  }
}

interface JobRow {
  id: number;
  source_type: RecipeBuilderJob['source_type'];
  source_text: string | null;
  source_template_id: number | null;
  source_template_version_id: number | null;
  draft_name: string | null;
  status: RecipeBuilderJob['status'];
  source_hash: string | null;
  created_at: string;
  updated_at: string;
}

interface ParsedRow {
  id: number;
  recipe_builder_job_id: number;
  line_index: number;
  raw_line_text: string;
  quantity_raw: string | null;
  quantity_normalized: number | null;
  unit_raw: string | null;
  unit_normalized: string | null;
  ingredient_text: string | null;
  preparation_note: string | null;
  parse_status: RecipeBuilderParsedRow['parse_status'];
  parser_confidence: RecipeBuilderParsedRow['parser_confidence'];
  explanation_text: string;
  created_at: string;
  updated_at: string;
}

interface ResolutionRow {
  id: number;
  parsed_row_id: number;
  recipe_builder_job_id: number;
  canonical_ingredient_id: number | null;
  canonical_match_status: RecipeBuilderResolutionRow['canonical_match_status'];
  canonical_confidence: RecipeBuilderResolutionRow['canonical_confidence'];
  canonical_match_reason: string | null;
  inventory_item_id: number | null;
  inventory_mapping_status: RecipeBuilderResolutionRow['inventory_mapping_status'];
  quantity_normalization_status: RecipeBuilderResolutionRow['quantity_normalization_status'];
  review_status: RecipeBuilderResolutionRow['review_status'];
  explanation_text: string;
  created_at: string;
  updated_at: string;
}

interface DraftRow {
  id: number;
  recipe_builder_job_id: number;
  draft_name: string;
  yield_quantity: number | null;
  yield_unit: string | null;
  completeness_status: RecipeBuilderDraftRecipe['completeness_status'];
  costability_status: RecipeBuilderDraftRecipe['costability_status'];
  ingredient_row_count: number;
  ready_row_count: number;
  review_row_count: number;
  blocked_row_count: number;
  unresolved_canonical_count: number;
  unresolved_inventory_count: number;
  source_recipe_type: RecipeBuilderDraftRecipe['source_recipe_type'];
  created_at: string;
  updated_at: string;
}

interface TemplateSourceRow {
  template_id: number;
  template_name: string;
  template_category: string;
  template_version_id: number;
  template_version_number: number;
  ingredient_name: string;
  qty: number;
  unit: string;
  sort_order: number;
}

function mapJobRow(row: JobRow): RecipeBuilderJob {
  return {
    ...row,
  };
}

function mapParsedRow(row: ParsedRow): RecipeBuilderParsedRow {
  return {
    ...row,
  };
}

function mapResolutionRow(row: ResolutionRow): RecipeBuilderResolutionRow {
  return {
    ...row,
  };
}

function mapDraftRow(row: DraftRow): RecipeBuilderDraftRecipe {
  return {
    ...row,
  };
}

function buildBuilderSourceHash(input: RecipeBuilderRequest): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
