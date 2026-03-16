import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createRecipeRoutes } from '../routes/recipes.js';
import { createProductRecipeRoutes } from '../routes/productRecipes.js';
import { createSqliteInventoryStore } from '../store/sqliteStore.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const store = createSqliteInventoryStore(db);
  const app = express();
  app.use(express.json());
  app.use('/api/recipes', createRecipeRoutes(store));
  app.use('/api/product-recipes', createProductRecipeRoutes(store));
  return { app, db };
}

describe('Recipes API', () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(() => {
    ({ app, db } = createTestApp());
  });

  afterEach(() => {
    db.close();
  });

  it('creates recipes with yield and serving metadata', async () => {
    const itemId = Number(
      db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)")
        .run('House Pinot Noir', 'Beverage', 'bottle')
        .lastInsertRowid,
    );

    const response = await request(app)
      .post('/api/recipes')
      .send({
        name: 'Pinot Pour',
        type: 'dish',
        notes: '6 bottle case, 5 ounce pour',
        yield_quantity: 6,
        yield_unit: 'bottle',
        serving_quantity: 5,
        serving_unit: 'fl oz',
        serving_count: 30,
        items: [{ item_id: itemId, quantity: 6, unit: 'bottle' }],
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: 'Pinot Pour',
      yield_quantity: 6,
      yield_unit: 'bottle',
      serving_quantity: 5,
      serving_unit: 'fl oz',
      serving_count: 30,
      total_cost: null,
      cost_per_serving: null,
    });
    expect(response.body.items).toHaveLength(1);
  });

  it('uses servings per batch when calculating ingredient demand', async () => {
    const venueId = Number(
      db.prepare("INSERT INTO venues (name, sort_order, show_in_menus) VALUES (?, ?, ?)")
        .run('Dining Room', 0, 1)
        .lastInsertRowid,
    );
    const itemId = Number(
      db.prepare("INSERT INTO items (name, category, unit, current_qty) VALUES (?, ?, ?, ?)")
        .run('House Dressing', 'Food', 'oz', 0)
        .lastInsertRowid,
    );
    const recipeId = Number(
      db.prepare(
        `
          INSERT INTO recipes (
            name,
            type,
            yield_quantity,
            yield_unit,
            serving_quantity,
            serving_unit,
            serving_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      ).run('Salad Dressing Batch', 'prep', 96, 'oz', 4, 'oz', 24).lastInsertRowid,
    );
    db.prepare('INSERT INTO recipe_items (recipe_id, item_id, quantity, unit) VALUES (?, ?, ?, ?)')
      .run(recipeId, itemId, 96, 'oz');
    db.prepare('INSERT INTO product_recipes (venue_id, recipe_id, portions_per_guest) VALUES (?, ?, ?)')
      .run(venueId, recipeId, 1);

    const response = await request(app)
      .post('/api/product-recipes/calculate')
      .send({
        guest_counts: [{ venue_id: venueId, guest_count: 10 }],
      });

    expect(response.status).toBe(200);
    expect(response.body.ingredients).toHaveLength(1);
    expect(response.body.ingredients[0]).toMatchObject({
      item_id: itemId,
      total_needed: 40,
      recipe_unit: 'oz',
    });
    expect(response.body.ingredients[0].sources[0]).toMatchObject({
      quantity_per_guest: 4,
      guest_count: 10,
      subtotal: 40,
    });
  });
});
