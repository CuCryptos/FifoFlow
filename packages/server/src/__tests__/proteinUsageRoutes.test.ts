import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createProteinUsageRoutes } from '../routes/proteinUsage.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);

  const app = express();
  app.use(express.json());
  app.use('/api/protein-usage', createProteinUsageRoutes(db));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });

  return { app, db };
}

describe('Protein usage routes', () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(() => {
    ({ app, db } = createTestApp());
    db.prepare("INSERT INTO venues (id, name, sort_order, show_in_menus) VALUES (7, 'Steakhouse', 1, 1)").run();
  });

  afterEach(() => {
    db.close();
  });

  it('returns seeded proteins and available forecast products for a venue', async () => {
    seedForecast(db, {
      id: 1,
      filename: 'historical-forecast.pdf',
      entries: [
        { product_name: 'Steak Dinner', forecast_date: '2026-03-20', guest_count: 120 },
        { product_name: 'Chicken Plate', forecast_date: '2026-03-20', guest_count: 80 },
      ],
    });

    const response = await request(app).get('/api/protein-usage/config?venue_id=7');

    expect(response.status).toBe(200);
    expect(response.body.protein_items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '5oz Tenderloin' }),
        expect.objectContaining({ name: 'Prime Tenderloin' }),
        expect.objectContaining({ name: 'Top Round' }),
        expect.objectContaining({ name: 'Chicken' }),
      ]),
    );
    expect(response.body.forecast_products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ product_name: 'Steak Dinner', total_guest_count: 120 }),
        expect.objectContaining({ product_name: 'Chicken Plate', total_guest_count: 80 }),
      ]),
    );
  });

  it('saves per-pax rules and summarizes historical and projected usage', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = offsetDate(today, -1);
    const tomorrow = offsetDate(today, 1);

    seedForecast(db, {
      id: 2,
      filename: 'meat-forecast.pdf',
      entries: [
        { product_name: 'Steak Dinner', forecast_date: yesterday, guest_count: 100 },
        { product_name: 'Steak Dinner', forecast_date: tomorrow, guest_count: 120 },
        { product_name: 'Chicken Plate', forecast_date: tomorrow, guest_count: 60 },
      ],
    });

    const proteins = db.prepare('SELECT id, name FROM protein_usage_items ORDER BY sort_order ASC').all() as Array<{ id: number; name: string }>;
    const tenderloin = proteins.find((item) => item.name === '5oz Tenderloin');
    const chicken = proteins.find((item) => item.name === 'Chicken');
    expect(tenderloin).toBeDefined();
    expect(chicken).toBeDefined();

    const saveResponse = await request(app)
      .post('/api/protein-usage/rules/bulk')
      .send({
        venue_id: 7,
        rules: [
          { forecast_product_name: 'Steak Dinner', protein_item_id: tenderloin!.id, usage_per_pax: 1 },
          { forecast_product_name: 'Chicken Plate', protein_item_id: chicken!.id, usage_per_pax: 0.5 },
        ],
      });

    expect(saveResponse.status).toBe(200);
    expect(saveResponse.body.rule_rows).toHaveLength(2);

    const summaryResponse = await request(app)
      .get(`/api/protein-usage/summary?venue_id=7&start=${yesterday}&end=${tomorrow}&group_by=day`);

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.totals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          protein_name: '5oz Tenderloin',
          historical_usage: 100,
          projected_usage: 120,
          total_usage: 220,
        }),
        expect.objectContaining({
          protein_name: 'Chicken',
          historical_usage: 0,
          projected_usage: 30,
          total_usage: 30,
        }),
      ]),
    );
    expect(summaryResponse.body.periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          period: yesterday,
          historical_guest_count: 100,
          projected_guest_count: 0,
        }),
        expect.objectContaining({
          period: tomorrow,
          historical_guest_count: 0,
          projected_guest_count: 180,
        }),
      ]),
    );
  });
});

function seedForecast(
  db: Database.Database,
  input: {
    id: number;
    filename: string;
    entries: Array<{ product_name: string; forecast_date: string; guest_count: number }>;
  },
) {
  const dates = Array.from(new Set(input.entries.map((entry) => entry.forecast_date))).sort();
  db.prepare(
    `
      INSERT INTO forecasts (id, filename, date_range_start, date_range_end, raw_dates)
      VALUES (?, ?, ?, ?, ?)
    `,
  ).run(input.id, input.filename, dates[0] ?? null, dates[dates.length - 1] ?? null, JSON.stringify(dates));

  const insertEntry = db.prepare(
    `
      INSERT INTO forecast_entries (forecast_id, product_name, forecast_date, guest_count)
      VALUES (?, ?, ?, ?)
    `,
  );

  input.entries.forEach((entry) => {
    insertEntry.run(input.id, entry.product_name, entry.forecast_date, entry.guest_count);
  });
}

function offsetDate(base: string, days: number): string {
  const date = new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
