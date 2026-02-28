# Inventory Page Redesign Design

## Overview
Redesign the inventory list page to a spreadsheet-style layout with inline-editable fields, new per-item data columns, and auto-calculated reorder status.

## New Database Fields (items table)
- `order_unit` TEXT — unit you order in (case, bag, barrel, etc.)
- `qty_per_unit` REAL — items per order unit (e.g., 24 bottles per case)
- `item_size` TEXT — individual item description (e.g., "12 oz bottle")
- `reorder_level` REAL — minimum stock before reorder trigger
- `reorder_qty` REAL — how many to order when reordering

All nullable, default NULL.

## Inventory Table Columns
| Column | Type | Editable | Source |
|---|---|---|---|
| Name | Link | No (click to detail) | Existing |
| Category | Text | No | Existing |
| Order Unit | Select | Inline | New: order_unit |
| Qty/Unit | Number | Inline | New: qty_per_unit |
| Item Size | Text | Inline | New: item_size |
| Stock Qty | Number | No | Existing: current_qty |
| Unit | Select | Inline (conversion toggle) | Existing: unit |
| Reorder Level | Number | Inline | New: reorder_level |
| Reorder | Badge | Auto | Computed: OK/REORDER |
| Reorder Qty | Number | Inline | New: reorder_qty |

## Inline Editing
- Editable cells save on blur via PUT /api/items/:id
- No submit button needed — auto-save pattern
- Brief visual feedback on save (subtle flash or check)

## Reorder Status Logic
- Stock > reorder_level → OK (green badge)
- Stock ≤ reorder_level → REORDER (red badge)
- No reorder_level set → "—" (no badge)
