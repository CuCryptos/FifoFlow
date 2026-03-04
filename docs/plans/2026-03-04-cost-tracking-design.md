# Cost Tracking + Inventory Value Design

## Goal

Track estimated cost on every transaction and show total inventory value on the dashboard.

## Architecture

Add `estimated_cost` column to transactions table, auto-calculated server-side at creation time from item's `order_unit_price`. Add `total_inventory_value` to dashboard stats, computed as SUM(current_qty * per-base-unit cost) across all items. Cost is a snapshot at transaction time — historical transactions keep their original cost even if prices change later.

## Data Model Changes

### transactions table

Add `estimated_cost REAL` — nullable. Auto-calculated as `normalizedQty * (order_unit_price / qty_per_unit)`. Null when item has no order_unit_price set.

### DashboardStats type

Add `total_inventory_value: number` — sum of `current_qty * (order_unit_price / COALESCE(qty_per_unit, 1))` for all items with pricing. Items without pricing contribute $0.

## Server Changes

### Transaction creation (transactions.ts)

After existing unit conversion, calculate estimated_cost:
1. `per_base_unit_cost = order_unit_price / (qty_per_unit ?? 1)`
2. `estimated_cost = normalizedQty * per_base_unit_cost`
3. Store on the transaction record

### Dashboard stats (sqliteStore.ts)

Add query: `SELECT COALESCE(SUM(current_qty * order_unit_price / COALESCE(qty_per_unit, 1)), 0) FROM items WHERE order_unit_price IS NOT NULL`

### Store interface

- `createTransaction` passes estimated_cost to INSERT
- Transaction type gets `estimated_cost: number | null`

## Client Changes

### Dashboard

New KPI card "Inventory Value" showing `stats.total_inventory_value` formatted as currency.

### Activity log

Show cost next to quantity on transactions that have estimated_cost (both Dashboard activity section and ItemDetail transaction history).

### TransactionForm

No changes — cost is calculated server-side.

## Tech Decisions

- Cost is auto-calculated, not user-entered (less friction)
- Cost is a snapshot at transaction time (correct for historical tracking)
- Items without order_unit_price have null cost (not $0)
- No new tables or endpoints needed
