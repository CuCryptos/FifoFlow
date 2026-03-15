# Recipe Assembly Review Model

## Draft assembly statuses

### `READY`
All ingredient rows are parsed and canonically resolved well enough to assemble a trustworthy draft.

### `NEEDS_REVIEW`
One or more ingredient rows need operator review due to parsing uncertainty or identity uncertainty.

### `BLOCKED`
One or more rows failed hard enough that the draft should not be treated as operable.

### `INCOMPLETE`
The ingredient rows are acceptable, but required recipe-level fields such as yield are still missing.

### `CREATED`
Reserved for the later point when the draft has been promoted into an operational recipe.

## Review dimensions

Per-row review should consider:
- parse confidence
- canonical ingredient resolution confidence
- inventory item mapping status
- quantity normalization confidence

Recipe-level review should consider:
- yield completeness
- whether all ingredient rows are ready for draft creation
- whether the draft is costable yet

## Minimum trust thresholds

### Draft recipe can be saved
- source text is preserved
- ingredient rows exist
- unresolved rows are explicitly flagged

### Draft recipe can be treated as costable
- all rows have canonical ingredient identity
- all rows have trusted quantity and unit normalization
- yield quantity and yield unit are present
- inventory item mapping is available where the costing model requires it

### Draft recipe is eligible for recipe cost intelligence
- draft has been promoted to operational recipe data
- canonical ingredient identity is complete
- inventory linkage is complete enough for cost source resolution
- unresolved review rows have been cleared
