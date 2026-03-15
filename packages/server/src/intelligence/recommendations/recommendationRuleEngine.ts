import type { DerivedSignal, Recommendation, RecommendationEvidence, RecommendationType, UrgencyLabel } from '@fifoflow/shared';
import type { IntelligenceJobContext } from '../types.js';
import type { IntelligencePersistenceRepository, IntelligenceRunCounters } from '../persistence/types.js';
import type {
  RecommendationRuleDefinition,
  RecommendationRuleInput,
  RecommendationRuleResult,
  RecommendationSynthesisExecutionResult,
  RecommendationSynthesisRunSummary,
  RecommendationSignalReadRepository,
  SynthesizedRecommendationCandidate,
} from './types.js';

export interface RecommendationSynthesisDependencies {
  source: RecommendationSignalReadRepository;
  repository: IntelligencePersistenceRepository;
}

const LIVE_RECOMMENDATION_SIGNAL_TYPES: DerivedSignal['signal_type'][] = [
  'PRICE_INCREASE',
  'PRICE_VOLATILITY',
  'RECIPE_COST_DRIFT',
  'INGREDIENT_COST_DRIVER',
  'COUNT_VARIANCE',
  'COUNT_INCONSISTENCY',
];

export async function executeRecommendationSynthesis(
  context: IntelligenceJobContext,
  dependencies: RecommendationSynthesisDependencies,
): Promise<RecommendationSynthesisExecutionResult> {
  const run = await dependencies.repository.startRun('recommendation-synthesis-job', context.now);
  const signals = await dependencies.source.listSignalsForRecommendationWindow(context.window, LIVE_RECOMMENDATION_SIGNAL_TYPES);
  const counters: IntelligenceRunCounters = {
    signals_created: 0,
    signals_updated: 0,
    patterns_created: 0,
    patterns_updated: 0,
    recommendations_created: 0,
    recommendations_updated: 0,
    recommendations_superseded: 0,
  };
  const notes: string[] = [];
  const recommendationMap = new Map<string, Recommendation>();
  const summary: RecommendationSynthesisRunSummary = {
    signals_considered: signals.length,
    recommendations_created: 0,
    recommendations_updated: 0,
    recommendations_superseded: 0,
    candidates_skipped: 0,
  };

  try {
    await dependencies.repository.withTransaction(async () => {
      for (const signal of signals) {
        const matches = evaluateRecommendationRules({ signal, now: context.now });
        if (matches.length === 0) {
          summary.candidates_skipped += 1;
          continue;
        }

        for (const match of matches) {
          const upserted = await dependencies.repository.upsertRecommendation(match.recommendation);
          if (upserted.action === 'created') {
            counters.recommendations_created += 1;
            summary.recommendations_created += 1;
          } else {
            counters.recommendations_updated += 1;
            summary.recommendations_updated += 1;
          }
          if (upserted.superseded_recommendation_id != null) {
            counters.recommendations_superseded += 1;
            summary.recommendations_superseded += 1;
          }

          const attachedEvidence = match.evidence.map((evidence) => ({
            ...evidence,
            recommendation_id: upserted.record.id,
          }));
          await dependencies.repository.attachRecommendationEvidence(attachedEvidence);
          const refreshed = await dependencies.repository.fetchActiveRecommendationsBySubject({
            subject_type: upserted.record.subject_type,
            subject_key: upserted.record.subject_key ?? '',
            recommendation_type: upserted.record.recommendation_type,
          });
          const activeRecord = refreshed.find((entry) => entry.id === upserted.record.id) ?? upserted.record;
          recommendationMap.set(
            `${activeRecord.recommendation_type}:${activeRecord.subject_key ?? `${activeRecord.subject_type}:${activeRecord.subject_id}`}`,
            activeRecord,
          );
        }
      }
    });

    const recommendations = Array.from(recommendationMap.values())
      .sort((left, right) => {
        const updatedCompare = Date.parse(right.updated_at ?? right.opened_at) - Date.parse(left.updated_at ?? left.opened_at);
        if (updatedCompare !== 0) {
          return updatedCompare;
        }
        return String(right.id).localeCompare(String(left.id));
      });

    if (recommendations.length === 0) {
      notes.push('No persisted live signals met the current recommendation synthesis rules.');
    }

    const completedRun = await dependencies.repository.completeRun(run.id, 'completed', counters, context.now);
    return {
      recommendations,
      run: completedRun,
      run_summary: counters,
      recommendation_synthesis_summary: summary,
      notes,
    };
  } catch (error) {
    await dependencies.repository.completeRun(run.id, 'failed', counters, context.now);
    throw error;
  }
}

