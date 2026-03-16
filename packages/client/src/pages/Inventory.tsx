import { Suspense, lazy, useState, useEffect, useMemo } from 'react';
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
import { InventoryUnitEconomicsSummary, deriveInventoryUnitEconomics } from '../components/inventory/InventoryUnitEconomicsSummary';
import {
  WorkflowChip,
  WorkflowEmptyState,
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

type SortField = 'name' | 'category' | 'current_qty' | 'unit' | 'reorder_level' | 'reorder_qty' | 'order_unit' | 'order_unit_price' | 'qty_per_unit' | 'storage_area_id';
type SortDir = 'asc' | 'desc';

const SORT_FIELD_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'category', label: 'Category' },
  { value: 'current_qty', label: 'On hand quantity' },
  { value: 'reorder_level', label: 'Reorder level' },
  { value: 'reorder_qty', label: 'Reorder quantity' },
  { value: 'storage_area_id', label: 'Storage area' },
  { value: 'order_unit', label: 'Order unit' },
  { value: 'qty_per_unit', label: 'Pack quantity' },
  { value: 'order_unit_price', label: 'Case price' },
];

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

  const { selectedVenueId } = useVenueContext();
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

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const toggleVisibleLaneSelection = () => {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
      return;
    }
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
                onClick={toggleVisibleLaneSelection}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
              >
                {allOnPageSelected ? 'Clear Visible Lane Selection' : 'Select Visible Lane Items'}
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

      <WorkflowPanel
        title="Inventory Queue"
        description="The catalog is now condensed into operator cards. Each card keeps stocking, assignment, and purchasing readiness visible without forcing horizontal scroll."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sort</span>
              <select
                value={sortField}
                onChange={(event) => setSortField(event.target.value as SortField)}
                className="bg-transparent text-sm text-slate-900 focus:outline-none"
                aria-label="Sort inventory cards by"
              >
                {SORT_FIELD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setSortDir((value) => (value === 'asc' ? 'desc' : 'asc'))}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
            >
              {sortDir === 'asc' ? 'Ascending' : 'Descending'}
            </button>
            <WorkflowChip active={showOrdering} onClick={() => setShowOrdering((value) => !value)}>
              {showOrdering ? 'Hide purchasing detail' : 'Show purchasing detail'}
            </WorkflowChip>
          </div>
        )}
      >
        {isLoading ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
            Loading the live inventory queue...
          </div>
        ) : sortedItems.length > 0 ? (
          <div className="space-y-5">
            <div className="grid gap-4 xl:grid-cols-2">
              {paginatedItems.map((item) => {
                const itemAreas = storageByItem.get(item.id) ?? [];
                const hasAreas = itemAreas.length > 0;
                const reorderNeeded = item.reorder_level != null && item.current_qty <= item.reorder_level;
                const missingVendor = workflowCounts.missingVendor.has(item.id);
                const missingVenue = workflowCounts.missingVenue.has(item.id);
                const missingStorageArea = workflowCounts.missingStorageArea.has(item.id);
                const orderingIncomplete = workflowCounts.orderingIncomplete.has(item.id);
                const totalValue = item.order_unit_price != null && item.current_qty > 0
                  ? item.order_unit_price * item.current_qty
                  : null;
                const unitCost = item.order_unit_price != null && item.qty_per_unit && item.qty_per_unit > 0
                  ? item.order_unit_price / item.qty_per_unit
                  : null;
                const economics = deriveInventoryUnitEconomics({
                  baseUnit: item.unit,
                  orderUnit: item.order_unit,
                  orderUnitPrice: item.order_unit_price,
                  qtyPerUnit: item.qty_per_unit,
                  innerUnit: item.inner_unit,
                  itemSizeValue: item.item_size_value,
                  itemSizeUnit: item.item_size_unit,
                });
                const vendorName = vendors?.find((vendor) => vendor.id === item.vendor_id)?.name ?? 'Vendor missing';
                const venueName = venues?.find((venue) => venue.id === item.venue_id)?.name ?? 'Venue missing';
                const storageName = item.storage_area_id != null
                  ? areaNameLookup.get(item.storage_area_id) ?? 'Area assigned'
                  : hasAreas
                    ? `${itemAreas.length} area balance${itemAreas.length === 1 ? '' : 's'}`
                    : 'Storage area missing';
                const insideUnitLabel = item.inner_unit ?? item.order_unit ?? item.unit;
                const issuePills = [
                  missingVendor ? { label: 'Missing vendor', tone: 'blue' as const } : null,
                  missingVenue ? { label: 'Missing venue', tone: 'blue' as const } : null,
                  missingStorageArea ? { label: 'Missing area', tone: 'blue' as const } : null,
                  orderingIncomplete ? { label: 'Ordering incomplete', tone: 'amber' as const } : null,
                ].filter((value): value is { label: string; tone: 'blue' | 'amber' } => value !== null);

                return (
                  <article
                    key={item.id}
                    className="flex h-full flex-col rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="flex items-start gap-4">
                      <label className="mt-1 flex min-h-6 min-w-6 items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelectOne(item.id)}
                          aria-label={`Select ${item.name}`}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
                        />
                      </label>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setSelectedItemId(item.id)}
                              className="truncate text-left text-lg font-semibold text-slate-950 transition hover:text-slate-700"
                            >
                              {item.name}
                            </button>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                              <span>{item.category}</span>
                              <span className="text-slate-300">•</span>
                              <span>{item.current_qty} {item.unit} on hand</span>
                              <span className="text-slate-300">•</span>
                              <span>{selectedIds.has(item.id) ? 'Selected for workflow actions' : 'Available in queue'}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <WorkflowStatusPill tone={reorderNeeded ? 'amber' : 'green'}>
                              {reorderNeeded ? 'Needs reorder' : 'In range'}
                            </WorkflowStatusPill>
                            <WorkflowStatusPill tone={orderingIncomplete ? 'amber' : 'slate'}>
                              {orderingIncomplete ? 'Setup gap' : 'Setup complete'}
                            </WorkflowStatusPill>
                          </div>
                        </div>

                        {issuePills.length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {issuePills.map((issue) => (
                              <WorkflowStatusPill key={issue.label} tone={issue.tone}>
                                {issue.label}
                              </WorkflowStatusPill>
                            ))}
                          </div>
                        )}

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <InventoryKeyStat
                            label="On hand"
                            value={`${item.current_qty} ${item.unit}`}
                            note={reorderNeeded && item.reorder_level != null ? `Threshold ${item.reorder_level} ${item.unit}` : 'Current stocked quantity'}
                          />
                          <InventoryKeyStat
                            label="Vendor"
                            value={vendorName}
                            note={item.vendor_id == null ? 'Assign purchasing ownership' : 'Current purchasing owner'}
                            tone={missingVendor ? 'blue' : 'default'}
                          />
                          <InventoryKeyStat
                            label="Storage"
                            value={storageName}
                            note={missingStorageArea ? 'Storage routing incomplete' : hasAreas ? 'Area balances available below' : 'Primary area assignment'}
                            tone={missingStorageArea ? 'blue' : 'default'}
                          />
                          <InventoryKeyStat
                            label="Value"
                            value={formatCurrency(totalValue)}
                            note={item.order_unit_price != null ? `${formatCurrency(item.order_unit_price)} case price` : 'Cost not set'}
                            tone={item.order_unit_price == null ? 'amber' : 'default'}
                          />
                        </div>

                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Unit chain</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-700">
                            {economics.packLine && <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{economics.packLine}</span>}
                            {economics.eachLine && <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{economics.eachLine}</span>}
                            {economics.costLine && <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">{economics.costLine}</span>}
                            {!economics.packLine && !economics.eachLine && !economics.costLine && (
                              <span className="text-slate-600">Pack math is still incomplete for this item.</span>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)]">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-4">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Operational ownership</div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <InventoryDetailRow label="Venue" value={venueName} />
                              <InventoryDetailRow label="Reorder target" value={item.reorder_qty != null ? `${item.reorder_qty} ${item.unit}` : 'Missing'} />
                              <InventoryDetailRow label="Primary area" value={item.storage_area_id != null ? areaNameLookup.get(item.storage_area_id) ?? 'Assigned' : 'Missing'} />
                              <InventoryDetailRow label="Pack base unit" value={insideUnitLabel} />
                            </div>
                          </div>

                          {showOrdering ? (
                            <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#f7fbff_0%,#ffffff_100%)] px-4 py-4">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Purchasing detail</div>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <InventoryDetailRow label="Order unit" value={item.order_unit ?? 'Missing'} />
                                <InventoryDetailRow label="Pack quantity" value={item.qty_per_unit ?? 'Missing'} />
                                <InventoryDetailRow label="Unit cost" value={formatCurrency(unitCost)} />
                                <InventoryDetailRow label="Case cost" value={formatCurrency(item.order_unit_price)} />
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4">
                              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Purchasing detail</div>
                              <p className="mt-2 text-sm leading-6 text-slate-600">
                                Keep this panel collapsed when you are triaging the queue quickly. Turn it on when you need pack and cost setup while resolving ordering gaps.
                              </p>
                            </div>
                          )}
                        </div>

                        {hasAreas && (
                          <div className="mt-4">
                            <button
                              type="button"
                              onClick={() => toggleExpand(item.id)}
                              aria-expanded={expandedItems.has(item.id)}
                              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                            >
                              {expandedItems.has(item.id) ? 'Hide area balances' : `Show area balances (${itemAreas.length})`}
                            </button>
                            {expandedItems.has(item.id) && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {itemAreas.map((area) => (
                                  <div key={area.area_id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                    <span className="font-medium text-slate-900">{area.area_name}</span>
                                    <span className="mx-2 text-slate-300">•</span>
                                    <span>{area.quantity} {item.unit}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                          <div className="text-sm text-slate-600">
                            {reorderNeeded
                              ? 'This item is below its reorder threshold and should be reviewed in the current operating cycle.'
                              : 'This item is stocked within range. Use the side panel for assignment or pack corrections.'}
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedItemId(item.id)}
                            className="inline-flex min-h-11 items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                          >
                            Open item workflow
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-900">
                    Showing {showingStart}–{showingEnd} of {sortedItems.length} items
                  </div>
                  <div className="text-sm text-slate-600">
                    Page {currentPage} of {Math.max(totalPages, 1)}. Bulk actions only apply to the visible selected cards.
                  </div>
                </div>
                {totalPages > 1 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:opacity-40 disabled:hover:border-slate-300"
                    >
                      Previous
                    </button>
                    {getPageNumbers(currentPage, totalPages).map((pageNumber, index) => (
                      pageNumber === '...' ? (
                        <span key={`ellipsis-${index}`} className="px-1 text-sm text-slate-400">…</span>
                      ) : (
                        <button
                          key={pageNumber}
                          onClick={() => setCurrentPage(pageNumber)}
                          className={pageNumber === currentPage
                            ? 'rounded-full bg-slate-950 px-3 py-1.5 text-sm font-semibold text-white'
                            : 'rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950'}
                        >
                          {pageNumber}
                        </button>
                      )
                    ))}
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:opacity-40 disabled:hover:border-slate-300"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <WorkflowEmptyState
            title="No inventory items match this lane."
            body="Adjust the queue filters or switch workflow lanes to bring items back into view."
          />
        )}
      </WorkflowPanel>

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
    unit: '' | Unit;
    reorder_level: string;
    reorder_qty: string;
    order_unit: '' | Unit;
    qty_per_unit: string;
    inner_unit: '' | Unit;
    item_size_value: string;
    item_size_unit: '' | Unit;
    order_unit_price: string;
  };
  type DraftField = keyof InventoryItemPanelDraft;
  type FieldSaveState = 'idle' | 'saving' | 'saved' | 'rolled_back';
  const emptyFieldStates = (): Record<DraftField, FieldSaveState> => ({
    category: 'idle',
    vendor_id: 'idle',
    venue_id: 'idle',
    storage_area_id: 'idle',
    unit: 'idle',
    reorder_level: 'idle',
    reorder_qty: 'idle',
    order_unit: 'idle',
    qty_per_unit: 'idle',
    inner_unit: 'idle',
    item_size_value: 'idle',
    item_size_unit: 'idle',
    order_unit_price: 'idle',
  });
  const emptySavedAt = (): Record<DraftField, number | null> => ({
    category: null,
    vendor_id: null,
    venue_id: null,
    storage_area_id: null,
    unit: null,
    reorder_level: null,
    reorder_qty: null,
    order_unit: null,
    qty_per_unit: null,
    inner_unit: null,
    item_size_value: null,
    item_size_unit: null,
    order_unit_price: null,
  });

  const updateItem = useUpdateItem();
  const { toast } = useToast();
  const [draft, setDraft] = useState<InventoryItemPanelDraft>({
    category: item.category,
    vendor_id: item.vendor_id == null ? '' : String(item.vendor_id),
    venue_id: item.venue_id == null ? '' : String(item.venue_id),
    storage_area_id: item.storage_area_id == null ? '' : String(item.storage_area_id),
    unit: item.unit,
    reorder_level: item.reorder_level == null ? '' : String(item.reorder_level),
    reorder_qty: item.reorder_qty == null ? '' : String(item.reorder_qty),
    order_unit: item.order_unit ?? '',
    qty_per_unit: item.qty_per_unit == null ? '' : String(item.qty_per_unit),
    inner_unit: item.inner_unit ?? '',
    item_size_value: item.item_size_value == null ? '' : String(item.item_size_value),
    item_size_unit: item.item_size_unit ?? '',
    order_unit_price: item.order_unit_price == null ? '' : String(item.order_unit_price),
  });
  const [fieldStates, setFieldStates] = useState<Record<DraftField, FieldSaveState>>(emptyFieldStates);
  const [fieldSavedAt, setFieldSavedAt] = useState<Record<DraftField, number | null>>(emptySavedAt);
  const [groupBanner, setGroupBanner] = useState<{
    assignments: { tone: 'success' | 'error'; message: string } | null;
    ordering: { tone: 'success' | 'error'; message: string } | null;
  }>({
    assignments: null,
    ordering: null,
  });
  const [fieldRollbackReasons, setFieldRollbackReasons] = useState<Record<DraftField, string | null>>({
    category: null,
    vendor_id: null,
    venue_id: null,
    storage_area_id: null,
    unit: null,
    reorder_level: null,
    reorder_qty: null,
    order_unit: null,
    qty_per_unit: null,
    inner_unit: null,
    item_size_value: null,
    item_size_unit: null,
    order_unit_price: null,
  });

  useEffect(() => {
    setDraft({
      category: item.category,
      vendor_id: item.vendor_id == null ? '' : String(item.vendor_id),
      venue_id: item.venue_id == null ? '' : String(item.venue_id),
      storage_area_id: item.storage_area_id == null ? '' : String(item.storage_area_id),
      unit: item.unit,
      reorder_level: item.reorder_level == null ? '' : String(item.reorder_level),
      reorder_qty: item.reorder_qty == null ? '' : String(item.reorder_qty),
      order_unit: item.order_unit ?? '',
      qty_per_unit: item.qty_per_unit == null ? '' : String(item.qty_per_unit),
      inner_unit: item.inner_unit ?? '',
      item_size_value: item.item_size_value == null ? '' : String(item.item_size_value),
      item_size_unit: item.item_size_unit ?? '',
      order_unit_price: item.order_unit_price == null ? '' : String(item.order_unit_price),
    });
    setFieldStates(emptyFieldStates());
    setFieldSavedAt(emptySavedAt());
    setGroupBanner({
      assignments: null,
      ordering: null,
    });
    setFieldRollbackReasons({
      category: null,
      vendor_id: null,
      venue_id: null,
      storage_area_id: null,
      unit: null,
      reorder_level: null,
      reorder_qty: null,
      order_unit: null,
      qty_per_unit: null,
      inner_unit: null,
      item_size_value: null,
      item_size_unit: null,
      order_unit_price: null,
    });
  }, [item]);

  useEffect(() => {
    const timers: number[] = [];
    (['assignments', 'ordering'] as const).forEach((key) => {
      if (groupBanner[key]?.tone === 'success') {
        const timer = window.setTimeout(() => {
          setGroupBanner((current) => (
            current[key]?.tone === 'success'
              ? { ...current, [key]: null }
              : current
          ));
        }, 5000);
        timers.push(timer);
      }
    });
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [groupBanner]);

  const vendorName = vendors.find((vendor) => vendor.id === item.vendor_id)?.name ?? 'Unassigned';
  const venueName = venues.find((venue) => venue.id === item.venue_id)?.name ?? 'Unassigned';
  const areaName = areas.find((area) => area.id === item.storage_area_id)?.name ?? 'Unassigned';
  const reorderStatus = item.reorder_level != null && item.current_qty <= item.reorder_level ? 'Needs reorder' : 'In range';
  const totalValue = item.order_unit_price != null ? item.order_unit_price * item.current_qty : null;
  const currentEconomics = deriveInventoryUnitEconomics({
    baseUnit: item.unit,
    orderUnit: item.order_unit,
    orderUnitPrice: item.order_unit_price,
    qtyPerUnit: item.qty_per_unit,
    innerUnit: item.inner_unit,
    itemSizeValue: item.item_size_value,
    itemSizeUnit: item.item_size_unit,
  });
  const assignmentFields: DraftField[] = ['category', 'vendor_id', 'venue_id', 'storage_area_id'];
  const orderingFields: DraftField[] = ['unit', 'reorder_level', 'reorder_qty', 'order_unit', 'qty_per_unit', 'inner_unit', 'item_size_value', 'item_size_unit', 'order_unit_price'];
  const changedFields = (Object.entries(draft) as Array<[DraftField, string]>)
    .filter(([field, value]) => {
      switch (field) {
        case 'category':
          return value !== item.category;
        case 'vendor_id':
          return value !== (item.vendor_id == null ? '' : String(item.vendor_id));
        case 'venue_id':
          return value !== (item.venue_id == null ? '' : String(item.venue_id));
        case 'storage_area_id':
          return value !== (item.storage_area_id == null ? '' : String(item.storage_area_id));
        case 'unit':
          return value !== item.unit;
        case 'reorder_level':
          return value !== (item.reorder_level == null ? '' : String(item.reorder_level));
        case 'reorder_qty':
          return value !== (item.reorder_qty == null ? '' : String(item.reorder_qty));
        case 'order_unit':
          return value !== (item.order_unit ?? '');
        case 'qty_per_unit':
          return value !== (item.qty_per_unit == null ? '' : String(item.qty_per_unit));
        case 'inner_unit':
          return value !== (item.inner_unit ?? '');
        case 'item_size_value':
          return value !== (item.item_size_value == null ? '' : String(item.item_size_value));
        case 'item_size_unit':
          return value !== (item.item_size_unit ?? '');
        case 'order_unit_price':
          return value !== (item.order_unit_price == null ? '' : String(item.order_unit_price));
        default:
          return false;
      }
    })
    .map(([field]) => field);
  const assignmentChangedFields = assignmentFields.filter((field) => changedFields.includes(field));
  const orderingChangedFields = orderingFields.filter((field) => changedFields.includes(field));
  const assignmentFieldStates = Object.fromEntries(assignmentFields.map((field) => [field, fieldStates[field]])) as Record<DraftField, FieldSaveState>;
  const orderingFieldStates = Object.fromEntries(orderingFields.map((field) => [field, fieldStates[field]])) as Record<DraftField, FieldSaveState>;

  const buildPatchForFields = (fields: DraftField[]) => {
    const patch: Record<string, string | number | null> = {};
    fields.forEach((field) => {
      switch (field) {
        case 'category':
          patch.category = draft.category;
          break;
        case 'vendor_id':
          patch.vendor_id = draft.vendor_id ? Number(draft.vendor_id) : null;
          break;
        case 'venue_id':
          patch.venue_id = draft.venue_id ? Number(draft.venue_id) : null;
          break;
        case 'storage_area_id':
          patch.storage_area_id = draft.storage_area_id ? Number(draft.storage_area_id) : null;
          break;
        case 'unit':
          patch.unit = draft.unit as Unit;
          break;
        case 'reorder_level':
          patch.reorder_level = draft.reorder_level === '' ? null : Number(draft.reorder_level);
          break;
        case 'reorder_qty':
          patch.reorder_qty = draft.reorder_qty === '' ? null : Number(draft.reorder_qty);
          break;
        case 'order_unit':
          patch.order_unit = draft.order_unit === '' ? null : draft.order_unit;
          break;
        case 'qty_per_unit':
          patch.qty_per_unit = draft.qty_per_unit === '' ? null : Number(draft.qty_per_unit);
          break;
        case 'inner_unit':
          patch.inner_unit = draft.inner_unit === '' ? null : draft.inner_unit;
          break;
        case 'item_size_value':
          patch.item_size_value = draft.item_size_value === '' ? null : Number(draft.item_size_value);
          break;
        case 'item_size_unit':
          patch.item_size_unit = draft.item_size_unit === '' ? null : draft.item_size_unit;
          break;
        case 'order_unit_price':
          patch.order_unit_price = draft.order_unit_price === '' ? null : Number(draft.order_unit_price);
          break;
      }
    });
    return patch;
  };

  const saveFieldGroup = (fields: DraftField[], label: string, groupKey: 'assignments' | 'ordering') => {
    const fieldsToSave = fields.filter((field) => changedFields.includes(field));
    if (fieldsToSave.length === 0) {
      return;
    }
    setGroupBanner((current) => ({
      ...current,
      [groupKey]: null,
    }));
    setFieldStates((current) => {
      const next = { ...current };
      fieldsToSave.forEach((field) => {
        next[field] = 'saving';
      });
      return next;
    });
    setFieldRollbackReasons((current) => {
      const next = { ...current };
      fieldsToSave.forEach((field) => {
        next[field] = null;
      });
      return next;
    });
    updateItem.mutate(
      {
        id: item.id,
        data: buildPatchForFields(fieldsToSave),
      },
      {
        onSuccess: () => {
          const savedAt = Date.now();
          setFieldStates((current) => {
            const next = { ...current };
            fieldsToSave.forEach((field) => {
              next[field] = 'saved';
            });
            return next;
          });
          setFieldSavedAt((current) => {
            const next = { ...current };
            fieldsToSave.forEach((field) => {
              next[field] = savedAt;
            });
            return next;
          });
          setFieldRollbackReasons((current) => {
            const next = { ...current };
            fieldsToSave.forEach((field) => {
              next[field] = null;
            });
            return next;
          });
          window.setTimeout(() => {
            setFieldStates((current) => {
              const next = { ...current };
              fieldsToSave.forEach((field) => {
                if (next[field] === 'saved') {
                  next[field] = 'idle';
                }
              });
              return next;
            });
          }, 1800);
          setGroupBanner((current) => ({
            ...current,
            [groupKey]: {
              tone: 'success',
              message: `${label} saved. The persisted item state now matches this panel.`,
            },
          }));
          toast(`${label} saved`, 'success');
        },
        onError: (error) => {
          const reason = error.message || 'Save failed';
          setFieldStates((current) => {
            const next = { ...current };
            fieldsToSave.forEach((field) => {
              next[field] = 'rolled_back';
            });
            return next;
          });
          setFieldRollbackReasons((current) => {
            const next = { ...current };
            fieldsToSave.forEach((field) => {
              next[field] = reason;
            });
            return next;
          });
          window.setTimeout(() => {
            setFieldStates((current) => {
              const next = { ...current };
              fieldsToSave.forEach((field) => {
                if (next[field] === 'rolled_back') {
                  next[field] = 'idle';
                }
              });
              return next;
            });
          }, 2200);
          setGroupBanner((current) => ({
            ...current,
            [groupKey]: {
              tone: 'error',
              message: `${label} rolled back. ${reason}`,
            },
          }));
          toast(reason, 'error');
        },
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
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Assignments</div>
            <div className="mt-1 text-sm text-slate-600">Save ownership and stocking assignments separately from ordering setup.</div>
          </div>
          <div className="flex items-center gap-3">
            <FieldStateSummary changedCount={assignmentChangedFields.length} fieldStates={assignmentFieldStates} />
            <button
              type="button"
              onClick={() => saveFieldGroup(assignmentFields, 'Assignments', 'assignments')}
              disabled={updateItem.isPending || assignmentChangedFields.length === 0}
              className="rounded-full bg-slate-950 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {updateItem.isPending ? 'Saving...' : assignmentChangedFields.length === 0 ? 'No changes' : 'Save assignments'}
            </button>
          </div>
        </div>
        {groupBanner.assignments && (
          <StickyGroupBanner
            tone={groupBanner.assignments.tone}
            message={groupBanner.assignments.message}
            onDismiss={() => setGroupBanner((current) => ({ ...current, assignments: null }))}
          />
        )}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Category</span>
            <select
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as Item['category'] }))}
              className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.category)}`}
            >
              {CATEGORIES.map((categoryOption) => (
                <option key={categoryOption} value={categoryOption}>{categoryOption}</option>
              ))}
            </select>
            <FieldStateHint state={fieldStates.category} dirty={changedFields.includes('category')} savedAt={fieldSavedAt.category} rollbackReason={fieldRollbackReasons.category} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Vendor</span>
            <select
              value={draft.vendor_id}
              onChange={(event) => setDraft((current) => ({ ...current, vendor_id: event.target.value }))}
              className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.vendor_id)}`}
            >
              <option value="">Unassigned</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
            <FieldStateHint state={fieldStates.vendor_id} dirty={changedFields.includes('vendor_id')} savedAt={fieldSavedAt.vendor_id} rollbackReason={fieldRollbackReasons.vendor_id} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Venue</span>
            <select
              value={draft.venue_id}
              onChange={(event) => setDraft((current) => ({ ...current, venue_id: event.target.value }))}
              className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.venue_id)}`}
            >
              <option value="">Unassigned</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>{venue.name}</option>
              ))}
            </select>
            <FieldStateHint state={fieldStates.venue_id} dirty={changedFields.includes('venue_id')} savedAt={fieldSavedAt.venue_id} rollbackReason={fieldRollbackReasons.venue_id} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Storage area</span>
            <select
              value={draft.storage_area_id}
              onChange={(event) => setDraft((current) => ({ ...current, storage_area_id: event.target.value }))}
              className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.storage_area_id)}`}
            >
              <option value="">Unassigned</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>{area.name}</option>
              ))}
            </select>
            <FieldStateHint state={fieldStates.storage_area_id} dirty={changedFields.includes('storage_area_id')} savedAt={fieldSavedAt.storage_area_id} rollbackReason={fieldRollbackReasons.storage_area_id} />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Tracking and purchasing setup</div>
            <div className="mt-1 text-sm text-slate-600">Set the counted unit, the purchase pack, and the measurable content recipes rely on. Save this separately from ownership assignments.</div>
          </div>
          <div className="flex items-center gap-3">
            <FieldStateSummary changedCount={orderingChangedFields.length} fieldStates={orderingFieldStates} />
            <button
              type="button"
              onClick={() => saveFieldGroup(orderingFields, 'Tracking and purchasing setup', 'ordering')}
              disabled={updateItem.isPending || orderingChangedFields.length === 0}
              className="rounded-full bg-slate-950 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {updateItem.isPending ? 'Saving...' : orderingChangedFields.length === 0 ? 'No changes' : 'Save unit economics'}
            </button>
          </div>
        </div>
        {groupBanner.ordering && (
          <StickyGroupBanner
            tone={groupBanner.ordering.tone}
            message={groupBanner.ordering.message}
            onDismiss={() => setGroupBanner((current) => ({ ...current, ordering: null }))}
          />
        )}
        <div className="mt-3">
          <InventoryUnitEconomicsSummary
            compact
            input={{
              baseUnit: draft.unit,
              orderUnit: draft.order_unit,
              orderUnitPrice: draft.order_unit_price,
              qtyPerUnit: draft.qty_per_unit,
              innerUnit: draft.inner_unit,
              itemSizeValue: draft.item_size_value,
              itemSizeUnit: draft.item_size_unit,
            }}
          />
        </div>
        <div className="mt-4 grid gap-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Count and reorder controls</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Tracking unit</span>
                <select
                  value={draft.unit}
                  onChange={(event) => setDraft((current) => ({ ...current, unit: event.target.value as Unit }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.unit)}`}
                >
                  {UNITS.map((unitOption) => (
                    <option key={unitOption} value={unitOption}>{unitOption}</option>
                  ))}
                </select>
                <FieldStateHint state={fieldStates.unit} dirty={changedFields.includes('unit')} savedAt={fieldSavedAt.unit} rollbackReason={fieldRollbackReasons.unit} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reorder level</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.reorder_level}
                  onChange={(event) => setDraft((current) => ({ ...current, reorder_level: event.target.value }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.reorder_level)}`}
                />
                <FieldStateHint state={fieldStates.reorder_level} dirty={changedFields.includes('reorder_level')} savedAt={fieldSavedAt.reorder_level} rollbackReason={fieldRollbackReasons.reorder_level} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reorder qty</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.reorder_qty}
                  onChange={(event) => setDraft((current) => ({ ...current, reorder_qty: event.target.value }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.reorder_qty)}`}
                />
                <FieldStateHint state={fieldStates.reorder_qty} dirty={changedFields.includes('reorder_qty')} savedAt={fieldSavedAt.reorder_qty} rollbackReason={fieldRollbackReasons.reorder_qty} />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Purchase pack</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Purchase unit</span>
                <select
                  value={draft.order_unit}
                  onChange={(event) => setDraft((current) => ({ ...current, order_unit: event.target.value as '' | Unit }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.order_unit)}`}
                >
                  <option value="">Missing</option>
                  {UNITS.map((unitOption) => (
                    <option key={unitOption} value={unitOption}>{unitOption}</option>
                  ))}
                </select>
                <FieldStateHint state={fieldStates.order_unit} dirty={changedFields.includes('order_unit')} savedAt={fieldSavedAt.order_unit} rollbackReason={fieldRollbackReasons.order_unit} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Case / pack price</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.order_unit_price}
                  onChange={(event) => setDraft((current) => ({ ...current, order_unit_price: event.target.value }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.order_unit_price)}`}
                />
                <FieldStateHint state={fieldStates.order_unit_price} dirty={changedFields.includes('order_unit_price')} savedAt={fieldSavedAt.order_unit_price} rollbackReason={fieldRollbackReasons.order_unit_price} />
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Counted units in each purchase</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.qty_per_unit}
                  onChange={(event) => setDraft((current) => ({ ...current, qty_per_unit: event.target.value }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.qty_per_unit)}`}
                />
                <FieldStateHint state={fieldStates.qty_per_unit} dirty={changedFields.includes('qty_per_unit')} savedAt={fieldSavedAt.qty_per_unit} rollbackReason={fieldRollbackReasons.qty_per_unit} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Individual counted unit</span>
                <select
                  value={draft.inner_unit}
                  onChange={(event) => setDraft((current) => ({ ...current, inner_unit: event.target.value as '' | Unit }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.inner_unit)}`}
                >
                  <option value="">Use tracking unit</option>
                  {UNITS.map((unitOption) => (
                    <option key={unitOption} value={unitOption}>{unitOption}</option>
                  ))}
                </select>
                <FieldStateHint state={fieldStates.inner_unit} dirty={changedFields.includes('inner_unit')} savedAt={fieldSavedAt.inner_unit} rollbackReason={fieldRollbackReasons.inner_unit} />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Measurable content for recipes and usage</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Content per counted unit</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.item_size_value}
                  onChange={(event) => setDraft((current) => ({ ...current, item_size_value: event.target.value }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.item_size_value)}`}
                />
                <FieldStateHint state={fieldStates.item_size_value} dirty={changedFields.includes('item_size_value')} savedAt={fieldSavedAt.item_size_value} rollbackReason={fieldRollbackReasons.item_size_value} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Measurable unit</span>
                <select
                  value={draft.item_size_unit}
                  onChange={(event) => setDraft((current) => ({ ...current, item_size_unit: event.target.value as '' | Unit }))}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${fieldClassName(fieldStates.item_size_unit)}`}
                >
                  <option value="">Missing</option>
                  {UNITS.map((unitOption) => (
                    <option key={unitOption} value={unitOption}>{unitOption}</option>
                  ))}
                </select>
                <FieldStateHint state={fieldStates.item_size_unit} dirty={changedFields.includes('item_size_unit')} savedAt={fieldSavedAt.item_size_unit} rollbackReason={fieldRollbackReasons.item_size_unit} />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current live unit economics</div>
        <div className="mt-3">
          <InventoryUnitEconomicsSummary
            compact
            input={{
              baseUnit: item.unit,
              orderUnit: item.order_unit,
              orderUnitPrice: item.order_unit_price,
              qtyPerUnit: item.qty_per_unit,
              innerUnit: item.inner_unit,
              itemSizeValue: item.item_size_value,
              itemSizeUnit: item.item_size_unit,
            }}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <DetailTile label="Tracked in" value={item.unit} />
          <DetailTile label="Reorder status" value={reorderStatus} />
          <DetailTile label="Estimated inventory value" value={formatCurrency(totalValue)} />
          <DetailTile label="Recipe usage support" value={currentEconomics.measurableUnit ? `Yes • ${currentEconomics.measurableUnit}` : 'Limited'} />
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

function InventoryKeyStat({
  label,
  value,
  note,
  tone = 'default',
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'default' | 'amber' | 'blue';
}) {
  const className = tone === 'amber'
    ? 'border-amber-200 bg-amber-50/70'
    : tone === 'blue'
      ? 'border-sky-200 bg-sky-50/70'
      : 'border-slate-200 bg-white';

  return (
    <div className={`rounded-2xl border px-4 py-3 ${className}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-base font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-sm leading-5 text-slate-600">{note}</div>
    </div>
  );
}

function InventoryDetailRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl bg-white/80 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{String(value)}</div>
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

function fieldClassName(state: 'idle' | 'saving' | 'saved' | 'rolled_back'): string {
  if (state === 'saving') return 'border-amber-300 bg-amber-50';
  if (state === 'saved') return 'border-emerald-300 bg-emerald-50';
  if (state === 'rolled_back') return 'border-rose-300 bg-rose-50';
  return 'border-slate-200 bg-slate-50';
}

function FieldStateHint({
  state,
  dirty,
  savedAt,
  rollbackReason,
}: {
  state: 'idle' | 'saving' | 'saved' | 'rolled_back';
  dirty: boolean;
  savedAt: number | null;
  rollbackReason: string | null;
}) {
  if (state === 'idle' && !dirty && savedAt == null) return null;
  const text = state === 'saving'
    ? 'Saving...'
    : state === 'saved'
      ? 'Saved'
      : state === 'rolled_back'
        ? `Rolled back${rollbackReason ? `: ${rollbackReason}` : ''}`
        : dirty
          ? 'Unsaved change'
          : `Last saved ${formatFieldSavedAt(savedAt)}`;
  const className = state === 'saving'
    ? 'text-amber-700'
    : state === 'saved'
      ? 'text-emerald-700'
      : state === 'rolled_back'
        ? 'text-rose-700'
        : dirty
          ? 'text-slate-600'
          : 'text-slate-500';

  return <div className={`text-[11px] font-medium ${className}`}>{text}</div>;
}

