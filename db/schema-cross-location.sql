-- FIFOFlow cross-location intelligence schema draft
-- Planning artifact only. PostgreSQL-compatible.

create table peer_group_definitions (
  id bigserial primary key,
  organization_id bigint not null references organizations(id),
  peer_group_name text not null,
  scope_type text not null,
  peer_group_type text not null,
  definition_payload jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table benchmark_observations (
  id bigserial primary key,
  peer_group_id bigint not null references peer_group_definitions(id),
  metric_name text not null,
  scope_type text not null,
  scope_primary_key bigint not null,
  comparison_window_start timestamptz not null,
  comparison_window_end timestamptz not null,
  observed_value numeric(14,4) not null,
  peer_median_value numeric(14,4),
  peer_p25_value numeric(14,4),
  peer_p75_value numeric(14,4),
  percentile_rank numeric(8,4),
  outlier_label text,
  evidence_quality_label text not null default 'medium',
  benchmark_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table best_practice_candidates (
  id bigserial primary key,
  peer_group_id bigint not null references peer_group_definitions(id),
  source_scope_type text not null,
  source_scope_primary_key bigint not null,
  practice_type text not null,
  confidence_label text not null default 'Early signal',
  supporting_window_start timestamptz,
  supporting_window_end timestamptz,
  evidence_payload jsonb not null default '{}'::jsonb,
  status text not null default 'candidate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cross_location_recommendations (
  id bigserial primary key,
  recommendation_type text not null,
  organization_id bigint not null references organizations(id),
  peer_group_id bigint references peer_group_definitions(id),
  source_scope_type text,
  source_scope_primary_key bigint,
  target_scope_type text not null,
  target_scope_primary_key bigint not null,
  status text not null default 'OPEN',
  urgency_label text not null default 'MONITOR',
  confidence_label text not null default 'Early signal',
  summary text not null,
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