export function evaluateRecommendationRules(input: RecommendationRuleInput): SynthesizedRecommendationCandidate[] {
  return RECOMMENDATION_RULES
    .map((rule) => rule.evaluate(input))
    .filter((result): result is RecommendationRuleResult & { matched: true; candidate: SynthesizedRecommendationCandidate } => Boolean(result?.matched && result.candidate))
    .map((result) => result.candidate);
}

const RECOMMENDATION_RULES: RecommendationRuleDefinition[] = [
  {
    recommendation_type: 'REVIEW_VENDOR',
    description: 'Escalate material price increase or volatility into a vendor review action.',
    evaluate: ({ signal, now }) => {
      if (signal.signal_type !== 'PRICE_INCREASE' && signal.signal_type !== 'PRICE_VOLATILITY') {
        return null;
      }
      if (signal.signal_type === 'PRICE_INCREASE' && !['high', 'critical'].includes(signal.severity_label)) {
        return { matched: false, reason: 'Price increase was not severe enough for vendor review.' };
      }
      if (signal.signal_type === 'PRICE_VOLATILITY') {
        const recurrence = numberHint(signal.signal_payload['observation_count']);
        if (signal.severity_label === 'low' || recurrence < 3) {
          return { matched: false, reason: 'Volatility signal did not have enough recurrence or severity.' };
        }
      }

      const vendorName = stringHint(signal.signal_payload['vendor_name']) ?? 'current vendor';
      const itemName = buildSubjectLabel(signal);
      const volatilityPct = numberHint(signal.signal_payload['volatility_pct_range']);
      const priceAbs = numberHint(signal.signal_payload['normalized_price_change_abs']);
      const recurrenceCount = numberHint(signal.signal_payload['observation_count']);
      const summary = signal.signal_type === 'PRICE_VOLATILITY'
        ? `Review ${vendorName} pricing for ${itemName}. Unit cost volatility repeated ${recurrenceCount || 0} times and reached ${formatPct(volatilityPct)} across the recent pricing window.`
        : `Review ${vendorName} pricing for ${itemName}. Recent unit cost moved by ${formatCurrency(priceAbs)} and breached the live price threshold.`;

      return {
        matched: true,
        candidate: buildRecommendationCandidate({
          now,
          signal,
          recommendation_type: 'REVIEW_VENDOR',
          subject_type: signal.vendor_id != null ? 'vendor' : 'inventory_item',
          subject_id: signal.vendor_id ?? signal.subject_id,
          subject_key: buildRecommendationSubjectKey('REVIEW_VENDOR', signal),
          summary,
          assigned_role: 'Purchasing Owner',
          suggested_steps: [
            'Review recent vendor pricing and pack consistency for this item.',
            'Confirm whether the preferred vendor-item path should remain active.',
            'Check alternates if the current price movement is likely to persist.',
          ],
          expected_benefit_payload: {
            source_signal_type: signal.signal_type,
            vendor_id: signal.vendor_id,
            inventory_item_id: signal.inventory_item_id,
            volatility_pct_range: volatilityPct,
            price_change_abs: priceAbs,
            recurrence_count: recurrenceCount,
          },
          evidence: [buildSignalEvidence(signal, 'price_signal')],
        }),
      };
    },
  },
  {
    recommendation_type: 'REVIEW_RECIPE_MARGIN',
    description: 'Escalate material recipe cost movement into recipe margin review.',
    evaluate: ({ signal, now }) => {
      if (signal.signal_type !== 'RECIPE_COST_DRIFT' && signal.signal_type !== 'INGREDIENT_COST_DRIVER') {
        return null;
      }
      const deltaCost = numberHint(signal.signal_payload['delta_cost'] ?? signal.signal_payload['ingredient_delta_cost']);
      if (!['high', 'critical'].includes(signal.severity_label) && deltaCost < 2) {
        return { matched: false, reason: 'Recipe signal was not material enough for margin review.' };
      }

      const recipeName = stringHint(signal.signal_payload['recipe_name']) ?? buildSubjectLabel(signal);
      const summary = `Review recipe margin for ${recipeName}. Trusted cost movement is material enough to warrant operator review.`;

      return {
        matched: true,
        candidate: buildRecommendationCandidate({
          now,
          signal,
          recommendation_type: 'REVIEW_RECIPE_MARGIN',
          subject_type: 'recipe',
          subject_id: signal.recipe_id ?? signal.subject_id,
          subject_key: buildRecipeRecommendationSubjectKey(signal),
          summary,
          assigned_role: signal.severity_label === 'critical' ? 'Executive Approver' : 'Unit Manager',
          suggested_steps: [
            'Review current recipe cost against menu pricing and contribution margin.',
            'Check whether the identified driver should trigger a purchasing, recipe, or pricing response.',
            'Confirm whether the current recipe version should remain the operational standard.',
          ],
          expected_benefit_payload: {
            benefit_type: 'recipe_margin_review',
            recipe_id: signal.recipe_id,
            review_focus: 'recipe_margin',
          },
          evidence: [buildSignalEvidence(signal, 'recipe_cost_signal')],
        }),
      };
    },
  },
  {
    recommendation_type: 'INVESTIGATE_VARIANCE',
    description: 'Escalate major single count variance into immediate investigation.',
    evaluate: ({ signal, now }) => {
      if (signal.signal_type !== 'COUNT_VARIANCE') {
        return null;
      }
      const varianceCost = numberHint(signal.signal_payload['variance_cost_abs']);
      const variancePct = numberHint(signal.signal_payload['variance_pct']);
      if (!['high', 'critical'].includes(signal.severity_label) && varianceCost < 20 && variancePct < 0.25) {
        return { matched: false, reason: 'Single variance was not material enough for investigation.' };
      }

      const itemName = buildSubjectLabel(signal);
      return {
        matched: true,
        candidate: buildRecommendationCandidate({
          now,
          signal,
          recommendation_type: 'INVESTIGATE_VARIANCE',
          subject_type: 'inventory_item',
          subject_id: signal.inventory_item_id ?? signal.subject_id,
          subject_key: buildRecommendationSubjectKey('INVESTIGATE_VARIANCE', signal),
          summary: `Investigate count variance for ${itemName}. Counted quantity diverged materially from expected quantity in the latest count session.`,
          assigned_role: 'Unit Manager',
          suggested_steps: [
            'Validate the count line and recount if necessary.',
            'Check recent transfers, waste, and usage coding for the item.',
            'Confirm whether the variance reflects a true stock movement gap or execution error.',
          ],
          expected_benefit_payload: {
            source_signal_type: signal.signal_type,
            inventory_item_id: signal.inventory_item_id,
            variance_cost_abs: varianceCost,
            variance_pct: variancePct,
          },
          evidence: [buildSignalEvidence(signal, 'count_variance_signal')],
        }),
      };
    },
  },
  {
    recommendation_type: 'ENFORCE_CYCLE_COUNT',
    description: 'Require tighter cycle count action for repeated inconsistency.',
    evaluate: ({ signal, now }) => {
      if (signal.signal_type !== 'COUNT_INCONSISTENCY') {
        return null;
      }
      const recurrence = numberHint(signal.signal_payload['recurrence_count']);
      if (recurrence < 3 || !['medium', 'high', 'critical'].includes(signal.severity_label)) {
        return { matched: false, reason: 'Repeated count inconsistency threshold not met.' };
      }
      if (signal.severity_label === 'high' || signal.severity_label === 'critical' || recurrence >= 4) {
        return { matched: false, reason: 'Escalated inconsistency should use review-count-discipline.' };
      }

      const itemName = buildSubjectLabel(signal);
      return {
        matched: true,
        candidate: buildRecommendationCandidate({
          now,
          signal,
          recommendation_type: 'ENFORCE_CYCLE_COUNT',
          subject_type: 'inventory_item',
          subject_id: signal.inventory_item_id ?? signal.subject_id,
          subject_key: buildRecommendationSubjectKey('ENFORCE_CYCLE_COUNT', signal),
          summary: `Enforce tighter cycle count follow-up for ${itemName}. Repeated count inconsistency is active inside the configured recurrence window.`,
          assigned_role: 'Unit Manager',
          suggested_steps: [
            'Increase count frequency for this item in the affected scope.',
            'Confirm count execution steps are being followed consistently.',
            'Review handling, transfer, and waste logging around this item.',
          ],
          expected_benefit_payload: {
            source_signal_type: signal.signal_type,
            inventory_item_id: signal.inventory_item_id,
            recurrence_count: recurrence,
          },
          evidence: [buildSignalEvidence(signal, 'count_inconsistency_signal')],
        }),
      };
    },
  },
  {
    recommendation_type: 'REVIEW_COUNT_DISCIPLINE',
    description: 'Escalate repeated count inconsistency into broader count-discipline review.',
    evaluate: ({ signal, now }) => {
      if (signal.signal_type !== 'COUNT_INCONSISTENCY') {
        return null;
      }
      const recurrence = numberHint(signal.signal_payload['recurrence_count']);
      if (signal.severity_label !== 'high' && signal.severity_label !== 'critical' && recurrence < 4) {
        return { matched: false, reason: 'Count inconsistency not severe enough for discipline review.' };
      }

      const itemName = buildSubjectLabel(signal);
      return {
        matched: true,
        candidate: buildRecommendationCandidate({
          now,
          signal,
          recommendation_type: 'REVIEW_COUNT_DISCIPLINE',
          subject_type: 'inventory_item',
          subject_id: signal.inventory_item_id ?? signal.subject_id,
          subject_key: buildRecommendationSubjectKey('REVIEW_COUNT_DISCIPLINE', signal),
          summary: `Review count discipline for ${itemName}. Repeated inconsistency is strong enough to warrant management follow-up beyond a single recount.`,
          assigned_role: signal.severity_label === 'critical' ? 'Executive Approver' : 'Unit Manager',
          suggested_steps: [
            'Review who counted, where the count occurred, and whether the workflow was followed.',
            'Check whether the affected scope needs tighter controls or supervisory review.',
            'Decide whether count discipline should be escalated into a broader operating standard later.',
          ],
          expected_benefit_payload: {
            source_signal_type: signal.signal_type,
            inventory_item_id: signal.inventory_item_id,
            recurrence_count: recurrence,
          },
          evidence: [buildSignalEvidence(signal, 'count_inconsistency_signal')],
        }),
      };
    },
  },
];

