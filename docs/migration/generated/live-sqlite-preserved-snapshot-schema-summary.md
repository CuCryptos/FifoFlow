# SQLite Schema Summary: live-sqlite-preserved-snapshot

- Source: `/Users/curtisvaughan/FifoFlow/backups/fifoflow-20260314-165306.db`
- Generated: `2026-03-14T18:27:46.626Z`
- Tables: `18`

## count_entries

- Row count: `0`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| session_id | INTEGER | 1 |  | 0 |
| item_id | INTEGER | 1 |  | 0 |
| previous_qty | REAL | 1 |  | 0 |
| counted_qty | REAL | 1 |  | 0 |
| delta | REAL | 1 |  | 0 |
| notes | TEXT | 0 |  | 0 |
| created_at | TEXT | 1 | datetime('now') | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| idx_count_entries_item_id | 0 | c | 0 | item_id |
| idx_count_entries_session_id | 0 | c | 0 | session_id |
| sqlite_autoindex_count_entries_1 | 1 | u | 0 | session_id, item_id |

## count_session_items

- Row count: `0`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| session_id | INTEGER | 1 |  | 0 |
| item_id | INTEGER | 1 |  | 0 |
| counted | INTEGER | 1 | 0 | 0 |
| created_at | TEXT | 1 | datetime('now') | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| idx_count_session_items_item_id | 0 | c | 0 | item_id |
| idx_count_session_items_session_id | 0 | c | 0 | session_id |
| sqlite_autoindex_count_session_items_1 | 1 | u | 0 | session_id, item_id |

## count_sessions

- Row count: `0`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| name | TEXT | 1 |  | 0 |
| status | TEXT | 1 | 'open' | 0 |
| template_category | TEXT | 0 |  | 0 |
| notes | TEXT | 0 |  | 0 |
| opened_at | TEXT | 1 | datetime('now') | 0 |
| closed_at | TEXT | 0 |  | 0 |

## forecast_entries

- Row count: `195`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| forecast_id | INTEGER | 1 |  | 0 |
| product_name | TEXT | 1 |  | 0 |
| forecast_date | TEXT | 1 |  | 0 |
| guest_count | INTEGER | 1 | 0 | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| idx_forecast_entries_fid | 0 | c | 0 | forecast_id |

## forecast_product_mappings

- Row count: `7`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| product_name | TEXT | 1 |  | 0 |
| venue_id | INTEGER | 1 |  | 0 |
| created_at | TEXT | 1 | datetime('now') | 0 |
| updated_at | TEXT | 1 | datetime('now') | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| sqlite_autoindex_forecast_product_mappings_1 | 1 | u | 0 | product_name |

## forecasts

- Row count: `1`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| filename | TEXT | 1 |  | 0 |
| date_range_start | TEXT | 0 |  | 0 |
| date_range_end | TEXT | 0 |  | 0 |
| raw_dates | TEXT | 1 |  | 0 |
| created_at | TEXT | 1 | datetime('now') | 0 |

## item_storage

- Row count: `366`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| item_id | INTEGER | 1 |  | 0 |
| area_id | INTEGER | 1 |  | 0 |
| quantity | REAL | 1 | 0 | 0 |
| created_at | TEXT | 1 | datetime('now') | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| idx_item_storage_area_id | 0 | c | 0 | area_id |
| idx_item_storage_item_id | 0 | c | 0 | item_id |
| sqlite_autoindex_item_storage_1 | 1 | u | 0 | item_id, area_id |

## items

- Row count: `389`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| name | TEXT | 1 |  | 0 |
| category | TEXT | 1 |  | 0 |
| unit | TEXT | 1 |  | 0 |
| current_qty | REAL | 1 | 0 | 0 |
| created_at | TEXT | 1 | datetime('now') | 0 |
| updated_at | TEXT | 1 | datetime('now') | 0 |
| order_unit | TEXT | 0 |  | 0 |
| order_unit_price | REAL | 0 |  | 0 |
| qty_per_unit | REAL | 0 |  | 0 |
| inner_unit | TEXT | 0 |  | 0 |
| item_size_value | REAL | 0 |  | 0 |
| item_size_unit | TEXT | 0 |  | 0 |
| item_size | TEXT | 0 |  | 0 |
| reorder_level | REAL | 0 |  | 0 |
| reorder_qty | REAL | 0 |  | 0 |
| vendor_id | INTEGER | 0 |  | 0 |
| venue_id | INTEGER | 0 |  | 0 |
| storage_area_id | INTEGER | 0 |  | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| idx_items_storage_area_id | 0 | c | 0 | storage_area_id |
| idx_items_venue_id | 0 | c | 0 | venue_id |
| idx_items_vendor_id | 0 | c | 0 | vendor_id |
| idx_items_category | 0 | c | 0 | category |

## order_items

