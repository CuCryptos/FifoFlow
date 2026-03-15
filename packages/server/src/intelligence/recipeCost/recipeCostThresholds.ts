import type {
  RecipeCostDriftThresholdConfig,
  RecipeCostDriftThresholdRuleSet,
} from '@fifoflow/shared';

export const RECIPE_COST_DRIFT_POLICY_KEYS = {
  recipe_cost_drift_pct_threshold: 'recipe_cost_drift_pct_threshold',
  recipe_cost_drift_abs_threshold: 'recipe_cost_drift_abs_threshold',
  ingredient_driver_abs_threshold: 'ingredient_cost_driver_abs_threshold',
  ingredient_driver_pct_of_total_delta_threshold: 'ingredient_cost_driver_pct_of_total_delta_threshold',
  minimum_prior_snapshot_age_days: 'recipe_cost_min_prior_snapshot_age_days',
  repeat_suppression_days: 'recipe_cost_repeat_suppression_days',
  immediate_recipe_cost_drift_pct_threshold: 'recipe_cost_immediate_pct_threshold',
  immediate_recipe_cost_drift_abs_threshold: 'recipe_cost_immediate_abs_threshold',
} as const;

export const DEFAULT_RECIPE_COST_DRIFT_THRESHOLD_CONFIG: RecipeCostDriftThresholdConfig = {
  global: {
    recipe_cost_drift_pct_threshold: 0.08,
    recipe_cost_drift_abs_threshold: 0.75,
    ingredient_driver_abs_threshold: 0.35,
    ingredient_driver_pct_of_total_delta_threshold: 0.3,
    minimum_prior_snapshot_age_days: 1,
    repeat_suppression_days: 7,
    immediate_recipe_cost_drift_pct_threshold: 0.18,
    immediate_recipe_cost_drift_abs_threshold: 2,
  },
  category_overrides: {
    dish: {
      recipe_cost_drift_pct_threshold: 0.06,
      ingredient_driver_pct_of_total_delta_threshold: 0.25,
    },
    prep: {
      recipe_cost_drift_abs_threshold: 0.5,
      ingredient_driver_abs_threshold: 0.25,
    },
  },
};

export function resolveFallbackRecipeCostDriftThresholds(
  recipeType: string | null | undefined,
  config: RecipeCostDriftThresholdConfig = DEFAULT_RECIPE_COST_DRIFT_THRESHOLD_CONFIG,
): RecipeCostDriftThresholdRuleSet {
  if (!recipeType) {
    return { ...config.global };
  }

  return {
    ...config.global,
    ...(config.category_overrides[recipeType] ?? {}),
  };
}

export function resolveRecipeCostDriftThresholds(
  recipeType: string | null | undefined,
  config: RecipeCostDriftThresholdConfig = DEFAULT_RECIPE_COST_DRIFT_THRESHOLD_CONFIG,
): RecipeCostDriftThresholdRuleSet {
  return resolveFallbackRecipeCostDriftThresholds(recipeType, config);
}
