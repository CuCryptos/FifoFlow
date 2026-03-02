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

  describe('Area-aware transactions', () => {
    let generalAreaId: number;
    let coolerAreaId: number;

    beforeEach(() => {
      // Get the seeded General area
      const generalArea = db.prepare("SELECT id FROM storage_areas WHERE name = 'General'").get() as { id: number };
      generalAreaId = generalArea.id;

      // Create a second area
      const coolerResult = db.prepare("INSERT INTO storage_areas (name) VALUES ('Walk-in Cooler')").run();
      coolerAreaId = coolerResult.lastInsertRowid as number;

      // Seed item_storage: put all 10 units into General area
      db.prepare(
        "INSERT INTO item_storage (item_id, area_id, quantity) VALUES (?, ?, ?)"
      ).run(itemId, generalAreaId, 10);
    });

    it('IN transaction with to_area_id adds stock to specified area', async () => {
      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({ type: 'in', quantity: 5, reason: 'Received', to_area_id: coolerAreaId });
      expect(res.status).toBe(201);
      expect(res.body.item.current_qty).toBe(15);
      expect(res.body.transaction.to_area_id).toBe(coolerAreaId);

      // Verify item_storage for the cooler area
      const coolerStorage = db.prepare(
        "SELECT quantity FROM item_storage WHERE item_id = ? AND area_id = ?"
      ).get(itemId, coolerAreaId) as { quantity: number };
      expect(coolerStorage.quantity).toBe(5);

      // Verify General area unchanged
      const generalStorage = db.prepare(
        "SELECT quantity FROM item_storage WHERE item_id = ? AND area_id = ?"
      ).get(itemId, generalAreaId) as { quantity: number };
      expect(generalStorage.quantity).toBe(10);
    });

    it('OUT transaction with from_area_id removes stock from specified area', async () => {
      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({ type: 'out', quantity: 3, reason: 'Used', from_area_id: generalAreaId });
      expect(res.status).toBe(201);
      expect(res.body.item.current_qty).toBe(7);
      expect(res.body.transaction.from_area_id).toBe(generalAreaId);

      // Verify item_storage for General area
      const generalStorage = db.prepare(
        "SELECT quantity FROM item_storage WHERE item_id = ? AND area_id = ?"
      ).get(itemId, generalAreaId) as { quantity: number };
      expect(generalStorage.quantity).toBe(7);
    });

    it('transfer decrements source, increments destination, current_qty unchanged', async () => {
      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({
          type: 'out',
          quantity: 4,
          reason: 'Transferred',
          notes: 'Moving to cooler',
          from_area_id: generalAreaId,
          to_area_id: coolerAreaId,
        });
      expect(res.status).toBe(201);
      // Total should stay at 10 since stock just moved between areas
      expect(res.body.item.current_qty).toBe(10);

      // Verify source area decreased
      const generalStorage = db.prepare(
        "SELECT quantity FROM item_storage WHERE item_id = ? AND area_id = ?"
      ).get(itemId, generalAreaId) as { quantity: number };
      expect(generalStorage.quantity).toBe(6);

      // Verify destination area increased
      const coolerStorage = db.prepare(
        "SELECT quantity FROM item_storage WHERE item_id = ? AND area_id = ?"
      ).get(itemId, coolerAreaId) as { quantity: number };
      expect(coolerStorage.quantity).toBe(4);
    });

    it('rejects OUT exceeding area quantity', async () => {
      // Put extra stock in the cooler so total item qty is high enough (10 + 8 = 18),
      // but General only has 10. Requesting 12 from General should fail area check.
      db.prepare(
        "INSERT INTO item_storage (item_id, area_id, quantity) VALUES (?, ?, ?)"
      ).run(itemId, coolerAreaId, 8);
      db.prepare("UPDATE items SET current_qty = 18 WHERE id = ?").run(itemId);

      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({ type: 'out', quantity: 12, reason: 'Used', from_area_id: generalAreaId });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Insufficient quantity in source area/);
    });

    it('rejects transfer with same source and destination area', async () => {
      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({
          type: 'out',
          quantity: 2,
          reason: 'Transferred',
          notes: 'Bad transfer',
          from_area_id: generalAreaId,
          to_area_id: generalAreaId,
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Cannot transfer to the same area/);
    });

    it('rejects transfer missing from_area_id', async () => {
      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({
          type: 'out',
          quantity: 2,
          reason: 'Transferred',
          notes: 'Missing from area',
          to_area_id: coolerAreaId,
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Transfers require both from_area_id and to_area_id/);
    });

    it('rejects transfer missing to_area_id', async () => {
      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({
          type: 'out',
          quantity: 2,
          reason: 'Transferred',
          notes: 'Missing to area',
          from_area_id: generalAreaId,
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Transfers require both from_area_id and to_area_id/);
    });

    it('legacy transaction without area IDs still works', async () => {
      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({ type: 'in', quantity: 3, reason: 'Received' });
      expect(res.status).toBe(201);
      // Legacy path uses delta, not area recalculation
      expect(res.body.item.current_qty).toBe(13);
      expect(res.body.transaction.from_area_id).toBeNull();
      expect(res.body.transaction.to_area_id).toBeNull();
    });
  });
});
