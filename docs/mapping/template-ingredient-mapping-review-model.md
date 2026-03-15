# Template Ingredient Mapping Review Model

## Mapping statuses

### `UNMAPPED`
No deterministic canonical ingredient match exists.

### `AUTO_MAPPED`
A unique deterministic canonical ingredient match exists and was accepted automatically.

### `NEEDS_REVIEW`
Multiple plausible canonical ingredients exist and FIFOFlow will not guess.

### `MANUALLY_MAPPED`
A human reviewer selected the canonical ingredient intentionally.

### `REJECTED`
A human reviewer explicitly rejected the current automated outcome for this row.

## Confidence labels

### `HIGH`
Used for unique deterministic auto-maps.

### `MEDIUM`
Reserved for future assisted manual workflows if a reviewer accepts a limited-choice candidate.

### `LOW`
Used for ambiguous or unmapped outcomes.

## Deterministic match reasons

- `exact_canonical_name`
- `normalized_canonical_name`
- `exact_alias`
- `normalized_alias`
- `manual_resolution`
- `no_match`
- `ambiguous_match`

## Auto-accept rules

A mapping can be auto-accepted only when:
- the canonical resolver returns `matched`
- exactly one canonical ingredient was found
- the match came from deterministic name or alias lookup
- the resolver confidence is `high`

That produces:
- `mapping_status = AUTO_MAPPED`
- `confidence_label = HIGH`

## Review rules

A mapping must go to review when:
- resolver returns `ambiguous`
- multiple canonical ingredients are plausible
- the system cannot prove a unique deterministic match

That produces:
- `mapping_status = NEEDS_REVIEW`
- candidate rows for each plausible canonical ingredient
- resolver explanation text preserved on the mapping row

## No-match rules

A mapping becomes `UNMAPPED` when:
- no canonical ingredient name matches
- no normalized canonical ingredient name matches
- no alias matches

That produces:
- `mapping_status = UNMAPPED`
- no canonical ingredient id selected
- no candidate rows unless a future assisted search layer is added

## Rejected outcomes

Rejected rows should be remembered, not re-guessed.

Current policy:
- if a row is `REJECTED`, reruns preserve that status
- automated mapping does not overwrite the human rejection
- future review tooling can explicitly reopen a rejected row if needed

## Remapping after canonical dictionary changes

The mapping job is rerunnable, but not all statuses should behave the same:
- `AUTO_MAPPED`, `NEEDS_REVIEW`, and `UNMAPPED` can be recomputed from the current dictionary
- `MANUALLY_MAPPED` remains preserved until a reviewer changes it
- `REJECTED` remains preserved until a reviewer reopens it

This prevents the dictionary sync process from silently rewriting human review decisions.
