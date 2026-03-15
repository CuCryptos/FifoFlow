import type {
  DerivedSignal,
  EvidenceReference,
  RecipeCostDriverEvidence,
  RecipeCostDriftRunSummary,
  RecipeCostDriftSignalInput,
  RecipeCostDriftThresholdConfig,
  RecipeCostDriftThresholdRuleSet,
  RecipeCostIngredientDelta,
  SeverityLabel,
} from '@fifoflow/shared';
import type { PolicyRepository } from '../../platform/policy/index.js';
import { defaultConfidenceLabel, type IntelligenceJobContext, type IntelligenceJobResult } from '../types.js';
import type { IntelligencePersistenceRepository, IntelligenceRunCounters } from '../persistence/types.js';
import type { RecipeCostPersistenceRepository } from './types.js';
import {
  DEFAULT_RECIPE_COST_DRIFT_THRESHOLD_CONFIG,
} from './recipeCostThresholds.js';
import {
  buildRecipeCostThresholdExplainabilityPayload,
  resolveRecipeCostDriftThresholdPolicyBundle,
  type ResolvedRecipeCostDriftThresholdBundle,
} from './recipeCostThresholdPolicyResolver.js';

export interface RecipeCostDriftDependencies {
  recipeCostRepository: RecipeCostPersistenceRepository;
  intelligenceRepository: IntelligencePersistenceRepository;
  policyRepository?: PolicyRepository;
  thresholdConfig?: RecipeCostDriftThresholdConfig;
}

export interface RecipeCostDriftExecutionResult extends IntelligenceJobResult {
  recipe_cost_drift_summary: RecipeCostDriftRunSummary;
}

