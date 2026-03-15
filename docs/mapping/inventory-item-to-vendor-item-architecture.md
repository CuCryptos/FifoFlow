# Inventory Item to Vendor Item Architecture

## Purpose
Canonical ingredient identity is not enough to explain supplier-backed cost. FIFOFlow still needs a durable bridge from operational inventory identity to the purchasable vendor SKU or pack that actually supplied the item. This bridge preserves the required identity chain:

recipe ingredient -> canonical ingredient -> inventory item -> vendor item

## Why inventory item and vendor item must stay separate
An inventory item represents what the operation stocks and counts. A vendor item represents what a supplier sells. One inventory item may be fulfilled by different vendor packs over time, by location, or by operation unit. If FIFOFlow collapses those identities, supplier switches, pack changes, and price history become impossible to explain cleanly.

## What this layer supports
- Recipe Cost Intelligence: map resolved inventory items to vendor-backed normalized cost evidence.
- Price Intelligence: anchor price movement to the vendor item that actually changed.
- Purchasing Intelligence: reason about preferred supplier SKUs without mutating recipe semantics.
- Supplier-switch explainability: show when the stocked item stayed the same but the supplier pack changed.
- Margin engine readiness: keep ingredient meaning, stocked item, and purchasable SKU distinct.

## Scoped resolution
Mappings are resolved by explicit scope precedence:
1. `operation_unit`
2. `location`
3. `organization`
4. no trusted mapping

This allows the same inventory item to use a different preferred vendor item in a prep kitchen than in a bar, or at one location versus another.

## Preferred and alternate vendor items
The runtime mapping model persists one preferred mapping per inventory item and scope. Alternate plausible vendor items are stored as candidates when FIFOFlow cannot safely choose one automatically. Candidate persistence is review scaffolding, not silent fallback.

## Trust and lineage requirements
A trusted vendor-backed cost path requires:
- a trusted scoped inventory -> vendor mapping
- a normalized unit cost for that vendor item
- source evidence, such as invoice-linked cost or normalized `vendor_price_history`

If any part is missing, FIFOFlow must return an explicit degraded or unresolved outcome instead of inventing certainty.
