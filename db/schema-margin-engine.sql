-- FIFOFlow margin engine schema draft
-- Planning artifact only. PostgreSQL-compatible.

create table margin_snapshots (
  id bigserial primary key,
  organization_id bigint not null references organizations(id),
  location_id bigint references locations(id),
  operation_unit_id bigint references operation_units(id),
  menu_item_id bigint references menu_items(id),
  recipe_id bigint references recipes(id),
  snapshot_type text not null,
  comparison_window_start timestamptz not null,
  comparison_window_end timestamptz not null,
  demand_authority text,
  theoretical_margin numeric(14,4),
  actual_margin numeric(14,4),
  margin_drift numeric(14,4),
  margin_pressure_score numeric(10,4),
  snapshot_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table margin_drivers (
  id bigserial primary key,
  margin_snapshot_id bigint not null references margin_snapshots(id) on delete cascade,
  driver_type text not null,
  driver_subject_type text,
  driver_subject_primary_key bigint,
  contribution_value numeric(14,4),
  contribution_pct numeric(10,4),
  explanation_text text not null,
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table margin_recommendations (
  id bigserial primary key,
  organization_id bigint not null references organizations(id),
  location_id bigint references locations(id),
  operation_unit_id bigint references operation_units(id),
  recommendation_type text not null,
  subject_type text not null,
  subject_primary_key bigint not null,
  urgency_label text not null default 'MONITOR',
  confidence_label text not null default 'Early signal',
  summary text not null,
  expected_margin_impact numeric(14,4),
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
