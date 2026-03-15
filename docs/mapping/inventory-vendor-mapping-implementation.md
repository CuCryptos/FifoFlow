# Inventory Vendor Mapping Implementation

## Implemented
- SQLite-backed scoped inventory -> vendor mapping tables and bootstrap.
- Deterministic scoped resolver with precedence: `operation_unit` -> `location` -> `organization`.
- Conservative mapping job with review-ready candidate persistence.
- Vendor cost-lineage helper that resolves trusted vendor items and returns normalized cost metadata.
- SQLite-backed tests for scope precedence, ambiguity handling, idempotent reruns, and lineage lookup.

## Auto-map policy
Automatic mapping is allowed only when FIFOFlow has a single safe answer, such as:
- unique exact vendor-item name overlap
- unique normalized vendor-item name overlap
- unique existing default vendor-price relationship
- only one vendor-price row on record for the inventory item

Ambiguous vendor choices go to `NEEDS_REVIEW`. Missing choices remain `UNMAPPED`.

## Cost-lineage behavior
The lineage helper first resolves the scoped vendor mapping, then looks for explicit `vendor_cost_lineage_records`, then falls back to normalized `vendor_prices` when safe. If no normalized cost can be derived, it returns `missing` explicitly.

## Limitations
- Current runtime treats `vendor_prices` as the vendor-item surrogate.
- Invoice-linked lineage is only available if explicitly populated into `vendor_cost_lineage_records`.
- No UI review workflow exists yet.
- Recipe Cost and Price Intelligence are not fully consuming this bridge yet.

## Blockers before full vendor-item-backed recipe-cost lineage
- A richer vendor-item domain beyond `vendor_prices` rows.
- Durable invoice-linked lineage population at runtime.
- End-to-end recipe-cost candidate sourcing through this bridge.
- Supplier-switch detection and policy-aware routing on top of vendor identity.
