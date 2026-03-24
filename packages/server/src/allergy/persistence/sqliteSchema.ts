import type Database from 'better-sqlite3';

export function initializeAllergyAssistantDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS allergens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('fda_major_9', 'extended', 'custom')),
      icon TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS item_allergens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      allergen_id INTEGER NOT NULL REFERENCES allergens(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('contains', 'may_contain', 'free_of', 'unknown')) DEFAULT 'unknown',
      confidence TEXT NOT NULL CHECK(confidence IN ('verified', 'high', 'moderate', 'low', 'unverified', 'unknown')) DEFAULT 'unknown',
      notes TEXT,
      verified_by TEXT,
      verified_at TEXT,
      last_reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(item_id, allergen_id)
    );

    CREATE TABLE IF NOT EXISTS allergen_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_allergen_id INTEGER NOT NULL REFERENCES item_allergens(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL CHECK(source_type IN ('manufacturer_spec', 'vendor_declaration', 'staff_verified', 'label_scan', 'uploaded_chart', 'inferred')),
      source_document_id INTEGER REFERENCES allergy_documents(id) ON DELETE SET NULL,
      source_product_id INTEGER REFERENCES allergy_document_products(id) ON DELETE SET NULL,
      source_label TEXT,
      source_excerpt TEXT,
      status_claimed TEXT NOT NULL CHECK(status_claimed IN ('contains', 'may_contain', 'free_of', 'unknown')),
      confidence_claimed TEXT CHECK(confidence_claimed IN ('verified', 'high', 'moderate', 'low', 'unverified', 'unknown')),
      captured_by TEXT,
      captured_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS allergy_document_product_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_product_id INTEGER NOT NULL REFERENCES allergy_document_products(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      match_status TEXT NOT NULL CHECK(match_status IN ('suggested', 'confirmed', 'rejected', 'no_match')) DEFAULT 'suggested',
      match_score REAL,
      match_basis TEXT NOT NULL DEFAULT 'item_name' CHECK(match_basis IN ('item_name', 'explicit_alias', 'operator')),
      match_signal_tier TEXT NOT NULL DEFAULT 'fallback' CHECK(match_signal_tier IN ('high', 'medium', 'fallback', 'operator')),
      matched_by TEXT NOT NULL CHECK(matched_by IN ('system', 'operator')) DEFAULT 'system',
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(document_product_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS allergen_match_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(item_id, alias)
    );

    CREATE TABLE IF NOT EXISTS recipe_allergen_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_version_id INTEGER NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
      allergen_id INTEGER NOT NULL REFERENCES allergens(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('contains', 'may_contain', 'free_of', 'unknown')),
      reason TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(recipe_version_id, allergen_id)
    );

    CREATE TABLE IF NOT EXISTS recipe_allergen_rollups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_version_id INTEGER NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
      allergen_id INTEGER NOT NULL REFERENCES allergens(id) ON DELETE CASCADE,
      worst_status TEXT NOT NULL CHECK(worst_status IN ('contains', 'may_contain', 'free_of', 'unknown')),
      min_confidence TEXT NOT NULL CHECK(min_confidence IN ('verified', 'high', 'moderate', 'low', 'unverified', 'unknown')),
      source_item_ids TEXT NOT NULL DEFAULT '[]',
      source_paths TEXT NOT NULL DEFAULT '[]',
      needs_review INTEGER NOT NULL DEFAULT 0,
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(recipe_version_id, allergen_id)
    );

    CREATE TABLE IF NOT EXISTS allergen_query_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
      query_text TEXT NOT NULL,
      allergen_codes TEXT NOT NULL DEFAULT '[]',
      response_summary TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

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

    CREATE INDEX IF NOT EXISTS idx_allergens_category
      ON allergens(category, sort_order ASC, name ASC);

    CREATE INDEX IF NOT EXISTS idx_item_allergens_item_id
      ON item_allergens(item_id, allergen_id);

    CREATE INDEX IF NOT EXISTS idx_item_allergens_allergen_id
      ON item_allergens(allergen_id, status, confidence);

    CREATE INDEX IF NOT EXISTS idx_item_allergens_status
      ON item_allergens(status, confidence);

    CREATE INDEX IF NOT EXISTS idx_allergen_evidence_item_allergen_id
      ON allergen_evidence(item_allergen_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_allergen_evidence_source_document_id
      ON allergen_evidence(source_document_id, source_product_id);

    CREATE INDEX IF NOT EXISTS idx_allergy_document_product_matches_document_product_id
      ON allergy_document_product_matches(document_product_id, active DESC, match_status);

    CREATE INDEX IF NOT EXISTS idx_allergy_document_product_matches_item_id
      ON allergy_document_product_matches(item_id, match_status);

    CREATE INDEX IF NOT EXISTS idx_allergen_match_aliases_item_id
      ON allergen_match_aliases(item_id, active DESC, alias COLLATE NOCASE ASC);

    CREATE INDEX IF NOT EXISTS idx_allergen_match_aliases_normalized_alias
      ON allergen_match_aliases(normalized_alias, active DESC);

    CREATE INDEX IF NOT EXISTS idx_recipe_allergen_overrides_recipe_version_id
      ON recipe_allergen_overrides(recipe_version_id, allergen_id);

    CREATE INDEX IF NOT EXISTS idx_recipe_allergen_overrides_allergen_id
      ON recipe_allergen_overrides(allergen_id, status);

    CREATE INDEX IF NOT EXISTS idx_recipe_allergen_rollups_recipe_version_id
      ON recipe_allergen_rollups(recipe_version_id, allergen_id);

    CREATE INDEX IF NOT EXISTS idx_recipe_allergen_rollups_allergen_id
      ON recipe_allergen_rollups(allergen_id, worst_status, min_confidence);

    CREATE INDEX IF NOT EXISTS idx_allergen_query_audit_venue_created_at
      ON allergen_query_audit(venue_id, created_at DESC);

    CREATE TRIGGER IF NOT EXISTS update_allergy_documents_timestamp
    AFTER UPDATE ON allergy_documents
    BEGIN
      UPDATE allergy_documents
      SET updated_at = datetime('now')
      WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_allergens_timestamp
    AFTER UPDATE ON allergens
    BEGIN
      UPDATE allergens
      SET updated_at = datetime('now')
      WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_item_allergens_timestamp
    AFTER UPDATE ON item_allergens
    BEGIN
      UPDATE item_allergens
      SET updated_at = datetime('now')
      WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_allergy_document_product_matches_timestamp
    AFTER UPDATE ON allergy_document_product_matches
    BEGIN
      UPDATE allergy_document_product_matches
      SET updated_at = datetime('now')
      WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_allergen_match_aliases_timestamp
    AFTER UPDATE ON allergen_match_aliases
    BEGIN
      UPDATE allergen_match_aliases
      SET updated_at = datetime('now')
      WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_recipe_allergen_overrides_timestamp
    AFTER UPDATE ON recipe_allergen_overrides
    BEGIN
      UPDATE recipe_allergen_overrides
      SET updated_at = datetime('now')
      WHERE id = NEW.id;
    END;
  `);

  ensureColumn(db, 'allergy_documents', 'product_count', "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, 'allergy_document_product_matches', 'match_basis', "TEXT NOT NULL DEFAULT 'item_name'");
  ensureColumn(db, 'allergy_document_product_matches', 'match_signal_tier', "TEXT NOT NULL DEFAULT 'fallback'");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_allergy_document_product_matches_signal
      ON allergy_document_product_matches(match_signal_tier, match_score DESC);
  `);
  seedAllergens(db);
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