export async function executeRecipeCostDriftIntelligence(
  context: IntelligenceJobContext,
  dependencies: RecipeCostDriftDependencies,
): Promise<RecipeCostDriftExecutionResult> {
  const thresholdConfig = dependencies.thresholdConfig ?? DEFAULT_RECIPE_COST_DRIFT_THRESHOLD_CONFIG;
  const run = await dependencies.intelligenceRepository.startRun('recipe-cost-drift-job', context.now);
  const currentSnapshots = await dependencies.recipeCostRepository.listTrustedSnapshotsInWindow(context.window.start, context.window.end);

  const signals: DerivedSignal[] = [];
  const notes: string[] = [];
  const counters: IntelligenceRunCounters = {
    signals_created: 0,
    signals_updated: 0,
    patterns_created: 0,
    patterns_updated: 0,
    recommendations_created: 0,
    recommendations_updated: 0,
    recommendations_superseded: 0,
  };
  const summary: RecipeCostDriftRunSummary = {
    recipes_evaluated: currentSnapshots.length,
    comparable_recipes: 0,
    recipes_skipped_no_prior: 0,
    recipes_skipped_untrusted_current: 0,
    recipes_skipped_untrusted_comparison: 0,
    signals_created: 0,
    signals_updated: 0,
    drift_signals_emitted: 0,
    driver_signals_emitted: 0,
  };

  try {
    await dependencies.intelligenceRepository.withTransaction(async () => {
      for (const snapshot of currentSnapshots) {
        if (!isTrustedRecipeSnapshot(snapshot)) {
          summary.recipes_skipped_untrusted_current += 1;
          continue;
        }

        const comparison = await dependencies.recipeCostRepository.buildComparableSnapshotComparison(
          snapshot,
          snapshot.recipe_version_id ?? null,
        );

        if (!comparison.comparable || comparison.previous_snapshot_id === null) {
          if (comparison.comparison_reason?.includes('No previous trusted comparable snapshot')) {
            summary.recipes_skipped_no_prior += 1;
          } else {
            summary.recipes_skipped_untrusted_comparison += 1;
          }
          continue;
        }

        const previousSnapshot = await dependencies.recipeCostRepository.getPreviousComparableSnapshot(
          snapshot.recipe_id,
          snapshot.snapshot_at,
          snapshot.recipe_version_id ?? null,
        );
        if (!previousSnapshot || !isTrustedRecipeSnapshot(previousSnapshot)) {
          summary.recipes_skipped_no_prior += 1;
          continue;
        }

        const thresholdBundle = await resolveRecipeCostDriftThresholdPolicyBundle({
          subject: {
            recipe_id: snapshot.recipe_id,
            recipe_version_id: snapshot.recipe_version_id ?? null,
            recipe_name: snapshot.recipe_name,
            recipe_type: snapshot.recipe_type,
          },
          context,
          policyRepository: dependencies.policyRepository,
          fallbackConfig: thresholdConfig,
        });
        if (thresholdBundle.fallback_used) {
          notes.push(`Recipe cost drift fallback defaults were used for ${snapshot.recipe_name} (${snapshot.recipe_type}).`);
        }
        const input: RecipeCostDriftSignalInput = {
          recipe_id: snapshot.recipe_id,
          recipe_version_id: snapshot.recipe_version_id ?? null,
          current_snapshot: snapshot,
          previous_snapshot: previousSnapshot,
          comparison,
        };

        summary.comparable_recipes += 1;

        const driftSignal = evaluateRecipeCostDriftSignal(input, context, thresholdBundle);
        if (driftSignal) {
          const upserted = await dependencies.intelligenceRepository.upsertSignal(driftSignal);
          incrementSignalCounters(counters, summary, upserted.action);
          summary.drift_signals_emitted += 1;
          signals.push(upserted.record);
        }

        const driverSignals = evaluateIngredientDriverSignals(input, context, thresholdBundle);
        for (const driverSignal of driverSignals) {
          const upserted = await dependencies.intelligenceRepository.upsertSignal(driverSignal);
          incrementSignalCounters(counters, summary, upserted.action);
          summary.driver_signals_emitted += 1;
          signals.push(upserted.record);
        }
      }
    });

    if (signals.length === 0) {
      notes.push('No recipe cost drift signals were emitted for the evaluated trusted snapshot window.');
    }

    const completedRun = await dependencies.intelligenceRepository.completeRun(run.id, 'completed', counters, context.now);
    return {
      signals,
      run: completedRun,
      run_summary: counters,
      recipe_cost_drift_summary: summary,
      notes,
    };
  } catch (error) {
    await dependencies.intelligenceRepository.completeRun(run.id, 'failed', counters, context.now);
    throw error;
  }
}

