import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createProductEnrichmentRoutes } from '../routes/productEnrichment.js';
import { SQLiteAllergenRepository } from '../allergy/allergenRepositories.js';

describe('Product enrichment routes', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDb(db);
    new SQLiteAllergenRepository(db);

    app = express();
    app.use(express.json());
    app.use('/api/product-enrichment', createProductEnrichmentRoutes(db));
  });

  afterEach(() => {
    db.close();
  });

  it('lists seeded catalogs and supports identifier updates', async () => {
    const vendorId = Number(db.prepare(`INSERT INTO vendors (name) VALUES ('Sysco')`).run().lastInsertRowid);
    const itemId = Number(db.prepare(`
      INSERT INTO items (name, category, unit)
      VALUES ('Soy Sauce', 'Other', 'each')
    `).run().lastInsertRowid);
    const vendorPriceId = Number(db.prepare(`
      INSERT INTO vendor_prices (item_id, vendor_id, vendor_item_name, order_unit, order_unit_price, is_default)
      VALUES (?, ?, 'Kikkoman Soy Sauce', 'case', 48, 1)
    `).run(itemId, vendorId).lastInsertRowid);

    const catalogResponse = await request(app).get('/api/product-enrichment/catalogs');
    expect(catalogResponse.status).toBe(200);
    expect(catalogResponse.body.catalogs.map((catalog: any) => catalog.code)).toEqual([
      'gdsn',
      'manual_import',
      'sysco',
      'usda_fdc',
    ]);

    const itemUpdateResponse = await request(app)
      .put(`/api/product-enrichment/items/${itemId}/identifiers`)
      .send({
        brand_name: 'Kikkoman',
        sysco_supc: '1234567',
      });
    expect(itemUpdateResponse.status).toBe(200);
    expect(itemUpdateResponse.body.item).toMatchObject({
      id: itemId,
      brand_name: 'Kikkoman',
      sysco_supc: '1234567',
    });

    const vendorPriceUpdateResponse = await request(app)
      .put(`/api/product-enrichment/items/${itemId}/vendor-prices/${vendorPriceId}/identifiers`)
      .send({
        vendor_item_code: 'ABC-123',
        vendor_pack_text: '6/1 gal',
        sysco_supc: '1234567',
        brand_name: 'Kikkoman',
        source_catalog: 'sysco',
      });
    expect(vendorPriceUpdateResponse.status).toBe(200);
    expect(vendorPriceUpdateResponse.body.vendor_price).toMatchObject({
      id: vendorPriceId,
      vendor_item_code: 'ABC-123',
      vendor_pack_text: '6/1 gal',
      sysco_supc: '1234567',
      brand_name: 'Kikkoman',
      source_catalog: 'sysco',
    });
  });

  it('matches an item to an external product and exposes detail plus review queue', async () => {
    const vendorId = Number(db.prepare(`INSERT INTO vendors (name) VALUES ('Sysco')`).run().lastInsertRowid);
    const itemId = Number(db.prepare(`
      INSERT INTO items (name, category, unit, sysco_supc)
      VALUES ('Soy Sauce', 'Other', 'each', '1234567')
    `).run().lastInsertRowid);
    const vendorPriceId = Number(db.prepare(`
      INSERT INTO vendor_prices (
        item_id, vendor_id, vendor_item_name, vendor_item_code, sysco_supc, order_unit, order_unit_price, is_default
      ) VALUES (?, ?, 'Kikkoman Soy Sauce', 'ABC-123', '1234567', 'case', 48, 1)
    `).run(itemId, vendorId).lastInsertRowid);
    const catalogId = (db.prepare(`
      SELECT id
      FROM external_product_catalogs
      WHERE code = 'sysco'
      LIMIT 1
    `).get() as { id: number }).id;
    const externalProductId = Number(db.prepare(`
      INSERT INTO external_products (
        catalog_id, external_key, sysco_supc, vendor_item_code, brand_name, manufacturer_name,
        product_name, pack_text, ingredient_statement, allergen_statement
      ) VALUES (?, 'sysco-1', '1234567', 'ABC-123', 'Kikkoman', 'Kikkoman', 'Kikkoman Soy Sauce', '6/1 gal', 'Water, soybeans, wheat, salt', 'Contains soy, wheat')
    `).run(catalogId).lastInsertRowid);

    const soyAllergenId = (db.prepare(`SELECT id FROM allergens WHERE code = 'soy'`).get() as { id: number }).id;
    db.prepare(`
      INSERT INTO external_product_allergen_claims (external_product_id, allergen_id, status, confidence, source_excerpt)
      VALUES (?, ?, 'contains', 'verified', 'Contains soy')
    `).run(externalProductId, soyAllergenId);

    const matchResponse = await request(app)
      .post(`/api/product-enrichment/items/${itemId}/match`)
      .send({ vendor_price_id: vendorPriceId, mode: 'auto' });
    expect(matchResponse.status).toBe(200);
    expect(matchResponse.body.matches).toEqual([
      expect.objectContaining({
        item_id: itemId,
        vendor_price_id: vendorPriceId,
        match_status: 'auto_confirmed',
        match_basis: 'sysco_supc',
        match_confidence: 'high',
        external_product: expect.objectContaining({
          id: externalProductId,
          product_name: 'Kikkoman Soy Sauce',
          catalog_code: 'sysco',
        }),
      }),
    ]);

    const detailResponse = await request(app).get(`/api/product-enrichment/items/${itemId}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.item).toMatchObject({
      id: itemId,
      external_product_confidence: 'high',
    });
    expect(detailResponse.body.vendor_prices).toHaveLength(1);
    expect(detailResponse.body.matches).toHaveLength(1);
    expect(detailResponse.body.allergen_claims).toEqual([
      expect.objectContaining({
        external_product_id: externalProductId,
        allergen_code: 'soy',
        status: 'contains',
      }),
    ]);

    const reviewQueueResponse = await request(app).get('/api/product-enrichment/review-queue');
    expect(reviewQueueResponse.status).toBe(200);
    expect(reviewQueueResponse.body.ready_to_import).toEqual([
      expect.objectContaining({
        allergen_claim_count: 1,
        item: expect.objectContaining({ id: itemId }),
      }),
    ]);

    const importResponse = await request(app)
      .post(`/api/product-enrichment/items/${itemId}/import-allergens`)
      .send({
        external_product_match_id: matchResponse.body.matches[0].id,
        import_mode: 'draft_claims',
        created_by: 'tester',
      });
    expect(importResponse.status).toBe(200);
    expect(importResponse.body).toMatchObject({
      item_id: itemId,
      imported_rows: 1,
      evidence_rows: 1,
      skipped_rows: 0,
    });

    const importedProfile = db.prepare(`
      SELECT ia.status, ia.confidence, ae.source_type, ae.status_claimed, ae.captured_by
      FROM item_allergens ia
      JOIN allergen_evidence ae ON ae.item_allergen_id = ia.id
      JOIN allergens a ON a.id = ia.allergen_id
      WHERE ia.item_id = ? AND a.code = 'soy'
      LIMIT 1
    `).get(itemId) as any;
    expect(importedProfile).toMatchObject({
      status: 'contains',
      confidence: 'moderate',
      source_type: 'vendor_declaration',
      status_claimed: 'contains',
      captured_by: 'tester',
    });

    const auditRow = db.prepare(`
      SELECT *
      FROM item_allergen_import_audit
      WHERE item_id = ?
      LIMIT 1
    `).get(itemId) as any;
    expect(auditRow).toMatchObject({
      item_id: itemId,
      import_source: 'external_product',
      import_mode: 'draft_claims',
      created_by: 'tester',
    });

    const importedDetailResponse = await request(app).get(`/api/product-enrichment/items/${itemId}`);
    expect(importedDetailResponse.status).toBe(200);
    expect(importedDetailResponse.body.import_audits).toEqual([
      expect.objectContaining({
        item_id: itemId,
        external_product_match_id: matchResponse.body.matches[0].id,
        import_mode: 'draft_claims',
        created_by: 'tester',
        summary: expect.objectContaining({
          imported_rows: 1,
          evidence_rows: 1,
          skipped_rows: 0,
          imported_allergen_ids: [String(soyAllergenId)],
        }),
        match: expect.objectContaining({
          id: matchResponse.body.matches[0].id,
          external_product: expect.objectContaining({
            product_name: 'Kikkoman Soy Sauce',
          }),
        }),
      }),
    ]);

    const clearedQueueResponse = await request(app).get('/api/product-enrichment/review-queue');
    expect(clearedQueueResponse.status).toBe(200);
    expect(clearedQueueResponse.body.ready_to_import).toEqual([]);
  });

  it('imports manual catalog rows and scopes the review queue by venue', async () => {
    const venueA = Number(db.prepare(`
      INSERT INTO venues (name)
      VALUES ('Paradise Kitchen')
    `).run().lastInsertRowid);
    const venueB = Number(db.prepare(`
      INSERT INTO venues (name)
      VALUES ('Maui Grill')
    `).run().lastInsertRowid);
    const vendorId = Number(db.prepare(`INSERT INTO vendors (name) VALUES ('Sysco')`).run().lastInsertRowid);
    const itemA = Number(db.prepare(`
      INSERT INTO items (name, category, unit, venue_id, sysco_supc)
      VALUES ('Tamari', 'Other', 'each', ?, '7654321')
    `).run(venueA).lastInsertRowid);
    const itemB = Number(db.prepare(`
      INSERT INTO items (name, category, unit, venue_id)
      VALUES ('Uncoded Oil', 'Other', 'each', ?)
    `).run(venueB).lastInsertRowid);

    db.prepare(`
      INSERT INTO vendor_prices (
        item_id, vendor_id, vendor_item_name, sysco_supc, order_unit, order_unit_price, is_default
      ) VALUES (?, ?, 'Tamari Soy Sauce', '7654321', 'case', 32, 1)
    `).run(itemA, vendorId);

    const syncResponse = await request(app)
      .post('/api/product-enrichment/catalogs/manual_import/sync')
      .send({
        mode: 'manual_import',
        created_by: 'tester',
        products: [
          {
            product_name: 'Tamari Soy Sauce',
            sysco_supc: '7654321',
            brand_name: 'San-J',
            ingredient_statement: 'Water, soybeans, salt',
            allergen_statement: 'Contains soy',
            allergen_claims: [
              {
                allergen_code: 'soy',
                status: 'contains',
                confidence: 'verified',
                source_excerpt: 'Contains soy',
              },
            ],
          },
        ],
      });

    expect(syncResponse.status).toBe(200);
    expect(syncResponse.body.summary).toMatchObject({
      products_upserted: 1,
      products_created: 1,
      allergen_claims_upserted: 1,
      allergen_claims_unresolved: 0,
    });
    expect(syncResponse.body.run).toMatchObject({
      status: 'completed',
    });

    const searchResponse = await request(app)
      .get('/api/product-enrichment/search')
      .query({ sysco_supc: '7654321' });
    expect(searchResponse.status).toBe(200);
    expect(searchResponse.body.products).toEqual([
      expect.objectContaining({
        product_name: 'Tamari Soy Sauce',
        catalog_code: 'manual_import',
      }),
    ]);

    const matchResponse = await request(app)
      .post(`/api/product-enrichment/items/${itemA}/match`)
      .send({ mode: 'auto' });
    expect(matchResponse.status).toBe(200);
    expect(matchResponse.body.matches[0]).toMatchObject({
      item_id: itemA,
      match_status: 'auto_confirmed',
      match_basis: 'sysco_supc',
      external_product: expect.objectContaining({
        product_name: 'Tamari Soy Sauce',
      }),
    });

    const venueQueueResponse = await request(app)
      .get('/api/product-enrichment/review-queue')
      .query({ venue_id: venueA });
    expect(venueQueueResponse.status).toBe(200);
    expect(venueQueueResponse.body.ready_to_import).toEqual([
      expect.objectContaining({
        item: expect.objectContaining({ id: itemA }),
        allergen_claim_count: 1,
      }),
    ]);
    expect(venueQueueResponse.body.missing_identifiers).toEqual([]);

    const otherVenueQueueResponse = await request(app)
      .get('/api/product-enrichment/review-queue')
      .query({ venue_id: venueB });
    expect(otherVenueQueueResponse.status).toBe(200);
    expect(otherVenueQueueResponse.body.ready_to_import).toEqual([]);
    expect(otherVenueQueueResponse.body.missing_identifiers).toEqual([
      expect.objectContaining({ id: itemB }),
    ]);
  });
});
