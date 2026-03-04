import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useItems, useReorderSuggestions, useUpdateItem, useBulkUpdateItems, useBulkDeleteItems } from '../hooks/useItems';
import { useToast } from '../contexts/ToastContext';
import { useStorageAreas, useAllItemStorage } from '../hooks/useStorageAreas';
import { CATEGORIES, UNITS } from '@fifoflow/shared';
import { getCompatibleUnits, convertQuantity } from '@fifoflow/shared';
import type { Unit, ItemStorage } from '@fifoflow/shared';
import { AddItemModal } from '../components/AddItemModal';
import { ManageAreasModal } from '../components/ManageAreasModal';
import { ManageVendorsModal } from '../components/ManageVendorsModal';
import { useVendors } from '../hooks/useVendors';
import { useVenues } from '../hooks/useVenues';
import { useVenueContext } from '../contexts/VenueContext';

function formatCurrency(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

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

type SortField = 'name' | 'category' | 'current_qty' | 'unit' | 'reorder_level' | 'reorder_qty' | 'order_unit' | 'order_unit_price' | 'qty_per_unit';
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
  const [displayUnits, setDisplayUnits] = useState<Record<number, Unit>>({});
  const [areaFilter, setAreaFilter] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [showOrdering, setShowOrdering] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const bulkUpdate = useBulkUpdateItems();
  const bulkDelete = useBulkDeleteItems();
  const { toast } = useToast();
  const [bulkCategory, setBulkCategory] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  const reorderIds = new Set((reorderSuggestions ?? []).map((r) => r.item_id));
  const itemsToRender = (items ?? []).filter((item) => {
    if (showReorderOnly && !reorderIds.has(item.id)) return false;
    if (areaFilter) {
      const areaId = Number(areaFilter);
      const storage = storageByItem.get(item.id);
      if (!storage?.some((s) => s.area_id === areaId && s.quantity > 0)) return false;
    }
    return true;
  });
  const sortedItems = useMemo(() => {
    const arr = [...itemsToRender];
    arr.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
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
  }, [itemsToRender, sortField, sortDir]);

  const ITEMS_PER_PAGE = 50;
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to page 1 when filters or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, category, areaFilter, showReorderOnly, sortField, sortDir]);

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
  }, [currentPage, search, category, areaFilter, showReorderOnly, sortField, sortDir]);

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

  const getDisplayUnit = (itemId: number, storedUnit: Unit): Unit =>
    displayUnits[itemId] ?? storedUnit;

  const setDisplayUnit = (itemId: number, unit: Unit) =>
    setDisplayUnits((prev) => ({ ...prev, [itemId]: unit }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">Inventory</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowVendorsModal(true)}
            className="bg-bg-card border border-border-emphasis text-text-secondary px-4 py-2 rounded-lg text-sm font-medium hover:bg-bg-hover transition-colors"
          >
            Manage Vendors
          </button>
          <button
            onClick={() => setShowAreasModal(true)}
            className="bg-bg-card border border-border-emphasis text-text-secondary px-4 py-2 rounded-lg text-sm font-medium hover:bg-bg-hover transition-colors"
          >
            Manage Areas
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover transition-colors"
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-bg-card rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted flex-1 max-w-sm focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
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
          className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
        >
          <option value="">All Areas</option>
          {areas?.map((area) => (
            <option key={area.id} value={String(area.id)}>{area.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowReorderOnly((v) => !v)}
          className={showReorderOnly
            ? 'rounded-full bg-badge-red-bg text-badge-red-text border border-accent-red/30 px-3 py-2 text-sm'
            : 'rounded-full border border-border text-text-secondary hover:text-text-primary px-3 py-2 text-sm transition-colors'
          }
        >
          Needs Reorder
        </button>
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
                <SortHeader label="In Stock" field="current_qty" activeField={sortField} dir={sortDir} onToggle={toggleSort} className="text-right" />
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Stock Unit</th>
                <SortHeader label="Reorder Level" field="reorder_level" activeField={sortField} dir={sortDir} onToggle={toggleSort} className="text-right" />
                <SortHeader label="Reorder Qty" field="reorder_qty" activeField={sortField} dir={sortDir} onToggle={toggleSort} className="text-right" />
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Reorder</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Storage Area</th>
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
                const displayUnit = getDisplayUnit(item.id, item.unit);
                // When area filter is active, show area-specific qty; otherwise total
                const baseQty = areaFilter
                  ? (storageByItem.get(item.id)?.find(
                      (s) => s.area_id === Number(areaFilter),
                    )?.quantity ?? 0)
                  : item.current_qty;
                const displayQty = convertQuantity(
                  baseQty,
                  item.unit,
                  displayUnit,
                  {
                    baseUnit: item.unit,
                    orderUnit: item.order_unit,
                    innerUnit: item.inner_unit,
                    qtyPerUnit: item.qty_per_unit,
                    itemSizeValue: item.item_size_value,
                    itemSizeUnit: item.item_size_unit,
                  },
                );
                const itemAreas = storageByItem.get(item.id) ?? [];
                const hasAreas = itemAreas.length > 0;
                const compatible = getCompatibleUnits(item.unit, {
                  baseUnit: item.unit,
                  orderUnit: item.order_unit,
                  innerUnit: item.inner_unit,
                  qtyPerUnit: item.qty_per_unit,
                  itemSizeValue: item.item_size_value,
                  itemSizeUnit: item.item_size_unit,
                });
                const insideUnitPrice =
                  item.order_unit_price != null &&
                  item.qty_per_unit != null &&
                  item.qty_per_unit > 0
                    ? item.order_unit_price / item.qty_per_unit
                    : item.order_unit_price;
                const insideUnitLabel = item.inner_unit ?? item.order_unit ?? item.unit;
                const totalValue =
                  insideUnitPrice != null && item.current_qty > 0
                    ? insideUnitPrice * item.current_qty
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
                        <Link
                          to={`/inventory/${item.id}`}
                          className="text-accent-indigo hover:underline"
                        >
                          {item.name}
                        </Link>
                      </div>
                    </td>

                    {/* Category – read-only */}
                    <td className="px-3 py-2 text-text-secondary">
                      {item.category}
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

                    {/* Stock Qty – display with conversion */}
                    <td className="px-3 py-2 font-mono font-medium text-text-primary text-right tabular-nums">{displayQty}</td>

                    {/* Stock Unit – conversion toggle */}
                    <td className="px-3 py-2">
                      {compatible.length > 1 ? (
                        <select
                          value={displayUnit}
                          onChange={(e) =>
                            setDisplayUnit(item.id, e.target.value as Unit)
                          }
                          className="bg-white border border-transparent hover:border-border focus:border-accent-indigo rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none cursor-pointer"
                        >
                          {compatible.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-text-secondary">{item.unit}</span>
                      )}
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
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
          {selectedIds.size > 0 && (
            <div className="border-t border-border bg-bg-page px-4 py-3 flex items-center gap-4 flex-wrap">
              <span className="text-sm font-medium text-text-primary">
                {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
              </span>

              {/* Category reassign */}
              <div className="flex items-center gap-2">
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
                    bulkUpdate.mutate(
                      { ids: Array.from(selectedIds), updates: { category: bulkCategory } },
                      {
                        onSuccess: (data) => {
                          toast(`Updated ${data.updated} item${data.updated !== 1 ? 's' : ''} to ${bulkCategory}`, 'success');
                          setSelectedIds(new Set());
                          setBulkCategory('');
                        },
                        onError: (err) => {
                          toast(`Failed to update: ${err.message}`, 'error');
                        },
                      },
                    );
                  }}
                  disabled={!bulkCategory || bulkUpdate.isPending}
                  className="bg-accent-indigo text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Apply
                </button>
              </div>

              {/* Bulk delete */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="ml-auto bg-accent-red/10 text-accent-red border border-accent-red/30 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent-red/20 transition-colors"
              >
                Delete Selected
              </button>
            </div>
          )}
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

      {showAddModal && (
        <AddItemModal onClose={() => setShowAddModal(false)} />
      )}
      {showAreasModal && (
        <ManageAreasModal onClose={() => setShowAreasModal(false)} />
      )}
      {showVendorsModal && (
        <ManageVendorsModal onClose={() => setShowVendorsModal(false)} />
      )}
    </div>
  );
}
