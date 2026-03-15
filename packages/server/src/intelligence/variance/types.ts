import type { DerivedSignal, EvidenceReference, SeverityLabel } from '@fifoflow/shared';
import type { IntelligenceJobContext, IntelligenceJobResult } from '../types.js';

export interface VarianceThresholdRuleSet {
  count_variance_pct_threshold: number;
  count_variance_abs_qty_threshold: number;
  count_variance_abs_cost_threshold: number;
  count_inconsistency_recurrence_threshold: number;
  count_inconsistency_window_days: number;
  count_immediate_pct_threshold: number;
  count_immediate_abs_cost_threshold: number;
}

export interface VarianceThresholdConfig {
  global: VarianceThresholdRuleSet;
  category_overrides: Record<string, Partial<VarianceThresholdRuleSet>>;
}

export interface InventoryCountVarianceSourceRow {
  count_entry_id: number;
  count_session_id: number;
  count_session_name: string;
  count_session_status: string;
  inventory_item_id: number;
  inventory_item_name: string;
  inventory_category: string | null;
  item_unit: string;
  expected_qty: number | null;
  counted_qty: number | null;
  variance_qty: number | null;
  counted_at: string;
  notes: string | null;
  expected_unit_cost: number | null;
  cost_source_table: string | null;
  cost_source_ref_id: string | null;
  cost_source_type: string | null;
  vendor_id: number | null;
  vendor_name: string | null;
  storage_area_id?: number | null;
}

export interface VarianceReadRepository {
  listCountVarianceRows(context: IntelligenceJobContext): Promise<InventoryCountVarianceSourceRow[]>;
}

export interface VarianceThresholdPolicySubject {
  inventory_item_id: number;
  inventory_item_name: string;
  inventory_category: string | null;
}

export interface CountVarianceEvaluation {
  variance_qty_abs: number;
  variance_pct: number | null;
  variance_cost_abs: number | null;
}

export interface VarianceRunSummary {
  count_rows_evaluated: number;
  rows_skipped_missing_expected: number;
  rows_skipped_missing_counted: number;
  rows_below_threshold: number;
  count_variance_signals_emitted: number;
  count_inconsistency_signals_emitted: number;
}

export interface VarianceExecutionResult extends IntelligenceJobResult {
  variance_summary: VarianceRunSummary;
}

export interface CountInconsistencyContext {
  recurrence_count: number;
  window_days: number;
  observed_since: string;
  supporting_signal_ids: Array<number | string>;
}

export interface CountVarianceSignalEvidence {
  count_session: EvidenceReference;
  count_entry: EvidenceReference;
  cost_source?: EvidenceReference | null;
}

export interface CountVarianceSignalRecord {
  signal: DerivedSignal;
  evaluation: CountVarianceEvaluation;
}

export function resolveVarianceSeverity(
  input: {
    variance_pct: number | null;
    variance_cost_abs: number | null;
    variance_qty_abs: number;
  },
  thresholds: VarianceThresholdRuleSet,
): SeverityLabel {
  if (
    (input.variance_pct != null && input.variance_pct >= thresholds.count_immediate_pct_threshold)
    || (input.variance_cost_abs != null && input.variance_cost_abs >= thresholds.count_immediate_abs_cost_threshold)
  ) {
    return 'critical';
  }

  if (
    (input.variance_pct != null && input.variance_pct >= thresholds.count_variance_pct_threshold * 2)
    || (input.variance_cost_abs != null && input.variance_cost_abs >= thresholds.count_variance_abs_cost_threshold * 2)
    || input.variance_qty_abs >= thresholds.count_variance_abs_qty_threshold * 2
  ) {
    return 'high';
  }

  return 'medium';
}
