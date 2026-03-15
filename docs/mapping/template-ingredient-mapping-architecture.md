# Template Ingredient Mapping Architecture

FIFOFlow cannot treat seeded recipe templates as trustworthy operational recipe inputs until each template ingredient row is tied to stable canonical ingredient identity or explicitly flagged for review.

## Why this layer exists

Recipe templates are reusable kitchen starting points. They are intentionally generic enough to be reused across locations, but that makes them vulnerable to naming drift:
- `parm` versus `parmesan cheese`
- `green onion` versus `scallion`
- `chili` referring to multiple possible canonical ingredients

Without a durable mapping layer, template-driven recipes would bypass ingredient identity discipline and undermine:
- recipe cost intelligence
- future inventory item linkage
- vendor item normalization
- cross-location comparability

## Processing flow

`template ingredient row`
-> `normalized ingredient text`
-> `canonical resolver`
-> `mapping outcome`
-> `candidate persistence if needed`
-> `review queue state`
-> `approved mapping for future recipe instantiation`

## Deterministic mapping stages

1. Load active template ingredient rows from `recipe_templates`, `recipe_template_versions`, and `recipe_template_ingredients`.
2. Build a stable row identity for each ingredient row.
3. Normalize ingredient text using the canonical ingredient resolver normalization policy.
4. Resolve the ingredient text against the canonical ingredient dictionary.
5. Persist the outcome as one of:
   - `AUTO_MAPPED`
   - `NEEDS_REVIEW`
   - `UNMAPPED`
6. Persist review candidates when the result is ambiguous.
7. Preserve manual or rejected outcomes on rerun unless a human changes them.
8. Retire mappings for template ingredient rows that are no longer part of active template versions.

## Persistence model

Primary table:
- `template_ingredient_mappings`

Supporting table:
- `template_ingredient_mapping_candidates`

Optional audit table:
- `template_ingredient_mapping_review_events`

The mapping row stores:
- original ingredient text
- normalized ingredient text
- canonical ingredient id if one is selected
- deterministic match reason
- confidence label
- resolver explanation text
- stable row key
- source hash
- lifecycle status

## Candidate generation model

Candidate rows exist to make reviewable ambiguity explicit.

Candidate rows are created when:
- resolver status is `ambiguous`

Candidate rows are not created when:
- resolver status is a unique deterministic match
- resolver status is `no_match`

The queue should show the unresolved row plus candidate choices, not hide ambiguity inside free text.

## Idempotency model

Row identity is stable per template ingredient row. FIFOFlow uses:
- `template_id`
- `template_version_id`
- `sort_order`
- normalized ingredient text

This produces a deterministic `template_ingredient_row_key`.

Rerun behavior:
- same row + same outcome => reuse existing mapping row
- same row + changed deterministic outcome => update mapping row
- same row + changed candidate set => replace active candidates and retire stale ones
- missing active row from the latest template set => retire old mapping row
- `MANUALLY_MAPPED` or `REJECTED` rows are preserved on rerun

## How this feeds later layers

### Recipe instantiation
Mapped canonical ingredient ids become the ingredient identity bridge when a template is turned into an operational recipe.

### Recipe cost intelligence
Recipe cost logic can only be trusted when template-derived recipes preserve canonical ingredient identity through recipe ingredient creation.

### Future inventory item mapping
This layer does not choose inventory items. It only guarantees that the template ingredient has a stable kitchen identity first.

That ordering matters:
- canonical ingredient identity first
- inventory item linkage second
- vendor item linkage later
