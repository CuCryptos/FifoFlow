import type Database from 'better-sqlite3';

export function initializeIntelligenceDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS derived_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_type TEXT NOT NULL,
      rule_version TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id INTEGER NOT NULL,
      subject_key TEXT,
      organization_id INTEGER,
      location_id INTEGER,
      operation_unit_id INTEGER,
      storage_area_id INTEGER,
      inventory_category_id INTEGER,
      inventory_item_id INTEGER,
      recipe_id INTEGER,
      vendor_id INTEGER,
      vendor_item_id INTEGER,
      severity_label TEXT NOT NULL,
      confidence_label TEXT NOT NULL,
      confidence_score REAL,
      window_start TEXT,
      window_end TEXT,
      observed_at TEXT NOT NULL,
      magnitude_value REAL,
      evidence_count INTEGER NOT NULL DEFAULT 0,
      signal_payload TEXT NOT NULL DEFAULT '{}',
      last_confirmed_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_derived_signals_subject ON derived_signals(signal_type, subject_type, subject_id);
    CREATE INDEX IF NOT EXISTS idx_derived_signals_subject_key ON derived_signals(subject_key, observed_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_derived_signals_dedupe ON derived_signals(
      signal_type,
      subject_key,
      ifnull(window_start, ''),
      ifnull(window_end, ''),
      ifnull(magnitude_value, 0)
    );

    CREATE TABLE IF NOT EXISTS pattern_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern_type TEXT NOT NULL,
      rule_version TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id INTEGER NOT NULL,
      subject_key TEXT,
      organization_id INTEGER,
      location_id INTEGER,
      operation_unit_id INTEGER,
      storage_area_id INTEGER,
      inventory_item_id INTEGER,
      recipe_id INTEGER,
      vendor_id INTEGER,
      vendor_item_id INTEGER,
      status TEXT NOT NULL DEFAULT 'Active',
      severity_label TEXT NOT NULL,
      confidence_label TEXT NOT NULL,
      confidence_score REAL,
      observation_count INTEGER NOT NULL DEFAULT 0,
      evidence_count INTEGER NOT NULL DEFAULT 0,
      first_observed_at TEXT,
      last_observed_at TEXT,
      pattern_payload TEXT NOT NULL DEFAULT '{}',
      last_confirmed_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pattern_observations_subject_key ON pattern_observations(subject_key, status, updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pattern_observations_active
      ON pattern_observations(pattern_type, subject_key)
      WHERE status IN ('Active', 'Monitoring');

    CREATE TABLE IF NOT EXISTS recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recommendation_type TEXT NOT NULL,
      rule_version TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id INTEGER NOT NULL,
      subject_key TEXT,
      organization_id INTEGER,
      location_id INTEGER,
      operation_unit_id INTEGER,
      storage_area_id INTEGER,
      inventory_item_id INTEGER,
      recipe_id INTEGER,
      vendor_id INTEGER,
      vendor_item_id INTEGER,
      status TEXT NOT NULL DEFAULT 'OPEN',
      severity_label TEXT NOT NULL,
      confidence_label TEXT NOT NULL,
      urgency_label TEXT NOT NULL DEFAULT 'MONITOR',
      confidence_score REAL,
      summary TEXT NOT NULL,
      evidence_count INTEGER NOT NULL DEFAULT 0,
      expected_benefit_payload TEXT NOT NULL DEFAULT '{}',
      operator_action_payload TEXT NOT NULL DEFAULT '{}',
      dedupe_key TEXT,
      superseded_by_recommendation_id INTEGER,
      opened_at TEXT NOT NULL,
      due_at TEXT,
      closed_at TEXT,
      last_confirmed_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (superseded_by_recommendation_id) REFERENCES recommendations(id)
    );

    CREATE INDEX IF NOT EXISTS idx_recommendations_subject_key ON recommendations(subject_key, status, updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_recommendations_dedupe_active
      ON recommendations(recommendation_type, subject_key)
      WHERE subject_key IS NOT NULL AND status IN ('OPEN', 'REVIEWED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_REVIEW', 'APPROVED');

    CREATE TABLE IF NOT EXISTS recommendation_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recommendation_id INTEGER NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
      evidence_type TEXT NOT NULL,
      evidence_ref_table TEXT NOT NULL,
      evidence_ref_id TEXT NOT NULL,
      explanation_text TEXT NOT NULL,
      evidence_weight REAL NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_recommendation_evidence_dedupe ON recommendation_evidence(
      recommendation_id,
      evidence_type,
      evidence_ref_table,
      evidence_ref_id,
      explanation_text,
      evidence_weight
    );

    CREATE TABLE IF NOT EXISTS intelligence_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL,
      run_started_at TEXT NOT NULL,
      run_completed_at TEXT,
      signals_created INTEGER NOT NULL DEFAULT 0,
      signals_updated INTEGER NOT NULL DEFAULT 0,
      patterns_created INTEGER NOT NULL DEFAULT 0,
      patterns_updated INTEGER NOT NULL DEFAULT 0,
      recommendations_created INTEGER NOT NULL DEFAULT 0,
      recommendations_updated INTEGER NOT NULL DEFAULT 0,
      recommendations_superseded INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
