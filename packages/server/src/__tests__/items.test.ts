import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createItemRoutes } from '../routes/items.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const app = express();
  app.use(express.json());
  app.use('/api/items', createItemRoutes(db));
  return { app, db };
}

describe('Items API', () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(() => {
    ({ app, db } = createTestApp());
  });

  afterEach(() => {
    db.close();
  });

  describe('POST /api/items', () => {
    it('creates an item', async () => {
      const res = await request(app)
        .post('/api/items')
        .send({ name: 'Ahi Tuna', category: 'Seafood', unit: 'lb' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'Ahi Tuna',
        category: 'Seafood',
        unit: 'lb',
        current_qty: 0,
      });
      expect(res.body.id).toBeDefined();
    });

    it('rejects invalid category', async () => {
      const res = await request(app)
        .post('/api/items')
        .send({ name: 'Test', category: 'InvalidCat', unit: 'lb' });
      expect(res.status).toBe(400);
    });

    it('rejects missing name', async () => {
      const res = await request(app)
        .post('/api/items')
        .send({ category: 'Seafood', unit: 'lb' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/items', () => {
    beforeEach(() => {
      db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb');
      db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Jasmine Rice', 'Dry Goods', 'bag');
      db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Maui Onion', 'Produce', 'each');
    });

    it('lists all items', async () => {
      const res = await request(app).get('/api/items');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
    });

    it('filters by category', async () => {
      const res = await request(app).get('/api/items?category=Seafood');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Ahi Tuna');
    });

    it('searches by name', async () => {
      const res = await request(app).get('/api/items?search=rice');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Jasmine Rice');
    });
  });

  describe('GET /api/items/:id', () => {
    it('returns item with recent transactions', async () => {
      const result = db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb');
      const itemId = result.lastInsertRowid;
      db.prepare("INSERT INTO transactions (item_id, type, quantity, reason) VALUES (?, ?, ?, ?)").run(itemId, 'in', 20, 'Received');

      const res = await request(app).get(`/api/items/${itemId}`);
      expect(res.status).toBe(200);
      expect(res.body.item.name).toBe('Ahi Tuna');
      expect(res.body.transactions).toHaveLength(1);
    });

    it('returns 404 for nonexistent item', async () => {
      const res = await request(app).get('/api/items/9999');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/items/:id', () => {
    it('updates item fields', async () => {
      const result = db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb');
      const res = await request(app)
        .put(`/api/items/${result.lastInsertRowid}`)
        .send({ name: 'Yellowfin Tuna' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Yellowfin Tuna');
    });
  });

  describe('DELETE /api/items/:id', () => {
    it('deletes item with no transactions', async () => {
      const result = db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb');
      const res = await request(app).delete(`/api/items/${result.lastInsertRowid}`);
      expect(res.status).toBe(204);
    });

    it('blocks delete when transactions exist', async () => {
      const result = db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb');
      db.prepare("INSERT INTO transactions (item_id, type, quantity, reason) VALUES (?, ?, ?, ?)").run(result.lastInsertRowid, 'in', 10, 'Received');
      const res = await request(app).delete(`/api/items/${result.lastInsertRowid}`);
      expect(res.status).toBe(409);
    });
  });
});
