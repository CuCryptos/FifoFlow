# FIFOFlow Migration Spec

This document is the working design for migrating the preserved SQLite production system into the canonical vNext model.

The goal is not a fast rewrite. The goal is a safe, explainable migration that protects operational truth and keeps enough lineage to support audits and future intelligence.

## Migration principles

- Do not modify the live production SQLite system during design.
- Treat the preserved SQLite snapshot as the historical source of truth.
- Prefer append-only migrations over in-place reshaping.
- Preserve raw facts first; derive signals later.
- Use deterministic transforms and explicit review queues.
- Do not depend on Supabase-specific assumptions at this stage.

## Source-of-truth rules

- Legacy SQLite remains the authoritative historical source for migrated periods.
- Canonical vNext becomes the authoritative source only after validation and cutover.
- `current_qty` from legacy items is a snapshot, not the full inventory ledger truth.
- Legacy order-unit and pricing fields are preserved but should not be assumed canonical without normalization.

## Lineage requirements

- Every migrated operational row must write a lineage record.
- Lineage must preserve source table, source primary key, target table, target primary key, transform type, and confidence.
- Derived facts should reference canonical operational records, not legacy records directly.

## Dry-run requirements

- Dry-run mode must load and transform data without writing canonical records.
- Dry-run output should include row counts, sample transformed payloads, unresolved references, and review queue inserts.
- Dry runs must be repeatable against the preserved snapshot.

## Validation requirements

- Validate row counts by migrated entity.
- Validate key relationships, especially item-to-vendor, item-to-storage-area, and recipe-to-item.
- Validate quantity/unit conversions before loading recipe and pricing facts.
- Validate nullability and duplicate handling rules before write phase.

## Data quality review queues

- `unresolved_item_units`
- `unresolved_vendor_item_matches`
- `ambiguous_venue_hierarchy`
- `recipe_mapping_gaps`
- `orphaned_storage_assignments`
- `transaction_classification_review`

## Migration lineage table

Lineage is mandatory for trust and auditability.

Required fields:
- `id`
- `migration_run_id`
- `source_table`
- `source_primary_key`
- `target_table`
- `target_primary_key`
- `transform_type`
- `confidence_label`
- `notes`
- `created_at`

Why it is mandatory:
- operators need proof that a canonical row came from a real source fact
- engineers need debuggable migration runs
- recommendations later need explainable provenance
- standards and governance need audit history

## Mapping sections

### Items

- Likely current role: canonical-ish item catalog plus local defaults.
- Target canonical destination: `inventory_item` plus `location_item_setting`.
- Migration logic:
  - create canonical item from legacy name/category/base unit
  - map pricing and reorder defaults into location-scoped settings where possible
  - preserve legacy category text for comparison during category normalization
- Open questions:
  - should some legacy `category` values map to new category groups or remain literal at first cut
  - are some items duplicated by vendor pack rather than by canonical item identity
- Risks:
  - unit normalization drift
  - duplicate item names across service contexts
- Validation checks:
  - count of canonical items after de-duplication rules
  - percentage of items with valid base units
  - percentage of items with resolved category mapping

### Vendors

- Likely current role: supplier master list.
- Target canonical destination: `vendor`.
- Migration logic:
  - direct-map vendor rows with preserved names and notes
  - add canonical codes later if needed
- Open questions:
  - whether vendor codes already exist outside FIFOFlow
- Risks:
  - slight spelling or punctuation duplicates
- Validation checks:
  - vendor count preserved
  - unique names enforced without accidental merges

### Vendor pricing

- Likely current role: current vendor-specific pack and pricing defaults.
- Target canonical destination: `vendor_item` plus `vendor_price_history`.
- Migration logic:
  - create or attach vendor-item identity per `(vendor_id, item_id, vendor_item_name, order_unit, qty_per_unit)`
  - insert price-history row using preserved current price as an effective snapshot
- Open questions:
  - whether multiple legacy rows represent historical prices or concurrent pack options
- Risks:
  - one legacy row may mix identity and a mutable latest price
- Validation checks:
  - every migrated price row maps to a vendor-item
  - no vendor-price row is dropped silently

### Venues

- Likely current role: mixed operational context containing service tiers, kitchens, and demand groupings.
- Target canonical destination: `location` and primarily `operation_unit`.
- Migration logic:
  - do not auto-finalize hierarchy
  - load legacy venue rows into a staging map
  - classify rows into `location`, `operation_unit`, or review queue
- Open questions:
  - whether `Bar - SOH`, `Paradise Kitchen`, and `RAH` are peer operation units under a shared location
  - whether `Nova 5-STAR (5SD)` and similar rows are service programs rather than physical locations
- Risks:
  - wrong hierarchy will corrupt menu, forecast, and standards scope later
- Validation checks:
  - every venue row receives a classification or review item
  - no child assignment without an approved parent rule

### Storage areas

