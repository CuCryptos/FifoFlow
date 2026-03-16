import React, { Suspense, lazy, useState, useEffect, useRef, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useItems, useItem, useReorderSuggestions, useUpdateItem, useBulkUpdateItems, useBulkDeleteItems, useMergeItems } from '../hooks/useItems';
import { useToast } from '../contexts/ToastContext';
import { useStorageAreas, useAllItemStorage } from '../hooks/useStorageAreas';
import { CATEGORIES, UNITS } from '@fifoflow/shared';
import type { GroupBy } from '../utils/exportInventory';
import type { Item, Transaction, Unit, ItemStorage } from '@fifoflow/shared';
import { SlideOver } from '../components/intelligence/SlideOver';
import { useVendors } from '../hooks/useVendors';
import { useVenues } from '../hooks/useVenues';
import { useVenueContext } from '../contexts/VenueContext';
import {
  WorkflowChip,
  WorkflowFocusBar,
  WorkflowMetricCard,
  WorkflowMetricGrid,
  WorkflowPage,
  WorkflowPanel,
  WorkflowStatusPill,
} from '../components/workflow/WorkflowPrimitives';

const AddItemModal = lazy(async () => ({ default: (await import('../components/AddItemModal')).AddItemModal }));
const ManageAreasModal = lazy(async () => ({ default: (await import('../components/ManageAreasModal')).ManageAreasModal }));
const ManageVendorsModal = lazy(async () => ({ default: (await import('../components/ManageVendorsModal')).ManageVendorsModal }));
const ManageVenuesModal = lazy(async () => ({ default: (await import('../components/ManageVenuesModal')).ManageVenuesModal }));
const InvoiceUpload = lazy(async () => ({ default: (await import('../components/InvoiceUpload')).InvoiceUpload }));

