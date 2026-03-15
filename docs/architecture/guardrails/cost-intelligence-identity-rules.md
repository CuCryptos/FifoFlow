# Cost Intelligence Identity Rules

## Core rules

1. Recipe ingredients reason about canonical ingredient identity first.
2. Recipe costing may use inventory items and vendor-derived normalized costs, but it must retain canonical meaning.
3. Vendor price history belongs to vendor items, not directly to recipe ingredients.
4. Normalized cost resolution must record the identity path used.
5. Invoice descriptions must never be treated as canonical ingredient identity without resolution.

## Required costing path

A trustworthy cost result should be able to answer:
- what the recipe ingredient means
- what inventory item fulfilled it
- what vendor item supplied it
- what normalized cost was used

## What cost intelligence must not do

### Not allowed
- attach vendor prices directly to recipe ingredient semantics without resolution context
- treat invoice description text as if it were canonical ingredient identity
- use inventory items as the only ingredient meaning layer

### Allowed
- use vendor-item-derived normalized unit cost
- use inventory item mapping to select operational fulfillment
- retain the canonical ingredient as the semantic anchor

## Explainability requirement

FIFOFlow should be able to explain a cost line like this:
- recipe ingredient: `extra virgin olive oil`
- operational inventory item: `extra virgin olive oil 1 L bottle`
- vendor item: `Sysco EVOO 6 x 1 L case`
- normalized cost used: `$0.018 per ml`

That explanation must survive future price drift, vendor switches, and pack changes.

## Why this matters

If a vendor changes from a `6 x 1 L case` to a `4 x 1.5 L case`, recipe meaning did not change.
Only the purchasable path changed.

If the system cannot preserve that distinction, cost drift signals will misclassify operational vendor changes as recipe changes.
