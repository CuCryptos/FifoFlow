import type Database from 'better-sqlite3';
import type { RecipeCostRunSummary } from '@fifoflow/shared';
import { getDb } from '../../db.js';
import { SQLiteCanonicalInventoryRepository } from '../../mapping/inventory/index.js';
import type { CanonicalInventoryReadRepository } from '../../mapping/inventory/types.js';
import { SQLiteInventoryVendorRepository } from '../../mapping/vendor/index.js';
import type { InventoryVendorReadRepository } from '../../mapping/vendor/types.js';
import type { IntelligenceJobContext, IntelligenceJobDefinition, IntelligenceJobResult } from '../types.js';
import { executeRecipeCostSnapshots, type RecipeCostRunDependencies } from './recipeCostEngine.js';
import { PromotedRecipeCostSourceBridge } from './recipeCostSourceBridge.js';
import { SQLiteOperationalRecipeCostReadRepository } from './recipeCostRepositories.js';
import type {
  RecipeCostJobRecipeResult,
  RecipeCostOperationalReadRepository,
  RecipeCostSource,
} from './types.js';
import { SQLiteRecipeCostRepository } from './persistence/sqliteRecipeCostRepository.js';

export const recipeCostJobDefinition: IntelligenceJobDefinition = {
  jobName: 'recipe-cost-job',
  purpose: 'Build deterministic recipe cost snapshots from promoted operational recipes and normalized ingredient costs while preserving costability and explainability.',
  expectedInputs: [
    'promoted recipe versions',
    'promoted recipe ingredients',
    'scoped canonical ingredient to inventory mappings',
    'normalized ingredient cost candidates',
    'unit conversions',
    'optional manual cost overrides',
  ],
  expectedOutputs: [
    'recipe cost snapshots',
    'ingredient cost resolution logs',
    'recipe ingredient cost components',
    'per-recipe costability summaries',
  ],
  todos: [
    'Resolve recipe-group-aware policy thresholds for recipe-cost drift after the scoped policy migration lands.',
    'Connect live recipe cost outputs into margin-pressure and standards workflows.',
  ],
};

export interface RecipeCostJobDependencies extends Partial<RecipeCostRunDependencies> {
  operationalRepository?: RecipeCostOperationalReadRepository;
  inventoryRepository?: CanonicalInventoryReadRepository;
  vendorRepository?: InventoryVendorReadRepository;
  candidateSource?: Pick<RecipeCostSource, 'listIngredientCostCandidates'>;
}

