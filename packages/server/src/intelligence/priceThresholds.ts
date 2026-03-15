import type { PriceThresholdConfig, PriceThresholdRuleSet } from '@fifoflow/shared';

export const PRICE_THRESHOLD_POLICY_KEYS = {
  percent_increase_threshold: 'price_increase_pct_threshold',
  percent_drop_threshold: 'price_drop_pct_threshold',
  volatility_threshold: 'price_volatility_threshold',
  minimum_evidence_count: 'price_min_evidence_count',
  recurrence_window_days: 'price_recurrence_window_days',
  pattern_signal_threshold: 'price_pattern_signal_threshold',
  immediate_pct_threshold: 'price_immediate_pct_threshold',
  immediate_abs_threshold: 'price_immediate_abs_threshold',
  immediate_volatility_threshold: 'price_volatility_immediate_pct_threshold',
} as const;

export const DEFAULT_PRICE_THRESHOLD_CONFIG: PriceThresholdConfig = {
  global: {
    percent_increase_threshold: 0.08,
    percent_drop_threshold: 0.08,
    volatility_threshold: 0.15,
    minimum_evidence_count: 3,
    recurrence_window_days: 30,
    pattern_signal_threshold: 2,
    immediate_pct_threshold: 0.18,
    immediate_abs_threshold: 2,
    immediate_volatility_threshold: 0.28,
  },
  category_overrides: {
    Seafood: {
      percent_increase_threshold: 0.04,
      volatility_threshold: 0.12,
      immediate_pct_threshold: 0.12,
      immediate_volatility_threshold: 0.22,
    },
    Meat: {
      percent_increase_threshold: 0.05,
      volatility_threshold: 0.12,
      immediate_pct_threshold: 0.14,
      immediate_volatility_threshold: 0.22,
    },
    Wine: {
      volatility_threshold: 0.1,
      recurrence_window_days: 45,
    },
    Bar: {
      volatility_threshold: 0.1,
      recurrence_window_days: 45,
    },
  },
};

export function resolveFallbackPriceThresholds(
  category: string | null | undefined,
  config: PriceThresholdConfig = DEFAULT_PRICE_THRESHOLD_CONFIG,
): PriceThresholdRuleSet {
  if (!category) {
    return { ...config.global };
  }

  return {
    ...config.global,
    ...(config.category_overrides[category] ?? {}),
  };
}
