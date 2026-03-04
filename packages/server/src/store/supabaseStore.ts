import type {
  CloseCountSessionInput,
  CostReport,
  CountSession,
  CountSessionChecklistItem,
  CountSessionEntry,
  CountSessionSummary,
  CreateCountSessionInput,
  CreateItemInput,
  CreateOrderInput,
  CreateStorageAreaInput,
  CreateVendorPriceInput,
  DashboardStats,
  ItemCountAdjustmentResult,
  Item,
  ItemStorage,
  Order,
  OrderDetail,
  OrderWithVendor,
  ReconciliationResult,
  StorageArea,
  Transaction,
  TransactionWithItem,
  UpdateItemInput,
  UpdateOrderInput,
  UpdateStorageAreaInput,
  UpdateVendorPriceInput,
  UsageReport,
  Venue,
  CreateVenueInput,
  UpdateVenueInput,
  Vendor,
  VendorPrice,
  CreateVendorInput,
  UpdateVendorInput,
  WasteReport,
} from '@fifoflow/shared';
import {
  type InsertTransactionAndAdjustQtyInput,
  type InventoryStore,
  type ItemListFilters,
  type ReconcileOutcome,
  type ReportFilters,
  type SetItemCountWithAdjustmentInput,
  type TransactionListFilters,
} from './types.js';

type CountFilter = { column: string; operator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'ilike' | 'not.is'; value: string | number };

interface SupabaseTransactionRow {
  id: number;
  item_id: number;
  type: string;
  quantity: number;
  reason: string;
  notes: string | null;
  created_at: string;
  items?: {
    name: string;
    unit: string;
  };
}

interface SupabaseRpcTransactionResult {
  transaction_row: Transaction;
  item_row: Item;
}

interface SupabaseRpcCountAdjustmentResult {
  item_row: Item;
  transaction_row: Transaction | null;
  delta: number;
}

class SupabaseStoreError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'SupabaseStoreError';
  }
}

export class SupabaseInventoryStore implements InventoryStore {
  constructor(
    private readonly supabaseUrl: string,
    private readonly supabaseKey: string,
    private readonly schema: string = 'public',
  ) {}

  private notImplemented(method: string): never {
    throw new SupabaseStoreError(501, `${method} is not implemented for Supabase store yet.`);
  }

  private buildRestUrl(table: string, params: URLSearchParams): string {
    return `${this.supabaseUrl}/rest/v1/${table}?${params.toString()}`;
  }