function formatFieldSavedAt(savedAt: number | null): string {
  if (savedAt == null) {
    return 'recently';
  }
  return new Date(savedAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function FieldStateSummary({
  changedCount,
  fieldStates,
}: {
  changedCount: number;
  fieldStates: Record<string, 'idle' | 'saving' | 'saved' | 'rolled_back'>;
}) {
  const states = Object.values(fieldStates);
  if (states.includes('saving')) {
    return <span className="text-xs font-medium text-amber-700">Saving updated fields...</span>;
  }
  if (states.includes('rolled_back')) {
    return <span className="text-xs font-medium text-rose-700">Some fields rolled back after a failed save.</span>;
  }
  if (states.includes('saved')) {
    return <span className="text-xs font-medium text-emerald-700">Updated fields saved.</span>;
  }
  return (
    <span className="text-xs text-slate-500">
      {changedCount > 0 ? `${changedCount} unsaved field${changedCount === 1 ? '' : 's'}` : 'No unsaved changes'}
    </span>
  );
}

function StickyGroupBanner({
  tone,
  message,
  onDismiss,
}: {
  tone: 'success' | 'error';
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-3 flex items-start justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
        tone === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-rose-200 bg-rose-50 text-rose-800'
      }`}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-full border border-current/20 px-2 py-0.5 text-xs font-medium transition hover:bg-white/40"
        aria-label="Dismiss save status"
      >
        Dismiss
      </button>
    </div>
  );
}
