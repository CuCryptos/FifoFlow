# FIFOFlow Legacy Schema Workbook

This workbook is the inspection frame for the preserved SQLite production system.

Preserved snapshot baseline:
- Local backup: [/Users/curtisvaughan/FifoFlow/backups/fifoflow-20260314-165306.db](/Users/curtisvaughan/FifoFlow/backups/fifoflow-20260314-165306.db)
- Generated schema summary: [/Users/curtisvaughan/FifoFlow/docs/migration/generated](/Users/curtisvaughan/FifoFlow/docs/migration/generated)

## Migration behavior glossary

- `direct_map`: move mostly unchanged into canonical table.
- `normalize`: preserve data but restructure into a more normalized canonical shape.
- `split`: one legacy table feeds multiple canonical tables.
- `derived_only`: do not migrate as a canonical operational fact; use only to derive later signals.
- `archive_only`: preserve for history/reference but do not make it active vNext data.
- `manual_review`: requires operator or analyst review before safe migration.

## Workbook columns

| legacy_table_name | row_count | business_purpose | primary_key | major_columns | suspected_relationships | target_canonical_table | migration_behavior | required_transformations | lineage_strategy | risks | review_queue_needed | notes |
|---|---:|---|---|---|---|---|---|---|---|---|---|---|
| items | 389 | Master inventory catalog plus local operating defaults | id | name, category, unit, current_qty, order_unit_price, qty_per_unit, vendor_id, venue_id, storage_area_id | vendors, venues, storage_areas, transactions, recipe_items, order_items | inventory_item, location_item_setting | split | normalize category, separate canonical item from location defaults, map units | migrate each row with per-row lineage | mixed catalog + location semantics | unresolved_item_units | `current_qty` should not become the sole source of stock truth |
| transactions | 16 | Immutable-ish stock movements and manual adjustments | id | item_id, type, quantity, reason, from_area_id, to_area_id, estimated_cost, vendor_price_id | items, storage_areas, vendor_prices | stock_transaction | normalize | map transaction taxonomy, infer source_type, preserve historical timestamps | row-level lineage to stock_transaction | weak taxonomy and sparse history | transaction_classification_review | current volume is small but operationally important |
| vendors | 22 | Supplier master list | id | name, notes | items, orders, vendor_prices | vendor | direct_map | standardize names/codes later | direct row lineage | duplicate naming patterns may appear later | none | low-risk direct migration |
| vendor_prices | 122 | Vendor-specific price and pack records | id | item_id, vendor_id, vendor_item_name, order_unit, order_unit_price, qty_per_unit, is_default | items, vendors, transactions | vendor_item, vendor_price_history | split | separate vendor-item identity from price history, infer effective dates | lineage from one row into two canonical tables where needed | current table mixes identity and latest price | unresolved_vendor_item_matches | likely one of the most important migration tables |
| venues | 11 | Operational venues / demand contexts | id | name, sort_order, show_in_menus | items, product_recipes, forecast_mappings | location or operation_unit | manual_review | determine whether each row is a location or operation_unit | lineage by row plus hierarchy mapping table | venue hierarchy is ambiguous | ambiguous_venue_hierarchy | current decision is to treat most legacy venue rows as operation units |
| storage_areas | 18 | Physical inventory holding areas | id | name | items, item_storage, transactions | storage_area | normalize | attach to resolved location hierarchy | direct row lineage with location binding | areas currently lack explicit location ownership | orphaned_storage_assignments | names are operationally meaningful and should be preserved |
| item_storage | 366 | On-hand quantity per item per storage area | id | item_id, area_id, quantity | items, storage_areas | item_storage_assignment | direct_map | map area_id to canonical storage area, retain quantity snapshot timestamp | direct row lineage | orphaned rows if area hierarchy changes | orphaned_storage_assignments | operationally critical for stock placement |
| orders | 1 | Draft/sent purchase orders | id | vendor_id, status, notes, total_estimated_cost | vendors, order_items | purchase_order | normalize | attach location when inferable; retain status | direct row lineage | sparse data but still useful | none | low volume currently |
| order_items | 7 | Order lines | id | order_id, item_id, quantity, unit, unit_price, line_total | orders, items | purchase_order_line | normalize | attach vendor_item if inferable from defaults/prices | direct row lineage | unit ambiguity | unresolved_vendor_item_matches | useful for purchasing-history bootstrap |
| recipes | 8 | Recipe identities | id | name, type, notes | recipe_items, product_recipes | recipe | direct_map | convert mutable record into recipe identity | direct row lineage | no versioning in legacy | recipe_mapping_gaps | recipe version 1 should mirror legacy recipe |
| recipe_items | 8 | Ingredient lines on recipes | id | recipe_id, item_id, quantity, unit | recipes, items | recipe_version, recipe_ingredient | split | create version 1 for each recipe and attach ingredient rows | lineage from row to recipe_ingredient and parent version | sparse and likely incomplete | recipe_mapping_gaps | quantities need unit validation |
| product_recipes | 16 | Venue/product assignment with portions per guest | id | venue_id, recipe_id, portions_per_guest | venues, recipes | menu_item, location_menu_assignment, menu_item_recipe_mapping | split | resolve whether legacy row represents menu item or menu assignment | lineage row to mapping set | semantics are underspecified | recipe_mapping_gaps | high review value |
| forecasts | 1 | Forecast import batches | id | filename, date_range_start, date_range_end, raw_dates | forecast_entries | forecast | direct_map | attach location if inferable | direct row lineage | depends on venue hierarchy resolution | ambiguous_venue_hierarchy | preserve import provenance |
| forecast_entries | 195 | Forecast quantities by product/date | id | forecast_id, product_name, forecast_date, guest_count | forecasts, forecast_product_mappings | forecast_line | normalize | map product_name to canonical menu item | lineage to forecast_line | unresolved product naming | recipe_mapping_gaps | strong input for theoretical demand |
| forecast_product_mappings | 7 | Product-name to venue mapping rules | id | product_name, venue_id | venues, forecast_entries | menu_item, location_menu_assignment | manual_review | likely seed for menu item canonicalization | lineage to menu/menu assignment mapping | incomplete mapping set | recipe_mapping_gaps | should not be lost even if remapped later |
| count_sessions | 0 | Count event header | id | name, status, template_category | count_entries, count_session_items | inventory_count_session | direct_map | none until data exists | row lineage if rows appear later | empty in preserved snapshot | none | schema present, no historical rows |
| count_entries | 0 | Counted item lines | id | session_id, item_id, previous_qty, counted_qty, delta | count_sessions, items | inventory_count_line | direct_map | none until data exists | row lineage if rows appear later | empty in preserved snapshot | none | schema only |
| count_session_items | 0 | Checklist membership for count sessions | id | session_id, item_id, counted | count_sessions, items | inventory_count_line support | derived_only | only migrate if sessions later matter | lineage optional if rows appear | empty in preserved snapshot | none | use only if count history appears |
| sqlite_sequence | n/a | SQLite autoincrement metadata | name | name, seq | all autoincrement tables | none | archive_only | no canonical mapping | archive at database level | not business data | none | ignore for business migration |

## Review queue candidates

- `unresolved_item_units`
- `unresolved_vendor_item_matches`
- `ambiguous_venue_hierarchy`
- `recipe_mapping_gaps`
- `orphaned_storage_assignments`
- `transaction_classification_review`
