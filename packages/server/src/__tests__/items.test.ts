import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createItemRoutes } from '../routes/items.js';
import { createSqliteInventoryStore } from '../store/sqliteStore.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const store = createSqliteInventoryStore(db);
  const app = express();
  app.use(express.json());
  app.use('/api/items', createItemRoutes(store));
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
    it('creates an item with overview fields', async () => {
      const res = await request(app)
        .post('/api/items')
        .send({ name: 'Ahi Tuna', category: 'Seafood', unit: 'lb' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'Ahi Tuna',
        category: 'Seafood',
        unit: 'lb',
        current_qty: 0,
        vendor_name: null,
        venue_name: null,
        storage_area_name: null,
        storage_location_count: 0,
        storage_total_qty: 0,
        storage_qty_delta: 0,
        pack_summary: null,
        unit_cost: null,
        inventory_value: null,
        ordering_missing_fields: ['reorder_level', 'reorder_qty', 'order_unit', 'qty_per_unit', 'order_unit_price'],
        workflow_flags: {
          missing_vendor: true,
          missing_venue: true,
          missing_storage_area: true,
          ordering_incomplete: true,
          needs_reorder: false,
          needs_attention: true,
        },
      });
      expect(res.body.id).toBeDefined();
    });

    it('accepts a custom inventory category and persists it for future use', async () => {
      const res = await request(app)
        .post('/api/items')
        .send({ name: 'Test', category: 'InvalidCat', unit: 'lb' });
      expect(res.status).toBe(201);
      const categoryRow = db.prepare('SELECT name FROM inventory_categories WHERE name = ?').get('InvalidCat') as { name: string } | undefined;
      expect(categoryRow?.name).toBe('InvalidCat');
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
      const vendorId = Number(db.prepare("INSERT INTO vendors (name, notes) VALUES (?, ?)" ).run('Fresh Fish', null).lastInsertRowid);
      const venueId = Number(db.prepare("INSERT INTO venues (name) VALUES (?)").run('Main Venue').lastInsertRowid);
      const areaId = Number(db.prepare("INSERT INTO storage_areas (name) VALUES (?)").run('Walk-in').lastInsertRowid);
      const ahiResult = db.prepare(`
        INSERT INTO items (
          name, category, unit, order_unit, order_unit_price, qty_per_unit,
          reorder_level, reorder_qty, vendor_id, venue_id, storage_area_id, current_qty
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('Ahi Tuna', 'Seafood', 'each', 'case', 48, 12, 10, 12, vendorId, venueId, areaId, 24);
      db.prepare("INSERT INTO item_storage (item_id, area_id, quantity) VALUES (?, ?, ?)").run(Number(ahiResult.lastInsertRowid), areaId, 24);
      db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Jasmine Rice', 'Dry Goods', 'bag');
      db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Maui Onion', 'Produce', 'each');
    });

    it('lists all items with overview fields', async () => {
      const res = await request(app).get('/api/items');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      const ahi = res.body.find((item: any) => item.name === 'Ahi Tuna');
      expect(ahi).toMatchObject({
        vendor_name: 'Fresh Fish',
        venue_name: 'Main Venue',
        storage_area_name: 'Walk-in',
        storage_location_count: 1,
        storage_total_qty: 24,
        storage_qty_delta: 0,
        pack_summary: '12 each per case',
        unit_cost: 4,
        inventory_value: 96,
        workflow_flags: {
          missing_vendor: false,
          missing_venue: false,
          missing_storage_area: false,
          ordering_incomplete: false,
          needs_reorder: false,
          needs_attention: false,
        },
      });
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

  describe('GET /api/items/categories', () => {
    it('lists inventory categories with usage counts', async () => {
      const seafoodId = (db.prepare('SELECT id FROM inventory_categories WHERE name = ?').get('Seafood') as { id: number }).id;
      db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb');
      db.prepare("INSERT INTO count_sessions (name, template_category, notes) VALUES (?, ?, ?)").run('Seafood Count', 'Seafood', null);

      const res = await request(app).get('/api/items/categories');
      expect(res.status).toBe(200);
      const seafood = res.body.find((entry: any) => entry.id === seafoodId);
      expect(seafood).toMatchObject({
        name: 'Seafood',
        item_count: 1,
        count_session_count: 1,
      });
    });

    it('creates and deletes an unused inventory category', async () => {
      const created = await request(app)
        .post('/api/items/categories')
        .send({ name: 'Paper Goods' });
      expect(created.status).toBe(201);
      expect(created.body.name).toBe('Paper Goods');

      const deleted = await request(app).delete(`/api/items/categories/${created.body.id}`);
      expect(deleted.status).toBe(204);
    });

    it('blocks deleting a category still assigned to items', async () => {
      const created = await request(app)
        .post('/api/items/categories')
        .send({ name: 'Specialty Produce' });
      expect(created.status).toBe(201);

      db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Meyer Lemon', 'Specialty Produce', 'each');

      const deleted = await request(app).delete(`/api/items/categories/${created.body.id}`);
      expect(deleted.status).toBe(409);
    });
  });

  describe('GET /api/items/:id', () => {
    it('returns item with recent transactions and overview fields', async () => {
      const vendorId = Number(db.prepare("INSERT INTO vendors (name, notes) VALUES (?, ?)" ).run('Fresh Fish', null).lastInsertRowid);
      const venueId = Number(db.prepare("INSERT INTO venues (name) VALUES (?)").run('Main Venue').lastInsertRowid);
      const areaId = Number(db.prepare("INSERT INTO storage_areas (name) VALUES (?)").run('Walk-in').lastInsertRowid);
      const result = db.prepare(`
        INSERT INTO items (
          name, category, unit, order_unit, order_unit_price, qty_per_unit,
          reorder_level, reorder_qty, vendor_id, venue_id, storage_area_id, current_qty
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('Ahi Tuna', 'Seafood', 'each', 'case', 48, 12, 10, 12, vendorId, venueId, areaId, 24);
      const itemId = Number(result.lastInsertRowid);
      db.prepare("INSERT INTO item_storage (item_id, area_id, quantity) VALUES (?, ?, ?)").run(itemId, areaId, 24);
      db.prepare("INSERT INTO transactions (item_id, type, quantity, reason) VALUES (?, ?, ?, ?)").run(itemId, 'in', 20, 'Received');

      const res = await request(app).get(`/api/items/${itemId}`);
      expect(res.status).toBe(200);
      expect(res.body.item).toMatchObject({
        name: 'Ahi Tuna',
        vendor_name: 'Fresh Fish',
        venue_name: 'Main Venue',
        storage_area_name: 'Walk-in',
        storage_location_count: 1,
        storage_total_qty: 24,
        storage_qty_delta: 0,
        pack_summary: '12 each per case',
        unit_cost: 4,
        inventory_value: 96,
      });
      expect(res.body.item.workflow_flags).toMatchObject({
        missing_vendor: false,
        missing_venue: false,
        missing_storage_area: false,
        ordering_incomplete: false,
        needs_reorder: false,
        needs_attention: false,
      });
      expect(res.body.transactions).toHaveLength(1);
    });

    it('returns 404 for nonexistent item', async () => {
      const res = await request(app).get('/api/items/9999');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/items/:id', () => {
    it('updates item fields and preserves overview fields', async () => {
      const result = db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb');
      const res = await request(app)
        .put(`/api/items/${result.lastInsertRowid}`)
        .send({ name: 'Yellowfin Tuna' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        name: 'Yellowfin Tuna',
        vendor_name: null,
        venue_name: null,
        storage_area_name: null,
        storage_location_count: 0,
        storage_total_qty: 0,
        storage_qty_delta: 0,
        pack_summary: null,
      });
      expect(res.body.workflow_flags).toMatchObject({
        missing_vendor: true,
        missing_venue: true,
        missing_storage_area: true,
        ordering_incomplete: true,
        needs_reorder: false,
        needs_attention: true,
      });
    });
  });

  describe('POST /api/items/:id/count', () => {
    it('returns an enriched item in the adjustment payload', async () => {
      const vendorId = Number(db.prepare("INSERT INTO vendors (name, notes) VALUES (?, ?)" ).run('Fresh Fish', null).lastInsertRowid);
      const venueId = Number(db.prepare("INSERT INTO venues (name) VALUES (?)").run('Main Venue').lastInsertRowid);
      const areaId = Number(db.prepare("INSERT INTO storage_areas (name) VALUES (?)").run('Walk-in').lastInsertRowid);
      const result = db.prepare(`
        INSERT INTO items (
          name, category, unit, order_unit, order_unit_price, qty_per_unit,
          reorder_level, reorder_qty, vendor_id, venue_id, storage_area_id, current_qty
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('Ahi Tuna', 'Seafood', 'each', 'case', 48, 12, 10, 12, vendorId, venueId, areaId, 24);
      const itemId = Number(result.lastInsertRowid);
      db.prepare("INSERT INTO item_storage (item_id, area_id, quantity) VALUES (?, ?, ?)").run(itemId, areaId, 24);

      const res = await request(app)
        .post(`/api/items/${itemId}/count`)
        .send({ counted_qty: 30, notes: 'Counted on receiving' });
      expect(res.status).toBe(201);
      expect(res.body.item).toMatchObject({
        name: 'Ahi Tuna',
        vendor_name: 'Fresh Fish',
        venue_name: 'Main Venue',
        storage_area_name: 'Walk-in',
        storage_location_count: 1,
        storage_total_qty: 24,
        storage_qty_delta: 6,
      });
    });
  });

  describe('PUT /api/items/:id/storage', () => {
    it('replaces storage rows and rolls them up into the item total', async () => {
      const areaA = Number(db.prepare("INSERT INTO storage_areas (name) VALUES (?)").run('2277 Bar Cage').lastInsertRowid);
      const areaB = Number(db.prepare("INSERT INTO storage_areas (name) VALUES (?)").run('SOH Bar Cage').lastInsertRowid);
      const result = db.prepare("INSERT INTO items (name, category, unit, current_qty) VALUES (?, ?, ?, ?)").run('Vodka', 'Liquor', 'bottle', 0);
      const itemId = Number(result.lastInsertRowid);

      const res = await request(app)
        .put(`/api/items/${itemId}/storage`)
        .send({
          rows: [
            { area_id: areaA, quantity: 6 },
            { area_id: areaB, quantity: 4 },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.rows).toEqual([
        expect.objectContaining({ area_id: areaA, area_name: '2277 Bar Cage', quantity: 6 }),
        expect.objectContaining({ area_id: areaB, area_name: 'SOH Bar Cage', quantity: 4 }),
      ]);
      expect(res.body.item).toMatchObject({
        id: itemId,
        current_qty: 10,
        storage_area_id: areaA,
        storage_area_name: '2277 Bar Cage',
        storage_location_count: 2,
        storage_total_qty: 10,
        storage_qty_delta: 0,
      });
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
