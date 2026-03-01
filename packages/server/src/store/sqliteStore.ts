import type Database from 'better-sqlite3';
import type {
  CloseCountSessionInput,
  CountSession,
  CountSessionChecklistItem,
  CountSessionEntry,
  CountSessionSummary,
  CreateCountSessionInput,
  CreateItemInput,
  DashboardStats,
  ItemCountAdjustmentResult,
  Item,
  Transaction,
  TransactionWithItem,
  UpdateItemInput,
} from '@fifoflow/shared';
import type {
  InsertTransactionAndAdjustQtyInput,
  InventoryStore,
  ItemListFilters,
  ReconcileOutcome,
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

    sql += ' ORDER BY name ASC';
    return this.db.prepare(sql).all(...params) as Item[];
  }

  async listItemsWithReorderLevel(): Promise<Item[]> {
    return this.db.prepare('SELECT * FROM items WHERE reorder_level IS NOT NULL').all() as Item[];
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

    sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(filters?.limit ?? 50, filters?.offset ?? 0);

    return this.db.prepare(sql).all(...params) as TransactionWithItem[];
  }

  async insertTransactionAndAdjustQty(input: InsertTransactionAndAdjustQtyInput): Promise<{
    transaction: Transaction;
    item: Item;
  }> {
    const execute = this.db.transaction(() => {
      const result = this.db.prepare(
        'INSERT INTO transactions (item_id, type, quantity, reason, notes) VALUES (?, ?, ?, ?, ?)'
      ).run(input.itemId, input.type, input.quantity, input.reason, input.notes);

      this.db.prepare('UPDATE items SET current_qty = current_qty + ? WHERE id = ?').run(input.delta, input.itemId);

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

  async getDashboardStats(lowStockThreshold: number): Promise<DashboardStats> {
    const totalItems = this.db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number };
    const lowStock = this.db.prepare(
      'SELECT COUNT(*) as count FROM items WHERE current_qty > 0 AND current_qty <= ?'
    ).get(lowStockThreshold) as { count: number };
    const outOfStock = this.db.prepare(
      'SELECT COUNT(*) as count FROM items WHERE current_qty = 0'
    ).get() as { count: number };
    const todayTx = this.db.prepare(
      "SELECT COUNT(*) as count FROM transactions WHERE date(created_at) = date('now')"
    ).get() as { count: number };

    return {
      total_items: totalItems.count,
      low_stock_count: lowStock.count,
      out_of_stock_count: outOfStock.count,
      today_transaction_count: todayTx.count,
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
}

export function createSqliteInventoryStore(db: Database.Database): InventoryStore {
  return new SqliteInventoryStore(db);
}
