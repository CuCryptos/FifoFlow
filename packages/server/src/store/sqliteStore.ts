import type Database from 'better-sqlite3';
import type {
  CloseCountSessionInput,
  CostReport,
  CostRow,
  CountSession,
  CountSessionChecklistItem,
  CountSessionEntry,
  CountSessionSummary,
  CreateCountSessionInput,
  CreateItemInput,
  CreateOrderInput,
  CreateStorageAreaInput,
  CreateVendorPriceInput,
  DashboardStats,
  ItemCountAdjustmentResult,
  Item,
  ItemStorage,
  Forecast,
  ForecastEntry,
  ForecastProductMapping,
  ForecastWithEntries,
  MergeItemsResult,
  Order,
  OrderDetail,
  OrderItem,
  OrderWithVendor,
  Recipe,
  RecipeDetail,
  RecipeItem,
  RecipeWithCost,
  SaveForecastInput,
  StorageArea,
  Transaction,
  TransactionWithItem,
  UpdateItemInput,
  UpdateOrderInput,
  UpdateStorageAreaInput,
  UpdateVendorPriceInput,
  UsageReport,
  UsageRow,
  Venue,
  CreateVenueInput,
  UpdateVenueInput,
  Vendor,
  VendorPrice,
  CreateVendorInput,
  UpdateVendorInput,
  SaleWithItem,
  SalesSummary,
  SalesFilters,
  WasteReport,
  WasteRow,
} from '@fifoflow/shared';
import { tryConvertQuantity } from '@fifoflow/shared';
import type { Unit } from '@fifoflow/shared';
import type {
  InsertTransactionAndAdjustQtyInput,
  InventoryStore,
  ItemListFilters,
  ReconcileOutcome,
  ReportFilters,
  SetItemCountWithAdjustmentInput,
  TransactionListFilters,
} from './types.js';


/**
 * Calculate cost per recipe-unit using full unit conversion.
 * E.g. if vendor price is $50/case and 1 case = 12 each, cost per "each" = $4.17
 */
function costPerRecipeUnit(
  recipeUnit: string,
  price: { order_unit_price: number; order_unit: string | null; qty_per_unit: number | null },
  item: { unit: string; order_unit: string | null; inner_unit: string | null; qty_per_unit: number | null; item_size_value: number | null; item_size_unit: string | null },
): number | null {
  const orderUnit = price.order_unit ?? item.unit;

  // Same unit = direct price
  if (recipeUnit === orderUnit) return price.order_unit_price;

  // Convert 1 order_unit to recipe_unit to find how many recipe_units per order_unit
  const packaging = {
    baseUnit: item.unit as Unit,
    orderUnit: item.order_unit as Unit | null,
    innerUnit: item.inner_unit as Unit | null,
    qtyPerUnit: item.qty_per_unit,
    itemSizeValue: item.item_size_value,
    itemSizeUnit: item.item_size_unit as Unit | null,
  };

  const recipeUnitsPerOrder = tryConvertQuantity(1, orderUnit as Unit, recipeUnit as Unit, packaging);
  if (recipeUnitsPerOrder != null && recipeUnitsPerOrder > 0) {
    return Math.round((price.order_unit_price / recipeUnitsPerOrder) * 10000) / 10000;
  }

  return null;
}

export class SqliteInventoryStore implements InventoryStore {
  constructor(private readonly db: Database.Database) {}

  async listItems(filters?: ItemListFilters): Promise<Item[]> {
    let sql = 'SELECT * FROM items WHERE 1=1';
    const params: unknown[] = [];
    let orderSql = ' ORDER BY name ASC';

    if (filters?.category) {
      sql += ' AND category = ?';
      params.push(filters.category);
    }
    if (filters?.search) {
      sql += ` AND (
        name LIKE ?
        OR COALESCE(brand_name, '') LIKE ?
        OR COALESCE(manufacturer_name, '') LIKE ?
        OR EXISTS (
          SELECT 1
          FROM vendor_prices vp
          WHERE vp.item_id = items.id
            AND (
              COALESCE(vp.vendor_item_name, '') LIKE ?
              OR COALESCE(vp.brand_name, '') LIKE ?
              OR COALESCE(vp.manufacturer_name, '') LIKE ?
            )
        )
      )`;
      const like = `%${filters.search}%`;
      params.push(like, like, like, like, like, like);
      orderSql = `
        ORDER BY
          CASE
            WHEN COALESCE(brand_name, '') LIKE ? THEN 0
            WHEN name LIKE ? THEN 1
            WHEN COALESCE(manufacturer_name, '') LIKE ? THEN 2
            ELSE 3
          END,
          COALESCE(brand_name, '') COLLATE NOCASE ASC,
          name COLLATE NOCASE ASC
      `;
    }
    if (filters?.venueId !== undefined) {
      sql += ' AND venue_id = ?';
      params.push(filters.venueId);
    }

    sql += orderSql;
    if (filters?.search) {
      const like = `%${filters.search}%`;
      params.push(like, like, like);
    }
    return this.db.prepare(sql).all(...params) as Item[];
  }

  async listItemsWithReorderLevel(venueId?: number): Promise<Item[]> {
    let sql = 'SELECT * FROM items WHERE reorder_level IS NOT NULL';
    const params: unknown[] = [];
    if (venueId !== undefined) {
      sql += ' AND venue_id = ?';
      params.push(venueId);
    }
    return this.db.prepare(sql).all(...params) as Item[];
  }

  async getItemById(id: number): Promise<Item | undefined> {
    return this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined;
  }

