import type Database from 'better-sqlite3';

export function initializeRecipeCostDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipe_cost_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      snapshots_created INTEGER NOT NULL DEFAULT 0,
      snapshots_updated INTEGER NOT NULL DEFAULT 0,
      complete_snapshots INTEGER NOT NULL DEFAULT 0,
      partial_snapshots INTEGER NOT NULL DEFAULT 0,
      incomplete_snapshots INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recipe_cost_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      recipe_version_id INTEGER,
      recipe_name TEXT NOT NULL,
      recipe_type TEXT NOT NULL,
      snapshot_at TEXT NOT NULL,
      comparable_key TEXT NOT NULL,
      yield_qty REAL,
      yield_unit TEXT,
      serving_count REAL,
      total_cost REAL,
      resolved_cost_subtotal REAL NOT NULL DEFAULT 0,
      cost_per_yield_unit REAL,
      cost_per_serving REAL,
      completeness_status TEXT NOT NULL CHECK(completeness_status IN ('complete', 'partial', 'incomplete')),
      confidence_label TEXT NOT NULL CHECK(confidence_label IN ('high', 'medium', 'low')),
      ingredient_count INTEGER NOT NULL DEFAULT 0,
      resolved_ingredient_count INTEGER NOT NULL DEFAULT 0,
      missing_cost_count INTEGER NOT NULL DEFAULT 0,
      stale_cost_count INTEGER NOT NULL DEFAULT 0,
      ambiguous_cost_count INTEGER NOT NULL DEFAULT 0,
      unit_mismatch_count INTEGER NOT NULL DEFAULT 0,
      primary_driver_item_id INTEGER REFERENCES items(id),
      primary_driver_cost REAL,
      source_run_id INTEGER REFERENCES recipe_cost_runs(id),
      driver_payload TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(comparable_key)
    );

    CREATE INDEX IF NOT EXISTS idx_recipe_cost_snapshots_recipe_time
      ON recipe_cost_snapshots(recipe_id, snapshot_at DESC);
    CREATE INDEX IF NOT EXISTS idx_recipe_cost_snapshots_recipe_version_time
      ON recipe_cost_snapshots(recipe_id, recipe_version_id, snapshot_at DESC);
    CREATE INDEX IF NOT EXISTS idx_recipe_cost_snapshots_comparable_key
      ON recipe_cost_snapshots(comparable_key);

    CREATE TABLE IF NOT EXISTS ingredient_cost_resolution_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_cost_snapshot_id INTEGER NOT NULL REFERENCES recipe_cost_snapshots(id) ON DELETE CASCADE,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      recipe_item_id TEXT NOT NULL,
      inventory_item_id INTEGER REFERENCES items(id),
      inventory_item_name TEXT NOT NULL,
      resolution_status TEXT NOT NULL CHECK(resolution_status IN ('resolved', 'missing_cost', 'stale_cost', 'ambiguous_cost', 'unit_mismatch')),
      chosen_source_type TEXT,
      chosen_source_ref TEXT,
      normalized_unit_cost REAL,
      base_unit TEXT NOT NULL,
      observed_at TEXT,
      stale_after_days INTEGER,
      stale_flag INTEGER NOT NULL DEFAULT 0,
      ambiguity_count INTEGER NOT NULL DEFAULT 0,
      candidate_count INTEGER NOT NULL DEFAULT 0,
      explanation_text TEXT NOT NULL,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_recipe_cost_resolution_snapshot_id
      ON ingredient_cost_resolution_log(recipe_cost_snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_recipe_cost_resolution_recipe_item
      ON ingredient_cost_resolution_log(recipe_id, inventory_item_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS recipe_ingredient_cost_components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_cost_snapshot_id INTEGER NOT NULL REFERENCES recipe_cost_snapshots(id) ON DELETE CASCADE,
      recipe_item_id TEXT NOT NULL,
      inventory_item_id INTEGER REFERENCES items(id),
      ingredient_name TEXT NOT NULL,
      quantity_base_unit REAL,
      base_unit TEXT NOT NULL,
      resolved_unit_cost REAL,
      extended_cost REAL,
      resolution_status TEXT NOT NULL CHECK(resolution_status IN ('resolved', 'missing_cost', 'stale_cost', 'ambiguous_cost', 'unit_mismatch')),
      cost_source_type TEXT,
      cost_source_ref TEXT,
      stale_flag INTEGER NOT NULL DEFAULT 0,
      ambiguity_flag INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(recipe_cost_snapshot_id, recipe_item_id, inventory_item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_recipe_cost_components_snapshot_id
      ON recipe_ingredient_cost_components(recipe_cost_snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_recipe_cost_components_recipe_item
      ON recipe_ingredient_cost_components(inventory_item_id, created_at DESC);
  `);
}
