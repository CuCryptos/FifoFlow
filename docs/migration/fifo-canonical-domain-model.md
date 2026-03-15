# FIFOFlow Canonical Domain Model

This document defines the target vNext domain model for FIFOFlow.

Scope:
- Preserve legacy SQLite production truth.
- Normalize the operating model for food and hospitality inventory.
- Support deterministic intelligence and governance before opaque AI workflows.
- Remain platform-agnostic while leaning toward PostgreSQL-compatible modeling.

Classification rules:
- `operational`: user-entered or system-recorded business facts.
- `derived`: snapshots, signals, or observations computed from facts.
- `governance`: recommendations, standards, decisions, and adoption records.

## Modeling principles

- An inventory item is not enough. FIFOFlow needs purchasing, recipe, menu, count, and governance entities.
- Facts should be append-friendly and traceable.
- Derived intelligence should never overwrite operational truth.
- Standards should be versioned and scoped, not stored as ad hoc fields.
- Lineage is mandatory between legacy facts and canonical facts.

## Organizations

### organization

- Purpose: top-level tenant boundary for all operational and governance data.
- Why it exists: future multi-location support requires a clear owner for catalogs, standards, and permissions.
- Core fields: `id`, `name`, `code`, `status`, `timezone`, `created_at`, `updated_at`.
- Key relationships: has many `locations`, `vendors`, `inventory_categories`, `inventory_items`, `standards`.
- Data type: `operational`.

## Locations

### location

- Purpose: physical site or venue group where inventory is counted, received, and consumed.
- Why it exists: a dinner cruise operation, luau, or restaurant site needs distinct operational context.
- Core fields: `id`, `organization_id`, `name`, `code`, `location_type`, `status`, `created_at`, `updated_at`.
- Key relationships: belongs to `organization`; has many `operation_units`, `storage_areas`, `location_item_settings`, `purchase_orders`, `invoices`, `count_sessions`, `forecasts`.
- Data type: `operational`.

## Kitchens / Outlets

### operation_unit

- Purpose: operational sub-location such as a kitchen, bar, snack bar, bakery, buffet line, or catering program.
- Why it exists: FIFOFlow needs to separate where demand and depletion happen from where inventory is stored.
- Core fields: `id`, `location_id`, `name`, `code`, `operation_unit_type`, `status`, `created_at`, `updated_at`.
- Key relationships: belongs to `location`; referenced by `menu_items`, `waste_events`, `stock_transactions`, `forecast_lines`, `recommendations`.
- Data type: `operational`.

## Storage Areas

### storage_area

- Purpose: physical inventory holding area such as walk-in, freezer, dry storage, snack bar cage, or linen.
- Why it exists: count workflows and transfers depend on physical storage context.
- Core fields: `id`, `location_id`, `name`, `area_type`, `status`, `created_at`, `updated_at`.
- Key relationships: belongs to `location`; has many `item_storage_assignments`, `count_session_lines`, `stock_transactions`.
- Data type: `operational`.

## Inventory Categories

### inventory_category

- Purpose: governed classification for items such as produce, beer, spirits, supplies, bakery, or equipment.
- Why it exists: legacy category fields are useful but need normalization for reporting and standards.
- Core fields: `id`, `organization_id`, `name`, `parent_category_id`, `sort_order`, `is_active`, `created_at`, `updated_at`.
- Key relationships: belongs to `organization`; has many `inventory_items`.
- Data type: `operational`.

## Inventory Items

### inventory_item

- Purpose: canonical inventory record for a purchasable / countable thing.
- Why it exists: the current SQLite `items` table mixes catalog, pricing hints, storage hints, and venue hints. vNext needs a cleaner master item.
- Core fields: `id`, `organization_id`, `category_id`, `name`, `display_name`, `base_unit`, `status`, `item_type`, `default_pack_size_value`, `default_pack_size_unit`, `created_at`, `updated_at`.
- Key relationships: belongs to `organization` and `inventory_category`; has many `location_item_settings`, `item_storage_assignments`, `vendor_items`, `recipe_ingredients`, `stock_transactions`, `invoice_lines`, `purchase_order_lines`, `count_session_lines`, `waste_events`.
- Data type: `operational`.

### location_item_setting

- Purpose: location-specific operating defaults for a canonical item.
- Why it exists: pars, preferred vendor, preferred pack, count cadence, or operation-unit routing can differ by location.
- Core fields: `id`, `location_id`, `inventory_item_id`, `preferred_vendor_id`, `preferred_vendor_item_id`, `reorder_level`, `reorder_qty`, `count_frequency`, `is_active`, `created_at`, `updated_at`.
- Key relationships: belongs to `location` and `inventory_item`; optionally references `vendor` and `vendor_item`.
- Data type: `operational`.

## Item Storage Assignments

