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
} from '@fifoflow/shared';

const BASE = '/api';

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
    bulkUpdate: (data: { ids: number[]; updates: { category: string } }) =>
      fetchJson<{ updated: number }>('/items/bulk', { method: 'PATCH', body: JSON.stringify(data) }),
    bulkDelete: (data: { ids: number[] }) =>
      fetchJson<{ deleted: number; skipped: number; skippedIds: number[] }>('/items/bulk', { method: 'DELETE', body: JSON.stringify(data) }),
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
  reconcile: () => fetchJson<Record<string, unknown>>('/reconcile', { method: 'POST' }),
};
