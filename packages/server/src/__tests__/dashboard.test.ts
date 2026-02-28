import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createDashboardRoutes } from '../routes/dashboard.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard', createDashboardRoutes(db));
  return { app, db };
}

describe('Dashboard API', () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(() => {
    ({ app, db } = createTestApp());
    db.prepare("INSERT INTO items (name, category, unit, current_qty) VALUES (?, ?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb', 20);
    db.prepare("INSERT INTO items (name, category, unit, current_qty) VALUES (?, ?, ?, ?)").run('Rice', 'Dry Goods', 'bag', 3);
    db.prepare("INSERT INTO items (name, category, unit, current_qty) VALUES (?, ?, ?, ?)").run('Gloves', 'Supplies', 'box', 0);
  });

  afterEach(() => {
    db.close();
  });

  it('returns correct stats', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total_items: 3,
      low_stock_count: 1,
      out_of_stock_count: 1,
    });
    expect(res.body.today_transaction_count).toBeDefined();
  });
});