### item_storage_assignment

- Purpose: current quantity and handling assignment of an item in a storage area.
- Why it exists: the legacy `item_storage` table is operationally important and should remain first-class.
- Core fields: `id`, `storage_area_id`, `inventory_item_id`, `on_hand_qty`, `par_qty`, `created_at`, `updated_at`.
- Key relationships: belongs to `storage_area` and `inventory_item`.
- Data type: `operational`.

## Vendors

### vendor

- Purpose: supplier master record.
- Why it exists: invoices, pricing, purchase orders, and vendor standards all depend on a governed supplier entity.
- Core fields: `id`, `organization_id`, `name`, `vendor_code`, `status`, `notes`, `created_at`, `updated_at`.
- Key relationships: belongs to `organization`; has many `vendor_items`, `vendor_price_history`, `purchase_orders`, `invoices`.
- Data type: `operational`.

### vendor_item

- Purpose: vendor-specific representation of an inventory item.
- Why it exists: invoice line language, pack size, and ordering unit belong at the vendor-item level, not on the canonical item.
- Core fields: `id`, `vendor_id`, `inventory_item_id`, `vendor_item_name`, `vendor_sku`, `order_unit`, `pack_qty`, `pack_unit`, `is_active`, `created_at`, `updated_at`.
- Key relationships: belongs to `vendor` and `inventory_item`; has many `vendor_price_history`, `purchase_order_lines`, `invoice_lines`.
- Data type: `operational`.

### vendor_price_history

- Purpose: historical pricing timeline for a vendor item.
- Why it exists: intelligence around price drift and price instability needs a time-series fact, not only a latest price field.
- Core fields: `id`, `vendor_item_id`, `effective_at`, `unit_price`, `price_basis_unit`, `source_type`, `source_invoice_line_id`, `confidence_label`, `created_at`.
- Key relationships: belongs to `vendor_item`; may reference `invoice_line`.
- Data type: `operational`.

## Purchase Orders

### purchase_order

- Purpose: planned or issued order to a vendor.
- Why it exists: reorder recommendations need a durable order object with lifecycle state.
- Core fields: `id`, `organization_id`, `location_id`, `vendor_id`, `status`, `ordered_at`, `received_at`, `notes`, `total_estimated_cost`, `created_at`, `updated_at`.
- Key relationships: belongs to `location` and `vendor`; has many `purchase_order_lines`.
- Data type: `operational`.

### purchase_order_line

- Purpose: line-level ordered quantity and expected cost.
- Why it exists: order lines link demand intent to later invoice/receipt evidence.
- Core fields: `id`, `purchase_order_id`, `inventory_item_id`, `vendor_item_id`, `quantity_ordered`, `order_unit`, `unit_price`, `line_total`, `created_at`.
- Key relationships: belongs to `purchase_order`; references `inventory_item` and optionally `vendor_item`.
- Data type: `operational`.

## Invoices

### invoice

- Purpose: vendor invoice or receipt document.
- Why it exists: invoices are the highest-value source for cost, pack, and purchasing intelligence.
- Core fields: `id`, `organization_id`, `location_id`, `vendor_id`, `invoice_number`, `invoice_date`, `received_date`, `document_uri`, `parse_status`, `created_at`, `updated_at`.
- Key relationships: belongs to `location` and `vendor`; has many `invoice_lines`.
- Data type: `operational`.

### invoice_line

- Purpose: line-item purchase evidence from an invoice.
- Why it exists: cost intelligence and vendor-item normalization require invoice-line granularity.
- Core fields: `id`, `invoice_id`, `raw_line_text`, `inventory_item_id`, `vendor_item_id`, `quantity`, `unit`, `unit_price`, `line_total`, `match_confidence_label`, `created_at`.
- Key relationships: belongs to `invoice`; optionally references `inventory_item` and `vendor_item`; may produce `vendor_price_history`.
- Data type: `operational`.

## Recipes

### recipe

- Purpose: logical recipe identity.
- Why it exists: recipes change over time and need versioning rather than mutable line edits on a single record.
- Core fields: `id`, `organization_id`, `name`, `recipe_type`, `status`, `created_at`, `updated_at`.
- Key relationships: belongs to `organization`; has many `recipe_versions`; linked from `menu_item_recipe_mapping`.
- Data type: `operational`.

### recipe_version

- Purpose: versioned recipe definition with yield assumptions.
- Why it exists: recipe costing and theoretical usage must be tied to a specific version in effect at a point in time.
- Core fields: `id`, `recipe_id`, `version_number`, `yield_qty`, `yield_unit`, `effective_from`, `effective_to`, `notes`, `created_at`.
- Key relationships: belongs to `recipe`; has many `recipe_ingredients`; may be referenced by `menu_item_recipe_mapping`, `recipe_cost_snapshot`.
- Data type: `operational`.

