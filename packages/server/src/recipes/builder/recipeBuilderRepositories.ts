import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import type {
  CreatePrepSheetCaptureInput,
  CreateRecipeCaptureSessionInput,
  ItemAlias,
  PrepSheetCapture,
  RecipeBuilderAlternativeMatch,
  RecipeAlias,
  RecipeOrigin,
  RecalculateRecipeDraftConfidenceInput,
  RecipeBuilderSourceIntelligence,
  RecipeCaptureInput,
  RecipeCaptureSession,
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

  async createCaptureSession(input: CreateRecipeCaptureSessionInput): Promise<RecipeCaptureSession> {
    const result = this.db.prepare(
      `
        INSERT INTO recipe_capture_sessions (
          venue_id,
          name,
          capture_mode,
          led_by,
          notes
        ) VALUES (?, ?, ?, ?, ?)
      `,
    ).run(
      input.venue_id ?? null,
      input.name ?? null,
      input.capture_mode,
      input.led_by ?? null,
      input.notes ?? null,
    );

    return this.getCaptureSessionById(Number(result.lastInsertRowid));
  }

  async listCaptureSessions(filters?: {
    venue_id?: number | null;
    status?: 'open' | 'completed';
  }): Promise<RecipeCaptureSession[]> {
    const clauses: string[] = [];
    const params: Array<number | string> = [];

    if (filters?.venue_id != null) {
      clauses.push('venue_id = ?');
      params.push(filters.venue_id);
    }
    if (filters?.status === 'open') {
      clauses.push('completed_at IS NULL');
    } else if (filters?.status === 'completed') {
      clauses.push('completed_at IS NOT NULL');
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(
      `
        SELECT *
        FROM recipe_capture_sessions
        ${where}
        ORDER BY started_at DESC, id DESC
      `,
    ).all(...params) as CaptureSessionRow[];

    return rows.map(mapCaptureSessionRow);
  }

  async getCaptureSession(sessionId: number | string): Promise<RecipeCaptureSession | null> {
    const row = this.db.prepare(
      'SELECT * FROM recipe_capture_sessions WHERE id = ? LIMIT 1',
    ).get(sessionId) as CaptureSessionRow | undefined;
    return row ? mapCaptureSessionRow(row) : null;
  }

  async deleteCaptureSession(sessionId: number | string): Promise<boolean> {
    const result = this.db.prepare(
      'DELETE FROM recipe_capture_sessions WHERE id = ?',
    ).run(sessionId);
    return result.changes > 0;
  }

  async listCaptureInputs(sessionId: number | string): Promise<RecipeCaptureInput[]> {
    const rows = this.db.prepare(
      `
        SELECT *
        FROM recipe_capture_inputs
        WHERE recipe_capture_session_id = ?
        ORDER BY created_at ASC, id ASC
      `,
    ).all(sessionId) as CaptureInputRow[];

    return rows.map(mapCaptureInputRow);
  }

  async getCaptureInput(inputId: number | string): Promise<RecipeCaptureInput | null> {
    const row = this.db.prepare(
      'SELECT * FROM recipe_capture_inputs WHERE id = ? LIMIT 1',
    ).get(inputId) as CaptureInputRow | undefined;
    return row ? mapCaptureInputRow(row) : null;
  }

  async deleteCaptureInput(inputId: number | string): Promise<boolean> {
    const result = this.db.prepare(
      'DELETE FROM recipe_capture_inputs WHERE id = ?',
    ).run(inputId);
    return result.changes > 0;
  }

  async listDraftRecipesByCaptureSession(sessionId: number | string): Promise<RecipeBuilderDraftRecipe[]> {
    const rows = this.db.prepare(
      `
        SELECT d.*
        FROM recipe_builder_draft_recipes d
        INNER JOIN recipe_builder_jobs j ON j.id = d.recipe_builder_job_id
        WHERE j.capture_session_id = ?
        ORDER BY d.updated_at DESC, d.id DESC
      `,
    ).all(sessionId) as DraftRow[];

    return rows.map(mapDraftRow);
  }

  async createCaptureInput(input: {
    recipe_capture_session_id: number | string;
    input_type: RecipeCaptureInput['input_type'];
    source_text?: string | null;
    source_file_name?: string | null;
    source_mime_type?: string | null;
    source_storage_path?: string | null;
    parse_status?: RecipeCaptureInput['parse_status'];
    recipe_builder_job_id?: number | string | null;
    processing_notes?: string | null;
  }): Promise<RecipeCaptureInput> {
    const result = this.db.prepare(
      `
        INSERT INTO recipe_capture_inputs (
          recipe_capture_session_id,
          input_type,
          source_text,
          source_file_name,
          source_mime_type,
          source_storage_path,
          parse_status,
          recipe_builder_job_id,
          processing_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.recipe_capture_session_id,
      input.input_type,
      input.source_text ?? null,
      input.source_file_name ?? null,
      input.source_mime_type ?? null,
      input.source_storage_path ?? null,
      input.parse_status ?? 'PROCESSED',
      input.recipe_builder_job_id ?? null,
      input.processing_notes ?? null,
    );

    const row = this.db.prepare(
      'SELECT * FROM recipe_capture_inputs WHERE id = ? LIMIT 1',
    ).get(Number(result.lastInsertRowid)) as CaptureInputRow;

    return mapCaptureInputRow(row);
  }

  async createPrepSheetCapture(input: CreatePrepSheetCaptureInput): Promise<PrepSheetCapture> {
    const result = this.db.prepare(
      `
        INSERT INTO prep_sheet_captures (
          venue_id,
          capture_date,
          source_file_name,
          source_mime_type,
          source_storage_path,
          extracted_text,
          parsed_items_json,
          inferred_relationships_json,
          processed,
          processing_notes,
          recipe_capture_session_id,
          created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.venue_id,
      input.capture_date,
      input.source_file_name,
      input.source_mime_type,
      input.source_storage_path ?? null,
      input.extracted_text ?? null,
      input.parsed_items_json ?? '[]',
      input.inferred_relationships_json ?? '[]',
      1,
      input.processing_notes ?? null,
      input.recipe_capture_session_id ?? null,
      input.created_by ?? null,
    );

    const row = this.db.prepare(
      'SELECT * FROM prep_sheet_captures WHERE id = ? LIMIT 1',
    ).get(Number(result.lastInsertRowid)) as PrepSheetCaptureRow;

    return mapPrepSheetCaptureRow(row);
  }

  async listPrepSheetCaptures(sessionId: number | string): Promise<PrepSheetCapture[]> {
    const rows = this.db.prepare(
      `
        SELECT *
        FROM prep_sheet_captures
        WHERE recipe_capture_session_id = ?
        ORDER BY created_at DESC, id DESC
      `,
    ).all(sessionId) as PrepSheetCaptureRow[];

    return rows.map(mapPrepSheetCaptureRow);
  }

  async listPrepSheetCapturesByVenue(venueId: number | string, limit = 40): Promise<PrepSheetCapture[]> {
    const rows = this.db.prepare(
      `
        SELECT *
        FROM prep_sheet_captures
        WHERE venue_id = ?
        ORDER BY capture_date DESC, created_at DESC, id DESC
        LIMIT ?
      `,
    ).all(venueId, limit) as PrepSheetCaptureRow[];

    return rows.map(mapPrepSheetCaptureRow);
  }

  async getPrepSheetCapture(captureId: number | string): Promise<PrepSheetCapture | null> {
    const row = this.db.prepare(
      'SELECT * FROM prep_sheet_captures WHERE id = ? LIMIT 1',
    ).get(captureId) as PrepSheetCaptureRow | undefined;
    return row ? mapPrepSheetCaptureRow(row) : null;
  }

  async deletePrepSheetCapture(captureId: number | string): Promise<boolean> {
    const result = this.db.prepare(
      'DELETE FROM prep_sheet_captures WHERE id = ?',
    ).run(captureId);
    return result.changes > 0;
  }

  async listItemAliases(itemId: number | string): Promise<ItemAlias[]> {
    const rows = this.db.prepare(
      `
        SELECT *
        FROM item_aliases
        WHERE item_id = ?
          AND active = 1
        ORDER BY alias COLLATE NOCASE ASC, id ASC
      `,
    ).all(itemId) as ItemAliasRow[];

    return rows.map(mapItemAliasRow);
  }

  async upsertItemAlias(itemId: number | string, input: { alias: string; alias_type: ItemAlias['alias_type'] }): Promise<ItemAlias[]> {
    const alias = input.alias.trim();
    if (!alias) {
      throw new Error('Alias is required');
    }

    this.db.prepare(
      `
        INSERT INTO item_aliases (
          item_id,
          alias,
          normalized_alias,
          alias_type,
          active
        ) VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(item_id, alias) DO UPDATE SET
          normalized_alias = excluded.normalized_alias,
          alias_type = excluded.alias_type,
          active = 1,
          updated_at = datetime('now')
      `,
    ).run(itemId, alias, normalizeIngredientLookup(alias), input.alias_type);

    return this.listItemAliases(itemId);
  }

  async removeItemAlias(itemId: number | string, aliasId: number | string): Promise<ItemAlias[]> {
    this.db.prepare(
      `
        UPDATE item_aliases
        SET active = 0,
            updated_at = datetime('now')
        WHERE id = ?
          AND item_id = ?
      `,
    ).run(aliasId, itemId);

    return this.listItemAliases(itemId);
  }

  async listRecipeAliases(recipeId: number | string): Promise<RecipeAlias[]> {
    const rows = this.db.prepare(
      `
        SELECT *
        FROM recipe_aliases
        WHERE recipe_id = ?
          AND active = 1
        ORDER BY alias COLLATE NOCASE ASC, id ASC
      `,
    ).all(recipeId) as RecipeAliasRow[];

    return rows.map(mapRecipeAliasRow);
  }

  async upsertRecipeAlias(recipeId: number | string, input: { alias: string; alias_type: RecipeAlias['alias_type'] }): Promise<RecipeAlias[]> {
    const alias = input.alias.trim();
    if (!alias) {
      throw new Error('Alias is required');
    }

    this.db.prepare(
      `
        INSERT INTO recipe_aliases (
          recipe_id,
          alias,
          normalized_alias,
          alias_type,
          active
        ) VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(recipe_id, alias) DO UPDATE SET
          normalized_alias = excluded.normalized_alias,
          alias_type = excluded.alias_type,
          active = 1,
          updated_at = datetime('now')
      `,
    ).run(recipeId, alias, normalizeIngredientLookup(alias), input.alias_type);

    return this.listRecipeAliases(recipeId);
  }

  async removeRecipeAlias(recipeId: number | string, aliasId: number | string): Promise<RecipeAlias[]> {
    this.db.prepare(
      `
        UPDATE recipe_aliases
        SET active = 0,
            updated_at = datetime('now')
        WHERE id = ?
          AND recipe_id = ?
      `,
    ).run(aliasId, recipeId);

    return this.listRecipeAliases(recipeId);
  }

  async findItemMatchCandidates(input: string): Promise<RecipeBuilderAlternativeMatch[]> {
    const normalized = normalizeIngredientLookup(input);
    const rows = this.db.prepare(
      `
        WITH direct_matches AS (
          SELECT
            i.id AS item_id,
            i.name AS item_name,
            'item_name' AS match_basis,
            0.98 AS score
          FROM items i
          WHERE LOWER(TRIM(i.name)) = LOWER(TRIM(?))
        ),
        alias_matches AS (
          SELECT
            i.id AS item_id,
            i.name AS item_name,
            'item_alias' AS match_basis,
            0.95 AS score
          FROM item_aliases ia
          INNER JOIN items i ON i.id = ia.item_id
          WHERE ia.active = 1
            AND ia.normalized_alias = ?
        )
        SELECT *
        FROM (
          SELECT * FROM direct_matches
          UNION ALL
          SELECT * FROM alias_matches
        )
        ORDER BY score DESC, item_name COLLATE NOCASE ASC, item_id ASC
      `,
    ).all(input, normalized) as Array<{
      item_id: number;
      item_name: string;
      match_basis: RecipeBuilderAlternativeMatch['match_basis'];
      score: number;
    }>;

    return dedupeAlternativeMatches(
      rows.map((row) => ({
        id: row.item_id,
        name: row.item_name,
        confidence: row.score >= 0.97 ? 'HIGH' : 'MEDIUM',
        score: row.score,
        match_basis: row.match_basis,
      })),
    );
  }

  async findRecipeMatchCandidates(
    input: string,
  ): Promise<Array<RecipeBuilderAlternativeMatch & { recipe_id: number | string; recipe_version_id: number | string | null }>> {
    const normalized = normalizeIngredientLookup(input);
    const rows = this.db.prepare(
      `
        WITH latest_versions AS (
          SELECT rv.recipe_id, rv.id AS recipe_version_id
          FROM recipe_versions rv
          INNER JOIN (
            SELECT recipe_id, MAX(version_number) AS max_version_number
            FROM recipe_versions
            GROUP BY recipe_id
          ) latest ON latest.recipe_id = rv.recipe_id AND latest.max_version_number = rv.version_number
        ),
        direct_matches AS (
          SELECT
            r.id AS recipe_id,
            r.name AS recipe_name,
            lv.recipe_version_id AS recipe_version_id,
            'recipe_name' AS match_basis,
            0.98 AS score
          FROM recipes r
          LEFT JOIN latest_versions lv ON lv.recipe_id = r.id
          WHERE LOWER(TRIM(r.name)) = LOWER(TRIM(?))
        ),
        alias_matches AS (
          SELECT
            r.id AS recipe_id,
            r.name AS recipe_name,
            lv.recipe_version_id AS recipe_version_id,
            'recipe_alias' AS match_basis,
            0.95 AS score
          FROM recipe_aliases ra
          INNER JOIN recipes r ON r.id = ra.recipe_id
          LEFT JOIN latest_versions lv ON lv.recipe_id = r.id
          WHERE ra.active = 1
            AND ra.normalized_alias = ?
        )
        SELECT *
        FROM (
          SELECT * FROM direct_matches
          UNION ALL
          SELECT * FROM alias_matches
        )
        ORDER BY score DESC, recipe_name COLLATE NOCASE ASC, recipe_id ASC
      `,
    ).all(input, normalized) as Array<{
      recipe_id: number;
      recipe_name: string;
      recipe_version_id: number | null;
      match_basis: RecipeBuilderAlternativeMatch['match_basis'];
      score: number;
    }>;

    const seen = new Set<number>();
    return rows
      .filter((row) => {
        if (seen.has(row.recipe_id)) {
          return false;
        }
        seen.add(row.recipe_id);
        return true;
      })
      .map((row) => ({
        id: row.recipe_id,
        recipe_id: row.recipe_id,
        recipe_version_id: row.recipe_version_id,
        name: row.recipe_name,
        confidence: row.score >= 0.97 ? 'HIGH' : 'MEDIUM',
        score: row.score,
        match_basis: row.match_basis,
      }));
  }

  async updateJobIntelligence(
    jobId: number | string,
    updates: Partial<{
      origin: RecipeOrigin;
      confidence_level: RecipeBuilderJob['confidence_level'];
      confidence_score: number;
      confidence_details: string[];
      source_images: string[];
      parsing_issues: string[];
      assumptions: string[];
      follow_up_questions: string[];
      source_context: Record<string, unknown>;
      capture_session_id: number | string | null;
      inference_variance_pct: number | null;
    }>,
  ): Promise<RecipeBuilderJob> {
    const current = await this.getJob(jobId);
    if (!current) {
      throw new Error(`Recipe builder job ${jobId} was not found`);
    }

    const merged = {
      ...extractSourceIntelligence(current),
      ...updates,
      source_context: {
        ...current.source_context,
        ...(updates.source_context ?? {}),
      },
    };

    this.db.prepare(
      `
        UPDATE recipe_builder_jobs
        SET origin = ?,
            confidence_level = ?,
            confidence_score = ?,
            confidence_details_json = ?,
            source_images_json = ?,
            parsing_issues_json = ?,
            assumptions_json = ?,
            follow_up_questions_json = ?,
            source_context_json = ?,
            capture_session_id = ?,
            inference_variance_pct = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `,
    ).run(
      merged.origin,
      merged.confidence_level,
      merged.confidence_score,
      JSON.stringify(merged.confidence_details),
      JSON.stringify(merged.source_images),
      JSON.stringify(merged.parsing_issues),
      JSON.stringify(merged.assumptions),
      JSON.stringify(merged.follow_up_questions),
      JSON.stringify(merged.source_context),
      merged.capture_session_id,
      merged.inference_variance_pct,
      jobId,
    );

    return this.getJobById(Number(jobId));
  }

  async refreshCaptureSessionStats(sessionId: number | string): Promise<RecipeCaptureSession> {
    const totals = this.db.prepare(
      `
        SELECT
          COUNT(DISTINCT i.id) AS total_inputs,
          COUNT(DISTINCT j.id) AS total_jobs,
          COUNT(DISTINCT d.id) AS total_drafts,
          COUNT(DISTINCT CASE WHEN d.ready_for_review_flag = 1 THEN d.id END) AS total_ready_for_review,
          COUNT(DISTINCT CASE WHEN d.approved_at IS NOT NULL THEN d.id END) AS total_approved
        FROM recipe_capture_sessions s
        LEFT JOIN recipe_capture_inputs i ON i.recipe_capture_session_id = s.id
        LEFT JOIN recipe_builder_jobs j ON j.capture_session_id = s.id
        LEFT JOIN recipe_builder_draft_recipes d ON d.recipe_builder_job_id = j.id
        WHERE s.id = ?
      `,
    ).get(sessionId) as {
      total_inputs: number;
      total_jobs: number;
      total_drafts: number;
      total_ready_for_review: number;
      total_approved: number;
    };

    this.db.prepare(
      `
        UPDATE recipe_capture_sessions
        SET total_inputs = ?,
            total_drafts_created = ?,
            total_auto_matched = ?,
            total_needs_review = ?,
            total_approved = ?,
            estimated_time_saved_minutes = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `,
    ).run(
      totals.total_inputs,
      totals.total_drafts,
      totals.total_jobs,
      totals.total_ready_for_review,
      totals.total_approved,
      totals.total_drafts * 12,
      sessionId,
    );

    return this.getCaptureSessionById(Number(sessionId));
  }

  async getDraftSourceIntelligenceByDraftId(draftId: number | string): Promise<{
    recipe_builder_job_id: number | string;
    source_intelligence: RecipeBuilderSourceIntelligence;
    draft: RecipeBuilderDraftRecipe;
  } | null> {
    const row = this.db.prepare(
      `
        SELECT
          d.recipe_builder_job_id AS recipe_builder_job_id,
          j.*,
          d.id AS draft_id
        FROM recipe_builder_draft_recipes d
        INNER JOIN recipe_builder_jobs j ON j.id = d.recipe_builder_job_id
        WHERE d.id = ?
        LIMIT 1
      `,
    ).get(draftId) as (JobRow & { recipe_builder_job_id: number; draft_id: number }) | undefined;

    if (!row) {
      return null;
    }

    const draft = this.getDraftRecipeById(Number(draftId));

    return {
      recipe_builder_job_id: row.recipe_builder_job_id,
      source_intelligence: mapJobRow(row),
      draft,
    };
  }

  async recalculateDraftConfidence(
    draftId: number | string,
    input: RecalculateRecipeDraftConfidenceInput,
  ): Promise<{
    draft_id: number | string;
    recipe_builder_job_id: number | string;
    confidence_level: RecipeBuilderJob['confidence_level'];
    confidence_score: number;
    factors: Array<{ factor: string; impact: number; detail: string }>;
    source_intelligence: RecipeBuilderSourceIntelligence;
  } | null> {
    const draft = this.db.prepare(
      `
        SELECT *
        FROM recipe_builder_draft_recipes
        WHERE id = ?
        LIMIT 1
      `,
    ).get(draftId) as DraftRow | undefined;

    if (!draft) {
      return null;
    }

    const rows = await this.listResolutionRows(draft.recipe_builder_job_id);
    const parsedRows = await this.listParsedRows(draft.recipe_builder_job_id);
    const readyRows = rows.filter((row) => row.review_status === 'READY').length;
    const blockedRows = rows.filter((row) => row.review_status === 'BLOCKED').length;
    const mappedInventoryRows = rows.filter((row) => row.inventory_mapping_status === 'MAPPED').length;

    const ingredientCount = Math.max(parsedRows.length, draft.ingredient_row_count, 1);
    const completenessPct = readyRows / ingredientCount;
    const inventoryPct = mappedInventoryRows / ingredientCount;

    const factors = [
      {
        factor: 'row_completeness',
        impact: Math.round(completenessPct * 45),
        detail: `${readyRows}/${ingredientCount} rows are review-ready`,
      },
      {
        factor: 'inventory_mapping',
        impact: Math.round(inventoryPct * 30),
        detail: `${mappedInventoryRows}/${ingredientCount} rows are inventory-mapped`,
      },
      {
        factor: 'blocked_rows',
        impact: blockedRows === 0 ? 15 : Math.max(0, 15 - blockedRows * 10),
        detail: blockedRows === 0 ? 'No blocked rows remain' : `${blockedRows} blocked rows remain`,
      },
      {
        factor: 'operator_trigger',
        impact: input.trigger === 'operator_review' ? 10 : 5,
        detail: `Recalculated from ${input.trigger}`,
      },
    ];

    const confidenceScore = Math.max(0, Math.min(100, factors.reduce((sum, factor) => sum + factor.impact, 0)));
    const confidenceLevel: RecipeBuilderJob['confidence_level'] =
      confidenceScore >= 90 ? 'verified'
      : confidenceScore >= 75 ? 'reviewed'
      : confidenceScore >= 50 ? 'estimated'
      : 'draft';

    this.db.prepare(
      `
        UPDATE recipe_builder_jobs
        SET confidence_level = ?,
            confidence_score = ?,
            confidence_details_json = ?,
            last_confidence_recalculated_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `,
    ).run(
      confidenceLevel,
      confidenceScore,
      JSON.stringify(factors.map((factor) => factor.detail)),
      draft.recipe_builder_job_id,
    );

    const job = await this.getJob(draft.recipe_builder_job_id);
    if (!job) {
      return null;
    }

    return {
      draft_id: draft.id,
      recipe_builder_job_id: draft.recipe_builder_job_id,
      confidence_level: confidenceLevel,
      confidence_score: confidenceScore,
      factors,
      source_intelligence: extractSourceIntelligence(job),
    };
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

  private getCaptureSessionById(id: number): RecipeCaptureSession {
    const row = this.db.prepare('SELECT * FROM recipe_capture_sessions WHERE id = ? LIMIT 1').get(id) as CaptureSessionRow;
    return mapCaptureSessionRow(row);
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

interface CaptureSessionRow {
  id: number;
  venue_id: number | null;
  name: string | null;
  capture_mode: RecipeCaptureSession['capture_mode'];
  started_at: string;
  completed_at: string | null;
  led_by: string | null;
  notes: string | null;
  total_inputs: number;
  total_drafts_created: number;
  total_auto_matched: number;
  total_needs_review: number;
  total_approved: number;
  estimated_time_saved_minutes: number;
  discovered_sub_recipes_json: string;
  new_items_needed_json: string;
  created_at: string;
  updated_at: string;
}

interface CaptureInputRow {
  id: number;
  recipe_capture_session_id: number;
  input_type: RecipeCaptureInput['input_type'];
  source_text: string | null;
  source_file_name: string | null;
  source_mime_type: string | null;
  source_storage_path: string | null;
  parse_status: RecipeCaptureInput['parse_status'];
  recipe_builder_job_id: number | null;
  processing_notes: string | null;
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

interface PrepSheetCaptureRow {
  id: number;
  venue_id: number;
  capture_date: string;
  source_file_name: string;
  source_mime_type: string;
  source_storage_path: string | null;
  extracted_text: string | null;
  parsed_items_json: string;
  inferred_relationships_json: string;
  processed: number;
  processing_notes: string | null;
  recipe_capture_session_id: number | null;
  created_by: string | null;
  created_at: string;
}

interface ItemAliasRow {
  id: number;
  item_id: number;
  alias: string;
  normalized_alias: string;
  alias_type: ItemAlias['alias_type'];
  active: number;
  created_at: string;
  updated_at: string;
}

interface RecipeAliasRow {
  id: number;
  recipe_id: number;
  alias: string;
  normalized_alias: string;
  alias_type: RecipeAlias['alias_type'];
  active: number;
  created_at: string;
  updated_at: string;
}

function mapJobRow(row: JobRow): RecipeBuilderJob {
  const sourceContext = parseJsonObject(row.source_context_json);
  const rawSource = typeof sourceContext.raw_source === 'string' && sourceContext.raw_source.trim().length > 0
    ? sourceContext.raw_source
    : row.source_text;
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
    source_context: sourceContext,
    raw_source: rawSource,
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

function mapCaptureSessionRow(row: CaptureSessionRow): RecipeCaptureSession {
  return {
    ...row,
  };
}

function mapCaptureInputRow(row: CaptureInputRow): RecipeCaptureInput {
  return {
    ...row,
  };
}

function mapPrepSheetCaptureRow(row: PrepSheetCaptureRow): PrepSheetCapture {
  return {
    ...row,
  };
}

function mapItemAliasRow(row: ItemAliasRow): ItemAlias {
  return {
    ...row,
  };
}

function mapRecipeAliasRow(row: RecipeAliasRow): RecipeAlias {
  return {
    ...row,
  };
}

function dedupeAlternativeMatches(matches: RecipeBuilderAlternativeMatch[]): RecipeBuilderAlternativeMatch[] {
  const seen = new Set<string>();
  const deduped: RecipeBuilderAlternativeMatch[] = [];
  for (const match of matches) {
    const key = String(match.id);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(match);
  }
  return deduped;
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

function extractSourceIntelligence(job: RecipeBuilderJob): RecipeBuilderSourceIntelligence {
  return {
    origin: job.origin,
    confidence_level: job.confidence_level,
    confidence_score: job.confidence_score,
    confidence_details: job.confidence_details,
    source_images: job.source_images,
    parsing_issues: job.parsing_issues,
    assumptions: job.assumptions,
    follow_up_questions: job.follow_up_questions,
    source_context: job.source_context,
    raw_source: job.raw_source,
    capture_session_id: job.capture_session_id,
    last_confidence_recalculated_at: job.last_confidence_recalculated_at,
    inference_variance_pct: job.inference_variance_pct,
  };
}
