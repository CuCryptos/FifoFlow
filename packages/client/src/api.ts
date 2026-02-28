import type {
  Item,
  Transaction,
  TransactionWithItem,
  DashboardStats,
  CreateItemInput,
  UpdateItemInput,
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
    throw new Error(error.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  items: {
    list: (params?: { search?: string; category?: string }) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.category) qs.set('category', params.category);
      const query = qs.toString();
      return fetchJson<Item[]>(`/items${query ? `?${query}` : ''}`);
    },
    get: (id: number) => fetchJson<{ item: Item; transactions: Transaction[] }>(`/items/${id}`),
    create: (data: CreateItemInput) =>
      fetchJson<Item>('/items', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: UpdateItemInput) =>
      fetchJson<Item>(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      fetchJson<void>(`/items/${id}`, { method: 'DELETE' }),
  },
  transactions: {
    list: (params?: { item_id?: number; type?: string; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.item_id) qs.set('item_id', String(params.item_id));
      if (params?.type) qs.set('type', params.type);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.offset) qs.set('offset', String(params.offset));
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
    stats: () => fetchJson<DashboardStats>('/dashboard/stats'),
  },
  reconcile: () => fetchJson<Record<string, unknown>>('/reconcile', { method: 'POST' }),
};
