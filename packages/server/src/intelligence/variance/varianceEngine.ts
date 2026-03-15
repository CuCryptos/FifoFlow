import type { DerivedSignal, EvidenceReference } from '@fifoflow/shared';
import type { PolicyRepository } from '../../platform/policy/index.js';
import { defaultConfidenceLabel, type IntelligenceJobContext } from '../types.js';
import type { IntelligencePersistenceRepository, IntelligenceRunCounters } from '../persistence/types.js';
import {
  buildVarianceThresholdExplainabilityPayload,
  resolveVarianceThresholdPolicyBundle,
  type ResolvedVarianceThresholdBundle,
} from './varianceThresholdPolicyResolver.js';
import { DEFAULT_VARIANCE_THRESHOLD_CONFIG } from './varianceThresholds.js';
import type {
  CountInconsistencyContext,
  CountVarianceEvaluation,
  CountVarianceSignalRecord,
  InventoryCountVarianceSourceRow,
  VarianceExecutionResult,
  VarianceReadRepository,
  VarianceRunSummary,
  VarianceThresholdConfig,
  VarianceThresholdRuleSet,
} from './types.js';
import { resolveVarianceSeverity } from './types.js';

export interface VarianceIntelligenceDependencies {
  source: VarianceReadRepository;
  repository: IntelligencePersistenceRepository;
  policyRepository?: PolicyRepository;
  thresholdConfig?: VarianceThresholdConfig;
}

export async function executeVarianceIntelligence(
  context: IntelligenceJobContext,
  dependencies: VarianceIntelligenceDependencies,
): Promise<VarianceExecutionResult> {
  const thresholdConfig = dependencies.thresholdConfig ?? DEFAULT_VARIANCE_THRESHOLD_CONFIG;
  const run = await dependencies.repository.startRun('variance-intelligence-job', context.now);
  const rows = await dependencies.source.listCountVarianceRows(context);

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
  const summary: VarianceRunSummary = {
    count_rows_evaluated: rows.length,
    rows_skipped_missing_expected: 0,
    rows_skipped_missing_counted: 0,
    rows_below_threshold: 0,
    count_variance_signals_emitted: 0,
    count_inconsistency_signals_emitted: 0,
  };

  try {
    await dependencies.repository.withTransaction(async () => {
      for (const row of rows) {
        if (row.counted_qty == null) {
          summary.rows_skipped_missing_counted += 1;
          continue;
        }
        if (row.expected_qty == null) {
          summary.rows_skipped_missing_expected += 1;
          continue;
        }

        const thresholdBundle = await resolveVarianceThresholdPolicyBundle({
          subject: {
            inventory_item_id: row.inventory_item_id,
            inventory_item_name: row.inventory_item_name,
            inventory_category: row.inventory_category,
          },
          context,
          policyRepository: dependencies.policyRepository,
          fallbackConfig: thresholdConfig,
        });
        if (thresholdBundle.fallback_used) {
          notes.push(`Variance threshold fallback defaults were used for ${row.inventory_item_name} (${row.inventory_category ?? 'uncategorized'}).`);
        }

        const varianceSignal = evaluateCountVarianceSignal(row, context, thresholdBundle);
        if (!varianceSignal) {
          summary.rows_below_threshold += 1;
          continue;
        }

        const persistedVariance = await dependencies.repository.upsertSignal(varianceSignal.signal);
        incrementSignalCounters(counters, persistedVariance.action);
        summary.count_variance_signals_emitted += 1;
        signals.push(persistedVariance.record);

        const inconsistencySignal = await evaluateCountInconsistencySignal(
          row,
          context,
          thresholdBundle,
          dependencies.repository,
        );
        if (!inconsistencySignal) {
          continue;
        }

        const persistedInconsistency = await dependencies.repository.upsertSignal(inconsistencySignal);
        incrementSignalCounters(counters, persistedInconsistency.action);
        summary.count_inconsistency_signals_emitted += 1;
        signals.push(persistedInconsistency.record);
      }
    });

    if (signals.length === 0) {
      notes.push('No variance intelligence signals were emitted for the evaluated count window.');
    }

    const completedRun = await dependencies.repository.completeRun(run.id, 'completed', counters, context.now);
    return {
      signals,
      run: completedRun,
      run_summary: counters,
      variance_summary: summary,
      notes,
    };
  } catch (error) {
    await dependencies.repository.completeRun(run.id, 'failed', counters, context.now);
    throw error;
  }
}

