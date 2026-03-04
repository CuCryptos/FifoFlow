import type {
  CloseCountSessionInput,
  CountSession,
  CountSessionChecklistItem,
  CountSessionEntry,
  CountSessionSummary,
  CreateCountSessionInput,
  CreateItemInput,
  CreateStorageAreaInput,
  DashboardStats,
  ItemCountAdjustmentResult,
  Item,
  ItemStorage,
  ReconciliationResult,
  StorageArea,
  Transaction,
  TransactionType,
  TransactionReason,
  TransactionWithItem,
  UpdateItemInput,
  UpdateStorageAreaInput,
} from '@fifoflow/shared';

export interface ItemListFilters {
  search?: string;
  category?: string;
}

export interface TransactionListFilters {
  item_id?: number;
  type?: string;
  limit?: number;
  offset?: number;
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
  listItemsWithReorderLevel(): Promise<Item[]>;
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
  getDashboardStats(lowStockThreshold: number): Promise<DashboardStats>;
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

  // Item Storage
  listItemStorage(itemId: number): Promise<ItemStorage[]>;
  listAllItemStorage(): Promise<ItemStorage[]>;
  getItemStorageByArea(itemId: number, areaId: number): Promise<ItemStorage | undefined>;
}
