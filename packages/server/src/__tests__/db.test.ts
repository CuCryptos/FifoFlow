import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';

describe('Database', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates items table', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='items'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('creates transactions table', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('creates external product enrichment tables and seeds catalogs', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('external_product_catalogs', 'external_products', 'external_product_matches', 'external_product_allergen_claims', 'external_product_sync_runs', 'item_allergen_import_audit') ORDER BY name ASC"
    ).all() as Array<{ name: string }>;
    expect(tables.map((table) => table.name)).toEqual([
      'external_product_allergen_claims',
      'external_product_catalogs',
      'external_product_matches',
      'external_product_sync_runs',
      'external_products',
      'item_allergen_import_audit',
    ]);

    const catalogs = db.prepare(
      'SELECT code, source_type FROM external_product_catalogs ORDER BY code ASC'
    ).all() as Array<{ code: string; source_type: string }>;
    expect(catalogs).toEqual([
      { code: 'gdsn', source_type: 'gdsn' },
      { code: 'manual_import', source_type: 'manual_import' },
      { code: 'sysco', source_type: 'sysco' },
      { code: 'usda_fdc', source_type: 'usda_fdc' },
    ]);
  });

  it('creates updated_at trigger', () => {
    const triggers = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name='update_item_timestamp'"
    ).all();
    expect(triggers).toHaveLength(1);
  });

  it('inserts and retrieves an item', () => {
    const result = db.prepare(
      "INSERT INTO items (name, category, unit) VALUES (?, ?, ?)"
    ).run('Ahi Tuna', 'Seafood', 'lb');

    const item = db.prepare("SELECT * FROM items WHERE id = ?").get(result.lastInsertRowid);
    expect(item).toMatchObject({
      name: 'Ahi Tuna',
      category: 'Seafood',
      unit: 'lb',
      current_qty: 0,
      gtin: null,
      sysco_supc: null,
    });
  });

  it('enforces foreign key on transactions', () => {
    expect(() => {
      db.prepare(
        "INSERT INTO transactions (item_id, type, quantity, reason) VALUES (?, ?, ?, ?)"
      ).run(9999, 'in', 10, 'Received');
    }).toThrow();
  });
});
