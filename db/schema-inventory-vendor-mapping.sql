-- FIFOFlow inventory item to vendor item mapping schema draft
-- Runtime SQLite implementation lives in packages/server/src/mapping/vendor/persistence/sqliteSchema.ts.

create table inventory_vendor_mappings (
  id bigserial primary key,
  inventory_item_id bigint not null references inventory_items(id),
  vendor_item_id bigint references vendor_items(id),
  scope_type text not null,
  scope_ref_id bigint,
  active boolean not null default true,
  preferred_flag boolean not null default true,
  mapping_status text not null,
  confidence_label text,
  match_reason text,
  explanation_text text,
  source_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz
);

create table inventory_vendor_mapping_candidates (
  id bigserial primary key,
  inventory_vendor_mapping_id bigint not null references inventory_vendor_mappings(id) on delete cascade,
  candidate_vendor_item_id bigint not null references vendor_items(id),
  candidate_vendor_name text,
  candidate_vendor_item_name text not null,
  confidence_label text not null,
  match_reason text not null,
  explanation_text text not null,
  candidate_rank integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table inventory_vendor_mapping_review_events (
  id bigserial primary key,
  inventory_vendor_mapping_id bigint not null references inventory_vendor_mappings(id) on delete cascade,
  action_type text not null,
  actor_name text,
  notes text,
  created_at timestamptz not null default now()
);

create table vendor_cost_lineage_records (
  id bigserial primary key,
  vendor_item_id bigint not null references vendor_items(id),
  normalized_unit_cost numeric(14,6),
  base_unit text,
  source_type text not null,
  source_ref_table text,
  source_ref_id text,
  effective_at timestamptz,
  stale_at timestamptz,
  confidence_label text,
  created_at timestamptz not null default now()
);
