# Recipe Builder Implementation

## What was implemented

FIFOFlow now has a deterministic recipe builder foundation that can:
- accept freeform ingredient text
- accept a recipe template source
- parse ingredient rows deterministically
- resolve canonical ingredient identity using the existing canonical resolver
- persist parsed rows, resolution rows, and draft recipe state in SQLite
- classify rows and draft recipes for review instead of guessing

## Supported parse patterns

Supported now:
- integer quantities
- decimal quantities
- simple fractions
- mixed fractions
- common kitchen units including `lb`, `oz`, `kg`, `g`, `ml`, `L`, `cup`, `tbsp`, `tsp`, `each`, `clove`, and `stalk`
- safe prep-note extraction for cases like `chopped parsley`

## Unsupported or review-required patterns

Examples that remain low-trust:
- `salt to taste`
- `olive oil as needed`
- `a splash of vinegar`
- unsupported unit expressions
- lines without a safely isolated ingredient segment

These become `PARTIAL`, `NEEDS_REVIEW`, or `FAILED` depending on what was recoverable.

## Draft recipe assembly flow

1. Create or reuse a builder job.
2. Ingest source rows from freeform text or template rows.
3. Persist parsed rows.
4. Resolve canonical ingredient identity per row.
5. Persist resolution rows.
6. Roll row states into draft completeness and costability status.
7. Persist the draft recipe record.

## Persistence model

Durable tables:
- `recipe_builder_jobs`
- `recipe_builder_parsed_rows`
- `recipe_builder_resolution_rows`
- `recipe_builder_draft_recipes`

The builder stores original line text and explanations so later review is inspectable.

## Trust and review rules

- parser failure => row `BLOCKED`
- ambiguous or missing canonical identity => row `NEEDS_REVIEW`
- unresolved inventory mapping does not block a draft, but it prevents costable status
- missing yield keeps the draft `INCOMPLETE`

## Limitations

Current scope does not include:
- final operational recipe creation
- UI review workflow
- automatic inventory item mapping
- AI-assisted semantic parsing
- menu or product linkage

## Blockers before final operational recipe creation

1. A promotion workflow from draft recipe to operational recipe/version/ingredient tables.
2. A canonical ingredient to inventory item mapping layer.
3. Review tooling for unresolved parse and canonical rows.
4. Policy for whether draft recipes may exist without yield data.
5. Validation rules for recipe versions and future edits.
