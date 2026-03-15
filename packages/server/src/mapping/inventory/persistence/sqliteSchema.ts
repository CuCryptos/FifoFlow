import type Database from 'better-sqlite3';

export function initializeCanonicalInventoryMappingDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS canonical_inventory_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_ingredient_id INTEGER NOT NULL REFERENCES canonical_ingredients(id) ON DELETE CASCADE,
      inventory_item_id INTEGER REFERENCES items(id),
      scope_type TEXT NOT NULL CHECK(scope_type IN ('organization', 'location', 'operation_unit')),
      scope_ref_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      preferred_flag INTEGER NOT NULL DEFAULT 1,
      mapping_status TEXT NOT NULL CHECK(mapping_status IN ('UNMAPPED', 'AUTO_MAPPED', 'NEEDS_REVIEW', 'MANUALLY_MAPPED', 'REJECTED')),
      confidence_label TEXT CHECK(confidence_label IN ('HIGH', 'MEDIUM', 'LOW')),
      match_reason TEXT CHECK(match_reason IN (
        'exact_inventory_name',
        'normalized_inventory_name',
        'alias_based_match',
        'scoped_default',
        'manual_resolution',
        'ambiguous_inventory_match',
        'no_match'
      )),
      explanation_text TEXT,
      source_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_by TEXT,
      resolved_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_inventory_mapping_preferred
      ON canonical_inventory_mappings(canonical_ingredient_id, scope_type, scope_ref_id)
      WHERE active = 1 AND preferred_flag = 1;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_inventory_mapping_item
      ON canonical_inventory_mappings(canonical_ingredient_id, inventory_item_id, scope_type, scope_ref_id)
      WHERE active = 1 AND inventory_item_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_canonical_inventory_mappings_scope
      ON canonical_inventory_mappings(scope_type, scope_ref_id, active, mapping_status);
    CREATE INDEX IF NOT EXISTS idx_canonical_inventory_mappings_canonical
      ON canonical_inventory_mappings(canonical_ingredient_id, active);

    CREATE TABLE IF NOT EXISTS canonical_inventory_mapping_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_inventory_mapping_id INTEGER NOT NULL REFERENCES canonical_inventory_mappings(id) ON DELETE CASCADE,
      candidate_inventory_item_id INTEGER NOT NULL REFERENCES items(id),
      candidate_inventory_name TEXT NOT NULL,
      confidence_label TEXT NOT NULL CHECK(confidence_label IN ('HIGH', 'MEDIUM', 'LOW')),
      match_reason TEXT NOT NULL CHECK(match_reason IN (
        'exact_inventory_name',
        'normalized_inventory_name',
        'alias_based_match',
        'scoped_default',
        'manual_resolution',
        'ambiguous_inventory_match',
        'no_match'
      )),
      explanation_text TEXT NOT NULL,
      candidate_rank INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(canonical_inventory_mapping_id, candidate_inventory_item_id, match_reason)
    );

    CREATE INDEX IF NOT EXISTS idx_canonical_inventory_mapping_candidates_mapping
      ON canonical_inventory_mapping_candidates(canonical_inventory_mapping_id, active, candidate_rank);

    CREATE TABLE IF NOT EXISTS canonical_inventory_mapping_review_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_inventory_mapping_id INTEGER NOT NULL REFERENCES canonical_inventory_mappings(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      actor_name TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_canonical_inventory_mapping_review_events_mapping
      ON canonical_inventory_mapping_review_events(canonical_inventory_mapping_id, created_at DESC);

    CREATE TRIGGER IF NOT EXISTS update_canonical_inventory_mapping_timestamp
    AFTER UPDATE ON canonical_inventory_mappings
    BEGIN
      UPDATE canonical_inventory_mappings SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_canonical_inventory_mapping_candidate_timestamp
    AFTER UPDATE ON canonical_inventory_mapping_candidates
    BEGIN
      UPDATE canonical_inventory_mapping_candidates SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
  `);
}
