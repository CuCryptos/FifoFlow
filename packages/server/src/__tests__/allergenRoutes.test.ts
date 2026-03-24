import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createAllergenRoutes } from '../routes/allergens.js';

describe('Allergen routes', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDb(db);

    app = express();
    app.use(express.json());
    app.use('/api/allergens', createAllergenRoutes(db));
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: err.message });
    });

    seedAllergenSlice(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns allergen reference data and item profile detail', async () => {
    const referenceResponse = await request(app).get('/api/allergens/reference');
    expect(referenceResponse.status).toBe(200);
    expect(referenceResponse.body.allergens.some((allergen: any) => allergen.code === 'milk')).toBe(true);

    const itemsResponse = await request(app).get('/api/allergens/items?needs_review=true');
    expect(itemsResponse.status).toBe(200);
    expect(itemsResponse.body.items).toEqual([
      expect.objectContaining({
        id: 3,
        name: 'Undeclared Sauce',
        needs_review: true,
      }),
    ]);

    const itemDetailResponse = await request(app).get('/api/allergens/items/1');
    expect(itemDetailResponse.status).toBe(200);
    expect(itemDetailResponse.body.item).toMatchObject({
      id: 1,
      name: 'Salmon Portion',
    });
    expect(itemDetailResponse.body.allergen_profile).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          allergen_code: 'milk',
          status: 'free_of',
        }),
        expect.objectContaining({
          allergen_code: 'sesame',
          status: 'contains',
        }),
      ]),
    );
    expect(itemDetailResponse.body.linked_document_products).toEqual([
      expect.objectContaining({
        product_name: 'Seared Salmon',
        match_status: 'confirmed',
      }),
    ]);
  });

  it('returns document detail and review queue data', async () => {
    const documentResponse = await request(app).get('/api/allergens/documents/10');
    expect(documentResponse.status).toBe(200);
    expect(documentResponse.body.document).toMatchObject({
      id: 10,
      filename: 'allergy-chart.pdf',
    });
    expect(documentResponse.body.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_name: 'Seared Salmon',
          matches: [
            expect.objectContaining({
              item_name: 'Salmon Portion',
              match_status: 'confirmed',
            }),
          ],
        }),
      ]),
    );

    const reviewQueueResponse = await request(app).get('/api/allergens/review-queue');
    expect(reviewQueueResponse.status).toBe(200);
    expect(reviewQueueResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item_id: 3,
          item_name: 'Undeclared Sauce',
        }),
      ]),
    );
    expect(reviewQueueResponse.body.document_products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_name: 'Coconut Sorbet',
        }),
      ]),
    );
  });

  it('queries chart products from structured item profiles and document evidence', async () => {
    const response = await request(app)
      .post('/api/allergens/query')
      .send({
        question: 'What is safe for a dairy allergy?',
        venue_id: 1,
      });

    expect(response.status).toBe(200);
    expect(response.body.allergen_codes).toEqual(['milk']);
    expect(response.body.safe).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_name: 'Seared Salmon',
          source: 'item_profile',
        }),
        expect.objectContaining({
          product_name: 'Garden Salad',
          source: 'item_profile',
        }),
        expect.objectContaining({
          product_name: 'Coconut Sorbet',
          source: 'document_evidence',
        }),
      ]),
    );
    expect(response.body.unknown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_name: 'Mystery Sauce',
        }),
      ]),
    );
  });
});