function buildRecommendationCandidate(input: {
  now: string;
  signal: DerivedSignal;
  recommendation_type: RecommendationType;
  subject_type: Recommendation['subject_type'];
  subject_id: number;
  subject_key: string;
  summary: string;
  assigned_role: 'Purchasing Owner' | 'Unit Manager' | 'Executive Approver';
  suggested_steps: string[];
  expected_benefit_payload: Record<string, unknown>;
  evidence: RecommendationEvidence[];
}): SynthesizedRecommendationCandidate {
  const urgency = deriveUrgency(input.signal);
  const recommendation: Recommendation = {
    id: `${input.recommendation_type}:${input.subject_key}:${input.signal.observed_at}`,
    recommendation_type: input.recommendation_type,
    rule_version: 'recommendation-synthesis/v1',
    subject_type: input.subject_type,
    subject_id: input.subject_id,
    subject_key: input.subject_key,
    status: 'OPEN',
    severity_label: input.signal.severity_label,
    confidence_label: input.signal.confidence_label,
    urgency_label: urgency,
    confidence_score: input.signal.confidence_score,
    summary: input.summary,
    organization_id: input.signal.organization_id,
    location_id: input.signal.location_id,
    operation_unit_id: input.signal.operation_unit_id,
    storage_area_id: input.signal.storage_area_id,
    inventory_item_id: input.signal.inventory_item_id,
    recipe_id: input.signal.recipe_id,
    vendor_id: input.signal.vendor_id,
    vendor_item_id: input.signal.vendor_item_id,
    dedupe_key: input.subject_key,
    superseded_by_recommendation_id: null,
    evidence_count: input.evidence.length,
    expected_benefit_payload: input.expected_benefit_payload,
    operator_action_payload: {
      assigned_role: input.assigned_role,
      due_in_days: urgency === 'IMMEDIATE' ? 1 : urgency === 'THIS_WEEK' ? 7 : 14,
      recommendation_rule_key: input.recommendation_type,
      suggested_steps: input.suggested_steps,
    },
    evidence: [],
    opened_at: input.now,
    due_at: urgency === 'IMMEDIATE' ? input.now : null,
    closed_at: null,
    last_confirmed_at: input.now,
    created_at: input.now,
    updated_at: input.now,
  };

  return {
    recommendation,
    evidence: input.evidence,
    rule_key: input.recommendation_type,
    source_signal_id: input.signal.id,
  };
}