  async listTransactionsForItem(itemId: number, limit: number): Promise<Transaction[]> {
    return this.db.prepare(
      'SELECT * FROM transactions WHERE item_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(itemId, limit) as Transaction[];
  }

  async createItem(input: CreateItemInput): Promise<Item> {
    const {
      name,
      category,
      unit,
      order_unit = null,
      order_unit_price = null,
      qty_per_unit = null,
      inner_unit = null,
      item_size_value = null,
      item_size_unit = null,
      item_size = null,
      reorder_level = null,
      reorder_qty = null,
      vendor_id = null,
      venue_id = null,
      storage_area_id = null,
      sale_price = null,
      brand_name = null,
      manufacturer_name = null,
      gtin = null,
      upc = null,
      sysco_supc = null,
      manufacturer_item_code = null,
    } = input;

    const itemSizeText = item_size ?? (
      item_size_value && item_size_unit ? `${item_size_value} ${item_size_unit}` : null
    );

    const result = this.db.prepare(
      `INSERT INTO items (
        name,
        category,
        unit,
        order_unit,
        order_unit_price,
        qty_per_unit,
        inner_unit,
        item_size_value,
        item_size_unit,
        item_size,
        reorder_level,
        reorder_qty,
        vendor_id,
        venue_id,
        storage_area_id,
        sale_price,
        brand_name,
        manufacturer_name,
        gtin,
        upc,
        sysco_supc,
        manufacturer_item_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      name,
      category,
      unit,
      order_unit,
      order_unit_price,
      qty_per_unit,
      inner_unit,
      item_size_value,
      item_size_unit,
      itemSizeText,
      reorder_level,
      reorder_qty,
      vendor_id,
      venue_id,
      storage_area_id,
      sale_price,
      brand_name,
      manufacturer_name,
      gtin,
      upc,
      sysco_supc,
      manufacturer_item_code,
    );

    return this.db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid) as Item;
  }

  async updateItem(id: number, updates: UpdateItemInput): Promise<Item> {
    const fields = Object.entries(updates).filter(([, v]) => v !== undefined);
    if (fields.length === 0) {
      return (await this.getItemById(id)) as Item;
    }

    const setClauses = fields.map(([key]) => `${key} = ?`).join(', ');
    const values = fields.map(([, v]) => v);

    this.db.prepare(`UPDATE items SET ${setClauses} WHERE id = ?`).run(...values, id);
    return this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item;
  }

  async countTransactionsForItem(itemId: number): Promise<number> {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM transactions WHERE item_id = ?'
    ).get(itemId) as { count: number };
    return row.count;
  }

  async deleteItem(id: number): Promise<void> {
    this.db.prepare('DELETE FROM items WHERE id = ?').run(id);
  }

  async listTransactions(filters?: TransactionListFilters): Promise<TransactionWithItem[]> {
    let sql = `
      SELECT t.*, i.name as item_name, i.unit as item_unit
      FROM transactions t
      JOIN items i ON t.item_id = i.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (filters?.item_id !== undefined) {
      sql += ' AND t.item_id = ?';
      params.push(filters.item_id);
    }
    if (filters?.type) {
      sql += ' AND t.type = ?';
      params.push(filters.type);
    }
    if (filters?.venueId !== undefined) {
      sql += ' AND i.venue_id = ?';
      params.push(filters.venueId);
    }

    sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(filters?.limit ?? 50, filters?.offset ?? 0);

    return this.db.prepare(sql).all(...params) as TransactionWithItem[];
  }

  async insertTransactionAndAdjustQty(input: InsertTransactionAndAdjustQtyInput): Promise<{
    transaction: Transaction;
    item: Item;
  }> {
    const execute = this.db.transaction(() => {
      // Insert transaction with area references
      const result = this.db.prepare(
        'INSERT INTO transactions (item_id, type, quantity, reason, notes, from_area_id, to_area_id, estimated_cost, vendor_price_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(input.itemId, input.type, input.quantity, input.reason, input.notes, input.fromAreaId ?? null, input.toAreaId ?? null, input.estimatedCost ?? null, input.vendorPriceId ?? null);

      if (!input.fromAreaId && !input.toAreaId) {
        // Legacy path — no area references, just update current_qty directly
        this.db.prepare('UPDATE items SET current_qty = current_qty + ? WHERE id = ?').run(input.delta, input.itemId);
      } else {
        // Area-aware path: update item_storage quantities
        if (input.fromAreaId) {
          this.db.prepare(
            'UPDATE item_storage SET quantity = quantity - ? WHERE item_id = ? AND area_id = ?'
          ).run(input.quantity, input.itemId, input.fromAreaId);
        }

        if (input.toAreaId) {
          // Upsert: insert if not exists, update if exists
          this.db.prepare(`
            INSERT INTO item_storage (item_id, area_id, quantity)
            VALUES (?, ?, ?)
            ON CONFLICT(item_id, area_id) DO UPDATE SET quantity = quantity + excluded.quantity
          `).run(input.itemId, input.toAreaId, input.quantity);
        }

        // Recalculate current_qty from item_storage
        const sumRow = this.db.prepare(
          'SELECT COALESCE(SUM(quantity), 0) as total FROM item_storage WHERE item_id = ?'
        ).get(input.itemId) as { total: number };
        this.db.prepare('UPDATE items SET current_qty = ? WHERE id = ?')
          .run(sumRow.total, input.itemId);
      }

      const transaction = this.db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid) as Transaction;
      const item = this.db.prepare('SELECT * FROM items WHERE id = ?').get(input.itemId) as Item;
      return { transaction, item };
    });

    return execute();
  }

  async setItemCountWithAdjustment(input: SetItemCountWithAdjustmentInput): Promise<ItemCountAdjustmentResult> {
    const existing = this.db.prepare('SELECT * FROM items WHERE id = ?').get(input.itemId) as Item | undefined;
    if (!existing) {
      throw new Error('Item not found');
    }

    const delta = input.countedQty - existing.current_qty;

    const execute = this.db.transaction(() => {
      let transaction: Transaction | null = null;

      if (Math.abs(delta) > 0.000001) {
        const type = delta > 0 ? 'in' : 'out';
        const txResult = this.db.prepare(
          'INSERT INTO transactions (item_id, type, quantity, reason, notes) VALUES (?, ?, ?, ?, ?)'
        ).run(
          input.itemId,
          type,
          Math.abs(delta),
          'Adjustment',
          input.notes ?? 'Cycle count adjustment',
        );
        transaction = this.db.prepare('SELECT * FROM transactions WHERE id = ?').get(txResult.lastInsertRowid) as Transaction;
      }

      this.db.prepare('UPDATE items SET current_qty = ? WHERE id = ?').run(input.countedQty, input.itemId);
      const item = this.db.prepare('SELECT * FROM items WHERE id = ?').get(input.itemId) as Item;
      return {
        item,
        transaction,
        delta: Math.round(delta * 1000) / 1000,
      };
    });

    return execute();
  }

  async listCountSessions(): Promise<CountSessionSummary[]> {
    return this.db.prepare(`
      SELECT
        s.*,
        COALESCE(e.entries_count, 0) as entries_count,
        COALESCE(e.total_variance, 0) as total_variance,
        COALESCE(si.template_items_count, 0) as template_items_count,
        COALESCE(si.counted_items_count, 0) as counted_items_count,
        (COALESCE(si.template_items_count, 0) - COALESCE(si.counted_items_count, 0)) as remaining_items_count
      FROM count_sessions s
      LEFT JOIN (
        SELECT
          session_id,
          COUNT(*) as entries_count,
          COALESCE(SUM(ABS(delta)), 0) as total_variance
        FROM count_entries
        GROUP BY session_id
      ) e ON e.session_id = s.id
      LEFT JOIN (
        SELECT
          session_id,
          COUNT(*) as template_items_count,
          SUM(CASE WHEN counted = 1 THEN 1 ELSE 0 END) as counted_items_count
        FROM count_session_items
        GROUP BY session_id
      ) si ON si.session_id = s.id
      ORDER BY s.opened_at DESC
    `).all() as CountSessionSummary[];
  }

  async getOpenCountSession(): Promise<CountSession | undefined> {
    return this.db.prepare(
      "SELECT * FROM count_sessions WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1"
    ).get() as CountSession | undefined;
  }

  async createCountSession(input: CreateCountSessionInput): Promise<CountSession> {
    const existingOpen = await this.getOpenCountSession();
    if (existingOpen) {
      throw new Error('A count session is already open.');
    }

    const execute = this.db.transaction(() => {
      const result = this.db.prepare(
        'INSERT INTO count_sessions (name, template_category, notes) VALUES (?, ?, ?)'
      ).run(input.name, input.template_category ?? null, input.notes ?? null);
      const sessionId = Number(result.lastInsertRowid);
      const insertTemplateItem = this.db.prepare(
        'INSERT INTO count_session_items (session_id, item_id, counted) VALUES (?, ?, 0)'
      );

      if (input.template_category) {
        const itemIds = this.db.prepare(
          'SELECT id FROM items WHERE category = ? ORDER BY name ASC'
        ).all(input.template_category) as Array<{ id: number }>;
        for (const row of itemIds) {
          insertTemplateItem.run(sessionId, row.id);
        }
      } else {
        const itemIds = this.db.prepare(
          'SELECT id FROM items ORDER BY name ASC'
        ).all() as Array<{ id: number }>;
        for (const row of itemIds) {
          insertTemplateItem.run(sessionId, row.id);
        }
      }

      return this.db.prepare('SELECT * FROM count_sessions WHERE id = ?').get(sessionId) as CountSession;
    });

    return execute();
  }

  async closeCountSession(id: number, input: CloseCountSessionInput): Promise<CountSession> {
    const session = this.db.prepare('SELECT * FROM count_sessions WHERE id = ?').get(id) as CountSession | undefined;
    if (!session) throw new Error('Count session not found');
    if (session.status === 'closed') return session;

    const uncountedRow = this.db.prepare(
      'SELECT COUNT(*) as count FROM count_session_items WHERE session_id = ? AND counted = 0'
    ).get(id) as { count: number };

    if (uncountedRow.count > 0 && !input.force_close) {
      throw new Error(`Cannot close session with ${uncountedRow.count} uncounted items. Use force_close to close anyway.`);
    }

    this.db.prepare(
      "UPDATE count_sessions SET status = 'closed', closed_at = datetime('now'), notes = COALESCE(?, notes) WHERE id = ?"
    ).run(input.notes ?? null, id);
    return this.db.prepare('SELECT * FROM count_sessions WHERE id = ?').get(id) as CountSession;
  }

  async listCountEntries(sessionId: number): Promise<CountSessionEntry[]> {
    return this.db.prepare(`
      SELECT
        e.id,
        e.session_id,
        e.item_id,
        i.name as item_name,
        i.unit as item_unit,
        e.previous_qty,
        e.counted_qty,
        e.delta,
        e.notes,
        e.created_at
      FROM count_entries e
      JOIN items i ON i.id = e.item_id
      WHERE e.session_id = ?
      ORDER BY e.created_at DESC
    `).all(sessionId) as CountSessionEntry[];
  }

  async listCountChecklist(sessionId: number): Promise<CountSessionChecklistItem[]> {
    return this.db.prepare(`
      SELECT
        si.item_id,
        i.name as item_name,
        i.unit as item_unit,
        i.current_qty,
        CASE WHEN si.counted = 1 THEN 1 ELSE 0 END as counted,
        e.id as count_entry_id,
        e.counted_qty,
        e.delta,
        e.created_at as counted_at
      FROM count_session_items si
      JOIN items i ON i.id = si.item_id
      LEFT JOIN count_entries e ON e.session_id = si.session_id AND e.item_id = si.item_id
      WHERE si.session_id = ?
      ORDER BY si.counted ASC, i.name ASC
    `).all(sessionId).map((row: any) => ({
      item_id: row.item_id,
      item_name: row.item_name,
      item_unit: row.item_unit,
      current_qty: row.current_qty,
      counted: row.counted === 1,
      count_entry_id: row.count_entry_id ?? null,
      counted_qty: row.counted_qty ?? null,
      delta: row.delta ?? null,
      counted_at: row.counted_at ?? null,
    })) as CountSessionChecklistItem[];
  }

  async recordCountEntry(
    sessionId: number,
    input: { itemId: number; countedQty: number; notes: string | null }
  ): Promise<CountSessionEntry> {
    const session = this.db.prepare('SELECT * FROM count_sessions WHERE id = ?').get(sessionId) as CountSession | undefined;
    if (!session) throw new Error('Count session not found');
    if (session.status !== 'open') throw new Error('Count session is closed');

    const existingEntry = this.db.prepare(
      'SELECT id FROM count_entries WHERE session_id = ? AND item_id = ?'
    ).get(sessionId, input.itemId) as { id: number } | undefined;
    if (existingEntry) {
      throw new Error('Item already counted in this session');
    }

    let sessionItem = this.db.prepare(
      'SELECT id FROM count_session_items WHERE session_id = ? AND item_id = ?'
    ).get(sessionId, input.itemId) as { id: number } | undefined;

    if (!sessionItem) {
      // Backfill legacy sessions created before session checklists existed.
      const checklistCount = this.db.prepare(
        'SELECT COUNT(*) as count FROM count_session_items WHERE session_id = ?'
      ).get(sessionId) as { count: number };

      if (checklistCount.count === 0) {
        this.db.prepare(`
          INSERT OR IGNORE INTO count_session_items (session_id, item_id, counted)
          SELECT e.session_id, e.item_id, 1
          FROM count_entries e
          WHERE e.session_id = ?
        `).run(sessionId);

        this.db.prepare(`
          INSERT OR IGNORE INTO count_session_items (session_id, item_id, counted)
          SELECT
            ?,
            i.id,
            CASE WHEN EXISTS (
              SELECT 1 FROM count_entries e
              WHERE e.session_id = ?
                AND e.item_id = i.id
            ) THEN 1 ELSE 0 END
          FROM items i
        `).run(sessionId, sessionId);

        sessionItem = this.db.prepare(
          'SELECT id FROM count_session_items WHERE session_id = ? AND item_id = ?'
        ).get(sessionId, input.itemId) as { id: number } | undefined;
      }
    }

    if (!sessionItem) {
      throw new Error('Item is not part of this session template');
    }

    const execute = this.db.transaction(() => {
      const item = this.db.prepare('SELECT * FROM items WHERE id = ?').get(input.itemId) as Item | undefined;
      if (!item) throw new Error('Item not found');

      const previousQty = item.current_qty;
      const delta = input.countedQty - previousQty;

      if (Math.abs(delta) > 0.000001) {
        this.db.prepare(
          'INSERT INTO transactions (item_id, type, quantity, reason, notes) VALUES (?, ?, ?, ?, ?)'
        ).run(
          input.itemId,
          delta > 0 ? 'in' : 'out',
          Math.abs(delta),
          'Adjustment',
          input.notes ?? `Count session #${sessionId} adjustment`,
        );
      }

      this.db.prepare('UPDATE items SET current_qty = ? WHERE id = ?').run(input.countedQty, input.itemId);

      const entryResult = this.db.prepare(
        `INSERT INTO count_entries (session_id, item_id, previous_qty, counted_qty, delta, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        sessionId,
        input.itemId,
        previousQty,
        input.countedQty,
        delta,
        input.notes ?? null,
      );

      this.db.prepare(
        'UPDATE count_session_items SET counted = 1 WHERE session_id = ? AND item_id = ?'
      ).run(sessionId, input.itemId);

      return this.db.prepare(`
        SELECT
          e.id,
          e.session_id,
          e.item_id,
          i.name as item_name,
          i.unit as item_unit,
          e.previous_qty,
          e.counted_qty,
          e.delta,
          e.notes,
          e.created_at
        FROM count_entries e
        JOIN items i ON i.id = e.item_id
        WHERE e.id = ?
      `).get(entryResult.lastInsertRowid) as CountSessionEntry;
    });

    return execute();
  }

  async getDashboardStats(venueId?: number): Promise<DashboardStats> {
    const venueFilter = venueId !== undefined ? ' AND venue_id = ?' : '';
    const venueParams = venueId !== undefined ? [venueId] : [];

    const totalItems = this.db.prepare(
      `SELECT COUNT(*) as count FROM items WHERE 1=1${venueFilter}`
    ).get(...venueParams) as { count: number };
    const lowStock = this.db.prepare(
      `SELECT COUNT(*) as count FROM items WHERE reorder_level IS NOT NULL AND current_qty > 0 AND current_qty <= reorder_level${venueFilter}`
    ).get(...venueParams) as { count: number };
    const outOfStock = this.db.prepare(
      `SELECT COUNT(*) as count FROM items WHERE current_qty = 0${venueFilter}`
    ).get(...venueParams) as { count: number };

    const todayTxSql = venueId !== undefined
      ? "SELECT COUNT(*) as count FROM transactions t JOIN items i ON t.item_id = i.id WHERE date(t.created_at) = date('now') AND i.venue_id = ?"
      : "SELECT COUNT(*) as count FROM transactions WHERE date(created_at) = date('now')";
    const todayTx = this.db.prepare(todayTxSql).get(...venueParams) as { count: number };

    const inventoryValue = this.db.prepare(`
      SELECT COALESCE(SUM(
        current_qty * order_unit_price / COALESCE(qty_per_unit, 1)
      ), 0) as value
      FROM items
      WHERE order_unit_price IS NOT NULL AND current_qty > 0${venueFilter}
    `).get(...venueParams) as { value: number };

    return {
      total_items: totalItems.count,
      low_stock_count: lowStock.count,
      out_of_stock_count: outOfStock.count,
      today_transaction_count: todayTx.count,
      total_inventory_value: Math.round(inventoryValue.value * 100) / 100,
    };
  }

  async reconcile(): Promise<ReconcileOutcome> {
    const items = this.db.prepare('SELECT id, name, current_qty FROM items').all() as Array<{
      id: number; name: string; current_qty: number;
    }>;

    const computeQty = this.db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type = 'in' THEN quantity ELSE -quantity END), 0) as computed
      FROM transactions WHERE item_id = ?
    `);

    const mismatches: ReconcileOutcome['mismatches'] = [];
    const fix = this.db.prepare('UPDATE items SET current_qty = ? WHERE id = ?');

    const reconcile = this.db.transaction(() => {
      for (const item of items) {
        const { computed } = computeQty.get(item.id) as { computed: number };
        if (Math.abs(item.current_qty - computed) > 0.001) {
          mismatches.push({
            item_id: item.id,
            item_name: item.name,
            cached_qty: item.current_qty,
            computed_qty: computed,
            difference: item.current_qty - computed,
          });
          fix.run(computed, item.id);
        }
      }
    });

    reconcile();

    return {
      checked: items.length,
      mismatches_found: mismatches.length,
      mismatches,
      fixed: mismatches.length > 0,
    };
  }
  // ── Bulk Operations ──────────────────────────────────────────────────

  async bulkUpdateItems(
    ids: number[],
    updates: {
      category?: string;
      vendor_id?: number | null;
      venue_id?: number | null;
      storage_area_id?: number | null;
    },
  ): Promise<{ updated: number }> {
    const fields = Object.entries(updates).filter(([, value]) => value !== undefined);
    if (fields.length === 0) {
      return { updated: 0 };
    }

    const placeholders = ids.map(() => '?').join(',');
    const setClauses = fields.map(([key]) => `${key} = ?`).join(', ');
    const values = fields.map(([, value]) => value);
    const result = this.db.prepare(
      `UPDATE items SET ${setClauses} WHERE id IN (${placeholders})`
    ).run(...values, ...ids);
    return { updated: result.changes };
  }

  async bulkDeleteItems(ids: number[]): Promise<{ deleted: number; skipped: number; skippedIds: number[] }> {
    const skippedIds: number[] = [];
    const deletableIds: number[] = [];

    for (const id of ids) {
      const txCount = await this.countTransactionsForItem(id);
      if (txCount > 0) {
        skippedIds.push(id);
      } else {
        deletableIds.push(id);
      }
    }

    if (deletableIds.length > 0) {
      const placeholders = deletableIds.map(() => '?').join(',');
      this.db.prepare(`DELETE FROM items WHERE id IN (${placeholders})`).run(...deletableIds);
    }

    return {
      deleted: deletableIds.length,
      skipped: skippedIds.length,
      skippedIds,
    };
  }

  async mergeItems(targetId: number, sourceIds: number[]): Promise<MergeItemsResult> {
    const execute = this.db.transaction(() => {
      // Validate target
      const target = this.db.prepare('SELECT * FROM items WHERE id = ?').get(targetId) as Item | undefined;
      if (!target) throw new Error('Target item not found');

      // Validate sources
      for (const sid of sourceIds) {
        if (sid === targetId) throw new Error('Source and target cannot be the same item');
        const source = this.db.prepare('SELECT * FROM items WHERE id = ?').get(sid) as Item | undefined;
        if (!source) throw new Error(`Source item ${sid} not found`);
      }

      let transactionsMoved = 0;
      let vendorPricesCreated = 0;
      let storageConsolidated = 0;

      for (const sourceId of sourceIds) {
        const source = this.db.prepare('SELECT * FROM items WHERE id = ?').get(sourceId) as Item;

        // 1. Copy vendor_prices from source to target
        const sourceVps = this.db.prepare('SELECT * FROM vendor_prices WHERE item_id = ?').all(sourceId) as any[];
        for (const vp of sourceVps) {
          // Check if target already has a price for this vendor with same name
          const existing = this.db.prepare(
            'SELECT id FROM vendor_prices WHERE item_id = ? AND vendor_id = ? AND COALESCE(vendor_item_name, \'\') = COALESCE(?, \'\')'
          ).get(targetId, vp.vendor_id, vp.vendor_item_name) as { id: number } | undefined;
          if (!existing) {
            this.db.prepare(
              `INSERT INTO vendor_prices (
                item_id, vendor_id, vendor_item_name, vendor_item_code, vendor_pack_text,
                order_unit, order_unit_price, qty_per_unit, gtin, upc, sysco_supc,
                brand_name, manufacturer_name, source_catalog, is_default
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
            ).run(
              targetId,
              vp.vendor_id,
              vp.vendor_item_name ?? source.name,
              vp.vendor_item_code ?? null,
              vp.vendor_pack_text ?? null,
              vp.order_unit,
              vp.order_unit_price,
              vp.qty_per_unit,
              vp.gtin ?? null,
              vp.upc ?? null,
              vp.sysco_supc ?? null,
              vp.brand_name ?? null,
              vp.manufacturer_name ?? null,
              vp.source_catalog ?? null,
            );
            vendorPricesCreated++;
          }
        }

        // Also create vendor_price from source item's direct fields if it has vendor_id + order_unit_price
        if (source.vendor_id && source.order_unit_price != null) {
          const alreadyExists = this.db.prepare(
            'SELECT id FROM vendor_prices WHERE item_id = ? AND vendor_id = ? AND COALESCE(vendor_item_name, \'\') = COALESCE(?, \'\')'
          ).get(targetId, source.vendor_id, source.name) as { id: number } | undefined;
          if (!alreadyExists) {
            this.db.prepare(
              `INSERT INTO vendor_prices (
                item_id, vendor_id, vendor_item_name, vendor_item_code, vendor_pack_text,
                order_unit, order_unit_price, qty_per_unit, gtin, upc, sysco_supc,
                brand_name, manufacturer_name, source_catalog, is_default
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
            ).run(
              targetId,
              source.vendor_id,
              source.name,
              source.manufacturer_item_code ?? null,
              null,
              source.order_unit,
              source.order_unit_price,
              source.qty_per_unit,
              source.gtin ?? null,
              source.upc ?? null,
              source.sysco_supc ?? null,
              source.brand_name ?? null,
              source.manufacturer_name ?? null,
              null,
            );
            vendorPricesCreated++;
          }
        }

        // 2. Move transactions
        const txResult = this.db.prepare('UPDATE transactions SET item_id = ? WHERE item_id = ?').run(targetId, sourceId);
        transactionsMoved += txResult.changes;

        // 3. Move count_entries (delete on conflict)
        const sourceEntries = this.db.prepare('SELECT * FROM count_entries WHERE item_id = ?').all(sourceId) as any[];
        for (const entry of sourceEntries) {
          const conflict = this.db.prepare(
            'SELECT id FROM count_entries WHERE session_id = ? AND item_id = ?'
          ).get(entry.session_id, targetId) as { id: number } | undefined;
          if (conflict) {
            this.db.prepare('DELETE FROM count_entries WHERE id = ?').run(entry.id);
          } else {
            this.db.prepare('UPDATE count_entries SET item_id = ? WHERE id = ?').run(targetId, entry.id);
          }
        }

        // 4. Move count_session_items (delete on conflict)
        const sourceSessionItems = this.db.prepare('SELECT * FROM count_session_items WHERE item_id = ?').all(sourceId) as any[];
        for (const si of sourceSessionItems) {
          const conflict = this.db.prepare(
            'SELECT id FROM count_session_items WHERE session_id = ? AND item_id = ?'
          ).get(si.session_id, targetId) as { id: number } | undefined;
          if (conflict) {
            this.db.prepare('DELETE FROM count_session_items WHERE id = ?').run(si.id);
          } else {
            this.db.prepare('UPDATE count_session_items SET item_id = ? WHERE id = ?').run(targetId, si.id);
          }
        }

        // 5. Move order_items
        this.db.prepare('UPDATE order_items SET item_id = ? WHERE item_id = ?').run(targetId, sourceId);

        // 6. Consolidate item_storage
        const sourceStorage = this.db.prepare('SELECT * FROM item_storage WHERE item_id = ?').all(sourceId) as any[];
        for (const row of sourceStorage) {
          this.db.prepare(`
            INSERT INTO item_storage (item_id, area_id, quantity)
            VALUES (?, ?, ?)
            ON CONFLICT(item_id, area_id) DO UPDATE SET quantity = quantity + excluded.quantity
          `).run(targetId, row.area_id, row.quantity);
          storageConsolidated++;
        }
        this.db.prepare('DELETE FROM item_storage WHERE item_id = ?').run(sourceId);

        // 7. Delete source item (vendor_prices cascade-delete, but we already copied them)
        this.db.prepare('DELETE FROM items WHERE id = ?').run(sourceId);
      }

      // Recalculate target's current_qty from item_storage
      const sumRow = this.db.prepare(
        'SELECT COALESCE(SUM(quantity), 0) as total FROM item_storage WHERE item_id = ?'
      ).get(targetId) as { total: number };
      this.db.prepare('UPDATE items SET current_qty = ? WHERE id = ?').run(sumRow.total, targetId);

      const updatedTarget = this.db.prepare('SELECT * FROM items WHERE id = ?').get(targetId) as Item;

      return {
        target_item: updatedTarget,
        merged_count: sourceIds.length,
        transactions_moved: transactionsMoved,
        vendor_prices_created: vendorPricesCreated,
        storage_consolidated: storageConsolidated,
      };
    });

    return execute();
  }

  // ── Storage Areas ──────────────────────────────────────────────────

  async listStorageAreas(): Promise<StorageArea[]> {
    return this.db.prepare('SELECT * FROM storage_areas ORDER BY name ASC').all() as StorageArea[];
  }

  async getStorageAreaById(id: number): Promise<StorageArea | undefined> {
    return this.db.prepare('SELECT * FROM storage_areas WHERE id = ?').get(id) as StorageArea | undefined;
  }

  async createStorageArea(input: CreateStorageAreaInput): Promise<StorageArea> {
    const result = this.db.prepare('INSERT INTO storage_areas (name) VALUES (?)').run(input.name);
    return this.db.prepare('SELECT * FROM storage_areas WHERE id = ?').get(result.lastInsertRowid) as StorageArea;
  }

  async updateStorageArea(id: number, input: UpdateStorageAreaInput): Promise<StorageArea> {
    this.db.prepare('UPDATE storage_areas SET name = ? WHERE id = ?').run(input.name, id);
    return this.db.prepare('SELECT * FROM storage_areas WHERE id = ?').get(id) as StorageArea;
  }

  async deleteStorageArea(id: number): Promise<void> {
    this.db.prepare('DELETE FROM storage_areas WHERE id = ?').run(id);
  }

  async countItemsInArea(areaId: number): Promise<number> {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM item_storage WHERE area_id = ? AND quantity > 0'
    ).get(areaId) as { count: number };
    return row.count;
  }

  // ── Item Storage ──────────────────────────────────────────────────

  async listItemStorage(itemId: number): Promise<ItemStorage[]> {
    return this.db.prepare(`
      SELECT ist.item_id, ist.area_id, sa.name as area_name, ist.quantity
      FROM item_storage ist
      JOIN storage_areas sa ON sa.id = ist.area_id
      WHERE ist.item_id = ?
      ORDER BY sa.name ASC
    `).all(itemId) as ItemStorage[];
  }

  async listAllItemStorage(): Promise<ItemStorage[]> {
    return this.db.prepare(`
      SELECT ist.item_id, ist.area_id, sa.name as area_name, ist.quantity
      FROM item_storage ist
      JOIN storage_areas sa ON sa.id = ist.area_id
      ORDER BY ist.item_id, sa.name
    `).all() as ItemStorage[];
  }

  async getItemStorageByArea(itemId: number, areaId: number): Promise<ItemStorage | undefined> {
    return this.db.prepare(`
      SELECT ist.item_id, ist.area_id, sa.name as area_name, ist.quantity
      FROM item_storage ist
      JOIN storage_areas sa ON sa.id = ist.area_id
      WHERE ist.item_id = ? AND ist.area_id = ?
    `).get(itemId, areaId) as ItemStorage | undefined;
  }

  // ── Vendors ──────────────────────────────────────────────────

  async listVendors(): Promise<Vendor[]> {
    return this.db.prepare('SELECT * FROM vendors ORDER BY name ASC').all() as Vendor[];
  }

  async getVendorById(id: number): Promise<Vendor | undefined> {
    return this.db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as Vendor | undefined;
  }

  async createVendor(input: CreateVendorInput): Promise<Vendor> {
    const result = this.db.prepare(
      'INSERT INTO vendors (name, notes) VALUES (?, ?)'
    ).run(input.name, input.notes ?? null);
    return this.db.prepare('SELECT * FROM vendors WHERE id = ?').get(result.lastInsertRowid) as Vendor;
  }

  async updateVendor(id: number, input: UpdateVendorInput): Promise<Vendor> {
    const fields = Object.entries(input).filter(([, v]) => v !== undefined);
    if (fields.length === 0) return (await this.getVendorById(id)) as Vendor;
    const setClauses = fields.map(([key]) => `${key} = ?`).join(', ');
    const values = fields.map(([, v]) => v);
    this.db.prepare(`UPDATE vendors SET ${setClauses} WHERE id = ?`).run(...values, id);
    return this.db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as Vendor;
  }

  async deleteVendor(id: number): Promise<void> {
    this.db.prepare('DELETE FROM vendors WHERE id = ?').run(id);
  }

  async countItemsForVendor(vendorId: number): Promise<number> {
    const itemRow = this.db.prepare(
      'SELECT COUNT(*) as count FROM items WHERE vendor_id = ?'
    ).get(vendorId) as { count: number };
    const vpRow = this.db.prepare(
      'SELECT COUNT(*) as count FROM vendor_prices WHERE vendor_id = ?'
    ).get(vendorId) as { count: number };
    return itemRow.count + vpRow.count;
  }

  // ── Vendor Prices ──────────────────────────────────────────────────

  private vendorPriceSelectSql = `
    SELECT vp.*, v.name as vendor_name
    FROM vendor_prices vp
    JOIN vendors v ON v.id = vp.vendor_id
  `;

  private mapVendorPrice(row: any): VendorPrice {
    return {
      ...row,
      is_default: row.is_default === 1,
    };
  }

  async listVendorPricesForItem(itemId: number): Promise<VendorPrice[]> {
    const rows = this.db.prepare(
      `${this.vendorPriceSelectSql} WHERE vp.item_id = ? ORDER BY vp.is_default DESC, v.name ASC`
    ).all(itemId) as any[];
    return rows.map(this.mapVendorPrice);
  }

  async getVendorPriceById(id: number): Promise<VendorPrice | undefined> {
    const row = this.db.prepare(
      `${this.vendorPriceSelectSql} WHERE vp.id = ?`
    ).get(id) as any | undefined;
    return row ? this.mapVendorPrice(row) : undefined;
  }

  async createVendorPrice(itemId: number, input: CreateVendorPriceInput): Promise<VendorPrice> {
    const execute = this.db.transaction(() => {
      if (input.is_default) {
        this.db.prepare('UPDATE vendor_prices SET is_default = 0 WHERE item_id = ?').run(itemId);
      }

      const result = this.db.prepare(
        `INSERT INTO vendor_prices (
          item_id, vendor_id, vendor_item_name, vendor_item_code, vendor_pack_text,
          order_unit, order_unit_price, qty_per_unit, gtin, upc, sysco_supc,
          brand_name, manufacturer_name, source_catalog, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        itemId,
        input.vendor_id,
        input.vendor_item_name ?? null,
        input.vendor_item_code ?? null,
        input.vendor_pack_text ?? null,
        input.order_unit ?? null,
        input.order_unit_price,
        input.qty_per_unit ?? null,
        input.gtin ?? null,
        input.upc ?? null,
        input.sysco_supc ?? null,
        input.brand_name ?? null,
        input.manufacturer_name ?? null,
        input.source_catalog ?? null,
        input.is_default ? 1 : 0,
      );

      if (input.is_default) {
        this.syncDefaultToItem(itemId, {
          vendor_id: input.vendor_id,
          order_unit: input.order_unit ?? null,
          order_unit_price: input.order_unit_price,
          qty_per_unit: input.qty_per_unit ?? null,
          brand_name: input.brand_name ?? null,
          manufacturer_name: input.manufacturer_name ?? null,
          gtin: input.gtin ?? null,
          upc: input.upc ?? null,
          sysco_supc: input.sysco_supc ?? null,
          manufacturer_item_code: input.vendor_item_code ?? null,
        });
      }

      return this.db.prepare(
        `${this.vendorPriceSelectSql} WHERE vp.id = ?`
      ).get(result.lastInsertRowid) as any;
    });

    return this.mapVendorPrice(execute());
  }

  async updateVendorPrice(id: number, input: UpdateVendorPriceInput): Promise<VendorPrice> {
    const existing = this.db.prepare('SELECT * FROM vendor_prices WHERE id = ?').get(id) as any;
    if (!existing) throw new Error('Vendor price not found');

    const execute = this.db.transaction(() => {
      if (input.is_default) {
        this.db.prepare('UPDATE vendor_prices SET is_default = 0 WHERE item_id = ?').run(existing.item_id);
      }

      const fields = Object.entries(input).filter(([, v]) => v !== undefined);
      if (fields.length > 0) {
        const setClauses = fields.map(([key]) => {
          if (key === 'is_default') return 'is_default = ?';
          return `${key} = ?`;
        }).join(', ');
        const values = fields.map(([key, v]) => key === 'is_default' ? (v ? 1 : 0) : v);
        this.db.prepare(`UPDATE vendor_prices SET ${setClauses} WHERE id = ?`).run(...values, id);
      }

      const updated = this.db.prepare('SELECT * FROM vendor_prices WHERE id = ?').get(id) as any;
      if (updated.is_default === 1) {
        this.syncDefaultToItem(existing.item_id, {
          vendor_id: updated.vendor_id,
          order_unit: updated.order_unit,
          order_unit_price: updated.order_unit_price,
          qty_per_unit: updated.qty_per_unit,
          brand_name: updated.brand_name ?? null,
          manufacturer_name: updated.manufacturer_name ?? null,
          gtin: updated.gtin ?? null,
          upc: updated.upc ?? null,
          sysco_supc: updated.sysco_supc ?? null,
          manufacturer_item_code: updated.vendor_item_code ?? null,
        });
      }

      return this.db.prepare(
        `${this.vendorPriceSelectSql} WHERE vp.id = ?`
      ).get(id) as any;
    });

    return this.mapVendorPrice(execute());
  }

  async deleteVendorPrice(id: number): Promise<void> {
    const existing = this.db.prepare('SELECT * FROM vendor_prices WHERE id = ?').get(id) as any;
    if (!existing) return;

    const execute = this.db.transaction(() => {
      this.db.prepare('DELETE FROM vendor_prices WHERE id = ?').run(id);

      if (existing.is_default === 1) {
        this.db.prepare(
          'UPDATE items SET vendor_id = NULL, order_unit = NULL, order_unit_price = NULL, qty_per_unit = NULL WHERE id = ?'
        ).run(existing.item_id);
      }
    });

    execute();
  }

  private syncDefaultToItem(itemId: number, fields: {
    vendor_id: number;
    order_unit: string | null;
    order_unit_price: number;
    qty_per_unit: number | null;
    brand_name: string | null;
    manufacturer_name: string | null;
    gtin: string | null;
    upc: string | null;
    sysco_supc: string | null;
    manufacturer_item_code: string | null;
  }): void {
    this.db.prepare(
      `UPDATE items
       SET vendor_id = ?, order_unit = ?, order_unit_price = ?, qty_per_unit = ?,
           brand_name = ?, manufacturer_name = ?, gtin = ?, upc = ?, sysco_supc = ?, manufacturer_item_code = ?
       WHERE id = ?`
    ).run(
      fields.vendor_id,
      fields.order_unit,
      fields.order_unit_price,
      fields.qty_per_unit,
      fields.brand_name,
      fields.manufacturer_name,
      fields.gtin,
      fields.upc,
      fields.sysco_supc,
      fields.manufacturer_item_code,
      itemId,
    );
  }

  // ── Venues ──────────────────────────────────────────────────

  async listVenues(): Promise<Venue[]> {
    return this.db.prepare('SELECT * FROM venues ORDER BY sort_order ASC, name ASC').all() as Venue[];
  }

  async getVenueById(id: number): Promise<Venue | undefined> {
    return this.db.prepare('SELECT * FROM venues WHERE id = ?').get(id) as Venue | undefined;
  }

  async createVenue(input: CreateVenueInput): Promise<Venue> {
    const maxOrder = (this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM venues').get() as { m: number }).m;
    const result = this.db.prepare('INSERT INTO venues (name, sort_order) VALUES (?, ?)').run(input.name, maxOrder + 1);
    return this.db.prepare('SELECT * FROM venues WHERE id = ?').get(result.lastInsertRowid) as Venue;
  }

  async updateVenue(id: number, input: UpdateVenueInput): Promise<Venue> {
    const sets: string[] = ['name = ?'];
    const params: unknown[] = [input.name];
    if (input.show_in_menus !== undefined) {
      sets.push('show_in_menus = ?');
      params.push(input.show_in_menus);
    }
    params.push(id);
    this.db.prepare(`UPDATE venues SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this.db.prepare('SELECT * FROM venues WHERE id = ?').get(id) as Venue;
  }

  async deleteVenue(id: number): Promise<void> {
    this.db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  }

  async countItemsForVenue(venueId: number): Promise<number> {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM items WHERE venue_id = ?'
    ).get(venueId) as { count: number };
    return row.count;
  }

  async reorderVenues(orderedIds: number[]): Promise<void> {
    const stmt = this.db.prepare('UPDATE venues SET sort_order = ? WHERE id = ?');
    const txn = this.db.transaction(() => {
      for (let i = 0; i < orderedIds.length; i++) {
        stmt.run(i, orderedIds[i]);
      }
    });
    txn();
  }

  // ── Orders ──────────────────────────────────────────────────

  async listOrders(): Promise<OrderWithVendor[]> {
    return this.db.prepare(`
      SELECT o.*, v.name as vendor_name,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
      FROM orders o
      JOIN vendors v ON o.vendor_id = v.id
      ORDER BY o.created_at DESC
    `).all() as OrderWithVendor[];
  }

  async getOrderById(id: number): Promise<OrderDetail | undefined> {
    const order = this.db.prepare(`
      SELECT o.*, v.name as vendor_name
      FROM orders o
      JOIN vendors v ON o.vendor_id = v.id
      WHERE o.id = ?
    `).get(id) as (Order & { vendor_name: string }) | undefined;
    if (!order) return undefined;

    const items = this.db.prepare(`
      SELECT oi.*, i.name as item_name
      FROM order_items oi
      JOIN items i ON oi.item_id = i.id
      WHERE oi.order_id = ?
    `).all(id) as OrderItem[];

    return { ...order, items };
  }

  async createOrder(input: CreateOrderInput): Promise<OrderDetail> {
    const totalCost = input.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const result = this.db.prepare(
      'INSERT INTO orders (vendor_id, notes, total_estimated_cost) VALUES (?, ?, ?)'
    ).run(input.vendor_id, input.notes ?? null, Math.round(totalCost * 100) / 100);

    const orderId = Number(result.lastInsertRowid);
    const insertItem = this.db.prepare(
      'INSERT INTO order_items (order_id, item_id, quantity, unit, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)'
    );

    for (const item of input.items) {
      const lineTotal = Math.round(item.quantity * item.unit_price * 100) / 100;
      insertItem.run(orderId, item.item_id, item.quantity, item.unit, item.unit_price, lineTotal);
    }

    return (await this.getOrderById(orderId))!;
  }

  async updateOrder(id: number, input: UpdateOrderInput): Promise<OrderDetail> {
    if (input.notes !== undefined) {
      this.db.prepare('UPDATE orders SET notes = ? WHERE id = ?').run(input.notes, id);
    }
    if (input.items) {
      this.db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
      const insertItem = this.db.prepare(
        'INSERT INTO order_items (order_id, item_id, quantity, unit, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)'
      );
      let totalCost = 0;
      for (const item of input.items) {
        const lineTotal = Math.round(item.quantity * item.unit_price * 100) / 100;
        insertItem.run(id, item.item_id, item.quantity, item.unit, item.unit_price, lineTotal);
        totalCost += lineTotal;
      }
      this.db.prepare('UPDATE orders SET total_estimated_cost = ? WHERE id = ?').run(
        Math.round(totalCost * 100) / 100, id
      );
    }
    return (await this.getOrderById(id))!;
  }

  async updateOrderStatus(id: number, status: 'sent'): Promise<Order> {
    this.db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
    return this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Order;
  }

  async deleteOrder(id: number): Promise<void> {
    this.db.prepare('DELETE FROM orders WHERE id = ?').run(id);
  }

  // ── Recipes ──────────────────────────────────────────────────

  async listRecipes(): Promise<RecipeWithCost[]> {
    const recipes = this.db.prepare('SELECT * FROM recipes ORDER BY name').all() as Recipe[];
    return recipes.map((r) => {
      const detail = this.db.prepare(`
        SELECT ri.quantity, ri.unit, ri.item_id,
               i.unit as item_unit, i.order_unit as item_order_unit, i.inner_unit as item_inner_unit,
               i.qty_per_unit as item_qty_per_unit, i.item_size_value, i.item_size_unit
        FROM recipe_items ri
        JOIN items i ON ri.item_id = i.id
        WHERE ri.recipe_id = ?
      `).all(r.id) as Array<{
        quantity: number; unit: string; item_id: number;
        item_unit: string; item_order_unit: string | null; item_inner_unit: string | null;
        item_qty_per_unit: number | null; item_size_value: number | null; item_size_unit: string | null;
      }>;

      let totalCost: number | null = null;
      for (const ri of detail) {
        const price = this.db.prepare(`
          SELECT order_unit_price, order_unit, qty_per_unit
          FROM vendor_prices
          WHERE item_id = ?
          ORDER BY is_default DESC, id ASC
          LIMIT 1
        `).get(ri.item_id) as { order_unit_price: number; order_unit: string | null; qty_per_unit: number | null } | undefined;

        if (price) {
          const unitCost = costPerRecipeUnit(ri.unit, price, {
            unit: ri.item_unit,
            order_unit: ri.item_order_unit,
            inner_unit: ri.item_inner_unit,
            qty_per_unit: ri.item_qty_per_unit,
            item_size_value: ri.item_size_value,
            item_size_unit: ri.item_size_unit,
          });
          if (unitCost != null) {
            totalCost = (totalCost ?? 0) + ri.quantity * unitCost;
          }
        }
      }

      const costPerServing = totalCost != null && r.serving_count != null && r.serving_count > 0
        ? Math.round((totalCost / r.serving_count) * 100) / 100
        : null;

      return {
        ...r,
        total_cost: totalCost != null ? Math.round(totalCost * 100) / 100 : null,
        cost_per_serving: costPerServing,
        item_count: detail.length,
      };
    });
  }

  async getRecipeById(id: number): Promise<RecipeDetail | undefined> {
    const recipe = this.db.prepare('SELECT * FROM recipes WHERE id = ?').get(id) as Recipe | undefined;
    if (!recipe) return undefined;

    const rawItems = this.db.prepare(`
      SELECT ri.*, i.name as item_name, i.unit as item_unit,
             i.order_unit as item_order_unit, i.inner_unit as item_inner_unit,
             i.qty_per_unit as item_qty_per_unit, i.item_size_value, i.item_size_unit
      FROM recipe_items ri
      JOIN items i ON ri.item_id = i.id
      WHERE ri.recipe_id = ?
    `).all(id) as (RecipeItem & {
      item_order_unit: string | null; item_inner_unit: string | null;
      item_qty_per_unit: number | null; item_size_value: number | null; item_size_unit: string | null;
    })[];

    // Enrich with vendor pricing using full unit conversion
    let totalCost: number | null = null;
    const items = rawItems.map((ri) => {
      const price = this.db.prepare(`
        SELECT order_unit_price, order_unit, qty_per_unit
        FROM vendor_prices
        WHERE item_id = ?
        ORDER BY is_default DESC, id ASC
        LIMIT 1
      `).get(ri.item_id) as { order_unit_price: number; order_unit: string | null; qty_per_unit: number | null } | undefined;

      let unitCost: number | null = null;
      if (price) {
        unitCost = costPerRecipeUnit(ri.unit, price, {
          unit: ri.item_unit as string,
          order_unit: ri.item_order_unit,
          inner_unit: ri.item_inner_unit,
          qty_per_unit: ri.item_qty_per_unit,
          item_size_value: ri.item_size_value,
          item_size_unit: ri.item_size_unit,
        });
      }

      const lineCost = unitCost != null ? Math.round(ri.quantity * unitCost * 100) / 100 : null;
      if (lineCost != null) {
        totalCost = (totalCost ?? 0) + lineCost;
      }

      // Strip extra join fields before returning
      const { item_order_unit, item_inner_unit, item_qty_per_unit, item_size_value, item_size_unit, ...clean } = ri;
      return { ...clean, unit_cost: unitCost, line_cost: lineCost };
    });

    const roundedTotalCost = totalCost != null ? Math.round(totalCost * 100) / 100 : null;
    const costPerServing = roundedTotalCost != null && recipe.serving_count != null && recipe.serving_count > 0
      ? Math.round((roundedTotalCost / recipe.serving_count) * 100) / 100
      : null;

    return { ...recipe, items, total_cost: roundedTotalCost, cost_per_serving: costPerServing };
  }

  async deleteRecipe(id: number): Promise<void> {
    const recipeVersionIds = this.db
      .prepare('SELECT id FROM recipe_versions WHERE recipe_id = ?')
      .all(id) as Array<{ id: number }>;

    const deleteRecipeTransaction = this.db.transaction((recipeId: number, versionIds: number[]) => {
      if (versionIds.length > 0) {
        const placeholders = versionIds.map(() => '?').join(', ');
        this.db.prepare(
          `
            UPDATE recipe_promotion_events
            SET promoted_recipe_id = NULL,
                promoted_recipe_version_id = NULL
            WHERE promoted_recipe_id = ?
               OR promoted_recipe_version_id IN (${placeholders})
          `
        ).run(recipeId, ...versionIds);
      } else {
        this.db.prepare(
          `
            UPDATE recipe_promotion_events
            SET promoted_recipe_id = NULL,
                promoted_recipe_version_id = NULL
            WHERE promoted_recipe_id = ?
          `
        ).run(recipeId);
      }

      this.db.prepare('DELETE FROM recipe_builder_promotion_links WHERE recipe_id = ?').run(recipeId);
      this.db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);
    });

    deleteRecipeTransaction(id, recipeVersionIds.map((row) => row.id));
  }

  // ── Forecasts ─────────────────────────────────────────────────

  async listForecasts(): Promise<Forecast[]> {
    const rows = this.db.prepare(
      'SELECT * FROM forecasts ORDER BY created_at DESC'
    ).all() as any[];
    return rows.map((r) => ({ ...r, raw_dates: JSON.parse(r.raw_dates) }));
  }

  async getForecastById(id: number): Promise<ForecastWithEntries | undefined> {
    const row = this.db.prepare('SELECT * FROM forecasts WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    const entries = this.db.prepare(
      'SELECT * FROM forecast_entries WHERE forecast_id = ? ORDER BY forecast_date, product_name'
    ).all(id) as ForecastEntry[];
    return { ...row, raw_dates: JSON.parse(row.raw_dates), entries };
  }

  async saveForecast(input: SaveForecastInput): Promise<Forecast> {
    const dates = input.dates;
    const start = dates[0] ?? null;
    const end = dates[dates.length - 1] ?? null;

    const result = this.db.prepare(
      'INSERT INTO forecasts (filename, date_range_start, date_range_end, raw_dates) VALUES (?, ?, ?, ?)'
    ).run(input.filename, start, end, JSON.stringify(dates));

    const forecastId = Number(result.lastInsertRowid);
    const insertEntry = this.db.prepare(
      'INSERT INTO forecast_entries (forecast_id, product_code, product_name, forecast_date, guest_count) VALUES (?, ?, ?, ?, ?)'
    );
    for (const product of input.products) {
      for (const [date, count] of Object.entries(product.counts)) {
        if (count > 0) {
          insertEntry.run(forecastId, product.product_code ?? null, product.product_name, date, count);
        }
      }
    }

    return this.db.prepare('SELECT * FROM forecasts WHERE id = ?').get(forecastId) as any;
  }

  async updateForecastEntry(id: number, guest_count: number): Promise<ForecastEntry> {
    this.db.prepare('UPDATE forecast_entries SET guest_count = ? WHERE id = ?').run(guest_count, id);
    const row = this.db.prepare('SELECT * FROM forecast_entries WHERE id = ?').get(id) as ForecastEntry | undefined;
    if (!row) throw new Error('Forecast entry not found');
    return row;
  }

  async deleteForecast(id: number): Promise<void> {
    this.db.prepare('DELETE FROM forecasts WHERE id = ?').run(id);
  }

  async listForecastMappings(): Promise<ForecastProductMapping[]> {
    return this.db.prepare(`
      SELECT fm.*, v.name as venue_name
      FROM forecast_product_mappings fm
      JOIN venues v ON v.id = fm.venue_id
      ORDER BY fm.product_name
    `).all() as ForecastProductMapping[];
  }

  async saveForecastMapping(input: { product_name: string; venue_id: number }): Promise<ForecastProductMapping> {
    this.db.prepare(`
      INSERT INTO forecast_product_mappings (product_name, venue_id)
      VALUES (?, ?)
      ON CONFLICT(product_name) DO UPDATE SET venue_id = excluded.venue_id
    `).run(input.product_name, input.venue_id);

    return this.db.prepare(`
      SELECT fm.*, v.name as venue_name
      FROM forecast_product_mappings fm
      JOIN venues v ON v.id = fm.venue_id
      WHERE fm.product_name = ?
    `).get(input.product_name) as ForecastProductMapping;
  }

  async saveForecastMappingsBulk(inputs: Array<{ product_name: string; venue_id: number }>): Promise<ForecastProductMapping[]> {
    const results: ForecastProductMapping[] = [];
    for (const input of inputs) {
      results.push(await this.saveForecastMapping(input));
    }
    return results;
  }

  async deleteForecastMapping(id: number): Promise<void> {
    this.db.prepare('DELETE FROM forecast_product_mappings WHERE id = ?').run(id);
  }

  // ── Reports ──────────────────────────────────────────────────

  async getUsageReport(filters: ReportFilters): Promise<UsageReport> {
    const { start, end, groupBy, venueId } = filters;
    const venueFilter = venueId !== undefined ? ' AND i.venue_id = ?' : '';
    const venueParams = venueId !== undefined ? [venueId] : [];
    const periodExpr = groupBy === 'week'
      ? "strftime('%Y-W%W', t.created_at)"
      : "date(t.created_at)";

    const rows = this.db.prepare(`
      SELECT
        ${periodExpr} as period,
        i.name as item_name,
        i.category,
        COALESCE(SUM(CASE WHEN t.type = 'in' THEN t.quantity ELSE 0 END), 0) as in_qty,
        COALESCE(SUM(CASE WHEN t.type = 'out' THEN t.quantity ELSE 0 END), 0) as out_qty,
        COUNT(*) as tx_count
      FROM transactions t
      JOIN items i ON t.item_id = i.id
      WHERE t.created_at >= ? AND t.created_at < ? || 'T23:59:59.999Z'${venueFilter}
      GROUP BY period, i.id
      ORDER BY period DESC, out_qty DESC
    `).all(start, end, ...venueParams) as UsageRow[];

    const totals = rows.reduce(
      (acc, r) => ({
        in_qty: acc.in_qty + r.in_qty,
        out_qty: acc.out_qty + r.out_qty,
        tx_count: acc.tx_count + r.tx_count,
      }),
      { in_qty: 0, out_qty: 0, tx_count: 0 },
    );

    return { rows, totals };
  }

  async getWasteReport(filters: ReportFilters): Promise<WasteReport> {
    const { start, end, venueId } = filters;
    const venueFilter = venueId !== undefined ? ' AND i.venue_id = ?' : '';
    const venueParams = venueId !== undefined ? [venueId] : [];

    const rows = this.db.prepare(`
      SELECT
        i.name as item_name,
        i.category,
        SUM(t.quantity) as quantity,
        COALESCE(SUM(t.estimated_cost), 0) as estimated_cost
      FROM transactions t
      JOIN items i ON t.item_id = i.id
      WHERE t.reason = 'Wasted'
        AND t.created_at >= ? AND t.created_at < ? || 'T23:59:59.999Z'${venueFilter}
      GROUP BY i.id
      ORDER BY estimated_cost DESC
    `).all(start, end, ...venueParams) as WasteRow[];

    const totals = rows.reduce(
      (acc, r) => ({
        quantity: acc.quantity + r.quantity,
        estimated_cost: acc.estimated_cost + r.estimated_cost,
      }),
      { quantity: 0, estimated_cost: 0 },
    );

    return { rows, totals };
  }

  async getCostReport(filters: ReportFilters): Promise<CostReport> {
    const { start, end, groupBy, venueId } = filters;
    const venueFilter = venueId !== undefined ? ' AND i.venue_id = ?' : '';
    const venueParams = venueId !== undefined ? [venueId] : [];
    const groupExpr = groupBy === 'vendor'
      ? "COALESCE(v.name, 'No Vendor')"
      : 'i.category';
    const joinClause = groupBy === 'vendor'
      ? 'LEFT JOIN vendors v ON i.vendor_id = v.id'
      : '';

    const rows = this.db.prepare(`
      SELECT
        ${groupExpr} as group_name,
        COALESCE(SUM(CASE WHEN t.type = 'in' THEN t.estimated_cost ELSE 0 END), 0) as in_cost,
        COALESCE(SUM(CASE WHEN t.type = 'out' THEN t.estimated_cost ELSE 0 END), 0) as out_cost,
        COALESCE(SUM(CASE WHEN t.type = 'in' THEN t.estimated_cost ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN t.type = 'out' THEN t.estimated_cost ELSE 0 END), 0) as net_cost,
        COUNT(*) as tx_count
      FROM transactions t
      JOIN items i ON t.item_id = i.id
      ${joinClause}
      WHERE t.estimated_cost IS NOT NULL
        AND t.created_at >= ? AND t.created_at < ? || 'T23:59:59.999Z'${venueFilter}
      GROUP BY group_name
      ORDER BY in_cost DESC
    `).all(start, end, ...venueParams) as CostRow[];

    const totals = rows.reduce(
      (acc, r) => ({
        in_cost: acc.in_cost + r.in_cost,
        out_cost: acc.out_cost + r.out_cost,
        net_cost: acc.net_cost + r.net_cost,
      }),
      { in_cost: 0, out_cost: 0, net_cost: 0 },
    );

    return { rows, totals };
  }

  // ── Snack Bar Sales ─────────────────────────────────────────

  async createSale(input: { itemId: number; quantity: number; unitQty?: number; fromAreaId: number }): Promise<SaleWithItem> {
    const item = this.db.prepare('SELECT * FROM items WHERE id = ?').get(input.itemId) as Item | undefined;
    if (!item) throw new Error('Item not found');
    if (!item.sale_price) throw new Error('Item has no sale price set');

    const unitQty = input.unitQty ?? 1;
    const total = unitQty * item.sale_price;

    const execute = this.db.transaction(() => {
      // 1. Insert sale record
      const result = this.db.prepare(
        'INSERT INTO sales (item_id, quantity, unit_qty, sale_price, total) VALUES (?, ?, ?, ?, ?)'
      ).run(input.itemId, input.quantity, unitQty, item.sale_price, total);

      // 2. Decrement inventory from snack bar area
      this.db.prepare(
        'UPDATE item_storage SET quantity = quantity - ? WHERE item_id = ? AND area_id = ?'
      ).run(input.quantity, input.itemId, input.fromAreaId);

      // 3. Recalculate current_qty
      const sumRow = this.db.prepare(
        'SELECT COALESCE(SUM(quantity), 0) as total FROM item_storage WHERE item_id = ?'
      ).get(input.itemId) as { total: number };
      this.db.prepare('UPDATE items SET current_qty = ? WHERE id = ?').run(sumRow.total, input.itemId);

      // 4. Create companion transaction for audit trail
      this.db.prepare(
        'INSERT INTO transactions (item_id, type, quantity, reason, notes, from_area_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(input.itemId, 'out', input.quantity, 'Used', 'Snack bar sale', input.fromAreaId);

      const sale = this.db.prepare(`
        SELECT s.*, i.name as item_name, i.unit as item_unit
        FROM sales s JOIN items i ON s.item_id = i.id
        WHERE s.id = ?
      `).get(result.lastInsertRowid) as SaleWithItem;

      return sale;
    });

    return execute();
  }

  async listSales(filters?: SalesFilters): Promise<SaleWithItem[]> {
    let sql = `
      SELECT s.*, i.name as item_name, i.unit as item_unit
      FROM sales s JOIN items i ON s.item_id = i.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.start_date) {
      sql += ' AND s.created_at >= ?';
      params.push(filters.start_date);
    }
    if (filters?.end_date) {
      sql += ' AND s.created_at <= ?';
      params.push(filters.end_date + ' 23:59:59');
    }
    if (filters?.item_id) {
      sql += ' AND s.item_id = ?';
      params.push(filters.item_id);
    }

    sql += ' ORDER BY s.created_at DESC';

    return this.db.prepare(sql).all(...params) as SaleWithItem[];
  }

  async getSalesSummary(filters?: { start_date?: string; end_date?: string }): Promise<SalesSummary> {
    let whereClause = '1=1';
    const params: any[] = [];

    if (filters?.start_date) {
      whereClause += ' AND s.created_at >= ?';
      params.push(filters.start_date);
    }
    if (filters?.end_date) {
      whereClause += ' AND s.created_at <= ?';
      params.push(filters.end_date + ' 23:59:59');
    }

    const totals = this.db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total_revenue,
             COALESCE(SUM(unit_qty), 0) as total_items_sold,
             COUNT(*) as sale_count
      FROM sales s WHERE ${whereClause}
    `).get(...params) as { total_revenue: number; total_items_sold: number; sale_count: number };

    const daily = this.db.prepare(`
      SELECT date(s.created_at) as date,
             SUM(s.total) as revenue,
             SUM(s.unit_qty) as items_sold,
             COUNT(*) as sale_count
      FROM sales s WHERE ${whereClause}
      GROUP BY date(s.created_at)
      ORDER BY date
    `).all(...params) as SalesSummary['daily'];

    const top_sellers = this.db.prepare(`
      SELECT s.item_id, i.name as item_name,
             SUM(s.unit_qty) as quantity_sold,
             SUM(s.total) as revenue
      FROM sales s JOIN items i ON s.item_id = i.id
      WHERE ${whereClause}
      GROUP BY s.item_id
      ORDER BY revenue DESC
      LIMIT 10
    `).all(...params) as SalesSummary['top_sellers'];

    const profit_margins = this.db.prepare(`
      SELECT i.id as item_id, i.name as item_name,
             i.sale_price,
             vp.order_unit_price as cost_price,
             CASE WHEN vp.order_unit_price IS NOT NULL AND i.sale_price > 0
               THEN ROUND((i.sale_price - vp.order_unit_price) / i.sale_price * 100, 1)
               ELSE NULL
             END as margin
      FROM items i
      LEFT JOIN vendor_prices vp ON vp.item_id = i.id AND vp.is_default = 1
      WHERE i.sale_price IS NOT NULL AND i.sale_price > 0
      ORDER BY i.name
    `).all() as SalesSummary['profit_margins'];

    return { ...totals, daily, top_sellers, profit_margins };
  }
}

export function createSqliteInventoryStore(db: Database.Database): InventoryStore {
  return new SqliteInventoryStore(db);
}
