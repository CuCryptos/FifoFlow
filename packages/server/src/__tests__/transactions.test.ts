import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createItemRoutes } from '../routes/items.js';
import { createTransactionRoutes } from '../routes/transactions.js';
import { createSqliteInventoryStore } from '../store/sqliteStore.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const store = createSqliteInventoryStore(db);
  const app = express();
  app.use(express.json());
  app.use('/api/items', createItemRoutes(store));
  app.use('/api/transactions', createTransactionRoutes(store));
  return { app, db };
}

describe('Transactions API', () => {
  let app: express.Express;
  let db: Database.Database;
  let itemId: number;

  beforeEach(() => {
    ({ app, db } = createTestApp());
    const result = db.prepare("INSERT INTO items (name, category, unit, current_qty) VALUES (?, ?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb', 10);
    itemId = result.lastInsertRowid as number;
  });

  afterEach(() => {
    db.close();
  });

  describe('POST /api/items/:id/transactions', () => {
    it('logs an IN transaction and updates quantity', async () => {
      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({ type: 'in', quantity: 5, reason: 'Received' });
      expect(res.status).toBe(201);
      expect(res.body.transaction.quantity).toBe(5);
      expect(res.body.item.current_qty).toBe(15);
    });

    it('logs an OUT transaction and updates quantity', async () => {
      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({ type: 'out', quantity: 3, reason: 'Used' });
      expect(res.status).toBe(201);
      expect(res.body.item.current_qty).toBe(7);
    });

    it('rejects negative resulting quantity', async () => {
      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({ type: 'out', quantity: 999, reason: 'Used' });
      expect(res.status).toBe(400);
    });

    it('rejects invalid reason', async () => {
      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({ type: 'in', quantity: 5, reason: 'Stolen' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/transactions', () => {
    beforeEach(() => {
      db.prepare("INSERT INTO transactions (item_id, type, quantity, reason) VALUES (?, ?, ?, ?)").run(itemId, 'in', 20, 'Received');
      db.prepare("INSERT INTO transactions (item_id, type, quantity, reason) VALUES (?, ?, ?, ?)").run(itemId, 'out', 5, 'Used');
    });

    it('lists all transactions with item name', async () => {
      const res = await request(app).get('/api/transactions');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      expect(res.body[0].item_name).toBe('Ahi Tuna');
    });

    it('filters by item_id', async () => {
      const res = await request(app).get(`/api/transactions?item_id=${itemId}`);
      expect(res.status).toBe(200);
      expect(res.body.every((t: any) => t.item_id === itemId)).toBe(true);
    });
  });
});
