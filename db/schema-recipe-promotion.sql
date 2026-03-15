-- FIFOFlow draft-to-operational recipe promotion schema draft
-- Runtime SQLite bootstrap lives in
-- packages/server/src/recipes/promotion/persistence/sqliteSchema.ts.

create table if not exists recipe_versions (
  id integer primary key autoincrement,
  recipe_id integer not null references recipes(id) on delete cascade,
  version_number integer not null,
  status text not null default 'active',
  yield_quantity real,
  yield_unit text,
  source_builder_job_id integer references recipe_builder_jobs(id),
  source_builder_draft_recipe_id integer references recipe_builder_draft_recipes(id),
  source_template_id integer references recipe_templates(id),
  source_template_version_id integer references recipe_template_versions(id),
  source_text_snapshot text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  unique(recipe_id, version_number)
);

create table if not exists recipe_ingredients (
  id integer primary key autoincrement,
  recipe_version_id integer not null references recipe_versions(id) on delete cascade,
  line_index integer not null,
  source_parsed_row_id integer references recipe_builder_parsed_rows(id),
  source_resolution_row_id integer references recipe_builder_resolution_rows(id),
  raw_ingredient_text text not null,
  canonical_ingredient_id integer not null references canonical_ingredients(id),
  inventory_item_id integer references items(id),
  quantity_normalized real not null,
  unit_normalized text not null,
  preparation_note text,
  created_at text not null default (datetime('now')),
  unique(recipe_version_id, line_index)
);

create table if not exists recipe_promotion_events (
  id integer primary key autoincrement,
  recipe_builder_job_id integer not null references recipe_builder_jobs(id),
  recipe_builder_draft_recipe_id integer not null references recipe_builder_draft_recipes(id),
  action_type text not null,
  status text not null,
  promoted_recipe_id integer references recipes(id),
  promoted_recipe_version_id integer references recipe_versions(id),
  notes text,
  created_by text,
  created_at text not null default (datetime('now'))
);

create table if not exists recipe_builder_promotion_links (
  id integer primary key autoincrement,
  recipe_builder_draft_recipe_id integer not null references recipe_builder_draft_recipes(id),
  recipe_id integer not null references recipes(id),
  recipe_version_id integer not null references recipe_versions(id),
  active integer not null default 1,
  created_at text not null default (datetime('now')),
  unique(recipe_builder_draft_recipe_id, active)
);