- Row count: `7`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| order_id | INTEGER | 1 |  | 0 |
| item_id | INTEGER | 1 |  | 0 |
| quantity | REAL | 1 |  | 0 |
| unit | TEXT | 1 |  | 0 |
| unit_price | REAL | 1 |  | 0 |
| line_total | REAL | 1 |  | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| idx_order_items_order_id | 0 | c | 0 | order_id |

## orders

- Row count: `1`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| vendor_id | INTEGER | 1 |  | 0 |
| status | TEXT | 1 | 'draft' | 0 |
| notes | TEXT | 0 |  | 0 |
| total_estimated_cost | REAL | 1 | 0 | 0 |
| created_at | TEXT | 1 | datetime('now') | 0 |
| updated_at | TEXT | 1 | datetime('now') | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| idx_orders_vendor_id | 0 | c | 0 | vendor_id |

## product_recipes

- Row count: `16`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| venue_id | INTEGER | 1 |  | 0 |
| recipe_id | INTEGER | 1 |  | 0 |
| portions_per_guest | REAL | 1 | 1.0 | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| idx_product_recipes_recipe_id | 0 | c | 0 | recipe_id |
| idx_product_recipes_venue_id | 0 | c | 0 | venue_id |
| sqlite_autoindex_product_recipes_1 | 1 | u | 0 | venue_id, recipe_id |

## recipe_items

- Row count: `8`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| recipe_id | INTEGER | 1 |  | 0 |
| item_id | INTEGER | 1 |  | 0 |
| quantity | REAL | 1 |  | 0 |
| unit | TEXT | 1 |  | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| idx_recipe_items_item_id | 0 | c | 0 | item_id |
| idx_recipe_items_recipe_id | 0 | c | 0 | recipe_id |
| sqlite_autoindex_recipe_items_1 | 1 | u | 0 | recipe_id, item_id |

## recipes

- Row count: `8`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| name | TEXT | 1 |  | 0 |
| type | TEXT | 1 |  | 0 |
| notes | TEXT | 0 |  | 0 |
| created_at | TEXT | 1 | datetime('now') | 0 |
| updated_at | TEXT | 1 | datetime('now') | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| sqlite_autoindex_recipes_1 | 1 | u | 0 | name |

## storage_areas

- Row count: `18`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| name | TEXT | 1 |  | 0 |
| created_at | TEXT | 1 | datetime('now') | 0 |
| updated_at | TEXT | 1 | datetime('now') | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| sqlite_autoindex_storage_areas_1 | 1 | u | 0 | name |

## transactions

- Row count: `16`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| item_id | INTEGER | 1 |  | 0 |
| type | TEXT | 1 |  | 0 |
| quantity | REAL | 1 |  | 0 |
| reason | TEXT | 1 |  | 0 |
| notes | TEXT | 0 |  | 0 |
| created_at | TEXT | 1 | datetime('now') | 0 |
| from_area_id | INTEGER | 0 |  | 0 |
| to_area_id | INTEGER | 0 |  | 0 |
| estimated_cost | REAL | 0 |  | 0 |
| vendor_price_id | INTEGER | 0 |  | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| idx_transactions_created_at | 0 | c | 0 | created_at |
| idx_transactions_item_id | 0 | c | 0 | item_id |

## vendor_prices

- Row count: `122`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| item_id | INTEGER | 1 |  | 0 |
| vendor_id | INTEGER | 1 |  | 0 |
| vendor_item_name | TEXT | 0 |  | 0 |
| order_unit | TEXT | 0 |  | 0 |
| order_unit_price | REAL | 1 |  | 0 |
| qty_per_unit | REAL | 0 |  | 0 |
| is_default | INTEGER | 1 | 0 | 0 |
| created_at | TEXT | 1 | datetime('now') | 0 |
| updated_at | TEXT | 1 | datetime('now') | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| idx_vendor_prices_vendor_id | 0 | c | 0 | vendor_id |
| idx_vendor_prices_item_id | 0 | c | 0 | item_id |

## vendors

- Row count: `22`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| name | TEXT | 1 |  | 0 |
| notes | TEXT | 0 |  | 0 |
| created_at | TEXT | 1 | datetime('now') | 0 |
| updated_at | TEXT | 1 | datetime('now') | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| sqlite_autoindex_vendors_1 | 1 | u | 0 | name |

## venues

- Row count: `11`

| Column | Type | Not Null | Default | PK |
|---|---|---:|---|---:|
| id | INTEGER | 0 |  | 1 |
| name | TEXT | 1 |  | 0 |
| created_at | TEXT | 1 | datetime('now') | 0 |
| updated_at | TEXT | 1 | datetime('now') | 0 |
| sort_order | INTEGER | 1 | 0 | 0 |
| show_in_menus | INTEGER | 1 | 1 | 0 |

| Index | Unique | Origin | Partial | Columns |
|---|---:|---|---:|---|
| sqlite_autoindex_venues_1 | 1 | u | 0 | name |