- Likely current role: physical areas for on-hand quantities.
- Target canonical destination: `storage_area`.
- Migration logic:
  - preserve storage area names
  - attach them to resolved locations through a staging map
- Open questions:
  - whether some areas are shared across multiple operation units at one site
- Risks:
  - orphaned areas if venue hierarchy is unresolved
- Validation checks:
  - all storage areas map to one location or enter review queue

### Item-storage rows

- Likely current role: current quantity by item and storage area.
- Target canonical destination: `item_storage_assignment`.
- Migration logic:
  - direct-map row into canonical item-storage assignment
  - preserve current quantity as opening balance snapshot
- Open questions:
  - whether opening balances should also seed stock transactions
- Risks:
  - assignment row with unresolved item or unresolved area
- Validation checks:
  - all rows have resolved item and storage area
  - summed assignment quantities compare reasonably to legacy `current_qty`

### Transactions

- Likely current role: sparse stock movement and adjustment history.
- Target canonical destination: `stock_transaction`.
- Migration logic:
  - map `type` + `reason` into canonical `transaction_type` and `reason_code`
  - preserve area movement where present
  - preserve estimated cost and vendor price references where present
- Open questions:
  - whether `Transferred` should become one transaction with source and destination or two directional movement facts
- Risks:
  - weak taxonomy in legacy reason strings
  - very sparse history may not fully explain opening balances
- Validation checks:
  - transaction count preserved
  - all reason values mapped to approved taxonomy or review queue

### Recipes

- Likely current role: mutable recipe headers.
- Target canonical destination: `recipe`.
- Migration logic:
  - direct-map each recipe to canonical recipe identity
  - create initial version `1` for each recipe
- Open questions:
  - whether some recipes are actually prep components rather than final products
- Risks:
  - missing version history
- Validation checks:
  - recipe count preserved
  - every recipe gets one initial version

### Recipe-item mappings

- Likely current role: ingredient lines for recipes.
- Target canonical destination: `recipe_ingredient` under `recipe_version`.
- Migration logic:
  - attach legacy ingredient rows to initial recipe version
  - validate unit compatibility with canonical inventory item base unit
- Open questions:
  - whether quantities represent per-batch or per-portion assumptions
- Risks:
  - unit mismatches
  - very low recipe density relative to item catalog
- Validation checks:
  - every ingredient resolves to a canonical item
  - unresolved units create review queue items

### Product-recipe assignments

- Likely current role: legacy bridge between venue and recipe with portions-per-guest.
- Target canonical destination: `menu_item`, `location_menu_assignment`, and `menu_item_recipe_mapping`.
- Migration logic:
  - stage each row as a legacy product mapping
  - create menu item identities where appropriate
  - map venue-linked demand context to location/operation_unit assignment
- Open questions:
  - whether a legacy row is best modeled as a menu item or as a venue serving plan
- Risks:
  - semantics are ambiguous in legacy shape
- Validation checks:
  - all legacy rows preserved in lineage
  - unresolved semantics explicitly queued

### Orders

- Likely current role: draft/sent purchase intent.
- Target canonical destination: `purchase_order` and `purchase_order_line`.
- Migration logic:
  - direct-map order header and lines
  - attach vendor and inferred location if possible
- Open questions:
  - how to resolve location on historical orders if not explicit
- Risks:
  - sparse order history limits learning value at first pass
- Validation checks:
  - order totals and line totals remain consistent

### Forecasts

- Likely current role: imported demand forecast with product-name mappings.
- Target canonical destination: `forecast` and `forecast_line`, plus staging support for `menu_item`.
- Migration logic:
  - preserve forecast file identity
  - normalize product names into canonical menu items where possible
  - route unresolved names into review queue
- Open questions:
  - whether forecast product names correspond to menu items, service packages, or event programs
- Risks:
  - low mapping coverage
- Validation checks:
  - forecast line counts preserved
  - unresolved product names explicitly queued

## Review queue definitions

### unresolved_item_units

- Purpose: capture items whose base, order, or ingredient units cannot be safely normalized.

### unresolved_vendor_item_matches

- Purpose: capture vendor-price rows that cannot be safely attached to a canonical vendor-item identity.

### ambiguous_venue_hierarchy

- Purpose: capture venue rows that may represent locations, operation units, or service programs.

### recipe_mapping_gaps

- Purpose: capture missing or ambiguous recipe, menu, or forecast product mappings.

### orphaned_storage_assignments

- Purpose: capture `item_storage` rows with unresolved item or storage-area hierarchy.

### transaction_classification_review

- Purpose: capture legacy transaction rows that do not map cleanly into the canonical transaction taxonomy.

## Immediate next engineering tasks

- generate table-by-table inspection outputs from the preserved SQLite snapshot
- approve a venue hierarchy strategy
- define canonical unit normalization rules
- define canonical transaction taxonomy
- design the first migration run as dry-run only