export async function runRecipeCostJob(
  context: IntelligenceJobContext,
  dependencies: RecipeCostJobDependencies = {},
): Promise<IntelligenceJobResult & {
  recipe_cost_summary?: RecipeCostRunSummary;
  recipe_cost_recipe_results?: RecipeCostJobRecipeResult[];
}> {
  if (dependencies.source && dependencies.repository) {
    const result = await executeRecipeCostSnapshots(context, dependencies as RecipeCostRunDependencies);
    return {
      notes: result.notes,
      recipe_cost_summary: result.run_summary,
      recipe_cost_recipe_results: result.snapshots.map((snapshot) => ({
        recipe_id: snapshot.recipe_id,
        recipe_version_id: snapshot.recipe_version_id ?? 'legacy',
        costability_classification: snapshot.completeness_status === 'complete' ? 'COSTABLE_NOW' : 'OPERATIONAL_ONLY',
        total_rows: snapshot.ingredient_count,
        resolved_rows: snapshot.resolved_ingredient_count,
        unresolved_rows: snapshot.ingredient_count - snapshot.resolved_ingredient_count,
        costable_percent: snapshot.ingredient_count === 0 ? 0 : Number(((snapshot.resolved_ingredient_count / snapshot.ingredient_count) * 100).toFixed(2)),
        blocking_reasons: [],
        snapshot_persisted: true,
        snapshot_id: snapshot.id,
        snapshot_completeness_status: snapshot.completeness_status,
        snapshot_confidence_label: snapshot.confidence_label,
      })),
    };
  }

  let ownedDb: Database.Database | null = null;
  try {
    ownedDb = getOwnedDbIfNeeded(dependencies);
    const db = ownedDb;
    const repository = dependencies.repository ?? (db ? new SQLiteRecipeCostRepository(db) : undefined);
    const operationalRepository = dependencies.operationalRepository ?? (db ? new SQLiteOperationalRecipeCostReadRepository(db) : undefined);
    const inventoryRepository = dependencies.inventoryRepository ?? (db ? new SQLiteCanonicalInventoryRepository(db) : undefined);
    const vendorRepository = dependencies.vendorRepository ?? (db ? new SQLiteInventoryVendorRepository(db) : undefined);
    const candidateSource = dependencies.candidateSource;

    if (!repository || !operationalRepository || !inventoryRepository || !vendorRepository) {
      return {
        notes: ['Recipe cost job could not construct the live promoted-recipe source path because required repositories were missing.'],
        recipe_cost_summary: undefined,
        recipe_cost_recipe_results: undefined,
      };
    }

    const bridge = new PromotedRecipeCostSourceBridge({
      operationalRepository,
      inventoryRepository,
      vendorRepository,
      candidateSource,
    });
    const bridgedRecipes = await bridge.listBridgedRecipes(context);
    const costableRecipes = bridgedRecipes.filter((entry) => entry.costability_summary.classification === 'COSTABLE_NOW');

    const notes: string[] = [];
    if (bridgedRecipes.length === 0) {
      notes.push('No promoted recipe versions were available for live recipe costing.');
    }
    const skippedCount = bridgedRecipes.length - costableRecipes.length;
    if (skippedCount > 0) {
      notes.push(`Skipped ${skippedCount} promoted recipe version(s) because scoped inventory costability was not sufficient for live costing.`);
    }

    const result = costableRecipes.length > 0
      ? await executeRecipeCostSnapshots(context, {
          repository,
          source: {
            listRecipeDefinitions: async () => costableRecipes.map((entry) => structuredClone(entry.recipe)),
            listIngredientCostCandidates: (jobContext) => bridge.listIngredientCostCandidates(jobContext),
          },
          thresholds: dependencies.thresholds,
        })
      : {
          snapshots: [],
          resolutions: [],
          components: [],
          comparisons: [],
          run_summary: emptyRunSummary(),
          notes: [],
        };

    const snapshotByVersionId = new Map(
      result.snapshots.map((snapshot) => [String(snapshot.recipe_version_id ?? 'legacy'), snapshot]),
    );
    const recipeResults: RecipeCostJobRecipeResult[] = bridgedRecipes.map((entry) => {
      const snapshot = snapshotByVersionId.get(String(entry.recipe.recipe_version_id ?? 'legacy')) ?? null;
      return {
        recipe_id: entry.recipe.recipe_id,
        recipe_version_id: entry.recipe.recipe_version_id ?? 'legacy',
        costability_classification: entry.costability_summary.classification,
        total_rows: entry.costability_summary.total_rows,
        resolved_rows: entry.costability_summary.resolved_rows,
        unresolved_rows: entry.costability_summary.unresolved_rows,
        costable_percent: entry.costability_summary.costable_percent,
        blocking_reasons: entry.costability_summary.blocking_reasons,
        snapshot_persisted: snapshot !== null,
        snapshot_id: snapshot?.id ?? null,
        snapshot_completeness_status: snapshot?.completeness_status ?? null,
        snapshot_confidence_label: snapshot?.confidence_label ?? null,
      };
    });

    return {
      notes: [...notes, ...result.notes],
      recipe_cost_summary: result.run_summary,
      recipe_cost_recipe_results: recipeResults,
    };
  } finally {
    ownedDb?.close();
  }
}

function getOwnedDbIfNeeded(dependencies: RecipeCostJobDependencies): Database.Database | null {
  if (
    dependencies.repository
    || dependencies.operationalRepository
    || dependencies.inventoryRepository
    || dependencies.vendorRepository
    || dependencies.candidateSource
  ) {
    return null;
  }
  return getDb();
}

function emptyRunSummary(): RecipeCostRunSummary {
  return {
    recipe_count: 0,
    snapshots_created: 0,
    snapshots_updated: 0,
    complete_snapshots: 0,
    partial_snapshots: 0,
    incomplete_snapshots: 0,
    missing_cost_resolutions: 0,
    stale_cost_resolutions: 0,
    ambiguous_cost_resolutions: 0,
    unit_mismatch_resolutions: 0,
  };
}
