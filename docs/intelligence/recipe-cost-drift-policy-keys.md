# Recipe Cost Drift Policy Keys

## Active policy keys

### `recipe_cost_drift_pct_threshold`
- Description: Minimum percent increase required before a recipe-level drift signal can emit.
- Value type: number
- Default value: `0.08`
- Recommended scope use: `global`, `organization`, `location`, `operation_unit`, `recipe_group`
- Future override targets: seafood-heavy recipe groups, commissary prep programs, premium tasting-menu programs

### `recipe_cost_drift_abs_threshold`
- Description: Minimum absolute cost increase required before a recipe-level drift signal can emit.
- Value type: number
- Default value: `0.75`
- Recommended scope use: `global`, `organization`, `location`, `operation_unit`, `recipe_group`
- Future override targets: low-ticket prep recipes, high-ticket plated entrees

### `ingredient_cost_driver_abs_threshold`
- Description: Minimum absolute ingredient delta required before an ingredient driver signal can emit.
- Value type: number
- Default value: `0.35`
- Recommended scope use: `global`, `organization`, `location`, `operation_unit`, `recipe_group`
- Future override targets: bar garnishes, prep recipes, protein-forward menu groups

### `ingredient_cost_driver_pct_of_total_delta_threshold`
- Description: Minimum share of the total recipe delta required for an ingredient to count as a driver.
- Value type: number
- Default value: `0.30`
- Recommended scope use: `global`, `organization`, `location`, `operation_unit`, `recipe_group`
- Future override targets: highly componentized recipes, banquet production recipes

### `recipe_cost_min_prior_snapshot_age_days`
- Description: Minimum age gap between the current trusted snapshot and prior trusted comparable snapshot.
- Value type: number
- Default value: `1`
- Recommended scope use: `global`, `organization`, `location`, `operation_unit`, `recipe_group`
- Future override targets: slow-moving prep items, volatile fresh seafood programs

### `recipe_cost_immediate_pct_threshold`
- Description: Percent increase that escalates recipe drift severity to immediate/critical handling.
- Value type: number
- Default value: `0.18`
- Recommended scope use: `global`, `organization`, `location`, `operation_unit`, `recipe_group`
- Future override targets: protected signature dishes, volatile market-price programs

### `recipe_cost_immediate_abs_threshold`
- Description: Absolute cost increase that escalates recipe drift severity to immediate/critical handling.
- Value type: number
- Default value: `2`
- Recommended scope use: `global`, `organization`, `location`, `operation_unit`, `recipe_group`
- Future override targets: high-cost proteins, tasting-menu anchor items

## Additional compatibility key

### `recipe_cost_repeat_suppression_days`
- Description: Reserved threshold for repeat suppression once drift recurrence handling is promoted into live policy-backed logic.
- Value type: number
- Default value: `7`
- Recommended scope use: `global`, `organization`, `location`, `operation_unit`, `recipe_group`
- Future override targets: noisy fresh-market programs, commissary recipes with frequent recalculation

## Notes
- Current fallback defaults preserve the working drift behavior already live in code.
- `recipe_group` currently resolves through `recipe_type` as the safe runtime key until canonical recipe-group identity is populated more broadly.
