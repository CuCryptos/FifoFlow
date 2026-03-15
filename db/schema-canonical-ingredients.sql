-- FIFOFlow canonical ingredient dictionary schema draft
-- Planning artifact only. Runtime SQLite implementation lives in
-- packages/server/src/mapping/ingredients/persistence/sqliteSchema.ts.

create table canonical_ingredients (
  id bigserial primary key,
  canonical_name text not null,
  normalized_canonical_name text not null,
  category text not null,
  base_unit text not null,
  perishable_flag boolean not null default false,
  active boolean not null default true,
  source_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_name),
  unique (normalized_canonical_name)
);

create index idx_canonical_ingredients_normalized_name
  on canonical_ingredients(normalized_canonical_name)
  where active = true;
create index idx_canonical_ingredients_category
  on canonical_ingredients(category)
  where active = true;

create table ingredient_aliases (
  id bigserial primary key,
  canonical_ingredient_id bigint not null references canonical_ingredients(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  alias_type text,
  active boolean not null default true,
  source_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_ingredient_id, alias)
);

create index idx_ingredient_aliases_normalized_alias
  on ingredient_aliases(normalized_alias)
  where active = true;
create index idx_ingredient_aliases_canonical_id
  on ingredient_aliases(canonical_ingredient_id)
  where active = true;

create table canonical_ingredient_sync_runs (
  id bigserial primary key,
  source_hash text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  status text not null default 'running',
  ingredients_inserted integer not null default 0,
  ingredients_updated integer not null default 0,
  ingredients_reused integer not null default 0,
  ingredients_retired integer not null default 0,
  aliases_inserted integer not null default 0,
  aliases_updated integer not null default 0,
  aliases_reused integer not null default 0,
  aliases_retired integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