function seedAllergens(db: Database.Database): void {
  db.exec(`
    INSERT INTO allergens (code, name, category, icon, sort_order, is_active) VALUES
      ('wheat', 'Wheat', 'fda_major_9', 'wheat', 1, 1),
      ('milk', 'Milk/Dairy', 'fda_major_9', 'milk', 2, 1),
      ('egg', 'Eggs', 'fda_major_9', 'egg', 3, 1),
      ('peanut', 'Peanuts', 'fda_major_9', 'peanut', 4, 1),
      ('tree_nut', 'Tree Nuts', 'fda_major_9', 'tree_nut', 5, 1),
      ('soy', 'Soy', 'fda_major_9', 'soy', 6, 1),
      ('fish', 'Fish', 'fda_major_9', 'fish', 7, 1),
      ('shellfish', 'Shellfish', 'fda_major_9', 'shellfish', 8, 1),
      ('sesame', 'Sesame', 'fda_major_9', 'sesame', 9, 1),
      ('gluten', 'Gluten', 'extended', 'gluten', 10, 1),
      ('mustard', 'Mustard', 'extended', 'mustard', 11, 1),
      ('celery', 'Celery', 'extended', 'celery', 12, 1),
      ('lupin', 'Lupin', 'extended', 'lupin', 13, 1),
      ('mollusk', 'Mollusks', 'extended', 'mollusk', 14, 1),
      ('sulfites', 'Sulfites', 'extended', 'sulfites', 15, 1),
      ('coconut', 'Coconut', 'extended', 'coconut', 16, 1),
      ('corn', 'Corn', 'extended', 'corn', 17, 1)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      icon = excluded.icon,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active;
  `);
}
