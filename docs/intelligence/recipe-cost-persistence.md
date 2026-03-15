# Recipe Cost Persistence

## Purpose

The recipe cost persistence layer gives FIFOFlow durable operational memory for recipe costing. It stores the cost snapshot that was computed, the ingredient-level components that explain the total, and the resolution log that explains how each ingredient cost was chosen or why it could not be trusted.

This layer exists so FIFOFlow can move from one-off snapshot calculation to repeatable comparison over time without inventing costs or comparing weak data.

## Persistence architecture

The current runtime implementation is SQLite-backed:

- `recipe_cost_runs`
- `recipe_cost_snapshots`
- `recipe_ingredient_cost_components`
- `ingredient_cost_resolution_log`

The executable adapter is:

- `/Users/curtisvaughan/FifoFlow/packages/server/src/intelligence/recipeCost/persistence/sqliteRecipeCostRepository.ts`

The runtime schema bootstrap is:

- `/Users/curtisvaughan/FifoFlow/packages/server/src/intelligence/recipeCost/persistence/sqliteSchema.ts`

The planning schema remains in:

- `/Users/curtisvaughan/FifoFlow/db/schema-recipe-cost.sql`

Execution flow:

1. recipe definitions are loaded
2. ingredient costs are resolved deterministically
3. a recipe cost snapshot is computed
4. the snapshot is upserted by comparable key
5. resolution log rows for that snapshot are replaced
6. ingredient component rows for that snapshot are replaced
7. an optional run record is completed
8. a comparison-ready structure is built against the previous trusted comparable snapshot

## Idempotency strategy

The persistence model uses snapshot upsert plus child-row replacement.

Snapshot identity is keyed by:

- `recipe_id`
- `recipe_version_id` or `legacy`
- comparable time bucket from the evaluation window end date

This is encoded as `comparable_key`.

Current comparable key format:

- `{recipe_id}:{recipe_version_id|legacy}:{YYYY-MM-DD}`

Implications:

- rerunning the same recipe-cost job for the same recipe and comparable day updates the same snapshot row
- rerunning does not create duplicate snapshot rows
- rerunning replaces that snapshot's component rows and resolution rows so the persisted state matches the latest deterministic computation for that comparable window
- prior comparable windows remain intact as historical snapshots

This is not an append-only model. It is an upsert-per-comparable-window model. That was chosen because the immediate need is trustworthy comparison across operating periods, not audit of every intermediate rerun.

## Comparable snapshot rules

A snapshot is currently comparable only when both are true:

- `completeness_status = complete`
- `confidence_label = high`

That means FIFOFlow will not compare against snapshots that are:

- incomplete because of missing cost resolution
- incomplete because of ambiguous cost resolution
- incomplete because of unit mismatch
- partial because the snapshot depends on stale ingredient costs

Comparable lookup rules:

- `getLatestTrustedSnapshot(recipeId, recipeVersionId?)`
- `getLatestComparableSnapshot(recipeId, recipeVersionId?)`
- `getPreviousComparableSnapshot(recipeId, beforeDate, recipeVersionId?)`
- `getIngredientComponentHistory(recipeId, inventoryItemId, limit?)`

Current version compatibility rule:

- if `recipe_version_id` is present, comparison stays within that version
- if the runtime has no versioning, the lookup uses the legacy comparable key path

## Trust and completeness gating

Recipe cost drift readiness depends on trust gating.

FIFOFlow currently refuses comparison when:

- the current snapshot is not trusted enough for comparison
- no previous trusted comparable snapshot exists

Trusted comparison does not mean perfect data forever. It means the snapshot met the minimum standard required to make an operational claim about cost movement.

Current minimum standard:

- all ingredients resolved to a trusted normalized cost
- no ambiguous ingredient cost choice
- no missing ingredient cost
- no unit mismatch blocking normalization
- no stale ingredient cost degrading confidence below `high`

## Evidence lineage

Evidence lineage is preserved at three levels:

- snapshot level: comparable key, totals, driver items, run id
- component level: resolved unit cost, normalized quantity, extended cost, source type, source reference, stale and ambiguity flags
- resolution level: chosen source, candidate count, status, explanation, evidence payload details

This is the minimum needed before persisted `RECIPE_COST_DRIFT` or `INGREDIENT_COST_DRIVER` signals can be emitted with source traceability.

## Drift-readiness behavior

The persistence layer now supports comparison-ready structures without yet emitting final intelligence signals.

The repository can build a comparison object containing:

- current snapshot id
- previous comparable snapshot id
- comparability flag
- comparison refusal reason if not comparable
- total cost delta
- total cost delta percent
- per-ingredient deltas where both sides have persisted components
- primary driver item by absolute delta cost

This is the bridge into the next phase.

## Known limitations

- comparable keys are day-bucketed from the evaluation window end, not input-hash based
- rerun history within the same comparable day is not retained as separate immutable snapshot rows
- trusted comparison currently requires `complete + high`; there is no policy table yet for allowing some partial comparisons
- recipe version compatibility is simple exact-match logic; no semantic version comparison exists yet
- persisted resolution rows do not yet use a separate first-class evidence table
- the current runtime still depends on source interfaces for normalized ingredient costs; canonical vendor-item and invoice-linked cost sources are not fully live

## Blockers before live drift signals

`RECIPE_COST_DRIFT` and `INGREDIENT_COST_DRIVER` should not be persisted as formal signals until these are in place:

1. canonical `vendor_item` and normalized ingredient price history population
2. durable historical recipe cost snapshots across real operating windows
3. clear recipe version compatibility rules
4. stronger unit normalization coverage for edge cases
5. explicit signal thresholds for cost drift magnitude and recurrence
6. final persistence path for recipe-cost-derived signals into the intelligence repository

## Reuse by future packs

This persistence pattern is intentionally aligned with the existing intelligence system.

Future packs can reuse the same model:

- deterministic calculation first
- durable derived fact persistence second
- comparison gating before signal emission
- signals, patterns, and recommendations only after the derived layer is trustworthy

That matters for recipe cost because future margin, standards, and weekly operating memo outputs should depend on persisted, comparable cost facts rather than transient in-memory calculations.