function seedAllergenSlice(db: Database.Database): void {
  db.prepare(`INSERT INTO venues (id, name, sort_order, show_in_menus) VALUES (1, 'Dining Room', 1, 1)`).run();
  db.prepare(`INSERT INTO vendors (id, name) VALUES (1, 'Sysco')`).run();

  db.prepare(`
    INSERT INTO items (id, name, category, unit, current_qty, vendor_id, venue_id)
    VALUES (1, 'Salmon Portion', 'Protein', 'each', 0, 1, 1)
  `).run();
  db.prepare(`
    INSERT INTO items (id, name, category, unit, current_qty, vendor_id, venue_id)
    VALUES (2, 'Garden Greens', 'Produce', 'each', 0, 1, 1)
  `).run();
  db.prepare(`
    INSERT INTO items (id, name, category, unit, current_qty, vendor_id, venue_id)
    VALUES (3, 'Undeclared Sauce', 'Prepared', 'each', 0, 1, 1)
  `).run();

  const milkId = getAllergenId(db, 'milk');
  const sesameId = getAllergenId(db, 'sesame');

  db.prepare(`
    INSERT INTO item_allergens (item_id, allergen_id, status, confidence, notes)
    VALUES (1, ?, 'free_of', 'high', 'Chef verified dairy free')
  `).run(milkId);
  db.prepare(`
    INSERT INTO item_allergens (item_id, allergen_id, status, confidence, notes)
    VALUES (1, ?, 'contains', 'verified', 'Sesame glaze')
  `).run(sesameId);
  db.prepare(`
    INSERT INTO item_allergens (item_id, allergen_id, status, confidence, notes)
    VALUES (2, ?, 'free_of', 'high', 'Greens contain no dairy')
  `).run(milkId);

  const itemAllergenId = db.prepare(
    'SELECT id FROM item_allergens WHERE item_id = 1 AND allergen_id = ?',
  ).get(milkId) as { id: number };
  db.prepare(`
    INSERT INTO allergen_evidence (
      item_allergen_id,
      source_type,
      source_label,
      source_excerpt,
      status_claimed,
      confidence_claimed,
      captured_by
    ) VALUES (?, 'staff_verified', 'Chef review', 'Marked dairy free on line check', 'free_of', 'high', 'qa')
  `).run(itemAllergenId.id);

  db.prepare(`
    INSERT INTO allergy_documents (
      id, venue_id, filename, mime_type, page_count, chunk_count, product_count, status
    ) VALUES (10, 1, 'allergy-chart.pdf', 'application/pdf', 1, 4, 4, 'ready')
  `).run();
  db.prepare(`
    INSERT INTO allergy_document_pages (id, document_id, page_number, extracted_text)
    VALUES (100, 10, 1, 'allergy chart page one')
  `).run();

  const insertChunk = db.prepare(`
    INSERT INTO allergy_document_chunks (id, document_id, page_id, page_number, chunk_index, chunk_text)
    VALUES (?, 10, 100, 1, ?, ?)
  `);
  insertChunk.run(1001, 0, 'Seared Salmon | dairy free | contains sesame');
  insertChunk.run(1002, 1, 'Garden Salad | dairy free');
  insertChunk.run(1003, 2, 'Coconut Sorbet | dairy free');
  insertChunk.run(1004, 3, 'Mystery Sauce | see kitchen');

  const insertProduct = db.prepare(`
    INSERT INTO allergy_document_products (
      id,
      document_id,
      page_id,
      page_number,
      product_name,
      normalized_product_name,
      source_row_text,
      allergen_summary,
      dietary_notes,
      source_chunk_ids
    ) VALUES (?, 10, 100, 1, ?, ?, ?, ?, ?, ?)
  `);

  insertProduct.run(1, 'Seared Salmon', 'seared salmon', 'Seared Salmon | dairy free | contains sesame', 'dairy free', null, JSON.stringify([1001]));
  insertProduct.run(2, 'Garden Salad', 'garden salad', 'Garden Salad | dairy free', 'dairy free', null, JSON.stringify([1002]));
  insertProduct.run(3, 'Coconut Sorbet', 'coconut sorbet', 'Coconut Sorbet | dairy free', 'dairy free', null, JSON.stringify([1003]));
  insertProduct.run(4, 'Mystery Sauce', 'mystery sauce', 'Mystery Sauce | see kitchen', null, 'see kitchen', JSON.stringify([1004]));

  const insertMatch = db.prepare(`
    INSERT INTO allergy_document_product_matches (
      document_product_id,
      item_id,
      match_status,
      match_score,
      matched_by,
      notes,
      active
    ) VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  insertMatch.run(1, 1, 'confirmed', 0.99, 'operator', 'Confirmed salmon match');
  insertMatch.run(2, 2, 'suggested', 0.92, 'system', 'Likely greens match');
  insertMatch.run(4, 3, 'suggested', 0.61, 'system', 'Weak sauce match');
}

function getAllergenId(db: Database.Database, code: string): number {
  const row = db.prepare('SELECT id FROM allergens WHERE code = ? LIMIT 1').get(code) as { id: number } | undefined;
  if (!row) {
    throw new Error(`Missing allergen seed for ${code}`);
  }
  return row.id;
}
