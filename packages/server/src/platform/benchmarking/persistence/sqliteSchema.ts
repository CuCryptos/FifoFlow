import type Database from 'better-sqlite3';

export function initializeBenchmarkingDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS peer_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      peer_group_type TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS peer_group_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      peer_group_id INTEGER NOT NULL REFERENCES peer_groups(id) ON DELETE CASCADE,
      subject_type TEXT NOT NULL,
      subject_id INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(peer_group_id, subject_type, subject_id)
    );

    CREATE TABLE IF NOT EXISTS benchmark_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      benchmark_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS benchmark_scopes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      benchmark_definition_id INTEGER NOT NULL REFERENCES benchmark_definitions(id) ON DELETE CASCADE,
      scope_type TEXT NOT NULL,
      scope_ref_id INTEGER,
      scope_ref_key TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS benchmark_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      benchmark_definition_id INTEGER NOT NULL REFERENCES benchmark_definitions(id) ON DELETE CASCADE,
      scope_type TEXT NOT NULL,
      scope_ref_id INTEGER,
      scope_ref_key TEXT,
      observed_at TEXT NOT NULL,
      metric_payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_peer_group_memberships_subject
      ON peer_group_memberships(subject_type, subject_id);
    CREATE INDEX IF NOT EXISTS idx_benchmark_scopes_definition_scope
      ON benchmark_scopes(benchmark_definition_id, scope_type, scope_ref_id, scope_ref_key);

    CREATE TRIGGER IF NOT EXISTS update_peer_groups_timestamp
    AFTER UPDATE ON peer_groups
    BEGIN
      UPDATE peer_groups SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_peer_group_memberships_timestamp
    AFTER UPDATE ON peer_group_memberships
    BEGIN
      UPDATE peer_group_memberships SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_benchmark_definitions_timestamp
    AFTER UPDATE ON benchmark_definitions
    BEGIN
      UPDATE benchmark_definitions SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_benchmark_scopes_timestamp
    AFTER UPDATE ON benchmark_scopes
    BEGIN
      UPDATE benchmark_scopes SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
  `);
}