export function evaluateRecipeCostDriftSignal(
  input: RecipeCostDriftSignalInput,
  context: IntelligenceJobContext,
  thresholdBundle: RecipeCostDriftThresholdRuleSet | ResolvedRecipeCostDriftThresholdBundle,
): DerivedSignal | null {
  const thresholds = extractThresholds(thresholdBundle);
  if (!canEvaluateRecipeCostDrift(input, thresholds)) {
    return null;
  }

  const deltaCost = input.comparison.total_cost_delta!;
  const deltaPct = input.comparison.total_cost_delta_pct!;
  const severity = resolveRecipeDriftSeverity(deltaCost, deltaPct, thresholds);
  const confidenceScore = resolveRecipeDriftConfidenceScore(deltaCost, deltaPct, thresholds);
  const subjectKey = buildRecipeSubjectKey(input.recipe_id, input.recipe_version_id ?? null);
  const evidence = buildRecipeDriftEvidence(input);

  return {
    id: `RECIPE_COST_DRIFT:${subjectKey}:${input.current_snapshot.id}`,
    signal_type: 'RECIPE_COST_DRIFT',
    subject_type: 'recipe',
    subject_id: input.recipe_id,
    subject_key: subjectKey,
    severity_label: severity,
    confidence_label: defaultConfidenceLabel(confidenceScore),
    confidence_score: confidenceScore,
    rule_version: context.ruleVersion,
    window_start: input.previous_snapshot.snapshot_at,
    window_end: input.current_snapshot.snapshot_at,
    observed_at: input.current_snapshot.snapshot_at,
    organization_id: context.scope.organizationId ?? null,
    location_id: context.scope.locationId ?? null,
    operation_unit_id: context.scope.operationUnitId ?? null,
    storage_area_id: context.scope.storageAreaId ?? null,
    inventory_category_id: null,
    inventory_item_id: null,
    recipe_id: input.recipe_id,
    vendor_id: null,
    vendor_item_id: null,
    magnitude_value: roundRatio(deltaPct),
    evidence_count: evidence.length,
    signal_payload: {
      recipe_id: input.recipe_id,
      recipe_version_id: input.recipe_version_id ?? null,
      recipe_name: input.current_snapshot.recipe_name,
      recipe_type: input.current_snapshot.recipe_type,
      current_snapshot_id: input.current_snapshot.id,
      prior_snapshot_id: input.previous_snapshot.id,
      current_total_cost: input.current_snapshot.total_cost,
      prior_total_cost: input.previous_snapshot.total_cost,
      delta_cost: deltaCost,
      delta_pct: deltaPct,
      comparison_window: {
        prior_snapshot_at: input.previous_snapshot.snapshot_at,
        current_snapshot_at: input.current_snapshot.snapshot_at,
      },
      trust_metadata: {
        current_completeness_status: input.current_snapshot.completeness_status,
        current_confidence_label: input.current_snapshot.confidence_label,
        prior_completeness_status: input.previous_snapshot.completeness_status,
        prior_confidence_label: input.previous_snapshot.confidence_label,
      },
      primary_driver_item_id: input.comparison.primary_driver_item_id,
      primary_driver_name: input.comparison.primary_driver_name,
      primary_driver_delta_cost: input.comparison.primary_driver_delta_cost,
      threshold_used: {
        recipe_cost_drift_pct_threshold: thresholds.recipe_cost_drift_pct_threshold,
        recipe_cost_drift_abs_threshold: thresholds.recipe_cost_drift_abs_threshold,
        minimum_prior_snapshot_age_days: thresholds.minimum_prior_snapshot_age_days,
        immediate_recipe_cost_drift_pct_threshold: thresholds.immediate_recipe_cost_drift_pct_threshold,
        immediate_recipe_cost_drift_abs_threshold: thresholds.immediate_recipe_cost_drift_abs_threshold,
      },
      threshold_explainability: isResolvedThresholdBundle(thresholdBundle)
        ? buildRecipeCostThresholdExplainabilityPayload(
            thresholdBundle,
            [
              'recipe_cost_drift_pct_threshold',
              'recipe_cost_drift_abs_threshold',
              'minimum_prior_snapshot_age_days',
              'immediate_recipe_cost_drift_pct_threshold',
              'immediate_recipe_cost_drift_abs_threshold',
            ],
          )
        : null,
      evidence,
    },
    evidence,
    last_confirmed_at: context.now,
    created_at: context.now,
    updated_at: context.now,
  };
}

export function evaluateIngredientDriverSignals(
  input: RecipeCostDriftSignalInput,
  context: IntelligenceJobContext,
  thresholdBundle: RecipeCostDriftThresholdRuleSet | ResolvedRecipeCostDriftThresholdBundle,
): DerivedSignal[] {
  const thresholds = extractThresholds(thresholdBundle);
  if (!canEvaluateRecipeCostDrift(input, thresholds)) {
    return [];
  }

  const totalDelta = input.comparison.total_cost_delta!;
  return input.comparison.ingredient_deltas
    .map((delta) => buildIngredientDriverSignal(input, delta, totalDelta, context, thresholds, thresholdBundle))
    .filter((signal): signal is DerivedSignal => signal !== null);
}

