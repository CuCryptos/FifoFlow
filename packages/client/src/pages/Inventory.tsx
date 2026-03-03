import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useItems, useReorderSuggestions, useUpdateItem } from '../hooks/useItems';
import { useStorageAreas, useAllItemStorage } from '../hooks/useStorageAreas';
import { CATEGORIES, UNITS } from '@fifoflow/shared';
import { getCompatibleUnits, convertQuantity } from '@fifoflow/shared';
import type { Unit, ItemStorage } from '@fifoflow/shared';
import { AddItemModal } from '../components/AddItemModal';
import { ManageAreasModal } from '../components/ManageAreasModal';

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
/*  Inventory Page                                                    */
/* ------------------------------------------------------------------ */

export function Inventory() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [showReorderOnly, setShowReorderOnly] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAreasModal, setShowAreasModal] = useState(false);
  const [displayUnits, setDisplayUnits] = useState<Record<number, Unit>>({});
  const [orderQtys, setOrderQtys] = useState<Record<number, string>>({});
  const [areaFilter, setAreaFilter] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const updateItem = useUpdateItem();
  const { data: areas } = useStorageAreas();
  const { data: allItemStorage } = useAllItemStorage();

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
        <div className="bg-bg-card rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-bg-table-header text-text-secondary text-left">
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Name</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Category</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-right">In Stock</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Stock Unit</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Reorder Level</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Reorder Qty</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Reorder</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Order Unit</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Pack Qty</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Inner Unit</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Size Value</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide">Size Unit</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Order Price</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Inside Price</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Order Qty</th>
                <th className="px-3 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {itemsToRender.map((item) => {
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
                const orderQty = Number(orderQtys[item.id] ?? '');
                const totalCost =
                  Number.isFinite(orderQty) && orderQty > 0 && insideUnitPrice != null
                    ? insideUnitPrice * orderQty
                    : null;

                return (
                <React.Fragment key={item.id}>
                  <tr
                    className="border-b border-border hover:bg-bg-hover transition-colors"
                  >
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

                    {/* Order Unit Price – inline edit number */}
                    <td className="px-3 py-2 text-right">
                      <InlineEdit
                        value={item.order_unit_price}
                        field="order_unit_price"
                        itemId={item.id}
                        type="number"
                      />
                    </td>

                    {/* Inside Unit Price – computed/editable */}
                    <td className="px-3 py-2 text-right text-text-primary">
                      <InlineInsidePrice
                        orderUnitPrice={item.order_unit_price}
                        qtyPerUnit={item.qty_per_unit}
                        itemId={item.id}
                        innerUnitLabel={insideUnitLabel}
                      />
                    </td>

                    {/* Order Qty – transient for costing */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={orderQtys[item.id] ?? ''}
                        onChange={(e) =>
                          setOrderQtys((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        className="w-24 bg-white border border-border rounded-lg px-2 py-1 text-xs text-right text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                        placeholder="Qty"
                      />
                    </td>

                    {/* Total Cost – computed */}
                    <td className="px-3 py-2 text-right text-text-primary font-mono tabular-nums">
                      {formatCurrency(totalCost)}
                    </td>
                  </tr>
                  {expandedItems.has(item.id) && hasAreas && (
                    <tr className="bg-bg-area-row">
                      <td colSpan={16} className="px-3 py-2 pl-10">
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
          </table>
        </div>
      ) : (
        <div className="text-text-secondary text-sm">No items found.</div>
      )}

      {showAddModal && (
        <AddItemModal onClose={() => setShowAddModal(false)} />
      )}
      {showAreasModal && (
        <ManageAreasModal onClose={() => setShowAreasModal(false)} />
      )}
    </div>
  );
}
