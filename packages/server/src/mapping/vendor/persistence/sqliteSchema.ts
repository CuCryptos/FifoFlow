import type Database from 'better-sqlite3';

export function initializeInventoryVendorMappingDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_vendor_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      vendor_item_id INTEGER REFERENCES vendor_prices(id) ON DELETE SET NULL,
      scope_type TEXT NOT NULL CHECK(scope_type IN ('organization', 'location', 'operation_unit')),
      scope_ref_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      preferred_flag INTEGER NOT NULL DEFAULT 1,
      mapping_status TEXT NOT NULL CHECK(mapping_status IN ('UNMAPPED', 'AUTO_MAPPED', 'NEEDS_REVIEW', 'MANUALLY_MAPPED', 'REJECTED')),
      confidence_label TEXT,
      match_reason TEXT,
      explanation_text TEXT,
      source_hash TEXT,
      resolved_by TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_vendor_mappings_inventory_scope
      ON inventory_vendor_mappings(inventory_item_id, scope_type, scope_ref_id, preferred_flag DESC);

    CREATE TABLE IF NOT EXISTS inventory_vendor_mapping_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_vendor_mapping_id INTEGER NOT NULL REFERENCES inventory_vendor_mappings(id) ON DELETE CASCADE,
      candidate_vendor_item_id INTEGER NOT NULL REFERENCES vendor_prices(id) ON DELETE CASCADE,
      candidate_vendor_name TEXT,
      candidate_vendor_item_name TEXT NOT NULL,
      confidence_label TEXT NOT NULL,
      match_reason TEXT NOT NULL,
      explanation_text TEXT NOT NULL,
      candidate_rank INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_vendor_mapping_candidates_mapping
      ON inventory_vendor_mapping_candidates(inventory_vendor_mapping_id, candidate_rank ASC);

    CREATE TABLE IF NOT EXISTS inventory_vendor_mapping_review_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_vendor_mapping_id INTEGER NOT NULL REFERENCES inventory_vendor_mappings(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL,
      actor_name TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendor_cost_lineage_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_item_id INTEGER NOT NULL REFERENCES vendor_prices(id) ON DELETE CASCADE,
      normalized_unit_cost REAL,
      base_unit TEXT,
      source_type TEXT NOT NULL,
      source_ref_table TEXT,
      source_ref_id TEXT,
      effective_at TEXT,
      stale_at TEXT,
      confidence_label TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_vendor_cost_lineage_vendor_item
      ON vendor_cost_lineage_records(vendor_item_id, effective_at DESC);

    CREATE TRIGGER IF NOT EXISTS update_inventory_vendor_mappings_timestamp
    AFTER UPDATE ON inventory_vendor_mappings
    BEGIN
      UPDATE inventory_vendor_mappings SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_inventory_vendor_candidates_timestamp
    AFTER UPDATE ON inventory_vendor_mapping_candidates
    BEGIN
      UPDATE inventory_vendor_mapping_candidates SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
  `);
}
