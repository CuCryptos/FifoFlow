import { useCallback, useMemo, useState } from 'react';

export type InventoryWorkflowFocus =
  | 'all'
  | 'needs_attention'
  | 'reorder'
  | 'missing_vendor'
  | 'missing_venue'
  | 'missing_storage_area'
  | 'ordering_incomplete';

export type InventorySortField =
  | 'name'
  | 'category'
  | 'vendor_id'
  | 'venue_id'
  | 'storage_area_id'
  | 'reorder_level'
  | 'reorder_qty'
  | 'updated_at';

export type InventorySortDir = 'asc' | 'desc';
export type InventoryExportGroupBy = 'storage_area' | 'venue' | 'vendor';
export type InventoryBarExportMode = 'combined' | 'split_bar';

export interface UseInventoryWorkflowOptions {
  initialSearch?: string;
  initialCategory?: string;
  initialAreaFilter?: string;
  initialShowReorderOnly?: boolean;
  initialExportGroupBy?: InventoryExportGroupBy;
  initialBarExportMode?: InventoryBarExportMode;
  initialSortField?: InventorySortField;
  initialSortDir?: InventorySortDir;
  initialWorkflowFocus?: InventoryWorkflowFocus;
  initialShowOrdering?: boolean;
}

export function useInventoryWorkflow(options: UseInventoryWorkflowOptions = {}) {
  const {
    initialSearch = '',
    initialCategory = '',
    initialAreaFilter = '',
    initialShowReorderOnly = false,
    initialExportGroupBy = 'storage_area',
    initialBarExportMode = 'combined',
    initialSortField = 'name',
    initialSortDir = 'asc',
    initialWorkflowFocus = 'all',
    initialShowOrdering = false,
  } = options;

  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState(initialCategory);
  const [areaFilter, setAreaFilter] = useState(initialAreaFilter);
  const [showReorderOnly, setShowReorderOnly] = useState(initialShowReorderOnly);
  const [exportGroupBy, setExportGroupBy] = useState<InventoryExportGroupBy>(initialExportGroupBy);
  const [barExportMode, setBarExportMode] = useState<InventoryBarExportMode>(initialBarExportMode);
  const [sortField, setSortField] = useState<InventorySortField>(initialSortField);
  const [sortDir, setSortDir] = useState<InventorySortDir>(initialSortDir);
  const [workflowFocus, setWorkflowFocus] = useState<InventoryWorkflowFocus>(initialWorkflowFocus);
  const [showOrdering, setShowOrdering] = useState(initialShowOrdering);

  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkVendorId, setBulkVendorId] = useState('');
  const [bulkVenueId, setBulkVenueId] = useState('');
  const [bulkStorageAreaId, setBulkStorageAreaId] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showAreasModal, setShowAreasModal] = useState(false);
  const [showVendorsModal, setShowVendorsModal] = useState(false);
  const [showVenuesModal, setShowVenuesModal] = useState(false);
  const [showInvoiceUpload, setShowInvoiceUpload] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  const resetFilters = useCallback(() => {
    setSearch(initialSearch);
    setCategory(initialCategory);
    setAreaFilter(initialAreaFilter);
    setShowReorderOnly(initialShowReorderOnly);
    setExportGroupBy(initialExportGroupBy);
    setBarExportMode(initialBarExportMode);
    setSortField(initialSortField);
    setSortDir(initialSortDir);
    setWorkflowFocus(initialWorkflowFocus);
  }, [
    initialAreaFilter,
    initialBarExportMode,
    initialCategory,
    initialExportGroupBy,
    initialSearch,
    initialShowReorderOnly,
    initialSortDir,
    initialSortField,
    initialWorkflowFocus,
  ]);

  const resetBulkActions = useCallback(() => {
    setBulkCategory('');
    setBulkVendorId('');
    setBulkVenueId('');
    setBulkStorageAreaId('');
  }, []);

  const closeDialogs = useCallback(() => {
    setShowAddModal(false);
    setShowAreasModal(false);
    setShowVendorsModal(false);
    setShowVenuesModal(false);
    setShowInvoiceUpload(false);
    setShowDeleteConfirm(false);
    setShowMergeModal(false);
    setMergeTargetId(null);
    setSelectedItemId(null);
  }, []);

  return useMemo(() => ({
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
    closeDialogs,
  }), [
    areaFilter,
    bulkCategory,
    bulkStorageAreaId,
    bulkVenueId,
    bulkVendorId,
    category,
    closeDialogs,
    exportGroupBy,
    barExportMode,
    mergeTargetId,
    resetBulkActions,
    resetFilters,
    selectedItemId,
    search,
    showAddModal,
    showAreasModal,
    showDeleteConfirm,
    showInvoiceUpload,
    showMergeModal,
    showOrdering,
    showReorderOnly,
    showVendorsModal,
    showVenuesModal,
    sortDir,
    sortField,
    workflowFocus,
  ]);
}
