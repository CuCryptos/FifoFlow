import type { CATEGORIES, UNITS, TRANSACTION_TYPES, TRANSACTION_REASONS } from './constants.js';

export type Category = (typeof CATEGORIES)[number];
export type Unit = (typeof UNITS)[number];
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type TransactionReason = (typeof TRANSACTION_REASONS)[number];
export type CountSessionStatus = 'open' | 'closed';

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
}

export interface InvoiceParseResult {
  vendor_id: number;
  vendor_name: string;
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
