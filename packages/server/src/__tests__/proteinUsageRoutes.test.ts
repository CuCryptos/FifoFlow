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
      expect.objectContaining({ name: 'Lobster' }),
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

  it('uses the most recent uploaded forecast entry when the same product and date overlap', async () => {
    const overlapDate = '2026-03-25';

    seedForecast(db, {
      id: 3,
      filename: 'forecast-week-1.pdf',
      entries: [
        { product_code: 'STK101', product_name: 'STK101 Steak Dinner', forecast_date: overlapDate, guest_count: 100 },
      ],
    });

    seedForecast(db, {
      id: 4,
      filename: 'forecast-week-2.pdf',
      entries: [
        { product_code: 'STK101', product_name: 'STK101 Steak Dinner', forecast_date: overlapDate, guest_count: 140 },
      ],
    });

    const configResponse = await request(app).get('/api/protein-usage/config?venue_id=7');
    expect(configResponse.status).toBe(200);
    expect(configResponse.body.forecast_products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_code: 'STK101',
          product_name: 'STK101 Steak Dinner',
          entry_count: 1,
          total_guest_count: 140,
        }),
      ]),
    );

    const proteins = db.prepare('SELECT id, name FROM protein_usage_items ORDER BY sort_order ASC').all() as Array<{ id: number; name: string }>;
    const tenderloin = proteins.find((item) => item.name === '5oz Tenderloin');
    expect(tenderloin).toBeDefined();

    const saveRulesResponse = await request(app)
      .post('/api/protein-usage/rules/bulk')
      .send({
        venue_id: 7,
        rules: [
          { forecast_product_name: 'STK101 Steak Dinner', protein_item_id: tenderloin!.id, usage_per_pax: 1 },
        ],
      });

    expect(saveRulesResponse.status).toBe(200);

    const summaryResponse = await request(app)
      .get(`/api/protein-usage/summary?venue_id=7&start=${overlapDate}&end=${overlapDate}&group_by=day`);

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.totals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          protein_name: '5oz Tenderloin',
          total_usage: 140,
        }),
      ]),
    );
    expect(summaryResponse.body.periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          period: overlapDate,
          total_guest_count: 140,
        }),
      ]),
    );
  });

  it('saves protein case settings and returns derived case usage in the summary', async () => {
    const usageDate = '2026-03-26';

    seedForecast(db, {
      id: 5,
      filename: 'lobster-forecast.pdf',
      entries: [
        { product_code: 'LOB200', product_name: 'LOB200 Lobster Dinner', forecast_date: usageDate, guest_count: 48 },
      ],
    });

    const proteins = db.prepare('SELECT id, name FROM protein_usage_items ORDER BY sort_order ASC').all() as Array<{ id: number; name: string }>;
    const lobster = proteins.find((item) => item.name === 'Lobster');
    expect(lobster).toBeDefined();

    const saveProteinSettings = await request(app)
      .post('/api/protein-usage/config/items')
      .send({
        items: [
          { protein_item_id: lobster!.id, case_unit_label: 'case', portions_per_case: 24 },
        ],
      });

    expect(saveProteinSettings.status).toBe(200);
    expect(saveProteinSettings.body.protein_items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: lobster!.id,
          name: 'Lobster',
          case_unit_label: 'case',
          portions_per_case: 24,
        }),
      ]),
    );

    const saveRulesResponse = await request(app)
      .post('/api/protein-usage/rules/bulk')
      .send({
        venue_id: 7,
        rules: [
          { forecast_product_name: 'LOB200 Lobster Dinner', protein_item_id: lobster!.id, usage_per_pax: 1 },
        ],
      });

    expect(saveRulesResponse.status).toBe(200);

    const summaryResponse = await request(app)
      .get(`/api/protein-usage/summary?venue_id=7&start=${usageDate}&end=${usageDate}&group_by=day`);

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.totals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          protein_name: 'Lobster',
          total_usage: 48,
          total_case_usage: 2,
        }),
      ]),
    );
  });

  it('hides removed forecast products from the venue workspace and can restore them', async () => {
    const usageDate = '2026-03-27';

    seedForecast(db, {
      id: 6,
      filename: 'cleanup-forecast.pdf',
      entries: [
        { product_code: 'KEEP01', product_name: 'KEEP01 Prime Dinner', forecast_date: usageDate, guest_count: 60 },
        { product_code: 'HIDE01', product_name: 'HIDE01 Staff Meal', forecast_date: usageDate, guest_count: 25 },
      ],
    });

    const hideResponse = await request(app)
      .post('/api/protein-usage/hidden-products/hide')
      .send({
        venue_id: 7,
        product_names: ['HIDE01 Staff Meal'],
      });

    expect(hideResponse.status).toBe(200);
    expect(hideResponse.body.hidden_products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          forecast_product_name: 'HIDE01 Staff Meal',
        }),
      ]),
    );

    const configResponse = await request(app).get('/api/protein-usage/config?venue_id=7');
    expect(configResponse.status).toBe(200);
    expect(configResponse.body.forecast_products).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ product_name: 'HIDE01 Staff Meal' }),
      ]),
    );
    expect(configResponse.body.hidden_products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ forecast_product_name: 'HIDE01 Staff Meal' }),
      ]),
    );

    const restoreResponse = await request(app)
      .post('/api/protein-usage/hidden-products/restore')
      .send({
        venue_id: 7,
        product_names: ['HIDE01 Staff Meal'],
      });

    expect(restoreResponse.status).toBe(200);
    expect(restoreResponse.body.hidden_products).toEqual([]);

    const restoredConfigResponse = await request(app).get('/api/protein-usage/config?venue_id=7');
    expect(restoredConfigResponse.status).toBe(200);
    expect(restoredConfigResponse.body.forecast_products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ product_name: 'HIDE01 Staff Meal' }),
      ]),
    );
  });

  it('saves future monthly forecast counts and uses them in the summary without double counting daily forecasts', async () => {
    seedForecast(db, {
      id: 7,
      filename: 'april-daily-forecast.pdf',
      entries: [
        { product_code: 'APR01', product_name: 'APR01 Tenderloin Dinner', forecast_date: '2026-04-10', guest_count: 120 },
      ],
    });

    const proteins = db.prepare('SELECT id, name FROM protein_usage_items ORDER BY sort_order ASC').all() as Array<{ id: number; name: string }>;
    const tenderloin = proteins.find((item) => item.name === '5oz Tenderloin');
    expect(tenderloin).toBeDefined();

    const saveRulesResponse = await request(app)
      .post('/api/protein-usage/rules/bulk')
      .send({
        venue_id: 7,
        rules: [
          { forecast_product_name: 'APR01 Tenderloin Dinner', protein_item_id: tenderloin!.id, usage_per_pax: 1 },
        ],
      });

    expect(saveRulesResponse.status).toBe(200);

    const saveMonthlyResponse = await request(app)
      .post('/api/protein-usage/monthly-forecasts/bulk')
      .send({
        venue_id: 7,
        rows: [
          { forecast_product_name: 'APR01 Tenderloin Dinner', forecast_month: '2026-04', guest_count: 3000 },
          { forecast_product_name: 'APR01 Tenderloin Dinner', forecast_month: '2026-05', guest_count: 6200 },
        ],
      });

    expect(saveMonthlyResponse.status).toBe(200);
    expect(saveMonthlyResponse.body.monthly_forecasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ forecast_product_name: 'APR01 Tenderloin Dinner', forecast_month: '2026-04', guest_count: 3000 }),
        expect.objectContaining({ forecast_product_name: 'APR01 Tenderloin Dinner', forecast_month: '2026-05', guest_count: 6200 }),
      ]),
    );

    const configResponse = await request(app).get('/api/protein-usage/config?venue_id=7');
    expect(configResponse.status).toBe(200);
    expect(configResponse.body.monthly_forecasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ forecast_product_name: 'APR01 Tenderloin Dinner', forecast_month: '2026-04', guest_count: 3000 }),
        expect.objectContaining({ forecast_product_name: 'APR01 Tenderloin Dinner', forecast_month: '2026-05', guest_count: 6200 }),
      ]),
    );

    const monthSummaryResponse = await request(app)
      .get('/api/protein-usage/summary?venue_id=7&start=2026-04-01&end=2026-05-31&group_by=month');

    expect(monthSummaryResponse.status).toBe(200);
    expect(monthSummaryResponse.body.periods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          period: '2026-04',
          total_guest_count: 120,
        }),
        expect.objectContaining({
          period: '2026-05',
          total_guest_count: 6200,
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
    entries: Array<{ product_code?: string | null; product_name: string; forecast_date: string; guest_count: number }>;
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
      INSERT INTO forecast_entries (forecast_id, product_code, product_name, forecast_date, guest_count)
      VALUES (?, ?, ?, ?, ?)
    `,
  );

  input.entries.forEach((entry) => {
    insertEntry.run(input.id, entry.product_code ?? null, entry.product_name, entry.forecast_date, entry.guest_count);
  });
}

function offsetDate(base: string, days: number): string {
  const date = new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
