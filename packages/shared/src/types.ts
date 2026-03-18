import type { CATEGORIES, UNITS, TRANSACTION_TYPES, TRANSACTION_REASONS } from './constants.js';

export type Category = (typeof CATEGORIES)[number];
export type Unit = (typeof UNITS)[number];
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type TransactionReason = (typeof TRANSACTION_REASONS)[number];
export type CountSessionStatus = 'open' | 'closed';

// Item is the operational stock identity the kitchen counts and moves.
// It is not the canonical ingredient meaning and it is not a vendor SKU.
export interface Item {
  id: number;
  name: string;
  category: Category;
  unit: Unit;
  current_qty: number;
  order_unit: Unit | null;
  order_unit_price: number | null;
  qty_per_unit: number | null;
  inner_unit: Unit | null;
  item_size_value: number | null;
  item_size_unit: Unit | null;
  item_size: string | null;
  reorder_level: number | null;
  reorder_qty: number | null;
  vendor_id: number | null;
  venue_id: number | null;
  storage_area_id: number | null;
  sale_price: number | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  item_id: number;
  type: TransactionType;
  quantity: number;
  reason: TransactionReason;
  notes: string | null;
  from_area_id: number | null;
  to_area_id: number | null;
  estimated_cost: number | null;
  vendor_price_id: number | null;
  created_at: string;
}

export interface TransactionWithItem extends Transaction {
  item_name: string;
  item_unit: string;
}

export interface DashboardStats {
  total_items: number;
  low_stock_count: number;
  out_of_stock_count: number;
  today_transaction_count: number;
  total_inventory_value: number;
}

export interface ReorderSuggestion {
  item_id: number;
  item_name: string;
  current_qty: number;
  reorder_level: number;
  reorder_qty: number | null;
  shortage_qty: number;
  suggested_qty: number;
  base_unit: Unit;
  order_unit: Unit | null;
  estimated_order_units: number | null;
  order_unit_price: number | null;
  estimated_total_cost: number | null;
}

export interface ItemCountAdjustmentResult {
  item: Item;
  transaction: Transaction | null;
  delta: number;
}

export interface CountSession {
  id: number;
  name: string;
  status: CountSessionStatus;
  template_category: Category | null;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
}

export interface CountSessionSummary extends CountSession {
  entries_count: number;
  total_variance: number;
  template_items_count: number;
  counted_items_count: number;
  remaining_items_count: number;
}

export interface CountSessionEntry {
  id: number;
  session_id: number;
  item_id: number;
  item_name: string;
  item_unit: Unit;
  previous_qty: number;
  counted_qty: number;
  delta: number;
  notes: string | null;
  created_at: string;
}

export interface CountSessionChecklistItem {
  item_id: number;
  item_name: string;
  item_unit: Unit;
  current_qty: number;
  counted: boolean;
  count_entry_id: number | null;
  counted_qty: number | null;
  delta: number | null;
  counted_at: string | null;
}

export interface ReconciliationResult {
  item_id: number;
  item_name: string;
  cached_qty: number;
  computed_qty: number;
  difference: number;
}

