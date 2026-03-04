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
  DashboardStats,
  ItemCountAdjustmentResult,
  Item,
  ItemStorage,
  Order,
  OrderDetail,
  OrderItem,
  OrderWithVendor,
  StorageArea,
  Transaction,
  TransactionWithItem,
  UpdateItemInput,
  UpdateOrderInput,
  UpdateStorageAreaInput,
  UsageReport,
  UsageRow,
  Venue,
  CreateVenueInput,
  UpdateVenueInput,
  Vendor,
  CreateVendorInput,
  UpdateVendorInput,
  WasteReport,
  WasteRow,
} from '@fifoflow/shared';
import type {
  InsertTransactionAndAdjustQtyInput,
  InventoryStore,
  ItemListFilters,
  ReconcileOutcome,
  ReportFilters,
  SetItemCountWithAdjustmentInput,
  TransactionListFilters,
} from './types.js';


export class SqliteInventoryStore implements InventoryStore {
  constructor(private readonly db: Database.Database) {}

  async listItems(filters?: ItemListFilters): Promise<Item[]> {
    let sql = 'SELECT * FROM items WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.category) {
      sql += ' AND category = ?';
      params.push(filters.category);
    }
    if (filters?.search) {
      sql += ' AND name LIKE ?';
      params.push(`%${filters.search}%`);
    }
    if (filters?.venueId !== undefined) {
      sql += ' AND venue_id = ?';
      params.push(filters.venueId);
    }

    sql += ' ORDER BY name ASC';
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
        reorder_qty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        'INSERT INTO transactions (item_id, type, quantity, reason, notes, from_area_id, to_area_id, estimated_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(input.itemId, input.type, input.quantity, input.reason, input.notes, input.fromAreaId ?? null, input.toAreaId ?? null, input.estimatedCost ?? null);

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

  async bulkUpdateItems(ids: number[], updates: { category: string }): Promise<{ updated: number }> {
    const placeholders = ids.map(() => '?').join(',');
    const result = this.db.prepare(
      `UPDATE items SET category = ? WHERE id IN (${placeholders})`
    ).run(updates.category, ...ids);
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
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM items WHERE vendor_id = ?'
    ).get(vendorId) as { count: number };
    return row.count;
  }

  // ── Venues ──────────────────────────────────────────────────

  async listVenues(): Promise<Venue[]> {
    return this.db.prepare('SELECT * FROM venues ORDER BY name ASC').all() as Venue[];
  }

  async getVenueById(id: number): Promise<Venue | undefined> {
    return this.db.prepare('SELECT * FROM venues WHERE id = ?').get(id) as Venue | undefined;
  }

  async createVenue(input: CreateVenueInput): Promise<Venue> {
    const result = this.db.prepare('INSERT INTO venues (name) VALUES (?)').run(input.name);
    return this.db.prepare('SELECT * FROM venues WHERE id = ?').get(result.lastInsertRowid) as Venue;
  }

  async updateVenue(id: number, input: UpdateVenueInput): Promise<Venue> {
    this.db.prepare('UPDATE venues SET name = ? WHERE id = ?').run(input.name, id);
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
}

export function createSqliteInventoryStore(db: Database.Database): InventoryStore {
  return new SqliteInventoryStore(db);
}
