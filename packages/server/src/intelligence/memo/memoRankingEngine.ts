import type { DerivedSignal, UrgencyLabel } from '@fifoflow/shared';
import type { MemoCandidateItem, MemoOwner, MemoRankingExplanation, MemoScopeSummary, MemoSectionKey } from './types.js';

const SEVERITY_SCORE: Record<DerivedSignal['severity_label'], number> = {
  critical: 100,
  high: 70,
  medium: 40,
  low: 15,
};

const URGENCY_SCORE: Record<UrgencyLabel, number> = {
  IMMEDIATE: 30,
  THIS_WEEK: 18,
  MONITOR: 8,
};

const CONFIDENCE_SCORE: Record<DerivedSignal['confidence_label'], number> = {
  'Stable pattern': 18,
  'Emerging pattern': 11,
  'Early signal': 5,
};

export function rankMemoSignals(signals: DerivedSignal[], now: string): MemoCandidateItem[] {
  return signals
    .map((signal) => buildMemoCandidate(signal, now))
    .sort((left, right) => compareMemoCandidates(left, right));
}

export function buildMemoCandidate(signal: DerivedSignal, now: string): MemoCandidateItem {
  const urgency = deriveUrgency(signal);
  const policyFallbackUsed = detectPolicyFallback(signal);
  const rankingExplanation = buildRankingExplanation(signal, urgency, policyFallbackUsed, now);

  return {
    source_signal: signal,
    source_signal_id: signal.id,
    signal_type: signal.signal_type,
    title: buildMemoTitle(signal),
    subject_label: buildSubjectLabel(signal),
    severity: signal.severity_label,
    urgency,
    confidence: signal.confidence_label,
    likely_owner: routeMemoOwner(signal, urgency),
    scope_summary: buildScopeSummary(signal),
    short_explanation: buildShortExplanation(signal, policyFallbackUsed),
    ranking_explanation: rankingExplanation,
    evidence_references: signal.evidence,
    policy_fallback_used: policyFallbackUsed,
    section_keys: determineSectionKeys(signal, policyFallbackUsed),
    observed_at: signal.observed_at,
  };
}

export function routeMemoOwner(signal: DerivedSignal, urgency: UrgencyLabel): MemoOwner {
  if (signal.severity_label === 'critical' || urgency === 'IMMEDIATE') {
    if (signal.signal_type === 'PRICE_INCREASE' || signal.signal_type === 'PRICE_DROP' || signal.signal_type === 'PRICE_VOLATILITY') {
      return 'Executive Approver';
    }
    if (signal.signal_type === 'RECIPE_COST_DRIFT' || signal.signal_type === 'INGREDIENT_COST_DRIVER') {
      return 'Executive Approver';
    }
  }

  switch (signal.signal_type) {
    case 'PRICE_INCREASE':
    case 'PRICE_DROP':
    case 'PRICE_VOLATILITY':
      return 'Purchasing Owner';
    case 'RECIPE_COST_DRIFT':
    case 'INGREDIENT_COST_DRIVER':
      return signal.severity_label === 'high' ? 'Executive Approver' : 'Unit Manager';
    case 'COUNT_VARIANCE':
    case 'COUNT_INCONSISTENCY':
    default:
      return signal.signal_type === 'COUNT_INCONSISTENCY' && signal.severity_label === 'high'
        ? 'Executive Approver'
        : 'Unit Manager';
  }
}

