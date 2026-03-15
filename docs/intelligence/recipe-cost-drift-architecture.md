# Recipe Cost Drift Architecture

## Purpose

The Recipe Cost Drift pack turns trusted recipe-cost snapshot comparisons into persisted intelligence signals.

This pack exists so FIFOFlow can move from:

- snapshot storage

to:

- explainable cost movement detection

without inventing certainty from weak recipe cost inputs.

## Position in the intelligence stack

Recipe Cost Drift sits after recipe-cost snapshot persistence and before recommendations.

Processing flow:

1. trusted current recipe snapshot
2. trusted prior comparable snapshot
3. snapshot comparison
4. drift threshold evaluation
5. driver threshold evaluation
6. persisted signals in `derived_signals`

## Signals in scope

- `RECIPE_COST_DRIFT`
- `INGREDIENT_COST_DRIVER`

No recommendations are emitted in this phase.

## Required prerequisites

This pack depends on:

- durable `recipe_cost_snapshots`
- durable `recipe_ingredient_cost_components`
- durable `ingredient_cost_resolution_log`
- trusted comparable snapshot retrieval
- shared intelligence persistence via `derived_signals`

## Trust and comparability gates

No signal is emitted unless all of these are true:

- current snapshot `completeness_status = complete`
- current snapshot `confidence_label = high`
- prior comparable trusted snapshot exists
- prior snapshot is also `complete + high`
- comparison output is marked `comparable`
- total delta fields required by the rule are present
- drift is positive and materially above threshold

Negative drift is not promoted into signals in this phase.

## Signal generation flow

### Recipe-level drift

The engine evaluates the trusted comparison for:

- absolute cost delta
- percent cost delta
- prior snapshot age requirement

If the recipe crosses both material thresholds, FIFOFlow emits `RECIPE_COST_DRIFT`.

### Ingredient driver detection

For each ingredient delta inside a trusted comparison, the engine evaluates:

- ingredient absolute delta cost
- ingredient share of total recipe delta

If both cross threshold, FIFOFlow emits `INGREDIENT_COST_DRIVER`.

## Persistence flow

The pack reuses the shared intelligence persistence layer.

- run starts in `intelligence_runs`
- signals upsert into `derived_signals`
- reruns update existing rows for the same subject/window/magnitude shape
- no separate ad hoc recipe-cost signal store is introduced

## Evidence model

Every signal carries evidence references pointing to:

- prior recipe cost snapshot
- current recipe cost snapshot

Signal payloads also include the numeric comparison facts needed for operator review.

## Future downstream use

These persisted signals are intended to feed:

- weekly operating memo ranking
- recipe-cost recommendation logic
- future recipe margin and recipe pressure analysis

The important constraint is sequence:

- trusted recipe cost facts first
- signals second
- recommendations later
