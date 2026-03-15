# Live Recipe Cost Job Wiring

## What changed
The live recipe cost job now treats promoted operational recipes as the primary runtime source path.

The job now reads:
- promoted `recipe_versions`
- promoted `recipe_ingredients`
- canonical ingredient ids on each promoted ingredient row
- scoped canonical ingredient to inventory item mappings
- live normalized ingredient cost candidates from `vendor_prices`

The job then builds costable recipe definitions through the promoted-recipe bridge before handing those definitions to the existing recipe cost engine.

## Live flow
promoted operational recipe
-> promoted recipe ingredient rows
-> canonical ingredient identity
-> scoped canonical-to-inventory resolver
-> costability classification
-> costable recipe definitions only
-> recipe cost engine
-> durable snapshot persistence

## Scope context requirements
The job builds recipe-cost scope from the job context, not from recipe rows, because current runtime recipe tables do not yet carry full scope ownership metadata.

Current safe scope inputs are:
- `organizationId`
- `locationId`
- `operationUnitId`

If location or operation-unit scope is not supplied, the bridge falls back to broader scope resolution instead of guessing.

## Costability gating behavior
The live job evaluates every promoted recipe version first.

### `COSTABLE_NOW`
- all promoted ingredient rows have canonical identity
- all promoted ingredient rows resolve to trusted scoped inventory items
- recipe definition is passed into the recipe cost engine

### `OPERATIONAL_ONLY`
- recipe is operationally valid
- one or more ingredient rows still lack trusted scoped inventory mapping
- recipe is reported in the run output
- recipe is skipped from live snapshot generation

### `BLOCKED_FOR_COSTING`
- one or more ingredient rows lack canonical ingredient identity
- recipe is reported in the run output
- recipe is skipped from live snapshot generation

## Fallback and refusal behavior
- No hidden fallback guesses were added.
- If scoped inventory mapping does not resolve, the job refuses to treat the row as costable.
- If canonical identity is missing, the job refuses the recipe for costing entirely.
- Vendor price normalization also remains explicit. If `vendor_prices` cannot normalize to the item base unit, no candidate is emitted.

## Explainability
Per recipe version, the job now returns:
- costability classification
- total rows
- resolved rows
- unresolved rows
- costable percent
- blocking reasons
- whether a snapshot was persisted

Persisted resolution logs retain:
- canonical ingredient id
- raw ingredient text
- scoped inventory mapping result
- scope match metadata
- mapping explanation text

## Why this matters
This makes the live recipe cost job use real promoted recipes instead of only synthetic fixtures. It also creates the clean handoff needed for:
- vendor-item-backed cost lineage later
- scoped policy-backed recipe cost drift thresholds later
- operationally honest recipe-cost adoption by location and operation unit
