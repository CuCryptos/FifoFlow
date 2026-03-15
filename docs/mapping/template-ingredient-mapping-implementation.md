# Template Ingredient Mapping Implementation

## What was implemented

FIFOFlow now has a durable template ingredient mapping queue that:
- reads active recipe template ingredient rows from SQLite
- normalizes ingredient text using the canonical ingredient resolver policy
- resolves each row against the canonical ingredient dictionary
- persists deterministic mapping outcomes
- persists review candidates for ambiguous outcomes
- preserves manual and rejected review decisions on rerun

## Stable row identity strategy

Each template ingredient row gets a deterministic row key built from:
- `template_id`
- `template_version_id`
- `sort_order`
- normalized ingredient text

This key is stored as `template_ingredient_row_key`.

The row key is stable enough for reruns because template versions are immutable snapshots and `sort_order` is already unique within a template version.

## Mapping persistence behavior

`template_ingredient_mappings` stores:
- original ingredient text
- normalized ingredient text
- mapped canonical ingredient id if selected
- mapping status
- confidence label
- deterministic match reason
- resolver explanation text
- source hash
- active flag

Rerun behavior:
- unchanged row + unchanged outcome => reused
- unchanged row + changed automated outcome => updated
- missing active template row => mapping retired
- `MANUALLY_MAPPED` and `REJECTED` => preserved

## Candidate persistence behavior

`template_ingredient_mapping_candidates` stores review choices only when the resolver returns an ambiguous result.

Candidate rows are:
- upserted by mapping id + canonical ingredient id + match reason
- reactivated and updated if the same candidate remains valid
- soft-retired when they no longer belong to the current candidate set

## Auto-map policy

FIFOFlow auto-maps only when the canonical ingredient resolver returns a unique deterministic match.

That includes:
- exact canonical name
- normalized canonical name
- exact alias
- normalized alias

Everything else is held back for review.

## Review policy

- `NEEDS_REVIEW` for ambiguous outcomes
- `UNMAPPED` for no-match outcomes
- candidate rows only for ambiguous outcomes
- optional review events are recorded for newly flagged review rows and new unmapped rows

## Idempotency behavior

The mapping engine is safe to rerun because it:
- uses stable row identity
- upserts mapping rows instead of inserting blindly
- replaces candidate sets deterministically
- retires rows that disappear from active template versions
- preserves manual and rejected decisions

## Limitations

Current scope does not include:
- front-end review UI
- canonical ingredient to inventory item linkage
- canonical ingredient to vendor item linkage
- semantic search or fuzzy ingredient matching
- recipe instantiation workflows

## Blockers before template-driven recipe instantiation

1. A review workflow for `NEEDS_REVIEW` and `UNMAPPED` rows.
2. A durable bridge from canonical ingredient ids to operational recipe ingredient rows.
3. A canonical ingredient to inventory item mapping layer.
4. Policy for when draft recipes may exist with incomplete mapping versus when operational recipes must block.
5. Governance around alias additions so the canonical dictionary does not absorb bad local naming.
