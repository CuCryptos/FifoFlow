# Storage Areas Design

## Overview
Add user-defined storage areas (Walk-in Cooler, Dry Storage, Bar, etc.) with per-area quantity tracking. Items can exist in multiple areas with separate quantities. Transfers between areas are tracked as transactions.

## Data Model

### New `storage_areas` table
- `id` INTEGER PRIMARY KEY
- `name` TEXT NOT NULL UNIQUE
- `created_at`, `updated_at`
- User-defined, simple CRUD

### New `item_storage` junction table
- `item_id` FK → items, `area_id` FK → storage_areas
- `quantity` REAL NOT NULL DEFAULT 0
- UNIQUE(item_id, area_id)
- Source of truth for stock levels

### `items.current_qty` becomes computed
- Always equals SUM of item_storage.quantity for that item
- Updated atomically in transaction handler: update item_storage first, then recalculate current_qty

### Transaction area references
- Add `from_area_id` and `to_area_id` nullable FK columns to transactions
- IN (Received/Returned): to_area_id = destination area
- OUT (Used/Wasted): from_area_id = source area
- Transfer: both from_area_id and to_area_id

### Migration
- Create a "General" storage area as default
- Move all existing item quantities into item_storage rows pointing to General

## Transaction Flow

- Logging in/out now requires selecting an area
- If item is in only one area, auto-select (no extra friction)
- If item is in multiple areas, show area dropdown
- Transfers use existing "Transferred" reason with from-area and to-area
- Single transaction record per transfer (not two separate in/out)
- Atomically decrements source and increments destination

### Validation
- Can't transfer more than source area quantity
- Can't use/waste more than specified area quantity
- Receiving into a new area auto-creates the item_storage row

## UI Changes

### Inventory page
- "Storage Area" filter dropdown next to Category filter
- When area selected: Stock Qty shows that area's quantity only
- When "All Areas" (default): Stock Qty shows total
- Expandable rows with chevron to show per-area quantity breakdown

### Item Detail page
- "Stock by Area" section: table showing Area | Qty
- Transaction form gets area selector dropdown
- Transfer mode: when reason is "Transferred", show from-area and to-area dropdowns

### Area management
- "Manage Areas" button on inventory page near filters
- Modal with area list — add, rename, delete
- Delete protection: can't delete area with stock in it
