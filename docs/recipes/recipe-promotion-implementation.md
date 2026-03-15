# Recipe Promotion Implementation

## What was implemented

FIFOFlow now has a deterministic promotion path from durable builder draft state into:
- `recipes`
- `recipe_versions`
- `recipe_ingredients`
- `recipe_promotion_events`
- `recipe_builder_promotion_links`

The promotion engine evaluates gates first and will not partially create operational recipe rows when the draft is not promotable.

## Promotion gating rules

Promotion currently requires:
- draft recipe name
- yield quantity
- yield unit
- no blocked ingredient rows
- no unresolved canonical ingredient identity
- no ingredient rows still requiring parse or quantity review

Inventory item mapping is not required for operational promotion in this phase.

## New recipe versus new version policy

Current safe policy:
- no prior promotion link => create new recipe and version 1
- explicit revision promotion with a target recipe => create a new version
- repeat promotion without revision intent => reuse the existing promotion link

## Lineage model

The promoted version records:
- source builder job id
- source builder draft recipe id
- source template ids when present
- source text snapshot when present

Promoted ingredient rows record:
- parsed row id
- resolution row id
- raw ingredient line text

## Costability classification

Promotion returns one of:
- `COSTABLE_NOW`
- `OPERATIONAL_ONLY`
- `BLOCKED_FOR_COSTING`

This distinction matters because a recipe may be safe enough to exist operationally before it is safe enough for recipe-cost intelligence.

## Idempotency and re-promotion behavior

- repeated promotion of the same draft reuses an active promotion link unless revision mode is explicit
- repeat promotion records a reuse event instead of duplicating recipes and versions
- revision mode requires an explicit recipe target if no active promotion link exists

## Limitations

This phase does not implement:
- front-end review workflow
- full recipe governance lifecycle
- automatic inventory-item mapping
- menu linking
- promotion diffing between builder revisions

## Blockers before full governed recipe lifecycle

1. Review tooling for ingredient-level promotion blockers.
2. Stronger inventory-item linkage for costable promotion.
3. Explicit builder revision workflows.
4. Recipe governance policies for approval, retirement, and standardization.
