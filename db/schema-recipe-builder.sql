-- FIFOFlow recipe builder schema draft
-- Runtime SQLite bootstrap lives in
-- packages/server/src/recipes/builder/persistence/sqliteSchema.ts.

create table if not exists recipe_builder_jobs (
  id integer primary key autoincrement,
  source_type text not null check(source_type in ('freeform', 'template')),
  source_text text,
  source_template_id integer references recipe_templates(id),
  source_template_version_id integer references recipe_template_versions(id),
  draft_name text,
  status text not null check(status in ('PENDING', 'PARSED', 'ASSEMBLED', 'NEEDS_REVIEW', 'BLOCKED', 'CREATED', 'FAILED')),
  source_hash text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists recipe_builder_parsed_rows (
  id integer primary key autoincrement,
  recipe_builder_job_id integer not null references recipe_builder_jobs(id) on delete cascade,
  line_index integer not null,
  raw_line_text text not null,
  quantity_raw text,
  quantity_normalized real,
  unit_raw text,
  unit_normalized text,
  ingredient_text text,
  preparation_note text,
  parse_status text not null check(parse_status in ('PARSED', 'PARTIAL', 'NEEDS_REVIEW', 'FAILED')),
  parser_confidence text not null check(parser_confidence in ('HIGH', 'MEDIUM', 'LOW')),
  explanation_text text not null,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  unique(recipe_builder_job_id, line_index)
);

create table if not exists recipe_builder_resolution_rows (
  id integer primary key autoincrement,
  parsed_row_id integer not null references recipe_builder_parsed_rows(id) on delete cascade,
  recipe_builder_job_id integer not null references recipe_builder_jobs(id) on delete cascade,
  canonical_ingredient_id integer references canonical_ingredients(id),
  canonical_match_status text not null check(canonical_match_status in ('matched', 'no_match', 'ambiguous', 'skipped')),
  canonical_confidence text not null check(canonical_confidence in ('HIGH', 'MEDIUM', 'LOW')),
  canonical_match_reason text,
  inventory_item_id integer references items(id),
  inventory_mapping_status text not null check(inventory_mapping_status in ('UNMAPPED', 'MAPPED', 'NEEDS_REVIEW', 'SKIPPED')),
  quantity_normalization_status text not null check(quantity_normalization_status in ('NORMALIZED', 'PARTIAL', 'NEEDS_REVIEW', 'FAILED')),
  review_status text not null check(review_status in ('READY', 'NEEDS_REVIEW', 'BLOCKED', 'INCOMPLETE', 'CREATED')),
  explanation_text text not null,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  unique(parsed_row_id)
);

create table if not exists recipe_builder_draft_recipes (
  id integer primary key autoincrement,
  recipe_builder_job_id integer not null unique references recipe_builder_jobs(id) on delete cascade,
  draft_name text not null,
  yield_quantity real,
  yield_unit text,
  completeness_status text not null check(completeness_status in ('READY', 'NEEDS_REVIEW', 'BLOCKED', 'INCOMPLETE', 'CREATED')),
  costability_status text not null check(costability_status in ('COSTABLE', 'NEEDS_REVIEW', 'NOT_COSTABLE')),
  ingredient_row_count integer not null default 0,
  ready_row_count integer not null default 0,
  review_row_count integer not null default 0,
  blocked_row_count integer not null default 0,
  unresolved_canonical_count integer not null default 0,
  unresolved_inventory_count integer not null default 0,
  source_recipe_type text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists recipe_builder_review_events (
  id integer primary key autoincrement,
  recipe_builder_job_id integer not null references recipe_builder_jobs(id) on delete cascade,
  parsed_row_id integer references recipe_builder_parsed_rows(id) on delete cascade,
  action_type text not null,
  actor_name text,
  notes text,
  created_at text not null default (datetime('now'))
);
