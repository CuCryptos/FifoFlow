# Live Recipe Cost Vendor Lineage Integration

## What changed
The live recipe-cost path no longer treats raw `vendor_prices` scans as the primary way to build cost candidates. FIFOFlow now builds live recipe-cost candidates from the promoted recipe path itself:

promoted recipe -> canonical ingredient -> scoped inventory item -> scoped vendor item -> normalized vendor cost lineage -> recipe cost candidate

## Why direct raw `vendor_prices` is no longer the primary path
A global `vendor_prices` sweep can find prices, but it cannot explain which scoped inventory item or vendor-item preference should apply to a specific promoted recipe at a specific location or operation unit. That shortcut breaks identity discipline and hides missing mappings.

## New live candidate flow
1. Load promoted `recipe_versions` and `recipe_ingredients`.
2. Resolve canonical ingredient to scoped inventory item.
3. Resolve inventory item to scoped vendor item.
4. Resolve normalized vendor cost lineage.
5. Emit recipe-cost candidates only for rows with trusted vendor-backed lineage.
6. Feed those candidates into the recipe cost engine.

## Fallback behavior
The bridge-backed path is now primary. A legacy candidate source can still be injected explicitly as a fallback, but it is no longer the default live runtime path. Missing vendor mapping or missing normalized vendor lineage keeps the recipe `OPERATIONAL_ONLY` instead of fabricating a trusted candidate.

## Explainability improvements
Resolved candidates now carry:
- canonical ingredient identity
- inventory item identity
- vendor item identity
- normalized cost base unit
- source type and source reference
- stale flag
- confidence label
- inventory-scope explanation
- vendor-scope explanation

This prepares FIFOFlow for supplier-switch detection later without collapsing identity layers today.