function buildIngredientDriverSignal(
  input: RecipeCostDriftSignalInput,
  ingredientDelta: RecipeCostIngredientDelta,
  totalDelta: number,
  context: IntelligenceJobContext,
  thresholds: RecipeCostDriftThresholdRuleSet,
  thresholdBundle: RecipeCostDriftThresholdRuleSet | ResolvedRecipeCostDriftThresholdBundle,
): DerivedSignal | null {
  if (
    ingredientDelta.delta_cost === null
    || ingredientDelta.current_cost === null
    || ingredientDelta.previous_cost === null
    || ingredientDelta.delta_cost <= 0
    || totalDelta <= 0
  ) {
    return null;
  }

  const contribution = ingredientDelta.delta_cost / totalDelta;
  if (
    ingredientDelta.delta_cost < thresholds.ingredient_driver_abs_threshold
    || contribution < thresholds.ingredient_driver_pct_of_total_delta_threshold
  ) {
    return null;
  }

  const evidenceDetail: RecipeCostDriverEvidence = {
    recipe_id: input.recipe_id,
    recipe_version_id: input.recipe_version_id ?? null,
    inventory_item_id: ingredientDelta.inventory_item_id,
    inventory_item_name: ingredientDelta.inventory_item_name,
    current_snapshot_id: input.current_snapshot.id,
    previous_snapshot_id: input.previous_snapshot.id,
    current_component_cost: ingredientDelta.current_cost,
    previous_component_cost: ingredientDelta.previous_cost,
    ingredient_delta_cost: ingredientDelta.delta_cost,
    ingredient_delta_pct: ingredientDelta.delta_pct,
    contribution_to_total_delta: roundRatio(contribution),
  };
  const evidence = buildIngredientDriverEvidence(input, evidenceDetail);
  const confidenceScore = resolveIngredientDriverConfidenceScore(ingredientDelta.delta_cost, contribution, thresholds);

  return {
    id: `INGREDIENT_COST_DRIVER:${buildRecipeSubjectKey(input.recipe_id, input.recipe_version_id ?? null)}:${ingredientDelta.inventory_item_id}:${input.current_snapshot.id}`,
    signal_type: 'INGREDIENT_COST_DRIVER',
    subject_type: 'recipe',
    subject_id: input.recipe_id,
    subject_key: `${buildRecipeSubjectKey(input.recipe_id, input.recipe_version_id ?? null)}:ingredient:${ingredientDelta.inventory_item_id}`,
    severity_label: resolveIngredientDriverSeverity(ingredientDelta.delta_cost, contribution),
    confidence_label: defaultConfidenceLabel(confidenceScore),
    confidence_score: confidenceScore,
    rule_version: context.ruleVersion,
    window_start: input.previous_snapshot.snapshot_at,
    window_end: input.current_snapshot.snapshot_at,
    observed_at: input.current_snapshot.snapshot_at,
    organization_id: context.scope.organizationId ?? null,
    location_id: context.scope.locationId ?? null,
    operation_unit_id: context.scope.operationUnitId ?? null,
    storage_area_id: context.scope.storageAreaId ?? null,
    inventory_category_id: null,
    inventory_item_id: ingredientDelta.inventory_item_id,
    recipe_id: input.recipe_id,
    vendor_id: null,
    vendor_item_id: null,
    magnitude_value: roundCurrency(ingredientDelta.delta_cost),
    evidence_count: evidence.length,
    signal_payload: {
      recipe_id: input.recipe_id,
      recipe_version_id: input.recipe_version_id ?? null,
      recipe_name: input.current_snapshot.recipe_name,
      inventory_item_id: ingredientDelta.inventory_item_id,
      ingredient_name: ingredientDelta.inventory_item_name,
      current_component_cost: ingredientDelta.current_cost,
      prior_component_cost: ingredientDelta.previous_cost,
      ingredient_delta_cost: ingredientDelta.delta_cost,
      ingredient_delta_pct: ingredientDelta.delta_pct,
      ingredient_contribution_to_total_delta: roundRatio(contribution),
      current_snapshot_id: input.current_snapshot.id,
      prior_snapshot_id: input.previous_snapshot.id,
      threshold_used: {
        ingredient_driver_abs_threshold: thresholds.ingredient_driver_abs_threshold,
        ingredient_driver_pct_of_total_delta_threshold: thresholds.ingredient_driver_pct_of_total_delta_threshold,
      },
      threshold_explainability: isResolvedThresholdBundle(thresholdBundle)
        ? buildRecipeCostThresholdExplainabilityPayload(
            thresholdBundle,
            [
              'ingredient_driver_abs_threshold',
              'ingredient_driver_pct_of_total_delta_threshold',
            ],
          )
        : null,
      evidence,
    },
    evidence,
    last_confirmed_at: context.now,
    created_at: context.now,
    updated_at: context.now,
  };
}

