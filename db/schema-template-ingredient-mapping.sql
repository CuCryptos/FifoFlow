-- FIFOFlow template ingredient mapping queue schema draft
-- Runtime SQLite bootstrap lives in
-- packages/server/src/mapping/templates/persistence/sqliteSchema.ts.

create table if not exists template_ingredient_mappings (
  id integer primary key autoincrement,
  template_id integer not null references recipe_templates(id) on delete cascade,
  template_version_id integer not null references recipe_template_versions(id) on delete cascade,
  template_ingredient_row_key text not null unique,
  ingredient_name text not null,
  normalized_ingredient_name text not null,
  mapped_canonical_ingredient_id integer references canonical_ingredients(id),
  mapping_status text not null check(mapping_status in ('UNMAPPED', 'AUTO_MAPPED', 'NEEDS_REVIEW', 'MANUALLY_MAPPED', 'REJECTED')),
  confidence_label text check(confidence_label in ('HIGH', 'MEDIUM', 'LOW')),
  match_reason text check(match_reason in (
    'exact_canonical_name',
    'normalized_canonical_name',
    'exact_alias',
    'normalized_alias',
    'manual_resolution',
    'no_match',
    'ambiguous_match'
  )),
  chosen_candidate_id integer,
  explanation_text text not null,
  source_hash text not null,
  active integer not null default 1,
  resolved_by text,
  resolved_at text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create index if not exists idx_template_ingredient_mappings_template_id
  on template_ingredient_mappings(template_id, template_version_id);
create index if not exists idx_template_ingredient_mappings_status
  on template_ingredient_mappings(mapping_status, active);
create index if not exists idx_template_ingredient_mappings_canonical
  on template_ingredient_mappings(mapped_canonical_ingredient_id, active);

create table if not exists template_ingredient_mapping_candidates (
  id integer primary key autoincrement,
  template_ingredient_mapping_id integer not null references template_ingredient_mappings(id) on delete cascade,
  candidate_canonical_ingredient_id integer not null references canonical_ingredients(id),
  candidate_canonical_name text not null,
  confidence_label text not null check(confidence_label in ('HIGH', 'MEDIUM', 'LOW')),
  match_reason text not null check(match_reason in (
    'exact_canonical_name',
    'normalized_canonical_name',
    'exact_alias',
    'normalized_alias',
    'manual_resolution',
    'no_match',
    'ambiguous_match'
  )),
  explanation_text text not null,
  candidate_rank integer not null,
  active integer not null default 1,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  unique(template_ingredient_mapping_id, candidate_canonical_ingredient_id, match_reason)
);

create index if not exists idx_template_mapping_candidates_mapping
  on template_ingredient_mapping_candidates(template_ingredient_mapping_id, active, candidate_rank);

create table if not exists template_ingredient_mapping_review_events (
  id integer primary key autoincrement,
  template_ingredient_mapping_id integer not null references template_ingredient_mappings(id) on delete cascade,
  action_type text not null,
  actor_name text,
  notes text,
  created_at text not null default (datetime('now'))
);

create index if not exists idx_template_mapping_review_events_mapping
  on template_ingredient_mapping_review_events(template_ingredient_mapping_id, created_at desc);
