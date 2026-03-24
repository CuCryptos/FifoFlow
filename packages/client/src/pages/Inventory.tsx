import { Suspense, lazy, useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useItems, useItem, useReorderSuggestions, useUpdateItem, useBulkUpdateItems, useBulkDeleteItems, useMergeItems } from '../hooks/useItems';
import {
  useInventoryWorkflow,
  type InventoryExportGroupBy,
  type InventoryWorkflowFocus,
} from '../hooks/useInventoryWorkflow';
import { useInventorySelection } from '../hooks/useInventorySelection';
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
import { InventoryBatchActions } from '../components/inventory/InventoryBatchActions';
import { InventoryFiltersBar } from '../components/inventory/InventoryFiltersBar';
import { INVENTORY_FOCUS_COPY, InventoryLaneCard } from '../components/inventory/InventoryLaneCard';
import { InventoryQueueCard } from '../components/inventory/InventoryQueueCard';
import {
  WorkflowEmptyState,
  WorkflowMetricCard,
  WorkflowMetricGrid,
  WorkflowPage,
  WorkflowPanel,
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

function inventoryActionHint({
  reorderNeeded,
  missingVendor,
  missingVenue,
  missingStorageArea,
  orderingIncomplete,
}: {
  reorderNeeded: boolean;
  missingVendor: boolean;
  missingVenue: boolean;
  missingStorageArea: boolean;
  orderingIncomplete: boolean;
}) {
  if (missingVendor) return 'Assign a vendor so purchasing can move.';
  if (missingVenue) return 'Attach the venue so this item returns to operating scope.';
  if (missingStorageArea) return 'Map a storage area to restore count discipline.';
  if (orderingIncomplete) return 'Complete pack and cost fields before issuing orders.';
  if (reorderNeeded) return 'Review the pack setup and convert the shortage into a PO.';
  return 'No active blocker. Open the item for full assignment or purchasing edits.';
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
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const bulkUpdate = useBulkUpdateItems();
  const bulkDelete = useBulkDeleteItems();
  const mergeItems = useMergeItems();
  const { toast } = useToast();
  const {
    search,
    setSearch,
    category,
    setCategory,
    areaFilter,
    setAreaFilter,
    showReorderOnly,
    setShowReorderOnly,
    exportGroupBy,
    setExportGroupBy,
    sortField,
    setSortField,
    sortDir,
    setSortDir,
    workflowFocus,
    setWorkflowFocus,
    showOrdering,
    setShowOrdering,
    bulkCategory,
    setBulkCategory,
    bulkVendorId,
    setBulkVendorId,
    bulkVenueId,
    setBulkVenueId,
    bulkStorageAreaId,
    setBulkStorageAreaId,
    showAddModal,
    setShowAddModal,
    showAreasModal,
    setShowAreasModal,
    showVendorsModal,
    setShowVendorsModal,
    showVenuesModal,
    setShowVenuesModal,
    showInvoiceUpload,
    setShowInvoiceUpload,
    showDeleteConfirm,
    setShowDeleteConfirm,
    showMergeModal,
    setShowMergeModal,
    mergeTargetId,
    setMergeTargetId,
    selectedItemId,
    setSelectedItemId,
    resetFilters,
    resetBulkActions,
  } = useInventoryWorkflow();

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
  const paginatedItemIds = useMemo(() => paginatedItems.map((item) => item.id), [paginatedItems]);
  const {
    selectedIds,
    selectedCount,
    visibleSelectionCount,
    allVisibleSelected,
    clearSelection,
    toggleSelectOne,
    isSelected,
    toggleVisibleSelection,
  } = useInventorySelection({ visibleIds: paginatedItemIds });
  const showingStart = sortedItems.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const showingEnd = Math.min(currentPage * ITEMS_PER_PAGE, sortedItems.length);

  useEffect(() => {
    clearSelection();
  }, [clearSelection, currentPage, search, category, areaFilter, showReorderOnly, workflowFocus, sortField, sortDir]);

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
          clearSelection();
          resetBulkActions();
        },
        onError: (err) => {
          toast(`Failed to update: ${err.message}`, 'error');
        },
      },
    );
  };

  const currentFocus = INVENTORY_FOCUS_COPY[workflowFocus];
  const laneCards: Array<{ focus: InventoryWorkflowFocus; count: number }> = [
    { focus: 'all', count: workflowCounts.cards.total },
    { focus: 'needs_attention', count: workflowCounts.cards.needsAttention },
    { focus: 'reorder', count: workflowCounts.cards.reorder },
    { focus: 'missing_vendor', count: workflowCounts.cards.missingVendor },
    { focus: 'missing_venue', count: workflowCounts.cards.missingVenue },
    { focus: 'missing_storage_area', count: workflowCounts.cards.missingStorageArea },
    { focus: 'ordering_incomplete', count: workflowCounts.cards.orderingIncomplete },
  ];
  const selectedItems = (items ?? []).filter((item) => selectedIds.has(item.id));
  return (
    <WorkflowPage
      eyebrow="Inventory Control"
      title="Run inventory as an operating workflow, not a spreadsheet."
      description="This surface is now oriented around reorder pressure, setup gaps, and bulk correction lanes. The inventory data remains intact, but the workflow is moving toward the same explicit, explainable model as the backend."
      actions={(
        <>
          <select
            value={exportGroupBy}
            onChange={(e) => setExportGroupBy(e.target.value as InventoryExportGroupBy)}
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
              exportToPdf({ items: sortedItems, areas: areas ?? [], areaLookup: aLookup, venueLookup, vendorLookup, groupBy: exportGroupBy as GroupBy, format: 'pdf' });
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
              exportToExcel({ items: sortedItems, areas: areas ?? [], areaLookup: aLookup, venueLookup, vendorLookup, groupBy: exportGroupBy as GroupBy, format: 'xlsx' });
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

      <InventoryFiltersBar
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        areaFilter={areaFilter}
        onAreaFilterChange={setAreaFilter}
        areas={areas ?? []}
        sortField={sortField}
        onSortFieldChange={setSortField}
        sortDir={sortDir}
        onToggleSortDir={() => setSortDir((value) => (value === 'asc' ? 'desc' : 'asc'))}
        showReorderOnly={showReorderOnly}
        onToggleShowReorderOnly={() => setShowReorderOnly((value) => !value)}
        showOrdering={showOrdering}
        onToggleShowOrdering={() => setShowOrdering((value) => !value)}
        onResetFilters={resetFilters}
        laneCards={laneCards}
        workflowFocus={workflowFocus}
        onWorkflowFocusChange={setWorkflowFocus}
      />

      <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {laneCards.map(({ focus, count }) => (
          <InventoryLaneCard
            key={focus}
            active={workflowFocus === focus}
            count={count}
            focus={focus}
            onClick={() => setWorkflowFocus(focus)}
          />
        ))}
      </div>

      {selectedCount > 0 && (
        <InventoryBatchActions
          selectedCount={selectedCount}
          bulkCategory={bulkCategory}
          onBulkCategoryChange={setBulkCategory}
          bulkVendorId={bulkVendorId}
          onBulkVendorIdChange={setBulkVendorId}
          bulkVenueId={bulkVenueId}
          onBulkVenueIdChange={setBulkVenueId}
          bulkStorageAreaId={bulkStorageAreaId}
          onBulkStorageAreaIdChange={setBulkStorageAreaId}
          vendors={vendors ?? []}
          venues={venues ?? []}
          areas={areas ?? []}
          onApplyCategory={() => {
            if (!bulkCategory) return;
            applyBulkWorkflowUpdate({ category: bulkCategory }, `Updated category to ${bulkCategory}`);
          }}
          onApplyVendor={() => {
            if (!bulkVendorId) return;
            const vendorName = vendors?.find((vendor) => vendor.id === Number(bulkVendorId))?.name ?? 'vendor';
            applyBulkWorkflowUpdate({ vendor_id: Number(bulkVendorId) }, `Assigned ${vendorName}`);
          }}
          onApplyVenue={() => {
            if (!bulkVenueId) return;
            const venueName = venues?.find((venue) => venue.id === Number(bulkVenueId))?.name ?? 'venue';
            applyBulkWorkflowUpdate({ venue_id: Number(bulkVenueId) }, `Assigned ${venueName}`);
          }}
          onApplyArea={() => {
            if (!bulkStorageAreaId) return;
            const areaName = areas?.find((area) => area.id === Number(bulkStorageAreaId))?.name ?? 'area';
            applyBulkWorkflowUpdate({ storage_area_id: Number(bulkStorageAreaId) }, `Assigned ${areaName}`);
          }}
          onOpenMerge={() => {
            setMergeTargetId(null);
            setShowMergeModal(true);
          }}
          onOpenDelete={() => setShowDeleteConfirm(true)}
          isBulkUpdatePending={bulkUpdate.isPending}
          isBulkDeletePending={bulkDelete.isPending}
        />
      )}

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

      <WorkflowPanel
        title="Inventory Queue"
        description="Cards are stacked for scan speed: status first, inline edits in the middle, and the detailed drawer still one click away."
      >
        {isLoading ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
            Loading the live inventory queue...
          </div>
        ) : sortedItems.length > 0 ? (
          <div className="space-y-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Queue view</div>
                <div className="mt-2 text-sm font-medium text-slate-900">
                  Showing {showingStart}–{showingEnd} of {sortedItems.length} items
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Page {currentPage} of {Math.max(totalPages, 1)} in the {currentFocus.title.toLowerCase()} lane.
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Selection pressure</div>
                <div className="mt-2 text-sm font-medium text-slate-900">
                  {selectedCount > 0 ? `${selectedCount} selected` : 'No items selected'}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {visibleSelectionCount > 0
                    ? `${visibleSelectionCount} visible selections ready for batch actions.`
                    : 'Select visible items or cherry-pick rows for bulk edits.'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                <button
                  type="button"
                  onClick={toggleVisibleSelection}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                >
                  {allVisibleSelected ? 'Unselect visible' : 'Select visible'}
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={selectedCount === 0}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:opacity-40"
                >
                  Clear selection
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {paginatedItems.map((item) => {
                const itemAreas = storageByItem.get(item.id) ?? [];
                const reorderNeeded = item.reorder_level != null && item.current_qty <= item.reorder_level;
                const missingVendor = workflowCounts.missingVendor.has(item.id);
                const missingVenue = workflowCounts.missingVenue.has(item.id);
                const missingStorageArea = workflowCounts.missingStorageArea.has(item.id);
                const orderingIncomplete = workflowCounts.orderingIncomplete.has(item.id);
                const totalValue = item.order_unit_price != null && item.current_qty > 0
                  ? item.order_unit_price * item.current_qty
                  : null;
                const venueName = venues?.find((venue) => venue.id === item.venue_id)?.name ?? 'Venue missing';
                const storageName = item.storage_area_id != null
                  ? areaNameLookup.get(item.storage_area_id) ?? 'Area assigned'
                  : itemAreas.length > 0
                    ? `${itemAreas.length} area balance${itemAreas.length === 1 ? '' : 's'}`
                    : 'Storage area missing';
                const issuePills = [
                  missingVendor ? { label: 'Missing vendor', tone: 'blue' as const } : null,
                  missingVenue ? { label: 'Missing venue', tone: 'blue' as const } : null,
                  missingStorageArea ? { label: 'Missing area', tone: 'blue' as const } : null,
                  orderingIncomplete ? { label: 'Ordering incomplete', tone: 'amber' as const } : null,
                ].filter((value): value is { label: string; tone: 'blue' | 'amber' } => value !== null);
                const nextAction = inventoryActionHint({
                  reorderNeeded,
                  missingVendor,
                  missingVenue,
                  missingStorageArea,
                  orderingIncomplete,
                });

                return (
                  <InventoryQueueCard
                    key={item.id}
                    item={item}
                    itemAreas={itemAreas}
                    expanded={expandedItems.has(item.id)}
                    onToggleExpanded={() => toggleExpand(item.id)}
                    isSelected={isSelected(item.id)}
                    onToggleSelect={() => toggleSelectOne(item.id)}
                    onOpen={() => setSelectedItemId(item.id)}
                    showOrdering={showOrdering}
                    venueName={venueName}
                    storageName={storageName}
                    nextAction={nextAction}
                    totalValue={totalValue}
                    reorderNeeded={reorderNeeded}
                    issuePills={issuePills}
                    vendors={vendors ?? []}
                  />
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
              Delete {selectedCount} selected item{selectedCount > 1 ? 's' : ''}? Items with transaction history will be skipped.
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
                        clearSelection();
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
                          clearSelection();
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
