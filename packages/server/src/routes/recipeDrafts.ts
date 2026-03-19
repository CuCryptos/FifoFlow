import { Router } from 'express';
import type Database from 'better-sqlite3';
import {
  upsertRecipeDraftSchema,
  type RecipeBuilderDraftRecipe,
  type RecipeBuilderJob,
  type RecipeBuilderParsedRow,
  type RecipeBuilderResolutionRow,
  type UpsertRecipeDraftInput,
} from '@fifoflow/shared';
import { SQLiteRecipeBuilderRepository } from '../recipes/builder/index.js';
import type { RecipeBuilderRequest } from '../recipes/builder/types.js';
import { SQLiteRecipePromotionRepository, executeRecipePromotion } from '../recipes/promotion/index.js';

interface RecipeDraftSummaryRow extends RecipeBuilderDraftRecipe {
  source_type: RecipeBuilderJob['source_type'];
  source_template_id: number | null;
  source_template_version_id: number | null;
  job_status: RecipeBuilderJob['status'];
  promotion_recipe_id: number | null;
  promotion_recipe_version_id: number | null;
}

interface DraftRowPayload {
  parsed_row_id: number | string;
  resolution_row_id: number | string | null;
  line_index: number;
  raw_ingredient_text: string;
  quantity: number | null;
  unit: string | null;
  item_id: number | null;
  item_name: string | null;
  template_ingredient_name: string | null;
  template_quantity: number | null;
  template_unit: string | null;
  template_sort_order: number | null;
  canonical_ingredient_id: number | string | null;
  canonical_ingredient_name: string | null;
  canonical_match_status: RecipeBuilderResolutionRow['canonical_match_status'] | null;
  inventory_mapping_status: RecipeBuilderResolutionRow['inventory_mapping_status'] | null;
  review_status: RecipeBuilderResolutionRow['review_status'] | null;
  mapping_explanation: string | null;
}

function buildRawLineText(input: {
  quantity: number | null;
  unit: string | null;
  templateIngredientName: string | null;
  itemName: string | null;
}): string {
  const parts = [
    input.quantity != null ? trimNumber(input.quantity) : null,
    input.unit,
    input.templateIngredientName ?? input.itemName,
  ].filter((value): value is string => Boolean(value && value.trim()));

  return parts.join(' ').trim() || input.itemName || input.templateIngredientName || 'Draft ingredient row';
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(4)).toString();
}

function deriveDraftHasServingMath(input: UpsertRecipeDraftInput): boolean {
  if (input.source_recipe_type !== 'dish') {
    return true;
  }
  return input.serving_quantity != null && input.serving_unit != null && input.serving_count != null;
}

function deriveDraftCompleteness(input: {
  hasYield: boolean;
  hasServingMath: boolean;
  rows: Array<{ canonicalResolved: boolean; inventoryResolved: boolean; quantityResolved: boolean }>;
}): RecipeBuilderDraftRecipe['completeness_status'] {
  if (input.rows.length === 0 || !input.hasYield || !input.hasServingMath) {
    return 'INCOMPLETE';
  }
  const hasBlocked = input.rows.some((row) => !row.quantityResolved);
  if (hasBlocked) {
    return 'BLOCKED';
  }
  const needsReview = input.rows.some((row) => !row.canonicalResolved || !row.inventoryResolved);
  if (needsReview) {
    return 'NEEDS_REVIEW';
  }
  return 'READY';
}

function deriveDraftCostability(input: {
  completenessStatus: RecipeBuilderDraftRecipe['completeness_status'];
  unresolvedCanonicalCount: number;
  unresolvedInventoryCount: number;
}): RecipeBuilderDraftRecipe['costability_status'] {
  if (input.completenessStatus === 'READY' && input.unresolvedCanonicalCount === 0 && input.unresolvedInventoryCount === 0) {
    return 'COSTABLE';
  }
  if (input.completenessStatus === 'BLOCKED') {
    return 'NOT_COSTABLE';
  }
  return 'NEEDS_REVIEW';
}

function mapJobFinalStatus(status: RecipeBuilderDraftRecipe['completeness_status']): RecipeBuilderJob['status'] {
  if (status === 'BLOCKED') {
    return 'BLOCKED';
  }
  if (status === 'READY') {
    return 'ASSEMBLED';
  }
  return 'NEEDS_REVIEW';
}

