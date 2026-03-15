# Ingredient Alias Resolution Model

## Goal

FIFOFlow should resolve ingredient labels into canonical ingredient identity without guessing.

This phase is deterministic only. No semantic search, embeddings, or fuzzy auto-resolution is allowed here.

## Resolution order

Resolver stages run in this order:

1. exact canonical name match
2. normalized canonical name match
3. exact alias match
4. normalized alias match
5. no-match result
6. ambiguous result if multiple active canonical ingredients match in any stage that is not safely unique

The resolver stops at the first stage that produces exactly one safe match.

## Normalization policy

Current normalization rules are intentionally conservative:

- lowercase
- trim leading and trailing whitespace
- Unicode normalize with `NFKC`
- replace `&` with `and`
- remove apostrophes
- replace other punctuation with spaces
- collapse repeated whitespace

Examples:

- `  Parmesan Cheese ` -> `parmesan cheese`
- `Extra-Virgin Olive Oil` -> `extra virgin olive oil`
- `Fish & Chips Vinegar` -> `fish and chips vinegar`

## What normalization does not do

To avoid unsafe merges, the resolver does not currently:

- singularize or pluralize automatically
- remove descriptive adjectives like `extra virgin`, `grated`, `fresh`, or `smoked`
- collapse nearby but distinct ingredients

That means these remain meaningfully distinct:

- `olive oil` vs `extra virgin olive oil`
- `parmesan cheese` vs `grated parmesan cheese`
- `ahi tuna` vs `tuna loin`

## Match stages

### Exact canonical name match

Input equals an active `canonical_name` exactly.

This is the strongest deterministic match.

### Normalized canonical name match

Input does not match raw canonical name exactly, but normalized input equals `normalized_canonical_name`.

Typical example:

- input `Parmesan Cheese`
- normalized input `parmesan cheese`

### Exact alias match

Input equals an active alias exactly.

This allows controlled shorthand and operational synonyms.

Examples:

- `parm`
- `evoo`
- `shoyu`

### Normalized alias match

Input does not match raw alias exactly, but normalized input equals `normalized_alias`.

Typical example:

- input `Green Onion`
- normalized input `green onion`
- alias row `green onion` resolves to canonical ingredient `scallion`

## No-match handling

If no active canonical ingredient or alias matches through the deterministic stages, the resolver returns `no_match`.

FIFOFlow should not invent a canonical ingredient in this case.

This result is intended to feed:

- template mapping review
- vendor item mapping review
- recipe ingredient review

## Ambiguous handling

If multiple active canonical ingredients match at a deterministic stage, the resolver returns `ambiguous`.

FIFOFlow must not guess between candidates.

Examples of ambiguous outcomes:

- same alias assigned to multiple active canonical ingredients
- future dictionary collisions created by poor alias governance

Ambiguity is a review outcome, not a silent fallback.

## Resolver output shape

Resolver output must include:

- `match status`
- `matched canonical ingredient id`
- `matched canonical name`
- `match reason`
- `confidence label`
- `explanation text`
- candidate matches when ambiguous

Current runtime status values:

- `matched`
- `no_match`
- `ambiguous`

Current runtime match reasons:

- `exact_canonical`
- `normalized_canonical`
- `exact_alias`
- `normalized_alias`
- `no_match`
- `ambiguous`

## Confidence model

This resolver is deliberately simple.

- `high` confidence means one unique deterministic match was found
- `low` confidence means no safe match or ambiguous match

There is no medium-confidence fuzzy layer in this phase.

## Future fuzzy matching

Future fuzzy assistance may exist later for review tooling, but it is explicitly out of scope here.

Any future fuzzy layer must:

- never overwrite deterministic matches
- never auto-resolve low-trust matches into production identity without review
- keep explanation and evidence visible to operators
