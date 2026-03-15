## FIFOFlow Live Snapshot

This folder is a preservation export of the live FIFOFlow production SQLite database captured on `2026-03-14`.

Source of truth at capture time:
- Droplet: `root@64.227.108.209`
- App path: `/opt/FifoFlow`
- Running container: `fifoflow-fifoflow-1`
- Live DB volume path: `/var/lib/docker/volumes/fifoflow_fifoflow-data/_data/fifoflow.db`

Backup artifacts:
- Server backup: `/root/backups/fifoflow/fifoflow-20260314-165306.db`
- Local backup: [/Users/curtisvaughan/FifoFlow/backups/fifoflow-20260314-165306.db](/Users/curtisvaughan/FifoFlow/backups/fifoflow-20260314-165306.db)

Files in this snapshot:
- `schema.sql`: SQLite schema at capture time
- `row-counts.csv`: row counts for exported tables
- `items.csv`
- `vendors.csv`
- `vendor_prices.csv`
- `venues.csv`
- `storage_areas.csv`
- `item_storage.csv`
- `transactions.csv`
- `recipes.csv`
- `recipe_items.csv`
- `product_recipes.csv`
- `orders.csv`
- `order_items.csv`
- `forecasts.csv`
- `forecast_entries.csv`
- `forecast_product_mappings.csv`

Key row counts at capture time:
- `items`: `389`
- `vendors`: `22`
- `vendor_prices`: `122`
- `venues`: `11`
- `storage_areas`: `18`
- `item_storage`: `366`
- `transactions`: `16`
- `recipes`: `8`
- `recipe_items`: `8`
- `product_recipes`: `16`
- `orders`: `1`
- `order_items`: `7`
- `forecasts`: `1`
- `forecast_entries`: `195`
- `forecast_product_mappings`: `7`

Notes:
- This snapshot is the rebuild baseline and should be treated as read-only.
- The live deployment is currently using `sqlite`, not `supabase`.
- No `sales` table existed in this snapshot.
