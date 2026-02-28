# FifoFlow v1 Design

Inventory tracking system for a multi-venue food & beverage hospitality operation in Hawaii (dinner cruises and entertainment venues).

## Tech Stack

- **Monorepo**: npm workspaces
- **Frontend**: React + Vite + Tailwind CSS + TanStack Query
- **Backend**: Node.js + Express + better-sqlite3
- **Language**: TypeScript throughout
- **Shared**: Zod schemas for validation, shared types/enums

## Project Structure

```
fifoflow/
├── packages/
│   ├── client/      # React + Vite
│   ├── server/      # Express + SQLite
│   └── shared/      # Types, validation, constants
├── package.json     # Workspace root
└── README.md
```

## Data Model

### items

| Column      | Type    | Notes                                          |
|-------------|---------|------------------------------------------------|
| id          | INTEGER | PK AUTOINCREMENT                               |
| name        | TEXT    | NOT NULL                                       |
| category    | TEXT    | NOT NULL, enum-checked                         |
| unit        | TEXT    | NOT NULL                                       |
| current_qty | REAL    | DEFAULT 0, running total updated per tx        |
| created_at  | TEXT    | DEFAULT CURRENT_TIMESTAMP, ISO 8601            |
| updated_at  | TEXT    | DEFAULT CURRENT_TIMESTAMP, updated via trigger |

**Categories**: Produce, Meats, Seafood, Dairy, Dry Goods, Beverages, Supplies, Equipment

**Units**: each, lb, oz, gal, qt, case, bag, box, bottle

### transactions

| Column     | Type    | Notes                        |
|------------|---------|------------------------------|
| id         | INTEGER | PK AUTOINCREMENT             |
| item_id    | INTEGER | NOT NULL, FK → items(id)     |
| type       | TEXT    | NOT NULL, 'in' or 'out'      |
| quantity   | REAL    | NOT NULL, always positive    |
| reason     | TEXT    | NOT NULL, enum-checked       |
| notes      | TEXT    | Optional                     |
| created_at | TEXT    | DEFAULT CURRENT_TIMESTAMP    |

**Reasons**: Received, Used, Wasted, Transferred, Returned, Adjustment

### Quantity Strategy

Maintain `current_qty` as a running total updated atomically within a SQLite transaction (INSERT tx row + UPDATE item qty). A reconciliation endpoint recalculates all quantities from the transaction ledger and flags mismatches.

## API Routes

| Method | Route                         | Purpose                              |
|--------|-------------------------------|--------------------------------------|
| GET    | /api/items                    | List items (?search, ?category)      |
| GET    | /api/items/:id                | Get item with recent transactions    |
| POST   | /api/items                    | Create item                          |
| PUT    | /api/items/:id                | Update item metadata                 |
| DELETE | /api/items/:id                | Delete item (blocked if has history) |
| POST   | /api/items/:id/transactions   | Log inventory movement               |
| GET    | /api/transactions             | List transactions (filters, paging)  |
| GET    | /api/dashboard/stats          | Dashboard statistics                 |
| POST   | /api/reconcile                | Recalculate qty, return mismatches   |

## Frontend Pages

1. **Dashboard** (`/`) — Stats cards + recent activity feed
2. **Inventory** (`/inventory`) — Searchable/filterable item list, stock indicators, add item
3. **Item Detail** (`/inventory/:id`) — Edit item, log transactions, transaction history
4. **Activity Log** (`/activity`) — Full chronological transaction feed with filters

## Design Direction

- Dark theme, operational/utilitarian
- Monospace typography (IBM Plex Mono)
- Colors: background #0F1419, green #34D399 (in), red #F87171 (out), amber #E8A838 (warning)
- Mobile-friendly, dense layout

## Key Decisions

- **Delete protection**: Block deletion of items with transaction history
- **Validation**: Zod schemas in shared package, used by both client and server
- **State management**: TanStack Query for server state
- **Low stock threshold**: Hardcoded ≤5 for v1 (par levels come later)
- **Future columns**: storage_area_id, cost, vendor_id, par_min, par_max, venue_id — added later via ALTER TABLE
