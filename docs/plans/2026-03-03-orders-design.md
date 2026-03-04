# Orders Feature Design

## Goal

Turn reorder suggestions into vendor-grouped order lists that can be printed or copied for sending to vendors. Track order history with draft/sent status.

## Architecture

Vendor table with minimal fields (name, notes). Items get an optional vendor_id FK. Orders are saved with line items snapshotting price/quantity at creation time. Order generator pulls from existing reorder suggestions endpoint and groups by vendor. No receiving workflow — use existing transaction system to log stock in when goods arrive.

## Data Model

### vendors table

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| name | TEXT NOT NULL UNIQUE | |
| notes | TEXT | Optional — phone, email, account #, etc. |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### items table change

Add `vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL` — nullable.

### orders table

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| vendor_id | INTEGER FK | References vendors(id) |
| status | TEXT | 'draft' or 'sent' |
| notes | TEXT | Optional |
| total_estimated_cost | REAL | Sum of line totals |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### order_items table

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| order_id | INTEGER FK | References orders(id) ON DELETE CASCADE |
| item_id | INTEGER FK | References items(id) |
| quantity | REAL | In order units |
| unit | TEXT | Unit being ordered in |
| unit_price | REAL | Snapshot of price at order time |
| line_total | REAL | quantity × unit_price |

## Vendor Management

No separate page. "Manage Vendors" modal accessible from Orders page header (same pattern as Manage Areas modal):

- List vendors with inline edit for name and notes
- Add new vendor at bottom
- Delete vendor (only if no items assigned)

Vendor assignment to items: add "Vendor" dropdown column to Inventory table in the Stock column group. Inline select, nullable.

## Orders Page

New `/orders` route with two tab views:

### Order Generator tab (default)

- Pulls reorder suggestions, groups by vendor
- Unassigned items (no vendor) grouped at bottom
- Each vendor group shows: item name, suggested qty (editable), unit, unit price, line total
- Running total per vendor, grand total
- Per-vendor actions: "Create Order" (saves draft) and "Print / Copy" (direct output)

### Order History tab

- Table: date, vendor, item count, total cost, status (draft/sent)
- Click to view detail
- Draft orders: editable, deletable, can mark "Sent"
- Sent orders: read-only, can reprint/copy

### Print-friendly view

- Clean layout: vendor name, date, item table, total
- "Copy to Clipboard" button — plain text for email/text
- Browser print works cleanly (hides nav/chrome)

## API Endpoints

### Vendors

- `GET /api/vendors` — list all
- `POST /api/vendors` — create `{ name, notes? }`
- `PUT /api/vendors/:id` — update
- `DELETE /api/vendors/:id` — fails if items reference vendor

### Orders

- `GET /api/orders` — list with vendor name, item count
- `GET /api/orders/:id` — detail with line items
- `POST /api/orders` — create `{ vendor_id, notes?, items: [{ item_id, quantity, unit, unit_price }] }`
- `PUT /api/orders/:id` — update draft (fails if sent)
- `PATCH /api/orders/:id/status` — mark sent `{ status: 'sent' }`
- `DELETE /api/orders/:id` — delete draft (fails if sent)

### Items change

Add `vendor_id` to updateItemSchema. Existing PUT /api/items/:id handles updates.

## Nav Update

Add "Orders" to sidebar between Inventory and Counts. Use ShoppingCart icon from lucide-react.

## Tech Decisions

- SQLite first, Supabase stubs (notImplemented / empty arrays)
- No receiving workflow — existing Received transactions handle that
- Draft/sent only — no complex PO lifecycle
- Price snapshot on order creation — independent of item price changes later
- Vendor delete protection — can't delete vendor with assigned items
