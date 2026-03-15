# FIFOFlow Price Intelligence Implementation

This document describes the first executable deterministic intelligence pack in FIFOFlow: price intelligence.

## What was implemented

Implemented outputs:
- `PRICE_INCREASE` signal
- `PRICE_DROP` signal
- `PRICE_VOLATILITY` signal
- `UNSTABLE_VENDOR_PRICING` pattern
- `REVIEW_VENDOR` recommendation

Implemented supporting pieces:
- normalized vendor price history source interface
- legacy SQLite read adapter for vendor price rows
- threshold configuration model with global defaults and category overrides
- in-memory persistence adapter for signals, patterns, recommendations, and recommendation evidence
- deterministic tests covering signal detection, pattern promotion, recommendation generation, and override behavior

## Required inputs

The price pack currently expects normalized vendor price observations with these fields:
- vendor price record id
- vendor identity
- vendor item identity key
- inventory item identity
- item category
- base unit
- normalized unit cost
- observation timestamp

The current legacy SQLite adapter derives these from `vendor_prices`, `items`, and `vendors`.

Normalization rules used now:
- if `qty_per_unit` exists and is greater than zero, normalized unit cost = `order_unit_price / qty_per_unit`
- otherwise, if `order_unit` is null or equals the item base unit, normalized unit cost = `order_unit_price`
- otherwise the row is skipped because normalization is unresolved

## Rule flow

### 1. Load normalized price history

The source adapter returns vendor price observations grouped later by a derived `vendor_item_key`.

### 2. Resolve thresholds

FIFOFlow resolves thresholds in this order:
- global default thresholds
- category override thresholds

No item-level overrides exist yet.

### 3. Compare latest price to prior price

For each vendor item series with at least two observations:
- compare latest normalized unit cost to prior normalized unit cost
- emit `PRICE_INCREASE` if change exceeds configured increase threshold
- emit `PRICE_DROP` if change exceeds configured drop threshold

### 4. Compute volatility window

For each series:
- look back across the configured recurrence window
- require minimum evidence count
- compute normalized price range as `(max - min) / min`
- emit `PRICE_VOLATILITY` if the range exceeds the configured volatility threshold

### 5. Promote repeated volatility into a pattern

If the current run emits `PRICE_VOLATILITY`, FIFOFlow checks historical volatility signals for the same vendor item key within the recurrence window.

If repeated volatility signals meet the pattern threshold, FIFOFlow emits:
- `UNSTABLE_VENDOR_PRICING` pattern

### 6. Generate recommendation

If the pattern confidence is beyond `Early signal` and there is no active duplicate recommendation, FIFOFlow emits:
- `REVIEW_VENDOR`

## Threshold behavior

Default seeded thresholds live in the price threshold module.

Global defaults currently include:
- percent increase threshold
- percent drop threshold
- volatility threshold
- minimum evidence count
- recurrence window days
- pattern signal threshold
- immediate increase threshold
- immediate volatility threshold

Current category overrides include tighter sensitivity for categories such as:
- `Seafood`
- `Meat`
- `Wine`
- `Bar`

This keeps the first implementation operationally grounded. A tuna cost swing should not be treated like a paper goods price move.

## Evidence model

Every output includes evidence lineage.

### Signals

Signals include evidence references back to the contributing vendor price records, including:
- vendor item key
- vendor price record id
- vendor id
- inventory item id
- normalized unit cost
- order-unit price
- quantity per unit
- comparison timestamps

### Patterns

Patterns carry:
- signal ids
- recurrence count
- recurrence window
- latest volatility metrics
- rolled-up evidence references from the contributing signals

### Recommendations

Recommendations persist separate recommendation evidence rows, including:
- pattern summary evidence
- source vendor price references used in the latest volatility signal

## Confidence model

The implementation uses the existing confidence labels:
- `Early signal`
- `Emerging pattern`
- `Stable pattern`

Confidence is based on deterministic factors such as:
- number of observations in the current series
- number of repeated volatility signals
- recurrence within the configured window

## Urgency model

Recommendations use:
- `IMMEDIATE`
- `THIS_WEEK`
- `MONITOR`

Current logic:
- stable pattern plus high or critical severity -> `IMMEDIATE`
- stable pattern, or emerging pattern with medium or higher severity -> `THIS_WEEK`
- otherwise -> `MONITOR`

## Assumptions

- legacy `vendor_prices` may contain enough repeated rows to act as a provisional price series before canonical vendor price history is live
- canonical `vendor_item` tables do not exist at runtime yet, so the engine uses a derived `vendor_item_key`
- vendor price normalization is limited by available pack information in legacy rows
- persistence into canonical intelligence tables is not wired yet; in-memory persistence is used for deterministic testing

## Open limitations

- legacy SQLite does not provide a full invoice-linked price history model yet
- price history currently depends on repeated `vendor_prices` rows or future canonical vendor price history
- no production persistence adapter exists yet for `derived_signals`, `pattern_observations`, `recommendations`, or `recommendation_evidence`
- urgency does not yet use category criticality beyond threshold overrides
- no UI or weekly memo generation is wired to these outputs yet

## How this connects later to recipe cost intelligence

Price intelligence is the cost input foundation for recipe intelligence.

Later recipe cost logic should:
- read normalized vendor price history or recipe cost snapshots
- use the same threshold resolution model
- attach the same evidence lineage style
- trace recipe cost drift back to the same vendor item and inventory item price movements now emitted by this pack

This means recipe cost drift can later say exactly which vendor item price changes pushed a recipe out of tolerance, instead of recalculating cost in isolation.
