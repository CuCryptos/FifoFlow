import type {
  Item,
  ItemStorage,
  Transaction,
  TransactionWithItem,
  DashboardStats,
  ItemCountAdjustmentResult,
  CountSession,
  CountSessionChecklistItem,
  CountSessionEntry,
  CountSessionSummary,
  ReorderSuggestion,
  StorageArea,
  Vendor,
  VendorPrice,
  Venue,
  Order,
  OrderWithVendor,
  OrderDetail,
  RecipeWithCost,
  RecipeDetail,
  UsageReport,
  WasteReport,
  CostReport,
  CloseCountSessionInput,
  CreateItemInput,
  CreateCountSessionInput,
  CreateStorageAreaInput,
  CreateVendorInput,
  CreateVendorPriceInput,
  CreateVenueInput,
  CreateOrderInput,
  UpdateOrderInput,
  UpdateVendorPriceInput,
  RecordCountEntryInput,
  SetItemCountInput,
  UpdateItemInput,
  UpdateStorageAreaInput,
  UpdateVendorInput,
  UpdateVenueInput,
  CreateTransactionInput,
  MergeItemsResult,
  MergeItemsInput,
  InvoiceParseResult,
  Forecast,
  ForecastEntry,
  ForecastWithEntries,
  ForecastParseResult,
  ForecastProductMapping,
  SaveForecastInput,
  SaleWithItem,
  SalesSummary,
  CreateSaleInput,
} from '@fifoflow/shared';

const BASE = '/api';

export interface IntelligenceScopeSummary {
  organization_id: number | null;
  location_id: number | null;
  operation_unit_id: number | null;
  storage_area_id: number | null;
  inventory_item_id?: number | null;
  recipe_id?: number | null;
  vendor_id?: number | null;
}

export interface MemoRankingExplanationPayload {
  total_score: number;
  components: {
    severity: number;
    urgency: number;
    confidence: number;
    recurrence: number;
    freshness: number;
    impact: number;
    evidence: number;
    fallback_penalty: number;
  };
  factors: string[];
}

export interface MemoItemPayload {
  source_signal_id: number | string;
  signal_type: string;
  title: string;
  subject_label: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  urgency: 'IMMEDIATE' | 'THIS_WEEK' | 'MONITOR';
  confidence: 'Early signal' | 'Emerging pattern' | 'Stable pattern';
  likely_owner: 'Unit Manager' | 'Purchasing Owner' | 'Executive Approver';
  scope_summary: IntelligenceScopeSummary;
  short_explanation: string;
  ranking_explanation: MemoRankingExplanationPayload;
  evidence_references: Array<{
    source_table: string;
    source_primary_key: string;
    source_type?: string | null;
    observed_at?: string | null;
    payload?: Record<string, unknown>;
  }>;
  policy_fallback_used: boolean;
  observed_at: string;
}

export interface MemoSectionPayload {
  key: string;
  title: string;
  order: number;
  max_items: number;
  items: MemoItemPayload[];
}

export interface RecommendationCardPayload {
  id: number | string;
  recommendation_type: string;
  summary: string;
  status: string;
  severity_label: 'low' | 'medium' | 'high' | 'critical';
  confidence_label: 'Early signal' | 'Emerging pattern' | 'Stable pattern';
  urgency_label: 'IMMEDIATE' | 'THIS_WEEK' | 'MONITOR';
  likely_owner: string;
  due_at: string | null;
  opened_at: string;
  updated_at: string;
  scope_summary: IntelligenceScopeSummary;
  subject_summary: Record<string, unknown>;
  evidence_count: number;
  expected_benefit_payload: Record<string, unknown>;
  operator_action_payload: Record<string, unknown>;
  evidence: Array<{
    evidence_type: string;
    evidence_ref_table: string;
    evidence_ref_id: string;
    explanation_text: string;
    evidence_weight: number;
  }>;
}

