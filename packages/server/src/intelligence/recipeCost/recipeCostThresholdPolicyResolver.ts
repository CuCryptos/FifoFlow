import type { RecipeCostDriftThresholdConfig, RecipeCostDriftThresholdRuleSet } from '@fifoflow/shared';
import { resolvePolicy, type PolicyRepository, type PolicyResolutionPathStep, type SubjectScopeContext } from '../../platform/policy/index.js';
import type { IntelligenceJobContext } from '../types.js';
import {
  DEFAULT_RECIPE_COST_DRIFT_THRESHOLD_CONFIG,
  RECIPE_COST_DRIFT_POLICY_KEYS,
  resolveFallbackRecipeCostDriftThresholds,
} from './recipeCostThresholds.js';

export interface RecipeCostDriftThresholdPolicySubject {
  recipe_id: number;
  recipe_name: string;
  recipe_type: string | null;
  recipe_version_id?: number | null;
  recipe_group_id?: number | null;
}

export interface RecipeCostDriftThresholdResolutionMetadataEntry {
  threshold_field: keyof RecipeCostDriftThresholdRuleSet;
  policy_key: string;
  value: number;
  source: 'policy' | 'fallback_default';
  matched_scope_type: string | null;
  matched_scope_ref_id: number | string | null;
  matched_scope_ref_key: string | null;
  policy_version_id: number | string | null;
  explanation_text: string;
  resolution_path: PolicyResolutionPathStep[];
}

export interface ResolvedRecipeCostDriftThresholdBundle {
  thresholds: RecipeCostDriftThresholdRuleSet;
  subject_scope: SubjectScopeContext;
  metadata: Record<keyof RecipeCostDriftThresholdRuleSet, RecipeCostDriftThresholdResolutionMetadataEntry>;
  fallback_used: boolean;
  explanation_text: string;
}

type ThresholdField = keyof RecipeCostDriftThresholdRuleSet;

interface PolicyKeyBinding {
  field: ThresholdField;
  policy_key: string;
}

const RECIPE_COST_DRIFT_THRESHOLD_BINDINGS: PolicyKeyBinding[] = [
  {
    field: 'recipe_cost_drift_pct_threshold',
    policy_key: RECIPE_COST_DRIFT_POLICY_KEYS.recipe_cost_drift_pct_threshold,
  },
  {
    field: 'recipe_cost_drift_abs_threshold',
    policy_key: RECIPE_COST_DRIFT_POLICY_KEYS.recipe_cost_drift_abs_threshold,
  },
  {
    field: 'ingredient_driver_abs_threshold',
    policy_key: RECIPE_COST_DRIFT_POLICY_KEYS.ingredient_driver_abs_threshold,
  },
  {
    field: 'ingredient_driver_pct_of_total_delta_threshold',
    policy_key: RECIPE_COST_DRIFT_POLICY_KEYS.ingredient_driver_pct_of_total_delta_threshold,
  },
  {
    field: 'minimum_prior_snapshot_age_days',
    policy_key: RECIPE_COST_DRIFT_POLICY_KEYS.minimum_prior_snapshot_age_days,
  },
  {
    field: 'repeat_suppression_days',
    policy_key: RECIPE_COST_DRIFT_POLICY_KEYS.repeat_suppression_days,
  },
  {
    field: 'immediate_recipe_cost_drift_pct_threshold',
    policy_key: RECIPE_COST_DRIFT_POLICY_KEYS.immediate_recipe_cost_drift_pct_threshold,
  },
  {
    field: 'immediate_recipe_cost_drift_abs_threshold',
    policy_key: RECIPE_COST_DRIFT_POLICY_KEYS.immediate_recipe_cost_drift_abs_threshold,
  },
];

export async function resolveRecipeCostDriftThresholdPolicyBundle(
  input: {
    subject: RecipeCostDriftThresholdPolicySubject;
    context: IntelligenceJobContext;
    policyRepository?: PolicyRepository;
    fallbackConfig?: RecipeCostDriftThresholdConfig;
  },
): Promise<ResolvedRecipeCostDriftThresholdBundle> {
  const fallbackThresholds = resolveFallbackRecipeCostDriftThresholds(
    input.subject.recipe_type,
    input.fallbackConfig ?? DEFAULT_RECIPE_COST_DRIFT_THRESHOLD_CONFIG,
  );
  const subjectScope = buildRecipeCostDriftPolicyScope(input.subject, input.context);
  const metadataEntries = await Promise.all(
    RECIPE_COST_DRIFT_THRESHOLD_BINDINGS.map((binding) => resolveThresholdBinding(
      binding,
      subjectScope,
      input.context.now,
      fallbackThresholds,
      input.policyRepository,
    )),
  );

  const thresholds = metadataEntries.reduce((accumulator, entry) => {
    accumulator[entry.threshold_field] = entry.value;
    return accumulator;
  }, { ...fallbackThresholds } as RecipeCostDriftThresholdRuleSet);

  const metadata = metadataEntries.reduce((accumulator, entry) => {
    accumulator[entry.threshold_field] = entry;
    return accumulator;
  }, {} as Record<keyof RecipeCostDriftThresholdRuleSet, RecipeCostDriftThresholdResolutionMetadataEntry>);

  const fallbackUsed = metadataEntries.some((entry) => entry.source === 'fallback_default');

  return {
    thresholds,
    subject_scope: subjectScope,
    metadata,
    fallback_used: fallbackUsed,
    explanation_text: fallbackUsed
      ? `Recipe cost drift thresholds for ${input.subject.recipe_name} used scoped policy resolution where available and explicit fallback defaults for unresolved keys.`
      : `Recipe cost drift thresholds for ${input.subject.recipe_name} resolved fully from scoped policy.`,
  };
}

