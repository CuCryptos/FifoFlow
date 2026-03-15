-- FIFOFlow scoped policy schema draft
-- Runtime SQLite bootstrap lives in
-- packages/server/src/platform/policy/persistence/sqliteSchema.ts.

create table if not exists policy_definitions (
  id integer primary key autoincrement,
  policy_key text not null unique,
  display_name text not null,
  description text,
  value_type text not null,
  active integer not null default 1,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists policy_versions (
  id integer primary key autoincrement,
  policy_definition_id integer not null references policy_definitions(id) on delete cascade,
  version_number integer not null,
  effective_start_at text not null,
  effective_end_at text,
  active integer not null default 1,
  created_at text not null default (datetime('now')),
  unique(policy_definition_id, version_number)
);

create table if not exists policy_scopes (
  id integer primary key autoincrement,
  policy_version_id integer not null references policy_versions(id) on delete cascade,
  scope_type text not null,
  scope_ref_id integer,
  scope_ref_key text,
  active integer not null default 1,
  created_at text not null default (datetime('now'))
);

create table if not exists policy_values (
  id integer primary key autoincrement,
  policy_scope_id integer not null references policy_scopes(id) on delete cascade,
  value_json text not null,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists policy_resolution_logs (
  id integer primary key autoincrement,
  policy_key text not null,
  effective_at text not null,
  subject_scope_json text not null,
  matched_scope_type text,
  matched_scope_ref_id integer,
  matched_scope_ref_key text,
  policy_version_id integer,
  explanation_text text not null,
  created_at text not null default (datetime('now'))
);
