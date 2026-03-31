import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createLunchMenuRoutes } from '../routes/lunchMenus.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/lunch-menus', createLunchMenuRoutes(db));
  return { app, db };
}

describe('Lunch Menus API', () => {
  let app: express.Express;
  let db: Database.Database;
  let venueId: number;

  beforeEach(() => {
    ({ app, db } = createTestApp());
    venueId = Number(db.prepare('INSERT INTO venues (name) VALUES (?)').run('Paradise Kitchen').lastInsertRowid);
  });

  afterEach(() => {
    db.close();
  });

  it('imports parsed lunch menu days into a monthly menu', async () => {
    const res = await request(app)
      .post('/api/lunch-menus/import')
      .send({
        venue_id: venueId,
        year: 2026,
        month: 4,
        name: 'April 2026 Lunch Menu',
        replace_existing: true,
        parsed_days: [
          {
            date: '2026-04-06',
            main_dishes: ['Chicken Katsu'],
            sides: ['Rice', 'Mac Salad'],
            nutrition: {
              calories: 540,
              protein_g: 28,
              fat_g: 17,
              sugar_g: 6,
            },
            raw_text: 'Chicken Katsu, Rice, Mac Salad',
            needs_review: false,
            review_notes: [],
          },
          {
            date: '2026-04-07',
            main_dishes: ['Beef Stew'],
            sides: ['Green Salad'],
            nutrition: null,
            raw_text: 'Beef Stew, Green Salad',
            needs_review: false,
            review_notes: [],
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.menu).toMatchObject({
      venue_id: venueId,
      year: 2026,
      month: 4,
      name: 'April 2026 Lunch Menu',
    });
    expect(res.body.menu.items).toHaveLength(5);
    const importedDay = res.body.calendar.weeks.flatMap((week: any) => week.days).find((day: any) => day.date === '2026-04-06');
    expect(importedDay).toMatchObject({
      date: '2026-04-06',
      main_dishes: ['Chicken Katsu'],
      sides: ['Rice', 'Mac Salad'],
      nutrition: {
        calories: 540,
        protein_g: 28,
        fat_g: 17,
        sugar_g: 6,
      },
    });
  });

  it('pads the first workweek so dates stay under the correct weekday', async () => {
    const menuId = Number(db.prepare(`
      INSERT INTO lunch_menus (venue_id, year, month, name, status, notes)
      VALUES (?, ?, ?, ?, 'draft', ?)
    `).run(venueId, 2026, 4, 'April 2026 Lunch Menu', null).lastInsertRowid);

    const res = await request(app).get(`/api/lunch-menus/${menuId}/calendar`);

    expect(res.status).toBe(200);
    expect(res.body.weeks[0].days).toHaveLength(5);
    expect(res.body.weeks[0].days[0]).toMatchObject({
      day_name: 'Monday',
      date: null,
      is_placeholder: true,
      weekday_index: 1,
    });
    expect(res.body.weeks[0].days[1]).toMatchObject({
      day_name: 'Tuesday',
      date: null,
      is_placeholder: true,
      weekday_index: 2,
    });
    expect(res.body.weeks[0].days[2]).toMatchObject({
      day_name: 'Wednesday',
      date: '2026-04-01',
      is_placeholder: false,
      weekday_index: 3,
    });
  });

  it('updates a single day through the bulk day editor route', async () => {
    const menuId = Number(db.prepare(`
      INSERT INTO lunch_menus (venue_id, year, month, name, status, notes)
      VALUES (?, ?, ?, ?, 'draft', ?)
    `).run(venueId, 2026, 4, 'April 2026 Lunch Menu', null).lastInsertRowid);

    const res = await request(app)
      .put(`/api/lunch-menus/${menuId}/items/bulk`)
      .send({
        days: [{
          date: '2026-04-08',
          mains: [{ dish_name: 'Baked Mahi' }],
          sides: [{ dish_name: 'Rice Pilaf' }, { dish_name: 'Garden Salad' }],
          nutrition: {
            calories: 640,
            protein_g: 32,
            fat_g: 18,
            sugar_g: 9,
          },
        }],
      });

    expect(res.status).toBe(200);
    expect(res.body.menu.items).toHaveLength(3);
    const calendarDay = res.body.calendar.weeks.flatMap((week: any) => week.days).find((day: any) => day.date === '2026-04-08');
    expect(calendarDay).toMatchObject({
      main_dishes: ['Baked Mahi'],
      sides: ['Rice Pilaf', 'Garden Salad'],
      nutrition: {
        calories: 640,
        protein_g: 32,
        fat_g: 18,
        sugar_g: 9,
      },
    });
  });

  it('exports a lunch menu as pdf', async () => {
    const menuId = Number(db.prepare(`
      INSERT INTO lunch_menus (venue_id, year, month, name, status, notes)
      VALUES (?, ?, ?, ?, 'draft', ?)
    `).run(venueId, 2026, 4, 'April 2026 Lunch Menu', 'Lunch served 11:30 to 1:00').lastInsertRowid);

    db.prepare(`
      INSERT INTO lunch_menu_items (
        menu_id, date, dish_type, dish_name, recipe_id, sort_order, calories, protein_g, fat_g, sugar_g
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(menuId, '2026-04-06', 'main', 'Chicken Katsu', null, 0, 540, 28, 17, 6);

    const res = await request(app)
      .get(`/api/lunch-menus/${menuId}/export/pdf`)
      .buffer()
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('generates a new lunch menu from historical menus', async () => {
    const sourceMenuId = Number(db.prepare(`
      INSERT INTO lunch_menus (venue_id, year, month, name, status, notes)
      VALUES (?, ?, ?, ?, 'published', ?)
    `).run(venueId, 2026, 2, 'February 2026 Lunch Menu', null).lastInsertRowid);

    db.prepare(`
      INSERT INTO lunch_menu_items (
        menu_id, date, dish_type, dish_name, recipe_id, sort_order, calories, protein_g, fat_g, sugar_g
      ) VALUES
        (?, '2026-02-02', 'main', 'Chicken Katsu', null, 0, null, null, null, null),
        (?, '2026-02-02', 'side', 'Steamed Rice', null, 1, null, null, null, null),
        (?, '2026-02-02', 'side', 'Garden Salad', null, 2, null, null, null, null),
        (?, '2026-02-03', 'main', 'BBQ Chicken', null, 0, null, null, null, null),
        (?, '2026-02-03', 'side', 'Mac Salad', null, 1, null, null, null, null)
    `).run(sourceMenuId, sourceMenuId, sourceMenuId, sourceMenuId, sourceMenuId);

    const res = await request(app)
      .post('/api/lunch-menus/generate')
      .send({
        venue_id: venueId,
        year: 2026,
        month: 5,
        source_menu_ids: [sourceMenuId],
        name: 'May 2026 Lunch Menu',
      });

    expect(res.status).toBe(201);
    expect(res.body.menu).toMatchObject({
      venue_id: venueId,
      year: 2026,
      month: 5,
      name: 'May 2026 Lunch Menu',
    });
    expect(res.body.patterns_info).toMatchObject({
      source_menu_count: 1,
      generated_days: 21,
    });
    expect(res.body.menu.items.length).toBeGreaterThan(0);
    const generatedDay = res.body.calendar.weeks.flatMap((week: any) => week.days).find((day: any) => day.date === '2026-05-05');
    expect(generatedDay.main_dishes[0]).toBeTruthy();
    expect(generatedDay.sides.length).toBeGreaterThan(0);
  });
});
