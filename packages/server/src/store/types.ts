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
  MergeItemsResult,
  Order,
  OrderDetail,
  OrderItem,
  OrderWithVendor,
  ReconciliationResult,
  StorageArea,
  Transaction,
  TransactionType,
  TransactionReason,
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

export interface ItemListFilters {
  search?: string;
  category?: string;
  venueId?: number;
}

export interface TransactionListFilters {
  item_id?: number;
  type?: string;
  limit?: number;
  offset?: number;
  venueId?: number;
}

export interface ReportFilters {
  start: string;
  end: string;
  groupBy?: string;
  venueId?: number;
}

export interface InsertTransactionAndAdjustQtyInput {
  itemId: number;
  type: TransactionType;
  quantity: number;
  reason: TransactionReason;
  notes: string | null;
  delta: number;
  fromAreaId?: number | null;
  toAreaId?: number | null;
  estimatedCost?: number | null;
  vendorPriceId?: number | null;
}

export interface SetItemCountWithAdjustmentInput {
  itemId: number;
  countedQty: number;
  notes: string | null;
}

export interface ReconcileOutcome {
  checked: number;
  mismatches_found: number;
  mismatches: ReconciliationResult[];
  fixed: boolean;
}

export class StoreMethodNotImplementedError extends Error {
  public readonly status = 501;

  constructor(method: string) {
    super(`${method} is not implemented for this store.`);
    this.name = 'StoreMethodNotImplementedError';
  }
}

export interface InventoryStore {
  listItems(filters?: ItemListFilters): Promise<Item[]>;
  listItemsWithReorderLevel(venueId?: number): Promise<Item[]>;
  getItemById(id: number): Promise<Item | undefined>;
  listTransactionsForItem(itemId: number, limit: number): Promise<Transaction[]>;
  createItem(input: CreateItemInput): Promise<Item>;
  updateItem(id: number, updates: UpdateItemInput): Promise<Item>;
  countTransactionsForItem(itemId: number): Promise<number>;
  deleteItem(id: number): Promise<void>;
  listTransactions(filters?: TransactionListFilters): Promise<TransactionWithItem[]>;
  insertTransactionAndAdjustQty(input: InsertTransactionAndAdjustQtyInput): Promise<{
    transaction: Transaction;
    item: Item;
  }>;
  setItemCountWithAdjustment(input: SetItemCountWithAdjustmentInput): Promise<ItemCountAdjustmentResult>;
  listCountSessions(): Promise<CountSessionSummary[]>;
  getOpenCountSession(): Promise<CountSession | undefined>;
  createCountSession(input: CreateCountSessionInput): Promise<CountSession>;
  closeCountSession(id: number, input: CloseCountSessionInput): Promise<CountSession>;
  listCountEntries(sessionId: number): Promise<CountSessionEntry[]>;
  listCountChecklist(sessionId: number): Promise<CountSessionChecklistItem[]>;
  recordCountEntry(sessionId: number, input: { itemId: number; countedQty: number; notes: string | null }): Promise<CountSessionEntry>;
  getDashboardStats(venueId?: number): Promise<DashboardStats>;
  reconcile(): Promise<ReconcileOutcome>;

  // Storage Areas
  listStorageAreas(): Promise<StorageArea[]>;
  getStorageAreaById(id: number): Promise<StorageArea | undefined>;
  createStorageArea(input: CreateStorageAreaInput): Promise<StorageArea>;
  updateStorageArea(id: number, input: UpdateStorageAreaInput): Promise<StorageArea>;
  deleteStorageArea(id: number): Promise<void>;
  countItemsInArea(areaId: number): Promise<number>;

  // Bulk operations
  bulkUpdateItems(ids: number[], updates: { category: string }): Promise<{ updated: number }>;
  bulkDeleteItems(ids: number[]): Promise<{ deleted: number; skipped: number; skippedIds: number[] }>;
  mergeItems(targetId: number, sourceIds: number[]): Promise<MergeItemsResult>;

  // Item Storage
  listItemStorage(itemId: number): Promise<ItemStorage[]>;
  listAllItemStorage(): Promise<ItemStorage[]>;
  getItemStorageByArea(itemId: number, areaId: number): Promise<ItemStorage | undefined>;

  // Vendors
  listVendors(): Promise<Vendor[]>;
  getVendorById(id: number): Promise<Vendor | undefined>;
  createVendor(input: CreateVendorInput): Promise<Vendor>;
  updateVendor(id: number, input: UpdateVendorInput): Promise<Vendor>;
  deleteVendor(id: number): Promise<void>;
  countItemsForVendor(vendorId: number): Promise<number>;

  // Vendor Prices
  listVendorPricesForItem(itemId: number): Promise<VendorPrice[]>;
  getVendorPriceById(id: number): Promise<VendorPrice | undefined>;
  createVendorPrice(itemId: number, input: CreateVendorPriceInput): Promise<VendorPrice>;
  updateVendorPrice(id: number, input: UpdateVendorPriceInput): Promise<VendorPrice>;
  deleteVendorPrice(id: number): Promise<void>;

  // Orders
  listOrders(): Promise<OrderWithVendor[]>;
  getOrderById(id: number): Promise<OrderDetail | undefined>;
  createOrder(input: CreateOrderInput): Promise<OrderDetail>;
  updateOrder(id: number, input: UpdateOrderInput): Promise<OrderDetail>;
  updateOrderStatus(id: number, status: 'sent'): Promise<Order>;
  deleteOrder(id: number): Promise<void>;

  // Venues
  listVenues(): Promise<Venue[]>;
  getVenueById(id: number): Promise<Venue | undefined>;
  createVenue(input: CreateVenueInput): Promise<Venue>;
  updateVenue(id: number, input: UpdateVenueInput): Promise<Venue>;
  deleteVenue(id: number): Promise<void>;
  countItemsForVenue(venueId: number): Promise<number>;

  // Reports
  getUsageReport(filters: ReportFilters): Promise<UsageReport>;
  getWasteReport(filters: ReportFilters): Promise<WasteReport>;
  getCostReport(filters: ReportFilters): Promise<CostReport>;
}
