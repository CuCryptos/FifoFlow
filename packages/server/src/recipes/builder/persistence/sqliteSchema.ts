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
      origin TEXT NOT NULL DEFAULT 'manual_entry' CHECK(origin IN ('manual_entry', 'photo_ingestion', 'conversational', 'purchase_inference', 'prep_sheet', 'vendor_doc', 'pos_import')),
      confidence_level TEXT NOT NULL DEFAULT 'draft' CHECK(confidence_level IN ('draft', 'estimated', 'reviewed', 'verified', 'locked')),
      confidence_score INTEGER NOT NULL DEFAULT 0,
      confidence_details_json TEXT NOT NULL DEFAULT '[]',
      source_images_json TEXT NOT NULL DEFAULT '[]',
      parsing_issues_json TEXT NOT NULL DEFAULT '[]',
      assumptions_json TEXT NOT NULL DEFAULT '[]',
      follow_up_questions_json TEXT NOT NULL DEFAULT '[]',
      source_context_json TEXT NOT NULL DEFAULT '{}',
      capture_session_id INTEGER REFERENCES recipe_capture_sessions(id) ON DELETE SET NULL,
      last_confidence_recalculated_at TEXT,
      inference_variance_pct REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recipe_builder_parsed_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_builder_job_id INTEGER NOT NULL REFERENCES recipe_builder_jobs(id) ON DELETE CASCADE,
      line_index INTEGER NOT NULL,
      raw_line_text TEXT NOT NULL,
      source_template_ingredient_name TEXT,
      source_template_quantity REAL,
      source_template_unit TEXT,
      source_template_sort_order INTEGER,
      estimated_flag INTEGER NOT NULL DEFAULT 0,
      estimation_basis TEXT,
      alternative_item_matches_json TEXT NOT NULL DEFAULT '[]',
      alternative_recipe_matches_json TEXT NOT NULL DEFAULT '[]',
      detected_component_type TEXT NOT NULL DEFAULT 'unknown' CHECK(detected_component_type IN ('inventory_item', 'sub_recipe', 'prep_component', 'unknown')),
      matched_recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
      matched_recipe_version_id INTEGER REFERENCES recipe_versions(id) ON DELETE SET NULL,
      match_basis TEXT CHECK(match_basis IN ('item_name', 'item_alias', 'recipe_name', 'recipe_alias', 'operator')),
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
      recipe_mapping_status TEXT NOT NULL DEFAULT 'UNMAPPED' CHECK(recipe_mapping_status IN ('UNMAPPED', 'MAPPED', 'NEEDS_REVIEW', 'SKIPPED')),
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
      recipe_version_id INTEGER REFERENCES recipe_versions(id) ON DELETE SET NULL,
      recipe_match_confidence TEXT CHECK(recipe_match_confidence IN ('HIGH', 'MEDIUM', 'LOW')),
      recipe_match_reason TEXT,
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
      draft_notes TEXT,
      yield_quantity REAL,
      yield_unit TEXT,
      serving_quantity REAL,
      serving_unit TEXT,
      serving_count REAL,
      completeness_status TEXT NOT NULL CHECK(completeness_status IN ('READY', 'NEEDS_REVIEW', 'BLOCKED', 'INCOMPLETE', 'CREATED')),
      costability_status TEXT NOT NULL CHECK(costability_status IN ('COSTABLE', 'NEEDS_REVIEW', 'NOT_COSTABLE')),
      ingredient_row_count INTEGER NOT NULL DEFAULT 0,
      ready_row_count INTEGER NOT NULL DEFAULT 0,
      review_row_count INTEGER NOT NULL DEFAULT 0,
      blocked_row_count INTEGER NOT NULL DEFAULT 0,
      unresolved_canonical_count INTEGER NOT NULL DEFAULT 0,
      unresolved_inventory_count INTEGER NOT NULL DEFAULT 0,
      source_recipe_type TEXT,
      method_notes TEXT,
      review_priority TEXT NOT NULL DEFAULT 'normal' CHECK(review_priority IN ('low', 'normal', 'high')),
      ready_for_review_flag INTEGER NOT NULL DEFAULT 0,
      approved_by TEXT,
      approved_at TEXT,
      rejected_by TEXT,
      rejected_at TEXT,
      rejection_reason TEXT,
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

    CREATE TABLE IF NOT EXISTS recipe_capture_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
      name TEXT,
      capture_mode TEXT NOT NULL CHECK(capture_mode IN ('single_photo', 'photo_batch', 'conversation_batch', 'prep_sheet_batch', 'blitz')),
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      led_by TEXT,
      notes TEXT,
      total_inputs INTEGER NOT NULL DEFAULT 0,
      total_drafts_created INTEGER NOT NULL DEFAULT 0,
      total_auto_matched INTEGER NOT NULL DEFAULT 0,
      total_needs_review INTEGER NOT NULL DEFAULT 0,
      total_approved INTEGER NOT NULL DEFAULT 0,
      estimated_time_saved_minutes INTEGER NOT NULL DEFAULT 0,
      discovered_sub_recipes_json TEXT NOT NULL DEFAULT '[]',
      new_items_needed_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recipe_capture_inputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_capture_session_id INTEGER NOT NULL REFERENCES recipe_capture_sessions(id) ON DELETE CASCADE,
      input_type TEXT NOT NULL CHECK(input_type IN ('photo', 'text', 'prep_sheet', 'vendor_doc')),
      source_text TEXT,
      source_file_name TEXT,
      source_mime_type TEXT,
      source_storage_path TEXT,
      parse_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(parse_status IN ('PENDING', 'PROCESSED', 'FAILED')),
      recipe_builder_job_id INTEGER REFERENCES recipe_builder_jobs(id) ON DELETE SET NULL,
      processing_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS item_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      alias_type TEXT NOT NULL CHECK(alias_type IN ('chef_slang', 'vendor_name', 'common_name', 'abbreviation', 'menu_name', 'component_name')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(item_id, alias)
    );

    CREATE TABLE IF NOT EXISTS recipe_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      alias_type TEXT NOT NULL CHECK(alias_type IN ('chef_slang', 'abbreviation', 'old_name', 'component_name')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(recipe_id, alias)
    );

    CREATE TABLE IF NOT EXISTS prep_sheet_captures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      capture_date TEXT NOT NULL,
      source_file_name TEXT NOT NULL,
      source_mime_type TEXT NOT NULL,
      source_storage_path TEXT,
      extracted_text TEXT,
      parsed_items_json TEXT NOT NULL DEFAULT '[]',
      inferred_relationships_json TEXT NOT NULL DEFAULT '[]',
      processed INTEGER NOT NULL DEFAULT 0,
      processing_notes TEXT,
      recipe_capture_session_id INTEGER REFERENCES recipe_capture_sessions(id) ON DELETE SET NULL,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recipe_inference_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'COMPLETED', 'FAILED')),
      notes_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS recipe_inference_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_inference_run_id INTEGER NOT NULL REFERENCES recipe_inference_runs(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
      recipe_version_id INTEGER REFERENCES recipe_versions(id) ON DELETE SET NULL,
      total_purchased_base_qty REAL NOT NULL,
      total_units_sold REAL NOT NULL,
      inferred_portion_base_qty REAL NOT NULL,
      current_recipe_portion_base_qty REAL,
      variance_pct REAL,
      waste_factor REAL NOT NULL DEFAULT 0,
      menu_usage_json TEXT NOT NULL DEFAULT '[]',
      acknowledged INTEGER NOT NULL DEFAULT 0,
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      action_taken TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_recipe_builder_parsed_rows_job_id
      ON recipe_builder_parsed_rows(recipe_builder_job_id, line_index);
    CREATE INDEX IF NOT EXISTS idx_recipe_builder_resolution_rows_job_id
      ON recipe_builder_resolution_rows(recipe_builder_job_id, review_status);
    CREATE INDEX IF NOT EXISTS idx_recipe_builder_review_events_job_id
      ON recipe_builder_review_events(recipe_builder_job_id, created_at DESC);
    
    CREATE TRIGGER IF NOT EXISTS update_recipe_capture_sessions_timestamp
    AFTER UPDATE ON recipe_capture_sessions
    BEGIN
      UPDATE recipe_capture_sessions SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_recipe_capture_inputs_timestamp
    AFTER UPDATE ON recipe_capture_inputs
    BEGIN
      UPDATE recipe_capture_inputs SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_item_aliases_timestamp
    AFTER UPDATE ON item_aliases
    BEGIN
      UPDATE item_aliases SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_recipe_aliases_timestamp
    AFTER UPDATE ON recipe_aliases
    BEGIN
      UPDATE recipe_aliases SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_prep_sheet_captures_timestamp
    AFTER UPDATE ON prep_sheet_captures
    BEGIN
      UPDATE prep_sheet_captures SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_recipe_inference_runs_timestamp
    AFTER UPDATE ON recipe_inference_runs
    BEGIN
      UPDATE recipe_inference_runs SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_recipe_inference_results_timestamp
    AFTER UPDATE ON recipe_inference_results
    BEGIN
      UPDATE recipe_inference_results SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

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

  ensureColumn(db, 'recipe_builder_draft_recipes', 'draft_notes', 'TEXT');
  ensureColumn(db, 'recipe_builder_draft_recipes', 'serving_quantity', 'REAL');
  ensureColumn(db, 'recipe_builder_draft_recipes', 'serving_unit', 'TEXT');
  ensureColumn(db, 'recipe_builder_draft_recipes', 'serving_count', 'REAL');
  ensureColumn(db, 'recipe_builder_parsed_rows', 'source_template_ingredient_name', 'TEXT');
  ensureColumn(db, 'recipe_builder_parsed_rows', 'source_template_quantity', 'REAL');
  ensureColumn(db, 'recipe_builder_parsed_rows', 'source_template_unit', 'TEXT');
  ensureColumn(db, 'recipe_builder_parsed_rows', 'source_template_sort_order', 'INTEGER');
  ensureColumn(db, 'recipe_builder_jobs', 'origin', "TEXT NOT NULL DEFAULT 'manual_entry' CHECK(origin IN ('manual_entry', 'photo_ingestion', 'conversational', 'purchase_inference', 'prep_sheet', 'vendor_doc', 'pos_import'))");
  ensureColumn(db, 'recipe_builder_jobs', 'confidence_level', "TEXT NOT NULL DEFAULT 'draft' CHECK(confidence_level IN ('draft', 'estimated', 'reviewed', 'verified', 'locked'))");
  ensureColumn(db, 'recipe_builder_jobs', 'confidence_score', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'recipe_builder_jobs', 'confidence_details_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'recipe_builder_jobs', 'source_images_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'recipe_builder_jobs', 'parsing_issues_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'recipe_builder_jobs', 'assumptions_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'recipe_builder_jobs', 'follow_up_questions_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'recipe_builder_jobs', 'source_context_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'recipe_builder_jobs', 'capture_session_id', 'INTEGER REFERENCES recipe_capture_sessions(id) ON DELETE SET NULL');
  ensureColumn(db, 'recipe_builder_jobs', 'last_confidence_recalculated_at', 'TEXT');
  ensureColumn(db, 'recipe_builder_jobs', 'inference_variance_pct', 'REAL');
  ensureColumn(db, 'recipe_builder_parsed_rows', 'estimated_flag', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'recipe_builder_parsed_rows', 'estimation_basis', 'TEXT');
  ensureColumn(db, 'recipe_builder_parsed_rows', 'alternative_item_matches_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'recipe_builder_parsed_rows', 'alternative_recipe_matches_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'recipe_builder_parsed_rows', 'detected_component_type', "TEXT NOT NULL DEFAULT 'unknown' CHECK(detected_component_type IN ('inventory_item', 'sub_recipe', 'prep_component', 'unknown'))");
  ensureColumn(db, 'recipe_builder_parsed_rows', 'matched_recipe_id', 'INTEGER REFERENCES recipes(id) ON DELETE SET NULL');
  ensureColumn(db, 'recipe_builder_parsed_rows', 'matched_recipe_version_id', 'INTEGER REFERENCES recipe_versions(id) ON DELETE SET NULL');
  ensureColumn(db, 'recipe_builder_parsed_rows', 'match_basis', "TEXT CHECK(match_basis IN ('item_name', 'item_alias', 'recipe_name', 'recipe_alias', 'operator'))");
  ensureColumn(db, 'recipe_builder_resolution_rows', 'recipe_mapping_status', "TEXT NOT NULL DEFAULT 'UNMAPPED' CHECK(recipe_mapping_status IN ('UNMAPPED', 'MAPPED', 'NEEDS_REVIEW', 'SKIPPED'))");
  ensureColumn(db, 'recipe_builder_resolution_rows', 'recipe_id', 'INTEGER REFERENCES recipes(id) ON DELETE SET NULL');
  ensureColumn(db, 'recipe_builder_resolution_rows', 'recipe_version_id', 'INTEGER REFERENCES recipe_versions(id) ON DELETE SET NULL');
  ensureColumn(db, 'recipe_builder_resolution_rows', 'recipe_match_confidence', "TEXT CHECK(recipe_match_confidence IN ('HIGH', 'MEDIUM', 'LOW'))");
  ensureColumn(db, 'recipe_builder_resolution_rows', 'recipe_match_reason', 'TEXT');
  ensureColumn(db, 'recipe_builder_draft_recipes', 'method_notes', 'TEXT');
  ensureColumn(db, 'recipe_builder_draft_recipes', 'review_priority', "TEXT NOT NULL DEFAULT 'normal' CHECK(review_priority IN ('low', 'normal', 'high'))");
  ensureColumn(db, 'recipe_builder_draft_recipes', 'ready_for_review_flag', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'recipe_builder_draft_recipes', 'approved_by', 'TEXT');
  ensureColumn(db, 'recipe_builder_draft_recipes', 'approved_at', 'TEXT');
  ensureColumn(db, 'recipe_builder_draft_recipes', 'rejected_by', 'TEXT');
  ensureColumn(db, 'recipe_builder_draft_recipes', 'rejected_at', 'TEXT');
  ensureColumn(db, 'recipe_builder_draft_recipes', 'rejection_reason', 'TEXT');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_recipe_builder_jobs_origin
      ON recipe_builder_jobs(origin, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_recipe_builder_jobs_confidence
      ON recipe_builder_jobs(confidence_level, confidence_score DESC);
    CREATE INDEX IF NOT EXISTS idx_recipe_builder_jobs_capture_session_id
      ON recipe_builder_jobs(capture_session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_recipe_builder_parsed_rows_estimated_flag
      ON recipe_builder_parsed_rows(recipe_builder_job_id, estimated_flag, line_index);
    CREATE INDEX IF NOT EXISTS idx_recipe_builder_parsed_rows_matched_recipe_id
      ON recipe_builder_parsed_rows(matched_recipe_id, matched_recipe_version_id);
    CREATE INDEX IF NOT EXISTS idx_recipe_builder_resolution_rows_recipe_mapping_status
      ON recipe_builder_resolution_rows(recipe_builder_job_id, recipe_mapping_status, review_status);
    CREATE INDEX IF NOT EXISTS idx_recipe_builder_resolution_rows_recipe_id
      ON recipe_builder_resolution_rows(recipe_id, recipe_version_id);
    CREATE INDEX IF NOT EXISTS idx_recipe_capture_sessions_venue_id
      ON recipe_capture_sessions(venue_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_recipe_capture_inputs_session_id
      ON recipe_capture_inputs(recipe_capture_session_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_recipe_capture_inputs_job_id
      ON recipe_capture_inputs(recipe_builder_job_id);
    CREATE INDEX IF NOT EXISTS idx_item_aliases_item_id
      ON item_aliases(item_id, active DESC, alias COLLATE NOCASE ASC);
    CREATE INDEX IF NOT EXISTS idx_item_aliases_normalized_alias
      ON item_aliases(normalized_alias, active DESC);
    CREATE INDEX IF NOT EXISTS idx_recipe_aliases_recipe_id
      ON recipe_aliases(recipe_id, active DESC, alias COLLATE NOCASE ASC);
    CREATE INDEX IF NOT EXISTS idx_recipe_aliases_normalized_alias
      ON recipe_aliases(normalized_alias, active DESC);
    CREATE INDEX IF NOT EXISTS idx_prep_sheet_captures_venue_date
      ON prep_sheet_captures(venue_id, capture_date DESC);
    CREATE INDEX IF NOT EXISTS idx_prep_sheet_captures_session_id
      ON prep_sheet_captures(recipe_capture_session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_recipe_inference_runs_venue_period
      ON recipe_inference_runs(venue_id, period_start DESC, period_end DESC);
    CREATE INDEX IF NOT EXISTS idx_recipe_inference_results_run_id
      ON recipe_inference_results(recipe_inference_run_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_recipe_inference_results_item_id
      ON recipe_inference_results(item_id, acknowledged);
    CREATE INDEX IF NOT EXISTS idx_recipe_inference_results_unacked
      ON recipe_inference_results(acknowledged, recipe_inference_run_id, created_at DESC);
  `);
}

function ensureColumn(
  db: Database.Database,
  tableName: string,
  columnName: string,
  columnDefinition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}
