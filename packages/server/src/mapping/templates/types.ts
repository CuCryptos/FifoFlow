import type { CanonicalIngredientResolutionResult } from '../ingredients/types.js';

export type TemplateIngredientMappingStatus =
  | 'UNMAPPED'
  | 'AUTO_MAPPED'
  | 'NEEDS_REVIEW'
  | 'MANUALLY_MAPPED'
  | 'REJECTED';

export type TemplateIngredientMappingConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type TemplateIngredientMatchReason =
  | 'exact_canonical_name'
  | 'normalized_canonical_name'
  | 'exact_alias'
  | 'normalized_alias'
  | 'manual_resolution'
  | 'no_match'
  | 'ambiguous_match';

export interface TemplateIngredientSourceRow {
  template_id: number;
  template_name: string;
  template_category: string;
  template_version_id: number;
  template_version_number: number;
  template_version_source_hash: string;
  ingredient_name: string;
  normalized_ingredient_name: string;
  qty: number;
  unit: string;
  sort_order: number;
}

export interface TemplateIngredientMapping {
  id: number | string;
  template_id: number;
  template_version_id: number;
  template_ingredient_row_key: string;
  ingredient_name: string;
  normalized_ingredient_name: string;
  mapped_canonical_ingredient_id: number | string | null;
  mapping_status: TemplateIngredientMappingStatus;
  confidence_label: TemplateIngredientMappingConfidence | null;
  match_reason: TemplateIngredientMatchReason | null;
  chosen_candidate_id: number | string | null;
  explanation_text: string;
  source_hash: string;
  active: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TemplateIngredientMappingCandidate {
  id: number | string;
  template_ingredient_mapping_id: number | string;
  candidate_canonical_ingredient_id: number | string;
  candidate_canonical_name: string;
  confidence_label: TemplateIngredientMappingConfidence;
  match_reason: TemplateIngredientMatchReason;
  explanation_text: string;
  candidate_rank: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TemplateIngredientMappingReviewEvent {
  id: number | string;
  template_ingredient_mapping_id: number | string;
  action_type: string;
  actor_name: string | null;
  notes: string | null;
  created_at?: string;
}

export interface TemplateIngredientMappingSummary {
  rows_processed: number;
  mappings_created: number;
  mappings_updated: number;
  mappings_reused: number;
  mappings_retired: number;
  auto_mapped: number;
  needs_review: number;
  unmapped: number;
  manual_preserved: number;
  rejected_preserved: number;
  candidates_created: number;
  candidates_updated: number;
  candidates_retired: number;
}

export interface TemplateIngredientMappingExecutionResult {
  mappings: TemplateIngredientMapping[];
  candidates: TemplateIngredientMappingCandidate[];
  review_events: TemplateIngredientMappingReviewEvent[];
  run_summary: TemplateIngredientMappingSummary;
  notes: string[];
}

export interface TemplateIngredientMappingResolver {
  resolve(input: string): Promise<CanonicalIngredientResolutionResult>;
}

export interface TemplateIngredientMappingSource {
  listActiveTemplateIngredientRows(): Promise<TemplateIngredientSourceRow[]>;
}

export interface TemplateIngredientMappingRepository {
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
  getMappingByRowKey(rowKey: string): Promise<TemplateIngredientMapping | null>;
  upsertMapping(
    mapping: Omit<TemplateIngredientMapping, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<{ action: 'created' | 'updated' | 'reused'; record: TemplateIngredientMapping }>;
  replaceCandidates(
    mappingId: number | string,
    candidates: Array<Omit<TemplateIngredientMappingCandidate, 'id' | 'template_ingredient_mapping_id' | 'created_at' | 'updated_at'>>,
  ): Promise<{ records: TemplateIngredientMappingCandidate[]; created: number; updated: number; retired: number }>;
  retireMissingMappings(activeRowKeys: Set<string>): Promise<number>;
  recordReviewEvent?(
    event: Omit<TemplateIngredientMappingReviewEvent, 'id' | 'created_at'>,
  ): Promise<TemplateIngredientMappingReviewEvent>;
  listActiveMappingsByStatus?(status: TemplateIngredientMappingStatus): Promise<TemplateIngredientMapping[]>;
  listCandidatesForMapping?(mappingId: number | string): Promise<TemplateIngredientMappingCandidate[]>;
}

export interface TemplateIngredientMappingDependencies {
  source: TemplateIngredientMappingSource;
  repository: TemplateIngredientMappingRepository;
  resolver: TemplateIngredientMappingResolver;
}
