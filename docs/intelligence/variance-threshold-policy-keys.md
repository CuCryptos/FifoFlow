# Variance Threshold Policy Keys

## `count_variance_pct_threshold`
- Description: Minimum percent variance between expected and counted quantity before a count variance signal can emit.
- Value type: number
- Default value: `0.10`
- Recommended scope use: `global`, `organization`, `location`, `operation_unit`, `storage_area`, `inventory_category`
- Future override targets: high-volatility seafood, controlled spirits rooms, commissary dry storage

## `count_variance_abs_qty_threshold`
- Description: Minimum absolute quantity variance before a count variance signal can emit.
- Value type: number
- Default value: `1`
- Recommended scope use: `global`, `organization`, `location`, `operation_unit`, `storage_area`, `inventory_category`
- Future override targets: low-unit-count proteins, garnish stations, bottled beverage programs

## `count_variance_abs_cost_threshold`
- Description: Minimum absolute cost impact before count variance should be treated as materially important when cost context exists.
- Value type: number
- Default value: `20`
- Recommended scope use: `global`, `organization`, `location`, `operation_unit`, `storage_area`, `inventory_category`
- Future override targets: premium proteins, locked liquor rooms, commissary transfer stock

## `count_inconsistency_recurrence_threshold`
- Description: Number of count variance events required before repeated inconsistency emits for the same scoped inventory subject.
- Value type: number
- Default value: `3`
- Recommended scope use: `global`, `organization`, `location`, `operation_unit`, `storage_area`, `inventory_category`
- Future override targets: daily-count bars, weekly-count prep rooms, slow-cycle dry storage

## `count_inconsistency_window_days`
- Description: Rolling window used to detect repeated variance inconsistency.
- Value type: number
- Default value: `14`
- Recommended scope use: `global`, `organization`, `location`, `operation_unit`, `storage_area`, `inventory_category`
- Future override targets: high-frequency count programs, low-frequency commissary counts

## `count_immediate_pct_threshold`
- Description: Percent variance threshold that escalates a count variance signal to immediate severity.
- Value type: number
- Default value: `0.25`
- Recommended scope use: `global`, `organization`, `location`, `operation_unit`, `storage_area`, `inventory_category`
- Future override targets: tight-control bar inventory, premium seafood, sensitive prep ingredients

## `count_immediate_abs_cost_threshold`
- Description: Absolute cost variance threshold that escalates a count variance signal to immediate severity when cost context exists.
- Value type: number
- Default value: `75`
- Recommended scope use: `global`, `organization`, `location`, `operation_unit`, `storage_area`, `inventory_category`
- Future override targets: premium proteins, cage inventory, top-spend beverage categories
