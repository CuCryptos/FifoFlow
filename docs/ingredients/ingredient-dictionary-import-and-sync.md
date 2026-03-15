# Ingredient Dictionary Import And Sync

## Seed source of truth

The canonical ingredient dictionary JSON asset is the seed source of truth for this phase.

Current asset:

- `/Users/curtisvaughan/FifoFlow/packages/server/data/canonical-ingredient-dictionary.json`

Runtime tables are populated from that file. They are not hand-maintained independently.

## Runtime tables

The import populates:

- `canonical_ingredients`
- `ingredient_aliases`
- `canonical_ingredient_sync_runs`

## Initial import behavior

On first import FIFOFlow:

1. creates runtime ingredient tables if they do not exist
2. inserts canonical ingredient rows
3. inserts alias rows for each canonical ingredient
4. records a sync run with counts and source hash

## Idempotent rerun behavior

The importer is safe to rerun.

Canonical ingredient rows are keyed by `canonical_name`.

Alias rows are keyed by:

- `canonical_ingredient_id`
- raw `alias`

If a rerun sees identical source content for an existing row, the row is reused rather than duplicated.

If a rerun sees changed source content for the same stable row identity, the row is updated in place and its `source_hash` changes.

## Update behavior

### Canonical ingredient updates

A canonical ingredient is updated in place when any of these change for the same `canonical_name`:

- normalized canonical name
- category
- base unit
- perishability flag
- active flag
- source hash

### Alias updates

An alias is updated in place when the same canonical ingredient + alias pair changes in:

- normalized alias
- alias type
- active flag
- source hash

## Retirement behavior

Runtime rows missing from the JSON seed are soft-retired, not deleted.

### Canonical ingredients

If a previously active canonical ingredient is not present in the current JSON seed, it is marked:

- `active = false`

### Aliases

If a previously active alias for a canonical ingredient is not present in the current JSON seed, it is marked:

- `active = false`

This preserves historical identity lineage while preventing retired rows from being used in current deterministic resolution.

## Source drift detection

The importer computes:

- row-level `source_hash` values for canonical ingredients and aliases
- dataset-level `source_hash` for the full JSON asset

These hashes allow FIFOFlow to detect:

- identical reruns
- changed canonical definitions
- changed alias sets
- drift between the seed asset and runtime state

## Operational safeguards

The importer is designed to be safe in staging and local runtime use:

- no deletes are required for normal sync behavior
- no duplicate rows should be created on rerun
- ambiguous alias collisions remain allowed in storage but must be surfaced as ambiguous at resolution time
- missing canonical rows after upsert are treated as hard failures
- sync runs are logged with `running`, `completed`, or `failed` status

## Sync output

A sync run records:

- inserted ingredient count
- updated ingredient count
- reused ingredient count
- retired ingredient count
- inserted alias count
- updated alias count
- reused alias count
- retired alias count
- source hash
- timestamps
- status

## Why soft-retire instead of delete

Ingredient identity is operational infrastructure. Deleting rows creates avoidable lineage loss.

Soft retirement keeps old identity available for:

- historical traceability
- prior mappings
- future audit of ingredient dictionary changes

while ensuring active resolver behavior remains deterministic and current.