export interface StorageArea {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ItemStorage {
  item_id: number;
  area_id: number;
  area_name: string;
  quantity: number;
}

export interface Venue {
  id: number;
  name: string;
  sort_order: number;
  show_in_menus: number;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: number;
  name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// VendorPrice is supplier-side purchasable pricing attached to an inventory item path.
// It must not be treated as recipe semantics or canonical ingredient identity.
export interface VendorPrice {
  id: number;
  item_id: number;
  vendor_id: number;
  vendor_name?: string;
  vendor_item_name: string | null;
  order_unit: Unit | null;
  order_unit_price: number;
  qty_per_unit: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type OrderStatus = 'draft' | 'sent';

export interface Order {
  id: number;
  vendor_id: number;
  status: OrderStatus;
  notes: string | null;
  total_estimated_cost: number;
  created_at: string;
  updated_at: string;
}

export interface OrderWithVendor extends Order {
  vendor_name: string;
  item_count: number;
}

export interface OrderItem {
  id: number;
  order_id: number;
  item_id: number;
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
}

export interface OrderDetail extends Order {
  vendor_name: string;
  items: OrderItem[];
}

export interface UsageRow {
  period: string;
  item_name: string;
  category: string;
  in_qty: number;
  out_qty: number;
  tx_count: number;
}

export interface UsageReport {
  rows: UsageRow[];
  totals: { in_qty: number; out_qty: number; tx_count: number };
}

export interface WasteRow {
  item_name: string;
  category: string;
  quantity: number;
  estimated_cost: number;
}

export interface WasteReport {
  rows: WasteRow[];
  totals: { quantity: number; estimated_cost: number };
}

export interface CostRow {
  group_name: string;
  in_cost: number;
  out_cost: number;
  net_cost: number;
  tx_count: number;
}

export interface CostReport {
  rows: CostRow[];
  totals: { in_cost: number; out_cost: number; net_cost: number };
}

export interface MergeItemsResult {
  target_item: Item;
  merged_count: number;
  transactions_moved: number;
  vendor_prices_created: number;
  storage_consolidated: number;
}

export type RecipeType = 'dish' | 'prep';

export interface Recipe {
  id: number;
  name: string;
  type: RecipeType;
  notes: string | null;
  yield_quantity: number | null;
  yield_unit: Unit | null;
  serving_quantity: number | null;
  serving_unit: Unit | null;
  serving_count: number | null;
  created_at: string;
  updated_at: string;
}

// RecipeItem is current operational recipe composition against stocked items.
// Long-term semantic meaning should still be recoverable through canonical ingredient mapping.
export interface RecipeItem {
  id: number;
  recipe_id: number;
  item_id: number;
  item_name: string;
  item_unit: Unit;
  quantity: number;
  unit: string;
  unit_cost: number | null;
  line_cost: number | null;
}

export interface RecipeWithCost extends Recipe {
  total_cost: number | null;
  cost_per_serving: number | null;
  item_count: number;
}

export interface RecipeDetail extends Recipe {
  items: RecipeItem[];
  total_cost: number | null;
  cost_per_serving: number | null;
}

export type RecipeBuilderSourceType = 'freeform' | 'template';
export type RecipeBuilderJobStatus = 'PENDING' | 'PARSED' | 'ASSEMBLED' | 'NEEDS_REVIEW' | 'BLOCKED' | 'CREATED' | 'FAILED';
export type RecipeBuilderParseStatus = 'PARSED' | 'PARTIAL' | 'NEEDS_REVIEW' | 'FAILED';
export type RecipeBuilderConfidenceLabel = 'HIGH' | 'MEDIUM' | 'LOW';
export type RecipeBuilderReviewStatus = 'READY' | 'NEEDS_REVIEW' | 'BLOCKED' | 'INCOMPLETE' | 'CREATED';
export type RecipeBuilderCostabilityStatus = 'COSTABLE' | 'NEEDS_REVIEW' | 'NOT_COSTABLE';

export interface RecipeBuilderJob {
  id: number | string;
  source_type: RecipeBuilderSourceType;
  source_text: string | null;
  source_template_id: number | null;
  source_template_version_id: number | null;
  draft_name: string | null;
  status: RecipeBuilderJobStatus;
  source_hash: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RecipeBuilderParsedRow {
  id: number | string;
  recipe_builder_job_id: number | string;
  line_index: number;
  raw_line_text: string;
  quantity_raw: string | null;
  quantity_normalized: number | null;
  unit_raw: string | null;
  unit_normalized: string | null;
  ingredient_text: string | null;
  preparation_note: string | null;
  parse_status: RecipeBuilderParseStatus;
  parser_confidence: RecipeBuilderConfidenceLabel;
  explanation_text: string;
  created_at?: string;
  updated_at?: string;
}

export interface RecipeBuilderResolutionRow {
  id: number | string;
  parsed_row_id: number | string;
  recipe_builder_job_id: number | string;
  canonical_ingredient_id: number | string | null;
  canonical_match_status: 'matched' | 'no_match' | 'ambiguous' | 'skipped';
  canonical_confidence: RecipeBuilderConfidenceLabel;
  canonical_match_reason: string | null;
  inventory_item_id: number | string | null;
  inventory_mapping_status: 'UNMAPPED' | 'MAPPED' | 'NEEDS_REVIEW' | 'SKIPPED';
  quantity_normalization_status: 'NORMALIZED' | 'PARTIAL' | 'NEEDS_REVIEW' | 'FAILED';
  review_status: RecipeBuilderReviewStatus;
  explanation_text: string;
  created_at?: string;
  updated_at?: string;
}

export interface RecipeBuilderDraftRecipe {
  id: number | string;
  recipe_builder_job_id: number | string;
  draft_name: string;
  yield_quantity: number | null;
  yield_unit: string | null;
  completeness_status: RecipeBuilderReviewStatus;
  costability_status: RecipeBuilderCostabilityStatus;
  ingredient_row_count: number;
  ready_row_count: number;
  review_row_count: number;
  blocked_row_count: number;
  unresolved_canonical_count: number;
  unresolved_inventory_count: number;
  source_recipe_type: RecipeType | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProductRecipe {
  id: number;
  venue_id: number;
  venue_name: string;
  recipe_id: number;
  recipe_name: string;
  recipe_type: RecipeType;
  portions_per_guest: number;
}

export interface IngredientSource {
  recipe_name: string;
  quantity_per_guest: number;
  guest_count: number;
  subtotal: number;
}

export interface CalculatedIngredient {
  item_id: number;
  item_name: string;
  item_unit: Unit;
  recipe_unit: string;
  total_needed: number;
  total_needed_order: number | null;
  current_qty: number;
  converted_stock: number | null;
  shortage: number;
  shortage_order: number | null;
  vendor_id: number | null;
  vendor_name: string | null;
  order_unit: Unit | null;
  order_unit_price: number | null;
  estimated_cost: number | null;
  sources: IngredientSource[];
}

export interface OrderCalculationResult {
  ingredients: CalculatedIngredient[];
  total_estimated_cost: number;
}

export interface InvoiceLine {
  vendor_item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  matched_item_id: number | null;
  matched_item_name: string | null;
  match_confidence: 'exact' | 'high' | 'low' | 'none';
  existing_vendor_price_id: number | null;
  suggested_matches?: Array<{
    item_id: number;
    item_name: string;
    match_confidence: 'high' | 'low';
    match_score: number;
    existing_vendor_price_id: number | null;
    matched_via: 'vendor_alias' | 'inventory_name';
  }>;
}

export interface InvoiceParseResult {
  vendor_id: number | null;
  vendor_name: string;
  detected_vendor_name: string | null;
  invoice_date: string | null;
  invoice_number: string | null;
  lines: InvoiceLine[];
  summary: {
    total_lines: number;
    matched: number;
    unmatched: number;
    total_amount: number;
  };
}

// ── Forecast Types ──────────────────────────────────────────

export interface ForecastProduct {
  product_name: string;
  group: string;
  counts: Record<string, number>;
}

export interface ForecastParseResult {
  date_range_label: string;
  dates: string[];
  products: ForecastProduct[];
}

export interface ForecastProductMapping {
  id: number;
  product_name: string;
  venue_id: number;
  venue_name: string;
  created_at: string;
  updated_at: string;
}

export interface Forecast {
  id: number;
  filename: string;
  date_range_start: string | null;
  date_range_end: string | null;
  raw_dates: string[];
  created_at: string;
}

export interface ForecastEntry {
  id: number;
  forecast_id: number;
  product_name: string;
  forecast_date: string;
  guest_count: number;
}

export interface ForecastWithEntries extends Forecast {
  entries: ForecastEntry[];
}

// Snack Bar Sales
export interface Sale {
  id: number;
  item_id: number;
  quantity: number;
  unit_qty: number;
  sale_price: number;
  total: number;
  created_at: string;
}

export interface SaleWithItem extends Sale {
  item_name: string;
  item_unit: string;
}

export interface SalesSummary {
  total_revenue: number;
  total_items_sold: number;
  sale_count: number;
  daily: Array<{ date: string; revenue: number; items_sold: number; sale_count: number }>;
  top_sellers: Array<{ item_id: number; item_name: string; quantity_sold: number; revenue: number }>;
  profit_margins: Array<{ item_id: number; item_name: string; sale_price: number; cost_price: number | null; margin: number | null }>;
}

export interface SalesFilters {
  start_date?: string;
  end_date?: string;
  item_id?: number;
}

export type ScopeType =
  | 'organization'
  | 'location'
  | 'operation_unit'
  | 'storage_area'
  | 'inventory_category'
  | 'inventory_item'
  | 'recipe'
  | 'vendor'
  | 'vendor_item'
  | 'menu_item';

export type SeverityLabel = 'low' | 'medium' | 'high' | 'critical';
export type ConfidenceLabel = 'Early signal' | 'Emerging pattern' | 'Stable pattern';
export type UrgencyLabel = 'IMMEDIATE' | 'THIS_WEEK' | 'MONITOR';
export type PatternStatus = 'Active' | 'Monitoring' | 'Resolved' | 'Retired';
export type RecommendationStatus =
  | 'OPEN'
  | 'ACTIVE'
  | 'REVIEWED'
  | 'DISMISSED'
  | 'ACKNOWLEDGED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'IMPLEMENTED'
  | 'SUPERSEDED'
  | 'EXPIRED';
export type StandardLifecycleState = 'Suggested' | 'Adopted' | 'Proven' | 'Default' | 'Retired';
export type GovernanceActionType =
  | 'RECOMMENDATION_APPROVED'
  | 'RECOMMENDATION_REJECTED'
  | 'STANDARD_ADOPTED'
  | 'STANDARD_PROMOTED'
  | 'STANDARD_RETIRED'
  | 'EFFECTIVENESS_REVIEW_RECORDED';

export type SignalType =
  | 'PRICE_INCREASE'
  | 'PRICE_DROP'
  | 'PRICE_VOLATILITY'
  | 'RECIPE_COST_DRIFT'
  | 'INGREDIENT_COST_DRIVER'
  | 'COUNT_VARIANCE'
  | 'COUNT_INCONSISTENCY'
  | 'WASTE_SPIKE'
  | 'UNMAPPED_PURCHASE'
  | 'UNMAPPED_RECIPE_INGREDIENT'
  | 'PURCHASE_TO_THEORETICAL_MISMATCH'
  | 'OVER_ORDER_PATTERN_CANDIDATE'
  | 'UNDER_ORDER_PATTERN_CANDIDATE'
  | 'YIELD_DRIFT';

export type RecommendationType =
  | 'REVIEW_VENDOR'
  | 'REVIEW_RECIPE_MARGIN'
  | 'ADD_RECIPE_MAPPING'
  | 'ADJUST_PAR'
  | 'ENFORCE_CYCLE_COUNT'
  | 'REQUIRE_CYCLE_COUNT'
  | 'INVESTIGATE_VARIANCE'
  | 'REQUIRE_WASTE_REASON'
  | 'REVIEW_RECIPE_COST'
  | 'REVIEW_COUNT_DISCIPLINE'
  | 'CLASSIFY_NON_RECIPE_USAGE'
  | 'ENFORCE_COUNT_DISCIPLINE';

export interface ScopeContext {
  scope_type: ScopeType;
  scope_id: number;
  parent_scope_type?: ScopeType | null;
  parent_scope_id?: number | null;
  label?: string | null;
}

export interface EvidenceReference {
  source_table: string;
  source_primary_key: string;
  source_type?: string | null;
  observed_at?: string | null;
  payload?: Record<string, unknown>;
}

export interface DerivedSignal {
  id: number | string;
  signal_type: SignalType;
  subject_type: ScopeType;
  subject_id: number;
  subject_key?: string | null;
  severity_label: SeverityLabel;
  confidence_label: ConfidenceLabel;
  confidence_score: number | null;
  rule_version: string;
  window_start: string | null;
  window_end: string | null;
  observed_at: string;
  organization_id: number | null;
  location_id: number | null;
  operation_unit_id: number | null;
  storage_area_id: number | null;
  inventory_category_id: number | null;
  inventory_item_id: number | null;
  recipe_id: number | null;
  vendor_id: number | null;
  vendor_item_id: number | null;
  magnitude_value?: number | null;
  evidence_count?: number;
  signal_payload: Record<string, unknown>;
  evidence: EvidenceReference[];
  last_confirmed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PatternObservation {
  id: number | string;
  pattern_type: string;
  rule_version?: string;
  subject_type: ScopeType;
  subject_id: number;
  subject_key?: string | null;
  status: PatternStatus;
  severity_label: SeverityLabel;
  confidence_label: ConfidenceLabel;
  confidence_score: number | null;
  observation_count: number;
  first_observed_at: string | null;
  last_observed_at: string | null;
  organization_id: number | null;
  location_id: number | null;
  operation_unit_id: number | null;
  storage_area_id: number | null;
  inventory_item_id: number | null;
  recipe_id: number | null;
  vendor_id: number | null;
  vendor_item_id: number | null;
  evidence_count?: number;
  signal_ids: Array<number | string>;
  pattern_payload: Record<string, unknown>;
  last_confirmed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RecommendationEvidence {
  id: number | string;
  recommendation_id: number | string;
  evidence_type: string;
  evidence_ref_table: string;
  evidence_ref_id: string;
  explanation_text: string;
  evidence_weight: number;
  created_at?: string;
}

export interface Recommendation {
  id: number | string;
  recommendation_type: RecommendationType;
  rule_version?: string;
  subject_type: ScopeType;
  subject_id: number;
  subject_key?: string | null;
  status: RecommendationStatus;
  severity_label: SeverityLabel;
  confidence_label: ConfidenceLabel;
  urgency_label: UrgencyLabel;
  confidence_score: number | null;
  summary: string;
  organization_id: number | null;
  location_id: number | null;
  operation_unit_id: number | null;
  storage_area_id: number | null;
  inventory_item_id: number | null;
  recipe_id: number | null;
  vendor_id: number | null;
  vendor_item_id: number | null;
  dedupe_key: string | null;
  superseded_by_recommendation_id: number | string | null;
  evidence_count?: number;
  expected_benefit_payload: Record<string, unknown>;
  operator_action_payload: Record<string, unknown>;
  evidence: RecommendationEvidence[];
  opened_at: string;
  due_at: string | null;
  closed_at: string | null;
  last_confirmed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface StandardScope {
  id: number | string;
  standard_version_id: number | string;
  scope_type: ScopeType;
  scope_primary_key: number;
  inherited_from_scope_id: number | string | null;
  created_at?: string;
}

export interface StandardVersion {
  id: number | string;
  standard_id: number | string;
  version_number: number;
  lifecycle_state: StandardLifecycleState;
  rule_version: string | null;
  standard_payload: Record<string, unknown>;
  effective_from: string | null;
  effective_to: string | null;
  approved_at: string | null;
  scopes: StandardScope[];
  created_at?: string;
}

export interface Standard {
  id: number | string;
  standard_type: string;
  subject_type: ScopeType;
  subject_id: number;
  organization_id: number;
  status: StandardLifecycleState;
  source_recommendation_id: number | string | null;
  owner_role: string | null;
  review_cadence_days: number | null;
  current_version_id: number | string | null;
  versions: StandardVersion[];
  created_at?: string;
  updated_at?: string;
}

export interface GovernanceAction {
  id: number | string;
  action_type: GovernanceActionType;
  actor_id: string | null;
  actor_role: string | null;
  target_type: string;
  target_id: number | string;
  notes: string | null;
  action_payload: Record<string, unknown>;
  created_at?: string;
}

export interface StandardEffectivenessReview {
  id: number | string;
  standard_version_id: number | string;
  review_status: 'scheduled' | 'completed' | 'skipped';
  review_window_start: string | null;
  review_window_end: string | null;
  baseline_payload: Record<string, unknown>;
  observed_payload: Record<string, unknown>;
  outcome_label: 'improved' | 'unchanged' | 'regressed' | 'inconclusive' | null;
  reviewer_id: string | null;
  reviewer_role: string | null;
  notes: string | null;
  reviewed_at: string | null;
  created_at?: string;
}

export type IntelligenceRunStatus = 'running' | 'completed' | 'failed';

export interface IntelligenceRun {
  id: number | string;
  job_type: string;
  run_started_at: string;
  run_completed_at: string | null;
  signals_created: number;
  signals_updated: number;
  patterns_created: number;
  patterns_updated: number;
  recommendations_created: number;
  recommendations_updated: number;
  recommendations_superseded: number;
  status: IntelligenceRunStatus;
  created_at?: string;
  updated_at?: string;
}

export type RecipeCostSourceType =
  | 'invoice_recent'
  | 'vendor_price_history'
  | 'last_trusted_snapshot'
  | 'manual_override';

export type IngredientCostResolutionStatus =
  | 'resolved'
  | 'missing_cost'
  | 'stale_cost'
  | 'ambiguous_cost'
  | 'unit_mismatch';

export type RecipeCostCompletenessStatus = 'complete' | 'partial' | 'incomplete';
export type RecipeCostConfidenceLabel = 'high' | 'medium' | 'low';

export interface IngredientCostResolution {
  id: number | string;
  recipe_cost_snapshot_id?: number | string | null;
  recipe_id: number;
  recipe_name: string;
  recipe_item_id: number | string;
  inventory_item_id: number | null;
  inventory_item_name: string;
  source_type: RecipeCostSourceType | null;
  status: IngredientCostResolutionStatus;
  normalized_unit_cost: number | null;
  base_unit: string;
  source_ref_table: string | null;
  source_ref_id: string | null;
  observed_at: string | null;
  stale_after_days: number | null;
  is_stale: boolean;
  ambiguity_count: number;
  candidate_count?: number;
  explanation_text: string;
  evidence: EvidenceReference[];
  detail_json?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface RecipeIngredientCostComponent {
  id: number | string;
  recipe_cost_snapshot_id?: number | string | null;
  recipe_id: number;
  recipe_name: string;
  recipe_item_id: number | string;
  inventory_item_id: number | null;
  inventory_item_name: string;
  quantity_in_recipe: number;
  recipe_unit: string;
  normalized_quantity: number | null;
  quantity_base_unit?: number | null;
  base_unit: string;
  normalized_unit_cost: number | null;
  resolved_unit_cost?: number | null;
  line_cost: number | null;
  extended_cost?: number | null;
  resolution_status: IngredientCostResolutionStatus;
  cost_source_type?: RecipeCostSourceType | null;
  cost_source_ref?: string | null;
  stale_flag?: boolean;
  ambiguity_flag?: boolean;
  resolution: IngredientCostResolution;
  created_at?: string;
  updated_at?: string;
}

export interface RecipeCostSnapshotDriver {
  inventory_item_id: number;
  inventory_item_name: string;
  line_cost: number | null;
  contribution_pct: number | null;
}

export interface RecipeCostSnapshot {
  id: number | string;
  recipe_id: number;
  recipe_version_id?: number | null;
  recipe_name: string;
  recipe_type: RecipeType;
  yield_qty: number | null;
  yield_unit: string | null;
  serving_count: number | null;
  total_cost: number | null;
  resolved_cost_subtotal: number;
  cost_per_yield_unit: number | null;
  cost_per_serving: number | null;
  completeness_status: RecipeCostCompletenessStatus;
  confidence_label: RecipeCostConfidenceLabel;
  ingredient_count: number;
  resolved_ingredient_count: number;
  missing_cost_count: number;
  stale_cost_count: number;
  ambiguous_cost_count: number;
  unit_mismatch_count: number;
  comparable_key?: string;
  source_run_id?: number | string | null;
  primary_driver_item_id?: number | null;
  primary_driver_cost?: number | null;
  driver_items: RecipeCostSnapshotDriver[];
  components: RecipeIngredientCostComponent[];
  snapshot_at: string;
  created_at?: string;
  updated_at?: string;
}

export interface RecipeCostSignalInput {
  snapshot: RecipeCostSnapshot;
  prior_snapshot?: RecipeCostSnapshot | null;
}

export interface RecipeCostRunSummary {
  recipe_count: number;
  snapshots_created: number;
  snapshots_updated: number;
  complete_snapshots: number;
  partial_snapshots: number;
  incomplete_snapshots: number;
  missing_cost_resolutions: number;
  stale_cost_resolutions: number;
  ambiguous_cost_resolutions: number;
  unit_mismatch_resolutions: number;
}

export interface RecipeCostRunRecord {
  id: number | string;
  started_at: string;
  completed_at: string | null;
  snapshots_created: number;
  snapshots_updated: number;
  complete_snapshots: number;
  partial_snapshots: number;
  incomplete_snapshots: number;
  status: 'running' | 'completed' | 'failed';
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RecipeCostIngredientDelta {
  inventory_item_id: number;
  inventory_item_name: string;
  current_cost: number | null;
  previous_cost: number | null;
  delta_cost: number | null;
  delta_pct: number | null;
}

export interface RecipeCostSnapshotComparison {
  recipe_id: number;
  current_snapshot_id: number | string;
  previous_snapshot_id: number | string | null;
  comparable: boolean;
  comparison_reason: string | null;
  total_cost_delta: number | null;
  total_cost_delta_pct: number | null;
  primary_driver_item_id: number | null;
  primary_driver_name: string | null;
  primary_driver_delta_cost: number | null;
  ingredient_deltas: RecipeCostIngredientDelta[];
}

export interface PriceThresholdRuleSet {
  percent_increase_threshold: number;
  percent_drop_threshold: number;
  volatility_threshold: number;
  minimum_evidence_count: number;
  recurrence_window_days: number;
  pattern_signal_threshold: number;
  immediate_pct_threshold: number;
  immediate_abs_threshold: number;
  immediate_volatility_threshold: number;
}

export interface PriceThresholdConfig {
  global: PriceThresholdRuleSet;
  category_overrides: Record<string, Partial<PriceThresholdRuleSet>>;
}

export interface RecipeCostDriftThresholdRuleSet {
  recipe_cost_drift_pct_threshold: number;
  recipe_cost_drift_abs_threshold: number;
  ingredient_driver_abs_threshold: number;
  ingredient_driver_pct_of_total_delta_threshold: number;
  minimum_prior_snapshot_age_days: number;
  repeat_suppression_days: number;
  immediate_recipe_cost_drift_pct_threshold: number;
  immediate_recipe_cost_drift_abs_threshold: number;
}

export interface RecipeCostDriftThresholdConfig {
  global: RecipeCostDriftThresholdRuleSet;
  category_overrides: Record<string, Partial<RecipeCostDriftThresholdRuleSet>>;
}

export interface RecipeCostDriftSignalInput {
  recipe_id: number;
  recipe_version_id?: number | null;
  current_snapshot: RecipeCostSnapshot;
  previous_snapshot: RecipeCostSnapshot;
  comparison: RecipeCostSnapshotComparison;
}

export interface RecipeCostDriverEvidence {
  recipe_id: number;
  recipe_version_id?: number | null;
  inventory_item_id: number;
  inventory_item_name: string;
  current_snapshot_id: number | string;
  previous_snapshot_id: number | string;
  current_component_cost: number | null;
  previous_component_cost: number | null;
  ingredient_delta_cost: number | null;
  ingredient_delta_pct: number | null;
  contribution_to_total_delta: number | null;
}

export interface RecipeCostDriftRunSummary {
  recipes_evaluated: number;
  comparable_recipes: number;
  recipes_skipped_no_prior: number;
  recipes_skipped_untrusted_current: number;
  recipes_skipped_untrusted_comparison: number;
  signals_created: number;
  signals_updated: number;
  drift_signals_emitted: number;
  driver_signals_emitted: number;
}
