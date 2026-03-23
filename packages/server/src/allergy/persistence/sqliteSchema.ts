import type Database from 'better-sqlite3';

export function initializeAllergyAssistantDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS allergy_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      product_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ready',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS allergy_document_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES allergy_documents(id) ON DELETE CASCADE,
      page_number INTEGER NOT NULL,
      extracted_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(document_id, page_number)
    );

    CREATE TABLE IF NOT EXISTS allergy_document_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES allergy_documents(id) ON DELETE CASCADE,
      page_id INTEGER NOT NULL REFERENCES allergy_document_pages(id) ON DELETE CASCADE,
      page_number INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(document_id, page_number, chunk_index)
    );

    CREATE TABLE IF NOT EXISTS allergy_document_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES allergy_documents(id) ON DELETE CASCADE,
      page_id INTEGER REFERENCES allergy_document_pages(id) ON DELETE CASCADE,
      page_number INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      normalized_product_name TEXT NOT NULL,
      source_row_text TEXT NOT NULL,
      allergen_summary TEXT,
      dietary_notes TEXT,
      source_chunk_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_allergy_documents_venue_id
      ON allergy_documents(venue_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_allergy_document_pages_document_id
      ON allergy_document_pages(document_id, page_number ASC);

    CREATE INDEX IF NOT EXISTS idx_allergy_document_chunks_document_id
      ON allergy_document_chunks(document_id, page_number ASC, chunk_index ASC);

    CREATE INDEX IF NOT EXISTS idx_allergy_document_products_document_id
      ON allergy_document_products(document_id, page_number ASC, id ASC);

    CREATE INDEX IF NOT EXISTS idx_allergy_document_products_normalized_name
      ON allergy_document_products(normalized_product_name);

    CREATE TRIGGER IF NOT EXISTS update_allergy_documents_timestamp
    AFTER UPDATE ON allergy_documents
    BEGIN
      UPDATE allergy_documents
      SET updated_at = datetime('now')
      WHERE id = NEW.id;
    END;
  `);

  ensureColumn(db, 'allergy_documents', 'product_count', "INTEGER NOT NULL DEFAULT 0");
}

function ensureColumn(
  db: Database.Database,
  tableName: string,
  columnName: string,
  columnDefinition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}
