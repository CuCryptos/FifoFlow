# Inventory Table Improvements Design

## Goal

Make the 486-item inventory table fully usable with sortable columns, client-side pagination, sticky headers, bulk actions (category reassign + bulk delete), and toast notifications for user feedback.

## Architecture

All sorting and pagination is client-side — fetch all items once, sort/filter/paginate in the browser. This keeps the API simple and provides instant interaction. Works well for the current scale (~500 items).

Two new server endpoints for bulk operations. A new Toast context provider for app-wide feedback notifications.

## Data Table Enhancements

### Sortable Columns

- Click any column header to sort ascending; click again for descending
- Visual arrow indicator (▲/▼) on active sort column
- Default sort: name ascending
- Sortable columns: Name, Category, Unit, Stock, Order Unit, Price, Qty/Unit, Reorder Level, Reorder Qty
- Sort applies after search/category filter

### Client-Side Pagination

- 50 items per page
- Page controls at bottom of table: Previous / page numbers / Next
- Show max 5 page number buttons with ellipsis for large page counts
- Resets to page 1 when search, filter, or sort changes
- Shows "Showing X–Y of Z items" text

### Sticky Header

- Table thead gets `sticky top-0 z-10` with solid background color
- Prevents transparent overlap while scrolling table body

## Bulk Actions

### Selection

- Checkbox column on the left of each row
- "Select all" checkbox in header toggles all items on current page only
- `selectedIds` stored as `Set<number>` in component state
- Selection clears when page, filter, or search changes

### Bulk Actions Toolbar

- Renders at bottom of the table card when `selectedIds.size > 0`
- Shows: "{N} items selected"
- **Reassign category**: dropdown with all categories + "Apply" button
- **Bulk delete**: red button with confirmation dialog; respects delete protection (items with transaction history cannot be deleted)

## Server Endpoints

### PATCH /api/items/bulk

Request: `{ ids: number[], updates: { category: string } }`
Response: `{ updated: number }`

Validates category against schema. Updates all matching items.

### DELETE /api/items/bulk

Request: `{ ids: number[] }`
Response: `{ deleted: number, skipped: number, skippedIds: number[] }`

Checks each item for transaction history. Deletes only items with zero transactions. Returns count of skipped items so the UI can report "Deleted 5 items, 2 skipped (have transaction history)".

## Toast Notification System

- New `ToastContext` provider wrapping the app
- `useToast()` hook returns `{ toast }` function
- Types: success (green border), error (red border), info (neutral border)
- Auto-dismiss after 4 seconds
- Renders as fixed stack in bottom-right corner
- Max 3 visible toasts; oldest dismissed when exceeded

## Tech Decisions

- No external table library (keep it lightweight, existing table structure is fine)
- Client-side sort/pagination (486 items is well within browser performance)
- Bulk endpoints use POST body for ids (not query params) to handle large selections
- Toast context avoids prop drilling across components