function buildRankingExplanation(
  signal: DerivedSignal,
  urgency: UrgencyLabel,
  policyFallbackUsed: boolean,
  now: string,
): MemoRankingExplanation {
  const recurrence = resolveRecurrenceScore(signal);
  const freshness = resolveFreshnessScore(signal.observed_at, now);
  const impact = resolveImpactScore(signal);
  const evidence = resolveEvidenceScore(signal);
  const fallbackPenalty = policyFallbackUsed ? -6 : 0;
  const components = {
    severity: SEVERITY_SCORE[signal.severity_label],
    urgency: URGENCY_SCORE[urgency],
    confidence: CONFIDENCE_SCORE[signal.confidence_label],
    recurrence,
    freshness,
    impact,
    evidence,
    fallback_penalty: fallbackPenalty,
  };
  const totalScore = Object.values(components).reduce((sum, value) => sum + value, 0);

  const factors = [
    `severity=${signal.severity_label}`,
    `urgency=${urgency}`,
    `confidence=${signal.confidence_label}`,
    `recurrence_score=${recurrence}`,
    `freshness_score=${freshness}`,
    `impact_score=${impact}`,
    `evidence_score=${evidence}`,
  ];
  if (policyFallbackUsed) {
    factors.push('policy_fallback_used');
  }

  return {
    total_score: totalScore,
    components,
    factors,
  };
}

function deriveUrgency(signal: DerivedSignal): UrgencyLabel {
  if (signal.severity_label === 'critical') {
    return 'IMMEDIATE';
  }
  if (signal.severity_label === 'high') {
    return 'THIS_WEEK';
  }
  if (signal.signal_type === 'COUNT_INCONSISTENCY' || signal.signal_type === 'PRICE_VOLATILITY') {
    return 'THIS_WEEK';
  }
  return 'MONITOR';
}

function detectPolicyFallback(signal: DerivedSignal): boolean {
  const explainability = signal.signal_payload['threshold_explainability'];
  if (typeof explainability !== 'object' || explainability === null) {
    return false;
  }
  return Boolean((explainability as { fallback_used?: boolean }).fallback_used);
}

function determineSectionKeys(signal: DerivedSignal, policyFallbackUsed: boolean): MemoSectionKey[] {
  const keys = new Set<MemoSectionKey>();

  if (signal.signal_type === 'PRICE_INCREASE' || signal.signal_type === 'PRICE_DROP' || signal.signal_type === 'PRICE_VOLATILITY') {
    keys.add('price_watch');
  } else if (signal.signal_type === 'RECIPE_COST_DRIFT' || signal.signal_type === 'INGREDIENT_COST_DRIVER') {
    keys.add('recipe_cost_watch');
  } else if (signal.signal_type === 'COUNT_VARIANCE' || signal.signal_type === 'COUNT_INCONSISTENCY') {
    keys.add('inventory_discipline');
  }

  if (policyFallbackUsed || signal.confidence_label === 'Early signal' || (signal.evidence_count ?? signal.evidence.length) < 2) {
    keys.add('needs_review');
  }

  return [...keys];
}

function buildMemoTitle(signal: DerivedSignal): string {
  switch (signal.signal_type) {
    case 'PRICE_INCREASE':
      return 'Price increase detected';
    case 'PRICE_DROP':
      return 'Price drop detected';
    case 'PRICE_VOLATILITY':
      return 'Unstable vendor pricing';
    case 'RECIPE_COST_DRIFT':
      return 'Recipe cost moved materially';
    case 'INGREDIENT_COST_DRIVER':
      return 'Ingredient is driving recipe cost change';
    case 'COUNT_VARIANCE':
      return 'Count variance detected';
    case 'COUNT_INCONSISTENCY':
      return 'Repeated count inconsistency detected';
    default:
      return signal.signal_type;
  }
}

function buildSubjectLabel(signal: DerivedSignal): string {
  if (typeof signal.signal_payload['inventory_item_name'] === 'string') {
    return signal.signal_payload['inventory_item_name'] as string;
  }
  if (typeof signal.signal_payload['recipe_name'] === 'string') {
    return signal.signal_payload['recipe_name'] as string;
  }
  if (typeof signal.signal_payload['vendor_name'] === 'string') {
    return signal.signal_payload['vendor_name'] as string;
  }
  return signal.subject_key ?? `${signal.subject_type}:${signal.subject_id}`;
}

