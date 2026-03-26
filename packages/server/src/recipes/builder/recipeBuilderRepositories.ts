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
          source_template_ingredient_name,
          source_template_quantity,
          source_template_unit,
          source_template_sort_order,
          quantity_raw,
          quantity_normalized,
          unit_raw,
          unit_normalized,
          ingredient_text,
          preparation_note,
          parse_status,
          parser_confidence,
          estimated_flag,
          estimation_basis,
          alternative_item_matches_json,
          alternative_recipe_matches_json,
          detected_component_type,
          matched_recipe_id,
          matched_recipe_version_id,
          match_basis,
          explanation_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const row of rows) {
      insert.run(
        jobId,
        row.line_index,
        row.raw_line_text,
        row.source_template_ingredient_name ?? null,
        row.source_template_quantity ?? null,
        row.source_template_unit ?? null,
        row.source_template_sort_order ?? null,
        row.quantity_raw,
        row.quantity_normalized,
        row.unit_raw,
        row.unit_normalized,
        row.ingredient_text,
        row.preparation_note,
        row.parse_status,
        row.parser_confidence,
        row.estimated_flag,
        row.estimation_basis,
        JSON.stringify(row.alternative_item_matches),
        JSON.stringify(row.alternative_recipe_matches),
        row.detected_component_type,
        row.matched_recipe_id,
        row.matched_recipe_version_id,
        row.match_basis,
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
          recipe_mapping_status,
          recipe_id,
          recipe_version_id,
          recipe_match_confidence,
          recipe_match_reason,
          quantity_normalization_status,
          review_status,
          explanation_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        row.recipe_mapping_status,
        row.recipe_id,
        row.recipe_version_id,
        row.recipe_match_confidence,
        row.recipe_match_reason,
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
            draft_notes,
            yield_quantity,
            yield_unit,
            serving_quantity,
            serving_unit,
            serving_count,
            completeness_status,
            costability_status,
            ingredient_row_count,
            ready_row_count,
            review_row_count,
            blocked_row_count,
            unresolved_canonical_count,
            unresolved_inventory_count,
            source_recipe_type,
            method_notes,
            review_priority,
            ready_for_review_flag,
            approved_by,
            approved_at,
            rejected_by,
            rejected_at,
            rejection_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        draft.recipe_builder_job_id,
        draft.draft_name,
        draft.draft_notes,
        draft.yield_quantity,
        draft.yield_unit,
        draft.serving_quantity,
        draft.serving_unit,
        draft.serving_count,
        draft.completeness_status,
        draft.costability_status,
        draft.ingredient_row_count,
        draft.ready_row_count,
        draft.review_row_count,
        draft.blocked_row_count,
        draft.unresolved_canonical_count,
        draft.unresolved_inventory_count,
        draft.source_recipe_type,
        draft.method_notes,
        draft.review_priority,
        draft.ready_for_review_flag,
        draft.approved_by,
        draft.approved_at,
        draft.rejected_by,
        draft.rejected_at,
        draft.rejection_reason,
      );
      return { action: 'created', record: this.getDraftRecipeById(Number(result.lastInsertRowid)) };
    }

    this.db.prepare(
      `
        UPDATE recipe_builder_draft_recipes
        SET draft_name = ?,
            draft_notes = ?,
            yield_quantity = ?,
            yield_unit = ?,
            serving_quantity = ?,
            serving_unit = ?,
            serving_count = ?,
            completeness_status = ?,
            costability_status = ?,
            ingredient_row_count = ?,
            ready_row_count = ?,
            review_row_count = ?,
            blocked_row_count = ?,
            unresolved_canonical_count = ?,
            unresolved_inventory_count = ?,
            source_recipe_type = ?,
            method_notes = ?,
            review_priority = ?,
            ready_for_review_flag = ?,
            approved_by = ?,
            approved_at = ?,
            rejected_by = ?,
            rejected_at = ?,
            rejection_reason = ?,
            updated_at = datetime('now')
        WHERE recipe_builder_job_id = ?
      `,
    ).run(
      draft.draft_name,
      draft.draft_notes,
      draft.yield_quantity,
      draft.yield_unit,
      draft.serving_quantity,
      draft.serving_unit,
      draft.serving_count,
      draft.completeness_status,
      draft.costability_status,
      draft.ingredient_row_count,
      draft.ready_row_count,
      draft.review_row_count,
      draft.blocked_row_count,
      draft.unresolved_canonical_count,
      draft.unresolved_inventory_count,
      draft.source_recipe_type,
      draft.method_notes,
      draft.review_priority,
      draft.ready_for_review_flag,
      draft.approved_by,
      draft.approved_at,
      draft.rejected_by,
      draft.rejected_at,
      draft.rejection_reason,
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
  origin: RecipeBuilderJob['origin'];
  confidence_level: RecipeBuilderJob['confidence_level'];
  confidence_score: number;
  confidence_details_json: string;
  source_images_json: string;
  parsing_issues_json: string;
  assumptions_json: string;
  follow_up_questions_json: string;
  source_context_json: string;
  capture_session_id: number | null;
  last_confidence_recalculated_at: string | null;
  inference_variance_pct: number | null;
  created_at: string;
  updated_at: string;
}

