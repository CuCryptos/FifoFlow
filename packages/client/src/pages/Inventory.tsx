import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useItems, useReorderSuggestions, useUpdateItem } from '../hooks/useItems';
import { CATEGORIES, UNITS } from '@fifoflow/shared';
import { getCompatibleUnits, convertQuantity } from '@fifoflow/shared';
import type { Unit } from '@fifoflow/shared';
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
        className="block w-full cursor-text px-2 py-1 rounded border border-transparent hover:border-border text-text-primary min-h-[1.75rem] leading-[1.75rem] truncate"
        title={String(value ?? '')}
      >
        {value !== null && value !== '' ? String(value) : (
          <span className="text-text-secondary">{placeholder}</span>
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
      className="w-full bg-navy border border-accent-green rounded px-2 py-1 text-xs text-text-primary focus:outline-none"
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
        className="block w-full cursor-text px-2 py-1 rounded border border-transparent hover:border-border text-text-primary min-h-[1.75rem] leading-[1.75rem] truncate"
      >
        {derivedInside == null ? (
          <span className="text-text-secondary">—</span>
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
      className="w-full bg-navy border border-accent-green rounded px-2 py-1 text-xs text-text-primary focus:outline-none"
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
    return <span className="text-text-secondary">—</span>;
  }
  if (stockQty > reorderLevel) {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-accent-green/20 text-accent-green">
        OK
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded bg-accent-red/20 text-accent-red">
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
  const updateItem = useUpdateItem();

  const { data: items, isLoading } = useItems({
    search: search || undefined,
    category: category || undefined,
  });
  const { data: reorderSuggestions } = useReorderSuggestions();

  const reorderIds = new Set((reorderSuggestions ?? []).map((r) => r.item_id));
  const itemsToRender = (items ?? []).filter((item) =>
    showReorderOnly ? reorderIds.has(item.id) : true
  );
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
        <h1 className="text-xl font-semibold">Inventory</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAreasModal(true)}
            className="border border-border text-text-secondary px-4 py-2 rounded text-sm font-medium hover:text-text-primary transition-colors"
          >
            Manage Areas
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-accent-green text-navy px-4 py-2 rounded text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-navy-light border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary flex-1 max-w-sm focus:outline-none focus:border-accent-green"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-navy-light border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowReorderOnly((v) => !v)}
          className={`px-3 py-2 rounded text-sm border transition-colors ${
            showReorderOnly
              ? 'border-accent-red text-accent-red bg-accent-red/10'
              : 'border-border text-text-secondary hover:text-text-primary'
          }`}
        >
          Needs Reorder
        </button>
      </div>

      {!!reorderSuggestions?.length && (
        <div className="bg-navy-light border border-border rounded-lg px-4 py-3 flex items-center justify-between text-sm">
          <div className="text-text-secondary">
            {reorderSuggestions.length} items need reorder
          </div>
          <div className="text-text-primary">
            Estimated spend: <span className="text-accent-amber">{formatCurrency(reorderSpend)}</span>
          </div>
        </div>
      )}

      {/* Spreadsheet table */}
      {isLoading ? (
        <div className="text-text-secondary text-sm">Loading...</div>
      ) : itemsToRender.length > 0 ? (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-navy-lighter text-text-secondary text-left">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium text-right">In Stock</th>
                <th className="px-3 py-2 font-medium">Stock Unit</th>
                <th className="px-3 py-2 font-medium text-right">Reorder Level</th>
                <th className="px-3 py-2 font-medium text-right">Reorder Qty</th>
                <th className="px-3 py-2 font-medium">Reorder</th>
                <th className="px-3 py-2 font-medium">Order Unit</th>
                <th className="px-3 py-2 font-medium text-right">Pack Qty</th>
                <th className="px-3 py-2 font-medium">Inner Unit</th>
                <th className="px-3 py-2 font-medium text-right">Size Value</th>
                <th className="px-3 py-2 font-medium">Size Unit</th>
                <th className="px-3 py-2 font-medium text-right">Order Price</th>
                <th className="px-3 py-2 font-medium text-right">Inside Price</th>
                <th className="px-3 py-2 font-medium text-right">Order Qty</th>
                <th className="px-3 py-2 font-medium text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {itemsToRender.map((item) => {
                const displayUnit = getDisplayUnit(item.id, item.unit);
                const displayQty = convertQuantity(
                  item.current_qty,
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
                  <tr
                    key={item.id}
                    className="border-t border-border hover:bg-navy-lighter/50 transition-colors"
                  >
                    {/* Name – link to detail */}
                    <td className="px-3 py-2">
                      <Link
                        to={`/inventory/${item.id}`}
                        className="text-accent-green hover:underline"
                      >
                        {item.name}
                      </Link>
                    </td>

                    {/* Category – read-only */}
                    <td className="px-3 py-2 text-text-secondary">
                      {item.category}
                    </td>

                    {/* Stock Qty – display with conversion */}
                    <td className="px-3 py-2 font-medium text-right tabular-nums">{displayQty}</td>

                    {/* Stock Unit – conversion toggle */}
                    <td className="px-3 py-2">
                      {compatible.length > 1 ? (
                        <select
                          value={displayUnit}
                          onChange={(e) =>
                            setDisplayUnit(item.id, e.target.value as Unit)
                          }
                          className="bg-navy border border-transparent hover:border-border focus:border-accent-green rounded px-2 py-1 text-xs text-text-primary focus:outline-none cursor-pointer"
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
                        className="bg-navy border border-transparent hover:border-border focus:border-accent-green rounded px-2 py-1 text-xs text-text-primary focus:outline-none cursor-pointer"
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
                        className="bg-navy border border-transparent hover:border-border focus:border-accent-green rounded px-2 py-1 text-xs text-text-primary focus:outline-none cursor-pointer"
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
                        className="bg-navy border border-transparent hover:border-border focus:border-accent-green rounded px-2 py-1 text-xs text-text-primary focus:outline-none cursor-pointer"
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
                        className="w-24 bg-navy border border-border rounded px-2 py-1 text-xs text-right text-text-primary focus:outline-none focus:border-accent-green"
                        placeholder="Qty"
                      />
                    </td>

                    {/* Total Cost – computed */}
                    <td className="px-3 py-2 text-right text-text-primary tabular-nums">
                      {formatCurrency(totalCost)}
                    </td>
                  </tr>
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
