# Vendor Cost Lineage Model

## Lineage anchor
Normalized cost lineage must attach to vendor item identity, not directly to inventory items or recipe rows.

A complete explanation should be able to answer:
- which inventory item was fulfilled
- which vendor item supplied it
- what normalized unit cost was used
- what source evidence produced that cost
- what scope selected that vendor item

## Cost evidence types
Supported lineage evidence types in this phase:
- `invoice_linked_cost`
- `vendor_price_history`
- `fallback_cost_record`
- `missing`

`invoice_linked_cost` is strongest when present. `vendor_price_history` is the current runtime fallback when `vendor_prices` can be normalized safely. `fallback_cost_record` remains future-facing. `missing` is explicit refusal.

## Normalization rules
Normalized cost requires a vendor item plus enough pack metadata to compute base-unit cost. In the current runtime that means one of:
- `order_unit_price / qty_per_unit`
- exact unit parity between `order_unit` and base unit

If pack metadata is insufficient, FIFOFlow must not fabricate a normalized cost.

## Freshness and staleness
Lineage records may carry `effective_at` and optional `stale_at`. If no explicit stale boundary exists, FIFOFlow may mark older evidence stale using a deterministic age threshold. Stale evidence is degraded, not silently treated as fresh.

## Supplier-switch implications
Supplier switches should later appear as vendor-item identity changes even when the inventory item remains the same. That is why invoice descriptions and raw vendor text must never become identity shortcuts.