export function evaluateCountVarianceSignal(
  row: InventoryCountVarianceSourceRow,
  context: IntelligenceJobContext,
  thresholdBundle: ResolvedVarianceThresholdBundle,
): CountVarianceSignalRecord | null {
  const evaluation = calculateVarianceEvaluation(row);
  if (!canEvaluateCountVariance(row, evaluation, thresholdBundle.thresholds)) {
    return null;
  }

  const thresholds = thresholdBundle.thresholds;
  const severity = resolveVarianceSeverity(evaluation, thresholds);
  const confidenceScore = resolveCountVarianceConfidenceScore(evaluation, thresholds, row.expected_unit_cost != null);
  const evidence = buildCountVarianceEvidence(row);
  const subjectKey = buildVarianceSubjectKey(row, context);

  return {
    evaluation,
    signal: {
      id: `COUNT_VARIANCE:${subjectKey}:${row.count_entry_id}`,
      signal_type: 'COUNT_VARIANCE',
      subject_type: 'inventory_item',
      subject_id: row.inventory_item_id,
      subject_key: subjectKey,
      severity_label: severity,
      confidence_label: defaultConfidenceLabel(confidenceScore),
      confidence_score: confidenceScore,
      rule_version: context.ruleVersion,
      window_start: row.counted_at,
      window_end: row.counted_at,
      observed_at: row.counted_at,
      organization_id: context.scope.organizationId ?? null,
      location_id: context.scope.locationId ?? null,
      operation_unit_id: context.scope.operationUnitId ?? null,
      storage_area_id: context.scope.storageAreaId ?? row.storage_area_id ?? null,
      inventory_category_id: context.scope.inventoryCategoryId ?? null,
      inventory_item_id: row.inventory_item_id,
      recipe_id: null,
      vendor_id: row.vendor_id,
      vendor_item_id: null,
      magnitude_value: roundMetric(evaluation.variance_pct ?? evaluation.variance_qty_abs),
      evidence_count: evidence.length,
      signal_payload: {
        count_session_id: row.count_session_id,
        count_session_name: row.count_session_name,
        count_entry_id: row.count_entry_id,
        inventory_item_id: row.inventory_item_id,
        inventory_item_name: row.inventory_item_name,
        inventory_category: row.inventory_category,
        item_unit: row.item_unit,
        expected_qty: row.expected_qty,
        counted_qty: row.counted_qty,
        variance_qty: row.variance_qty,
        variance_qty_abs: evaluation.variance_qty_abs,
        variance_pct: evaluation.variance_pct,
        variance_cost_abs: evaluation.variance_cost_abs,
        threshold_used: {
          count_variance_pct_threshold: thresholds.count_variance_pct_threshold,
          count_variance_abs_qty_threshold: thresholds.count_variance_abs_qty_threshold,
          count_variance_abs_cost_threshold: thresholds.count_variance_abs_cost_threshold,
          count_immediate_pct_threshold: thresholds.count_immediate_pct_threshold,
          count_immediate_abs_cost_threshold: thresholds.count_immediate_abs_cost_threshold,
        },
        threshold_explainability: buildVarianceThresholdExplainabilityPayload(
          thresholdBundle,
          [
            'count_variance_pct_threshold',
            'count_variance_abs_qty_threshold',
            'count_variance_abs_cost_threshold',
            'count_immediate_pct_threshold',
            'count_immediate_abs_cost_threshold',
          ],
        ),
        cost_context: row.expected_unit_cost != null
          ? {
              expected_unit_cost: row.expected_unit_cost,
              source_table: row.cost_source_table,
              source_ref_id: row.cost_source_ref_id,
              source_type: row.cost_source_type,
              vendor_id: row.vendor_id,
              vendor_name: row.vendor_name,
            }
          : null,
        evidence,
      },
      evidence,
      last_confirmed_at: context.now,
      created_at: context.now,
      updated_at: context.now,
    },
  };
}

