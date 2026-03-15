import type {
  EvidenceReference,
  IngredientCostResolution,
  RecipeCostRunRecord,
  RecipeCostSnapshotComparison,
  RecipeCostRunSummary,
  RecipeCostSnapshot,
  RecipeCostConfidenceLabel,
  RecipeCostSourceType,
  RecipeIngredientCostComponent,
  RecipeType,
  Unit,
} from '@fifoflow/shared';
import type { IntelligenceJobContext } from '../types.js';
import type { SubjectScopeContext } from '../../platform/policy/types.js';
import type {
  CanonicalInventoryMappingConfidence,
  CanonicalInventoryMappingScopeType,
  CanonicalInventoryMappingStatus,
  CanonicalInventoryMatchReason,
  CanonicalInventoryReadRepository,
} from '../../mapping/inventory/types.js';
import type {
  InventoryVendorMappingConfidence,
  InventoryVendorMappingScopeType,
  InventoryVendorMappingStatus,
  InventoryVendorMatchReason,
  InventoryVendorReadRepository,
  VendorCostLineageSourceType,
} from '../../mapping/vendor/types.js';

export interface RecipeCostPackagingContext {
  baseUnit: Unit | string;
  orderUnit?: Unit | null;
  innerUnit?: Unit | null;
  qtyPerUnit?: number | null;
  itemSizeValue?: number | null;
  itemSizeUnit?: Unit | null;
}

// RecipeIngredientDefinition is recipe-side operational composition input.
// Do not collapse it with vendor-item identity. Supplier evidence should be resolved later.
export interface RecipeIngredientDefinition {
  recipe_item_id: number | string;
  line_index?: number | null;
  raw_ingredient_text?: string | null;
  canonical_ingredient_id?: number | string | null;
  canonical_ingredient_name?: string | null;
  inventory_item_id: number | null;
  inventory_item_name: string;
  quantity: number;
  unit: Unit | string;
  base_unit: Unit | string;
  costability_status?: RecipeCostSourceRowStatus;
  inventory_mapping_resolution?: ResolvedInventoryMappingResult | null;
  vendor_mapping_resolution?: ResolvedVendorMappingResult | null;
  vendor_cost_lineage?: ResolvedVendorCostLineageResult | null;
  packaging?: RecipeCostPackagingContext;
}

export interface RecipeDefinition {
  recipe_id: number;
  recipe_version_id?: number | null;
  recipe_name: string;
  recipe_type: RecipeType;
  yield_qty: number | null;
  yield_unit: Unit | string | null;
  serving_count: number | null;
  ingredients: RecipeIngredientDefinition[];
}

// IngredientCostCandidate carries cost evidence derived from supplier or prior trusted sources.
// It must preserve the path from canonical meaning to operational item to supplier source.
export interface IngredientCostCandidate {
  inventory_item_id: number;
  inventory_item_name: string;
  canonical_ingredient_id?: number | string | null;
  canonical_ingredient_ids?: Array<number | string>;
  vendor_item_id?: number | string | null;
  vendor_item_name?: string | null;
  source_type: RecipeCostSourceType;
  normalized_unit_cost: number;
  base_unit: Unit | string;
  normalized_cost_base_unit?: Unit | string;
  observed_at: string | null;
  source_ref_table: string;
  source_ref_id: string;
  stale_flag?: boolean;
  confidence_label?: RecipeCostConfidenceLabel;
  inventory_scope_explanation?: string | null;
  vendor_scope_explanation?: string | null;
  vendor_id?: number | null;
  vendor_name?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  evidence?: EvidenceReference[];
}

export interface RecipeCostSource {
  listRecipeDefinitions(context: IntelligenceJobContext): Promise<RecipeDefinition[]>;
  listIngredientCostCandidates(context: IntelligenceJobContext): Promise<IngredientCostCandidate[]>;
}

