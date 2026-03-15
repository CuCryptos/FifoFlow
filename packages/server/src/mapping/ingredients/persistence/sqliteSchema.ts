import type Database from 'better-sqlite3';

export function initializeCanonicalIngredientDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS canonical_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_name TEXT NOT NULL,
      normalized_canonical_name TEXT NOT NULL,
      category TEXT NOT NULL,
      base_unit TEXT NOT NULL,
      perishable_flag INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      source_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(canonical_name),
      UNIQUE(normalized_canonical_name)
    );

    CREATE INDEX IF NOT EXISTS idx_canonical_ingredients_normalized_name
      ON canonical_ingredients(normalized_canonical_name, active);
    CREATE INDEX IF NOT EXISTS idx_canonical_ingredients_category
      ON canonical_ingredients(category, active);

    CREATE TABLE IF NOT EXISTS ingredient_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_ingredient_id INTEGER NOT NULL REFERENCES canonical_ingredients(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      alias_type TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      source_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(canonical_ingredient_id, alias)
    );

    CREATE INDEX IF NOT EXISTS idx_ingredient_aliases_normalized_alias
      ON ingredient_aliases(normalized_alias, active);
    CREATE INDEX IF NOT EXISTS idx_ingredient_aliases_canonical_id
      ON ingredient_aliases(canonical_ingredient_id, active);

    CREATE TABLE IF NOT EXISTS canonical_ingredient_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_hash TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      ingredients_inserted INTEGER NOT NULL DEFAULT 0,
      ingredients_updated INTEGER NOT NULL DEFAULT 0,
      ingredients_reused INTEGER NOT NULL DEFAULT 0,
      ingredients_retired INTEGER NOT NULL DEFAULT 0,
      aliases_inserted INTEGER NOT NULL DEFAULT 0,
      aliases_updated INTEGER NOT NULL DEFAULT 0,
      aliases_reused INTEGER NOT NULL DEFAULT 0,
      aliases_retired INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_canonical_ingredient_sync_runs_started_at
      ON canonical_ingredient_sync_runs(started_at DESC);
  `);
}
