import { Suspense, lazy, useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useItems, useItem, useReorderSuggestions, useBulkUpdateItems, useBulkDeleteItems, useMergeItems } from '../hooks/useItems';
import {
  useInventoryWorkflow,
  type InventoryWorkflowFocus,
} from '../hooks/useInventoryWorkflow';
import { useInventorySelection } from '../hooks/useInventorySelection';
import { useToast } from '../contexts/ToastContext';
import { useStorageAreas, useAllItemStorage } from '../hooks/useStorageAreas';
import type { ItemStorage } from '@fifoflow/shared';
import { SlideOver } from '../components/intelligence/SlideOver';
import { useVendors } from '../hooks/useVendors';
import { useVenues } from '../hooks/useVenues';
import { useVenueContext } from '../contexts/VenueContext';
import { InventoryBatchActions } from '../components/inventory/InventoryBatchActions';
import { InventoryDeleteDialog } from '../components/inventory/InventoryDeleteDialog';
import { InventoryFiltersBar } from '../components/inventory/InventoryFiltersBar';
import { INVENTORY_FOCUS_COPY, InventoryLaneCard } from '../components/inventory/InventoryLaneCard';
import { InventoryItemSidePanel } from '../components/inventory/InventoryItemSidePanel';
import { InventoryMergeDialog } from '../components/inventory/InventoryMergeDialog';
import { InventoryPagination } from '../components/inventory/InventoryPagination';
import { InventoryPageActions } from '../components/inventory/InventoryPageActions';
import { InventoryQueueCard } from '../components/inventory/InventoryQueueCard';
import { InventoryQueueHeader } from '../components/inventory/InventoryQueueHeader';
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
    barExportMode,
    setBarExportMode,
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
        <InventoryPageActions
          exportGroupBy={exportGroupBy}
          onExportGroupByChange={setExportGroupBy}
          barExportMode={barExportMode}
          onBarExportModeChange={setBarExportMode}
          areas={areas ?? []}
          vendors={vendors ?? []}
          venues={venues ?? []}
          sortedItems={sortedItems}
          onOpenInvoiceUpload={() => setShowInvoiceUpload(true)}
          onOpenAddItem={() => setShowAddModal(true)}
        />
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
            <InventoryQueueHeader
              showingStart={showingStart}
              showingEnd={showingEnd}
              totalCount={sortedItems.length}
              currentLaneTitle={currentFocus.title}
              selectedCount={selectedCount}
              visibleSelectionCount={visibleSelectionCount}
              allVisibleSelected={allVisibleSelected}
              onToggleVisibleSelection={toggleVisibleSelection}
              onClearSelection={clearSelection}
            />

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

            <InventoryPagination
              currentPage={currentPage}
              totalPages={totalPages}
              showingStart={showingStart}
              showingEnd={showingEnd}
              totalCount={sortedItems.length}
              onPrevious={() => setCurrentPage(Math.max(1, currentPage - 1))}
              onNext={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              onPageChange={setCurrentPage}
            />
          </div>
        ) : (
          <WorkflowEmptyState
            title="No inventory items match this lane."
            body="Adjust the queue filters or switch workflow lanes to bring items back into view."
          />
        )}
      </WorkflowPanel>

      {showDeleteConfirm && (
        <InventoryDeleteDialog
          selectedCount={selectedCount}
          isPending={bulkDelete.isPending}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
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
        />
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

      {showMergeModal && (
        <InventoryMergeDialog
          items={selectedItems}
          mergeTargetId={mergeTargetId}
          onMergeTargetChange={setMergeTargetId}
          onCancel={() => setShowMergeModal(false)}
          onConfirm={() => {
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
          isPending={mergeItems.isPending}
        />
      )}
    </WorkflowPage>
  );
}
