import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useItems, useUpdateItem } from '../hooks/useItems';
import { CATEGORIES, UNITS } from '@fifoflow/shared';
import { getCompatibleUnits, convertQuantity } from '@fifoflow/shared';
import type { Unit } from '@fifoflow/shared';
import { AddItemModal } from '../components/AddItemModal';

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
  const [showAddModal, setShowAddModal] = useState(false);
  const [displayUnits, setDisplayUnits] = useState<Record<number, Unit>>({});
  const updateItem = useUpdateItem();

  const { data: items, isLoading } = useItems({
    search: search || undefined,
    category: category || undefined,
  });

  const getDisplayUnit = (itemId: number, storedUnit: Unit): Unit =>
    displayUnits[itemId] ?? storedUnit;

  const setDisplayUnit = (itemId: number, unit: Unit) =>
    setDisplayUnits((prev) => ({ ...prev, [itemId]: unit }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-accent-green text-navy px-4 py-2 rounded text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + Add Item
        </button>
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
      </div>

      {/* Spreadsheet table */}
      {isLoading ? (
        <div className="text-text-secondary text-sm">Loading...</div>
      ) : items && items.length > 0 ? (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-navy-lighter text-text-secondary text-left">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Order Unit</th>
                <th className="px-3 py-2 font-medium">Qty/Unit</th>
                <th className="px-3 py-2 font-medium">Item Size</th>
                <th className="px-3 py-2 font-medium">Stock Qty</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Reorder Level</th>
                <th className="px-3 py-2 font-medium">Reorder</th>
                <th className="px-3 py-2 font-medium">Reorder Qty</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const displayUnit = getDisplayUnit(item.id, item.unit);
                const displayQty = convertQuantity(
                  item.current_qty,
                  item.unit,
                  displayUnit,
                );
                const compatible = getCompatibleUnits(item.unit);

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

                    {/* Order Unit – inline select */}
                    <td className="px-3 py-2">
                      <select
                        value={item.order_unit ?? ''}
                        onChange={(e) => {
                          const val = e.target.value || null;
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

                    {/* Qty per Unit – inline edit number */}
                    <td className="px-3 py-2">
                      <InlineEdit
                        value={item.qty_per_unit}
                        field="qty_per_unit"
                        itemId={item.id}
                        type="number"
                      />
                    </td>

                    {/* Item Size – inline edit text */}
                    <td className="px-3 py-2">
                      <InlineEdit
                        value={item.item_size}
                        field="item_size"
                        itemId={item.id}
                        type="text"
                      />
                    </td>

                    {/* Stock Qty – display with conversion */}
                    <td className="px-3 py-2 font-medium">{displayQty}</td>

                    {/* Unit – conversion toggle */}
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
                    <td className="px-3 py-2">
                      <InlineEdit
                        value={item.reorder_level}
                        field="reorder_level"
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

                    {/* Reorder Qty – inline edit number */}
                    <td className="px-3 py-2">
                      <InlineEdit
                        value={item.reorder_qty}
                        field="reorder_qty"
                        itemId={item.id}
                        type="number"
                      />
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
    </div>
  );
}
