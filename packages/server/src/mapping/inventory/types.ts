import type { RecipeIngredientRecord } from '../../recipes/promotion/types.js';
import type { CanonicalIngredient } from '../ingredients/types.js';
import type { SubjectScopeContext } from '../../platform/policy/types.js';

export type CanonicalInventoryMappingScopeType = 'organization' | 'location' | 'operation_unit';

export type CanonicalInventoryMappingStatus =
  | 'UNMAPPED'
  | 'AUTO_MAPPED'
  | 'NEEDS_REVIEW'
  | 'MANUALLY_MAPPED'
  | 'REJECTED';

export type CanonicalInventoryMappingConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type CanonicalInventoryMatchReason =
  | 'exact_inventory_name'
  | 'normalized_inventory_name'
  | 'alias_based_match'
  | 'scoped_default'
  | 'manual_resolution'
  | 'ambiguous_inventory_match'
  | 'no_match';

export interface InventoryItemRecord {
  id: number | string;
  name: string;
  normalized_name: string;
  category: string;
  unit: string;
  venue_id: number | null;
}

export interface CanonicalIngredientWithAliases extends CanonicalIngredient {
  aliases: string[];
  normalized_aliases: string[];
}

export interface CanonicalInventoryMapping {
  id: number | string;
  canonical_ingredient_id: number | string;
  inventory_item_id: number | string | null;
  scope_type: CanonicalInventoryMappingScopeType;
  scope_ref_id: number | string | null;
  active: boolean;
  preferred_flag: boolean;
  mapping_status: CanonicalInventoryMappingStatus;
  confidence_label: CanonicalInventoryMappingConfidence | null;
  match_reason: CanonicalInventoryMatchReason | null;
  explanation_text: string | null;
  source_hash: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CanonicalInventoryMappingCandidate {
  id: number | string;
  canonical_inventory_mapping_id: number | string;
  candidate_inventory_item_id: number | string;
  candidate_inventory_name: string;
  confidence_label: CanonicalInventoryMappingConfidence;
  match_reason: CanonicalInventoryMatchReason;
  explanation_text: string;
  candidate_rank: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CanonicalInventoryMappingReviewEvent {
  id: number | string;
  canonical_inventory_mapping_id: number | string;
  action_type: string;
  actor_name: string | null;
  notes: string | null;
  created_at?: string;
}

export interface CanonicalInventoryResolutionResult {
  canonical_ingredient_id: number | string;
  inventory_item_id: number | string | null;
  inventory_item_name: string | null;
  inventory_item_unit: string | null;
  mapping_status: CanonicalInventoryMappingStatus;
  confidence_label: CanonicalInventoryMappingConfidence | null;
  match_reason: CanonicalInventoryMatchReason | null;
  explanation_text: string;
  matched_scope_type: CanonicalInventoryMappingScopeType | null;
  matched_scope_ref_id: number | string | null;
  preferred_flag: boolean;
  trusted: boolean;
}

export interface CanonicalInventoryMappingJobRequest {
  scope_type: CanonicalInventoryMappingScopeType;
  scope_ref_id: number | string;
  scope_context?: SubjectScopeContext;
  canonical_ingredient_ids?: Array<number | string>;
}

export interface CanonicalInventoryMappingJobSummary {
  ingredients_processed: number;
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

export interface CanonicalInventoryMappingJobResult {
  mappings: CanonicalInventoryMapping[];
  candidates: CanonicalInventoryMappingCandidate[];
  review_events: CanonicalInventoryMappingReviewEvent[];
  run_summary: CanonicalInventoryMappingJobSummary;
  notes: string[];
}

export interface RecipeCostabilityIngredientStatus {
  recipe_ingredient_id: number | string;
  canonical_ingredient_id: number | string;
  raw_ingredient_text: string;
  resolved_inventory_item_id: number | string | null;
  mapping_status: CanonicalInventoryMappingStatus;
  trusted: boolean;
  explanation_text: string;
}

export interface RecipeCostabilityReadinessResult {
  recipe_version_id: number | string;
  total_rows: number;
  costable_rows: number;
  unresolved_rows: number;
  costable_percent: number;
  status: 'COSTABLE_NOW' | 'OPERATIONAL_ONLY';
  ingredient_statuses: RecipeCostabilityIngredientStatus[];
}

export interface CanonicalInventoryReadRepository {
  listCanonicalIngredients(ids?: Array<number | string>): Promise<CanonicalIngredientWithAliases[]>;
  listInventoryItemsForScope(scopeType: CanonicalInventoryMappingScopeType, scopeRefId: number | string, context?: SubjectScopeContext): Promise<InventoryItemRecord[]>;
  getInventoryItemsByIds(ids: Array<number | string>): Promise<InventoryItemRecord[]>;
  listMappingsForCanonical(canonicalIngredientId: number | string): Promise<CanonicalInventoryMapping[]>;
  listRecipeIngredients(recipeVersionId: number | string): Promise<RecipeIngredientRecord[]>;
}

export interface CanonicalInventoryWriteRepository {
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
  getPreferredMapping(
    canonicalIngredientId: number | string,
    scopeType: CanonicalInventoryMappingScopeType,
    scopeRefId: number | string,
  ): Promise<CanonicalInventoryMapping | null>;
  upsertPreferredMapping(
    mapping: Omit<CanonicalInventoryMapping, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<{ action: 'created' | 'updated' | 'reused'; record: CanonicalInventoryMapping }>;
  replaceCandidates(
    mappingId: number | string,
    candidates: Array<Omit<CanonicalInventoryMappingCandidate, 'id' | 'canonical_inventory_mapping_id' | 'created_at' | 'updated_at'>>,
  ): Promise<{ records: CanonicalInventoryMappingCandidate[]; created: number; updated: number; retired: number }>;
  retireScopeMappings(
    scopeType: CanonicalInventoryMappingScopeType,
    scopeRefId: number | string,
    activeCanonicalIngredientIds: Set<string>,
  ): Promise<number>;
  recordReviewEvent(
    event: Omit<CanonicalInventoryMappingReviewEvent, 'id' | 'created_at'>,
  ): Promise<CanonicalInventoryMappingReviewEvent>;
}

export interface CanonicalInventoryRepository extends CanonicalInventoryReadRepository, CanonicalInventoryWriteRepository {}
