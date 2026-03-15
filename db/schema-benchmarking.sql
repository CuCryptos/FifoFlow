-- FIFOFlow benchmarking and peer-group schema draft
-- Runtime SQLite bootstrap lives in
-- packages/server/src/platform/benchmarking/persistence/sqliteSchema.ts.

create table if not exists peer_groups (
  id integer primary key autoincrement,
  name text not null unique,
  peer_group_type text not null,
  description text,
  active integer not null default 1,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists peer_group_memberships (
  id integer primary key autoincrement,
  peer_group_id integer not null references peer_groups(id) on delete cascade,
  subject_type text not null,
  subject_id integer not null,
  active integer not null default 1,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists benchmark_definitions (
  id integer primary key autoincrement,
  benchmark_key text not null unique,
  display_name text not null,
  description text,
  active integer not null default 1,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists benchmark_scopes (
  id integer primary key autoincrement,
  benchmark_definition_id integer not null references benchmark_definitions(id) on delete cascade,
  scope_type text not null,
  scope_ref_id integer,
  scope_ref_key text,
  active integer not null default 1,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists benchmark_snapshots (
  id integer primary key autoincrement,
  benchmark_definition_id integer not null references benchmark_definitions(id) on delete cascade,
  scope_type text not null,
  scope_ref_id integer,
  scope_ref_key text,
  observed_at text not null,
  metric_payload text not null,
  created_at text not null default (datetime('now'))
);
