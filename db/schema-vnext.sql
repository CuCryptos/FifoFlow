-- FIFOFlow vNext draft schema
-- Platform target: PostgreSQL-compatible
-- Status: planning artifact only, not production-ready DDL

create table organizations (
  id bigserial primary key,
  name text not null,
  code text unique,
  status text not null default 'active',
  timezone text not null default 'Pacific/Honolulu',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table locations (
  id bigserial primary key,
  organization_id bigint not null references organizations(id),
  name text not null,
  code text,
  location_type text not null default 'location',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table operation_units (
  id bigserial primary key,
  location_id bigint not null references locations(id),
  name text not null,
  code text,
  operation_unit_type text not null default 'kitchen',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table inventory_categories (
  id bigserial primary key,
  organization_id bigint not null references organizations(id),
  parent_category_id bigint references inventory_categories(id),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table storage_areas (
  id bigserial primary key,
  location_id bigint not null references locations(id),
  name text not null,
  area_type text not null default 'storage',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table inventory_items (
  id bigserial primary key,
  organization_id bigint not null references organizations(id),
  category_id bigint references inventory_categories(id),
  name text not null,
  display_name text,
  item_type text not null default 'inventory',
  base_unit text not null,
  default_pack_size_value numeric(14,4),
  default_pack_size_unit text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table vendors (
  id bigserial primary key,
  organization_id bigint not null references organizations(id),
  name text not null,
  vendor_code text,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table vendor_items (
  id bigserial primary key,
  vendor_id bigint not null references vendors(id),
  inventory_item_id bigint not null references inventory_items(id),
  vendor_item_name text,
  vendor_sku text,
  order_unit text,
  pack_qty numeric(14,4),
  pack_unit text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table vendor_price_history (
  id bigserial primary key,
  vendor_item_id bigint not null references vendor_items(id),
  effective_at timestamptz not null,
  unit_price numeric(14,4) not null,
  price_basis_unit text not null,
  source_type text not null,
  source_invoice_line_id bigint,
  confidence_label text not null default 'high',
  created_at timestamptz not null default now()
);

create table location_item_settings (
  id bigserial primary key,
  location_id bigint not null references locations(id),
  inventory_item_id bigint not null references inventory_items(id),
  preferred_vendor_id bigint references vendors(id),
  preferred_vendor_item_id bigint references vendor_items(id),
  reorder_level numeric(14,4),
  reorder_qty numeric(14,4),
  count_frequency text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, inventory_item_id)
);

create table item_storage_assignments (
  id bigserial primary key,
  storage_area_id bigint not null references storage_areas(id),
  inventory_item_id bigint not null references inventory_items(id),
  on_hand_qty numeric(14,4) not null default 0,
  par_qty numeric(14,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_area_id, inventory_item_id)
);

create table purchase_orders (
  id bigserial primary key,
  organization_id bigint not null references organizations(id),
  location_id bigint references locations(id),
  vendor_id bigint not null references vendors(id),
  status text not null default 'draft',
  ordered_at timestamptz,
  received_at timestamptz,
  notes text,
  total_estimated_cost numeric(14,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table purchase_order_lines (
  id bigserial primary key,
  purchase_order_id bigint not null references purchase_orders(id) on delete cascade,
  inventory_item_id bigint not null references inventory_items(id),
  vendor_item_id bigint references vendor_items(id),
  quantity_ordered numeric(14,4) not null,
  order_unit text not null,
  unit_price numeric(14,4),
  line_total numeric(14,4),
  created_at timestamptz not null default now()
);

create table invoices (
  id bigserial primary key,
  organization_id bigint not null references organizations(id),
  location_id bigint references locations(id),
  vendor_id bigint references vendors(id),
  invoice_number text,
  invoice_date date,
  received_date date,
  document_uri text,
  parse_status text not null default 'received',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invoice_lines (
  id bigserial primary key,
  invoice_id bigint not null references invoices(id) on delete cascade,
  raw_line_text text,
  inventory_item_id bigint references inventory_items(id),
  vendor_item_id bigint references vendor_items(id),
  quantity numeric(14,4),
  unit text,
  unit_price numeric(14,4),
  line_total numeric(14,4),
  match_confidence_label text not null default 'medium',
  created_at timestamptz not null default now()
);

create table recipes (
  id bigserial primary key,
  organization_id bigint not null references organizations(id),
  name text not null,
  recipe_type text not null default 'dish',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recipe_versions (
  id bigserial primary key,
  recipe_id bigint not null references recipes(id) on delete cascade,
  version_number integer not null,
  yield_qty numeric(14,4),
  yield_unit text,
  effective_from timestamptz,
  effective_to timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (recipe_id, version_number)
);

create table recipe_ingredients (
  id bigserial primary key,
  recipe_version_id bigint not null references recipe_versions(id) on delete cascade,
  inventory_item_id bigint not null references inventory_items(id),
  quantity numeric(14,4) not null,
  unit text not null,
  prep_loss_pct numeric(8,4),
  is_optional boolean not null default false,
  created_at timestamptz not null default now()
);

create table menu_items (
  id bigserial primary key,
  organization_id bigint not null references organizations(id),
  name text not null,
  menu_group text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table menu_item_recipe_mappings (
  id bigserial primary key,
  menu_item_id bigint not null references menu_items(id),
  recipe_version_id bigint not null references recipe_versions(id),
  portion_multiplier numeric(14,4) not null default 1,
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz not null default now()
);

create table location_menu_assignments (
  id bigserial primary key,
  location_id bigint not null references locations(id),
  operation_unit_id bigint references operation_units(id),
  menu_item_id bigint not null references menu_items(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table inventory_count_sessions (
  id bigserial primary key,
  location_id bigint not null references locations(id),
  storage_area_id bigint references storage_areas(id),
  name text not null,
  status text not null default 'open',
  counted_at timestamptz,
  closed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

create table inventory_count_lines (
  id bigserial primary key,
  inventory_count_session_id bigint not null references inventory_count_sessions(id) on delete cascade,
  inventory_item_id bigint not null references inventory_items(id),
  storage_area_id bigint references storage_areas(id),
  system_qty numeric(14,4),
  counted_qty numeric(14,4) not null,
  variance_qty numeric(14,4),
  notes text,
  created_at timestamptz not null default now()
);

create table waste_events (
  id bigserial primary key,
  location_id bigint not null references locations(id),
  operation_unit_id bigint references operation_units(id),
  inventory_item_id bigint not null references inventory_items(id),
  quantity numeric(14,4) not null,
  unit text not null,
  waste_reason_code text not null,
  notes text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table prep_batches (
  id bigserial primary key,
  location_id bigint not null references locations(id),
  operation_unit_id bigint references operation_units(id),
  recipe_version_id bigint not null references recipe_versions(id),
  batch_qty numeric(14,4),
  batch_unit text,
  yield_pct numeric(8,4),
  created_at timestamptz not null default now()
);

create table prep_consumptions (
  id bigserial primary key,
  prep_batch_id bigint not null references prep_batches(id) on delete cascade,
  inventory_item_id bigint not null references inventory_items(id),
  quantity numeric(14,4) not null,
  unit text not null,
  created_at timestamptz not null default now()
);

create table stock_transactions (
  id bigserial primary key,
  organization_id bigint not null references organizations(id),
  location_id bigint references locations(id),
  operation_unit_id bigint references operation_units(id),
  storage_area_id bigint references storage_areas(id),
  inventory_item_id bigint not null references inventory_items(id),
  transaction_type text not null,
  quantity numeric(14,4) not null,
  unit text not null,
  reason_code text not null,
  source_type text,
  source_id bigint,
  estimated_cost numeric(14,4),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table forecasts (
  id bigserial primary key,
  organization_id bigint not null references organizations(id),
  location_id bigint references locations(id),
  forecast_name text not null,
  source_type text not null default 'import',
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table forecast_lines (
  id bigserial primary key,
  forecast_id bigint not null references forecasts(id) on delete cascade,
  forecast_date date not null,
  menu_item_id bigint references menu_items(id),
  expected_qty numeric(14,4) not null,
  created_at timestamptz not null default now()
);

create table derived_signals (
  id bigserial primary key,
  signal_type text not null,
  subject_type text not null,
  subject_id bigint not null,
  location_id bigint references locations(id),
  observed_at timestamptz not null,
  window_start timestamptz,
  window_end timestamptz,
  signal_payload jsonb not null default '{}'::jsonb,
  confidence_label text not null default 'medium',
  created_at timestamptz not null default now()
);

create table pattern_observations (
  id bigserial primary key,
  pattern_type text not null,
  subject_type text not null,
  subject_id bigint not null,
  location_id bigint references locations(id),
  observation_count integer not null default 0,
  first_observed_at timestamptz,
  last_observed_at timestamptz,
  pattern_payload jsonb not null default '{}'::jsonb,
  confidence_label text not null default 'medium',
  created_at timestamptz not null default now()
);

create table recommendations (
  id bigserial primary key,
  recommendation_type text not null,
  subject_type text not null,
  subject_id bigint not null,
  location_id bigint references locations(id),
  status text not null default 'Suggested',
  confidence_label text not null default 'medium',
  summary text not null,
  action_payload jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table recommendation_evidence (
  id bigserial primary key,
  recommendation_id bigint not null references recommendations(id) on delete cascade,
  source_type text not null,
  source_table text not null,
  source_primary_key text not null,
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table standards (
  id bigserial primary key,
  organization_id bigint not null references organizations(id),
  standard_type text not null,
  subject_type text not null,
  subject_id bigint not null,
  status text not null default 'Suggested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table standard_versions (
  id bigserial primary key,
  standard_id bigint not null references standards(id) on delete cascade,
  version_number integer not null,
  lifecycle_state text not null default 'Suggested',
  effective_from timestamptz,
  effective_to timestamptz,
  standard_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (standard_id, version_number)
);

create table standard_scopes (
  id bigserial primary key,
  standard_version_id bigint not null references standard_versions(id) on delete cascade,
  scope_type text not null,
  scope_primary_key bigint not null,
  created_at timestamptz not null default now()
);

create table governance_actions (
  id bigserial primary key,
  action_type text not null,
  actor_id text,
  target_type text not null,
  target_id bigint not null,
  notes text,
  created_at timestamptz not null default now()
);

create table migration_runs (
  id bigserial primary key,
  run_name text not null,
  source_snapshot text not null,
  status text not null default 'planned',
  created_at timestamptz not null default now()
);

create table migration_lineage (
  id bigserial primary key,
  migration_run_id bigint not null references migration_runs(id),
  source_table text not null,
  source_primary_key text not null,
  target_table text not null,
  target_primary_key text not null,
  transform_type text not null,
  confidence_label text not null default 'high',
  notes text,
  created_at timestamptz not null default now()
);

create table review_queue_items (
  id bigserial primary key,
  queue_name text not null,
  source_table text not null,
  source_primary_key text not null,
  subject_type text,
  subject_id bigint,
  severity text not null default 'medium',
  status text not null default 'open',
  payload jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);