export interface PromotedRecipeSourceRow {
  recipe_item_id: number | string;
  recipe_version_id: number | string;
  line_index: number;
  raw_ingredient_text: string;
  canonical_ingredient_id: number | string | null;
  quantity_normalized: number;
  unit_normalized: Unit | string;
  preparation_note: string | null;
  existing_inventory_item_id: number | string | null;
}

export interface PromotedRecipeSourceRecord {
  recipe_id: number;
  recipe_version_id: number | string;
  recipe_name: string;
  recipe_type: RecipeType;
  yield_qty: number | null;
  yield_unit: Unit | string | null;
  serving_count: number | null;
  source_builder_job_id?: number | string | null;
  source_builder_draft_recipe_id?: number | string | null;
  source_template_id?: number | string | null;
  source_template_version_id?: number | string | null;
}

export type RecipeCostSourceRowStatus =
  | 'RESOLVED_FOR_COSTING'
  | 'MISSING_CANONICAL_INGREDIENT'
  | 'MISSING_SCOPED_INVENTORY_MAPPING'
  | 'MISSING_SCOPED_VENDOR_MAPPING'
  | 'MISSING_VENDOR_COST_LINEAGE';

export interface ResolvedInventoryMappingResult {
  canonical_ingredient_id: number | string | null;
  inventory_item_id: number | null;
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

export interface ResolvedVendorMappingResult {
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

export interface ResolvedVendorCostLineageResult {
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
  vendor_mapping_resolution: ResolvedVendorMappingResult;
}

export interface RecipeCostSourceRow {
  recipe_item_id: number | string;
  line_index: number | null;
  raw_ingredient_text: string;
  canonical_ingredient_id: number | string | null;
  canonical_ingredient_name: string | null;
  inventory_item_id: number | null;
  inventory_item_name: string;
  quantity: number;
  unit: Unit | string;
  base_unit: Unit | string;
  preparation_note: string | null;
  costability_status: RecipeCostSourceRowStatus;
  resolution_explanation: string;
  inventory_mapping_resolution: ResolvedInventoryMappingResult | null;
  vendor_mapping_resolution: ResolvedVendorMappingResult | null;
  vendor_cost_lineage: ResolvedVendorCostLineageResult | null;
}

export type RecipeCostabilityClassification = 'COSTABLE_NOW' | 'OPERATIONAL_ONLY' | 'BLOCKED_FOR_COSTING';

export interface RecipeCostabilityBlockingReason {
  code:
    | 'MISSING_CANONICAL_INGREDIENT'
    | 'MISSING_SCOPED_INVENTORY_MAPPING'
    | 'MISSING_SCOPED_VENDOR_MAPPING'
    | 'MISSING_VENDOR_COST_LINEAGE';
  recipe_item_id: number | string;
  line_index: number | null;
  message: string;
}

export interface RecipeCostabilitySummary {
  recipe_id: number;
  recipe_version_id: number | string;
  total_rows: number;
  resolved_rows: number;
  unresolved_rows: number;
  costable_percent: number;
  classification: RecipeCostabilityClassification;
  blocking_reasons: RecipeCostabilityBlockingReason[];
}

export interface RecipeCostBridgedRecipeDefinition {
  recipe: RecipeDefinition;
  source_rows: RecipeCostSourceRow[];
  costability_summary: RecipeCostabilitySummary;
}

export interface RecipeCostOperationalReadRepository {
  listPromotedRecipes(context: IntelligenceJobContext): Promise<PromotedRecipeSourceRecord[]>;
  listPromotedRecipeIngredients(recipeVersionId: number | string): Promise<PromotedRecipeSourceRow[]>;
  getCanonicalIngredientName(canonicalIngredientId: number | string): Promise<string | null>;
}

export interface RecipeCostInventoryResolutionDependencies {
  operationalRepository: RecipeCostOperationalReadRepository;
  inventoryRepository: CanonicalInventoryReadRepository;
  vendorRepository: InventoryVendorReadRepository;
}

export interface RecipeCostSourceBridgeDependencies {
  operationalRepository: RecipeCostOperationalReadRepository;
  inventoryRepository: CanonicalInventoryReadRepository;
  vendorRepository: InventoryVendorReadRepository;
  candidateSource?: Pick<RecipeCostSource, 'listIngredientCostCandidates'>;
}

export interface RecipeCostThresholds {
  invoice_recent_max_age_days: number;
  vendor_price_history_max_age_days: number;
  last_trusted_snapshot_max_age_days: number;
  manual_override_max_age_days: number;
  driver_count: number;
}

export type RecipeCostUpsertAction = 'created' | 'updated';

export interface RecipeCostUpsertResult<T> {
  action: RecipeCostUpsertAction;
  record: T;
}

export interface RecipeCostPersistenceRepository {
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
  startRun?(startedAt: string): Promise<RecipeCostRunRecord>;
  completeRun?(
    runId: number | string,
    status: RecipeCostRunRecord['status'],
    summary: RecipeCostRunSummary,
    completedAt: string,
    notes?: string | null,
  ): Promise<RecipeCostRunRecord>;
  upsertSnapshot(snapshot: RecipeCostSnapshot): Promise<RecipeCostUpsertResult<RecipeCostSnapshot>>;
  upsertIngredientResolution(
    resolution: IngredientCostResolution,
  ): Promise<RecipeCostUpsertResult<IngredientCostResolution>>;
  upsertIngredientComponent(
    component: RecipeIngredientCostComponent,
  ): Promise<RecipeCostUpsertResult<RecipeIngredientCostComponent>>;
  replaceSnapshotResolutions(
    recipeCostSnapshotId: number | string,
    resolutions: IngredientCostResolution[],
  ): Promise<IngredientCostResolution[]>;
  replaceSnapshotComponents(
    recipeCostSnapshotId: number | string,
    components: RecipeIngredientCostComponent[],
  ): Promise<RecipeIngredientCostComponent[]>;
  getLatestTrustedSnapshot(recipeId: number, recipeVersionId?: number | null): Promise<RecipeCostSnapshot | null>;
  getLatestComparableSnapshot(recipeId: number, recipeVersionId?: number | null): Promise<RecipeCostSnapshot | null>;
  listTrustedSnapshotsInWindow(windowStart: string, windowEnd: string): Promise<RecipeCostSnapshot[]>;
  getPreviousComparableSnapshot(
    recipeId: number,
    beforeDate: string,
    recipeVersionId?: number | null,
  ): Promise<RecipeCostSnapshot | null>;
  getIngredientComponentHistory(
    recipeId: number,
    inventoryItemId: number,
    limit?: number,
  ): Promise<RecipeIngredientCostComponent[]>;
  buildComparableSnapshotComparison(
    snapshot: RecipeCostSnapshot,
    recipeVersionId?: number | null,
  ): Promise<RecipeCostSnapshotComparison>;
}

export interface RecipeCostExecutionResult {
  snapshots: RecipeCostSnapshot[];
  resolutions: IngredientCostResolution[];
  components: RecipeIngredientCostComponent[];
  comparisons?: RecipeCostSnapshotComparison[];
  run_summary: RecipeCostRunSummary;
  run?: RecipeCostRunRecord;
  notes: string[];
}

export interface RecipeCostJobRecipeResult {
  recipe_id: number;
  recipe_version_id: number | string;
  costability_classification: RecipeCostabilityClassification;
  total_rows: number;
  resolved_rows: number;
  unresolved_rows: number;
  costable_percent: number;
  blocking_reasons: RecipeCostabilityBlockingReason[];
  snapshot_persisted: boolean;
  snapshot_id: number | string | null;
  snapshot_completeness_status: RecipeCostSnapshot['completeness_status'] | null;
  snapshot_confidence_label: RecipeCostSnapshot['confidence_label'] | null;
}
