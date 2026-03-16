import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createRecipeTemplateRoutes } from '../routes/recipeTemplates.js';

describe('Recipe template routes', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDb(db);
    seedTemplateLibrary(db);

    app = express();
    app.use('/api/recipe-templates', createRecipeTemplateRoutes(db));
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: err.message });
    });
  });

  afterEach(() => {
    db.close();
  });

  it('lists active recipe templates with active-version yield summaries', async () => {
    const response = await request(app).get('/api/recipe-templates');

    expect(response.status).toBe(200);
    expect(response.body.templates).toHaveLength(2);
    expect(response.body.templates[0]).toMatchObject({
      template_id: 1,
      name: 'Citrus Vinaigrette',
      category: 'Sauce',
      active_version_number: 2,
      yield_quantity: 2,
      yield_unit: 'L',
      ingredient_count: 2,
    });
    expect(response.body.templates[1]).toMatchObject({
      template_id: 2,
      name: 'House Margarita',
      category: 'Cocktail',
      active_version_number: 1,
      yield_quantity: 1500,
      yield_unit: 'ml',
      ingredient_count: 3,
    });
  });

  it('returns active template detail with ordered ingredient rows', async () => {
    const response = await request(app).get('/api/recipe-templates/1');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      template_id: 1,
      name: 'Citrus Vinaigrette',
      active_version_number: 2,
      ingredient_count: 2,
      yield_quantity: 2,
      yield_unit: 'L',
    });
    expect(response.body.ingredients).toEqual([
      expect.objectContaining({ ingredient_name: 'olive oil', qty: 1.2, unit: 'L', sort_order: 1 }),
      expect.objectContaining({ ingredient_name: 'rice vinegar', qty: 0.8, unit: 'L', sort_order: 2 }),
    ]);
  });
});

function seedTemplateLibrary(db: Database.Database) {
  db.prepare("INSERT INTO recipe_templates (id, name, category) VALUES (1, 'Citrus Vinaigrette', 'Sauce')").run();
  db.prepare("INSERT INTO recipe_templates (id, name, category) VALUES (2, 'House Margarita', 'Cocktail')").run();

  db.prepare(`
    INSERT INTO recipe_template_versions (id, recipe_template_id, version_number, yield_quantity, yield_unit, source_hash, is_active)
    VALUES (10, 1, 1, 1, 'L', 'vinaigrette-v1', 0)
  `).run();
  db.prepare(`
    INSERT INTO recipe_template_versions (id, recipe_template_id, version_number, yield_quantity, yield_unit, source_hash, is_active)
    VALUES (11, 1, 2, 2, 'L', 'vinaigrette-v2', 1)
  `).run();
  db.prepare(`
    INSERT INTO recipe_template_versions (id, recipe_template_id, version_number, yield_quantity, yield_unit, source_hash, is_active)
    VALUES (20, 2, 1, 1500, 'ml', 'margarita-v1', 1)
  `).run();

  db.prepare(`
    INSERT INTO recipe_template_ingredients (recipe_template_version_id, ingredient_name, qty, unit, sort_order)
    VALUES (11, 'olive oil', 1.2, 'L', 1),
           (11, 'rice vinegar', 0.8, 'L', 2),
           (20, 'tequila', 750, 'ml', 1),
           (20, 'lime juice', 500, 'ml', 2),
           (20, 'agave', 250, 'ml', 3)
  `).run();
}
