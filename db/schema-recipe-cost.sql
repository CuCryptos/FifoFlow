-- FIFOFlow recipe cost schema draft
-- Planning artifact only. PostgreSQL-compatible.
-- Runtime SQLite implementation lives in packages/server/src/intelligence/recipeCost/persistence/sqliteSchema.ts.

create table recipe_cost_runs (
  id bigserial primary key,
  started_at timestamptz not null,
  completed_at timestamptz,
  snapshots_created integer not null default 0,
  snapshots_updated integer not null default 0,
  complete_snapshots integer not null default 0,
  partial_snapshots integer not null default 0,
  incomplete_snapshots integer not null default 0,
  status text not null default 'running',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recipe_cost_snapshots (
  id bigserial primary key,
  recipe_id bigint not null references recipes(id),
  recipe_version_id bigint,
  snapshot_at timestamptz not null,
  total_cost numeric(14,4),
  cost_per_yield numeric(14,4),
  cost_per_serving numeric(14,4),
  resolved_cost_subtotal numeric(14,4) not null default 0,
  completeness_status text not null,
  confidence_label text not null,
  missing_ingredient_count integer not null default 0,
  stale_ingredient_count integer not null default 0,
  ambiguous_ingredient_count integer not null default 0,
  unit_mismatch_count integer not null default 0,
  primary_driver_item_id bigint,
  primary_driver_cost numeric(14,4),
  source_run_id bigint references recipe_cost_runs(id),
  comparable_key text not null,
  created_at timestamptz not null default now(),
  unique (comparable_key)
);

create index idx_recipe_cost_snapshots_recipe_time
  on recipe_cost_snapshots(recipe_id, snapshot_at desc);
create index idx_recipe_cost_snapshots_recipe_version_time
  on recipe_cost_snapshots(recipe_id, recipe_version_id, snapshot_at desc);

create table recipe_ingredient_cost_components (
  id bigserial primary key,
  recipe_cost_snapshot_id bigint not null references recipe_cost_snapshots(id) on delete cascade,
  inventory_item_id bigint references inventory_items(id),
  ingredient_name text not null,
  quantity_base_unit numeric(14,4),
  base_unit text not null,
  resolved_unit_cost numeric(14,6),
  extended_cost numeric(14,4),
  resolution_status text not null,
  cost_source_type text,
  cost_source_ref text,
  stale_flag boolean not null default false,
  ambiguity_flag boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_recipe_ingredient_cost_components_snapshot
  on recipe_ingredient_cost_components(recipe_cost_snapshot_id);
create index idx_recipe_ingredient_cost_components_item_history
  on recipe_ingredient_cost_components(inventory_item_id, created_at desc);

create table ingredient_cost_resolution_log (
  id bigserial primary key,
  recipe_cost_snapshot_id bigint not null references recipe_cost_snapshots(id) on delete cascade,
  inventory_item_id bigint references inventory_items(id),
  resolution_status text not null,
  chosen_source_type text,
  chosen_source_ref text,
  candidate_count integer not null default 0,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_ingredient_cost_resolution_log_snapshot
  on ingredient_cost_resolution_log(recipe_cost_snapshot_id);
create index idx_ingredient_cost_resolution_log_item_history
  on ingredient_cost_resolution_log(inventory_item_id, created_at desc);

create table recipe_cost_overrides (
  id bigserial primary key,
  inventory_item_id bigint not null references inventory_items(id),
  normalized_unit_cost numeric(14,6) not null,
  base_unit text not null,
  scope_type text not null default 'inventory_item',
  scope_primary_key bigint not null,
  reason_text text,
  approved_by text,
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
