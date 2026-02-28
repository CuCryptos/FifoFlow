import { Router } from 'express';
import type Database from 'better-sqlite3';
import { createItemSchema, updateItemSchema } from '@fifoflow/shared';
import type { Item, Transaction } from '@fifoflow/shared';
import { createTransactionHandler } from './transactions.js';

export function createItemRoutes(db: Database.Database): Router {
  const router = Router();

  // GET /api/items
  router.get('/', (req, res) => {
    const { search, category } = req.query;
    let sql = 'SELECT * FROM items WHERE 1=1';
    const params: unknown[] = [];

    if (category && typeof category === 'string') {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (search && typeof search === 'string') {
      sql += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }

    sql += ' ORDER BY name ASC';
    const items = db.prepare(sql).all(...params);
    res.json(items);
  });

  // GET /api/items/:id
  router.get('/:id', (req, res) => {
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id) as Item | undefined;
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const transactions = db.prepare(
      'SELECT * FROM transactions WHERE item_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(req.params.id) as Transaction[];

    res.json({ item, transactions });
  });

  // POST /api/items
  router.post('/', (req, res) => {
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { name, category, unit } = parsed.data;
    const result = db.prepare(
      'INSERT INTO items (name, category, unit) VALUES (?, ?, ?)'
    ).run(name, category, unit);

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  });

  // PUT /api/items/:id
  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id) as Item | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const updates = parsed.data;
    const fields = Object.entries(updates).filter(([, v]) => v !== undefined);
    if (fields.length === 0) {
      res.json(existing);
      return;
    }

    const setClauses = fields.map(([key]) => `${key} = ?`).join(', ');
    const values = fields.map(([, v]) => v);

    db.prepare(`UPDATE items SET ${setClauses} WHERE id = ?`).run(...values, req.params.id);
    const updated = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
    res.json(updated);
  });

  // DELETE /api/items/:id
  router.delete('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id) as Item | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const txCount = db.prepare(
      'SELECT COUNT(*) as count FROM transactions WHERE item_id = ?'
    ).get(req.params.id) as { count: number };

    if (txCount.count > 0) {
      res.status(409).json({ error: 'Cannot delete item with transaction history' });
      return;
    }

    db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
    res.status(204).send();
  });

  // POST /api/items/:id/transactions
  router.post('/:id/transactions', createTransactionHandler(db));

  return router;
}
