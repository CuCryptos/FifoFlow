import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createRecipeDraftRoutes } from '../routes/recipeDrafts.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const app = express();
  app.use(express.json());
  app.use('/api/recipe-drafts', createRecipeDraftRoutes(db));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  return { app, db };
}

function insertCanonicalIngredient(db: Database.Database, input: {
  canonical_name: string;
  category: string;
  base_unit: string;
}): number {
  return Number(
    db.prepare(
      `
        INSERT INTO canonical_ingredients (
          canonical_name,
          normalized_canonical_name,
          category,
          base_unit,
          source_hash
        ) VALUES (?, ?, ?, ?, ?)
      `,
    ).run(
      input.canonical_name,
      input.canonical_name.toLowerCase(),
      input.category,
      input.base_unit,
      `test:${input.canonical_name.toLowerCase()}`,
    ).lastInsertRowid,
  );
}

function seedTemplateReference(db: Database.Database, templateId: number, versionId: number): void {
  db.prepare('INSERT INTO recipe_templates (id, name, category) VALUES (?, ?, ?)').run(templateId, 'Seed Template', 'Prep');
  db.prepare(
    `
      INSERT INTO recipe_template_versions (
        id,
        recipe_template_id,
        version_number,
        yield_quantity,
        yield_unit,
        source_hash,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(versionId, templateId, 1, 4, 'L', `template:${templateId}:${versionId}`, 1);
}

describe('Recipe draft routes', () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(() => {
    ({ app, db } = createTestApp());
  });

  afterEach(() => {
    db.close();
  });

  it('creates a persisted template draft with template identity intact', async () => {
    const itemId = Number(db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Tomato Juice', 'Mixer', 'L').lastInsertRowid);
    const canonicalId = insertCanonicalIngredient(db, { canonical_name: 'tomato juice', category: 'mixer', base_unit: 'ml' });
    seedTemplateReference(db, 10, 11);

    const response = await request(app)
      .post('/api/recipe-drafts')
      .send({
        draft_name: 'Bloody Mary Mix',
        draft_notes: 'Batch prep draft',
        source_recipe_type: 'prep',
        creation_mode: 'template',
        source_template_id: 10,
        source_template_version_id: 11,
        yield_quantity: 4,
        yield_unit: 'L',
        serving_quantity: null,
        serving_unit: null,
        serving_count: null,
        ingredients: [{
          item_id: itemId,
          quantity: 3,
          unit: 'L',
          template_ingredient_name: 'tomato juice',
          template_quantity: 3,
          template_unit: 'L',
          template_sort_order: 1,
          template_canonical_ingredient_id: canonicalId,
        }],
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      draft_name: 'Bloody Mary Mix',
      source_type: 'template',
      source_template_id: 10,
      source_template_version_id: 11,
      completeness_status: 'READY',
      costability_status: 'COSTABLE',
    });
    expect(response.body.ingredient_rows).toEqual([
      expect.objectContaining({
        template_ingredient_name: 'tomato juice',
        template_quantity: 3,
        template_unit: 'L',
        item_id: itemId,
        canonical_ingredient_id: canonicalId,
      }),
    ]);
  });

  it('updates a draft and preserves serving math on the builder record', async () => {
    const itemId = Number(db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('House Syrup', 'Prep', 'qt').lastInsertRowid);
    const canonicalId = insertCanonicalIngredient(db, { canonical_name: 'house syrup', category: 'prep', base_unit: 'ml' });

    const created = await request(app)
      .post('/api/recipe-drafts')
      .send({
        draft_name: 'Syrup Base',
        draft_notes: null,
        source_recipe_type: 'dish',
        creation_mode: 'blank',
        source_template_id: null,
        source_template_version_id: null,
        yield_quantity: 1,
        yield_unit: 'qt',
        serving_quantity: null,
        serving_unit: null,
        serving_count: null,
        ingredients: [{
          item_id: itemId,
          quantity: 1,
          unit: 'qt',
          template_ingredient_name: null,
          template_quantity: null,
          template_unit: null,
          template_sort_order: null,
          template_canonical_ingredient_id: canonicalId,
        }],
      });

    expect(created.status).toBe(201);
    const draftId = Number(created.body.id);

    const updated = await request(app)
      .put(`/api/recipe-drafts/${draftId}`)
      .send({
        draft_name: 'Syrup Base',
        draft_notes: 'Now portioned for service',
        source_recipe_type: 'dish',
        creation_mode: 'blank',
        source_template_id: null,
        source_template_version_id: null,
        yield_quantity: 1,
        yield_unit: 'qt',
        serving_quantity: 1,
        serving_unit: 'fl oz',
        serving_count: 32,
        ingredients: [{
          item_id: itemId,
          quantity: 1,
          unit: 'qt',
          template_ingredient_name: null,
          template_quantity: null,
          template_unit: null,
          template_sort_order: null,
          template_canonical_ingredient_id: canonicalId,
        }],
      });

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      draft_notes: 'Now portioned for service',
      serving_quantity: 1,
      serving_unit: 'fl oz',
      serving_count: 32,
      completeness_status: 'READY',
    });
  });

  it('promotes a saved draft and writes serving metadata onto the operational recipe', async () => {
    const itemId = Number(db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('House Margarita Mix', 'Cocktail', 'ml').lastInsertRowid);
    const canonicalId = insertCanonicalIngredient(db, { canonical_name: 'house margarita mix', category: 'cocktail', base_unit: 'ml' });

    const created = await request(app)
      .post('/api/recipe-drafts')
      .send({
        draft_name: 'House Margarita',
        draft_notes: 'Promote me',
        source_recipe_type: 'dish',
        creation_mode: 'blank',
        source_template_id: null,
        source_template_version_id: null,
        yield_quantity: 1500,
        yield_unit: 'ml',
        serving_quantity: 150,
        serving_unit: 'ml',
        serving_count: 10,
        ingredients: [{
          item_id: itemId,
          quantity: 1500,
          unit: 'ml',
          template_ingredient_name: null,
          template_quantity: null,
          template_unit: null,
          template_sort_order: null,
          template_canonical_ingredient_id: canonicalId,
        }],
      });

    const draftId = Number(created.body.id);
    const promoted = await request(app).post(`/api/recipe-drafts/${draftId}/promote`).send({});

    expect(promoted.status).toBe(200);
    expect(promoted.body.promotion).toMatchObject({
      created_new_recipe: true,
      created_new_version: true,
      costability_status: 'COSTABLE_NOW',
    });

    const recipe = db.prepare('SELECT name, serving_quantity, serving_unit, serving_count FROM recipes LIMIT 1').get() as {
      name: string;
      serving_quantity: number;
      serving_unit: string;
      serving_count: number;
    };
    expect(recipe).toMatchObject({
      name: 'House Margarita',
      serving_quantity: 150,
      serving_unit: 'ml',
      serving_count: 10,
    });
  });

  it('promotes an inventory-backed draft by creating a fallback canonical identity when none exists', async () => {
    const itemId = Number(
      db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)")
        .run('Beef - Beef Tenderloin Steaks Premium 5 oz', 'Protein', 'each')
        .lastInsertRowid,
    );

    const created = await request(app)
      .post('/api/recipe-drafts')
      .send({
        draft_name: '5oz Tenderloin',
        draft_notes: null,
        source_recipe_type: 'dish',
        creation_mode: 'blank',
        source_template_id: null,
        source_template_version_id: null,
        yield_quantity: 1,
        yield_unit: 'each',
        serving_quantity: 5,
        serving_unit: 'oz',
        serving_count: 1,
        ingredients: [{
          item_id: itemId,
          quantity: 1,
          unit: 'each',
          template_ingredient_name: null,
          template_quantity: null,
          template_unit: null,
          template_sort_order: null,
          template_canonical_ingredient_id: null,
        }],
      });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      completeness_status: 'READY',
      costability_status: 'NEEDS_REVIEW',
    });
    expect(created.body.ingredient_rows[0]).toMatchObject({
      item_id: itemId,
      canonical_match_reason: 'inventory_fallback',
      review_status: 'READY',
    });

    const draftId = Number(created.body.id);
    const promoted = await request(app).post(`/api/recipe-drafts/${draftId}/promote`).send({});

    expect(promoted.status).toBe(200);
    expect(promoted.body.promotion).toMatchObject({
      created_new_recipe: true,
      created_new_version: true,
    });
    expect(promoted.body.draft.ingredient_rows[0].review_status).toBe('READY');
    expect(promoted.body.draft.ingredient_rows[0].canonical_ingredient_id).not.toBeNull();
  });

  it('rejects promotion for dish drafts missing serving math', async () => {
    const itemId = Number(db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('White Wine', 'Wine', 'bottle').lastInsertRowid);
    const canonicalId = insertCanonicalIngredient(db, { canonical_name: 'white wine', category: 'wine', base_unit: 'ml' });

    const created = await request(app)
      .post('/api/recipe-drafts')
      .send({
        draft_name: 'Wine Pour',
        draft_notes: null,
        source_recipe_type: 'dish',
        creation_mode: 'blank',
        source_template_id: null,
        source_template_version_id: null,
        yield_quantity: 6,
        yield_unit: 'bottle',
        serving_quantity: null,
        serving_unit: null,
        serving_count: null,
        ingredients: [{
          item_id: itemId,
          quantity: 6,
          unit: 'bottle',
          template_ingredient_name: null,
          template_quantity: null,
          template_unit: null,
          template_sort_order: null,
          template_canonical_ingredient_id: canonicalId,
        }],
      });

    const draftId = Number(created.body.id);
    const promoted = await request(app).post(`/api/recipe-drafts/${draftId}/promote`).send({});

    expect(promoted.status).toBe(409);
    expect(promoted.body.evaluation.blocking_reasons.map((reason: { code: string }) => reason.code)).toEqual(
      expect.arrayContaining(['MISSING_SERVING_QUANTITY', 'MISSING_SERVING_UNIT', 'MISSING_SERVING_COUNT']),
    );
  });
});