async function resolveCanonicalFromInventoryItem(db: Database.Database, itemId: number): Promise<{
  canonical_ingredient_id: number | null;
  canonical_name: string | null;
}> {
  const row = db.prepare(
    `
      SELECT
        m.canonical_ingredient_id,
        c.canonical_name
      FROM canonical_inventory_mappings m
      INNER JOIN canonical_ingredients c ON c.id = m.canonical_ingredient_id
      WHERE m.inventory_item_id = ?
        AND m.active = 1
        AND m.preferred_flag = 1
        AND m.mapping_status IN ('AUTO_MAPPED', 'MANUALLY_MAPPED')
      ORDER BY CASE m.scope_type
        WHEN 'operation_unit' THEN 1
        WHEN 'location' THEN 2
        WHEN 'organization' THEN 3
        ELSE 4
      END,
      CASE m.mapping_status
        WHEN 'MANUALLY_MAPPED' THEN 1
        WHEN 'AUTO_MAPPED' THEN 2
        ELSE 3
      END,
      m.id ASC
      LIMIT 1
    `,
  ).get(itemId) as { canonical_ingredient_id: number; canonical_name: string } | undefined;

  return {
    canonical_ingredient_id: row?.canonical_ingredient_id ?? null,
    canonical_name: row?.canonical_name ?? null,
  };
}

function sanitizeIngredientRows(input: UpsertRecipeDraftInput): UpsertRecipeDraftInput['ingredients'] {
  return input.ingredients.filter((ingredient) => {
    const hasItem = ingredient.item_id != null;
    const hasQuantity = ingredient.quantity != null;
    const hasUnit = ingredient.unit != null;
    const hasTemplateIdentity = Boolean(ingredient.template_ingredient_name);
    return hasItem || hasQuantity || hasUnit || hasTemplateIdentity;
  });
}

