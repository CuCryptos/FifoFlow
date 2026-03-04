# Multi-Venue Support Design

## Goal

Add venue support so items can be assigned to venues (Star of Honolulu, Rock a Hula, etc.) and the entire app can be filtered by venue.

## Architecture

Add a `venues` table and a `venue_id` column on items only. Everything else (transactions, reports, dashboard stats, reorder suggestions) scopes through items via JOIN or WHERE clause. Vendors, orders, storage areas, and count sessions remain global. A venue selector in the sidebar lets users switch between venues or view all.

## Data Model

### New `venues` table

Same pattern as storage_areas: `id`, `name`, `created_at`, `updated_at`. UNIQUE constraint on name.

### Items

Add `venue_id INTEGER REFERENCES venues(id)` — nullable. Null means shared/unassigned. Added via existing `addColumnIfMissing` migration pattern.

### No changes to

transactions, storage_areas, item_storage, vendors, orders, count_sessions, count_entries — they scope through items.

## Server Changes

### Venue CRUD

`GET/POST/PUT/DELETE /api/venues` — same pattern as storage area routes. Delete protection: can't delete venue with assigned items.

### Venue filtering on existing endpoints

All optional `?venue_id=N` query param:

- `GET /api/items` — `WHERE venue_id = ?`
- `GET /api/dashboard/stats` — All item count queries add `AND venue_id = ?`
- `GET /api/reports/*` — Filter via `JOIN items` with `AND i.venue_id = ?`
- `GET /api/items/reorder-suggestions` — Filter items by venue
- `GET /api/transactions` — Filter via `JOIN items` with `AND i.venue_id = ?`

When `venue_id` is not provided, return data for all venues (current behavior).

### Store interface

- Add venue CRUD methods to InventoryStore (list, get, create, update, delete, countItemsForVenue)
- Add optional `venueId` to `ItemListFilters`, `TransactionListFilters`, `ReportFilters`
- Update `getDashboardStats` to accept optional `venueId`

## Client Changes

### VenueContext

React context providing `selectedVenueId` and `setSelectedVenueId`. Stored in localStorage for persistence. `null` = all venues.

### Venue selector

Dropdown in the sidebar below the FIFOFLOW wordmark. Shows all venues + "All Venues" option. Includes "Manage Venues" link to open modal.

### Manage Venues modal

Same pattern as ManageAreasModal — inline edit name, delete protection if items are assigned.

### Hook updates

All data hooks read `selectedVenueId` from context and pass it as query param:
- `useItems`, `useDashboardStats`, `useTransactions`, `useReorderSuggestions`
- `useUsageReport`, `useWasteReport`, `useCostReport`

### Inventory page

Add venue dropdown column (like vendor dropdown). Assign items to venues inline.

### Item create/update schemas

Add optional `venue_id` to createItemSchema and updateItemSchema.

## Tech Decisions

- venue_id on items only — simplest approach, everything else scopes through items
- Nullable venue_id — allows shared/unassigned items visible in all venues
- Vendors, orders, storage areas stay global — shared supplier and storage infrastructure
- VenueContext with localStorage — persists venue selection across page refreshes
- No auth changes — single-tenant, venue is a filter not a security boundary
