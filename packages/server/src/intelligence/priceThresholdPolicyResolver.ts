import type { PriceThresholdConfig, PriceThresholdRuleSet } from '@fifoflow/shared';
import { resolvePolicy, type PolicyRepository, type PolicyResolutionPathStep, type SubjectScopeContext } from '../platform/policy/index.js';
import type { IntelligenceJobContext } from './types.js';
import {
  DEFAULT_PRICE_THRESHOLD_CONFIG,
  PRICE_THRESHOLD_POLICY_KEYS,
  resolveFallbackPriceThresholds,
} from './priceThresholds.js';

export interface PriceThresholdPolicySubject {
  inventory_item_id: number;
  inventory_item_name: string;
  inventory_category: string | null;
}

export interface PriceThresholdResolutionMetadataEntry {
  threshold_field: keyof PriceThresholdRuleSet;
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

export interface ResolvedPriceThresholdBundle {
  thresholds: PriceThresholdRuleSet;
  subject_scope: SubjectScopeContext;
  metadata: Record<keyof PriceThresholdRuleSet, PriceThresholdResolutionMetadataEntry>;
  fallback_used: boolean;
  explanation_text: string;
}

type ThresholdField = keyof PriceThresholdRuleSet;

interface PolicyKeyBinding {
  field: ThresholdField;
  policy_key: string;
}

const PRICE_THRESHOLD_BINDINGS: PolicyKeyBinding[] = [
  { field: 'percent_increase_threshold', policy_key: PRICE_THRESHOLD_POLICY_KEYS.percent_increase_threshold },
  { field: 'percent_drop_threshold', policy_key: PRICE_THRESHOLD_POLICY_KEYS.percent_drop_threshold },
  { field: 'volatility_threshold', policy_key: PRICE_THRESHOLD_POLICY_KEYS.volatility_threshold },
  { field: 'minimum_evidence_count', policy_key: PRICE_THRESHOLD_POLICY_KEYS.minimum_evidence_count },
  { field: 'recurrence_window_days', policy_key: PRICE_THRESHOLD_POLICY_KEYS.recurrence_window_days },
  { field: 'pattern_signal_threshold', policy_key: PRICE_THRESHOLD_POLICY_KEYS.pattern_signal_threshold },
  { field: 'immediate_pct_threshold', policy_key: PRICE_THRESHOLD_POLICY_KEYS.immediate_pct_threshold },
  { field: 'immediate_abs_threshold', policy_key: PRICE_THRESHOLD_POLICY_KEYS.immediate_abs_threshold },
  { field: 'immediate_volatility_threshold', policy_key: PRICE_THRESHOLD_POLICY_KEYS.immediate_volatility_threshold },
];

export async function resolvePriceThresholdPolicyBundle(
  input: {
    subject: PriceThresholdPolicySubject;
    context: IntelligenceJobContext;
    policyRepository?: PolicyRepository;
    fallbackConfig?: PriceThresholdConfig;
  },
): Promise<ResolvedPriceThresholdBundle> {
  const fallbackThresholds = resolveFallbackPriceThresholds(
    input.subject.inventory_category,
    input.fallbackConfig ?? DEFAULT_PRICE_THRESHOLD_CONFIG,
  );
  const subjectScope = buildPriceThresholdPolicyScope(input.subject, input.context);
  const metadataEntries = await Promise.all(
    PRICE_THRESHOLD_BINDINGS.map((binding) => resolveThresholdBinding(binding, subjectScope, input.context.now, fallbackThresholds, input.policyRepository)),
  );

  const thresholds = metadataEntries.reduce((accumulator, entry) => {
    accumulator[entry.threshold_field] = entry.value;
    return accumulator;
  }, { ...fallbackThresholds } as PriceThresholdRuleSet);

  const metadata = metadataEntries.reduce((accumulator, entry) => {
    accumulator[entry.threshold_field] = entry;
    return accumulator;
  }, {} as Record<keyof PriceThresholdRuleSet, PriceThresholdResolutionMetadataEntry>);

  const fallbackUsed = metadataEntries.some((entry) => entry.source === 'fallback_default');

  return {
    thresholds,
    subject_scope: subjectScope,
    metadata,
    fallback_used: fallbackUsed,
    explanation_text: fallbackUsed
      ? `Price thresholds for ${input.subject.inventory_item_name} used scoped policy resolution where available and explicit fallback defaults for unresolved keys.`
      : `Price thresholds for ${input.subject.inventory_item_name} resolved fully from scoped policy.`,
  };
}

export function buildPriceThresholdPolicyScope(
  subject: PriceThresholdPolicySubject,
  context: IntelligenceJobContext,
): SubjectScopeContext {
  return {
    organization_id: context.scope.organizationId ?? null,
    location_id: context.scope.locationId ?? null,
    operation_unit_id: context.scope.operationUnitId ?? null,
    storage_area_id: context.scope.storageAreaId ?? null,
    inventory_category_id: context.scope.inventoryCategoryId ?? null,
    inventory_category_key: subject.inventory_category ?? null,
    subject_entity_type: 'inventory_item',
    subject_entity_id: subject.inventory_item_id,
  };
}

export function buildThresholdExplainabilityPayload(
  bundle: ResolvedPriceThresholdBundle,
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
  const selectedFields = fields ?? PRICE_THRESHOLD_BINDINGS.map((binding) => binding.field);
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
  fallbackThresholds: PriceThresholdRuleSet,
  policyRepository?: PolicyRepository,
): Promise<PriceThresholdResolutionMetadataEntry> {
  const fallbackValue = fallbackThresholds[binding.field];
  if (!policyRepository) {
    return buildFallbackEntry(binding, fallbackValue, subjectScope, 'Scoped policy repository was not supplied to Price Intelligence.');
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
    return buildFallbackEntry(binding, fallbackValue, subjectScope, explanation, result.resolution_path);
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
  subjectScope: SubjectScopeContext,
  explanation: string,
  resolutionPath?: PolicyResolutionPathStep[],
): PriceThresholdResolutionMetadataEntry {
  return {
    threshold_field: binding.field,
    policy_key: binding.policy_key,
    value: fallbackValue,
    source: 'fallback_default',
    matched_scope_type: subjectScope.inventory_category_key != null ? 'fallback_default' : null,
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
