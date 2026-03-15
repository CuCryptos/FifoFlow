import type Database from 'better-sqlite3';

export function initializeRecipeBuilderDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipe_builder_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL CHECK(source_type IN ('freeform', 'template')),
      source_text TEXT,
      source_template_id INTEGER REFERENCES recipe_templates(id),
      source_template_version_id INTEGER REFERENCES recipe_template_versions(id),
      draft_name TEXT,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'PARSED', 'ASSEMBLED', 'NEEDS_REVIEW', 'BLOCKED', 'CREATED', 'FAILED')),
      source_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recipe_builder_parsed_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_builder_job_id INTEGER NOT NULL REFERENCES recipe_builder_jobs(id) ON DELETE CASCADE,
      line_index INTEGER NOT NULL,
      raw_line_text TEXT NOT NULL,
      quantity_raw TEXT,
      quantity_normalized REAL,
      unit_raw TEXT,
      unit_normalized TEXT,
      ingredient_text TEXT,
      preparation_note TEXT,
      parse_status TEXT NOT NULL CHECK(parse_status IN ('PARSED', 'PARTIAL', 'NEEDS_REVIEW', 'FAILED')),
      parser_confidence TEXT NOT NULL CHECK(parser_confidence IN ('HIGH', 'MEDIUM', 'LOW')),
      explanation_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(recipe_builder_job_id, line_index)
    );

    CREATE TABLE IF NOT EXISTS recipe_builder_resolution_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parsed_row_id INTEGER NOT NULL REFERENCES recipe_builder_parsed_rows(id) ON DELETE CASCADE,
      recipe_builder_job_id INTEGER NOT NULL REFERENCES recipe_builder_jobs(id) ON DELETE CASCADE,
      canonical_ingredient_id INTEGER REFERENCES canonical_ingredients(id),
      canonical_match_status TEXT NOT NULL CHECK(canonical_match_status IN ('matched', 'no_match', 'ambiguous', 'skipped')),
      canonical_confidence TEXT NOT NULL CHECK(canonical_confidence IN ('HIGH', 'MEDIUM', 'LOW')),
      canonical_match_reason TEXT,
      inventory_item_id INTEGER REFERENCES items(id),
      inventory_mapping_status TEXT NOT NULL CHECK(inventory_mapping_status IN ('UNMAPPED', 'MAPPED', 'NEEDS_REVIEW', 'SKIPPED')),
      quantity_normalization_status TEXT NOT NULL CHECK(quantity_normalization_status IN ('NORMALIZED', 'PARTIAL', 'NEEDS_REVIEW', 'FAILED')),
      review_status TEXT NOT NULL CHECK(review_status IN ('READY', 'NEEDS_REVIEW', 'BLOCKED', 'INCOMPLETE', 'CREATED')),
      explanation_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(parsed_row_id)
    );

    CREATE TABLE IF NOT EXISTS recipe_builder_draft_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_builder_job_id INTEGER NOT NULL UNIQUE REFERENCES recipe_builder_jobs(id) ON DELETE CASCADE,
      draft_name TEXT NOT NULL,
      yield_quantity REAL,
      yield_unit TEXT,
      completeness_status TEXT NOT NULL CHECK(completeness_status IN ('READY', 'NEEDS_REVIEW', 'BLOCKED', 'INCOMPLETE', 'CREATED')),
      costability_status TEXT NOT NULL CHECK(costability_status IN ('COSTABLE', 'NEEDS_REVIEW', 'NOT_COSTABLE')),
      ingredient_row_count INTEGER NOT NULL DEFAULT 0,
      ready_row_count INTEGER NOT NULL DEFAULT 0,
      review_row_count INTEGER NOT NULL DEFAULT 0,
      blocked_row_count INTEGER NOT NULL DEFAULT 0,
      unresolved_canonical_count INTEGER NOT NULL DEFAULT 0,
      unresolved_inventory_count INTEGER NOT NULL DEFAULT 0,
      source_recipe_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recipe_builder_review_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_builder_job_id INTEGER NOT NULL REFERENCES recipe_builder_jobs(id) ON DELETE CASCADE,
      parsed_row_id INTEGER REFERENCES recipe_builder_parsed_rows(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      actor_name TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_recipe_builder_parsed_rows_job_id
      ON recipe_builder_parsed_rows(recipe_builder_job_id, line_index);
    CREATE INDEX IF NOT EXISTS idx_recipe_builder_resolution_rows_job_id
      ON recipe_builder_resolution_rows(recipe_builder_job_id, review_status);
    CREATE INDEX IF NOT EXISTS idx_recipe_builder_review_events_job_id
      ON recipe_builder_review_events(recipe_builder_job_id, created_at DESC);

    CREATE TRIGGER IF NOT EXISTS update_recipe_builder_jobs_timestamp
    AFTER UPDATE ON recipe_builder_jobs
    BEGIN
      UPDATE recipe_builder_jobs SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_recipe_builder_parsed_rows_timestamp
    AFTER UPDATE ON recipe_builder_parsed_rows
    BEGIN
      UPDATE recipe_builder_parsed_rows SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_recipe_builder_resolution_rows_timestamp
    AFTER UPDATE ON recipe_builder_resolution_rows
    BEGIN
      UPDATE recipe_builder_resolution_rows SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_recipe_builder_draft_recipes_timestamp
    AFTER UPDATE ON recipe_builder_draft_recipes
    BEGIN
      UPDATE recipe_builder_draft_recipes SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
  `);
}
