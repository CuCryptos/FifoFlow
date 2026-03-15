-- FIFOFlow intelligence schema draft
-- Planning artifact only. PostgreSQL-compatible.
-- Assumes canonical operational tables already exist.

create table derived_signals (
  id bigserial primary key,
  signal_type text not null,
  rule_version text not null,
  subject_type text not null,
  subject_id bigint not null,
  subject_key text,
  organization_id bigint references organizations(id),
  location_id bigint references locations(id),
  operation_unit_id bigint references operation_units(id),
  storage_area_id bigint references storage_areas(id),
  inventory_category_id bigint references inventory_categories(id),
  inventory_item_id bigint references inventory_items(id),
  recipe_id bigint references recipes(id),
  vendor_id bigint references vendors(id),
  vendor_item_id bigint references vendor_items(id),
  severity_label text not null default 'medium',
  confidence_label text not null default 'Early signal',
  confidence_score numeric(5,4),
  window_start timestamptz,
  window_end timestamptz,
  observed_at timestamptz not null,
  magnitude_value numeric(14,6),
  evidence_count integer not null default 0,
  signal_payload jsonb not null default '{}'::jsonb,
  last_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_derived_signals_subject on derived_signals (signal_type, subject_type, subject_id);
create index idx_derived_signals_scope on derived_signals (location_id, operation_unit_id, inventory_item_id, vendor_item_id);
create unique index idx_derived_signals_dedupe
  on derived_signals (signal_type, subject_key, window_start, window_end, magnitude_value);

create table pattern_observations (
  id bigserial primary key,
  pattern_type text not null,
  rule_version text not null,
  subject_type text not null,
  subject_id bigint not null,
  subject_key text,
  organization_id bigint references organizations(id),
  location_id bigint references locations(id),
  operation_unit_id bigint references operation_units(id),
  storage_area_id bigint references storage_areas(id),
  inventory_item_id bigint references inventory_items(id),
  recipe_id bigint references recipes(id),
  vendor_id bigint references vendors(id),
  vendor_item_id bigint references vendor_items(id),
  status text not null default 'Active',
  severity_label text not null default 'medium',
  confidence_label text not null default 'Early signal',
  confidence_score numeric(5,4),
  observation_count integer not null default 0,
  evidence_count integer not null default 0,
  first_observed_at timestamptz,
  last_observed_at timestamptz,
  pattern_payload jsonb not null default '{}'::jsonb,
  last_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pattern_observations_subject on pattern_observations (pattern_type, subject_type, subject_id, status);
create unique index idx_pattern_observations_active
  on pattern_observations (pattern_type, subject_key)
  where status in ('Active', 'Monitoring');

create table recommendations (
  id bigserial primary key,
  recommendation_type text not null,
  rule_version text not null,
  subject_type text not null,
  subject_id bigint not null,
  subject_key text,
  organization_id bigint references organizations(id),
  location_id bigint references locations(id),
  operation_unit_id bigint references operation_units(id),
  storage_area_id bigint references storage_areas(id),
  inventory_item_id bigint references inventory_items(id),
  recipe_id bigint references recipes(id),
  vendor_id bigint references vendors(id),
  vendor_item_id bigint references vendor_items(id),
  status text not null default 'OPEN',
  severity_label text not null default 'medium',
  confidence_label text not null default 'Early signal',
  urgency_label text not null default 'MONITOR',
  confidence_score numeric(5,4),
  summary text not null,
  evidence_count integer not null default 0,
  expected_benefit_payload jsonb not null default '{}'::jsonb,
  operator_action_payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  superseded_by_recommendation_id bigint references recommendations(id),
  opened_at timestamptz not null default now(),
  due_at timestamptz,
  closed_at timestamptz,
  last_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_recommendations_status_scope on recommendations (status, location_id, operation_unit_id, recommendation_type);
create unique index idx_recommendations_dedupe_active
  on recommendations (recommendation_type, subject_key)
  where subject_key is not null and status in ('OPEN', 'REVIEWED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_REVIEW', 'APPROVED');

create table intelligence_threshold_configs (
  id bigserial primary key,
  config_family text not null,
  scope_type text not null,
  category_name text,
  is_active boolean not null default true,
  config_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_intelligence_threshold_configs_family on intelligence_threshold_configs (config_family, scope_type, is_active);

create table recommendation_evidence (
  id bigserial primary key,
  recommendation_id bigint not null references recommendations(id) on delete cascade,
  evidence_type text not null,
  evidence_ref_table text not null,
  evidence_ref_id text not null,
  explanation_text text not null,
  evidence_weight numeric(8,4) not null default 1,
  created_at timestamptz not null default now()
);

create index idx_recommendation_evidence_rec on recommendation_evidence (recommendation_id);
create unique index idx_recommendation_evidence_dedupe
  on recommendation_evidence (recommendation_id, evidence_type, evidence_ref_table, evidence_ref_id, explanation_text, evidence_weight);

create table intelligence_runs (
  id bigserial primary key,
  job_type text not null,
  run_started_at timestamptz not null,
  run_completed_at timestamptz,
  signals_created integer not null default 0,
  signals_updated integer not null default 0,
  patterns_created integer not null default 0,
  patterns_updated integer not null default 0,
  recommendations_created integer not null default 0,
  recommendations_updated integer not null default 0,
  recommendations_superseded integer not null default 0,
  status text not null default 'running',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table standards (
  id bigserial primary key,
  standard_type text not null,
  subject_type text not null,
  subject_id bigint not null,
  organization_id bigint not null references organizations(id),
  status text not null default 'Suggested',
  source_recommendation_id bigint references recommendations(id),
  owner_role text,
  review_cadence_days integer,
  current_version_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table standard_versions (
  id bigserial primary key,
  standard_id bigint not null references standards(id) on delete cascade,
  version_number integer not null,
  lifecycle_state text not null default 'Suggested',
  rule_version text,
  standard_payload jsonb not null default '{}'::jsonb,
  effective_from timestamptz,
  effective_to timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (standard_id, version_number)
);

alter table standards
  add constraint standards_current_version_fk
  foreign key (current_version_id) references standard_versions(id);

create table standard_scopes (
  id bigserial primary key,
  standard_version_id bigint not null references standard_versions(id) on delete cascade,
  scope_type text not null,
  scope_primary_key bigint not null,
  inherited_from_scope_id bigint references standard_scopes(id),
  created_at timestamptz not null default now()
);

create table governance_actions (
  id bigserial primary key,
  action_type text not null,
  actor_id text,
  actor_role text,
  target_type text not null,
  target_id bigint not null,
  notes text,
  action_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table standards_effectiveness_reviews (
  id bigserial primary key,
  standard_version_id bigint not null references standard_versions(id) on delete cascade,
  review_status text not null default 'scheduled',
  review_window_start timestamptz,
  review_window_end timestamptz,
  baseline_payload jsonb not null default '{}'::jsonb,
  observed_payload jsonb not null default '{}'::jsonb,
  outcome_label text,
  reviewer_id text,
  reviewer_role text,
  notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
