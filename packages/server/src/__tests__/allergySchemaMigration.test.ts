import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { initializeAllergyAssistantDb } from '../allergy/persistence/sqliteSchema.js';

describe('allergy schema migration', () => {
  let db: Database.Database | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('adds new match columns before creating indexes on legacy match tables', () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE allergy_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venue_id INTEGER,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        page_count INTEGER NOT NULL DEFAULT 0,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ready',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE allergy_document_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        page_id INTEGER,
        page_number INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        normalized_product_name TEXT NOT NULL,
        source_row_text TEXT NOT NULL,
        allergen_summary TEXT,
        dietary_notes TEXT,
        source_chunk_ids TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE allergy_document_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        page_number INTEGER NOT NULL,
        extracted_text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE allergy_document_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        page_id INTEGER NOT NULL,
        page_number INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );

      CREATE TABLE allergy_document_product_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_product_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        match_status TEXT NOT NULL,
        match_score REAL,
        matched_by TEXT NOT NULL DEFAULT 'system',
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(document_product_id, item_id)
      );
    `);

    expect(() => initializeAllergyAssistantDb(db!)).not.toThrow();

    const matchColumns = db.prepare(`PRAGMA table_info(allergy_document_product_matches)`).all() as Array<{ name: string }>;
    expect(matchColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['match_basis', 'match_signal_tier']),
    );

    const documentColumns = db.prepare(`PRAGMA table_info(allergy_documents)`).all() as Array<{ name: string }>;
    expect(documentColumns.map((column) => column.name)).toContain('product_count');
  });
});
