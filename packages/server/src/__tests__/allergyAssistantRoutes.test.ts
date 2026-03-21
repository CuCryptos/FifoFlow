import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createAllergyAssistantRoutes } from '../routes/allergyAssistant.js';
import { SQLiteOperationalRecipeCostReadRepository } from '../intelligence/recipeCost/recipeCostRepositories.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  new SQLiteOperationalRecipeCostReadRepository(db);

  const fakeAi = {
    async transcribeImagePage() {
      return 'Allergy chart\nGuava Glazed Salmon | contains guava\nHouse Salad | safe for guava allergy';
    },
    async answerQuestion() {
      return {
        allergen_focus: 'guava',
        answer_markdown: 'Avoid the guava salmon. The house salad is charted as safe.',
        safe_items: [
          {
            recipe_version_id: 2,
            recipe_name: 'House Salad',
            rationale: 'The uploaded allergy chart marks this item safe for guava allergy.',
            evidence_chunk_ids: [2],
          },
        ],
        avoid_items: [
          {
            recipe_version_id: 1,
            recipe_name: 'Guava Glazed Salmon',
            rationale: 'The uploaded allergy chart says this item contains guava.',
            evidence_chunk_ids: [1],
          },
        ],
        caution_items: [],
        unknown_items: [],
      };
    },
  };

  const app = express();
  app.use(express.json());
  app.use('/api/allergy-assistant', createAllergyAssistantRoutes(db, { ai: fakeAi }));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  return { app, db };
}

describe('Allergy assistant routes', () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(() => {
    ({ app, db } = createTestApp());
    db.prepare("INSERT INTO venues (id, name, sort_order, show_in_menus) VALUES (2, 'Dining Room', 1, 1)").run();
    seedPromotedDishRecipe(db, {
      recipeId: 1,
      recipeVersionId: 1,
      name: 'Guava Glazed Salmon',
      ingredients: ['salmon', 'guava puree'],
    });
    seedPromotedDishRecipe(db, {
      recipeId: 2,
      recipeVersionId: 2,
      name: 'House Salad',
      ingredients: ['romaine', 'cucumber'],
    });
  });

  afterEach(() => {
    db.close();
  });

  it('uploads an allergy chart and stores chunked page evidence', async () => {
    const response = await request(app)
      .post('/api/allergy-assistant/documents/upload')
      .field('venue_id', '2')
      .attach('files', Buffer.from('fake-image-bytes'), {
        filename: 'allergy-chart.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(201);
    expect(response.body.documents).toHaveLength(1);
    expect(response.body.documents[0]).toMatchObject({
      filename: 'allergy-chart.png',
      venue_id: 2,
      page_count: 1,
      status: 'ready',
    });

    const page = db.prepare('SELECT extracted_text FROM allergy_document_pages LIMIT 1').get() as { extracted_text: string };
    expect(page.extracted_text).toContain('Guava Glazed Salmon');

    const chunkCount = db.prepare('SELECT COUNT(*) AS count FROM allergy_document_chunks').get() as { count: number };
    expect(chunkCount.count).toBeGreaterThan(0);
  });

  it('answers chef allergy questions against stored evidence and promoted dish recipes', async () => {
    seedAllergyDocument(db, {
      id: 10,
      venueId: 2,
      filename: 'hawaii-menu-allergens.pdf',
      chunks: [
        'Guava Glazed Salmon | contains guava',
        'House Salad | safe for guava allergy',
      ],
    });

    const response = await request(app)
      .post('/api/allergy-assistant/chat')
      .send({
        venue_id: 2,
        question: 'A guest has a guava allergy. What can they eat on the menu?',
      });

    expect(response.status).toBe(200);
    expect(response.body.allergen_focus).toBe('guava');
    expect(response.body.avoid_items).toEqual([
      expect.objectContaining({
        recipe_version_id: 1,
        recipe_name: 'Guava Glazed Salmon',
      }),
    ]);
    expect(response.body.safe_items).toEqual([
      expect.objectContaining({
        recipe_version_id: 2,
        recipe_name: 'House Salad',
      }),
    ]);
    expect(response.body.cited_chunks).toHaveLength(2);
  });
});

function seedPromotedDishRecipe(
  db: Database.Database,
  input: { recipeId: number; recipeVersionId: number; name: string; ingredients: string[] },
) {
  db.prepare(
    `
      INSERT INTO recipes (id, name, type, notes, serving_quantity, serving_unit, serving_count)
      VALUES (?, ?, 'dish', null, 1, 'plate', 1)
    `,
  ).run(input.recipeId, input.name);

  db.prepare(
    `
      INSERT INTO recipe_versions (
        id,
        recipe_id,
        version_number,
        status,
        yield_quantity,
        yield_unit,
        source_builder_job_id,
        source_builder_draft_recipe_id,
        source_template_id,
        source_template_version_id,
        source_text_snapshot
      ) VALUES (?, ?, 1, 'active', 1, 'batch', null, null, null, null, null)
    `,
  ).run(input.recipeVersionId, input.recipeId);

  const insertIngredient = db.prepare(
    `
      INSERT INTO recipe_ingredients (
        recipe_version_id,
        line_index,
        source_parsed_row_id,
        source_resolution_row_id,
        raw_ingredient_text,
        canonical_ingredient_id,
        inventory_item_id,
        quantity_normalized,
        unit_normalized,
        preparation_note
      ) VALUES (?, ?, null, null, ?, ?, null, 1, 'each', null)
    `,
  );

  input.ingredients.forEach((ingredient, index) => {
    const canonicalIngredientId = Number(
      db.prepare(
        `
          INSERT INTO canonical_ingredients (
            canonical_name,
            normalized_canonical_name,
            category,
            base_unit,
            source_hash
          ) VALUES (?, ?, 'allergy-test', 'each', ?)
        `,
      ).run(
        ingredient,
        ingredient.toLowerCase(),
        `allergy:${input.recipeVersionId}:${index}:${ingredient.toLowerCase()}`,
      ).lastInsertRowid,
    );

    insertIngredient.run(input.recipeVersionId, index, ingredient, canonicalIngredientId);
  });
}

function seedAllergyDocument(
  db: Database.Database,
  input: { id: number; venueId: number | null; filename: string; chunks: string[] },
) {
  db.prepare(
    `
      INSERT INTO allergy_documents (id, venue_id, filename, mime_type, page_count, chunk_count, status)
      VALUES (?, ?, ?, 'application/pdf', 1, ?, 'ready')
    `,
  ).run(input.id, input.venueId, input.filename, input.chunks.length);

  const pageId = Number(
    db.prepare(
      `
        INSERT INTO allergy_document_pages (document_id, page_number, extracted_text)
        VALUES (?, 1, ?)
      `,
    ).run(input.id, input.chunks.join('\n')).lastInsertRowid,
  );

  const insertChunk = db.prepare(
    `
      INSERT INTO allergy_document_chunks (document_id, page_id, page_number, chunk_index, chunk_text)
      VALUES (?, ?, 1, ?, ?)
    `,
  );

  input.chunks.forEach((chunk, index) => {
    insertChunk.run(input.id, pageId, index, chunk);
  });
}
