# Scoped Vendor Mapping Model

## Runtime entities
- `inventory_vendor_mappings`: preferred scoped mapping from inventory item to vendor item.
- `inventory_vendor_mapping_candidates`: reviewable alternate vendor choices.
- `inventory_vendor_mapping_review_events`: review audit trail.
- `vendor_cost_lineage_records`: optional normalized cost evidence anchored to a vendor item.

## Scope behavior
Mappings may exist at:
- organization default
- location override
- operation-unit override

Resolution order is deterministic:
1. exact `operation_unit` mapping
2. exact `location` mapping
3. exact `organization` mapping
4. unresolved

## Mapping states
- `AUTO_MAPPED`: deterministic and trusted.
- `MANUALLY_MAPPED`: human-approved and trusted.
- `NEEDS_REVIEW`: plausible vendor choices exist, but FIFOFlow will not choose one.
- `UNMAPPED`: no safe vendor choice exists.
- `REJECTED`: explicitly blocked from automatic reuse.

## Preferred vs alternate
Only one preferred mapping should be active for an inventory item at a given scope. Alternate items remain candidates until explicitly approved.

## Runtime assumptions
Current SQLite runtime uses `vendor_prices` rows as the vendor-item surrogate. That is an explicit interim assumption, not a claim that the final supplier domain is complete.
