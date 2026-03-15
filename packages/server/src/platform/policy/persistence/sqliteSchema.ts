import type Database from 'better-sqlite3';

export function initializeScopedPolicyDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS policy_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      value_type TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS policy_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_definition_id INTEGER NOT NULL REFERENCES policy_definitions(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      effective_start_at TEXT NOT NULL,
      effective_end_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(policy_definition_id, version_number)
    );

    CREATE TABLE IF NOT EXISTS policy_scopes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_version_id INTEGER NOT NULL REFERENCES policy_versions(id) ON DELETE CASCADE,
      scope_type TEXT NOT NULL,
      scope_ref_id INTEGER,
      scope_ref_key TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS policy_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_scope_id INTEGER NOT NULL REFERENCES policy_scopes(id) ON DELETE CASCADE,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS policy_resolution_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_key TEXT NOT NULL,
      effective_at TEXT NOT NULL,
      subject_scope_json TEXT NOT NULL,
      matched_scope_type TEXT,
      matched_scope_ref_id INTEGER,
      matched_scope_ref_key TEXT,
      policy_version_id INTEGER,
      explanation_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_policy_versions_definition_effective
      ON policy_versions(policy_definition_id, effective_start_at DESC);
    CREATE INDEX IF NOT EXISTS idx_policy_scopes_version_scope
      ON policy_scopes(policy_version_id, scope_type, scope_ref_id, scope_ref_key);
    CREATE INDEX IF NOT EXISTS idx_policy_resolution_logs_key
      ON policy_resolution_logs(policy_key, created_at DESC);

    CREATE TRIGGER IF NOT EXISTS update_policy_definitions_timestamp
    AFTER UPDATE ON policy_definitions
    BEGIN
      UPDATE policy_definitions SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_policy_values_timestamp
    AFTER UPDATE ON policy_values
    BEGIN
      UPDATE policy_values SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
  `);
}
