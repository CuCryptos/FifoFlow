import type Database from 'better-sqlite3';

export function initializeTemplateIngredientMappingDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS template_ingredient_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES recipe_templates(id) ON DELETE CASCADE,
      template_version_id INTEGER NOT NULL REFERENCES recipe_template_versions(id) ON DELETE CASCADE,
      template_ingredient_row_key TEXT NOT NULL UNIQUE,
      ingredient_name TEXT NOT NULL,
      normalized_ingredient_name TEXT NOT NULL,
      mapped_canonical_ingredient_id INTEGER REFERENCES canonical_ingredients(id),
      mapping_status TEXT NOT NULL CHECK(mapping_status IN ('UNMAPPED', 'AUTO_MAPPED', 'NEEDS_REVIEW', 'MANUALLY_MAPPED', 'REJECTED')),
      confidence_label TEXT CHECK(confidence_label IN ('HIGH', 'MEDIUM', 'LOW')),
      match_reason TEXT CHECK(match_reason IN (
        'exact_canonical_name',
        'normalized_canonical_name',
        'exact_alias',
        'normalized_alias',
        'manual_resolution',
        'no_match',
        'ambiguous_match'
      )),
      chosen_candidate_id INTEGER,
      explanation_text TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      resolved_by TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_template_ingredient_mappings_template_id
      ON template_ingredient_mappings(template_id, template_version_id);
    CREATE INDEX IF NOT EXISTS idx_template_ingredient_mappings_status
      ON template_ingredient_mappings(mapping_status, active);
    CREATE INDEX IF NOT EXISTS idx_template_ingredient_mappings_canonical
      ON template_ingredient_mappings(mapped_canonical_ingredient_id, active);

    CREATE TABLE IF NOT EXISTS template_ingredient_mapping_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_ingredient_mapping_id INTEGER NOT NULL REFERENCES template_ingredient_mappings(id) ON DELETE CASCADE,
      candidate_canonical_ingredient_id INTEGER NOT NULL REFERENCES canonical_ingredients(id),
      candidate_canonical_name TEXT NOT NULL,
      confidence_label TEXT NOT NULL CHECK(confidence_label IN ('HIGH', 'MEDIUM', 'LOW')),
      match_reason TEXT NOT NULL CHECK(match_reason IN (
        'exact_canonical_name',
        'normalized_canonical_name',
        'exact_alias',
        'normalized_alias',
        'manual_resolution',
        'no_match',
        'ambiguous_match'
      )),
      explanation_text TEXT NOT NULL,
      candidate_rank INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(template_ingredient_mapping_id, candidate_canonical_ingredient_id, match_reason)
    );

    CREATE INDEX IF NOT EXISTS idx_template_mapping_candidates_mapping
      ON template_ingredient_mapping_candidates(template_ingredient_mapping_id, active, candidate_rank);

    CREATE TABLE IF NOT EXISTS template_ingredient_mapping_review_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_ingredient_mapping_id INTEGER NOT NULL REFERENCES template_ingredient_mappings(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      actor_name TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_template_mapping_review_events_mapping
      ON template_ingredient_mapping_review_events(template_ingredient_mapping_id, created_at DESC);

    CREATE TRIGGER IF NOT EXISTS update_template_ingredient_mapping_timestamp
    AFTER UPDATE ON template_ingredient_mappings
    BEGIN
      UPDATE template_ingredient_mappings SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_template_ingredient_mapping_candidate_timestamp
    AFTER UPDATE ON template_ingredient_mapping_candidates
    BEGIN
      UPDATE template_ingredient_mapping_candidates SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
  `);
}
