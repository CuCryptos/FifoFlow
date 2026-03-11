# Snack Bar Sales Tracking — Design

**Date:** 2026-03-10

## Overview

Add sales tracking for the employee Snack Bar. Employees purchase snacks at a set price; the system logs each sale, decrements inventory, and provides analytics on revenue and trends.

## Data Model

### New `sale_price` column on `items` table

- `sale_price REAL` — nullable, only relevant for items sold at the snack bar

### New `sales` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `item_id` | INTEGER FK | References items |
| `quantity` | REAL | Amount sold |
| `sale_price` | REAL | Price per unit at time of sale |
| `total` | REAL | quantity x sale_price |
| `created_at` | TEXT | Timestamp of sale |

### Inventory Integration

Each sale creates a companion "out" transaction with `reason = 'Used'` and `from_area_id` set to the Snack Bar storage area. This keeps inventory counts accurate using the existing transaction system.

## Backend

### Store Methods

- `createSale(input)` — inserts sale row + creates "out" transaction from Snack Bar area atomically (single DB transaction)
- `listSales(filters)` — list sales with optional date range filter
- `getSalesSummary(filters)` — aggregated stats: total revenue, items sold, top sellers, daily/weekly/monthly breakdowns

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sales` | Record a sale (item_id, quantity) |
| `GET` | `/api/sales` | List sales (filterable by date range) |
| `GET` | `/api/sales/summary` | Aggregated revenue, top sellers, trends |

The existing `PUT /api/items/:id` handles `sale_price` as another editable field.

## Frontend

### Navigation

New top-level "Snack Bar" page at `/snack-bar` in the main navigation.

### Tabs

**1. Inventory & Quick Sell (default)**
- Shows items with stock in the "Snack Bar" storage area
- Each row: item name, current qty, sale price, "Sell" button
- Sell button opens modal: enter quantity (defaults to 1), confirm to record sale
- Inline editable sale price

**2. Sales Log**
- Filterable table of all sales: date/time, item name, quantity, unit price, total
- Date range filter: today, this week, this month, custom
- Sortable columns

**3. Analytics**
- Summary cards: revenue today, this week, this month
- Revenue over time line chart (daily/weekly/monthly toggle)
- Top sellers bar chart (by quantity or revenue)
- Profit margin per item (sell price vs vendor purchase cost)
- Date range picker for all charts

### Chart Library

Recharts — React-native composable charting components.

## Item Designation

Items appear in the Snack Bar page automatically if they have stock in the "Snack Bar" storage area. No separate flag needed.
