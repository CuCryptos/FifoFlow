# Reports / Analytics Design

## Goal

Add a reports page with three tabbed views (Usage, Waste, Cost) providing server-side aggregated data with date range filtering. Tables and summary cards only — no charts.

## Architecture

Three new server endpoints (`/api/reports/usage`, `/api/reports/waste`, `/api/reports/cost`) perform SQL aggregation and return grouped summaries. A new `/reports` client page with tabs consumes these endpoints. All queries take `start` and `end` date parameters (default: last 30 days).

## API Endpoints

### GET /api/reports/usage

Query params: `start`, `end`, `group_by` (day|week, default: day)

Returns transaction volume grouped by item and optionally by time period.

```json
{
  "rows": [{ "period": "2026-03-01", "item_name": "...", "category": "...", "in_qty": 10, "out_qty": 5, "tx_count": 3 }],
  "totals": { "in_qty": 100, "out_qty": 50, "tx_count": 30 }
}
```

### GET /api/reports/waste

Query params: `start`, `end`

Returns transactions with reason "Wasted", grouped by item.

```json
{
  "rows": [{ "item_name": "...", "category": "...", "quantity": 5, "estimated_cost": 12.50 }],
  "totals": { "quantity": 25, "estimated_cost": 87.50 }
}
```

### GET /api/reports/cost

Query params: `start`, `end`, `group_by` (category|vendor, default: category)

Returns cost analysis grouped by category or vendor.

```json
{
  "rows": [{ "group_name": "Produce", "in_cost": 500, "out_cost": 300, "net_cost": 200, "tx_count": 15 }],
  "totals": { "in_cost": 2000, "out_cost": 1500, "net_cost": 500 }
}
```

## Shared Types

- `UsageRow`, `UsageReport` (rows + totals)
- `WasteRow`, `WasteReport`
- `CostRow`, `CostReport`

## UI Design

### Reports page (`/reports`)

- Date range picker at top with presets: Today, 7 Days, 30 Days, 90 Days
- Three tabs: Usage | Waste | Cost

### Usage tab

- Summary cards: Total In, Total Out, Transaction Count
- Table: Item Name | Category | In Qty | Out Qty | Transactions
- Group-by toggle: Day or Week

### Waste tab

- Summary cards: Total Waste Qty, Total Waste Cost
- Table: Item Name | Category | Qty Wasted | Est. Cost
- Sorted by highest cost waste

### Cost tab

- Summary cards: Total In Cost, Total Out Cost, Net Cost
- Group-by toggle: Category or Vendor
- Table: Group Name | In Cost | Out Cost | Net Cost | Transactions

## Tech Decisions

- Server-side SQL aggregation (not client-side) for performance
- Tables only, no chart library dependency
- Date range defaults to last 30 days
- Reuses existing table styling from Inventory/Activity pages
- No new database tables — queries aggregate from existing transactions + items tables
