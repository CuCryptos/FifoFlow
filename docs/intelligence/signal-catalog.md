# FIFOFlow Signal Catalog

Signals are deterministic operational observations. They describe a condition with a clear detection rule, a bounded time window, and evidence references.

## Signal record expectations

Every signal should include at least:
- `signal_type`
- `subject_type`
- `subject_id`
- `scope_context`
- `window_start`
- `window_end`
- `observed_at`
- `severity_label`
- `confidence_label`
- `rule_version`
- `evidence_payload`

## PRICE_INCREASE

- Signal purpose: flag a material increase in normalized unit cost for a vendor item or inventory item.
- Required source data: `invoice_lines`, `vendor_price_history`, `vendor_items`, `inventory_items`.
- Deterministic detection logic: compare the latest normalized unit price against the prior effective price for the same vendor item; emit when increase exceeds configured threshold, such as `>= 5%` or `>= $0.25` normalized base-unit delta.
- Output fields: prior price, current price, pct_change, absolute_change, effective dates, vendor item reference, inventory item reference.
- Severity considerations: higher severity when the item is high-spend, recipe-critical, or change exceeds a larger threshold.
- Example evidence payload:
```json
{
  "vendor_item_id": 442,
  "inventory_item_id": 91,
  "prior_unit_price": 6.4,
  "current_unit_price": 7.12,
  "normalized_unit": "lb",
  "pct_change": 0.1125,
  "invoice_line_ids": [1884, 1932]
}
```
- Example operator-facing explanation: `Ahi Tuna from Vendor Item 442 increased 11.3% since the last invoice. Current normalized cost is $7.12/lb, up from $6.40/lb.`

## PRICE_DROP

- Signal purpose: identify meaningful cost improvement or possible invoice/mapping anomalies.
- Required source data: `invoice_lines`, `vendor_price_history`, `vendor_items`.
- Deterministic detection logic: compare latest normalized unit price against prior effective price and emit when decrease exceeds threshold, such as `<= -5%`.
- Output fields: prior price, current price, pct_change, vendor item reference, invoice evidence.
- Severity considerations: usually lower severity than increases unless large enough to suggest a mapping error.
- Example evidence payload:
```json
{
  "vendor_item_id": 517,
  "inventory_item_id": 133,
  "prior_unit_price": 2.18,
  "current_unit_price": 1.92,
  "normalized_unit": "each",
  "pct_change": -0.1193,
  "invoice_line_ids": [2101, 2140]
}
```
- Example operator-facing explanation: `Fuji Apple cost dropped 11.9% versus the previous invoice. Confirm the pack and invoice mapping before updating purchasing assumptions.`

## PRICE_VOLATILITY

- Signal purpose: surface unstable pricing that makes recipe cost and purchasing discipline unreliable.
- Required source data: `vendor_price_history`, `invoice_lines`.
- Deterministic detection logic: compute price range or coefficient of variation over a lookback window, for example 6 invoice observations in 60 days; emit when variance exceeds configured volatility threshold.
- Output fields: observation_count, min_price, max_price, avg_price, volatility_metric, lookback_days.
- Severity considerations: higher severity on staple items or preferred vendor items.
- Example evidence payload:
```json
{
  "vendor_item_id": 612,
  "inventory_item_id": 55,
  "lookback_days": 60,
  "observation_count": 7,
  "min_price": 19.8,
  "max_price": 26.2,
  "avg_price": 23.1,
  "coefficient_of_variation": 0.118
}
```
- Example operator-facing explanation: `This vendor SKU has shown unstable pricing across the last 7 invoices. Recipe and reorder planning should not assume a steady cost.`

## RECIPE_COST_DRIFT

- Signal purpose: detect meaningful movement in total recipe cost.
- Required source data: `recipe_versions`, `recipe_ingredients`, `vendor_price_history`, `inventory_items`.
- Deterministic detection logic: recalculate current recipe cost using latest normalized item costs and compare to prior snapshot; emit when total change exceeds threshold, such as `>= 4%`.
- Output fields: recipe_version_id, prior_total_cost, current_total_cost, pct_change, top_contributing_items.
- Severity considerations: higher severity for menu-critical recipes or multi-ingredient drift driven by proteins.
- Example evidence payload:
```json
{
  "recipe_version_id": 83,
  "prior_total_cost": 14.22,
  "current_total_cost": 15.41,
  "pct_change": 0.0837,
  "top_contributors": [
    {"inventory_item_id": 91, "delta": 0.72},
    {"inventory_item_id": 207, "delta": 0.29}
  ]
}
```
- Example operator-facing explanation: `Recipe cost for Seared Ahi Plate increased 8.4% since the last cost snapshot, driven mostly by tuna and sesame oil.`