### recipe_ingredient

- Purpose: item-level ingredient requirement for a recipe version.
- Why it exists: theoretical usage and recipe costing are impossible without a normalized ingredient list.
- Core fields: `id`, `recipe_version_id`, `inventory_item_id`, `quantity`, `unit`, `prep_loss_pct`, `is_optional`, `created_at`.
- Key relationships: belongs to `recipe_version`; references `inventory_item`.
- Data type: `operational`.

## Menu Items

### menu_item

- Purpose: sellable or forecastable menu product.
- Why it exists: menu demand drives theoretical depletion and ordering needs.
- Core fields: `id`, `organization_id`, `name`, `menu_group`, `status`, `created_at`, `updated_at`.
- Key relationships: belongs to `organization`; has many `menu_item_recipe_mappings`; has many `location_menu_assignments`; referenced by `forecast_lines`.
- Data type: `operational`.

### menu_item_recipe_mapping

- Purpose: maps a menu item to the recipe version that fulfills it.
- Why it exists: a menu item can depend on a recipe version with a multiplier or operation-unit-specific override.
- Core fields: `id`, `menu_item_id`, `recipe_version_id`, `portion_multiplier`, `effective_from`, `effective_to`, `created_at`.
- Key relationships: belongs to `menu_item`; references `recipe_version`.
- Data type: `operational`.

### location_menu_assignment

- Purpose: determines which menu items apply to which operation-unit/location combinations.
- Why it exists: the legacy `product_recipes` concept needs a normalized home in vNext.
- Core fields: `id`, `location_id`, `operation_unit_id`, `menu_item_id`, `is_active`, `created_at`, `updated_at`.
- Key relationships: belongs to `location`, optionally `operation_unit`, and `menu_item`.
- Data type: `operational`.

## Inventory Counts

### inventory_count_session

- Purpose: controlled counting event.
- Why it exists: counts must be auditable, reviewable, and linked to variances.
- Core fields: `id`, `location_id`, `storage_area_id`, `name`, `status`, `counted_at`, `closed_at`, `created_by`, `created_at`.
- Key relationships: belongs to `location`; optionally scoped to `storage_area`; has many `inventory_count_lines`.
- Data type: `operational`.

### inventory_count_line

- Purpose: item-level counted quantity within a count session.
- Why it exists: the legacy count tables need canonical line-level facts with lineage.
- Core fields: `id`, `inventory_count_session_id`, `inventory_item_id`, `storage_area_id`, `system_qty`, `counted_qty`, `variance_qty`, `notes`, `created_at`.
- Key relationships: belongs to `inventory_count_session`; references `inventory_item` and `storage_area`.
- Data type: `operational`.

## Stock Movements

### stock_transaction

- Purpose: immutable inventory movement ledger.
- Why it exists: all actual usage, receipts, transfers, waste, and adjustments must reconcile through one ledger.
- Core fields: `id`, `organization_id`, `location_id`, `operation_unit_id`, `storage_area_id`, `inventory_item_id`, `transaction_type`, `quantity`, `unit`, `reason_code`, `source_type`, `source_id`, `estimated_cost`, `occurred_at`, `created_at`.
- Key relationships: references `inventory_item`, `location`, `storage_area`; may point to `invoice_line`, `inventory_count_line`, `waste_event`, `purchase_order_line`, `prep_batch`.
- Data type: `operational`.

### waste_event

- Purpose: normalized waste capture.
- Why it exists: waste should not hide inside generic transactions if FIFOFlow is to learn operational causes.
- Core fields: `id`, `location_id`, `operation_unit_id`, `inventory_item_id`, `quantity`, `unit`, `waste_reason_code`, `notes`, `occurred_at`, `created_at`.
- Key relationships: belongs to `location`; references `inventory_item`; should emit a `stock_transaction`.
- Data type: `operational`.

### prep_batch

- Purpose: records conversion of ingredients into prep output.
- Why it exists: prep usage is a meaningful intermediate between raw purchasing and menu demand.
- Core fields: `id`, `location_id`, `operation_unit_id`, `recipe_version_id`, `batch_qty`, `batch_unit`, `yield_pct`, `created_at`.
- Key relationships: belongs to `location`; references `recipe_version`; emits `prep_consumption` and `stock_transaction` facts.
- Data type: `operational`.

### prep_consumption

- Purpose: item-level ingredient depletion caused by a prep batch.
- Why it exists: actual usage should distinguish prep-driven depletion from direct service or waste.
- Core fields: `id`, `prep_batch_id`, `inventory_item_id`, `quantity`, `unit`, `created_at`.
- Key relationships: belongs to `prep_batch`; references `inventory_item`.
- Data type: `operational`.

## Forecasts