async function persistDraft(
  db: Database.Database,
  builderRepository: SQLiteRecipeBuilderRepository,
  input: UpsertRecipeDraftInput,
  existing: { draftId: number; jobId: number } | null,
) {
  const sanitizedIngredients = sanitizeIngredientRows(input);
  const freeformSourceText = sanitizedIngredients.map((ingredient) => buildRawLineText({
    quantity: ingredient.quantity ?? null,
    unit: ingredient.unit ?? null,
    templateIngredientName: ingredient.template_ingredient_name ?? null,
    itemName: null,
  })).join('\n');
  const createJobRequest: RecipeBuilderRequest = input.creation_mode === 'template'
    ? {
        source_type: 'template',
        draft_name: input.draft_name,
        draft_notes: input.draft_notes ?? null,
        source_template_id: input.source_template_id!,
        source_template_version_id: input.source_template_version_id ?? null,
        yield_quantity: input.yield_quantity ?? null,
        yield_unit: input.yield_unit ?? null,
        serving_quantity: input.serving_quantity ?? null,
        serving_unit: input.serving_unit ?? null,
        serving_count: input.serving_count ?? null,
        source_recipe_type: input.source_recipe_type,
      }
    : {
        source_type: 'freeform',
        draft_name: input.draft_name,
        draft_notes: input.draft_notes ?? null,
        source_text: freeformSourceText,
        yield_quantity: input.yield_quantity ?? null,
        yield_unit: input.yield_unit ?? null,
        serving_quantity: input.serving_quantity ?? null,
        serving_unit: input.serving_unit ?? null,
        serving_count: input.serving_count ?? null,
        source_recipe_type: input.source_recipe_type,
      };

  const job = existing
    ? await builderRepository.getJob(existing.jobId)
    : await builderRepository.createJob(createJobRequest);

  if (!job) {
    throw new Error('Draft job could not be loaded.');
  }

  db.prepare(
    `
      UPDATE recipe_builder_jobs
      SET source_type = ?,
          source_text = ?,
          source_template_id = ?,
          source_template_version_id = ?,
          draft_name = ?,
          source_hash = ?,
          status = 'PENDING',
          updated_at = datetime('now')
      WHERE id = ?
    `,
  ).run(
    input.creation_mode === 'template' ? 'template' : 'freeform',
    input.creation_mode === 'blank' ? freeformSourceText : null,
    input.creation_mode === 'template' ? input.source_template_id ?? null : null,
    input.creation_mode === 'template' ? input.source_template_version_id ?? null : null,
    input.draft_name,
    JSON.stringify({
      mode: input.creation_mode,
      name: input.draft_name,
      template_id: input.source_template_id ?? null,
      template_version_id: input.source_template_version_id ?? null,
      ingredient_count: sanitizedIngredients.length,
    }),
    job.id,
  );

  const itemIds = Array.from(new Set(sanitizedIngredients.flatMap((ingredient) => ingredient.item_id != null ? [ingredient.item_id] : [])));
  const itemsById = new Map(
    (itemIds.length > 0
      ? db.prepare('SELECT id, name FROM items WHERE id IN (' + itemIds.map(() => '?').join(', ') + ')').all(...itemIds)
      : []
    ).map((row: any) => [Number(row.id), String(row.name)]),
  );

  const parsedRowsInput: Array<Omit<RecipeBuilderParsedRow, 'id' | 'recipe_builder_job_id' | 'created_at' | 'updated_at'>> = [];
  const resolutionRowsInput: Array<{
    canonical_ingredient_id: number | null;
    canonical_match_status: RecipeBuilderResolutionRow['canonical_match_status'];
    canonical_confidence: RecipeBuilderResolutionRow['canonical_confidence'];
    canonical_match_reason: string | null;
    inventory_item_id: number | null;
    inventory_mapping_status: RecipeBuilderResolutionRow['inventory_mapping_status'];
    quantity_normalization_status: RecipeBuilderResolutionRow['quantity_normalization_status'];
    review_status: RecipeBuilderResolutionRow['review_status'];
    explanation_text: string;
  }> = [];

  for (const [index, ingredient] of sanitizedIngredients.entries()) {
    const itemName = ingredient.item_id != null ? itemsById.get(Number(ingredient.item_id)) ?? null : null;
    const canonicalFromInventory = ingredient.item_id != null
      ? await resolveCanonicalFromInventoryItem(db, Number(ingredient.item_id))
      : { canonical_ingredient_id: null, canonical_name: null };
    const canonicalIngredientId = ingredient.template_canonical_ingredient_id ?? canonicalFromInventory.canonical_ingredient_id ?? null;
    const canonicalMatchStatus: RecipeBuilderResolutionRow['canonical_match_status'] = canonicalIngredientId != null ? 'matched' : 'no_match';
    const inventoryResolved = ingredient.item_id != null;
    const quantityResolved = ingredient.quantity != null && ingredient.unit != null;
    const reviewStatus: RecipeBuilderResolutionRow['review_status'] = !quantityResolved
      ? 'BLOCKED'
      : canonicalIngredientId != null && inventoryResolved
        ? 'READY'
        : 'NEEDS_REVIEW';

    parsedRowsInput.push({
      line_index: index + 1,
      raw_line_text: buildRawLineText({
        quantity: ingredient.quantity ?? null,
        unit: ingredient.unit ?? null,
        templateIngredientName: ingredient.template_ingredient_name ?? null,
        itemName,
      }),
      source_template_ingredient_name: ingredient.template_ingredient_name ?? null,
      source_template_quantity: ingredient.template_quantity ?? null,
      source_template_unit: ingredient.template_unit ?? null,
      source_template_sort_order: ingredient.template_sort_order ?? null,
      quantity_raw: ingredient.quantity != null ? trimNumber(ingredient.quantity) : null,
      quantity_normalized: ingredient.quantity ?? null,
      unit_raw: ingredient.unit ?? null,
      unit_normalized: ingredient.unit ?? null,
      ingredient_text: ingredient.template_ingredient_name ?? itemName,
      preparation_note: null,
      parse_status: quantityResolved ? 'PARSED' : 'NEEDS_REVIEW',
      parser_confidence: quantityResolved ? 'HIGH' : 'LOW',
      explanation_text: ingredient.template_ingredient_name
        ? 'Draft row persisted from template-backed recipe composition.'
        : 'Draft row persisted from manual recipe composition.',
    });

    resolutionRowsInput.push({
      canonical_ingredient_id: canonicalIngredientId,
      canonical_match_status: canonicalMatchStatus,
      canonical_confidence: canonicalIngredientId != null ? 'HIGH' : 'LOW',
      canonical_match_reason: canonicalIngredientId != null
        ? (ingredient.template_canonical_ingredient_id != null ? 'template_mapping' : 'inventory_mapping')
        : null,
      inventory_item_id: ingredient.item_id ?? null,
      inventory_mapping_status: inventoryResolved ? 'MAPPED' : 'UNMAPPED',
      quantity_normalization_status: quantityResolved ? 'NORMALIZED' : 'FAILED',
      review_status: reviewStatus,
      explanation_text: reviewStatus === 'READY'
        ? 'Draft row is fully mapped and normalized for promotion.'
        : reviewStatus === 'BLOCKED'
          ? 'Draft row is missing quantity or unit data.'
          : 'Draft row still needs canonical identity or inventory mapping review.',
    });
  }

  const persistedParsedRows = await builderRepository.replaceParsedRows(job.id, parsedRowsInput);
  await builderRepository.replaceResolutionRows(
    job.id,
    resolutionRowsInput.map((row, index) => ({
      parsed_row_id: Number(persistedParsedRows[index]!.id),
      ...row,
    })),
  );

  const rowsForStatus = resolutionRowsInput.map((row) => ({
    canonicalResolved: row.canonical_ingredient_id != null,
    inventoryResolved: row.inventory_item_id != null,
    quantityResolved: row.quantity_normalization_status === 'NORMALIZED',
  }));
  const completenessStatus = deriveDraftCompleteness({
    hasYield: input.yield_quantity != null && input.yield_unit != null,
    hasServingMath: deriveDraftHasServingMath(input),
    rows: rowsForStatus,
  });
  const unresolvedCanonicalCount = resolutionRowsInput.filter((row) => row.canonical_ingredient_id == null).length;
  const unresolvedInventoryCount = resolutionRowsInput.filter((row) => row.inventory_item_id == null).length;
  const blockedRowCount = resolutionRowsInput.filter((row) => row.review_status === 'BLOCKED').length;
  const reviewRowCount = resolutionRowsInput.filter((row) => row.review_status === 'NEEDS_REVIEW').length;
  const readyRowCount = resolutionRowsInput.filter((row) => row.review_status === 'READY').length;

  const draft = await builderRepository.upsertDraftRecipe({
    recipe_builder_job_id: job.id,
    draft_name: input.draft_name,
    draft_notes: input.draft_notes ?? null,
    yield_quantity: input.yield_quantity ?? null,
    yield_unit: input.yield_unit ?? null,
    serving_quantity: input.serving_quantity ?? null,
    serving_unit: input.serving_unit ?? null,
    serving_count: input.serving_count ?? null,
    completeness_status: completenessStatus,
    costability_status: deriveDraftCostability({
      completenessStatus,
      unresolvedCanonicalCount,
      unresolvedInventoryCount,
    }),
    ingredient_row_count: sanitizedIngredients.length,
    ready_row_count: readyRowCount,
    review_row_count: reviewRowCount,
    blocked_row_count: blockedRowCount,
    unresolved_canonical_count: unresolvedCanonicalCount,
    unresolved_inventory_count: unresolvedInventoryCount,
    source_recipe_type: input.source_recipe_type,
  });

  await builderRepository.updateJobStatus(job.id, mapJobFinalStatus(draft.record.completeness_status));

  return draft.record;
}

