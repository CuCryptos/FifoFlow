# Recipe Builder Architecture

## Why this layer exists

Recipe creation friction is one of the fastest ways to lose operator trust. If FIFOFlow requires a kitchen manager to hand-build every ingredient row, normalize every unit, and manually map every ingredient identity before any value appears, adoption will stall.

The Recipe Builder exists to reduce setup time without sacrificing trust.

## Builder entry modes

FIFOFlow should support three starting points:
- freeform ingredient paste
- prep-sheet style paste
- start from template

All three modes converge into the same durable draft recipe assembly model.

## Deterministic pipeline

`original source text`
-> `line segmentation`
-> `parsed ingredient candidates`
-> `canonical ingredient resolution`
-> `inventory item mapping hooks`
-> `normalized quantity candidate`
-> `draft recipe assembly`
-> `review state`
-> `recipe creation`

## Architecture position

The builder sits upstream of recipe-cost and margin logic.

It is not a UI feature first. It is a backend trust layer that preserves:
- source text
- parsed interpretation
- canonical ingredient outcome
- review state
- draft assembly completeness

## Traceability requirements

FIFOFlow must retain:
- original pasted text or template source reference
- raw line text per ingredient row
- parser explanation
- canonical resolver explanation
- review status per row
- draft assembly summary status

This is required so operators can correct the system instead of guessing what it did.

## How this feeds downstream systems

### Recipe cost intelligence
The builder creates the ingredient identity and quantity substrate that recipe-cost snapshots depend on.

### Margin engine
The margin engine only becomes trustworthy when recipe rows are canonical, costable, and comparable.

### Purchasing intelligence
Ingredient identity from recipe assembly supports later demand rollups and purchasing-to-recipe comparisons.

### Theoretical usage
Theoretical usage cannot be credible if recipe ingredient rows were created from ambiguous text without review.