### forecast

- Purpose: imported or manually maintained demand forecast.
- Why it exists: purchasing intelligence should compare demand projections against buying and stock behavior.
- Core fields: `id`, `organization_id`, `location_id`, `forecast_name`, `source_type`, `start_date`, `end_date`, `created_at`.
- Key relationships: belongs to `location`; has many `forecast_lines`.
- Data type: `operational`.

### forecast_line

- Purpose: line-level forecast quantity for a menu item or event.
- Why it exists: theoretical usage and ordering recommendations need date-grain forecast input.
- Core fields: `id`, `forecast_id`, `forecast_date`, `menu_item_id`, `expected_qty`, `created_at`.
- Key relationships: belongs to `forecast`; references `menu_item`.
- Data type: `operational`.

## Derived Signals

### derived_signal

- Purpose: normalized computed fact or alert precursor.
- Why it exists: deterministic intelligence needs a durable store for what the system observed before it recommends action.
- Core fields: `id`, `signal_type`, `subject_type`, `subject_id`, `location_id`, `observed_at`, `window_start`, `window_end`, `signal_payload`, `confidence_label`, `created_at`.
- Key relationships: references operational subjects; can seed `pattern_observation` and `recommendation`.
- Data type: `derived`.

### pattern_observation

- Purpose: repeated or statistically relevant pattern built from one or more signals.
- Why it exists: recommendations should be based on repeated patterns, not one-off noise.
- Core fields: `id`, `pattern_type`, `subject_type`, `subject_id`, `location_id`, `observation_count`, `first_observed_at`, `last_observed_at`, `pattern_payload`, `confidence_label`, `created_at`.
- Key relationships: built from `derived_signal`; referenced by `recommendation`.
- Data type: `derived`.

## Recommendations

### recommendation

- Purpose: suggested operator action from deterministic logic.
- Why it exists: FIFOFlow should recommend par changes, vendor reviews, recipe reviews, and waste investigation before it governs standards.
- Core fields: `id`, `recommendation_type`, `subject_type`, `subject_id`, `location_id`, `status`, `confidence_label`, `summary`, `action_payload`, `opened_at`, `closed_at`, `created_at`.
- Key relationships: references `pattern_observation`; has many `recommendation_evidence`; may lead to `standard_version`.
- Data type: `governance`.

### recommendation_evidence

- Purpose: traceable evidence bundle attached to a recommendation.
- Why it exists: every recommendation must be explainable from source facts.
- Core fields: `id`, `recommendation_id`, `source_type`, `source_table`, `source_primary_key`, `evidence_payload`, `created_at`.
- Key relationships: belongs to `recommendation`; references source operational or derived data by lineage.
- Data type: `governance`.

## Standards

### standard

- Purpose: governed operational standard identity.
- Why it exists: standards need persistent identity across versions and scope changes.
- Core fields: `id`, `organization_id`, `standard_type`, `subject_type`, `subject_id`, `status`, `created_at`, `updated_at`.
- Key relationships: belongs to `organization`; has many `standard_versions`; has many `standard_scopes`.
- Data type: `governance`.

### standard_version

- Purpose: versioned content of a standard over time.
- Why it exists: a par, preferred vendor, or recipe yield standard can change and needs audit history.
- Core fields: `id`, `standard_id`, `version_number`, `lifecycle_state`, `effective_from`, `effective_to`, `standard_payload`, `created_at`.
- Key relationships: belongs to `standard`; may be created from `recommendation`.
- Data type: `governance`.

### standard_scope

- Purpose: scope binding for a standard version.
- Why it exists: standards may apply org-wide, per location, per operation unit, or per storage area.
- Core fields: `id`, `standard_version_id`, `scope_type`, `scope_primary_key`, `created_at`.
- Key relationships: belongs to `standard_version`.
- Data type: `governance`.

### governance_action

- Purpose: explicit review or decision taken on a recommendation or standard.
- Why it exists: standards lifecycle requires traceable human decisions.
- Core fields: `id`, `action_type`, `actor_id`, `target_type`, `target_id`, `notes`, `created_at`.
- Key relationships: may reference `recommendation`, `standard`, or `standard_version`.
- Data type: `governance`.

## Lifecycle states

Recommendation and standard lifecycles should support:
- `Suggested`
- `Adopted`
- `Proven`
- `Default`
- `Retired`

Meaning:
- `Suggested`: generated but not accepted.
- `Adopted`: accepted for active use.
- `Proven`: repeatedly validated by later signals.
- `Default`: now the standard assumption for future operations.
- `Retired`: no longer appropriate but retained for lineage.

## Migration lineage requirement

Every migrated fact must retain a link back to the legacy source so engineers and operators can trust the rebuild. The lineage design is specified in the migration spec and the draft SQL schema.
