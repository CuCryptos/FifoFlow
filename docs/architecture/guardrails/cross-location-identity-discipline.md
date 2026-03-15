# Cross-Location Identity Discipline

## Why cross-location systems fail

Most restaurant inventory systems compare the wrong thing.
They compare local stock records or supplier SKUs across locations as if those were semantic equivalents.

That fails immediately when:
- locations stock different pack sizes
- vendors differ by island, region, or venue type
- one kitchen carries a premium variant and another carries a standard variant

## Comparison anchor

Canonical ingredient identity is the only safe comparison anchor for cross-location intelligence.

Use canonical ingredient identity to compare:
- usage behavior
- waste behavior
- recipe ingredient meaning
- broad cost behavior at the semantic ingredient layer

## Inventory item layer

Inventory items may differ across locations because the operation differs.
That is normal.

Examples:
- one location counts `extra virgin olive oil 1 L bottle`
- another counts `extra virgin olive oil 500 ml bottle`

Those may still map to the same canonical ingredient.

## Vendor item layer

Vendor items may differ even more aggressively:
- different vendors
- different pack sizes
- different catalog names
- different invoice descriptions

Those should not break canonical comparison.

## Safe benchmarking examples

### Safe
Compare recipe cost pressure for canonical ingredient `shrimp` across locations even if one location buys frozen peeled shrimp and another buys head-on shrimp only after operational mapping normalizes the comparison.

### Safe
Compare waste behavior for canonical ingredient `romaine lettuce` across locations once local inventory items are resolved to the same canonical anchor.

## Unsafe benchmarking examples

### Unsafe
Compare `Sysco EVOO 6 x 1 L case` directly against `US Foods EVOO 4 x 1.5 L case` as if those were the same identity layer.

### Unsafe
Compare local inventory item names across locations without canonical resolution.

## Rule for future benchmarking

- benchmark semantic meaning at the canonical ingredient layer
- benchmark kitchen operations at the inventory item layer when operational differences matter
- benchmark supplier behavior at the vendor item layer when purchasing differences matter

Do not blur those scopes.