function buildShortExplanation(signal: DerivedSignal, policyFallbackUsed: boolean): string {
  const base = (() => {
    switch (signal.signal_type) {
      case 'PRICE_INCREASE':
      case 'PRICE_DROP':
        return `${buildSubjectLabel(signal)} changed price materially in the current memo window.`;
      case 'PRICE_VOLATILITY':
        return `${buildSubjectLabel(signal)} showed repeated price movement across recent observations.`;
      case 'RECIPE_COST_DRIFT':
        return `${buildSubjectLabel(signal)} moved materially versus the prior trusted comparable snapshot.`;
      case 'INGREDIENT_COST_DRIVER':
        return `${buildSubjectLabel(signal)} materially contributed to recipe cost drift.`;
      case 'COUNT_VARIANCE':
        return `${buildSubjectLabel(signal)} counted away from expected quantity.`;
      case 'COUNT_INCONSISTENCY':
        return `${buildSubjectLabel(signal)} has repeated count variance inside the recurrence window.`;
      default:
        return `${buildSubjectLabel(signal)} generated a live intelligence signal.`;
    }
  })();

  return policyFallbackUsed ? `${base} Threshold fallback defaults were used.` : base;
}

function buildScopeSummary(signal: DerivedSignal): MemoScopeSummary {
  return {
    organization_id: signal.organization_id,
    location_id: signal.location_id,
    operation_unit_id: signal.operation_unit_id,
    storage_area_id: signal.storage_area_id,
    inventory_category_id: signal.inventory_category_id,
    inventory_item_id: signal.inventory_item_id,
    recipe_id: signal.recipe_id,
    vendor_id: signal.vendor_id,
  };
}

function resolveRecurrenceScore(signal: DerivedSignal): number {
  const recurrence = numberOrZero(
    signal.signal_payload['recurrence_count']
      ?? signal.signal_payload['observation_count']
      ?? signal.signal_payload['evidence_count_hint'],
  );
  return Math.min(recurrence * 4, 16);
}

function resolveFreshnessScore(observedAt: string, now: string): number {
  const ageDays = (new Date(now).getTime() - new Date(observedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 2) {
    return 12;
  }
  if (ageDays <= 7) {
    return 8;
  }
  return 3;
}

function resolveImpactScore(signal: DerivedSignal): number {
  const directHints = [
    signal.signal_payload['delta_cost'],
    signal.signal_payload['ingredient_delta_cost'],
    signal.signal_payload['variance_cost_abs'],
    signal.signal_payload['normalized_price_change_abs'],
    signal.signal_payload['primary_driver_delta_cost'],
  ];
  const firstNumeric = directHints.find((value) => typeof value === 'number' && Number.isFinite(value)) as number | undefined;
  if (firstNumeric == null) {
    return 0;
  }
  if (Math.abs(firstNumeric) >= 50) {
    return 20;
  }
  if (Math.abs(firstNumeric) >= 10) {
    return 12;
  }
  if (Math.abs(firstNumeric) >= 2) {
    return 6;
  }
  return 2;
}

function resolveEvidenceScore(signal: DerivedSignal): number {
  const evidenceCount = signal.evidence_count ?? signal.evidence.length;
  return Math.min(evidenceCount * 2, 10);
}

function compareMemoCandidates(left: MemoCandidateItem, right: MemoCandidateItem): number {
  if (right.ranking_explanation.total_score !== left.ranking_explanation.total_score) {
    return right.ranking_explanation.total_score - left.ranking_explanation.total_score;
  }
  if (SEVERITY_SCORE[right.severity] !== SEVERITY_SCORE[left.severity]) {
    return SEVERITY_SCORE[right.severity] - SEVERITY_SCORE[left.severity];
  }
  const observedDelta = new Date(right.observed_at).getTime() - new Date(left.observed_at).getTime();
  if (observedDelta !== 0) {
    return observedDelta;
  }
  return String(left.source_signal_id).localeCompare(String(right.source_signal_id));
}

function numberOrZero(input: unknown): number {
  return typeof input === 'number' && Number.isFinite(input) ? input : 0;
}