function canEvaluateRecipeCostDrift(
  input: RecipeCostDriftSignalInput,
  thresholds: RecipeCostDriftThresholdRuleSet,
): boolean {
  if (!isTrustedRecipeSnapshot(input.current_snapshot) || !isTrustedRecipeSnapshot(input.previous_snapshot)) {
    return false;
  }

  if (!input.comparison.comparable) {
    return false;
  }

  if (
    input.comparison.total_cost_delta === null
    || input.comparison.total_cost_delta_pct === null
    || input.comparison.previous_snapshot_id === null
  ) {
    return false;
  }

  if (input.comparison.total_cost_delta <= 0 || input.comparison.total_cost_delta_pct <= 0) {
    return false;
  }

  const priorAgeDays = differenceInDays(input.current_snapshot.snapshot_at, input.previous_snapshot.snapshot_at);
  if (priorAgeDays < thresholds.minimum_prior_snapshot_age_days) {
    return false;
  }

  return (
    input.comparison.total_cost_delta >= thresholds.recipe_cost_drift_abs_threshold
    && input.comparison.total_cost_delta_pct >= thresholds.recipe_cost_drift_pct_threshold
  );
}

function isTrustedRecipeSnapshot(snapshot: RecipeCostDriftSignalInput['current_snapshot']): boolean {
  return snapshot.completeness_status === 'complete' && snapshot.confidence_label === 'high';
}

function buildRecipeDriftEvidence(input: RecipeCostDriftSignalInput): EvidenceReference[] {
  return [
    {
      source_table: 'recipe_cost_snapshots',
      source_primary_key: String(input.previous_snapshot.id),
      source_type: 'recipe_cost_snapshot',
      observed_at: input.previous_snapshot.snapshot_at,
      payload: {
        recipe_id: input.recipe_id,
        recipe_version_id: input.recipe_version_id ?? null,
        total_cost: input.previous_snapshot.total_cost,
        completeness_status: input.previous_snapshot.completeness_status,
        confidence_label: input.previous_snapshot.confidence_label,
      },
    },
    {
      source_table: 'recipe_cost_snapshots',
      source_primary_key: String(input.current_snapshot.id),
      source_type: 'recipe_cost_snapshot',
      observed_at: input.current_snapshot.snapshot_at,
      payload: {
        recipe_id: input.recipe_id,
        recipe_version_id: input.recipe_version_id ?? null,
        total_cost: input.current_snapshot.total_cost,
        completeness_status: input.current_snapshot.completeness_status,
        confidence_label: input.current_snapshot.confidence_label,
      },
    },
  ];
}

