import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createRecipeRoutes } from '../routes/recipes.js';
import { createSqliteInventoryStore } from '../store/sqliteStore.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const store = createSqliteInventoryStore(db);
  const app = express();
  app.use(express.json());
  app.use('/api/recipes', createRecipeRoutes(store));
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

  it('does not expose legacy recipe create or update endpoints', async () => {
    const created = await request(app)
      .post('/api/recipes')
      .send({
        name: 'Legacy Create Attempt',
        type: 'dish',
        items: [],
      });

    expect(created.status).toBe(404);

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
      ).run('Read Only Legacy', 'prep', 1, 'qt', null, null, null).lastInsertRowid,
    );

    const updated = await request(app)
      .put(`/api/recipes/${recipeId}`)
      .send({
        notes: 'attempted legacy update',
      });

    expect(updated.status).toBe(404);
  });

  it('deletes a legacy recipe and clears promotion lineage references', async () => {
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
      ).run('Delete Me Legacy', 'prep', 4, 'L', 250, 'ml', 16).lastInsertRowid,
    );

    const jobId = Number(
      db.prepare(
        `
          INSERT INTO recipe_builder_jobs (
            source_type,
            source_text,
            draft_name,
            status,
            source_hash
          ) VALUES (?, ?, ?, ?, ?)
        `,
      ).run('freeform', 'legacy delete test', 'Delete Me Legacy', 'CREATED', 'legacy-delete-test').lastInsertRowid,
    );

    const draftId = Number(
      db.prepare(
        `
          INSERT INTO recipe_builder_draft_recipes (
            recipe_builder_job_id,
            draft_name,
            yield_quantity,
            yield_unit,
            completeness_status,
            costability_status,
            ingredient_row_count,
            ready_row_count,
            review_row_count,
            blocked_row_count,
            unresolved_canonical_count,
            unresolved_inventory_count,
            source_recipe_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(jobId, 'Delete Me Legacy', 4, 'L', 'CREATED', 'COSTABLE', 0, 0, 0, 0, 0, 0, 'prep').lastInsertRowid,
    );

    const versionId = Number(
      db.prepare(
        `
          INSERT INTO recipe_versions (
            recipe_id,
            version_number,
            status,
            yield_quantity,
            yield_unit,
            source_builder_job_id,
            source_builder_draft_recipe_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(recipeId, 1, 'active', 4, 'L', jobId, draftId).lastInsertRowid,
    );

    db.prepare(
      `
        INSERT INTO recipe_builder_promotion_links (
          recipe_builder_draft_recipe_id,
          recipe_id,
          recipe_version_id,
          active
        ) VALUES (?, ?, ?, ?)
      `,
    ).run(draftId, recipeId, versionId, 1);

    db.prepare(
      `
        INSERT INTO recipe_promotion_events (
          recipe_builder_job_id,
          recipe_builder_draft_recipe_id,
          action_type,
          status,
          promoted_recipe_id,
          promoted_recipe_version_id,
          notes,
          created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(jobId, draftId, 'PROMOTED_NEW_RECIPE', 'PROMOTED', recipeId, versionId, 'created for delete test', 'tester');

    const response = await request(app).delete(`/api/recipes/${recipeId}`);

    expect(response.status).toBe(204);
    expect(db.prepare('SELECT id FROM recipes WHERE id = ?').get(recipeId)).toBeUndefined();
    expect(db.prepare('SELECT id FROM recipe_versions WHERE id = ?').get(versionId)).toBeUndefined();
    expect(
      db.prepare('SELECT id FROM recipe_builder_promotion_links WHERE recipe_id = ?').all(recipeId),
    ).toHaveLength(0);
    expect(
      db
        .prepare('SELECT promoted_recipe_id, promoted_recipe_version_id FROM recipe_promotion_events WHERE recipe_builder_job_id = ?')
        .get(jobId),
    ).toMatchObject({
      promoted_recipe_id: null,
      promoted_recipe_version_id: null,
    });
  });
});