export function buildRecipeCostDriftPolicyScope(
  subject: RecipeCostDriftThresholdPolicySubject,
  context: IntelligenceJobContext,
): SubjectScopeContext {
  return {
    organization_id: context.scope.organizationId ?? null,
    location_id: context.scope.locationId ?? null,
    operation_unit_id: context.scope.operationUnitId ?? null,
    storage_area_id: context.scope.storageAreaId ?? null,
    recipe_group_id: subject.recipe_group_id ?? null,
    recipe_group_key: subject.recipe_type ?? null,
    subject_entity_type: 'recipe',
    subject_entity_id: subject.recipe_id,
  };
}

export function buildRecipeCostThresholdExplainabilityPayload(
  bundle: ResolvedRecipeCostDriftThresholdBundle,
  fields?: ThresholdField[],
): {
  fallback_used: boolean;
  explanation_text: string;
  subject_scope: SubjectScopeContext;
  resolved_thresholds: Array<{
    threshold_field: ThresholdField;
    policy_key: string;
    value: number;
    source: 'policy' | 'fallback_default';
    matched_scope_type: string | null;
    matched_scope_ref_id: number | string | null;
    matched_scope_ref_key: string | null;
    policy_version_id: number | string | null;
    explanation_text: string;
  }>;
} {
  const selectedFields = fields ?? RECIPE_COST_DRIFT_THRESHOLD_BINDINGS.map((binding) => binding.field);
  const selectedEntries = selectedFields.map((field) => bundle.metadata[field]);
  return {
    fallback_used: selectedEntries.some((entry) => entry.source === 'fallback_default'),
    explanation_text: bundle.explanation_text,
    subject_scope: bundle.subject_scope,
    resolved_thresholds: selectedFields.map((field) => {
      const entry = bundle.metadata[field];
      return {
        threshold_field: field,
        policy_key: entry.policy_key,
        value: entry.value,
        source: entry.source,
        matched_scope_type: entry.matched_scope_type,
        matched_scope_ref_id: entry.matched_scope_ref_id,
        matched_scope_ref_key: entry.matched_scope_ref_key,
        policy_version_id: entry.policy_version_id,
        explanation_text: entry.explanation_text,
      };
    }),
  };
}

async function resolveThresholdBinding(
  binding: PolicyKeyBinding,
  subjectScope: SubjectScopeContext,
  effectiveAt: string,
  fallbackThresholds: RecipeCostDriftThresholdRuleSet,
  policyRepository?: PolicyRepository,
): Promise<RecipeCostDriftThresholdResolutionMetadataEntry> {
  const fallbackValue = fallbackThresholds[binding.field];
  if (!policyRepository) {
    return buildFallbackEntry(binding, fallbackValue, 'Scoped policy repository was not supplied to Recipe Cost Drift.');
  }

  const result = await resolvePolicy({
    policy_key: binding.policy_key,
    subject_scope: subjectScope,
    effective_at: effectiveAt,
  }, policyRepository);

  const resolvedNumber = normalizeNumber(result.resolved_value);
  if (!result.found || resolvedNumber == null) {
    const explanation = !result.found
      ? `No active policy matched ${binding.policy_key}.`
      : `Resolved policy ${binding.policy_key} was not a numeric value.`;
    return buildFallbackEntry(binding, fallbackValue, explanation, result.resolution_path);
  }

  return {
    threshold_field: binding.field,
    policy_key: binding.policy_key,
    value: resolvedNumber,
    source: 'policy',
    matched_scope_type: result.matched_scope.scope_type,
    matched_scope_ref_id: result.matched_scope.scope_ref_id,
    matched_scope_ref_key: result.matched_scope.scope_ref_key,
    policy_version_id: result.policy_version_id,
    explanation_text: result.explanation_text,
    resolution_path: result.resolution_path,
  };
}

function buildFallbackEntry(
  binding: PolicyKeyBinding,
  fallbackValue: number,
  explanation: string,
  resolutionPath?: PolicyResolutionPathStep[],
): RecipeCostDriftThresholdResolutionMetadataEntry {
  return {
    threshold_field: binding.field,
    policy_key: binding.policy_key,
    value: fallbackValue,
    source: 'fallback_default',
    matched_scope_type: 'fallback_default',
    matched_scope_ref_id: null,
    matched_scope_ref_key: null,
    policy_version_id: null,
    explanation_text: `${explanation} Falling back to the explicit default threshold bundle.`,
    resolution_path: resolutionPath ?? [],
  };
}

function normalizeNumber(input: unknown): number | null {
  return typeof input === 'number' && Number.isFinite(input) ? input : null;
}
