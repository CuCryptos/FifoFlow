import type Database from 'better-sqlite3';
import type { IntelligenceJobContext } from '../types.js';
import type { InventoryCountVarianceSourceRow, VarianceReadRepository } from './types.js';

export class SQLiteVarianceReadRepository implements VarianceReadRepository {
  constructor(private readonly db: Database.Database) {}

  async listCountVarianceRows(context: IntelligenceJobContext): Promise<InventoryCountVarianceSourceRow[]> {
    const rows = this.db.prepare(
      `
        SELECT
          e.id AS count_entry_id,
          s.id AS count_session_id,
          s.name AS count_session_name,
          s.status AS count_session_status,
          e.item_id AS inventory_item_id,
          i.name AS inventory_item_name,
          i.category AS inventory_category,
          i.unit AS item_unit,
          e.previous_qty AS expected_qty,
          e.counted_qty AS counted_qty,
          e.delta AS variance_qty,
          e.created_at AS counted_at,
          e.notes AS notes,
          COALESCE(
            CASE
              WHEN vp.qty_per_unit IS NOT NULL AND vp.qty_per_unit > 0 THEN vp.order_unit_price / vp.qty_per_unit
              WHEN vp.order_unit = i.unit THEN vp.order_unit_price
              ELSE NULL
            END,
            NULL
          ) AS expected_unit_cost,
          CASE
            WHEN vp.id IS NULL THEN NULL
            ELSE 'vendor_prices'
          END AS cost_source_table,
          CASE
            WHEN vp.id IS NULL THEN NULL
            ELSE CAST(vp.id AS TEXT)
          END AS cost_source_ref_id,
          CASE
            WHEN vp.id IS NULL THEN NULL
            ELSE 'vendor_price'
          END AS cost_source_type,
          vp.vendor_id AS vendor_id,
          v.name AS vendor_name
        FROM count_entries e
        JOIN count_sessions s ON s.id = e.session_id
        JOIN items i ON i.id = e.item_id
        LEFT JOIN vendor_prices vp
          ON vp.id = (
            SELECT vp2.id
            FROM vendor_prices vp2
            WHERE vp2.item_id = i.id
            ORDER BY vp2.is_default DESC, vp2.updated_at DESC, vp2.id DESC
            LIMIT 1
          )
        LEFT JOIN vendors v ON v.id = vp.vendor_id
        WHERE e.created_at >= ?
          AND e.created_at <= ?
        ORDER BY e.created_at ASC, e.id ASC
      `,
    ).all(context.window.start, context.window.end) as Array<{
      count_entry_id: number;
      count_session_id: number;
      count_session_name: string;
      count_session_status: string;
      inventory_item_id: number;
      inventory_item_name: string;
      inventory_category: string | null;
      item_unit: string;
      expected_qty: number | null;
      counted_qty: number | null;
      variance_qty: number | null;
      counted_at: string;
      notes: string | null;
      expected_unit_cost: number | null;
      cost_source_table: string | null;
      cost_source_ref_id: string | null;
      cost_source_type: string | null;
      vendor_id: number | null;
      vendor_name: string | null;
    }>;

    return rows.map((row) => ({
      ...row,
      storage_area_id: context.scope.storageAreaId ?? null,
    }));
  }
}
