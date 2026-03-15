import { tryConvertQuantity } from '@fifoflow/shared';
import type {
  EvidenceReference,
  IngredientCostResolution,
  IngredientCostResolutionStatus,
  RecipeCostConfidenceLabel,
  RecipeCostRunSummary,
  RecipeCostSnapshot,
  RecipeCostSnapshotComparison,
  RecipeCostSourceType,
  RecipeIngredientCostComponent,
  Unit,
} from '@fifoflow/shared';
import type { IntelligenceJobContext } from '../types.js';
import type {
  IngredientCostCandidate,
  RecipeCostExecutionResult,
  RecipeCostPersistenceRepository,
  RecipeCostThresholds,
  RecipeDefinition,
  RecipeIngredientDefinition,
  RecipeCostSource,
} from './types.js';

const SOURCE_PRECEDENCE: RecipeCostSourceType[] = [
  'invoice_recent',
  'vendor_price_history',
  'last_trusted_snapshot',
  'manual_override',
];

export const DEFAULT_RECIPE_COST_THRESHOLDS: RecipeCostThresholds = {
  invoice_recent_max_age_days: 30,
  vendor_price_history_max_age_days: 45,
  last_trusted_snapshot_max_age_days: 30,
  manual_override_max_age_days: 90,
  driver_count: 3,
};

export interface RecipeCostRunDependencies {
  source: RecipeCostSource;
  repository: RecipeCostPersistenceRepository;
  thresholds?: RecipeCostThresholds;
}

interface ResolvedIngredientComponent {
  resolution: IngredientCostResolution;
  component: RecipeIngredientCostComponent;
}

interface CandidateChoice {
  candidate: IngredientCostCandidate;
  status: IngredientCostResolutionStatus;
  explanation: string;
  ambiguityCount: number;
  staleAfterDays: number;
}

