import Database from 'better-sqlite3';
import type { IntelligenceJobContext } from './types.js';

export interface NormalizedVendorPriceRecord {
  vendor_price_id: number;
  vendor_item_key: string;
  vendor_id: number;
  vendor_name: string;
  inventory_item_id: number;
  inventory_item_name: string;
  category: string;
  base_unit: string;
  order_unit: string | null;
  order_unit_price: number;
  qty_per_unit: number | null;
  normalized_unit_cost: number;
  observed_at: string;
  source_table: 'vendor_prices';
  source_primary_key: string;
  source_invoice_line_id: number | null;
  vendor_item_name: string | null;
}

export interface PriceIntelligenceSource {
  listNormalizedVendorPriceHistory(context: IntelligenceJobContext): Promise<NormalizedVendorPriceRecord[]>;
}

export class StaticPriceIntelligenceSource implements PriceIntelligenceSource {
  constructor(private readonly records: NormalizedVendorPriceRecord[]) {}

  async listNormalizedVendorPriceHistory(): Promise<NormalizedVendorPriceRecord[]> {
    return [...this.records];
  }
}

export function createLegacySqlitePriceIntelligenceSource(db: Database.Database): PriceIntelligenceSource {
  return {
    async listNormalizedVendorPriceHistory(context: IntelligenceJobContext): Promise<NormalizedVendorPriceRecord[]> {
      const rows = db
        .prepare(
          `
            SELECT
              vp.id AS vendor_price_id,
              vp.vendor_id,
              v.name AS vendor_name,
              vp.item_id AS inventory_item_id,
              i.name AS inventory_item_name,
              i.category,
              i.unit AS base_unit,
              vp.order_unit,
              vp.order_unit_price,
              vp.qty_per_unit,
              vp.created_at AS observed_at,
              vp.vendor_item_name
            FROM vendor_prices vp
            JOIN items i ON i.id = vp.item_id
            JOIN vendors v ON v.id = vp.vendor_id
            WHERE vp.created_at <= ?
              AND (? IS NULL OR vp.vendor_id = ?)
              AND (? IS NULL OR vp.item_id = ?)
            ORDER BY vp.created_at ASC, vp.id ASC
          `,
        )
        .all(
          context.window.end,
          context.scope.vendorId ?? null,
          context.scope.vendorId ?? null,
          context.scope.inventoryItemId ?? null,
          context.scope.inventoryItemId ?? null,
        ) as Array<{
        vendor_price_id: number;
        vendor_id: number;
        vendor_name: string;
        inventory_item_id: number;
        inventory_item_name: string;
        category: string;
        base_unit: string;
        order_unit: string | null;
        order_unit_price: number;
        qty_per_unit: number | null;
        observed_at: string;
        vendor_item_name: string | null;
      }>;

      return rows.flatMap((row) => {
          const normalized_unit_cost = normalizeLegacyVendorPrice(row.order_unit_price, row.qty_per_unit, row.order_unit, row.base_unit);
          if (normalized_unit_cost === null) {
            return [];
          }

          const vendorItemKey = [
            row.vendor_id,
            row.inventory_item_id,
            row.vendor_item_name ?? row.inventory_item_name,
            row.order_unit ?? row.base_unit,
            row.qty_per_unit ?? 1,
            row.base_unit,
          ].join('::');

          const record: NormalizedVendorPriceRecord = {
            vendor_price_id: row.vendor_price_id,
            vendor_item_key: vendorItemKey,
            vendor_id: row.vendor_id,
            vendor_name: row.vendor_name,
            inventory_item_id: row.inventory_item_id,
            inventory_item_name: row.inventory_item_name,
            category: row.category,
            base_unit: row.base_unit,
            order_unit: row.order_unit,
            order_unit_price: row.order_unit_price,
            qty_per_unit: row.qty_per_unit,
            normalized_unit_cost,
            observed_at: row.observed_at,
            source_table: 'vendor_prices',
            source_primary_key: String(row.vendor_price_id),
            source_invoice_line_id: null,
            vendor_item_name: row.vendor_item_name,
          };
          return [record];
        });
    },
  };
}

function normalizeLegacyVendorPrice(
  orderUnitPrice: number,
  qtyPerUnit: number | null,
  orderUnit: string | null,
  baseUnit: string,
): number | null {
  if (qtyPerUnit !== null && qtyPerUnit > 0) {
    return orderUnitPrice / qtyPerUnit;
  }
  if (orderUnit === null || orderUnit === baseUnit) {
    return orderUnitPrice;
  }
  return null;
}
