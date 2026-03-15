# FIFOFlow Intelligence Bootstrap

This document defines the first deterministic intelligence layer to build after canonical migration is validated.

The intelligence layer should be explainable, evidence-driven, and operator-safe.

## Principles

- start with deterministic logic before opaque model inference
- compute durable facts and snapshots before recommendations
- never emit a recommendation without stored evidence
- separate observed facts from governed standards

## First derived fact layers

### Price history facts

- Purpose: item/vendor price movement over time.
- Source data: `invoice_line`, `vendor_item`, `vendor_price_history`.
- Output: latest price, prior price, delta amount, delta percent, price volatility window.

### Recipe cost snapshots

- Purpose: cost of a specific recipe version at a specific point in time.
- Source data: `recipe_ingredient`, `vendor_price_history`, `inventory_item`.
- Output: ingredient extended costs, total recipe cost, cost per yield unit, cost per menu portion.

### Theoretical usage snapshots

- Purpose: expected depletion by item from demand inputs.
- Source data: `forecast_line`, `menu_item_recipe_mapping`, `recipe_ingredient`, `recipe_version`.
- Output: expected item demand per day/location/operation unit.

### Actual usage snapshots

- Purpose: observed depletion by item.
- Source data: `stock_transaction`, `inventory_count_line`, `waste_event`, `prep_consumption`.
- Output: receipts, transfers, waste, prep usage, adjustments, net depletion by period.

### Variance events

- Purpose: reconcile actual behavior against theoretical or standard expectations.
- Source data: theoretical usage snapshots, actual usage snapshots, count results, standards.
- Output: variance by quantity, cost, direction, location, and recurrence window.

### Derived signals

- Purpose: normalized machine-readable outputs from fact layers.
- Source data: all fact layers above.
- Output examples:
  - `price_increase_detected`
  - `vendor_price_instability_detected`
  - `recipe_cost_drift_detected`
  - `count_variance_detected`
  - `untied_purchase_detected`
  - `non_recipe_inventory_detected`
  - `over_ordering_pattern_detected`
  - `waste_pattern_detected`

### Pattern observations

- Purpose: recurring conditions aggregated over time.
- Source data: derived signals over repeated windows.
- Output: stable, explainable pattern records used by recommendations.

### Recommendations

- Purpose: actionable, reviewable suggestions to operators.
- Source data: pattern observations plus evidence bundles.
- Output: typed recommendation with deterministic evidence and confidence label.

## Recommendation types

### Ingredient price increase since last invoice

- Required source data: `invoice_line`, `vendor_item`, `vendor_price_history`.
- Deterministic logic:
  - compare latest invoice line unit price to most recent prior invoice line for same vendor-item
  - emit when delta percent exceeds configured threshold
- Evidence output:
  - prior invoice/date/price
  - latest invoice/date/price
  - delta amount and percent
- Confidence label logic:
  - `high` if vendor-item match is explicit and both invoices are recent
  - `medium` if vendor-item match is inferred from item and pack fields
  - `low` if mapping needed normalization
- Operator action:
  - review vendor
  - review substitute vendor
  - update cost expectations

### Unstable vendor pricing

- Required source data: `vendor_price_history`, `invoice_line`.
- Deterministic logic:
  - measure price standard deviation or repeated alternating price changes over rolling window
  - emit when volatility exceeds threshold with minimum observation count
- Evidence output:
  - price history timeline
  - volatility metric
  - observation count
- Confidence label logic:
  - `high` after enough invoice observations across time
  - `medium` with moderate history
  - `low` with sparse history
- Operator action:
  - negotiate vendor
  - review preferred vendor standard
  - lock in pack choice

### Recipe cost drift

- Required source data: `recipe_cost_snapshot`, `recipe_version`, `vendor_price_history`.
- Deterministic logic:
  - compare latest recipe cost snapshot to prior snapshot or baseline standard
  - emit when drift exceeds threshold
