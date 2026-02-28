import { Router } from 'express';
import type Database from 'better-sqlite3';
import { createTransactionSchema } from '@fifoflow/shared';
import type { Item, TransactionWithItem } from '@fifoflow/shared';

export function createTransactionRoutes(db: Database.Database): Router {
  const router = Router();

  // GET /api/transactions
  router.get('/', (req, res) => {
    const { item_id, type, limit = '50', offset = '0' } = req.query;
    let sql = `
      SELECT t.*, i.name as item_name, i.unit as item_unit
      FROM transactions t
      JOIN items i ON t.item_id = i.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (item_id) {
      sql += ' AND t.item_id = ?';
      params.push(item_id);
    }
    if (type && typeof type === 'string') {
      sql += ' AND t.type = ?';
      params.push(type);
    }

    sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const transactions = db.prepare(sql).all(...params) as TransactionWithItem[];
    res.json(transactions);
  });

  return router;
}

// Handler for POST /api/items/:id/transactions (mounted on item routes)
export function createTransactionHandler(db: Database.Database) {
  return (req: any, res: any) => {
    const itemId = Number(req.params.id);
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as Item | undefined;
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const parsed = createTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { type, quantity, reason, notes } = parsed.data;
    const delta = type === 'in' ? quantity : -quantity;

    if (item.current_qty + delta < 0) {
      res.status(400).json({ error: 'Insufficient quantity. Cannot go below zero.' });
      return;
    }

    const execute = db.transaction(() => {
      const result = db.prepare(
        'INSERT INTO transactions (item_id, type, quantity, reason, notes) VALUES (?, ?, ?, ?, ?)'
      ).run(itemId, type, quantity, reason, notes ?? null);

      db.prepare('UPDATE items SET current_qty = current_qty + ? WHERE id = ?').run(delta, itemId);

      const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
      const updatedItem = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
      return { transaction, item: updatedItem };
    });

    const result = execute();
    res.status(201).json(result);
  };
}
