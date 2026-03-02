import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createStorageAreaRoutes } from '../routes/storageAreas.js';
import { createItemRoutes } from '../routes/items.js';
import { createSqliteInventoryStore } from '../store/sqliteStore.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const store = createSqliteInventoryStore(db);
  const app = express();
  app.use(express.json());
  app.use('/api/storage-areas', createStorageAreaRoutes(store));
  app.use('/api/items', createItemRoutes(store));
  return { app, db };
}

describe('Storage Areas API', () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(() => {
    ({ app, db } = createTestApp());
  });

  afterEach(() => {
    db.close();
  });

  describe('GET /api/storage-areas', () => {
    it('lists all areas including seeded General', async () => {
      const res = await request(app).get('/api/storage-areas');
      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const names = res.body.map((a: any) => a.name);
      expect(names).toContain('General');
    });
  });

  describe('POST /api/storage-areas', () => {
    it('creates a new area and returns 201', async () => {
      const res = await request(app)
        .post('/api/storage-areas')
        .send({ name: 'Walk-in Cooler' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Walk-in Cooler' });
      expect(res.body.id).toBeDefined();
      expect(res.body.created_at).toBeDefined();
    });

    it('returns 409 for duplicate name', async () => {
      await request(app)
        .post('/api/storage-areas')
        .send({ name: 'Dry Storage' });
      const res = await request(app)
        .post('/api/storage-areas')
        .send({ name: 'Dry Storage' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already exists/);
    });

    it('returns 400 for empty name', async () => {
      const res = await request(app)
        .post('/api/storage-areas')
        .send({ name: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/storage-areas/:id', () => {
    it('returns area by id', async () => {
      const created = await request(app)
        .post('/api/storage-areas')
        .send({ name: 'Bar' });
      const res = await request(app).get(`/api/storage-areas/${created.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Bar');
    });

    it('returns 404 for missing id', async () => {
      const res = await request(app).get('/api/storage-areas/9999');
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/);
    });
  });

  describe('PUT /api/storage-areas/:id', () => {
    it('renames area successfully', async () => {
      const created = await request(app)
        .post('/api/storage-areas')
        .send({ name: 'Freezer' });
      const res = await request(app)
        .put(`/api/storage-areas/${created.body.id}`)
        .send({ name: 'Walk-in Freezer' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Walk-in Freezer');
    });

    it('returns 404 for missing id', async () => {
      const res = await request(app)
        .put('/api/storage-areas/9999')
        .send({ name: 'Nowhere' });
      expect(res.status).toBe(404);
    });

    it('returns 409 for duplicate name on rename', async () => {
      await request(app).post('/api/storage-areas').send({ name: 'Area A' });
      const created = await request(app)
        .post('/api/storage-areas')
        .send({ name: 'Area B' });
      const res = await request(app)
        .put(`/api/storage-areas/${created.body.id}`)
        .send({ name: 'Area A' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already exists/);
    });
  });

  describe('DELETE /api/storage-areas/:id', () => {
    it('deletes empty area and returns 204', async () => {
      const created = await request(app)
        .post('/api/storage-areas')
        .send({ name: 'Temp Storage' });
      const res = await request(app).delete(`/api/storage-areas/${created.body.id}`);
      expect(res.status).toBe(204);

      // Verify it's gone
      const check = await request(app).get(`/api/storage-areas/${created.body.id}`);
      expect(check.status).toBe(404);
    });

    it('returns 404 for missing id', async () => {
      const res = await request(app).delete('/api/storage-areas/9999');
      expect(res.status).toBe(404);
    });

    it('returns 409 when area has stock', async () => {
      // Create an item
      const itemResult = db.prepare(
        "INSERT INTO items (name, category, unit) VALUES (?, ?, ?)"
      ).run('Ahi Tuna', 'Seafood', 'lb');
      const itemId = itemResult.lastInsertRowid;

      // Get the General area id
      const generalArea = db.prepare(
        "SELECT id FROM storage_areas WHERE name = 'General'"
      ).get() as { id: number };

      // Insert stock into item_storage for the General area
      db.prepare(
        "INSERT INTO item_storage (item_id, area_id, quantity) VALUES (?, ?, ?)"
      ).run(itemId, generalArea.id, 10);

      // Attempt to delete General area
      const res = await request(app).delete(`/api/storage-areas/${generalArea.id}`);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Cannot delete area with stock/);
    });
  });
});