function buildSignalEvidence(signal: DerivedSignal, evidenceType: string): RecommendationEvidence {
  return {
    id: `${signal.id}:${evidenceType}`,
    recommendation_id: 0,
    evidence_type: evidenceType,
    evidence_ref_table: 'derived_signals',
    evidence_ref_id: String(signal.id),
    explanation_text: `${signal.signal_type} provided the qualifying evidence for this recommendation.`,
    evidence_weight: 1,
    created_at: signal.updated_at ?? signal.observed_at,
  };
}

function buildRecommendationSubjectKey(recommendationType: RecommendationType, signal: DerivedSignal): string {
  const base = signal.subject_key ?? `${signal.subject_type}:${signal.subject_id}`;
  return `${recommendationType}:${base}`;
}

function buildRecipeRecommendationSubjectKey(signal: DerivedSignal): string {
  const recipeId = signal.recipe_id ?? signal.subject_id;
  return [
    'REVIEW_RECIPE_MARGIN',
    `recipe:${recipeId}`,
    `location:${signal.location_id ?? 'global'}`,
    `operation_unit:${signal.operation_unit_id ?? 'global'}`,
  ].join(':');
}

function deriveUrgency(signal: DerivedSignal): UrgencyLabel {
  if (signal.severity_label === 'critical') {
    return 'IMMEDIATE';
  }
  if (signal.severity_label === 'high' || signal.signal_type === 'COUNT_INCONSISTENCY' || signal.signal_type === 'PRICE_VOLATILITY') {
    return 'THIS_WEEK';
  }
  return 'MONITOR';
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

function stringHint(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function numberHint(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}