- Evidence output:
  - prior cost per portion
  - current cost per portion
  - ingredients driving change
- Confidence label logic:
  - `high` when all ingredients have recent price evidence
  - `medium` when some ingredients rely on fallback price
  - `low` when pricing coverage is incomplete
- Operator action:
  - review menu pricing
  - review recipe version
  - review purchasing strategy

### Repeated count variance

- Required source data: `inventory_count_line`, `stock_transaction`, `item_storage_assignment`.
- Deterministic logic:
  - emit when the same item shows recurring positive or negative variance across N of M count sessions
- Evidence output:
  - session dates
  - system quantity vs counted quantity
  - variance direction and magnitude
- Confidence label logic:
  - `high` after repeated pattern in same area/location
  - `medium` after moderate recurrence
  - `low` for first recurrence
- Operator action:
  - review count process
  - review transfer logging
  - tighten storage-area handling

### Purchases not tied to recipe demand

- Required source data: `purchase_order_line`, `invoice_line`, `theoretical_usage_snapshot`, `inventory_item`.
- Deterministic logic:
  - detect items repeatedly purchased without meaningful recipe-linked demand or menu forecast consumption
- Evidence output:
  - purchase timeline
  - lack of recipe/menu linkage
  - on-hand accumulation
- Confidence label logic:
  - `high` if item has no recipe linkage and repeated purchases
  - `medium` if recipe linkage exists but demand remains minimal
  - `low` if demand context is incomplete
- Operator action:
  - review item role
  - reclassify as supply/non-menu item
  - remove from standing order behavior

### Inventory items not tied to recipes

- Required source data: `inventory_item`, `recipe_ingredient`, `menu_item_recipe_mapping`.
- Deterministic logic:
  - identify items with spend or stock significance but no recipe linkage
- Evidence output:
  - current stock
  - recent purchases
  - missing recipe references
- Confidence label logic:
  - `high` if purchased repeatedly and absent from recipes
  - `medium` if only stocked but not recently purchased
  - `low` if item is likely supply/equipment
- Operator action:
  - classify item
  - attach to recipe
  - mark as non-recipe operational inventory

### Recurring over-ordering

- Required source data: `purchase_order_line`, `invoice_line`, `item_storage_assignment`, `stock_transaction`, `forecast_line`.
- Deterministic logic:
  - detect repeated ordering above projected need resulting in recurring excess stock or waste
- Evidence output:
  - order quantities
  - projected demand
  - on-hand accumulation trend
- Confidence label logic:
  - `high` with repeated excess and adequate demand coverage
  - `medium` with weaker forecast linkage
  - `low` if forecast coverage is incomplete
- Operator action:
  - lower reorder quantity
  - lower par
  - change purchase cadence

### Recurring waste signals

- Required source data: `waste_event`, `stock_transaction`, `inventory_item`, `operation_unit`, `location`.
- Deterministic logic:
  - emit when waste for same item/reason/location recurs over threshold
- Evidence output:
  - waste dates
  - quantities and cost
  - reason frequency
- Confidence label logic:
  - `high` with explicit waste-event data
  - `medium` when inferred from adjustment notes
  - `low` when reason classification is weak
- Operator action:
  - review prep/yield
  - review ordering cadence
  - review handling/storage practice

## Bootstrap outputs to build first

- `price_history_fact`
- `recipe_cost_snapshot`
- `theoretical_usage_snapshot`
- `actual_usage_snapshot`
- `variance_event`
- `derived_signal`
- `pattern_observation`
- `recommendation`

## First confidence labels

- `high`: direct lineage, strong key matches, enough observations, recent evidence
- `medium`: minor inference required or moderate observation count
- `low`: sparse observations, unresolved mappings, or fallback assumptions

## Operator-safe rollout

- recommendations should start read-only
- operators should review evidence before standards change
- no recommendation should auto-promote into default standard during bootstrap
