import express from 'express';
import type Database from 'better-sqlite3';
import type { RecipeCostSnapshot } from '@fifoflow/shared';
import type { IntelligenceJobContext } from '../intelligence/types.js';
import { SQLiteOperationalRecipeCostReadRepository } from '../intelligence/recipeCost/recipeCostRepositories.js';
import { resolvePromotedRecipeForCosting } from '../intelligence/recipeCost/recipeCostabilityResolver.js';
import { SQLiteCanonicalInventoryRepository } from '../mapping/inventory/canonicalInventoryMappingRepositories.js';
import { SQLiteInventoryVendorRepository } from '../mapping/vendor/inventoryVendorMappingRepositories.js';

export function createRecipeWorkflowRoutes(db: Database.Database) {
  const router = express.Router();

  router.get('/operational-summary', async (req, res, next) => {
    try {
      const context = buildRecipeWorkflowContext(req.query as Record<string, unknown>);
      const operationalRepository = new SQLiteOperationalRecipeCostReadRepository(db);
      const inventoryRepository = new SQLiteCanonicalInventoryRepository(db);
      const vendorRepository = new SQLiteInventoryVendorRepository(db);
      const recipes = await operationalRepository.listPromotedRecipes(context);

      const summaries = [] as OperationalRecipeSummary[];
      for (const recipe of recipes) {
        const bridged = await resolvePromotedRecipeForCosting(recipe, context, {
          operationalRepository,
          inventoryRepository,
          vendorRepository,
        });
        const latestSnapshot = getLatestWorkflowSnapshot(db, recipe.recipe_id, Number(recipe.recipe_version_id));
        const versionNumber = getRecipeVersionNumber(db, Number(recipe.recipe_version_id));
        summaries.push(buildOperationalRecipeSummary(recipe, bridged, latestSnapshot, versionNumber));
      }

      summaries.sort((left, right) => {
        const classificationRank = classificationSortRank(left.costability_classification) - classificationSortRank(right.costability_classification);
        if (classificationRank !== 0) {
          return classificationRank;
        }
        if (right.unresolved_row_count !== left.unresolved_row_count) {
          return right.unresolved_row_count - left.unresolved_row_count;
        }
        return left.recipe_name.localeCompare(right.recipe_name, undefined, { sensitivity: 'base' });
      });

      res.json({
        generated_at: context.now,
        scope: {
          venue_id: context.scope.locationId ?? null,
          organization_id: context.scope.organizationId ?? null,
          operation_unit_id: context.scope.operationUnitId ?? null,
        },
        counts: {
          total_promoted_recipes: summaries.length,
          costable_now_count: summaries.filter((summary) => summary.costability_classification === 'COSTABLE_NOW').length,
          operational_only_count: summaries.filter((summary) => summary.costability_classification === 'OPERATIONAL_ONLY').length,
          blocked_for_costing_count: summaries.filter((summary) => summary.costability_classification === 'BLOCKED_FOR_COSTING').length,
          with_snapshot_count: summaries.filter((summary) => summary.latest_snapshot !== null).length,
          complete_snapshot_count: summaries.filter((summary) => summary.latest_snapshot?.completeness_status === 'complete').length,
        },
        summaries,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/operational-summary/:recipeVersionId', async (req, res, next) => {
    try {
      const recipeVersionId = positiveNumber(req.params.recipeVersionId);
      if (recipeVersionId == null) {
        res.status(400).json({ error: 'Recipe version id must be a positive number.' });
        return;
      }

      const context = buildRecipeWorkflowContext(req.query as Record<string, unknown>);
      const operationalRepository = new SQLiteOperationalRecipeCostReadRepository(db);
      const inventoryRepository = new SQLiteCanonicalInventoryRepository(db);
      const vendorRepository = new SQLiteInventoryVendorRepository(db);
      const recipes = await operationalRepository.listPromotedRecipes({
        ...context,
        scope: {
          ...context.scope,
          recipeId: getRecipeIdForVersion(db, recipeVersionId) ?? undefined,
        },
      });
      const recipe = recipes.find((candidate) => Number(candidate.recipe_version_id) === recipeVersionId);

      if (!recipe) {
        res.status(404).json({ error: `Promoted recipe version ${recipeVersionId} was not found.` });
        return;
      }

      const bridged = await resolvePromotedRecipeForCosting(recipe, context, {
        operationalRepository,
        inventoryRepository,
        vendorRepository,
      });
      const latestSnapshot = getLatestWorkflowSnapshot(db, recipe.recipe_id, recipeVersionId);
      const versionNumber = getRecipeVersionNumber(db, recipeVersionId);
      const summary = buildOperationalRecipeSummary(recipe, bridged, latestSnapshot, versionNumber);

      res.json({
        generated_at: context.now,
        summary,
        ingredient_rows: bridged.source_rows.map((row) => ({
          recipe_item_id: row.recipe_item_id,
          line_index: row.line_index,
          raw_ingredient_text: row.raw_ingredient_text,
          canonical_ingredient_id: row.canonical_ingredient_id,
          canonical_ingredient_name: row.canonical_ingredient_name,
          inventory_item_id: row.inventory_item_id,
          inventory_item_name: row.inventory_item_name,
          quantity: row.quantity,
          unit: row.unit,
          base_unit: row.base_unit,
          preparation_note: row.preparation_note,
          costability_status: row.costability_status,
          resolution_explanation: row.resolution_explanation,
          inventory_mapping_resolution: row.inventory_mapping_resolution,
          vendor_mapping_resolution: row.vendor_mapping_resolution,
          vendor_cost_lineage: row.vendor_cost_lineage,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

interface WorkflowSnapshotSummary {
  id: number;
  snapshot_at: string;
  total_cost: number;
  cost_per_serving: number | null;
  completeness_status: RecipeCostSnapshot['completeness_status'];
  confidence_label: RecipeCostSnapshot['confidence_label'];
  resolved_ingredient_count: number;
  ingredient_count: number;
  missing_cost_count: number;
  stale_cost_count: number;
  ambiguous_cost_count: number;
  unit_mismatch_count: number;
}

interface OperationalRecipeSummary {
  recipe_id: number;
  recipe_name: string;
  recipe_type: string;
  recipe_version_id: number;
  version_number: number;
  yield_qty: number | null;
  yield_unit: string | null;
  serving_count: number | null;
  source_builder_job_id: number | string | null;
  source_builder_draft_recipe_id: number | string | null;
  source_template_id: number | string | null;
  source_template_version_id: number | string | null;
  ingredient_row_count: number;
  resolved_row_count: number;
  unresolved_row_count: number;
  inventory_linked_row_count: number;
  vendor_linked_row_count: number;
  missing_canonical_count: number;
  missing_inventory_mapping_count: number;
  missing_vendor_mapping_count: number;
  missing_vendor_cost_lineage_count: number;
  costable_percent: number;
  costability_classification: 'COSTABLE_NOW' | 'OPERATIONAL_ONLY' | 'BLOCKED_FOR_COSTING';
  blocker_messages: string[];
  latest_snapshot: WorkflowSnapshotSummary | null;
}

function getRecipeIdForVersion(db: Database.Database, recipeVersionId: number): number | null {
  const row = db.prepare(
    `
      SELECT recipe_id
      FROM recipe_versions
      WHERE id = ?
      LIMIT 1
    `,
  ).get(recipeVersionId) as { recipe_id: number } | undefined;
  return row?.recipe_id ?? null;
}

function buildOperationalRecipeSummary(
  recipe: Awaited<ReturnType<SQLiteOperationalRecipeCostReadRepository['listPromotedRecipes']>>[number],
  bridged: Awaited<ReturnType<typeof resolvePromotedRecipeForCosting>>,
  latestSnapshot: WorkflowSnapshotSummary | null,
  versionNumber: number,
): OperationalRecipeSummary {
  const sourceRows = bridged.source_rows;

  return {
    recipe_id: recipe.recipe_id,
    recipe_name: recipe.recipe_name,
    recipe_type: recipe.recipe_type,
    recipe_version_id: Number(recipe.recipe_version_id),
    version_number: versionNumber,
    yield_qty: recipe.yield_qty,
    yield_unit: recipe.yield_unit == null ? null : String(recipe.yield_unit),
    serving_count: recipe.serving_count,
    source_builder_job_id: recipe.source_builder_job_id ?? null,
    source_builder_draft_recipe_id: recipe.source_builder_draft_recipe_id ?? null,
    source_template_id: recipe.source_template_id ?? null,
    source_template_version_id: recipe.source_template_version_id ?? null,
    ingredient_row_count: bridged.costability_summary.total_rows,
    resolved_row_count: bridged.costability_summary.resolved_rows,
    unresolved_row_count: bridged.costability_summary.unresolved_rows,
    inventory_linked_row_count: sourceRows.filter((row) => row.inventory_mapping_resolution?.trusted && row.inventory_item_id != null).length,
    vendor_linked_row_count: sourceRows.filter((row) => row.vendor_mapping_resolution?.trusted && row.vendor_mapping_resolution.vendor_item_id != null).length,
    missing_canonical_count: sourceRows.filter((row) => row.costability_status === 'MISSING_CANONICAL_INGREDIENT').length,
    missing_inventory_mapping_count: sourceRows.filter((row) => row.costability_status === 'MISSING_SCOPED_INVENTORY_MAPPING').length,
    missing_vendor_mapping_count: sourceRows.filter((row) => row.costability_status === 'MISSING_SCOPED_VENDOR_MAPPING').length,
    missing_vendor_cost_lineage_count: sourceRows.filter((row) => row.costability_status === 'MISSING_VENDOR_COST_LINEAGE').length,
    costable_percent: bridged.costability_summary.costable_percent,
    costability_classification: bridged.costability_summary.classification,
    blocker_messages: bridged.costability_summary.blocking_reasons.slice(0, 5).map((reason) => reason.message),
    latest_snapshot: latestSnapshot,
  };
}

function getLatestWorkflowSnapshot(
  db: Database.Database,
  recipeId: number,
  recipeVersionId: number,
): WorkflowSnapshotSummary | null {
  const row = db.prepare(
    `
      SELECT
        id,
        snapshot_at,
        total_cost,
        cost_per_serving,
        completeness_status,
        confidence_label,
        resolved_ingredient_count,
        ingredient_count,
        missing_cost_count,
        stale_cost_count,
        ambiguous_cost_count,
        unit_mismatch_count
      FROM recipe_cost_snapshots
      WHERE recipe_id = ?
        AND recipe_version_id = ?
      ORDER BY snapshot_at DESC, id DESC
      LIMIT 1
    `,
  ).get(recipeId, recipeVersionId) as WorkflowSnapshotSummary | undefined;

  return row ?? null;
}

function buildRecipeWorkflowContext(source: Record<string, unknown>): IntelligenceJobContext {
  const now = new Date().toISOString();
  const venueId = positiveNumber(source['venue_id']) ?? null;

  return {
    scope: {
      organizationId: 1,
      locationId: venueId ?? undefined,
    },
    window: {
      start: now,
      end: now,
    },
    ruleVersion: 'recipe-workflow/v1',
    now,
  };
}

function classificationSortRank(classification: OperationalRecipeSummary['costability_classification']): number {
  switch (classification) {
    case 'BLOCKED_FOR_COSTING':
      return 0;
    case 'OPERATIONAL_ONLY':
      return 1;
    case 'COSTABLE_NOW':
      return 2;
    default:
      return 3;
  }
}

function getRecipeVersionNumber(db: Database.Database, recipeVersionId: number): number {
  const row = db.prepare(
    `
      SELECT version_number
      FROM recipe_versions
      WHERE id = ?
      LIMIT 1
    `,
  ).get(recipeVersionId) as { version_number: number } | undefined;

  return row?.version_number ?? 1;
}

function positiveNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}
