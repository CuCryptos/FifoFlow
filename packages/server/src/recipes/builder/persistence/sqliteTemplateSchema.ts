import type Database from 'better-sqlite3';

export function initializeRecipeTemplateLibraryDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipe_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recipe_template_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_template_id INTEGER NOT NULL REFERENCES recipe_templates(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      yield_quantity REAL NOT NULL,
      yield_unit TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(recipe_template_id, version_number),
      UNIQUE(recipe_template_id, source_hash)
    );

    CREATE TABLE IF NOT EXISTS recipe_template_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_template_version_id INTEGER NOT NULL REFERENCES recipe_template_versions(id) ON DELETE CASCADE,
      ingredient_name TEXT NOT NULL,
      qty REAL NOT NULL,
      unit TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(recipe_template_version_id, sort_order)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_template_versions_active
      ON recipe_template_versions(recipe_template_id)
      WHERE is_active = 1;

    CREATE INDEX IF NOT EXISTS idx_recipe_template_versions_template_id
      ON recipe_template_versions(recipe_template_id);

    CREATE INDEX IF NOT EXISTS idx_recipe_template_ingredients_version_id
      ON recipe_template_ingredients(recipe_template_version_id);

    CREATE TRIGGER IF NOT EXISTS update_recipe_templates_timestamp
    AFTER UPDATE ON recipe_templates
    BEGIN
      UPDATE recipe_templates SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_recipe_template_versions_timestamp
    AFTER UPDATE ON recipe_template_versions
    BEGIN
      UPDATE recipe_template_versions SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
  `);
}