function buildDraftSummary(row: RecipeDraftSummaryRow) {
  return {
    id: row.id,
    recipe_builder_job_id: row.recipe_builder_job_id,
    draft_name: row.draft_name,
    draft_notes: row.draft_notes,
    source_type: row.source_type,
    source_template_id: row.source_template_id,
    source_template_version_id: row.source_template_version_id,
    source_recipe_type: row.source_recipe_type,
    yield_quantity: row.yield_quantity,
    yield_unit: row.yield_unit,
    serving_quantity: row.serving_quantity,
    serving_unit: row.serving_unit,
    serving_count: row.serving_count,
    completeness_status: row.completeness_status,
    costability_status: row.costability_status,
    ingredient_row_count: row.ingredient_row_count,
    ready_row_count: row.ready_row_count,
    review_row_count: row.review_row_count,
    blocked_row_count: row.blocked_row_count,
    unresolved_canonical_count: row.unresolved_canonical_count,
    unresolved_inventory_count: row.unresolved_inventory_count,
    job_status: row.job_status,
    promotion_link: row.promotion_recipe_id != null
      ? { recipe_id: row.promotion_recipe_id, recipe_version_id: row.promotion_recipe_version_id }
      : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function loadDraftSummaryRows(db: Database.Database): RecipeDraftSummaryRow[] {
  return db.prepare(
    `
      SELECT
        d.*, 
        j.source_type,
        j.source_template_id,
        j.source_template_version_id,
        j.status AS job_status,
        l.recipe_id AS promotion_recipe_id,
        l.recipe_version_id AS promotion_recipe_version_id
      FROM recipe_builder_draft_recipes d
      INNER JOIN recipe_builder_jobs j ON j.id = d.recipe_builder_job_id
      LEFT JOIN recipe_builder_promotion_links l
        ON l.recipe_builder_draft_recipe_id = d.id
       AND l.active = 1
      ORDER BY d.updated_at DESC, d.id DESC
    `,
  ).all() as RecipeDraftSummaryRow[];
}

function loadDraftDetail(db: Database.Database, draftId: number) {
  const summary = loadDraftSummaryRows(db).find((row) => row.id === draftId);
  if (!summary) {
    return null;
  }

  const rows = db.prepare(
    `
      SELECT
        p.id AS parsed_row_id,
        r.id AS resolution_row_id,
        p.line_index,
        p.raw_line_text,
        p.source_template_ingredient_name,
        p.source_template_quantity,
        p.source_template_unit,
        p.source_template_sort_order,
        p.quantity_normalized,
        p.unit_normalized,
        r.inventory_item_id,
        i.name AS item_name,
        r.canonical_ingredient_id,
        c.canonical_name,
        r.canonical_match_status,
        r.inventory_mapping_status,
        r.review_status,
        r.explanation_text
      FROM recipe_builder_parsed_rows p
      LEFT JOIN recipe_builder_resolution_rows r ON r.parsed_row_id = p.id
      LEFT JOIN items i ON i.id = r.inventory_item_id
      LEFT JOIN canonical_ingredients c ON c.id = r.canonical_ingredient_id
      WHERE p.recipe_builder_job_id = ?
      ORDER BY p.line_index ASC
    `,
  ).all(summary.recipe_builder_job_id) as Array<{
    parsed_row_id: number;
    resolution_row_id: number | null;
    line_index: number;
    raw_line_text: string;
    source_template_ingredient_name: string | null;
    source_template_quantity: number | null;
    source_template_unit: string | null;
    source_template_sort_order: number | null;
    quantity_normalized: number | null;
    unit_normalized: string | null;
    inventory_item_id: number | null;
    item_name: string | null;
    canonical_ingredient_id: number | null;
    canonical_name: string | null;
    canonical_match_status: RecipeBuilderResolutionRow['canonical_match_status'] | null;
    inventory_mapping_status: RecipeBuilderResolutionRow['inventory_mapping_status'] | null;
    review_status: RecipeBuilderResolutionRow['review_status'] | null;
    explanation_text: string | null;
  }>;

  return {
    ...buildDraftSummary(summary),
    ingredient_rows: rows.map((row): DraftRowPayload => ({
      parsed_row_id: row.parsed_row_id,
      resolution_row_id: row.resolution_row_id,
      line_index: row.line_index,
      raw_ingredient_text: row.raw_line_text,
      quantity: row.quantity_normalized,
      unit: row.unit_normalized,
      item_id: row.inventory_item_id,
      item_name: row.item_name,
      template_ingredient_name: row.source_template_ingredient_name,
      template_quantity: row.source_template_quantity,
      template_unit: row.source_template_unit,
      template_sort_order: row.source_template_sort_order,
      canonical_ingredient_id: row.canonical_ingredient_id,
      canonical_ingredient_name: row.canonical_name,
      canonical_match_status: row.canonical_match_status,
      inventory_mapping_status: row.inventory_mapping_status,
      review_status: row.review_status,
      mapping_explanation: row.explanation_text,
    })),
  };
}

export function createRecipeDraftRoutes(db: Database.Database): Router {
  const router = Router();
  const builderRepository = new SQLiteRecipeBuilderRepository(db);
  const promotionRepository = new SQLiteRecipePromotionRepository(db);

  router.get('/', (_req, res) => {
    res.json({ drafts: loadDraftSummaryRows(db).map(buildDraftSummary) });
  });

  router.get('/:id', (req, res) => {
    const draftId = Number(req.params.id);
    if (!Number.isInteger(draftId) || draftId <= 0) {
      res.status(400).json({ error: 'Draft id must be a positive integer.' });
      return;
    }

    const detail = loadDraftDetail(db, draftId);
    if (!detail) {
      res.status(404).json({ error: 'Recipe draft not found.' });
      return;
    }

    res.json(detail);
  });

  router.post('/', async (req, res) => {
    const parsed = upsertRecipeDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const draft = await persistDraft(db, builderRepository, parsed.data, null);
    const detail = loadDraftDetail(db, Number(draft.id));
    res.status(201).json(detail);
  });

  router.put('/:id', async (req, res) => {
    const draftId = Number(req.params.id);
    if (!Number.isInteger(draftId) || draftId <= 0) {
      res.status(400).json({ error: 'Draft id must be a positive integer.' });
      return;
    }

    const existing = db.prepare(
      'SELECT id, recipe_builder_job_id FROM recipe_builder_draft_recipes WHERE id = ? LIMIT 1',
    ).get(draftId) as { id: number; recipe_builder_job_id: number } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Recipe draft not found.' });
      return;
    }

    const parsed = upsertRecipeDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    await persistDraft(db, builderRepository, parsed.data, { draftId: existing.id, jobId: existing.recipe_builder_job_id });
    res.json(loadDraftDetail(db, draftId));
  });

  router.delete('/:id', (req, res) => {
    const draftId = Number(req.params.id);
    if (!Number.isInteger(draftId) || draftId <= 0) {
      res.status(400).json({ error: 'Draft id must be a positive integer.' });
      return;
    }

    const existing = db.prepare(
      'SELECT id, recipe_builder_job_id FROM recipe_builder_draft_recipes WHERE id = ? LIMIT 1',
    ).get(draftId) as { id: number; recipe_builder_job_id: number } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Recipe draft not found.' });
      return;
    }

    const promotedVersionCount = db.prepare(
      'SELECT COUNT(*) AS count FROM recipe_versions WHERE source_builder_draft_recipe_id = ?',
    ).get(draftId) as { count: number };
    if (promotedVersionCount.count > 0) {
      res.status(409).json({ error: 'Cannot delete a draft that already has promoted recipe history. Create a revision instead.' });
      return;
    }

    db.prepare('DELETE FROM recipe_builder_jobs WHERE id = ?').run(existing.recipe_builder_job_id);
    res.status(204).send();
  });

  router.post('/:id/promote', async (req, res) => {
    const draftId = Number(req.params.id);
    if (!Number.isInteger(draftId) || draftId <= 0) {
      res.status(400).json({ error: 'Draft id must be a positive integer.' });
      return;
    }

    const existing = db.prepare(
      'SELECT id, recipe_builder_job_id FROM recipe_builder_draft_recipes WHERE id = ? LIMIT 1',
    ).get(draftId) as { id: number; recipe_builder_job_id: number } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Recipe draft not found.' });
      return;
    }

    const activeLink = db.prepare(
      'SELECT recipe_id FROM recipe_builder_promotion_links WHERE recipe_builder_draft_recipe_id = ? AND active = 1 LIMIT 1',
    ).get(draftId) as { recipe_id: number } | undefined;

    const result = await executeRecipePromotion({
      recipe_builder_job_id: existing.recipe_builder_job_id,
      promotion_mode: activeLink ? 'create_revision' : 'create_new',
      target_recipe_id: activeLink?.recipe_id ?? null,
      created_by: typeof req.body?.created_by === 'string' ? req.body.created_by : 'Operator UI',
      notes: typeof req.body?.notes === 'string' ? req.body.notes : null,
    }, promotionRepository);

    const detail = loadDraftDetail(db, draftId);
    if (result.evaluation.status !== 'PROMOTED') {
      res.status(409).json({
        error: 'Recipe draft is not promotable yet.',
        evaluation: result.evaluation,
        draft: detail,
      });
      return;
    }

    res.json({
      draft: detail,
      promotion: result,
    });
  });

  return router;
}