function formatCurrency(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

type InventoryWorkflowFocus =
  | 'all'
  | 'needs_attention'
  | 'reorder'
  | 'missing_vendor'
  | 'missing_venue'
  | 'missing_storage_area'
  | 'ordering_incomplete';

const INVENTORY_FOCUS_COPY: Record<InventoryWorkflowFocus, { title: string; body: string; tone: 'slate' | 'amber' | 'red' | 'blue' }> = {
  all: {
    title: 'Full inventory catalog',
    body: 'Use this lane to review the full operating catalog, then narrow into a specific readiness gap when you need action instead of browsing.',
    tone: 'slate',
  },
  needs_attention: {
    title: 'Attention queue',
    body: 'This lane combines reorder pressure and setup gaps so operators can work the highest-friction inventory items first.',
    tone: 'red',
  },
  reorder: {
    title: 'Reorder queue',
    body: 'These items are below their reorder level. Confirm pack setup, vendor ownership, and order quantity before issuing a PO.',
    tone: 'amber',
  },
  missing_vendor: {
    title: 'Vendor setup gap',
    body: 'These items are stocked but not anchored to a purchasing owner yet. Bulk vendor assignment should clear this lane quickly.',
    tone: 'blue',
  },
  missing_venue: {
    title: 'Venue scope gap',
    body: 'These items are not attached to an operating venue, so location-specific workflows and reporting remain incomplete.',
    tone: 'blue',
  },
  missing_storage_area: {
    title: 'Storage mapping gap',
    body: 'These items do not have a clear storage placement. That weakens count discipline and operational retrieval.',
    tone: 'blue',
  },
  ordering_incomplete: {
    title: 'Ordering setup gap',
    body: 'These items are missing reorder or pack/price fields. They are difficult to purchase accurately at scale.',
    tone: 'amber',
  },
};

/* ------------------------------------------------------------------ */
/*  InlineEdit – spreadsheet-style editable cell                      */
/* ------------------------------------------------------------------ */

function InlineEdit({
  value,
  field,
  itemId,
  type = 'text',
  placeholder = '—',
}: {
  value: string | number | null;
  field: string;
  itemId: number;
  type?: 'text' | 'number';
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const updateItem = useUpdateItem();

  // Sync local state when the prop changes (e.g. after mutation invalidation)
  useEffect(() => {
    if (!editing) {
      setLocalValue(value ?? '');
    }
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    const original = value ?? '';
    const next = String(localValue).trim();

    if (next === String(original)) return;

    let parsed: string | number | null;
    if (next === '') {
      parsed = null;
    } else if (type === 'number') {
      parsed = Number(next);
      if (Number.isNaN(parsed)) return;
    } else {
      parsed = next;
    }

    updateItem.mutate({ id: itemId, data: { [field]: parsed } });
  };

  if (!editing) {
    return (
      <span
        tabIndex={0}
        onFocus={() => setEditing(true)}
        onClick={() => setEditing(true)}
        className="block w-full cursor-text px-2 py-1 rounded-lg border border-transparent hover:bg-bg-hover text-text-primary min-h-[1.75rem] leading-[1.75rem] truncate"
        title={String(value ?? '')}
      >
        {value !== null && value !== '' ? String(value) : (
          <span className="text-text-muted">{placeholder}</span>
        )}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type={type}
      step={type === 'number' ? 'any' : undefined}
      min={type === 'number' ? '0' : undefined}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === 'Enter') inputRef.current?.blur();
        if (e.key === 'Escape') {
          setLocalValue(value ?? '');
          setEditing(false);
        }
      }}
      className="w-full bg-white border border-accent-indigo rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
    />
  );
}

function InlineInsidePrice({
  orderUnitPrice,
  qtyPerUnit,
  itemId,
  innerUnitLabel,
}: {
  orderUnitPrice: number | null;
  qtyPerUnit: number | null;
  itemId: number;
  innerUnitLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const multiplier = qtyPerUnit && qtyPerUnit > 0 ? qtyPerUnit : 1;
  const derivedInside = orderUnitPrice == null ? null : orderUnitPrice / multiplier;
  const [localValue, setLocalValue] = useState(
    derivedInside == null ? '' : String(Math.round(derivedInside * 10000) / 10000),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const updateItem = useUpdateItem();

  useEffect(() => {
    if (!editing) {
      setLocalValue(
        derivedInside == null ? '' : String(Math.round(derivedInside * 10000) / 10000),
      );
    }
  }, [derivedInside, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    const nextRaw = localValue.trim();
    const nextInside = nextRaw === '' ? null : Number(nextRaw);
    if (nextInside !== null && (Number.isNaN(nextInside) || nextInside < 0)) return;
    const nextOrder = nextInside == null ? null : Math.round(nextInside * multiplier * 10000) / 10000;
    const currentOrder = orderUnitPrice == null ? null : Math.round(orderUnitPrice * 10000) / 10000;
    if (nextOrder === currentOrder) return;
    updateItem.mutate({ id: itemId, data: { order_unit_price: nextOrder } });
  };

  if (!editing) {
    return (
      <span
        tabIndex={0}
        onFocus={() => setEditing(true)}
        onClick={() => setEditing(true)}
        className="block w-full cursor-text px-2 py-1 rounded-lg border border-transparent hover:bg-bg-hover text-text-primary min-h-[1.75rem] leading-[1.75rem] truncate"
      >
        {derivedInside == null ? (
          <span className="text-text-muted">—</span>
        ) : (
          `${formatCurrency(derivedInside)} / ${innerUnitLabel}`
        )}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      step="0.01"
      min="0"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === 'Enter') inputRef.current?.blur();
        if (e.key === 'Escape') {
          setLocalValue(
            derivedInside == null ? '' : String(Math.round(derivedInside * 10000) / 10000),
          );
          setEditing(false);
        }
      }}
      className="w-full bg-white border border-accent-indigo rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
      placeholder={`0.00 / ${innerUnitLabel}`}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  ReorderBadge                                                      */
/* ------------------------------------------------------------------ */

function ReorderBadge({
  stockQty,
  reorderLevel,
}: {
  stockQty: number;
  reorderLevel: number | null;
}) {
  if (reorderLevel === null) {
    return <span className="text-text-muted">—</span>;
  }
  if (stockQty > reorderLevel) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-md bg-badge-green-bg text-badge-green-text font-medium">
        OK
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-md bg-badge-red-bg text-badge-red-text font-medium">
      REORDER
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Sortable column helpers                                           */
/* ------------------------------------------------------------------ */

type SortField = 'name' | 'category' | 'current_qty' | 'unit' | 'reorder_level' | 'reorder_qty' | 'order_unit' | 'order_unit_price' | 'qty_per_unit' | 'storage_area_id';
type SortDir = 'asc' | 'desc';

function SortHeader({
  label,
  field,
  activeField,
  dir,
  onToggle,
  className = '',
}: {
  label: string;
  field: SortField;
  activeField: SortField;
  dir: SortDir;
  onToggle: (field: SortField) => void;
  className?: string;
}) {
  const isActive = field === activeField;
  return (
    <th
      className={`px-3 py-2.5 font-medium text-xs uppercase tracking-wide cursor-pointer select-none hover:text-text-primary transition-colors ${className}`}
      onClick={() => onToggle(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          <span className="text-accent-indigo">{dir === 'asc' ? '▲' : '▼'}</span>
        ) : (
          <span className="text-text-muted/40">▲</span>
        )}
      </span>
    </th>
  );
}

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [];
  if (current <= 3) {
    pages.push(1, 2, 3, 4, '...', total);
  } else if (current >= total - 2) {
    pages.push(1, '...', total - 3, total - 2, total - 1, total);
  } else {
    pages.push(1, '...', current - 1, current, current + 1, '...', total);
  }
  return pages;
}

/* ------------------------------------------------------------------ */
/*  Inventory Page                                                    */
/* ------------------------------------------------------------------ */

export function Inventory() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [showReorderOnly, setShowReorderOnly] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAreasModal, setShowAreasModal] = useState(false);
  const [showVendorsModal, setShowVendorsModal] = useState(false);
  const [showVenuesModal, setShowVenuesModal] = useState(false);
  const [exportGroupBy, setExportGroupBy] = useState<GroupBy>('storage_area');
  const [areaFilter, setAreaFilter] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [showOrdering, setShowOrdering] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const bulkUpdate = useBulkUpdateItems();
  const bulkDelete = useBulkDeleteItems();
  const mergeItems = useMergeItems();
  const { toast } = useToast();
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkVendorId, setBulkVendorId] = useState('');
  const [bulkVenueId, setBulkVenueId] = useState('');
  const [bulkStorageAreaId, setBulkStorageAreaId] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [showInvoiceUpload, setShowInvoiceUpload] = useState(false);
  const [workflowFocus, setWorkflowFocus] = useState<InventoryWorkflowFocus>('all');
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const { selectedVenueId } = useVenueContext();
  const updateItem = useUpdateItem();
  const { data: areas } = useStorageAreas();
  const { data: allItemStorage } = useAllItemStorage();
  const { data: vendors } = useVendors();
  const { data: venues } = useVenues();

  // Build a lookup: Map<itemId, ItemStorage[]>
  const storageByItem = useMemo(() => {
    const map = new Map<number, ItemStorage[]>();
    if (allItemStorage) {
      for (const is of allItemStorage) {
        const arr = map.get(is.item_id) ?? [];
        arr.push(is);
        map.set(is.item_id, arr);
      }
    }
    return map;
  }, [allItemStorage]);

  const toggleExpand = (itemId: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const { data: items, isLoading } = useItems({
    search: search || undefined,
    category: category || undefined,
    venue_id: selectedVenueId ?? undefined,
  });
  const { data: reorderSuggestions } = useReorderSuggestions();
  const selectedItemQuery = useItem(selectedItemId ?? 0);

  const reorderIds = new Set((reorderSuggestions ?? []).map((r) => r.item_id));
  const workflowCounts = useMemo(() => {
    const allItems = items ?? [];
    const missingVendorIds = new Set(allItems.filter((item) => item.vendor_id == null).map((item) => item.id));
    const missingVenueIds = new Set(allItems.filter((item) => item.venue_id == null).map((item) => item.id));
    const missingStorageAreaIds = new Set(allItems.filter((item) => {
      const assignedAreas = storageByItem.get(item.id) ?? [];
      return item.storage_area_id == null && assignedAreas.length === 0;
    }).map((item) => item.id));
    const orderingIncompleteIds = new Set(allItems.filter((item) => (
      item.reorder_level == null
      || item.reorder_qty == null
      || item.order_unit == null
      || item.qty_per_unit == null
      || item.order_unit_price == null
    )).map((item) => item.id));
    const needsAttentionIds = new Set<number>([
      ...reorderIds,
      ...missingVendorIds,
      ...missingVenueIds,
      ...missingStorageAreaIds,
      ...orderingIncompleteIds,
    ]);

    return {
      reorder: reorderIds,
      missingVendor: missingVendorIds,
      missingVenue: missingVenueIds,
      missingStorageArea: missingStorageAreaIds,
      orderingIncomplete: orderingIncompleteIds,
      needsAttention: needsAttentionIds,
      cards: {
        total: allItems.length,
        reorder: reorderIds.size,
        missingVendor: missingVendorIds.size,
        missingVenue: missingVenueIds.size,
        missingStorageArea: missingStorageAreaIds.size,
        orderingIncomplete: orderingIncompleteIds.size,
        needsAttention: needsAttentionIds.size,
      },
    };
  }, [items, reorderIds, storageByItem]);

  const itemsToRender = (items ?? []).filter((item) => {
    if (showReorderOnly && !reorderIds.has(item.id)) return false;
    if (areaFilter) {
      if (item.storage_area_id !== Number(areaFilter)) return false;
    }
    if (workflowFocus === 'needs_attention' && !workflowCounts.needsAttention.has(item.id)) return false;
    if (workflowFocus === 'reorder' && !workflowCounts.reorder.has(item.id)) return false;
    if (workflowFocus === 'missing_vendor' && !workflowCounts.missingVendor.has(item.id)) return false;
    if (workflowFocus === 'missing_venue' && !workflowCounts.missingVenue.has(item.id)) return false;
    if (workflowFocus === 'missing_storage_area' && !workflowCounts.missingStorageArea.has(item.id)) return false;
    if (workflowFocus === 'ordering_incomplete' && !workflowCounts.orderingIncomplete.has(item.id)) return false;
    return true;
  });
  const areaNameLookup = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of areas ?? []) m.set(a.id, a.name);
    return m;
  }, [areas]);

  const sortedItems = useMemo(() => {
    const arr = [...itemsToRender];
    arr.sort((a, b) => {
      let aVal: string | number | null | undefined;
      let bVal: string | number | null | undefined;
      if (sortField === 'storage_area_id') {
        aVal = a.storage_area_id ? areaNameLookup.get(a.storage_area_id) ?? '' : '';
        bVal = b.storage_area_id ? areaNameLookup.get(b.storage_area_id) ?? '' : '';
      } else {
        aVal = a[sortField];
        bVal = b[sortField];
      }
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const cmp = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const diff = Number(aVal) - Number(bVal);
      return sortDir === 'asc' ? diff : -diff;
    });
    return arr;
  }, [itemsToRender, sortField, sortDir, areaNameLookup]);

  const ITEMS_PER_PAGE = 50;
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const setCurrentPage = (page: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (page <= 1) {
        next.delete('page');
      } else {
        next.set('page', String(page));
      }
      return next;
    }, { replace: true });
  };

  // Reset to page 1 when filters or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, category, areaFilter, showReorderOnly, workflowFocus, sortField, sortDir]);

  const totalPages = Math.ceil(sortedItems.length / ITEMS_PER_PAGE);
  const paginatedItems = sortedItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );
  const showingStart = sortedItems.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const showingEnd = Math.min(currentPage * ITEMS_PER_PAGE, sortedItems.length);

  // Clear selection when page, filters, or sort changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentPage, search, category, areaFilter, showReorderOnly, workflowFocus, sortField, sortDir]);

  const allOnPageSelected = paginatedItems.length > 0 && paginatedItems.every((item) => selectedIds.has(item.id));

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedItems.map((item) => item.id)));
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const colSpanTotal = 1 + 9 + (showOrdering ? 5 : 1) + 3;

  const reorderSpend = (reorderSuggestions ?? []).reduce(
    (sum, suggestion) => sum + (suggestion.estimated_total_cost ?? 0),
    0,
  );

  const applyBulkWorkflowUpdate = (updates: {
    category?: string;
    vendor_id?: number | null;
    venue_id?: number | null;
    storage_area_id?: number | null;
  }, successMessage: string) => {
    bulkUpdate.mutate(
      { ids: Array.from(selectedIds), updates },
      {
        onSuccess: (data) => {
          toast(`${successMessage} (${data.updated} item${data.updated !== 1 ? 's' : ''})`, 'success');
          setSelectedIds(new Set());
          setBulkCategory('');
          setBulkVendorId('');
          setBulkVenueId('');
          setBulkStorageAreaId('');
        },
        onError: (err) => {
          toast(`Failed to update: ${err.message}`, 'error');
        },
      },
    );
  };

  const selectVisibleLaneItems = () => {
    setSelectedIds(new Set(paginatedItems.map((item) => item.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const currentFocus = INVENTORY_FOCUS_COPY[workflowFocus];

  return (
    <WorkflowPage
      eyebrow="Inventory Control"
      title="Run inventory as an operating workflow, not a spreadsheet."
      description="This surface is now oriented around reorder pressure, setup gaps, and bulk correction lanes. The inventory data remains intact, but the workflow is moving toward the same explicit, explainable model as the backend."
      actions={(
        <>
          <select
            value={exportGroupBy}
            onChange={(e) => setExportGroupBy(e.target.value as GroupBy)}
            className="rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            <option value="storage_area">Group by Area</option>
            <option value="venue">Group by Venue</option>
            <option value="vendor">Group by Vendor</option>
          </select>
          <button
            onClick={async () => {
              const aLookup = new Map((areas ?? []).map((a) => [a.id, a.name]));
              const venueLookup = new Map((venues ?? []).map((v) => [v.id, v.name]));
              const vendorLookup = new Map((vendors ?? []).map((v) => [v.id, v.name]));
              const { exportToPdf } = await import('../utils/exportInventory');
              exportToPdf({ items: sortedItems, areas: areas ?? [], areaLookup: aLookup, venueLookup, vendorLookup, groupBy: exportGroupBy, format: 'pdf' });
            }}
            className="rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
          >
            Export PDF
          </button>
          <button
            onClick={async () => {
              const aLookup = new Map((areas ?? []).map((a) => [a.id, a.name]));
              const venueLookup = new Map((venues ?? []).map((v) => [v.id, v.name]));
              const vendorLookup = new Map((vendors ?? []).map((v) => [v.id, v.name]));
              const { exportToExcel } = await import('../utils/exportInventory');
              exportToExcel({ items: sortedItems, areas: areas ?? [], areaLookup: aLookup, venueLookup, vendorLookup, groupBy: exportGroupBy, format: 'xlsx' });
            }}
            className="rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
          >
            Export Excel
          </button>
          <button
            onClick={() => setShowInvoiceUpload(true)}
            className="rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
          >
            Upload Invoice
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Add Item
          </button>
        </>
      )}
    >
      <WorkflowMetricGrid>
        <WorkflowMetricCard label="Needs Attention" value={workflowCounts.cards.needsAttention} detail="Any reorder or setup gap." tone="red" />
        <WorkflowMetricCard label="Needs Reorder" value={workflowCounts.cards.reorder} detail="Below reorder level." tone="amber" />
        <WorkflowMetricCard label="Missing Vendor" value={workflowCounts.cards.missingVendor} detail="No purchasing owner assigned." tone="blue" />
        <WorkflowMetricCard label="Ordering Incomplete" value={workflowCounts.cards.orderingIncomplete} detail="Reorder or pack/price setup missing." tone="amber" />
      </WorkflowMetricGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
        <WorkflowPanel
          title="Inventory Workflow"
          description="Choose a lane, filter the catalog, and work the exception queue directly from the current inventory data."
          actions={(
            <WorkflowFocusBar>
              {([
                ['all', `All (${workflowCounts.cards.total})`],
                ['needs_attention', `Needs Attention (${workflowCounts.cards.needsAttention})`],
                ['reorder', `Needs Reorder (${workflowCounts.cards.reorder})`],
                ['missing_vendor', `Missing Vendor (${workflowCounts.cards.missingVendor})`],
                ['missing_venue', `Missing Venue (${workflowCounts.cards.missingVenue})`],
                ['missing_storage_area', `Missing Area (${workflowCounts.cards.missingStorageArea})`],
                ['ordering_incomplete', `Ordering Incomplete (${workflowCounts.cards.orderingIncomplete})`],
              ] as const).map(([focus, label]) => (
                <WorkflowChip key={focus} active={workflowFocus === focus} onClick={() => setWorkflowFocus(focus)}>
                  {label}
                </WorkflowChip>
              ))}
            </WorkflowFocusBar>
          )}
        >
          <div className="flex flex-wrap gap-3 items-center">
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-[220px] flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="">All Areas</option>
              {areas?.map((area) => (
                <option key={area.id} value={String(area.id)}>{area.name}</option>
              ))}
            </select>
            <WorkflowChip active={showReorderOnly} onClick={() => setShowReorderOnly((value) => !value)}>
              Needs Reorder
            </WorkflowChip>
          </div>
        </WorkflowPanel>

        <WorkflowPanel
          title={currentFocus.title}
          description={currentFocus.body}
          actions={(
            <>
              <button
                type="button"
                onClick={selectVisibleLaneItems}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
              >
                Select Visible Lane Items
              </button>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                >
                  Clear Selection
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowVendorsModal(true)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
              >
                Manage Vendors
              </button>
              <button
                type="button"
                onClick={() => setShowVenuesModal(true)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
              >
                Manage Venues
              </button>
              <button
                type="button"
                onClick={() => setShowAreasModal(true)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
              >
                Manage Areas
              </button>
            </>
          )}
        >
          <div className="space-y-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current lane</div>
              <div className="mt-2">
                <WorkflowStatusPill tone={currentFocus.tone}>{currentFocus.title}</WorkflowStatusPill>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Selection rail</div>
              <div className="mt-2 text-sm text-slate-600">
                {selectedIds.size > 0
                  ? `${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'} selected for bulk action.`
                  : 'Select items from the catalog to assign ownership, location, or storage in bulk.'}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
              Estimated reorder spend for the current view:
              <div className="mt-2 font-mono text-lg text-slate-950">{formatCurrency(reorderSpend)}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Batch shortcut</div>
              <div className="text-sm text-slate-600">
                {workflowFocus === 'missing_vendor' && 'Select the lane, then bulk-assign a vendor to clear purchasing ownership gaps.'}
                {workflowFocus === 'missing_venue' && 'Select the lane, then bulk-assign the correct venue to restore scope accuracy.'}
                {workflowFocus === 'missing_storage_area' && 'Select the lane, then bulk-assign a storage area to improve count discipline.'}
                {workflowFocus === 'ordering_incomplete' && 'Select the lane, then fill reorder and pack fields directly from the ordering columns.'}
                {workflowFocus === 'reorder' && 'Select the lane, review vendor ownership, and convert the queue into orders.'}
                {(workflowFocus === 'all' || workflowFocus === 'needs_attention') && 'Use the lane filters first, then batch-correct the visible queue.'}
              </div>
              {workflowFocus === 'ordering_incomplete' && (
                <button
                  type="button"
                  onClick={() => setShowOrdering(true)}
                  className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white hover:text-slate-950"
                >
                  Open Ordering Columns
                </button>
              )}
            </div>
          </div>
        </WorkflowPanel>
      </div>

      {!!reorderSuggestions?.length && (
        <div className="bg-bg-page border border-border rounded-lg px-4 py-3 flex items-center justify-between text-sm">
          <div className="text-text-secondary">
            {reorderSuggestions.length} items need reorder
          </div>
          <div className="text-text-primary">
            Estimated spend: <span className="text-accent-amber font-mono">{formatCurrency(reorderSpend)}</span>
          </div>
        </div>
      )}

      {/* Selection actions bar */}
      {selectedIds.size > 0 && (
        <WorkflowPanel
          title="Bulk workflow actions"
          description="Use batch actions to correct ownership and setup gaps directly from the attention queue."
        >
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm font-medium text-text-primary">
            {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
          </span>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              className="bg-white border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
            >
              <option value="">Reassign category…</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <button
              onClick={() => {
                if (!bulkCategory) return;
                applyBulkWorkflowUpdate({ category: bulkCategory }, `Updated category to ${bulkCategory}`);
              }}
              disabled={!bulkCategory || bulkUpdate.isPending}
              className="bg-accent-indigo text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Apply Category
            </button>

            <select
              value={bulkVendorId}
              onChange={(e) => setBulkVendorId(e.target.value)}
              className="bg-white border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
            >
              <option value="">Assign vendor…</option>
              {(vendors ?? []).map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
            <button
              onClick={() => {
                if (!bulkVendorId) return;
                const vendorName = vendors?.find((vendor) => vendor.id === Number(bulkVendorId))?.name ?? 'vendor';
                applyBulkWorkflowUpdate({ vendor_id: Number(bulkVendorId) }, `Assigned ${vendorName}`);
              }}
              disabled={!bulkVendorId || bulkUpdate.isPending}
              className="bg-bg-page border border-border-emphasis text-text-primary px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Assign Vendor
            </button>

            <select
              value={bulkVenueId}
              onChange={(e) => setBulkVenueId(e.target.value)}
              className="bg-white border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
            >
              <option value="">Assign venue…</option>
              {(venues ?? []).map((venue) => (
                <option key={venue.id} value={venue.id}>{venue.name}</option>
              ))}
            </select>
            <button
              onClick={() => {
                if (!bulkVenueId) return;
                const venueName = venues?.find((venue) => venue.id === Number(bulkVenueId))?.name ?? 'venue';
                applyBulkWorkflowUpdate({ venue_id: Number(bulkVenueId) }, `Assigned ${venueName}`);
              }}
              disabled={!bulkVenueId || bulkUpdate.isPending}
              className="bg-bg-page border border-border-emphasis text-text-primary px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Assign Venue
            </button>

            <select
              value={bulkStorageAreaId}
              onChange={(e) => setBulkStorageAreaId(e.target.value)}
              className="bg-white border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
            >
              <option value="">Assign area…</option>
              {(areas ?? []).map((area) => (
                <option key={area.id} value={area.id}>{area.name}</option>
              ))}
            </select>
            <button
              onClick={() => {
                if (!bulkStorageAreaId) return;
                const areaName = areas?.find((area) => area.id === Number(bulkStorageAreaId))?.name ?? 'area';
                applyBulkWorkflowUpdate({ storage_area_id: Number(bulkStorageAreaId) }, `Assigned ${areaName}`);
              }}
              disabled={!bulkStorageAreaId || bulkUpdate.isPending}
              className="bg-bg-page border border-border-emphasis text-text-primary px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Assign Area
            </button>
          </div>

          <div className="ml-auto flex gap-2">
            {selectedIds.size >= 2 && (
              <button
                onClick={() => {
                  setMergeTargetId(null);
                  setShowMergeModal(true);
                }}
                className="bg-accent-indigo/10 text-accent-indigo border border-accent-indigo/30 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent-indigo/20 transition-colors"
              >
                Merge Selected
              </button>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="bg-accent-red/10 text-accent-red border border-accent-red/30 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent-red/20 transition-colors"
            >
              Delete Selected
            </button>
          </div>
        </div>
        </WorkflowPanel>
      )}

      {/* Spreadsheet table */}
      {isLoading ? (
        <div className="text-text-secondary text-sm">Loading...</div>
      ) : itemsToRender.length > 0 ? (
        <div className="bg-bg-card rounded-xl shadow-sm overflow-x-auto max-h-[calc(100vh-16rem)] overflow-y-auto">
          <table className="min-w-[1200px] w-full text-sm whitespace-nowrap">
            <thead>
              {/* Row 1 — Group headers */}
              <tr className="bg-bg-page sticky top-0 z-20">
                <th className="w-10" />
                <th colSpan={8} className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-text-muted font-medium text-left">
                  Stock
                </th>
                <th colSpan={showOrdering ? 5 : 1} className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-text-muted font-medium text-left">
                  <button
                    type="button"
                    onClick={() => setShowOrdering((v) => !v)}
                    className="cursor-pointer hover:text-text-secondary transition-colors inline-flex items-center gap-1"
                  >
                    {showOrdering ? '\u25BE' : '\u25B8'} Ordering
                  </button>
                </th>
                <th colSpan={3} className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-text-muted font-medium text-left">
                  Pricing
                </th>
              </tr>
              {/* Row 2 — Column headers */}
              <tr className="bg-bg-table-header text-text-secondary text-left sticky top-[29px] z-20 shadow-[0_1px_0_0_var(--color-border)]">
                <th className="px-3 py-2.5 w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-border text-accent-indigo focus:ring-accent-indigo/20 cursor-pointer"
                  />
                </th>
                <SortHeader label="Name" field="name" activeField={sortField} dir={sortDir} onToggle={toggleSort} />
                <SortHeader label="Category" field="category" activeField={sortField} dir={sortDir} onToggle={toggleSort} />
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Vendor</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Venue</th>
                <SortHeader label="Storage Area" field="storage_area_id" activeField={sortField} dir={sortDir} onToggle={toggleSort} />
                <SortHeader label="In Stock" field="current_qty" activeField={sortField} dir={sortDir} onToggle={toggleSort} className="text-right" />
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Unit</th>
                <SortHeader label="Reorder Level" field="reorder_level" activeField={sortField} dir={sortDir} onToggle={toggleSort} className="text-right" />
                <SortHeader label="Reorder Qty" field="reorder_qty" activeField={sortField} dir={sortDir} onToggle={toggleSort} className="text-right" />
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Reorder</th>
                {showOrdering ? (
                  <>
                    <SortHeader label="Order Unit" field="order_unit" activeField={sortField} dir={sortDir} onToggle={toggleSort} />
                    <SortHeader label="Pack Qty" field="qty_per_unit" activeField={sortField} dir={sortDir} onToggle={toggleSort} className="text-right" />
                    <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Inner Unit</th>
                    <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Size Value</th>
                    <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Size Unit</th>
                  </>
                ) : (
                  <th />
                )}
                <SortHeader label="Unit Price" field="order_unit_price" activeField={sortField} dir={sortDir} onToggle={toggleSort} className="text-right" />
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Case Price</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Total Value</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => {
                const itemAreas = storageByItem.get(item.id) ?? [];
                const hasAreas = itemAreas.length > 0;
                const insideUnitLabel = item.inner_unit ?? item.order_unit ?? item.unit;
                const totalValue =
                  item.order_unit_price != null && item.current_qty > 0
                    ? item.order_unit_price * item.current_qty
                    : null;

                return (
                <React.Fragment key={item.id}>
                  <tr
                    className="border-b border-border hover:bg-bg-hover transition-colors"
                  >
                    <td className="px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelectOne(item.id)}
                        className="rounded border-border text-accent-indigo focus:ring-accent-indigo/20 cursor-pointer"
                      />
                    </td>
                    {/* Name – link to detail with expand toggle */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleExpand(item.id)}
                          className={`text-xs w-4 h-4 flex items-center justify-center rounded hover:bg-bg-hover transition-colors ${
                            hasAreas ? 'text-text-muted hover:text-text-primary' : 'text-transparent cursor-default'
                          }`}
                          tabIndex={hasAreas ? 0 : -1}
                          aria-label={expandedItems.has(item.id) ? 'Collapse' : 'Expand'}
                        >
                          {expandedItems.has(item.id) ? '\u25BE' : '\u25B8'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedItemId(item.id)}
                          className="text-left text-accent-indigo hover:underline"
                        >
                          {item.name}
                        </button>
                      </div>
                    </td>

                    {/* Category – editable */}
                    <td className="px-3 py-2">
                      <select
                        value={item.category}
                        onChange={(e) => {
                          updateItem.mutate({ id: item.id, data: { category: e.target.value as typeof item.category } });
                        }}
                        className="bg-white border border-transparent hover:border-border focus:border-accent-indigo rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none cursor-pointer"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>

                    {/* Vendor – inline select */}
                    <td className="px-3 py-2">
                      <select
                        value={item.vendor_id ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : null;
                          updateItem.mutate({ id: item.id, data: { vendor_id: val } });
                        }}
                        className="bg-white border border-transparent hover:border-border focus:border-accent-indigo rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none cursor-pointer"
                      >
                        <option value="">—</option>
                        {(vendors ?? []).map((v) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                    </td>

                    {/* Venue – inline select */}
                    <td className="px-3 py-2">
                      <select
                        value={item.venue_id ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : null;
                          updateItem.mutate({ id: item.id, data: { venue_id: val } });
                        }}
                        className="bg-white border border-transparent hover:border-border focus:border-accent-indigo rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none cursor-pointer"
                      >
                        <option value="">—</option>
                        {(venues ?? []).map((v) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                    </td>

                    {/* Storage Area – inline select */}
                    <td className="px-3 py-2">
                      <select
                        value={item.storage_area_id ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : null;
                          updateItem.mutate({ id: item.id, data: { storage_area_id: val } });
                        }}
                        className="bg-white border border-transparent hover:border-border focus:border-accent-indigo rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none cursor-pointer"
                      >
                        <option value="">—</option>
                        {(areas ?? []).map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </td>

                    {/* Stock Qty – inline edit */}
                    <td className="px-3 py-2 text-right">
                      <InlineEdit
                        value={item.current_qty}
                        field="current_qty"
                        itemId={item.id}
                        type="number"
                      />
                    </td>

                    {/* Unit – editable */}
                    <td className="px-3 py-2">
                      <select
                        value={item.unit}
                        onChange={(e) => {
                          updateItem.mutate({ id: item.id, data: { unit: e.target.value as Unit } });
                        }}
                        className="bg-white border border-transparent hover:border-border focus:border-accent-indigo rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none cursor-pointer"
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </td>

                    {/* Reorder Level – inline edit number */}
                    <td className="px-3 py-2 text-right">
                      <InlineEdit
                        value={item.reorder_level}
                        field="reorder_level"
                        itemId={item.id}
                        type="number"
                      />
                    </td>

                    {/* Reorder Qty – inline edit number */}
                    <td className="px-3 py-2 text-right">
                      <InlineEdit
                        value={item.reorder_qty}
                        field="reorder_qty"
                        itemId={item.id}
                        type="number"
                      />
                    </td>

                    {/* Reorder – auto badge */}
                    <td className="px-3 py-2">
                      <ReorderBadge
                        stockQty={item.current_qty}
                        reorderLevel={item.reorder_level}
                      />
                    </td>

                    {/* ORDERING columns */}
                    {showOrdering ? (
                      <>
                        {/* Order Unit – inline select */}
                        <td className="px-3 py-2">
                          <select
                            value={item.order_unit ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const val: Unit | null = raw ? (raw as Unit) : null;
                              updateItem.mutate({
                                id: item.id,
                                data: { order_unit: val },
                              });
                            }}
                            className="bg-white border border-transparent hover:border-border focus:border-accent-indigo rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none cursor-pointer"
                          >
                            <option value="">—</option>
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Pack Qty – inline edit number */}
                        <td className="px-3 py-2 text-right">
                          <InlineEdit
                            value={item.qty_per_unit}
                            field="qty_per_unit"
                            itemId={item.id}
                            type="number"
                          />
                        </td>

                        {/* Inner Unit – inline select */}
                        <td className="px-3 py-2">
                          <select
                            value={item.inner_unit ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const val: Unit | null = raw ? (raw as Unit) : null;
                              updateItem.mutate({
                                id: item.id,
                                data: { inner_unit: val },
                              });
                            }}
                            className="bg-white border border-transparent hover:border-border focus:border-accent-indigo rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none cursor-pointer"
                          >
                            <option value="">—</option>
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Size Value – inline edit number */}
                        <td className="px-3 py-2 text-right">
                          <InlineEdit
                            value={item.item_size_value}
                            field="item_size_value"
                            itemId={item.id}
                            type="number"
                          />
                        </td>

                        {/* Size Unit – inline select */}
                        <td className="px-3 py-2">
                          <select
                            value={item.item_size_unit ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const val: Unit | null = raw ? (raw as Unit) : null;
                              updateItem.mutate({
                                id: item.id,
                                data: { item_size_unit: val },
                              });
                            }}
                            className="bg-white border border-transparent hover:border-border focus:border-accent-indigo rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none cursor-pointer"
                          >
                            <option value="">—</option>
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>
                      </>
                    ) : (
                      <td />
                    )}

                    {/* PRICING columns – always visible */}
                    {/* Unit Price – computed from order price / qty per unit */}
                    <td className="px-3 py-2 text-right text-text-primary">
                      <InlineInsidePrice
                        orderUnitPrice={item.order_unit_price}
                        qtyPerUnit={item.qty_per_unit}
                        itemId={item.id}
                        innerUnitLabel={insideUnitLabel}
                      />
                    </td>

                    {/* Case Price – inline edit number */}
                    <td className="px-3 py-2 text-right">
                      <InlineEdit
                        value={item.order_unit_price}
                        field="order_unit_price"
                        itemId={item.id}
                        type="number"
                      />
                    </td>

                    {/* Total Value – current_qty × unit price */}
                    <td className="px-3 py-2 text-right text-text-primary font-mono tabular-nums">
                      {formatCurrency(totalValue)}
                    </td>
                  </tr>
                  {expandedItems.has(item.id) && hasAreas && (
                    <tr className="bg-bg-area-row">
                      <td colSpan={colSpanTotal} className="px-3 py-2 pl-10">
                        <div className="flex flex-wrap gap-4 text-xs text-text-secondary">
                          {itemAreas.map((is) => (
                            <span key={is.area_id}>
                              {is.area_name}: <span className="text-text-primary font-mono font-medium">{is.quantity}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-bg-page">
                <td colSpan={colSpanTotal} className="px-4 py-3 text-sm text-text-secondary">
                  <div className="flex items-center justify-between">
                    <span>
                      Showing {showingStart}–{showingEnd} of {sortedItems.length} items
                    </span>
                    {totalPages > 1 && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                          className="px-2 py-1 rounded text-xs border border-border hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        {getPageNumbers(currentPage, totalPages).map((p, i) =>
                          p === '...' ? (
                            <span key={`ellipsis-${i}`} className="px-1 text-text-muted">…</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => setCurrentPage(p as number)}
                              className={`px-2 py-1 rounded text-xs border ${
                                p === currentPage
                                  ? 'bg-accent-indigo text-white border-accent-indigo'
                                  : 'border-border hover:bg-bg-hover'
                              }`}
                            >
                              {p}
                            </button>
                          )
                        )}
                        <button
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
                          className="px-2 py-1 rounded text-xs border border-border hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="text-text-secondary text-sm">No items found.</div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-bg-card rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-text-primary mb-2">Confirm Delete</h3>
            <p className="text-sm text-text-secondary mb-4">
              Delete {selectedIds.size} selected item{selectedIds.size > 1 ? 's' : ''}? Items with transaction history will be skipped.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm border border-border text-text-secondary hover:bg-bg-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  bulkDelete.mutate(
                    { ids: Array.from(selectedIds) },
                    {
                      onSuccess: (data) => {
                        let msg = `Deleted ${data.deleted} item${data.deleted !== 1 ? 's' : ''}`;
                        if (data.skipped > 0) {
                          msg += `, ${data.skipped} skipped (have transaction history)`;
                        }
                        toast(msg, data.skipped > 0 ? 'info' : 'success');
                        setSelectedIds(new Set());
                        setShowDeleteConfirm(false);
                      },
                      onError: (err) => {
                        toast(`Failed to delete: ${err.message}`, 'error');
                        setShowDeleteConfirm(false);
                      },
                    },
                  );
                }}
                disabled={bulkDelete.isPending}
                className="bg-accent-red text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-red/90 disabled:opacity-40 transition-colors"
              >
                {bulkDelete.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedItemId != null && (
        <SlideOver
          title={selectedItemQuery.data?.item.name ?? 'Inventory Item'}
          subtitle="Operational item detail from the live inventory dataset."
          onClose={() => setSelectedItemId(null)}
        >
          {selectedItemQuery.isLoading || !selectedItemQuery.data?.item ? (
            <div className="text-sm text-text-secondary">Loading item detail...</div>
          ) : (
            <InventoryItemSidePanel
              item={selectedItemQuery.data.item}
              transactions={selectedItemQuery.data.transactions}
              areas={areas ?? []}
              vendors={vendors ?? []}
              venues={venues ?? []}
            />
          )}
        </SlideOver>
      )}

      <Suspense fallback={null}>
        {showAddModal && (
          <AddItemModal onClose={() => setShowAddModal(false)} />
        )}
        {showAreasModal && (
          <ManageAreasModal onClose={() => setShowAreasModal(false)} />
        )}
        {showVendorsModal && (
          <ManageVendorsModal onClose={() => setShowVendorsModal(false)} />
        )}
        {showVenuesModal && (
          <ManageVenuesModal onClose={() => setShowVenuesModal(false)} />
        )}
        {showInvoiceUpload && (
          <InvoiceUpload onClose={() => setShowInvoiceUpload(false)} />
        )}
      </Suspense>

      {/* Merge Modal */}
      {showMergeModal && (() => {
        const selectedItems = (items ?? []).filter((item) => selectedIds.has(item.id));
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-bg-card rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-text-primary mb-2">Merge Items</h3>
              <p className="text-sm text-text-secondary mb-4">
                Select the target (canonical) item. All other items will be merged into it.
              </p>
              <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                {selectedItems.map((item) => (
                  <label
                    key={item.id}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                      mergeTargetId === item.id ? 'bg-accent-indigo/10 border border-accent-indigo/30' : 'hover:bg-bg-hover border border-transparent'
                    }`}
                  >
                    <input
                      type="radio"
                      name="merge-target"
                      checked={mergeTargetId === item.id}
                      onChange={() => setMergeTargetId(item.id)}
                      className="text-accent-indigo focus:ring-accent-indigo/20"
                    />
                    <div>
                      <div className="text-sm font-medium text-text-primary">{item.name}</div>
                      <div className="text-xs text-text-muted">{item.category} · {item.current_qty} {item.unit}</div>
                    </div>
                  </label>
                ))}
              </div>
              {mergeTargetId && (
                <p className="text-xs text-text-muted mb-4 bg-bg-page p-2 rounded">
                  Merge {selectedItems.length - 1} item{selectedItems.length - 1 !== 1 ? 's' : ''} into{' '}
                  <strong>{selectedItems.find((i) => i.id === mergeTargetId)?.name}</strong>.
                  Transaction history, vendor prices, and storage quantities will be consolidated.
                </p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowMergeModal(false)}
                  className="px-4 py-2 rounded-lg text-sm border border-border text-text-secondary hover:bg-bg-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!mergeTargetId) return;
                    const sourceIds = Array.from(selectedIds).filter((id) => id !== mergeTargetId);
                    mergeItems.mutate(
                      { target_id: mergeTargetId, source_ids: sourceIds },
                      {
                        onSuccess: (data) => {
                          const parts = [`Merged ${data.merged_count} items`];
                          if (data.transactions_moved > 0) parts.push(`${data.transactions_moved} transactions moved`);
                          if (data.vendor_prices_created > 0) parts.push(`${data.vendor_prices_created} vendor prices created`);
                          toast(parts.join(', '), 'success');
                          setSelectedIds(new Set());
                          setShowMergeModal(false);
                        },
                        onError: (err) => {
                          toast(`Merge failed: ${err.message}`, 'error');
                        },
                      },
                    );
                  }}
                  disabled={!mergeTargetId || mergeItems.isPending}
                  className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {mergeItems.isPending ? 'Merging...' : 'Merge'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </WorkflowPage>
  );
}

function InventoryItemSidePanel({
  item,
  transactions,
  areas,
  vendors,
  venues,
}: {
  item: Item;
  transactions: Transaction[];
  areas: Array<{ id: number; name: string }>;
  vendors: Array<{ id: number; name: string }>;
  venues: Array<{ id: number; name: string }>;
}) {
  type InventoryItemPanelDraft = {
    category: Item['category'];
    vendor_id: string;
    venue_id: string;
    storage_area_id: string;
    reorder_level: string;
    reorder_qty: string;
    order_unit: '' | Unit;
    qty_per_unit: string;
    order_unit_price: string;
  };

  const updateItem = useUpdateItem();
  const { toast } = useToast();
  const [draft, setDraft] = useState<InventoryItemPanelDraft>({
    category: item.category,
    vendor_id: item.vendor_id == null ? '' : String(item.vendor_id),
    venue_id: item.venue_id == null ? '' : String(item.venue_id),
    storage_area_id: item.storage_area_id == null ? '' : String(item.storage_area_id),
    reorder_level: item.reorder_level == null ? '' : String(item.reorder_level),
    reorder_qty: item.reorder_qty == null ? '' : String(item.reorder_qty),
    order_unit: item.order_unit ?? '',
    qty_per_unit: item.qty_per_unit == null ? '' : String(item.qty_per_unit),
    order_unit_price: item.order_unit_price == null ? '' : String(item.order_unit_price),
  });

  useEffect(() => {
    setDraft({
      category: item.category,
      vendor_id: item.vendor_id == null ? '' : String(item.vendor_id),
      venue_id: item.venue_id == null ? '' : String(item.venue_id),
      storage_area_id: item.storage_area_id == null ? '' : String(item.storage_area_id),
      reorder_level: item.reorder_level == null ? '' : String(item.reorder_level),
      reorder_qty: item.reorder_qty == null ? '' : String(item.reorder_qty),
      order_unit: item.order_unit ?? '',
      qty_per_unit: item.qty_per_unit == null ? '' : String(item.qty_per_unit),
      order_unit_price: item.order_unit_price == null ? '' : String(item.order_unit_price),
    });
  }, [item]);

  const vendorName = vendors.find((vendor) => vendor.id === item.vendor_id)?.name ?? 'Unassigned';
  const venueName = venues.find((venue) => venue.id === item.venue_id)?.name ?? 'Unassigned';
  const areaName = areas.find((area) => area.id === item.storage_area_id)?.name ?? 'Unassigned';
  const reorderStatus = item.reorder_level != null && item.current_qty <= item.reorder_level ? 'Needs reorder' : 'In range';
  const totalValue = item.order_unit_price != null ? item.order_unit_price * item.current_qty : null;
  const saveQuickEdits = () => {
    updateItem.mutate(
      {
        id: item.id,
        data: {
          category: draft.category as typeof item.category,
          vendor_id: draft.vendor_id ? Number(draft.vendor_id) : null,
          venue_id: draft.venue_id ? Number(draft.venue_id) : null,
          storage_area_id: draft.storage_area_id ? Number(draft.storage_area_id) : null,
          reorder_level: draft.reorder_level === '' ? null : Number(draft.reorder_level),
          reorder_qty: draft.reorder_qty === '' ? null : Number(draft.reorder_qty),
          order_unit: draft.order_unit === '' ? null : draft.order_unit as Unit,
          qty_per_unit: draft.qty_per_unit === '' ? null : Number(draft.qty_per_unit),
          order_unit_price: draft.order_unit_price === '' ? null : Number(draft.order_unit_price),
        },
      },
      {
        onSuccess: () => toast('Inventory item updated', 'success'),
        onError: (error) => toast(error.message, 'error'),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <DetailTile label="Category" value={item.category} />
        <DetailTile label="On Hand" value={`${item.current_qty} ${item.unit}`} />
        <DetailTile label="Vendor" value={vendorName} />
        <DetailTile label="Venue" value={venueName} />
        <DetailTile label="Storage Area" value={areaName} />
        <DetailTile label="Reorder Status" value={reorderStatus} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Quick actions</div>
          <button
            type="button"
            onClick={saveQuickEdits}
            disabled={updateItem.isPending}
            className="rounded-full bg-slate-950 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {updateItem.isPending ? 'Saving...' : 'Save edits'}
          </button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Category</span>
            <select
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as Item['category'] }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              {CATEGORIES.map((categoryOption) => (
                <option key={categoryOption} value={categoryOption}>{categoryOption}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Vendor</span>
            <select
              value={draft.vendor_id}
              onChange={(event) => setDraft((current) => ({ ...current, vendor_id: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="">Unassigned</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Venue</span>
            <select
              value={draft.venue_id}
              onChange={(event) => setDraft((current) => ({ ...current, venue_id: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="">Unassigned</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>{venue.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Storage area</span>
            <select
              value={draft.storage_area_id}
              onChange={(event) => setDraft((current) => ({ ...current, storage_area_id: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="">Unassigned</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>{area.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reorder level</span>
            <input
              type="number"
              min="0"
              step="any"
              value={draft.reorder_level}
              onChange={(event) => setDraft((current) => ({ ...current, reorder_level: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reorder qty</span>
            <input
              type="number"
              min="0"
              step="any"
              value={draft.reorder_qty}
              onChange={(event) => setDraft((current) => ({ ...current, reorder_qty: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Order unit</span>
            <select
              value={draft.order_unit}
              onChange={(event) => setDraft((current) => ({ ...current, order_unit: event.target.value as '' | Unit }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="">Missing</option>
              {UNITS.map((unitOption) => (
                <option key={unitOption} value={unitOption}>{unitOption}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pack qty</span>
            <input
              type="number"
              min="0"
              step="any"
              value={draft.qty_per_unit}
              onChange={(event) => setDraft((current) => ({ ...current, qty_per_unit: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Case price</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.order_unit_price}
              onChange={(event) => setDraft((current) => ({ ...current, order_unit_price: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Ordering setup</div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <DetailTile label="Order Unit" value={item.order_unit ?? 'Missing'} />
          <DetailTile label="Pack Qty" value={item.qty_per_unit ?? 'Missing'} />
          <DetailTile label="Case Price" value={formatCurrency(item.order_unit_price)} />
          <DetailTile label="Estimated Value" value={formatCurrency(totalValue)} />
          <DetailTile label="Reorder Level" value={item.reorder_level ?? 'Missing'} />
          <DetailTile label="Reorder Qty" value={item.reorder_qty ?? 'Missing'} />
        </div>
        <div className="mt-4">
          <Link
            to={`/inventory/${item.id}`}
            className="inline-flex rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white hover:text-slate-950"
          >
            Open full item page
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recent activity</div>
        <div className="mt-3 space-y-2">
          {transactions.length === 0 ? (
            <div className="text-sm text-slate-600">No transactions recorded for this item yet.</div>
          ) : (
            transactions.slice(0, 8).map((transaction: Transaction) => (
              <div key={transaction.id} className="rounded-xl bg-slate-50 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-900">
                    {transaction.type === 'in' ? '+' : '-'}{transaction.quantity} {item.unit}
                  </div>
                  <div className="text-xs text-slate-500">{new Date(transaction.created_at).toLocaleString()}</div>
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {transaction.reason}
                  {transaction.notes ? ` • ${transaction.notes}` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DetailTile({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value == null ? '—' : String(value)}</div>
    </div>
  );
}
