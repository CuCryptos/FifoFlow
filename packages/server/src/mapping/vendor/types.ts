import type { SubjectScopeContext } from '../../platform/policy/types.js';
import type { InventoryItemRecord } from '../inventory/types.js';

export type InventoryVendorMappingScopeType = 'organization' | 'location' | 'operation_unit';

export type InventoryVendorMappingStatus =
  | 'UNMAPPED'
  | 'AUTO_MAPPED'
  | 'NEEDS_REVIEW'
  | 'MANUALLY_MAPPED'
  | 'REJECTED';

export type InventoryVendorMappingConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type InventoryVendorMatchReason =
  | 'exact_vendor_item_name'
  | 'normalized_vendor_item_name'
  | 'existing_vendor_price_link'
  | 'scoped_default'
  | 'manual_resolution'
  | 'ambiguous_vendor_match'
  | 'no_match';

export type VendorCostLineageSourceType =
  | 'invoice_linked_cost'
  | 'vendor_price_history'
  | 'fallback_cost_record'
  | 'missing';

export interface VendorItemRecord {
  id: number | string;
  inventory_item_id: number | string;
  inventory_item_name: string;
  vendor_id: number | string | null;
  vendor_name: string | null;
  vendor_item_name: string;
  normalized_vendor_item_name: string;
  order_unit: string | null;
  order_unit_price: number;
  qty_per_unit: number | null;
  base_unit: string;
  venue_id: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryVendorMapping {
  id: number | string;
  inventory_item_id: number | string;
  vendor_item_id: number | string | null;
  scope_type: InventoryVendorMappingScopeType;
  scope_ref_id: number | string | null;
  active: boolean;
  preferred_flag: boolean;
  mapping_status: InventoryVendorMappingStatus;
  confidence_label: InventoryVendorMappingConfidence | null;
  match_reason: InventoryVendorMatchReason | null;
  explanation_text: string | null;
  source_hash: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryVendorMappingCandidate {
  id: number | string;
  inventory_vendor_mapping_id: number | string;
  candidate_vendor_item_id: number | string;
  candidate_vendor_name: string | null;
  candidate_vendor_item_name: string;
  confidence_label: InventoryVendorMappingConfidence;
  match_reason: InventoryVendorMatchReason;
  explanation_text: string;
  candidate_rank: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryVendorMappingReviewEvent {
  id: number | string;
  inventory_vendor_mapping_id: number | string;
  action_type: string;
  actor_name: string | null;
  notes: string | null;
  created_at?: string;
}

export interface InventoryVendorResolutionResult {
  inventory_item_id: number | string;
  vendor_item_id: number | string | null;
  vendor_id: number | string | null;
  vendor_name: string | null;
  vendor_item_name: string | null;
  mapping_status: InventoryVendorMappingStatus;
  confidence_label: InventoryVendorMappingConfidence | null;
  match_reason: InventoryVendorMatchReason | null;
  explanation_text: string;
  matched_scope_type: InventoryVendorMappingScopeType | null;
  matched_scope_ref_id: number | string | null;
  preferred_flag: boolean;
  trusted: boolean;
}

export interface VendorCostLineageRecord {
  id: number | string;
  vendor_item_id: number | string;
  normalized_unit_cost: number | null;
  base_unit: string | null;
  source_type: VendorCostLineageSourceType;
  source_ref_table: string | null;
  source_ref_id: string | null;
  effective_at: string | null;
  stale_at: string | null;
  confidence_label: InventoryVendorMappingConfidence | null;
  created_at?: string;
}

export interface VendorCostLineageResult {
  inventory_item_id: number | string;
  vendor_item_id: number | string | null;
  vendor_id: number | string | null;
  vendor_name: string | null;
  vendor_item_name: string | null;
  normalized_unit_cost: number | null;
  base_unit: string | null;
  source_type: VendorCostLineageSourceType;
  source_ref_table: string | null;
  source_ref_id: string | null;
  effective_at: string | null;
  stale_at: string | null;
  stale: boolean;
  confidence_label: InventoryVendorMappingConfidence;
  explanation_text: string;
  mapping_resolution: InventoryVendorResolutionResult;
}

export interface InventoryVendorMappingJobRequest {
  scope_type: InventoryVendorMappingScopeType;
  scope_ref_id: number | string;
  scope_context?: SubjectScopeContext;
  inventory_item_ids?: Array<number | string>;
}

export interface InventoryVendorMappingJobSummary {
  inventory_items_processed: number;
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

export interface InventoryVendorMappingJobResult {
  mappings: InventoryVendorMapping[];
  candidates: InventoryVendorMappingCandidate[];
  review_events: InventoryVendorMappingReviewEvent[];
  run_summary: InventoryVendorMappingJobSummary;
  notes: string[];
}

export interface InventoryVendorReadRepository {
  listInventoryItems(ids?: Array<number | string>): Promise<InventoryItemRecord[]>;
  listInventoryItemsForScope(
    scopeType: InventoryVendorMappingScopeType,
    scopeRefId: number | string,
    context?: SubjectScopeContext,
  ): Promise<InventoryItemRecord[]>;
  listVendorItemsForInventoryItem(
    inventoryItemId: number | string,
    scopeType?: InventoryVendorMappingScopeType,
    scopeRefId?: number | string,
    context?: SubjectScopeContext,
  ): Promise<VendorItemRecord[]>;
  getVendorItemsByIds(ids: Array<number | string>): Promise<VendorItemRecord[]>;
  listCostLineageRecords(
    vendorItemId: number | string,
    effectiveAt?: string | null,
  ): Promise<VendorCostLineageRecord[]>;
  listMappingsForInventoryItem(inventoryItemId: number | string): Promise<InventoryVendorMapping[]>;
}

export interface InventoryVendorWriteRepository {
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
  getPreferredMapping(
    inventoryItemId: number | string,
    scopeType: InventoryVendorMappingScopeType,
    scopeRefId: number | string,
  ): Promise<InventoryVendorMapping | null>;
  upsertPreferredMapping(
    mapping: Omit<InventoryVendorMapping, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<{ action: 'created' | 'updated' | 'reused'; record: InventoryVendorMapping }>;
  replaceCandidates(
    mappingId: number | string,
    candidates: Array<Omit<InventoryVendorMappingCandidate, 'id' | 'inventory_vendor_mapping_id' | 'created_at' | 'updated_at'>>,
  ): Promise<{ records: InventoryVendorMappingCandidate[]; created: number; updated: number; retired: number }>;
  retireScopeMappings(
    scopeType: InventoryVendorMappingScopeType,
    scopeRefId: number | string,
    activeInventoryItemIds: Set<string>,
  ): Promise<number>;
  recordReviewEvent(
    event: Omit<InventoryVendorMappingReviewEvent, 'id' | 'created_at'>,
  ): Promise<InventoryVendorMappingReviewEvent>;
}

export interface InventoryVendorRepository extends InventoryVendorReadRepository, InventoryVendorWriteRepository {}
