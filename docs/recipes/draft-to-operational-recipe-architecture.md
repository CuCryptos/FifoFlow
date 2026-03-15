# Draft To Operational Recipe Architecture

## Why draft is not final truth

A builder draft is working state. It preserves parsing, ingredient identity resolution, and operator cleanup work, but it is not yet trustworthy enough to become operational recipe truth by default.

Promotion is the controlled step that turns draft assembly state into operational recipe data.

## What promotion means in FIFOFlow

Promotion creates or reuses the operational recipe anchor and then creates a concrete recipe version plus ingredient rows from trusted draft state.

Target operational entities:
- `recipe`
- `recipe_version`
- `recipe_ingredients`

## Promotion flow

`builder draft`
-> `gating evaluation`
-> `promotable rows selected`
-> `operational recipe persisted`
-> `recipe version persisted`
-> `recipe ingredients persisted`
-> `lineage recorded`

## Required traceability

Promotion must preserve references back to:
- `recipe_builder_job`
- `recipe_builder_draft_recipe`
- parsed and resolution rows
- source template ids when present
- source text snapshot when present

## Promotion outcomes

- blocked with explicit reasons
- promoted into a new recipe and version 1
- promoted into a new version of an existing recipe only when revision intent is explicit
- reused existing promotion link on repeat promotion attempts when revision mode is not requested

## Why this matters downstream

### Recipe cost intelligence
Recipe-cost logic needs stable operational recipe versions with traceable ingredient rows.

### Recipe versioning
Promotion makes recipe evolution explicit instead of mutating a draft into hidden operational truth.

### Standards and governance
The promoted recipe becomes the object later governance can review and version.

### Margin engine
Margin logic requires stable recipe versions with clear lineage and trusted ingredient identity.
