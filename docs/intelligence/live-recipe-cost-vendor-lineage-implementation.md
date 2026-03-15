# Live Recipe Cost Vendor Lineage Implementation

## Implemented
- Bridge-backed live recipe-cost candidate source in `recipeCostCandidateSource.ts`.
- `PromotedRecipeCostSourceBridge` now resolves promoted recipes through both scoped mapping layers before emitting candidates.
- Recipe-cost source rows now retain vendor mapping and vendor lineage payloads.
- The live recipe-cost job now constructs a vendor-aware source by default using:
  - promoted recipe read repository
  - canonical inventory repository
  - inventory vendor repository
- Recipe-cost resolution detail now persists vendor-item-backed lineage metadata.

## Metadata now flowing into recipe costing
- canonical ingredient id
- inventory item id
- vendor item id
- vendor item name
- normalized cost base unit
- vendor source type and source ref
- stale flag
- confidence label
- inventory-scope explanation
- vendor-scope explanation

## Fallback strategy
Primary runtime behavior is bridge-backed vendor lineage. A legacy candidate source can still be passed explicitly, but that is now an opt-in fallback rather than the default live path.

## Limitations
- Current runtime still uses `vendor_prices` as the vendor-item surrogate.
- Invoice-linked lineage only exists when explicit lineage records are available.
- Supplier-switch intelligence is not implemented yet.
- Recipe-cost drift thresholds are still not policy-backed.

## Blockers before fully invoice-linked vendor lineage
- automatic population of invoice-linked lineage records
- a first-class vendor-item domain beyond `vendor_prices`
- supplier-switch event detection on top of vendor identity history