async function evaluateCountInconsistencySignal(
  row: InventoryCountVarianceSourceRow,
  context: IntelligenceJobContext,
  thresholdBundle: ResolvedVarianceThresholdBundle,
  repository: IntelligencePersistenceRepository,
): Promise<DerivedSignal | null> {
  const thresholds = thresholdBundle.thresholds;
  const subjectKey = buildVarianceSubjectKey(row, context);
  const observedSince = subtractDays(row.counted_at, thresholds.count_inconsistency_window_days);
  const history = dedupeSignalsById((await repository.fetchActiveSignalsBySubject({
    subject_type: 'inventory_item',
    subject_key: subjectKey,
    signal_type: 'COUNT_VARIANCE',
    observed_since: observedSince,
  })).filter((signal) => compareIso(signal.observed_at, row.counted_at) <= 0))
    .sort((left, right) => compareIso(left.observed_at, right.observed_at));

  if (history.length < thresholds.count_inconsistency_recurrence_threshold) {
    return null;
  }

  const latest = history.at(-1);
  if (!latest) {
    return null;
  }

  const inconsistency: CountInconsistencyContext = {
    recurrence_count: history.length,
    window_days: thresholds.count_inconsistency_window_days,
    observed_since: observedSince,
    supporting_signal_ids: history.map((signal) => signal.id),
  };
  const confidenceScore = resolveCountInconsistencyConfidenceScore(history.length, thresholds.count_inconsistency_recurrence_threshold);
  const severity = resolveCountInconsistencySeverity(history.length, thresholds.count_inconsistency_recurrence_threshold);
  const evidence = history.map<EvidenceReference>((signal) => ({
    source_table: 'derived_signals',
    source_primary_key: String(signal.id),
    source_type: 'count_variance_signal',
    observed_at: signal.observed_at,
    payload: {
      signal_type: signal.signal_type,
      magnitude_value: signal.magnitude_value ?? null,
      count_entry_id: signal.signal_payload['count_entry_id'] ?? null,
      variance_qty_abs: signal.signal_payload['variance_qty_abs'] ?? null,
      variance_pct: signal.signal_payload['variance_pct'] ?? null,
    },
  }));

  return {
    id: `COUNT_INCONSISTENCY:${subjectKey}:${latest.signal_payload['count_entry_id'] ?? latest.id}`,
    signal_type: 'COUNT_INCONSISTENCY',
    subject_type: 'inventory_item',
    subject_id: row.inventory_item_id,
    subject_key: subjectKey,
    severity_label: severity,
    confidence_label: defaultConfidenceLabel(confidenceScore),
    confidence_score: confidenceScore,
    rule_version: context.ruleVersion,
    window_start: observedSince,
    window_end: row.counted_at,
    observed_at: row.counted_at,
    organization_id: context.scope.organizationId ?? null,
    location_id: context.scope.locationId ?? null,
    operation_unit_id: context.scope.operationUnitId ?? null,
    storage_area_id: context.scope.storageAreaId ?? row.storage_area_id ?? null,
    inventory_category_id: context.scope.inventoryCategoryId ?? null,
    inventory_item_id: row.inventory_item_id,
    recipe_id: null,
    vendor_id: row.vendor_id,
    vendor_item_id: null,
    magnitude_value: history.length,
    evidence_count: evidence.length,
    signal_payload: {
      inventory_item_id: row.inventory_item_id,
      inventory_item_name: row.inventory_item_name,
      inventory_category: row.inventory_category,
      recurrence_count: inconsistency.recurrence_count,
      observed_since: inconsistency.observed_since,
      latest_count_entry_id: row.count_entry_id,
      threshold_used: {
        count_inconsistency_recurrence_threshold: thresholds.count_inconsistency_recurrence_threshold,
        count_inconsistency_window_days: thresholds.count_inconsistency_window_days,
      },
      threshold_explainability: buildVarianceThresholdExplainabilityPayload(
        thresholdBundle,
        [
          'count_inconsistency_recurrence_threshold',
          'count_inconsistency_window_days',
        ],
      ),
      supporting_signal_ids: inconsistency.supporting_signal_ids,
      evidence,
    },
    evidence,
    last_confirmed_at: context.now,
    created_at: context.now,
    updated_at: context.now,
  };
}

function canEvaluateCountVariance(
  row: InventoryCountVarianceSourceRow,
  evaluation: CountVarianceEvaluation,
  thresholds: VarianceThresholdRuleSet,
): boolean {
  if (row.counted_qty == null || row.expected_qty == null || row.variance_qty == null) {
    return false;
  }

  return (
    evaluation.variance_qty_abs >= thresholds.count_variance_abs_qty_threshold
    || (evaluation.variance_pct != null && evaluation.variance_pct >= thresholds.count_variance_pct_threshold)
    || (evaluation.variance_cost_abs != null && evaluation.variance_cost_abs >= thresholds.count_variance_abs_cost_threshold)
  );
}