export interface RecommendationReviewEventPayload {
  id: number | string;
  recommendation_id: number | string;
  action_type: 'STATUS_CHANGED';
  from_status: string | null;
  to_status: string | null;
  actor_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface SignalDetailPayload {
  signal: {
    id: number | string;
    signal_type: string;
    subject_type: string;
    subject_id: number;
    subject_key?: string | null;
    severity_label: 'low' | 'medium' | 'high' | 'critical';
    confidence_label: 'Early signal' | 'Emerging pattern' | 'Stable pattern';
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
    evidence: MemoItemPayload['evidence_references'];
    last_confirmed_at?: string;
    created_at?: string;
    updated_at?: string;
  };
  memo_item: MemoItemPayload;
  subject_signal_history: SignalDetailPayload['signal'][];
  related_recommendations: RecommendationCardPayload[];
}

export interface RecommendationDetailPayload {
  recommendation: RecommendationCardPayload & {
    recommendation_type: string;
    rule_version?: string;
    subject_type: string;
    subject_id: number;
    subject_key?: string | null;
    dedupe_key: string | null;
    superseded_by_recommendation_id: number | string | null;
    closed_at: string | null;
    created_at?: string;
  };
  evidence_signals: SignalDetailPayload['signal'][];
  subject_signal_history: SignalDetailPayload['signal'][];
  review_events: RecommendationReviewEventPayload[];
}

export interface RecipeWorkflowSnapshotPayload {
  id: number;
  snapshot_at: string;
  total_cost: number;
  cost_per_serving: number | null;
  completeness_status: 'complete' | 'partial' | 'incomplete';
  confidence_label: 'high' | 'medium' | 'low';
  resolved_ingredient_count: number;
  ingredient_count: number;
  missing_cost_count: number;
  stale_cost_count: number;
  ambiguous_cost_count: number;
  unit_mismatch_count: number;
}

export interface OperationalRecipeWorkflowSummaryPayload {
  recipe_id: number;
  recipe_name: string;
  recipe_type: string;
  recipe_version_id: number;
  version_number: number;
  yield_qty: number | null;
  yield_unit: string | null;
  serving_count: number | null;
  source_builder_job_id: number | string | null;
  source_builder_draft_recipe_id: number | string | null;
  source_template_id: number | string | null;
  source_template_version_id: number | string | null;
  ingredient_row_count: number;
  resolved_row_count: number;
  unresolved_row_count: number;
  inventory_linked_row_count: number;
  vendor_linked_row_count: number;
  missing_canonical_count: number;
  missing_inventory_mapping_count: number;
  missing_vendor_mapping_count: number;
  missing_vendor_cost_lineage_count: number;
  costable_percent: number;
  costability_classification: 'COSTABLE_NOW' | 'OPERATIONAL_ONLY' | 'BLOCKED_FOR_COSTING';
  blocker_messages: string[];
  latest_snapshot: RecipeWorkflowSnapshotPayload | null;
}

export interface RecipeWorkflowPayload {
  generated_at: string;
  scope: {
    venue_id: number | null;
    organization_id: number | null;
    operation_unit_id: number | null;
  };
  counts: {
    total_promoted_recipes: number;
    costable_now_count: number;
    operational_only_count: number;
    blocked_for_costing_count: number;
    with_snapshot_count: number;
    complete_snapshot_count: number;
  };
  summaries: OperationalRecipeWorkflowSummaryPayload[];
}

export interface OperationalRecipeIngredientRowPayload {
  recipe_item_id: number | string;
  line_index: number | null;
  raw_ingredient_text: string;
  canonical_ingredient_id: number | string | null;
  canonical_ingredient_name: string | null;
  inventory_item_id: number | null;
  inventory_item_name: string;
  quantity: number;
  unit: string;
  base_unit: string;
  preparation_note: string | null;
  costability_status:
    | 'RESOLVED_FOR_COSTING'
    | 'MISSING_CANONICAL_INGREDIENT'
    | 'MISSING_SCOPED_INVENTORY_MAPPING'
    | 'MISSING_SCOPED_VENDOR_MAPPING'
    | 'MISSING_VENDOR_COST_LINEAGE';
  resolution_explanation: string;
  inventory_mapping_resolution: Record<string, unknown> | null;
  vendor_mapping_resolution: Record<string, unknown> | null;
  vendor_cost_lineage: Record<string, unknown> | null;
}

export interface RecipeWorkflowIngredientDiffPayload {
  comparison_key: string;
  change_type: 'ADDED' | 'REMOVED' | 'QUANTITY_CHANGED' | 'RESOLUTION_CHANGED' | 'UNCHANGED';
  current_row: OperationalRecipeIngredientRowPayload | null;
  previous_row: OperationalRecipeIngredientRowPayload | null;
  summary: string;
  quantity_changed: boolean;
  resolution_changed: boolean;
}

export interface RecipeWorkflowDetailPayload {
  generated_at: string;
  summary: OperationalRecipeWorkflowSummaryPayload;
  version_history: Array<OperationalRecipeWorkflowSummaryPayload & {
    status: string;
    created_at: string | null;
    updated_at: string | null;
  }>;
  snapshot_history: Array<RecipeWorkflowSnapshotPayload & {
    recipe_version_id: number | null;
    version_number: number | null;
  }>;
  comparison_version: (OperationalRecipeWorkflowSummaryPayload & {
    status: string;
    created_at: string | null;
    updated_at: string | null;
  }) | null;
  ingredient_diffs: RecipeWorkflowIngredientDiffPayload[];
  ingredient_rows: OperationalRecipeIngredientRowPayload[];
}

export interface AllergyDocumentPayload {
  id: number;
  venue_id: number | null;
  filename: string;
  mime_type: string;
  page_count: number;
  chunk_count: number;
  product_count: number;
  status: 'ready' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface AllergyChatItemPayload {
  product_id: number;
  product_name: string;
  rationale: string;
  evidence_chunk_ids: number[];
}

export interface AllergyChatChunkPayload {
  id: number;
  document_id: number;
  page_id: number;
  page_number: number;
  chunk_index: number;
  chunk_text: string;
}

export interface AllergyChatResponsePayload {
  allergen_focus: string | null;
  answer_markdown: string;
  safe_items: AllergyChatItemPayload[];
  avoid_items: AllergyChatItemPayload[];
  caution_items: AllergyChatItemPayload[];
  unknown_items: AllergyChatItemPayload[];
  cited_chunks: AllergyChatChunkPayload[];
}

export interface ProteinUsageItemPayload {
  id: number;
  name: string;
  unit_label: string;
  sort_order: number;
  active: number;
}

export interface ProteinUsageRulePayload {
  id: number;
  venue_id: number;
  forecast_product_name: string;
  protein_item_id: number;
  usage_per_pax: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProteinUsageForecastProductPayload {
  product_name: string;
  forecast_count: number;
  entry_count: number;
  total_guest_count: number;
  first_date: string;
  last_date: string;
  configured_rule_count: number;
}

export interface ProteinUsageSummaryPayload {
  filters: {
    venue_id: number;
    start: string;
    end: string;
    group_by: 'day' | 'week' | 'month';
    today: string;
  };
  proteins: ProteinUsageItemPayload[];
  totals: Array<{
    protein_item_id: number;
    protein_name: string;
    unit_label: string;
    historical_usage: number;
    projected_usage: number;
    total_usage: number;
  }>;
  periods: Array<{
    period: string;
    historical_guest_count: number;
    projected_guest_count: number;
    total_guest_count: number;
    proteins: Array<{
      protein_item_id: number;
      protein_name: string;
      unit_label: string;
      historical_usage: number;
      projected_usage: number;
      total_usage: number;
    }>;
  }>;
  unmapped_forecast_products: Array<{
    product_name: string;
    entry_count: number;
    total_guest_count: number;
    first_date: string;
    last_date: string;
  }>;
}

export interface RecipeTemplateSummaryPayload {
  template_id: number;
  name: string;
  category: string;
  active_version_id: number;
  active_version_number: number;
  yield_quantity: number;
  yield_unit: string;
  ingredient_count: number;
}

export interface RecipeTemplateDetailPayload extends RecipeTemplateSummaryPayload {
  ingredients: Array<{
    ingredient_name: string;
    qty: number;
    unit: string;
    sort_order: number;
    template_canonical_ingredient_id: number | null;
    template_canonical_name: string | null;
    template_mapping_status: string | null;
  }>;
}

export interface RecipeDraftIngredientPayload {
  parsed_row_id: number | string;
  resolution_row_id: number | string | null;
  line_index: number;
  raw_ingredient_text: string;
  quantity: number | null;
  unit: string | null;
  item_id: number | null;
  item_name: string | null;
  template_ingredient_name: string | null;
  template_quantity: number | null;
  template_unit: string | null;
  template_sort_order: number | null;
  canonical_ingredient_id: number | string | null;
  canonical_ingredient_name: string | null;
  canonical_match_status: string | null;
  inventory_mapping_status: string | null;
  review_status: string | null;
  mapping_explanation: string | null;
}

export interface RecipeDraftSummaryPayload {
  id: number | string;
  recipe_builder_job_id: number | string;
  draft_name: string;
  draft_notes: string | null;
  source_type: 'freeform' | 'template';
  source_template_id: number | null;
  source_template_version_id: number | null;
  source_recipe_type: 'dish' | 'prep' | null;
  yield_quantity: number | null;
  yield_unit: string | null;
  serving_quantity: number | null;
  serving_unit: string | null;
  serving_count: number | null;
  completeness_status: 'READY' | 'NEEDS_REVIEW' | 'BLOCKED' | 'INCOMPLETE' | 'CREATED';
  costability_status: 'COSTABLE' | 'NEEDS_REVIEW' | 'NOT_COSTABLE';
  ingredient_row_count: number;
  ready_row_count: number;
  review_row_count: number;
  blocked_row_count: number;
  unresolved_canonical_count: number;
  unresolved_inventory_count: number;
  job_status: 'PENDING' | 'PARSED' | 'ASSEMBLED' | 'NEEDS_REVIEW' | 'BLOCKED' | 'CREATED' | 'FAILED';
  promotion_link: { recipe_id: number | string; recipe_version_id: number | string | null } | null;
  created_at?: string;
  updated_at?: string;
}

export interface RecipeDraftDetailPayload extends RecipeDraftSummaryPayload {
  ingredient_rows: RecipeDraftIngredientPayload[];
}

export interface RecipeDraftPromotionResultPayload {
  created_new_recipe: boolean;
  created_new_version: boolean;
  costability_status: 'COSTABLE_NOW' | 'OPERATIONAL_ONLY' | 'BLOCKED_FOR_COSTING';
  recipe: {
    id: number | string;
    name: string;
    type: string;
  } | null;
  recipe_version: {
    id: number | string;
    recipe_id: number | string;
    version_number: number;
  } | null;
  promotion_link: {
    recipe_id: number | string;
    recipe_version_id: number | string;
  } | null;
}

export interface PackFreshnessEntryPayload {
  pack_key: string;
  label: string;
  description: string;
  downstream_packs: string[];
  last_run: {
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
    status: 'running' | 'completed' | 'failed';
    created_at?: string;
    updated_at?: string;
  } | null;
  freshness_label: 'fresh' | 'aging' | 'stale' | 'missing';
  age_hours: number | null;
  metrics: Record<string, number | string | null>;
}

export interface IntelligenceFreshnessPayload {
  generated_at: string;
  packs: PackFreshnessEntryPayload[];
}

export interface PackRunPayload {
  refreshed_at: string;
  requested_pack: string;
  pipeline: {
    packs_run: string[];
    jobs: Record<string, {
      status: 'ok' | 'error';
      job: string;
      notes: string[];
      run_summary: Record<string, unknown> | null;
      extra: Record<string, unknown> | null;
    }>;
  };
  operator_brief: OperatorBriefPayload;
  freshness: PackFreshnessEntryPayload[];
}

export interface OperatorBriefPayload {
  generated_at: string;
  memo_window: {
    start: string;
    end: string;
    generated_at: string;
  };
  scope: {
    venue_id: number | null;
    organization_id: number | null;
    operation_unit_id: number | null;
  };
  counts: {
    signal_count: number;
    active_recommendation_count: number;
    top_priority_count: number;
    needs_review_count: number;
  };
  routing_summary: Array<{
    owner: string;
    item_count: number;
    signal_types: string[];
  }>;
  top_priority_items: MemoItemPayload[];
  sections: MemoSectionPayload[];
  active_recommendations: RecommendationCardPayload[];
  recent_signal_items: MemoItemPayload[];
  notes: string[];
}

export interface IntelligenceRefreshPayload {
  refreshed_at: string;
  jobs: Record<string, {
    status: 'ok' | 'error';
    job: string;
    notes: string[];
    run_summary: Record<string, unknown> | null;
    extra: Record<string, unknown> | null;
  }>;
  operator_brief: OperatorBriefPayload;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    const msg = typeof error.error === 'string' ? error.error : res.statusText;
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  items: {
    list: (params?: { search?: string; category?: string; venue_id?: number }) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.category) qs.set('category', params.category);
      if (params?.venue_id) qs.set('venue_id', String(params.venue_id));
      const query = qs.toString();
      return fetchJson<Item[]>(`/items${query ? `?${query}` : ''}`);
    },
    reorderSuggestions: (venueId?: number) => {
      const qs = venueId ? `?venue_id=${venueId}` : '';
      return fetchJson<ReorderSuggestion[]>(`/items/reorder-suggestions${qs}`);
    },
    get: (id: number) => fetchJson<{ item: Item; transactions: Transaction[] }>(`/items/${id}`),
    create: (data: CreateItemInput) =>
      fetchJson<Item>('/items', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: UpdateItemInput) =>
      fetchJson<Item>(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    setCount: (id: number, data: SetItemCountInput) =>
      fetchJson<ItemCountAdjustmentResult>(`/items/${id}/count`, { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number) =>
      fetchJson<void>(`/items/${id}`, { method: 'DELETE' }),
    listStorage: (itemId: number) =>
      fetchJson<ItemStorage[]>(`/items/${itemId}/storage`),
    listAllStorage: () =>
      fetchJson<ItemStorage[]>(`/items/storage`),
    bulkUpdate: (data: {
      ids: number[];
      updates: {
        category?: string;
        vendor_id?: number | null;
        venue_id?: number | null;
        storage_area_id?: number | null;
      };
    }) =>
      fetchJson<{ updated: number }>('/items/bulk', { method: 'PATCH', body: JSON.stringify(data) }),
    bulkDelete: (data: { ids: number[] }) =>
      fetchJson<{ deleted: number; skipped: number; skippedIds: number[] }>('/items/bulk', { method: 'DELETE', body: JSON.stringify(data) }),
    merge: (data: MergeItemsInput) =>
      fetchJson<MergeItemsResult>('/items/merge', { method: 'POST', body: JSON.stringify(data) }),
  },
  storageAreas: {
    list: () => fetchJson<StorageArea[]>('/storage-areas'),
    get: (id: number) => fetchJson<StorageArea>(`/storage-areas/${id}`),
    create: (data: CreateStorageAreaInput) =>
      fetchJson<StorageArea>('/storage-areas', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: UpdateStorageAreaInput) =>
      fetchJson<StorageArea>(`/storage-areas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      fetchJson<void>(`/storage-areas/${id}`, { method: 'DELETE' }),
  },
  vendors: {
    list: () => fetchJson<Vendor[]>('/vendors'),
    get: (id: number) => fetchJson<Vendor>(`/vendors/${id}`),
    create: (data: CreateVendorInput) =>
      fetchJson<Vendor>('/vendors', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: UpdateVendorInput) =>
      fetchJson<Vendor>(`/vendors/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      fetchJson<void>(`/vendors/${id}`, { method: 'DELETE' }),
  },
  venues: {
    list: () => fetchJson<Venue[]>('/venues'),
    get: (id: number) => fetchJson<Venue>(`/venues/${id}`),
    create: (data: CreateVenueInput) =>
      fetchJson<Venue>('/venues', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: UpdateVenueInput) =>
      fetchJson<Venue>(`/venues/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      fetchJson<void>(`/venues/${id}`, { method: 'DELETE' }),
    reorder: (orderedIds: number[]) =>
      fetchJson<Venue[]>('/venues/reorder', { method: 'PATCH', body: JSON.stringify({ ordered_ids: orderedIds }) }),
  },
  vendorPrices: {
    list: (itemId: number) =>
      fetchJson<VendorPrice[]>(`/items/${itemId}/vendor-prices`),
    create: (itemId: number, data: CreateVendorPriceInput) =>
      fetchJson<VendorPrice>(`/items/${itemId}/vendor-prices`, { method: 'POST', body: JSON.stringify(data) }),
    update: (itemId: number, id: number, data: UpdateVendorPriceInput) =>
      fetchJson<VendorPrice>(`/items/${itemId}/vendor-prices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (itemId: number, id: number) =>
      fetchJson<void>(`/items/${itemId}/vendor-prices/${id}`, { method: 'DELETE' }),
  },
  orders: {
    list: () => fetchJson<OrderWithVendor[]>('/orders'),
    get: (id: number) => fetchJson<OrderDetail>(`/orders/${id}`),
    create: (data: CreateOrderInput) =>
      fetchJson<OrderDetail>('/orders', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: UpdateOrderInput) =>
      fetchJson<OrderDetail>(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateStatus: (id: number, status: 'sent') =>
      fetchJson<Order>(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    delete: (id: number) =>
      fetchJson<void>(`/orders/${id}`, { method: 'DELETE' }),
  },
  countSessions: {
    list: () => fetchJson<CountSessionSummary[]>('/count-sessions'),
    getOpen: () => fetchJson<CountSession | null>('/count-sessions/open'),
    create: (data: CreateCountSessionInput) =>
      fetchJson<CountSession>('/count-sessions', { method: 'POST', body: JSON.stringify(data) }),
    listEntries: (sessionId: number) =>
      fetchJson<CountSessionEntry[]>(`/count-sessions/${sessionId}/entries`),
    checklist: (sessionId: number) =>
      fetchJson<CountSessionChecklistItem[]>(`/count-sessions/${sessionId}/checklist`),
    recordEntry: (sessionId: number, data: RecordCountEntryInput) =>
      fetchJson<CountSessionEntry>(`/count-sessions/${sessionId}/entries`, { method: 'POST', body: JSON.stringify(data) }),
    close: (sessionId: number, data?: CloseCountSessionInput) =>
      fetchJson<CountSession>(`/count-sessions/${sessionId}/close`, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  },
  transactions: {
    list: (params?: { item_id?: number; type?: string; limit?: number; offset?: number; venue_id?: number }) => {
      const qs = new URLSearchParams();
      if (params?.item_id) qs.set('item_id', String(params.item_id));
      if (params?.type) qs.set('type', params.type);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.offset) qs.set('offset', String(params.offset));
      if (params?.venue_id) qs.set('venue_id', String(params.venue_id));
      const query = qs.toString();
      return fetchJson<TransactionWithItem[]>(`/transactions${query ? `?${query}` : ''}`);
    },
    create: (itemId: number, data: CreateTransactionInput) =>
      fetchJson<{ transaction: Transaction; item: Item }>(
        `/items/${itemId}/transactions`,
        { method: 'POST', body: JSON.stringify(data) }
      ),
  },
  dashboard: {
    stats: (venueId?: number) => {
      const qs = venueId ? `?venue_id=${venueId}` : '';
      return fetchJson<DashboardStats>(`/dashboard/stats${qs}`);
    },
  },
  reports: {
    usage: (params: { start: string; end: string; group_by?: string; venue_id?: number }) => {
      const qs = new URLSearchParams({ start: params.start, end: params.end });
      if (params.group_by) qs.set('group_by', params.group_by);
      if (params.venue_id) qs.set('venue_id', String(params.venue_id));
      return fetchJson<UsageReport>(`/reports/usage?${qs}`);
    },
    waste: (params: { start: string; end: string; venue_id?: number }) => {
      const qs = new URLSearchParams({ start: params.start, end: params.end });
      if (params.venue_id) qs.set('venue_id', String(params.venue_id));
      return fetchJson<WasteReport>(`/reports/waste?${qs}`);
    },
    cost: (params: { start: string; end: string; group_by?: string; venue_id?: number }) => {
      const qs = new URLSearchParams({ start: params.start, end: params.end });
      if (params.group_by) qs.set('group_by', params.group_by);
      if (params.venue_id) qs.set('venue_id', String(params.venue_id));
      return fetchJson<CostReport>(`/reports/cost?${qs}`);
    },
  },
  recipes: {
    list: () => fetchJson<RecipeWithCost[]>('/recipes'),
    get: (id: number) => fetchJson<RecipeDetail>(`/recipes/${id}`),
    delete: (id: number) =>
      fetchJson<void>(`/recipes/${id}`, { method: 'DELETE' }),
  },
  recipeDrafts: {
    list: () => fetchJson<{ drafts: RecipeDraftSummaryPayload[] }>('/recipe-drafts'),
    get: (id: number) => fetchJson<RecipeDraftDetailPayload>(`/recipe-drafts/${id}`),
    create: (data: unknown) =>
      fetchJson<RecipeDraftDetailPayload>('/recipe-drafts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: unknown) =>
      fetchJson<RecipeDraftDetailPayload>(`/recipe-drafts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      fetchJson<void>(`/recipe-drafts/${id}`, { method: 'DELETE' }),
    promote: (id: number, data?: { created_by?: string; notes?: string | null }) =>
      fetchJson<{
        draft: RecipeDraftDetailPayload | null;
        promotion: RecipeDraftPromotionResultPayload;
      }>(`/recipe-drafts/${id}/promote`, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  },
  recipeTemplates: {
    list: () => fetchJson<{ templates: RecipeTemplateSummaryPayload[] }>('/recipe-templates'),
    get: (templateId: number) => fetchJson<RecipeTemplateDetailPayload>(`/recipe-templates/${templateId}`),
  },
  recipeWorkflow: {
    operationalSummary: (venueId?: number) => {
      const qs = venueId ? `?venue_id=${venueId}` : '';
      return fetchJson<RecipeWorkflowPayload>(`/recipe-workflow/operational-summary${qs}`);
    },
    operationalDetail: (recipeVersionId: number, venueId?: number, compareRecipeVersionId?: number | null) => {
      const qs = new URLSearchParams();
      if (venueId) qs.set('venue_id', String(venueId));
      if (compareRecipeVersionId != null && compareRecipeVersionId > 0) {
        qs.set('compare_recipe_version_id', String(compareRecipeVersionId));
      }
      const query = qs.toString();
      return fetchJson<RecipeWorkflowDetailPayload>(`/recipe-workflow/operational-summary/${recipeVersionId}${query ? `?${query}` : ''}`);
    },
  },
  allergyAssistant: {
    listDocuments: (venueId?: number | null) => {
      const qs = venueId != null ? `?venue_id=${venueId}` : '';
      return fetchJson<{ documents: AllergyDocumentPayload[] }>(`/allergy-assistant/documents${qs}`);
    },
    uploadDocuments: async (files: File[], venueId?: number | null) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      if (venueId != null) {
        formData.append('venue_id', String(venueId));
      }
      const res = await fetch(`${BASE}/allergy-assistant/documents/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(typeof error.error === 'string' ? error.error : res.statusText);
      }
      return res.json() as Promise<{ documents: AllergyDocumentPayload[] }>;
    },
    deleteDocument: async (documentId: number) => {
      const res = await fetch(`${BASE}/allergy-assistant/documents/${documentId}`, { method: 'DELETE' });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(typeof error.error === 'string' ? error.error : res.statusText);
      }
    },
    ask: (input: { question: string; venue_id?: number | null; document_ids?: number[] }) =>
      fetchJson<AllergyChatResponsePayload>('/allergy-assistant/chat', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  },
  proteinUsage: {
    config: (venueId: number) =>
      fetchJson<{
        protein_items: ProteinUsageItemPayload[];
        rule_rows: ProteinUsageRulePayload[];
        forecast_products: ProteinUsageForecastProductPayload[];
      }>(`/protein-usage/config?venue_id=${venueId}`),
    saveRules: (input: {
      venue_id: number;
      rules: Array<{
        forecast_product_name: string;
        protein_item_id: number;
        usage_per_pax: number;
        notes?: string | null;
      }>;
    }) =>
      fetchJson<{ rule_rows: ProteinUsageRulePayload[] }>('/protein-usage/rules/bulk', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    summary: (params: { venue_id: number; start: string; end: string; group_by: 'day' | 'week' | 'month' }) => {
      const qs = new URLSearchParams({
        venue_id: String(params.venue_id),
        start: params.start,
        end: params.end,
        group_by: params.group_by,
      });
      return fetchJson<ProteinUsageSummaryPayload>(`/protein-usage/summary?${qs}`);
    },
  },
  reconcile: () => fetchJson<Record<string, unknown>>('/reconcile', { method: 'POST' }),
  invoices: {
    parse: async (files: File[], vendorId?: number): Promise<InvoiceParseResult[]> => {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      if (vendorId) {
        formData.append('vendor_id', String(vendorId));
      }
      const res = await fetch(`${BASE}/invoices/parse`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        const msg = typeof error.error === 'string' ? error.error : res.statusText;
        throw new Error(msg);
      }
      return res.json();
    },
    confirm: (data: {
      vendor_id: number;
      lines: Array<{
        vendor_item_name: string;
        matched_item_id: number;
        quantity: number;
        unit: string;
        unit_price: number;
        create_vendor_price: boolean;
      }>;
      record_transactions: boolean;
    }) =>
      fetchJson<{ vendor_prices_created: number; transactions_created: number; vendors_assigned: number }>(
        '/invoices/confirm',
        { method: 'POST', body: JSON.stringify(data) }
      ),
  },
  forecasts: {
    parse: async (file: File): Promise<ForecastParseResult> => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${BASE}/forecasts/parse`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        const msg = typeof error.error === 'string' ? error.error : res.statusText;
        throw new Error(msg);
      }
      return res.json();
    },
    save: (data: SaveForecastInput) =>
      fetchJson<Forecast>('/forecasts/save', { method: 'POST', body: JSON.stringify(data) }),
    list: () => fetchJson<Forecast[]>('/forecasts'),
    get: (id: number) => fetchJson<ForecastWithEntries>(`/forecasts/${id}`),
    delete: (id: number) => fetchJson<void>(`/forecasts/${id}`, { method: 'DELETE' }),
    listMappings: () => fetchJson<ForecastProductMapping[]>('/forecasts/mappings'),
    saveMappings: (mappings: Array<{ product_name: string; venue_id: number }>) =>
      fetchJson<ForecastProductMapping[]>('/forecasts/mappings', {
        method: 'POST',
        body: JSON.stringify({ mappings }),
      }),
    deleteMapping: (id: number) => fetchJson<void>(`/forecasts/mappings/${id}`, { method: 'DELETE' }),
    updateEntry: (entryId: number, guest_count: number) =>
      fetchJson<ForecastEntry>(`/forecasts/entries/${entryId}`, {
        method: 'PATCH',
        body: JSON.stringify({ guest_count }),
      }),
  },
  sales: {
    list: (params?: { start_date?: string; end_date?: string; item_id?: number }) => {
      const qs = new URLSearchParams();
      if (params?.start_date) qs.set('start_date', params.start_date);
      if (params?.end_date) qs.set('end_date', params.end_date);
      if (params?.item_id) qs.set('item_id', String(params.item_id));
      const query = qs.toString();
      return fetchJson<SaleWithItem[]>(`/sales${query ? `?${query}` : ''}`);
    },
    create: (data: CreateSaleInput) =>
      fetchJson<SaleWithItem>('/sales', { method: 'POST', body: JSON.stringify(data) }),
    summary: (params?: { start_date?: string; end_date?: string }) => {
      const qs = new URLSearchParams();
      if (params?.start_date) qs.set('start_date', params.start_date);
      if (params?.end_date) qs.set('end_date', params.end_date);
      const query = qs.toString();
      return fetchJson<SalesSummary>(`/sales/summary${query ? `?${query}` : ''}`);
    },
  },
  intelligence: {
    operatorBrief: (params?: { venue_id?: number; days?: number }) => {
      const qs = new URLSearchParams();
      if (params?.venue_id) qs.set('venue_id', String(params.venue_id));
      if (params?.days) qs.set('days', String(params.days));
      const query = qs.toString();
      return fetchJson<OperatorBriefPayload>(`/intelligence/operator-brief${query ? `?${query}` : ''}`);
    },
    refresh: (data?: { venue_id?: number; signal_lookback_days?: number; memo_window_days?: number }) =>
      fetchJson<IntelligenceRefreshPayload>('/intelligence/refresh', {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
      }),
    freshness: (params?: { venue_id?: number; days?: number }) => {
      const qs = new URLSearchParams();
      if (params?.venue_id) qs.set('venue_id', String(params.venue_id));
      if (params?.days) qs.set('days', String(params.days));
      const query = qs.toString();
      return fetchJson<IntelligenceFreshnessPayload>(`/intelligence/freshness${query ? `?${query}` : ''}`);
    },
    runPack: (
      pack: string,
      data?: { venue_id?: number; signal_lookback_days?: number; memo_window_days?: number },
    ) =>
      fetchJson<PackRunPayload>(`/intelligence/jobs/${pack}/run`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
      }),
    signalDetail: (id: number, params?: { venue_id?: number; days?: number }) => {
      const qs = new URLSearchParams();
      if (params?.venue_id) qs.set('venue_id', String(params.venue_id));
      if (params?.days) qs.set('days', String(params.days));
      const query = qs.toString();
      return fetchJson<SignalDetailPayload>(`/intelligence/signals/${id}${query ? `?${query}` : ''}`);
    },
    recommendations: (params?: { venue_id?: number; statuses?: string[]; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.venue_id) qs.set('venue_id', String(params.venue_id));
      if (params?.statuses?.length) qs.set('statuses', params.statuses.join(','));
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString();
      return fetchJson<{ recommendations: RecommendationCardPayload[] }>(`/intelligence/recommendations${query ? `?${query}` : ''}`);
    },
    recommendationDetail: (id: number) =>
      fetchJson<RecommendationDetailPayload>(`/intelligence/recommendations/${id}`),
    updateRecommendationStatus: (
      id: number,
      data: { status: string; actor_name?: string; notes?: string },
    ) =>
      fetchJson<RecommendationDetailPayload>(`/intelligence/recommendations/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },
};
