# Recipe Promotion Review Model

## Promotion statuses

### `DRAFT`
Builder output exists but is still working state.

### `REVIEW_READY`
The draft has enough structure for human review but not enough trust for automatic promotion.

### `PROMOTABLE`
All deterministic gates for operational promotion are satisfied.

### `PROMOTED`
Operational recipe, version, and ingredient rows were created or a prior promotion link was reused safely.

### `REJECTED`
Promotion could not proceed because the draft or required lineage state does not exist.

## Resolution ownership

In this phase the backend only classifies status and blocking reasons. UI roles are not implemented here, but in practice:
- kitchen or unit owners resolve ingredient-level trust problems
- recipe reviewers decide when a draft should be promoted

## New recipe versus new version

Current policy:
- no active promotion link => create new recipe and version 1
- explicit revision promotion with a target recipe => create a new recipe version
- repeat promotion without revision intent => reuse existing promotion link instead of duplicating records

## Same draft promoted twice

FIFOFlow should not duplicate a recipe and version unnecessarily.
If the same draft already has an active promotion link and revision mode is not requested, the promotion engine reuses the existing result and records a reuse event.

## Promoted draft edited later

If the builder draft changes later, future promotion should become an explicit revision path rather than silently mutating the existing promoted version.