export async function executeRecipeCostSnapshots(
  context: IntelligenceJobContext,
  dependencies: RecipeCostRunDependencies,
): Promise<RecipeCostExecutionResult> {
  const thresholds = dependencies.thresholds ?? DEFAULT_RECIPE_COST_THRESHOLDS;
  const recipes = await dependencies.source.listRecipeDefinitions(context);
  const costCandidates = await dependencies.source.listIngredientCostCandidates(context);
  const candidatesByItem = groupCandidatesByItem(costCandidates);
  const run = dependencies.repository.startRun ? await dependencies.repository.startRun(context.now) : undefined;

  const snapshots: RecipeCostSnapshot[] = [];
  const resolutions: IngredientCostResolution[] = [];
  const components: RecipeIngredientCostComponent[] = [];
  const comparisons: RecipeCostSnapshotComparison[] = [];
  const notes: string[] = [];
  const summary: RecipeCostRunSummary = {
    recipe_count: recipes.length,
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

  try {
    await dependencies.repository.withTransaction(async () => {
      for (const recipe of recipes) {
        const built = buildRecipeSnapshot(recipe, candidatesByItem, context, thresholds, run?.id ?? null);
        const persistedSnapshot = await dependencies.repository.upsertSnapshot(built.snapshot);

        if (persistedSnapshot.action === 'created') {
          summary.snapshots_created += 1;
        } else {
          summary.snapshots_updated += 1;
        }

        const persistedResolutions = await dependencies.repository.replaceSnapshotResolutions(
          persistedSnapshot.record.id,
          built.resolvedIngredients.map((resolved) => ({
            ...resolved.resolution,
            recipe_cost_snapshot_id: persistedSnapshot.record.id,
          })),
        );
        const resolutionIndex = new Map(
          persistedResolutions.map((resolution) => [
            `${resolution.recipe_item_id}:${resolution.inventory_item_id ?? 'unresolved'}`,
            resolution,
          ]),
        );
        const persistedComponents = await dependencies.repository.replaceSnapshotComponents(
          persistedSnapshot.record.id,
          built.resolvedIngredients.map((resolved) => ({
            ...resolved.component,
            recipe_cost_snapshot_id: persistedSnapshot.record.id,
            resolution: resolutionIndex.get(
              `${resolved.component.recipe_item_id}:${resolved.component.inventory_item_id ?? 'unresolved'}`,
            ) ?? resolved.component.resolution,
          })),
        );

        const persistedRecord: RecipeCostSnapshot = {
          ...persistedSnapshot.record,
          components: persistedComponents,
        };
        const comparison = await dependencies.repository.buildComparableSnapshotComparison(
          persistedRecord,
          recipe.recipe_version_id ?? null,
        );

        snapshots.push(persistedRecord);
        resolutions.push(...persistedResolutions);
        components.push(...persistedComponents);
        comparisons.push(comparison);
        incrementSnapshotSummary(summary, persistedRecord.completeness_status);
        for (const resolution of persistedResolutions) {
          incrementResolutionSummary(summary, resolution.status);
        }
      }
    });

    if (snapshots.length === 0) {
      notes.push('No recipes were available for recipe cost snapshot generation.');
    }

    const completedRun = run && dependencies.repository.completeRun
      ? await dependencies.repository.completeRun(run.id, 'completed', summary, context.now, notes.join(' ') || null)
      : undefined;

    return {
      snapshots,
      resolutions,
      components,
      comparisons,
      run_summary: summary,
      run: completedRun,
      notes,
    };
  } catch (error) {
    if (run && dependencies.repository.completeRun) {
      await dependencies.repository.completeRun(run.id, 'failed', summary, context.now, error instanceof Error ? error.message : 'Unknown recipe cost failure');
    }
    throw error;
  }
}

export function buildRecipeSnapshot(
  recipe: RecipeDefinition,
  candidatesByItem: Map<number, IngredientCostCandidate[]>,
  context: IntelligenceJobContext,
  thresholds: RecipeCostThresholds,
  sourceRunId: number | string | null = null,
): { snapshot: RecipeCostSnapshot; resolvedIngredients: ResolvedIngredientComponent[] } {
  const resolvedIngredients = recipe.ingredients.map((ingredient) =>
    buildResolvedIngredient(
      recipe,
      ingredient,
      ingredient.inventory_item_id == null ? [] : (candidatesByItem.get(ingredient.inventory_item_id) ?? []),
      context,
      thresholds,
    ),
  );

  const resolvedCostSubtotal = roundCurrency(
    resolvedIngredients.reduce((sum, resolved) => sum + (resolved.component.line_cost ?? 0), 0),
  );
  const resolvedIngredientCount = resolvedIngredients.filter((resolved) => resolved.component.line_cost !== null).length;
  const missingCostCount = countByStatus(resolvedIngredients, 'missing_cost');
  const staleCostCount = countByStatus(resolvedIngredients, 'stale_cost');
  const ambiguousCostCount = countByStatus(resolvedIngredients, 'ambiguous_cost');
  const unitMismatchCount = countByStatus(resolvedIngredients, 'unit_mismatch');

  const completenessStatus = resolveCompletenessStatus({
    missingCostCount,
    ambiguousCostCount,
    unitMismatchCount,
    staleCostCount,
  });
  const confidenceLabel = resolveConfidenceLabel(completenessStatus);
  const totalCost = completenessStatus === 'incomplete' ? null : resolvedCostSubtotal;
  const costPerYieldUnit = totalCost !== null && recipe.yield_qty && recipe.yield_qty > 0
    ? roundCurrency(totalCost / recipe.yield_qty)
    : null;
  const costPerServing = totalCost !== null && recipe.serving_count && recipe.serving_count > 0
    ? roundCurrency(totalCost / recipe.serving_count)
    : null;
  const driverBase = totalCost ?? resolvedCostSubtotal;
  const driverItems = resolvedIngredients
    .filter(
      (resolved): resolved is ResolvedIngredientComponent & {
        component: RecipeIngredientCostComponent & { inventory_item_id: number };
      } => resolved.component.line_cost !== null && resolved.component.inventory_item_id !== null,
    )
    .sort((a, b) => (b.component.line_cost ?? 0) - (a.component.line_cost ?? 0))
    .slice(0, thresholds.driver_count)
    .map((resolved) => ({
      inventory_item_id: resolved.component.inventory_item_id,
      inventory_item_name: resolved.component.inventory_item_name,
      line_cost: resolved.component.line_cost,
      contribution_pct: driverBase > 0 && resolved.component.line_cost !== null
        ? roundRatio(resolved.component.line_cost / driverBase)
        : null,
    }));

  const snapshot: RecipeCostSnapshot = {
    id: `${recipe.recipe_id}:${context.now}`,
    recipe_id: recipe.recipe_id,
    recipe_version_id: recipe.recipe_version_id ?? null,
    recipe_name: recipe.recipe_name,
    recipe_type: recipe.recipe_type,
    yield_qty: recipe.yield_qty,
    yield_unit: recipe.yield_unit,
    serving_count: recipe.serving_count,
    total_cost: totalCost,
    resolved_cost_subtotal: resolvedCostSubtotal,
    cost_per_yield_unit: costPerYieldUnit,
    cost_per_serving: costPerServing,
    completeness_status: completenessStatus,
    confidence_label: confidenceLabel,
    ingredient_count: recipe.ingredients.length,
    resolved_ingredient_count: resolvedIngredientCount,
    missing_cost_count: missingCostCount,
    stale_cost_count: staleCostCount,
    ambiguous_cost_count: ambiguousCostCount,
    unit_mismatch_count: unitMismatchCount,
    comparable_key: buildRecipeComparableKey(recipe.recipe_id, recipe.recipe_version_id ?? null, context.window.end),
    source_run_id: sourceRunId,
    primary_driver_item_id: driverItems[0]?.inventory_item_id ?? null,
    primary_driver_cost: driverItems[0]?.line_cost ?? null,
    driver_items: driverItems,
    components: resolvedIngredients.map((resolved) => resolved.component),
    snapshot_at: context.now,
    created_at: context.now,
    updated_at: context.now,
  };

  return {
    snapshot,
    resolvedIngredients,
  };
}

export function buildRecipeComparableKey(recipeId: number, recipeVersionId: number | null, windowEnd: string): string {
  return `${recipeId}:${recipeVersionId ?? 'legacy'}:${windowEnd.slice(0, 10)}`;
}

function buildResolvedIngredient(
  recipe: RecipeDefinition,
  ingredient: RecipeIngredientDefinition,
  candidates: IngredientCostCandidate[],
  context: IntelligenceJobContext,
  thresholds: RecipeCostThresholds,
): ResolvedIngredientComponent {
  const quantityNormalized = normalizeIngredientQuantity(ingredient);
  const costResolution = resolveIngredientCost(recipe, ingredient, candidates, context, thresholds);

  let finalStatus = costResolution.status;
  let explanationText = costResolution.explanation_text;
  if (quantityNormalized === null) {
    finalStatus = 'unit_mismatch';
    explanationText = `${costResolution.explanation_text} Recipe quantity ${ingredient.quantity} ${ingredient.unit} could not be normalized to ${ingredient.base_unit}.`;
  }

  const lineCost =
    quantityNormalized !== null &&
    costResolution.normalized_unit_cost !== null &&
    finalStatus !== 'missing_cost' &&
    finalStatus !== 'ambiguous_cost' &&
    finalStatus !== 'unit_mismatch'
      ? roundCurrency(quantityNormalized * costResolution.normalized_unit_cost)
      : null;

  const resolution: IngredientCostResolution = {
    ...costResolution,
    status: finalStatus,
    explanation_text: explanationText,
    detail_json: {
      ...(costResolution.detail_json ?? {}),
      quantity_in_recipe: ingredient.quantity,
      recipe_unit: String(ingredient.unit),
      normalized_quantity: quantityNormalized,
      canonical_ingredient_id: ingredient.canonical_ingredient_id ?? null,
      raw_ingredient_text: ingredient.raw_ingredient_text ?? null,
      costability_status: ingredient.costability_status ?? null,
      inventory_mapping_resolution: ingredient.inventory_mapping_resolution ?? null,
      vendor_mapping_resolution: ingredient.vendor_mapping_resolution ?? null,
      vendor_cost_lineage: ingredient.vendor_cost_lineage ?? null,
    },
    created_at: context.now,
    updated_at: context.now,
  };

  const component: RecipeIngredientCostComponent = {
    id: `${recipe.recipe_id}:${ingredient.recipe_item_id}:${context.now}`,
    recipe_id: recipe.recipe_id,
    recipe_name: recipe.recipe_name,
    recipe_item_id: ingredient.recipe_item_id,
    inventory_item_id: ingredient.inventory_item_id,
    inventory_item_name: ingredient.inventory_item_name,
    quantity_in_recipe: ingredient.quantity,
    recipe_unit: String(ingredient.unit),
    normalized_quantity: quantityNormalized,
    quantity_base_unit: quantityNormalized,
    base_unit: String(ingredient.base_unit),
    normalized_unit_cost: resolution.normalized_unit_cost,
    resolved_unit_cost: resolution.normalized_unit_cost,
    line_cost: lineCost,
    extended_cost: lineCost,
    resolution_status: finalStatus,
    cost_source_type: resolution.source_type,
    cost_source_ref: resolution.source_ref_table && resolution.source_ref_id
      ? `${resolution.source_ref_table}:${resolution.source_ref_id}`
      : null,
    stale_flag: resolution.is_stale,
    ambiguity_flag: resolution.ambiguity_count > 0,
    resolution,
    created_at: context.now,
    updated_at: context.now,
  };

  return {
    resolution,
    component,
  };
}

export function resolveIngredientCost(
  recipe: RecipeDefinition,
  ingredient: RecipeIngredientDefinition,
  candidates: IngredientCostCandidate[],
  context: IntelligenceJobContext,
  thresholds: RecipeCostThresholds,
): IngredientCostResolution {
  if (ingredient.inventory_item_id == null) {
    return {
      id: `${recipe.recipe_id}:${ingredient.recipe_item_id}:${context.now}`,
      recipe_id: recipe.recipe_id,
      recipe_name: recipe.recipe_name,
      recipe_item_id: ingredient.recipe_item_id,
      inventory_item_id: null,
      inventory_item_name: ingredient.inventory_item_name,
      source_type: null,
      status: 'missing_cost',
      normalized_unit_cost: null,
      base_unit: String(ingredient.base_unit),
      source_ref_table: null,
      source_ref_id: null,
      observed_at: null,
      stale_after_days: null,
      is_stale: false,
      ambiguity_count: 0,
      candidate_count: 0,
      explanation_text: ingredient.inventory_mapping_resolution?.explanation_text
        ?? `No trusted scoped inventory mapping was available for ${ingredient.inventory_item_name}.`,
      evidence: [],
      detail_json: {
        canonical_ingredient_id: ingredient.canonical_ingredient_id ?? null,
        raw_ingredient_text: ingredient.raw_ingredient_text ?? null,
        costability_status: ingredient.costability_status ?? null,
        inventory_mapping_resolution: ingredient.inventory_mapping_resolution ?? null,
        vendor_mapping_resolution: ingredient.vendor_mapping_resolution ?? null,
        vendor_cost_lineage: ingredient.vendor_cost_lineage ?? null,
      },
    };
  }

  const unitAlignedCandidates = candidates.filter((candidate) => candidate.base_unit === ingredient.base_unit);
  const hasUnitMismatchCandidates = candidates.length > 0 && unitAlignedCandidates.length === 0;

  const freshChoice = chooseCandidate(unitAlignedCandidates, thresholds, context.now, false);
  if (freshChoice) {
    return buildResolution(
      recipe,
      ingredient,
      freshChoice.status,
      freshChoice.candidate,
      freshChoice.explanation,
      freshChoice.ambiguityCount,
      freshChoice.staleAfterDays,
    );
  }

  const staleChoice = chooseCandidate(unitAlignedCandidates, thresholds, context.now, true);
  if (staleChoice) {
    return buildResolution(
      recipe,
      ingredient,
      'stale_cost',
      staleChoice.candidate,
      staleChoice.explanation,
      staleChoice.ambiguityCount,
      staleChoice.staleAfterDays,
      true,
    );
  }

  if (hasUnitMismatchCandidates) {
    return {
      id: `${recipe.recipe_id}:${ingredient.recipe_item_id}:${context.now}`,
      recipe_id: recipe.recipe_id,
      recipe_name: recipe.recipe_name,
      recipe_item_id: ingredient.recipe_item_id,
      inventory_item_id: ingredient.inventory_item_id,
      inventory_item_name: ingredient.inventory_item_name,
      source_type: null,
      status: 'unit_mismatch',
      normalized_unit_cost: null,
      base_unit: String(ingredient.base_unit),
      source_ref_table: null,
      source_ref_id: null,
      observed_at: null,
      stale_after_days: null,
      is_stale: false,
      ambiguity_count: 0,
      candidate_count: candidates.length,
      explanation_text: `Available ingredient cost candidates for ${ingredient.inventory_item_name} were not normalized to the recipe base unit ${ingredient.base_unit}.`,
      evidence: [],
      detail_json: {
        candidate_units: candidates.map((candidate) => candidate.base_unit),
        vendor_item_ids: candidates.map((candidate) => candidate.vendor_item_id ?? null),
      },
    };
  }

  return {
    id: `${recipe.recipe_id}:${ingredient.recipe_item_id}:${context.now}`,
    recipe_id: recipe.recipe_id,
    recipe_name: recipe.recipe_name,
    recipe_item_id: ingredient.recipe_item_id,
    inventory_item_id: ingredient.inventory_item_id,
    inventory_item_name: ingredient.inventory_item_name,
    source_type: null,
    status: 'missing_cost',
    normalized_unit_cost: null,
    base_unit: String(ingredient.base_unit),
    source_ref_table: null,
    source_ref_id: null,
    observed_at: null,
    stale_after_days: null,
    is_stale: false,
    ambiguity_count: 0,
    candidate_count: 0,
    explanation_text: `No trusted normalized ingredient cost source was available for ${ingredient.inventory_item_name}.`,
    evidence: [],
    detail_json: {},
  };
}

function chooseCandidate(
  candidates: IngredientCostCandidate[],
  thresholds: RecipeCostThresholds,
  now: string,
  requireStale: boolean,
): CandidateChoice | null {
  for (const sourceType of SOURCE_PRECEDENCE) {
    const eligible = candidates
      .filter((candidate) => candidate.source_type === sourceType)
      .filter((candidate) => isCandidateActive(candidate, now));
    const staleAfterDays = maxAgeForSource(sourceType, thresholds);

    if (eligible.length === 0) {
      continue;
    }

    const matchingFreshness = eligible.filter((candidate) => isStaleCandidate(candidate, thresholds, now) === requireStale);
    if (matchingFreshness.length === 0) {
      continue;
    }

    const distinctCosts = distinctRoundedCosts(matchingFreshness);
    if (distinctCosts.length > 1) {
      return {
        candidate: matchingFreshness[0]!,
        status: 'ambiguous_cost',
        explanation: `${sourceType} returned ${matchingFreshness.length} materially different normalized costs (${distinctCosts.join(', ')}).`,
        ambiguityCount: matchingFreshness.length,
        staleAfterDays,
      };
    }

    const chosen = [...matchingFreshness].sort(compareCandidates)[0]!;
    return {
      candidate: chosen,
      status: requireStale ? 'stale_cost' : 'resolved',
      explanation: requireStale
        ? `Resolved from stale ${sourceType} cost recorded on ${chosen.observed_at ?? 'unknown date'}.`
        : `Resolved from ${sourceType} cost recorded on ${chosen.observed_at ?? 'unknown date'}.`,
      ambiguityCount: 0,
      staleAfterDays,
    };
  }

  return null;
}

function buildResolution(
  recipe: RecipeDefinition,
  ingredient: RecipeIngredientDefinition,
  status: IngredientCostResolutionStatus,
  candidate: IngredientCostCandidate,
  explanationText: string,
  ambiguityCount: number,
  staleAfterDays: number,
  isStale = false,
): IngredientCostResolution {
  return {
    id: `${recipe.recipe_id}:${ingredient.recipe_item_id}:${candidate.source_ref_table}:${candidate.source_ref_id}`,
    recipe_id: recipe.recipe_id,
    recipe_name: recipe.recipe_name,
    recipe_item_id: ingredient.recipe_item_id,
    inventory_item_id: ingredient.inventory_item_id,
    inventory_item_name: ingredient.inventory_item_name,
    source_type: candidate.source_type,
    status,
    normalized_unit_cost: status === 'ambiguous_cost' ? null : candidate.normalized_unit_cost,
    base_unit: String(ingredient.base_unit),
    source_ref_table: candidate.source_ref_table,
    source_ref_id: candidate.source_ref_id,
    observed_at: candidate.observed_at,
    stale_after_days: staleAfterDays,
    is_stale: isStale,
    ambiguity_count: ambiguityCount,
    candidate_count: ambiguityCount > 0 ? ambiguityCount : 1,
    explanation_text: explanationText,
    evidence: buildCandidateEvidence(candidate),
    detail_json: {
      canonical_ingredient_id: ingredient.canonical_ingredient_id ?? null,
      raw_ingredient_text: ingredient.raw_ingredient_text ?? null,
      costability_status: ingredient.costability_status ?? null,
      inventory_mapping_resolution: ingredient.inventory_mapping_resolution ?? null,
      vendor_mapping_resolution: ingredient.vendor_mapping_resolution ?? null,
      vendor_cost_lineage: ingredient.vendor_cost_lineage ?? null,
      vendor_item_id: candidate.vendor_item_id ?? null,
      vendor_item_name: candidate.vendor_item_name ?? null,
      vendor_id: candidate.vendor_id ?? null,
      vendor_name: candidate.vendor_name ?? null,
      normalized_cost_base_unit: candidate.normalized_cost_base_unit ?? candidate.base_unit,
      stale_flag: candidate.stale_flag ?? false,
      confidence_label: candidate.confidence_label ?? null,
      inventory_scope_explanation: candidate.inventory_scope_explanation ?? null,
      vendor_scope_explanation: candidate.vendor_scope_explanation ?? null,
      effective_from: candidate.effective_from ?? null,
      effective_to: candidate.effective_to ?? null,
    },
  };
}

function normalizeIngredientQuantity(ingredient: RecipeIngredientDefinition): number | null {
  if (ingredient.unit === ingredient.base_unit) {
    return roundQuantity(ingredient.quantity);
  }

  const packaging = ingredient.packaging
    ? {
        baseUnit: ingredient.packaging.baseUnit as Unit,
        orderUnit: ingredient.packaging.orderUnit ?? null,
        innerUnit: ingredient.packaging.innerUnit ?? null,
        qtyPerUnit: ingredient.packaging.qtyPerUnit ?? null,
        itemSizeValue: ingredient.packaging.itemSizeValue ?? null,
        itemSizeUnit: ingredient.packaging.itemSizeUnit ?? null,
      }
    : undefined;

  const converted = tryConvertQuantity(
    ingredient.quantity,
    ingredient.unit as Unit,
    ingredient.base_unit as Unit,
    packaging,
  );
  return converted === null ? null : roundQuantity(converted);
}

function buildCandidateEvidence(candidate: IngredientCostCandidate): EvidenceReference[] {
  const base: EvidenceReference = {
    source_table: candidate.source_ref_table,
    source_primary_key: candidate.source_ref_id,
    source_type: candidate.source_type,
    observed_at: candidate.observed_at,
    payload: {
      inventory_item_id: candidate.inventory_item_id,
      inventory_item_name: candidate.inventory_item_name,
      canonical_ingredient_id: candidate.canonical_ingredient_id ?? null,
      canonical_ingredient_ids: candidate.canonical_ingredient_ids ?? [],
      vendor_item_id: candidate.vendor_item_id ?? null,
      vendor_item_name: candidate.vendor_item_name ?? null,
      normalized_unit_cost: candidate.normalized_unit_cost,
      base_unit: candidate.normalized_cost_base_unit ?? candidate.base_unit,
      stale_flag: candidate.stale_flag ?? false,
      confidence_label: candidate.confidence_label ?? null,
      inventory_scope_explanation: candidate.inventory_scope_explanation ?? null,
      vendor_scope_explanation: candidate.vendor_scope_explanation ?? null,
      vendor_id: candidate.vendor_id ?? null,
      vendor_name: candidate.vendor_name ?? null,
    },
  };
  return candidate.evidence && candidate.evidence.length > 0 ? candidate.evidence : [base];
}

function groupCandidatesByItem(candidates: IngredientCostCandidate[]): Map<number, IngredientCostCandidate[]> {
  const grouped = new Map<number, IngredientCostCandidate[]>();
  for (const candidate of candidates) {
    const existing = grouped.get(candidate.inventory_item_id);
    if (existing) {
      existing.push(candidate);
      continue;
    }
    grouped.set(candidate.inventory_item_id, [candidate]);
  }
  return grouped;
}

function resolveCompletenessStatus(counts: {
  missingCostCount: number;
  ambiguousCostCount: number;
  unitMismatchCount: number;
  staleCostCount: number;
}): RecipeCostSnapshot['completeness_status'] {
  if (counts.missingCostCount > 0 || counts.ambiguousCostCount > 0 || counts.unitMismatchCount > 0) {
    return 'incomplete';
  }
  if (counts.staleCostCount > 0) {
    return 'partial';
  }
  return 'complete';
}

function resolveConfidenceLabel(completenessStatus: RecipeCostSnapshot['completeness_status']): RecipeCostConfidenceLabel {
  if (completenessStatus === 'complete') {
    return 'high';
  }
  if (completenessStatus === 'partial') {
    return 'medium';
  }
  return 'low';
}

function incrementResolutionSummary(summary: RecipeCostRunSummary, status: IngredientCostResolutionStatus): void {
  if (status === 'missing_cost') {
    summary.missing_cost_resolutions += 1;
    return;
  }
  if (status === 'stale_cost') {
    summary.stale_cost_resolutions += 1;
    return;
  }
  if (status === 'ambiguous_cost') {
    summary.ambiguous_cost_resolutions += 1;
    return;
  }
  if (status === 'unit_mismatch') {
    summary.unit_mismatch_resolutions += 1;
  }
}

function incrementSnapshotSummary(
  summary: RecipeCostRunSummary,
  completenessStatus: RecipeCostSnapshot['completeness_status'],
): void {
  if (completenessStatus === 'complete') {
    summary.complete_snapshots += 1;
    return;
  }
  if (completenessStatus === 'partial') {
    summary.partial_snapshots += 1;
    return;
  }
  summary.incomplete_snapshots += 1;
}

function countByStatus(
  ingredients: ResolvedIngredientComponent[],
  status: IngredientCostResolutionStatus,
): number {
  return ingredients.filter((resolved) => resolved.component.resolution_status === status).length;
}

function distinctRoundedCosts(candidates: IngredientCostCandidate[]): string[] {
  return [...new Set(candidates.map((candidate) => candidate.normalized_unit_cost.toFixed(4)))];
}

function isCandidateActive(candidate: IngredientCostCandidate, now: string): boolean {
  if (candidate.effective_from && compareIso(candidate.effective_from, now) > 0) {
    return false;
  }
  if (candidate.effective_to && compareIso(candidate.effective_to, now) < 0) {
    return false;
  }
  return true;
}

function isStaleCandidate(candidate: IngredientCostCandidate, thresholds: RecipeCostThresholds, now: string): boolean {
  if (!candidate.observed_at) {
    return candidate.source_type !== 'manual_override';
  }
  const ageDays = diffDays(candidate.observed_at, now);
  return ageDays > maxAgeForSource(candidate.source_type, thresholds);
}

function maxAgeForSource(sourceType: RecipeCostSourceType, thresholds: RecipeCostThresholds): number {
  if (sourceType === 'invoice_recent') {
    return thresholds.invoice_recent_max_age_days;
  }
  if (sourceType === 'vendor_price_history') {
    return thresholds.vendor_price_history_max_age_days;
  }
  if (sourceType === 'last_trusted_snapshot') {
    return thresholds.last_trusted_snapshot_max_age_days;
  }
  return thresholds.manual_override_max_age_days;
}

function compareCandidates(a: IngredientCostCandidate, b: IngredientCostCandidate): number {
  const observedCompare = compareIso(b.observed_at ?? '', a.observed_at ?? '');
  if (observedCompare !== 0) {
    return observedCompare;
  }
  return a.source_ref_id.localeCompare(b.source_ref_id);
}

function diffDays(start: string, end: string): number {
  return Math.floor((Date.parse(end) - Date.parse(start)) / 86400000);
}

function compareIso(a: string, b: string): number {
  return a.localeCompare(b);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function roundRatio(value: number): number {
  return Math.round(value * 10000) / 10000;
}
