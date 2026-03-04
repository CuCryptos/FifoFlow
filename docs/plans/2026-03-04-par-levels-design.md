# Par Levels — Fix Dashboard Low Stock Design

## Goal

Replace the hardcoded `LOW_STOCK_THRESHOLD = 5` with per-item `reorder_level` for the dashboard's Low Stock count. Items without a reorder_level set are not counted.

## Architecture

Remove the global constant and update the SQL query in `getDashboardStats` to use per-item `reorder_level`. The `reorder_level` field already exists on every item (nullable). No new tables, columns, or endpoints needed.

## Changes

### Server

- `getDashboardStats` query changes from `current_qty <= ?` (threshold parameter) to `reorder_level IS NOT NULL AND current_qty <= reorder_level AND current_qty > 0`
- `getDashboardStats` signature drops the `lowStockThreshold` parameter
- Dashboard route no longer imports or passes `LOW_STOCK_THRESHOLD`

### Shared

- Remove `LOW_STOCK_THRESHOLD` constant from `constants.ts`

### Client

- Dashboard Low Stock card subtitle changes from `≤ 5 units` to `below par` or similar
- Remove `LOW_STOCK_THRESHOLD` import from Dashboard

## Tech Decisions

- Items without `reorder_level` are not low stock (not counted, not $0 fallback)
- No new UI components or features — just fixing the metric
- Existing ReorderBadge (OK/REORDER) unchanged
