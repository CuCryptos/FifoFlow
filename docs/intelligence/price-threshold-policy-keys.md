# Price Threshold Policy Keys

## Required keys

### `price_increase_pct_threshold`
- description: minimum percent increase required to emit `PRICE_INCREASE`
- value type: number
- default: `0.08`
- recommended scope use: organization, location, inventory category, exact inventory item
- future override targets: volatile categories and premium programs

### `price_drop_pct_threshold`
- description: minimum percent decrease required to emit `PRICE_DROP`
- value type: number
- default: `0.08`
- recommended scope use: organization, location, inventory category
- future override targets: categories where savings opportunities should be surfaced differently

### `price_volatility_threshold`
- description: minimum percentage range required to emit `PRICE_VOLATILITY`
- value type: number
- default: `0.15`
- recommended scope use: organization, location, inventory category
- future override targets: seafood, meat, wine, bar programs

### `price_min_evidence_count`
- description: minimum count of observations required before volatility is trusted
- value type: number
- default: `3`
- recommended scope use: organization, category
- future override targets: fast-moving categories with dense price histories

### `price_recurrence_window_days`
- description: rolling lookback window used for volatility and recurrence analysis
- value type: number
- default: `30`
- recommended scope use: organization, location, category
- future override targets: wine and bar programs with longer purchasing cadence

### `price_immediate_pct_threshold`
- description: percent change threshold that escalates price movement urgency and severity
- value type: number
- default: `0.18`
- recommended scope use: organization, category, exact inventory item
- future override targets: highly margin-sensitive categories

### `price_immediate_abs_threshold`
- description: absolute normalized unit-cost change threshold that escalates severe price movement
- value type: number
- default: `2.0`
- recommended scope use: organization, category, exact inventory item
- future override targets: expensive proteins and premium beverage programs

## Supporting key

### `price_pattern_signal_threshold`
- description: number of recurring volatility signals required before promoting `UNSTABLE_VENDOR_PRICING`
- value type: number
- default: `2`
- recommended scope use: organization, category
- future override targets: noisy categories versus tightly controlled categories

### `price_volatility_immediate_pct_threshold`
- description: volatility range threshold that escalates `PRICE_VOLATILITY` severity
- value type: number
- default: `0.28`
- recommended scope use: organization, category
- future override targets: seafood and meat programs with tighter sensitivity
