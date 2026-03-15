-- FIFOFlow canonical ingredient to inventory item mapping schema draft
-- Runtime SQLite bootstrap lives in
-- packages/server/src/mapping/inventory/persistence/sqliteSchema.ts.

create table if not exists canonical_inventory_mappings (
  id integer primary key autoincrement,
  canonical_ingredient_id integer not null references canonical_ingredients(id) on delete cascade,
  inventory_item_id integer references items(id),
  scope_type text not null,
  scope_ref_id integer,
  active integer not null default 1,
  preferred_flag integer not null default 1,
  mapping_status text not null,
  confidence_label text,
  match_reason text,
  explanation_text text,
  source_hash text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  resolved_by text,
  resolved_at text
);

create unique index if not exists idx_canonical_inventory_mapping_preferred
  on canonical_inventory_mappings(canonical_ingredient_id, scope_type, scope_ref_id)
  where active = 1 and preferred_flag = 1;

create unique index if not exists idx_canonical_inventory_mapping_item
  on canonical_inventory_mappings(canonical_ingredient_id, inventory_item_id, scope_type, scope_ref_id)
  where active = 1 and inventory_item_id is not null;

create table if not exists canonical_inventory_mapping_candidates (
  id integer primary key autoincrement,
  canonical_inventory_mapping_id integer not null references canonical_inventory_mappings(id) on delete cascade,
  candidate_inventory_item_id integer not null references items(id),
  candidate_inventory_name text not null,
  confidence_label text not null,
  match_reason text not null,
  explanation_text text not null,
  candidate_rank integer not null,
  active integer not null default 1,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  unique(canonical_inventory_mapping_id, candidate_inventory_item_id, match_reason)
);

create table if not exists canonical_inventory_mapping_review_events (
  id integer primary key autoincrement,
  canonical_inventory_mapping_id integer not null references canonical_inventory_mappings(id) on delete cascade,
  action_type text not null,
  actor_name text,
  notes text,
  created_at text not null default (datetime('now'))
);
