# Promoted Recipe Cost Source Path

## Exact source flow
promoted `recipe_version`
-> `recipe_ingredients`
-> canonical ingredient ids
-> scoped canonical-to-inventory resolver
-> resolved or unresolved costing rows
-> recipe cost source bridge
-> recipe cost engine
-> `recipe_cost_snapshots`, `recipe_ingredient_cost_components`, `ingredient_cost_resolution_log`

## Statuses
### `COSTABLE_NOW`
All promoted ingredient rows resolve through the scoped canonical-to-inventory bridge.
The recipe is eligible for live recipe-cost evaluation.

### `OPERATIONAL_ONLY`
The recipe is operationally valid but one or more rows do not have trusted scoped inventory resolution.
The live job reports the recipe but skips snapshot creation.

### `BLOCKED_FOR_COSTING`
The recipe has a semantic identity break, usually a missing canonical ingredient id.
The live job reports the blocking reason and skips snapshot creation.

## Resolved row behavior
A resolved costing row preserves:
- promoted recipe version id
- recipe item id
- raw ingredient text
- canonical ingredient id
- resolved inventory item id
- inventory item name
- matched scope type
- matched scope reference
- mapping status and match reason
- explanation text

## Unresolved row behavior
An unresolved costing row still preserves:
- promoted recipe version id
- recipe item id
- raw ingredient text
- canonical ingredient id if present
- unresolved status
- blocking reason
- explanation text

The row is not silently dropped.

## Engine handoff
Only `COSTABLE_NOW` promoted recipes are handed to the live recipe cost engine.
Once inside the engine, existing deterministic cost resolution still applies:
- `invoice_recent`
- `vendor_price_history`
- `last_trusted_snapshot`
- `manual_override`

In the current live runtime, `vendor_price_history` is sourced from normalized `vendor_prices` where normalization is safe.

## Persistence behavior
If a promoted recipe is skipped before engine execution:
- no recipe cost snapshot is written
- the run output still contains the recipe-level costability result

If a promoted recipe enters the engine:
- normal snapshot persistence applies
- snapshot completeness and confidence still reflect real cost candidate quality
- no high-confidence result is fabricated when cost evidence is weak

## Preserved explanation metadata
Persisted resolution detail includes:
- canonical ingredient id
- raw ingredient text
- costability status
- scoped inventory mapping payload

This keeps the path explainable from promoted recipe semantics to operational inventory fulfillment.