function buildIngredientDriverEvidence(
  input: RecipeCostDriftSignalInput,
  detail: RecipeCostDriverEvidence,
): EvidenceReference[] {
  return [
    {
      source_table: 'recipe_cost_snapshots',
      source_primary_key: String(input.previous_snapshot.id),
      source_type: 'recipe_cost_snapshot',
      observed_at: input.previous_snapshot.snapshot_at,
      payload: {
        recipe_id: input.recipe_id,
        inventory_item_id: detail.inventory_item_id,
        component_cost: detail.previous_component_cost,
      },
    },
    {
      source_table: 'recipe_cost_snapshots',
      source_primary_key: String(input.current_snapshot.id),
      source_type: 'recipe_cost_snapshot',
      observed_at: input.current_snapshot.snapshot_at,
      payload: {
        recipe_id: input.recipe_id,
        inventory_item_id: detail.inventory_item_id,
        component_cost: detail.current_component_cost,
      },
    },
  ];
}

function buildRecipeSubjectKey(recipeId: number, recipeVersionId: number | null): string {
  return `recipe:${recipeId}:${recipeVersionId ?? 'legacy'}`;
}

function resolveRecipeDriftSeverity(
  deltaCost: number,
  deltaPct: number,
  thresholds: RecipeCostDriftThresholdRuleSet,
): SeverityLabel {
  if (
    deltaPct >= thresholds.immediate_recipe_cost_drift_pct_threshold
    || deltaCost >= thresholds.immediate_recipe_cost_drift_abs_threshold
  ) {
    return 'critical';
  }
  if (
    deltaPct >= thresholds.recipe_cost_drift_pct_threshold * 1.5
    || deltaCost >= thresholds.recipe_cost_drift_abs_threshold * 1.5
  ) {
    return 'high';
  }
  return 'medium';
}

function resolveIngredientDriverSeverity(deltaCost: number, contribution: number): SeverityLabel {
  if (contribution >= 0.6 || deltaCost >= 1.5) {
    return 'high';
  }
  return 'medium';
}

function resolveRecipeDriftConfidenceScore(
  deltaCost: number,
  deltaPct: number,
  thresholds: RecipeCostDriftThresholdRuleSet,
): number {
  const pctStrength = Math.min(deltaPct / thresholds.recipe_cost_drift_pct_threshold, 3);
  const absStrength = Math.min(deltaCost / thresholds.recipe_cost_drift_abs_threshold, 3);
  return Math.min(0.55 + ((pctStrength + absStrength) / 6) * 0.35, 0.95);
}

function resolveIngredientDriverConfidenceScore(
  deltaCost: number,
  contribution: number,
  thresholds: RecipeCostDriftThresholdRuleSet,
): number {
  const deltaStrength = Math.min(deltaCost / thresholds.ingredient_driver_abs_threshold, 3);
  const contributionStrength = Math.min(contribution / thresholds.ingredient_driver_pct_of_total_delta_threshold, 3);
  return Math.min(0.5 + ((deltaStrength + contributionStrength) / 6) * 0.4, 0.95);
}

function incrementSignalCounters(
  counters: IntelligenceRunCounters,
  summary: RecipeCostDriftRunSummary,
  action: 'created' | 'updated',
): void {
  if (action === 'created') {
    counters.signals_created += 1;
    summary.signals_created += 1;
  } else {
    counters.signals_updated += 1;
    summary.signals_updated += 1;
  }
}

function differenceInDays(currentDate: string, previousDate: string): number {
  const current = new Date(currentDate).getTime();
  const previous = new Date(previousDate).getTime();
  return (current - previous) / (1000 * 60 * 60 * 24);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function extractThresholds(
  thresholdBundle: RecipeCostDriftThresholdRuleSet | ResolvedRecipeCostDriftThresholdBundle,
): RecipeCostDriftThresholdRuleSet {
  return isResolvedThresholdBundle(thresholdBundle) ? thresholdBundle.thresholds : thresholdBundle;
}

function isResolvedThresholdBundle(
  input: RecipeCostDriftThresholdRuleSet | ResolvedRecipeCostDriftThresholdBundle,
): input is ResolvedRecipeCostDriftThresholdBundle {
  return 'thresholds' in input && 'metadata' in input;
}