interface ParsedRow {
  id: number;
  recipe_builder_job_id: number;
  line_index: number;
  raw_line_text: string;
  source_template_ingredient_name: string | null;
  source_template_quantity: number | null;
  source_template_unit: string | null;
  source_template_sort_order: number | null;
  quantity_raw: string | null;
  quantity_normalized: number | null;
  unit_raw: string | null;
  unit_normalized: string | null;
  ingredient_text: string | null;
  preparation_note: string | null;
  parse_status: RecipeBuilderParsedRow['parse_status'];
  parser_confidence: RecipeBuilderParsedRow['parser_confidence'];
  estimated_flag: number;
  estimation_basis: string | null;
  alternative_item_matches_json: string;
  alternative_recipe_matches_json: string;
  detected_component_type: RecipeBuilderParsedRow['detected_component_type'];
  matched_recipe_id: number | null;
  matched_recipe_version_id: number | null;
  match_basis: NonNullable<RecipeBuilderParsedRow['match_basis']> | null;
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
  recipe_mapping_status: RecipeBuilderResolutionRow['recipe_mapping_status'];
  recipe_id: number | null;
  recipe_version_id: number | null;
  recipe_match_confidence: RecipeBuilderResolutionRow['recipe_match_confidence'];
  recipe_match_reason: string | null;
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
  draft_notes: string | null;
  yield_quantity: number | null;
  yield_unit: string | null;
  serving_quantity: number | null;
  serving_unit: string | null;
  serving_count: number | null;
  completeness_status: RecipeBuilderDraftRecipe['completeness_status'];
  costability_status: RecipeBuilderDraftRecipe['costability_status'];
  ingredient_row_count: number;
  ready_row_count: number;
  review_row_count: number;
  blocked_row_count: number;
  unresolved_canonical_count: number;
  unresolved_inventory_count: number;
  source_recipe_type: RecipeBuilderDraftRecipe['source_recipe_type'];
  method_notes: string | null;
  review_priority: RecipeBuilderDraftRecipe['review_priority'];
  ready_for_review_flag: number;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
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
    id: row.id,
    source_type: row.source_type,
    source_text: row.source_text,
    source_template_id: row.source_template_id,
    source_template_version_id: row.source_template_version_id,
    draft_name: row.draft_name,
    status: row.status,
    source_hash: row.source_hash,
    origin: row.origin,
    confidence_level: row.confidence_level,
    confidence_score: row.confidence_score,
    confidence_details: parseJsonArray(row.confidence_details_json),
    source_images: parseJsonArray(row.source_images_json),
    parsing_issues: parseJsonArray(row.parsing_issues_json),
    assumptions: parseJsonArray(row.assumptions_json),
    follow_up_questions: parseJsonArray(row.follow_up_questions_json),
    source_context: parseJsonObject(row.source_context_json),
    raw_source: row.source_text,
    capture_session_id: row.capture_session_id,
    last_confidence_recalculated_at: row.last_confidence_recalculated_at,
    inference_variance_pct: row.inference_variance_pct,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapParsedRow(row: ParsedRow): RecipeBuilderParsedRow {
  return {
    id: row.id,
    recipe_builder_job_id: row.recipe_builder_job_id,
    line_index: row.line_index,
    raw_line_text: row.raw_line_text,
    source_template_ingredient_name: row.source_template_ingredient_name,
    source_template_quantity: row.source_template_quantity,
    source_template_unit: row.source_template_unit,
    source_template_sort_order: row.source_template_sort_order,
    quantity_raw: row.quantity_raw,
    quantity_normalized: row.quantity_normalized,
    unit_raw: row.unit_raw,
    unit_normalized: row.unit_normalized,
    ingredient_text: row.ingredient_text,
    preparation_note: row.preparation_note,
    parse_status: row.parse_status,
    parser_confidence: row.parser_confidence,
    estimated_flag: row.estimated_flag,
    estimation_basis: row.estimation_basis,
    alternative_item_matches: parseAlternativeMatches(row.alternative_item_matches_json),
    alternative_recipe_matches: parseAlternativeMatches(row.alternative_recipe_matches_json),
    detected_component_type: row.detected_component_type,
    matched_recipe_id: row.matched_recipe_id,
    matched_recipe_version_id: row.matched_recipe_version_id,
    match_basis: row.match_basis,
    explanation_text: row.explanation_text,
    created_at: row.created_at,
    updated_at: row.updated_at,
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

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseAlternativeMatches(value: string): RecipeBuilderParsedRow['alternative_item_matches'] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
