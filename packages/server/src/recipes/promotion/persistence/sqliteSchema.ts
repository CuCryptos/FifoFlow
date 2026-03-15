import type Database from 'better-sqlite3';

export function initializeRecipePromotionDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipe_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      yield_quantity REAL,
      yield_unit TEXT,
      source_builder_job_id INTEGER REFERENCES recipe_builder_jobs(id),
      source_builder_draft_recipe_id INTEGER REFERENCES recipe_builder_draft_recipes(id),
      source_template_id INTEGER REFERENCES recipe_templates(id),
      source_template_version_id INTEGER REFERENCES recipe_template_versions(id),
      source_text_snapshot TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(recipe_id, version_number)
    );

    CREATE INDEX IF NOT EXISTS idx_recipe_versions_recipe_id
      ON recipe_versions(recipe_id, version_number DESC);

    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_version_id INTEGER NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
      line_index INTEGER NOT NULL,
      source_parsed_row_id INTEGER REFERENCES recipe_builder_parsed_rows(id),
      source_resolution_row_id INTEGER REFERENCES recipe_builder_resolution_rows(id),
      raw_ingredient_text TEXT NOT NULL,
      canonical_ingredient_id INTEGER NOT NULL REFERENCES canonical_ingredients(id),
      inventory_item_id INTEGER REFERENCES items(id),
      quantity_normalized REAL NOT NULL,
      unit_normalized TEXT NOT NULL,
      preparation_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(recipe_version_id, line_index)
    );

    CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_version_id
      ON recipe_ingredients(recipe_version_id, line_index ASC);
    CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_canonical
      ON recipe_ingredients(canonical_ingredient_id);

    CREATE TABLE IF NOT EXISTS recipe_promotion_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_builder_job_id INTEGER NOT NULL REFERENCES recipe_builder_jobs(id),
      recipe_builder_draft_recipe_id INTEGER NOT NULL REFERENCES recipe_builder_draft_recipes(id),
      action_type TEXT NOT NULL,
      status TEXT NOT NULL,
      promoted_recipe_id INTEGER REFERENCES recipes(id),
      promoted_recipe_version_id INTEGER REFERENCES recipe_versions(id),
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_recipe_promotion_events_job_id
      ON recipe_promotion_events(recipe_builder_job_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS recipe_builder_promotion_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_builder_draft_recipe_id INTEGER NOT NULL REFERENCES recipe_builder_draft_recipes(id),
      recipe_id INTEGER NOT NULL REFERENCES recipes(id),
      recipe_version_id INTEGER NOT NULL REFERENCES recipe_versions(id),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_builder_promotion_links_active
      ON recipe_builder_promotion_links(recipe_builder_draft_recipe_id)
      WHERE active = 1;

    CREATE TRIGGER IF NOT EXISTS update_recipe_versions_timestamp
    AFTER UPDATE ON recipe_versions
    BEGIN
      UPDATE recipe_versions SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
  `);
}