## COUNT_VARIANCE

- Signal purpose: capture a material mismatch between counted quantity and system quantity.
- Required source data: `inventory_count_lines`, `inventory_count_sessions`, `stock_transactions`, `item_storage_assignments`.
- Deterministic detection logic: emit when absolute or percentage variance exceeds configured tolerance for the inventory item.
- Output fields: system_qty, counted_qty, variance_qty, variance_pct, storage_area_id, count_session_id.
- Severity considerations: higher severity when the item is high-cost, recurring, or tied to unresolved waste.
- Example evidence payload:
```json
{
  "inventory_item_id": 91,
  "storage_area_id": 17,
  "count_session_id": 204,
  "system_qty": 28,
  "counted_qty": 21,
  "variance_qty": -7,
  "variance_pct": -0.25
}
```
- Example operator-facing explanation: `Walk In count for Ahi Tuna came in 7 lb below system quantity. This exceeds the allowed count tolerance for the item.`

## COUNT_INCONSISTENCY

- Signal purpose: detect inconsistent count execution quality across repeated sessions.
- Required source data: `inventory_count_sessions`, `inventory_count_lines`.
- Deterministic detection logic: emit when the same item or storage area repeatedly alternates between large positive and negative variances or when counts are repeatedly missing expected items.
- Output fields: session_count, missed_count_count, alternating_variance_count, item or area scope.
- Severity considerations: higher severity when poor count discipline blocks trust in other signals.
- Example evidence payload:
```json
{
  "inventory_item_id": 144,
  "storage_area_id": 9,
  "lookback_sessions": 5,
  "alternating_variance_count": 4,
  "missed_count_count": 2
}
```
- Example operator-facing explanation: `Recent counts for this item are inconsistent. Variances swing between over and under counts, which suggests count discipline or storage assignment issues.`

## WASTE_SPIKE

- Signal purpose: detect an unusual increase in waste for an item or recipe.
- Required source data: `waste_events`, `stock_transactions`, `inventory_items`, optional `recipes`.
- Deterministic detection logic: compare current waste quantity or waste cost in a recent window against historical baseline for the same scope and daypart/week pattern.
- Output fields: baseline_qty, current_qty, baseline_cost, current_cost, waste_reason_breakdown.
- Severity considerations: higher severity for proteins, seafood, or repeated reason-code clusters.
- Example evidence payload:
```json
{
  "inventory_item_id": 91,
  "operation_unit_id": 6,
  "window_days": 7,
  "baseline_qty": 4,
  "current_qty": 13,
  "baseline_cost": 28.4,
  "current_cost": 92.6,
  "reason_counts": {"spoilage": 3, "trim_loss": 2}
}
```
- Example operator-facing explanation: `Waste on Ahi Tuna spiked this week in Paradise Kitchen. Waste quantity is more than 3x the recent baseline.`

## UNMAPPED_PURCHASE

- Signal purpose: surface invoice lines that cannot be confidently mapped to canonical inventory.
- Required source data: `invoice_lines`, `vendor_items`, `inventory_items`, review queue data.
- Deterministic detection logic: emit when invoice line match confidence is below approved threshold or vendor item has no canonical item.
- Output fields: invoice_id, invoice_line_id, vendor_name, raw_line_text, attempted_matches.
- Severity considerations: higher severity when repeated on high-spend vendor items.
- Example evidence payload:
```json
{
  "invoice_id": 602,
  "invoice_line_id": 1884,
  "vendor_id": 14,
  "raw_line_text": "TUNA AHI AAA 2/10LB",
  "attempted_inventory_item_ids": [91, 311],
  "match_confidence": "low"
}
```
- Example operator-facing explanation: `An invoice purchase could not be reliably mapped to an inventory item. Cost and usage analytics for that purchase are incomplete until it is reviewed.`

## UNMAPPED_RECIPE_INGREDIENT