  private async request<T>(args: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    path: string;
    params?: URLSearchParams;
    body?: unknown;
    prefer?: string;
  }): Promise<T> {
    const { method, path, params, body, prefer } = args;
    const query = params ? `?${params.toString()}` : '';
    const response = await fetch(`${this.supabaseUrl}/rest/v1/${path}${query}`, {
      method,
      headers: {
        apikey: this.supabaseKey,
        Authorization: `Bearer ${this.supabaseKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
        ...(this.schema ? {
          ...(method === 'GET' ? { 'Accept-Profile': this.schema } : { 'Content-Profile': this.schema }),
        } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const raw = await response.text();
      let message = raw;
      try {
        const parsed = JSON.parse(raw) as { message?: string; error?: string };
        message = parsed.message ?? parsed.error ?? raw;
      } catch {
        // keep raw message
      }
      throw new SupabaseStoreError(response.status, `Supabase request failed: ${message}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  private async fetchJson<T>(table: string, params: URLSearchParams): Promise<T> {
    return this.request<T>({
      method: 'GET',
      path: table,
      params,
    });
  }

  private async count(table: string, filters: CountFilter[]): Promise<number> {
    const params = new URLSearchParams();
    params.set('select', 'id');
    params.set('limit', '1');
    for (const filter of filters) {
      params.set(filter.column, `${filter.operator}.${filter.value}`);
    }

    const response = await fetch(this.buildRestUrl(table, params), {
      headers: {
        apikey: this.supabaseKey,
        Authorization: `Bearer ${this.supabaseKey}`,
        Accept: 'application/json',
        Prefer: 'count=exact',
        ...(this.schema ? { 'Accept-Profile': this.schema } : {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase count failed (${response.status}): ${body}`);
    }

    const contentRange = response.headers.get('content-range');
    if (!contentRange) return 0;
    const [, total] = contentRange.split('/');
    const parsed = Number(total);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async listItems(filters?: ItemListFilters): Promise<Item[]> {
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('order', 'name.asc');
    if (filters?.category) params.set('category', `eq.${filters.category}`);
    if (filters?.search) params.set('name', `ilike.*${filters.search}*`);
    return this.fetchJson<Item[]>('items', params);
  }

  async listItemsWithReorderLevel(_venueId?: number): Promise<Item[]> {
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('reorder_level', 'not.is.null');
    if (_venueId !== undefined) {
      params.set('venue_id', `eq.${_venueId}`);
    }
    return this.fetchJson<Item[]>('items', params);
  }

  async getItemById(id: number): Promise<Item | undefined> {
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('id', `eq.${id}`);
    params.set('limit', '1');
    const rows = await this.fetchJson<Item[]>('items', params);
    return rows[0];
  }

  async listTransactionsForItem(itemId: number, limit: number): Promise<Transaction[]> {
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('item_id', `eq.${itemId}`);
    params.set('order', 'created_at.desc');
    params.set('limit', String(limit));
    return this.fetchJson<Transaction[]>('transactions', params);
  }

  async createItem(_input: CreateItemInput): Promise<Item> {
    const {
      name,
      category,
      unit,
      order_unit = null,
      order_unit_price = null,
      qty_per_unit = null,
      inner_unit = null,
      item_size_value = null,
      item_size_unit = null,
      item_size = null,
      reorder_level = null,
      reorder_qty = null,
    } = _input;

    const payload = {
      name,
      category,
      unit,
      order_unit,
      order_unit_price,
      qty_per_unit,
      inner_unit,
      item_size_value,
      item_size_unit,
      item_size: item_size ?? (
        item_size_value && item_size_unit ? `${item_size_value} ${item_size_unit}` : null
      ),
      reorder_level,
      reorder_qty,
    };

    const rows = await this.request<Item[]>({
      method: 'POST',
      path: 'items',
      params: new URLSearchParams({ select: '*' }),
      body: payload,
      prefer: 'return=representation',
    });
    const created = rows[0];
    if (!created) {
      throw new SupabaseStoreError(500, 'Supabase did not return created item.');
    }
    return created;
  }

  async updateItem(id: number, updates: UpdateItemInput): Promise<Item> {
    const fields = Object.entries(updates).filter(([, v]) => v !== undefined);
    if (fields.length === 0) {
      const existing = await this.getItemById(id);
      if (!existing) throw new SupabaseStoreError(404, 'Item not found');
      return existing;
    }

    const params = new URLSearchParams();
    params.set('id', `eq.${id}`);
    params.set('select', '*');

    const rows = await this.request<Item[]>({
      method: 'PATCH',
      path: 'items',
      params,
      body: updates,
      prefer: 'return=representation',
    });
    const updated = rows[0];
    if (!updated) throw new SupabaseStoreError(404, 'Item not found');
    return updated;
  }

  async countTransactionsForItem(itemId: number): Promise<number> {
    return this.count('transactions', [{ column: 'item_id', operator: 'eq', value: itemId }]);
  }

  async deleteItem(id: number): Promise<void> {
    const params = new URLSearchParams();
    params.set('id', `eq.${id}`);
    await this.request<void>({
      method: 'DELETE',
      path: 'items',
      params,
      prefer: 'return=minimal',
    });
  }

  async listTransactions(filters?: TransactionListFilters): Promise<TransactionWithItem[]> {
    const params = new URLSearchParams();
    params.set('select', 'id,item_id,type,quantity,reason,notes,created_at,items!inner(name,unit)');
    params.set('order', 'created_at.desc');
    params.set('limit', String(filters?.limit ?? 50));
    params.set('offset', String(filters?.offset ?? 0));
    if (filters?.item_id !== undefined) params.set('item_id', `eq.${filters.item_id}`);
    if (filters?.type) params.set('type', `eq.${filters.type}`);

    const rows = await this.fetchJson<SupabaseTransactionRow[]>('transactions', params);
    return rows.map((row) => ({
      id: row.id,
      item_id: row.item_id,
      type: row.type as TransactionWithItem['type'],
      quantity: row.quantity,
      reason: row.reason as TransactionWithItem['reason'],
      notes: row.notes,
      created_at: row.created_at,
      from_area_id: null,
      to_area_id: null,
      estimated_cost: null,
      vendor_price_id: null,
      item_name: row.items?.name ?? '',
      item_unit: row.items?.unit ?? '',
    }));
  }

  async insertTransactionAndAdjustQty(input: InsertTransactionAndAdjustQtyInput): Promise<{
    transaction: Transaction;
    item: Item;
  }> {
    const rows = await this.request<SupabaseRpcTransactionResult[]>({
      method: 'POST',
      path: 'rpc/inventory_insert_transaction_and_adjust_qty',
      body: {
        p_item_id: input.itemId,
        p_type: input.type,
        p_quantity: input.quantity,
        p_reason: input.reason,
        p_notes: input.notes,
      },
      prefer: 'return=representation',
    });
    const row = rows[0];
    if (!row) {
      throw new SupabaseStoreError(
        500,
        'RPC inventory_insert_transaction_and_adjust_qty returned no rows.',
      );
    }
    return {
      transaction: row.transaction_row,
      item: row.item_row,
    };
  }

  async setItemCountWithAdjustment(input: SetItemCountWithAdjustmentInput): Promise<ItemCountAdjustmentResult> {
    const rows = await this.request<SupabaseRpcCountAdjustmentResult[]>({
      method: 'POST',
      path: 'rpc/inventory_set_item_count_with_adjustment',
      body: {
        p_item_id: input.itemId,
        p_counted_qty: input.countedQty,
        p_notes: input.notes,
      },
      prefer: 'return=representation',
    });
    const row = rows[0];
    if (!row) {
      throw new SupabaseStoreError(
        500,
        'RPC inventory_set_item_count_with_adjustment returned no rows.',
      );
    }
    return {
      item: row.item_row,
      transaction: row.transaction_row,
      delta: row.delta,
    };
  }

  async listCountSessions(): Promise<CountSessionSummary[]> {
    return [];
  }

  async getOpenCountSession(): Promise<CountSession | undefined> {
    return undefined;
  }

  async createCountSession(_input: CreateCountSessionInput): Promise<CountSession> {
    return this.notImplemented('createCountSession');
  }

  async closeCountSession(_id: number, _input: CloseCountSessionInput): Promise<CountSession> {
    return this.notImplemented('closeCountSession');
  }

  async listCountEntries(_sessionId: number): Promise<CountSessionEntry[]> {
    return [];
  }

  async listCountChecklist(_sessionId: number): Promise<CountSessionChecklistItem[]> {
    return [];
  }

  async recordCountEntry(
    _sessionId: number,
    _input: { itemId: number; countedQty: number; notes: string | null }
  ): Promise<CountSessionEntry> {
    return this.notImplemented('recordCountEntry');
  }

  async getDashboardStats(_venueId?: number): Promise<DashboardStats> {
    const now = new Date();
    const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const endUtc = new Date(startUtc);
    endUtc.setUTCDate(endUtc.getUTCDate() + 1);

    // PostgREST cannot do column-to-column comparisons (current_qty <= reorder_level),
    // so we fetch items with a reorder_level and count in JS.
    const itemsWithReorder = await this.listItemsWithReorderLevel();
    const lowStock = itemsWithReorder.filter(
      (i) => i.current_qty > 0 && i.current_qty <= (i.reorder_level ?? 0)
    ).length;

    const [totalItems, outOfStock, todayTx] = await Promise.all([
      this.count('items', []),
      this.count('items', [{ column: 'current_qty', operator: 'eq', value: 0 }]),
      this.count('transactions', [
        { column: 'created_at', operator: 'gte', value: startUtc.toISOString() },
        { column: 'created_at', operator: 'lt', value: endUtc.toISOString() },
      ]),
    ]);

    return {
      total_items: totalItems,
      low_stock_count: lowStock,
      out_of_stock_count: outOfStock,
      today_transaction_count: todayTx,
      total_inventory_value: 0,
    };
  }

  async reconcile(): Promise<ReconcileOutcome> {
    const result = await this.request<{
      checked: number;
      mismatches_found: number;
      mismatches: ReconciliationResult[];
      fixed: boolean;
    }[]>({
      method: 'POST',
      path: 'rpc/inventory_reconcile',
      prefer: 'return=representation',
    });
    const row = result[0];
    if (!row) {
      throw new SupabaseStoreError(500, 'RPC inventory_reconcile returned no rows.');
    }
    return row;
  }

  // ── Bulk Operations ──────────────────────────────────────────────────

  async bulkUpdateItems(ids: number[], updates: { category: string }): Promise<{ updated: number }> {
    const params = new URLSearchParams();
    params.set('id', `in.(${ids.join(',')})`);
    params.set('select', 'id');

    const rows = await this.request<{ id: number }[]>({
      method: 'PATCH',
      path: 'items',
      params,
      body: { category: updates.category },
      prefer: 'return=representation',
    });
    return { updated: rows.length };
  }

  async bulkDeleteItems(ids: number[]): Promise<{ deleted: number; skipped: number; skippedIds: number[] }> {
    const skippedIds: number[] = [];
    const deletableIds: number[] = [];

    for (const id of ids) {
      const txCount = await this.countTransactionsForItem(id);
      if (txCount > 0) {
        skippedIds.push(id);
      } else {
        deletableIds.push(id);
      }
    }

    if (deletableIds.length > 0) {
      const params = new URLSearchParams();
      params.set('id', `in.(${deletableIds.join(',')})`);
      await this.request<void>({
        method: 'DELETE',
        path: 'items',
        params,
        prefer: 'return=minimal',
      });
    }

    return {
      deleted: deletableIds.length,
      skipped: skippedIds.length,
      skippedIds,
    };
  }

  // Storage Areas — return empty results for now (not yet implemented for Supabase)

  async listStorageAreas(): Promise<StorageArea[]> {
    return [];
  }

  async getStorageAreaById(_id: number): Promise<StorageArea | undefined> {
    return undefined;
  }

  async createStorageArea(_input: CreateStorageAreaInput): Promise<StorageArea> {
    return this.notImplemented('createStorageArea');
  }

  async updateStorageArea(_id: number, _input: UpdateStorageAreaInput): Promise<StorageArea> {
    return this.notImplemented('updateStorageArea');
  }

  async deleteStorageArea(_id: number): Promise<void> {
    return this.notImplemented('deleteStorageArea');
  }

  async countItemsInArea(_areaId: number): Promise<number> {
    return 0;
  }

  async listItemStorage(_itemId: number): Promise<ItemStorage[]> {
    return [];
  }

  async listAllItemStorage(): Promise<ItemStorage[]> {
    return [];
  }

  async getItemStorageByArea(_itemId: number, _areaId: number): Promise<ItemStorage | undefined> {
    return undefined;
  }

  // Vendors — stubs (not yet implemented for Supabase)

  async listVendors(): Promise<Vendor[]> { return []; }
  async getVendorById(_id: number): Promise<Vendor | undefined> { return undefined; }
  async createVendor(_input: CreateVendorInput): Promise<Vendor> { return this.notImplemented('createVendor'); }
  async updateVendor(_id: number, _input: UpdateVendorInput): Promise<Vendor> { return this.notImplemented('updateVendor'); }
  async deleteVendor(_id: number): Promise<void> { return this.notImplemented('deleteVendor'); }
  async countItemsForVendor(_vendorId: number): Promise<number> { return 0; }

  // Vendor Prices — stubs (not yet implemented for Supabase)
  async listVendorPricesForItem(_itemId: number): Promise<VendorPrice[]> { return []; }
  async getVendorPriceById(_id: number): Promise<VendorPrice | undefined> { return undefined; }
  async createVendorPrice(_itemId: number, _input: CreateVendorPriceInput): Promise<VendorPrice> { return this.notImplemented('createVendorPrice'); }
  async updateVendorPrice(_id: number, _input: UpdateVendorPriceInput): Promise<VendorPrice> { return this.notImplemented('updateVendorPrice'); }
  async deleteVendorPrice(_id: number): Promise<void> { return this.notImplemented('deleteVendorPrice'); }

  // Venues — stubs (not yet implemented for Supabase)

  async listVenues(): Promise<Venue[]> { return []; }
  async getVenueById(_id: number): Promise<Venue | undefined> { return undefined; }
  async createVenue(_input: CreateVenueInput): Promise<Venue> { return this.notImplemented('createVenue'); }
  async updateVenue(_id: number, _input: UpdateVenueInput): Promise<Venue> { return this.notImplemented('updateVenue'); }
  async deleteVenue(_id: number): Promise<void> { return this.notImplemented('deleteVenue'); }
  async countItemsForVenue(_venueId: number): Promise<number> { return 0; }

  // Orders — stubs (not yet implemented for Supabase)

  async listOrders(): Promise<OrderWithVendor[]> { return []; }
  async getOrderById(_id: number): Promise<OrderDetail | undefined> { return undefined; }
  async createOrder(_input: CreateOrderInput): Promise<OrderDetail> { return this.notImplemented('createOrder'); }
  async updateOrder(_id: number, _input: UpdateOrderInput): Promise<OrderDetail> { return this.notImplemented('updateOrder'); }
  async updateOrderStatus(_id: number, _status: 'sent'): Promise<Order> { return this.notImplemented('updateOrderStatus'); }
  async deleteOrder(_id: number): Promise<void> { return this.notImplemented('deleteOrder'); }

  // Reports — stubs (not yet implemented for Supabase)

  async getUsageReport(_filters: ReportFilters): Promise<UsageReport> {
    return this.notImplemented('getUsageReport');
  }

  async getWasteReport(_filters: ReportFilters): Promise<WasteReport> {
    return this.notImplemented('getWasteReport');
  }

  async getCostReport(_filters: ReportFilters): Promise<CostReport> {
    return this.notImplemented('getCostReport');
  }
}

export function createSupabaseInventoryStoreFromEnv(): SupabaseInventoryStore {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  const schema = process.env.SUPABASE_SCHEMA ?? 'public';

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) are required for Supabase store.');
  }

  return new SupabaseInventoryStore(url, key, schema);
}
