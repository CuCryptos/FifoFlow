# Canonical Ingredient to Inventory Item Architecture

## Purpose
Canonical ingredient identity preserves recipe meaning. It does not tell FIFOFlow which stocked item a kitchen actually carries. Costing, counts, variance, and purchasing all depend on the operational inventory item layer.

FIFOFlow therefore needs a durable bridge:
- canonical ingredient: semantic ingredient meaning
- inventory item: operational stocked identity

These must remain separate.

## Why this bridge exists
A recipe row that means `olive oil` is not yet costable until FIFOFlow knows which inventory item fulfills that meaning at the relevant scope.

Examples:
- organization default: `olive oil -> olive oil`
- location override: `olive oil -> evoo bottle 1l`
- operation-unit override: `olive oil -> fryer blend oil`

## Platform role
This bridge feeds:
- promoted recipes
- recipe cost intelligence
- counts and variance
- purchasing intelligence
- future margin engine logic

## Scope support
Mappings may vary by:
- organization
- location
- operation_unit

The same canonical ingredient can legitimately map to different stocked items across those scopes.

## Mapping model
- preferred mapping: the trusted primary inventory item for a canonical ingredient at a scope
- alternate mapping: a valid non-primary option retained for review or later selection
- candidate: a proposed inventory item that has not been approved as a trusted mapping yet

## Explainability requirement
FIFOFlow should later be able to explain:
1. which canonical ingredient was resolved
2. which inventory item fulfilled it
3. which scope rule applied
4. whether the mapping was preferred or alternate
5. why it was trusted or deferred for review