- Signal purpose: detect recipe ingredients that do not resolve cleanly to canonical inventory.
- Required source data: `recipe_ingredients`, `inventory_items`, review queue data.
- Deterministic detection logic: emit when ingredient mapping is missing or unit normalization fails.
- Output fields: recipe_version_id, unresolved_ingredient_label, attempted_item_matches, unit_issue.
- Severity considerations: higher severity when recipe is active in multiple operation units.
- Example evidence payload:
```json
{
  "recipe_version_id": 83,
  "ingredient_label": "Champagne bottle",
  "attempted_inventory_item_ids": [411],
  "unit_issue": "recipe_unit_to_base_unit_missing"
}
```
- Example operator-facing explanation: `A recipe ingredient cannot be normalized to an inventory item, so theoretical usage and recipe cost are incomplete.`

## PURCHASE_TO_THEORETICAL_MISMATCH

- Signal purpose: compare what was bought to what recipe demand suggests should have been required.
- Required source data: `purchase_order_lines`, `invoice_lines`, `forecast_lines`, `menu_item_recipe_mappings`, `recipe_ingredients`, `vendor_price_history`.
- Deterministic detection logic: over a defined window, compare normalized purchased quantity against theoretical required quantity for the same item and scope; emit when delta breaches threshold.
- Output fields: purchased_qty, theoretical_qty, delta_qty, delta_pct, scope window.
- Severity considerations: higher severity when persistent on expensive or volatile items.
- Example evidence payload:
```json
{
  "inventory_item_id": 207,
  "location_id": 2,
  "window_days": 14,
  "purchased_qty": 192,
  "theoretical_qty": 126,
  "delta_qty": 66,
  "delta_pct": 0.5238
}
```
- Example operator-facing explanation: `Purchasing for this item exceeded theoretical recipe demand by 52% over the last two weeks.`

## OVER_ORDER_PATTERN_CANDIDATE

- Signal purpose: mark a candidate condition where purchasing repeatedly exceeds demand and available storage needs.
- Required source data: `invoice_lines`, `purchase_order_lines`, `item_storage_assignments`, `forecast_lines`, `recipe_ingredients`.
- Deterministic detection logic: emit when purchased quantity repeatedly exceeds theoretical demand plus par coverage threshold in recent windows.
- Output fields: purchased_qty, theoretical_qty, par_qty, on_hand_qty, excess_qty.
- Severity considerations: higher severity for perishable items and constrained storage.
- Example evidence payload:
```json
{
  "inventory_item_id": 91,
  "location_id": 2,
  "window_days": 21,
  "purchased_qty": 220,
  "theoretical_qty": 160,
  "par_qty": 24,
  "on_hand_qty": 38,
  "excess_qty": 36
}
```
- Example operator-facing explanation: `Recent purchasing on this item appears above forecasted demand and par coverage. FIFOFlow is watching for an over-ordering pattern.`

## UNDER_ORDER_PATTERN_CANDIDATE

- Signal purpose: mark a candidate condition where purchasing repeatedly fails to cover demand.
- Required source data: `invoice_lines`, `purchase_order_lines`, `forecast_lines`, `recipe_ingredients`, `stock_transactions`.
- Deterministic detection logic: emit when purchased quantity plus opening balance repeatedly falls short of theoretical demand and count-adjusted depletion.
- Output fields: purchased_qty, theoretical_qty, stockout_events, shortage_qty.
- Severity considerations: higher severity when stockouts hit menu-critical items.
- Example evidence payload:
```json
{
  "inventory_item_id": 55,
  "location_id": 2,
  "window_days": 14,
  "purchased_qty": 42,
  "theoretical_qty": 61,
  "stockout_event_count": 3,
  "shortage_qty": 19
}
```
- Example operator-facing explanation: `Recent purchasing has not covered expected demand. This item is showing signs of recurrent under-ordering.`

## YIELD_DRIFT

- Signal purpose: detect a sustained gap between expected recipe/prep yield and observed yield.
- Required source data: `recipe_versions`, `prep_batches`, `prep_consumptions`, `stock_transactions`, `inventory_count_lines`.
- Deterministic detection logic: compare expected yield or loss factor against observed output over repeated prep runs; emit when drift exceeds threshold.
- Output fields: expected_yield_pct, observed_yield_pct, drift_pct, recipe_version_id, batch_count.
- Severity considerations: higher severity when the recipe is high-volume or high-cost.
- Example evidence payload:
```json
{
  "recipe_version_id": 103,
  "batch_count": 6,
  "expected_yield_pct": 0.92,
  "observed_yield_pct": 0.84,
  "drift_pct": -0.08
}
```
- Example operator-facing explanation: `Observed prep yield is running below the expected recipe yield. The recipe or prep process should be reviewed.`