function calculateVarianceEvaluation(row: InventoryCountVarianceSourceRow): CountVarianceEvaluation {
  const varianceQtyAbs = Math.abs(row.variance_qty ?? 0);
  const variancePct = row.expected_qty != null && Math.abs(row.expected_qty) > 0
    ? varianceQtyAbs / Math.abs(row.expected_qty)
    : null;
  const varianceCostAbs = row.expected_unit_cost != null ? varianceQtyAbs * row.expected_unit_cost : null;

  return {
    variance_qty_abs: roundMetric(varianceQtyAbs),
    variance_pct: variancePct == null ? null : roundMetric(variancePct),
    variance_cost_abs: varianceCostAbs == null ? null : roundCurrency(varianceCostAbs),
  };
}

function buildCountVarianceEvidence(row: InventoryCountVarianceSourceRow): EvidenceReference[] {
  const evidence: EvidenceReference[] = [
    {
      source_table: 'count_sessions',
      source_primary_key: String(row.count_session_id),
      source_type: 'inventory_count_session',
      observed_at: row.counted_at,
      payload: {
        session_name: row.count_session_name,
        session_status: row.count_session_status,
      },
    },
    {
      source_table: 'count_entries',
      source_primary_key: String(row.count_entry_id),
      source_type: 'inventory_count_line',
      observed_at: row.counted_at,
      payload: {
        inventory_item_id: row.inventory_item_id,
        expected_qty: row.expected_qty,
        counted_qty: row.counted_qty,
        variance_qty: row.variance_qty,
      },
    },
  ];

  if (row.cost_source_table && row.cost_source_ref_id) {
    evidence.push({
      source_table: row.cost_source_table,
      source_primary_key: row.cost_source_ref_id,
      source_type: row.cost_source_type,
      observed_at: row.counted_at,
      payload: {
        expected_unit_cost: row.expected_unit_cost,
        vendor_id: row.vendor_id,
        vendor_name: row.vendor_name,
      },
    });
  }

  return evidence;
}

function buildVarianceSubjectKey(row: InventoryCountVarianceSourceRow, context: IntelligenceJobContext): string {
  return [
    `inventory_item:${row.inventory_item_id}`,
    `location:${context.scope.locationId ?? 'global'}`,
    `operation_unit:${context.scope.operationUnitId ?? 'global'}`,
    `storage_area:${context.scope.storageAreaId ?? row.storage_area_id ?? 'global'}`,
  ].join(':');
}

function resolveCountVarianceConfidenceScore(
  evaluation: CountVarianceEvaluation,
  thresholds: VarianceThresholdRuleSet,
  hasCostContext: boolean,
): number {
  const pctStrength = evaluation.variance_pct == null ? 0 : Math.min(evaluation.variance_pct / thresholds.count_variance_pct_threshold, 3);
  const qtyStrength = Math.min(evaluation.variance_qty_abs / thresholds.count_variance_abs_qty_threshold, 3);
  const costStrength = evaluation.variance_cost_abs == null ? 0 : Math.min(evaluation.variance_cost_abs / thresholds.count_variance_abs_cost_threshold, 3);
  const contextBonus = hasCostContext ? 0.08 : 0;
  return Math.min(0.45 + ((pctStrength + qtyStrength + costStrength) / 9) * 0.42 + contextBonus, 0.95);
}

function resolveCountInconsistencyConfidenceScore(recurrenceCount: number, recurrenceThreshold: number): number {
  const strength = Math.min(recurrenceCount / recurrenceThreshold, 3);
  return Math.min(0.5 + (strength / 3) * 0.35, 0.95);
}

function resolveCountInconsistencySeverity(recurrenceCount: number, recurrenceThreshold: number): DerivedSignal['severity_label'] {
  if (recurrenceCount >= recurrenceThreshold + 2) {
    return 'high';
  }
  return 'medium';
}

function incrementSignalCounters(counters: IntelligenceRunCounters, action: 'created' | 'updated'): void {
  if (action === 'created') {
    counters.signals_created += 1;
    return;
  }
  counters.signals_updated += 1;
}

function subtractDays(iso: string, days: number): string {
  const value = new Date(iso).getTime() - days * 24 * 60 * 60 * 1000;
  return new Date(value).toISOString();
}

function dedupeSignalsById(signals: DerivedSignal[]): DerivedSignal[] {
  const unique = new Map<string, DerivedSignal>();
  for (const signal of signals) {
    unique.set(String(signal.id), signal);
  }
  return [...unique.values()];
}

function compareIso(left: string, right: string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}

function roundMetric(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
