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
  });
});
