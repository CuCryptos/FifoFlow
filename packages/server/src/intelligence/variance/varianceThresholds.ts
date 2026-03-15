import type { VarianceThresholdConfig, VarianceThresholdRuleSet } from './types.js';

export const VARIANCE_THRESHOLD_POLICY_KEYS = {
  count_variance_pct_threshold: 'count_variance_pct_threshold',
  count_variance_abs_qty_threshold: 'count_variance_abs_qty_threshold',
  count_variance_abs_cost_threshold: 'count_variance_abs_cost_threshold',
  count_inconsistency_recurrence_threshold: 'count_inconsistency_recurrence_threshold',
  count_inconsistency_window_days: 'count_inconsistency_window_days',
  count_immediate_pct_threshold: 'count_immediate_pct_threshold',
  count_immediate_abs_cost_threshold: 'count_immediate_abs_cost_threshold',
} as const;

export const DEFAULT_VARIANCE_THRESHOLD_CONFIG: VarianceThresholdConfig = {
  global: {
    count_variance_pct_threshold: 0.1,
    count_variance_abs_qty_threshold: 1,
    count_variance_abs_cost_threshold: 20,
    count_inconsistency_recurrence_threshold: 3,
    count_inconsistency_window_days: 14,
    count_immediate_pct_threshold: 0.25,
    count_immediate_abs_cost_threshold: 75,
  },
  category_overrides: {},
};

export function resolveFallbackVarianceThresholds(
  category: string | null | undefined,
  config: VarianceThresholdConfig = DEFAULT_VARIANCE_THRESHOLD_CONFIG,
): VarianceThresholdRuleSet {
  if (!category) {
    return { ...config.global };
  }

  return {
    ...config.global,
    ...(config.category_overrides[category] ?? {}),
  };
}
