import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useItem, useUpdateItem, useDeleteItem, useSetItemCount } from '../hooks/useItems';
import { useItemStorage } from '../hooks/useStorageAreas';
import { CATEGORIES, UNITS } from '@fifoflow/shared';
import { getCompatibleUnits, convertQuantity } from '@fifoflow/shared';
import type { Category, Unit } from '@fifoflow/shared';
import { TransactionForm } from '../components/TransactionForm';

function formatCurrency(value: number | null): string {
  if (value === null) return '\u2014';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useItem(Number(id));
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const setItemCount = useSetItemCount();
  const { data: itemStorage } = useItemStorage(Number(id));
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<Category>(CATEGORIES[0]);
  const [editUnit, setEditUnit] = useState<Unit>(UNITS[0]);
  const [displayUnit, setDisplayUnit] = useState<Unit | null>(null);

  // New field edit states
  const [editOrderUnit, setEditOrderUnit] = useState<Unit | ''>('');
  const [editOrderUnitPrice, setEditOrderUnitPrice] = useState('');
  const [editInsideUnitPrice, setEditInsideUnitPrice] = useState('');
  const [editQtyPerUnit, setEditQtyPerUnit] = useState('');
  const [editInnerUnit, setEditInnerUnit] = useState<Unit | ''>('');
  const [editItemSizeValue, setEditItemSizeValue] = useState('');
  const [editItemSizeUnit, setEditItemSizeUnit] = useState<Unit | ''>('');
  const [editReorderLevel, setEditReorderLevel] = useState('');
  const [editReorderQty, setEditReorderQty] = useState('');
  const [countedQty, setCountedQty] = useState('');
  const [countNotes, setCountNotes] = useState('');

  if (isLoading) return <div className="text-text-secondary">Loading...</div>;
  if (!data) return <div className="text-accent-red">Item not found.</div>;

  const { item, transactions } = data;
  const activeDisplayUnit = displayUnit ?? item.unit;
  const displayQty = convertQuantity(item.current_qty, item.unit, activeDisplayUnit, {
    baseUnit: item.unit,
    orderUnit: item.order_unit,
    innerUnit: item.inner_unit,
    qtyPerUnit: item.qty_per_unit,
    itemSizeValue: item.item_size_value,
    itemSizeUnit: item.item_size_unit,
  });
  const compatible = getCompatibleUnits(item.unit, {
    baseUnit: item.unit,
    orderUnit: item.order_unit,
    innerUnit: item.inner_unit,
    qtyPerUnit: item.qty_per_unit,
    itemSizeValue: item.item_size_value,
    itemSizeUnit: item.item_size_unit,
  });

  const reorderStatus =
    item.reorder_level == null
      ? null
      : item.current_qty <= item.reorder_level
        ? 'REORDER'
        : 'OK';
  const packagingDescription =
    item.order_unit &&
    item.qty_per_unit &&
    item.inner_unit &&
    item.item_size_value &&
    item.item_size_unit
      ? `1 ${item.order_unit} = ${item.qty_per_unit} ${item.inner_unit} (${item.item_size_value} ${item.item_size_unit} each)`
      : null;
  const insideUnitPrice =
    item.order_unit_price != null &&
    item.qty_per_unit != null &&
    item.qty_per_unit > 0
      ? item.order_unit_price / item.qty_per_unit
      : null;
  const insideUnitLabel = item.inner_unit ?? item.order_unit ?? item.unit;

  useEffect(() => {
    setCountedQty(String(item.current_qty));
    setCountNotes('');
  }, [item.id, item.current_qty]);

  const startEdit = () => {
    setEditName(item.name);
    setEditCategory(item.category);
    setEditUnit(item.unit);
    setEditOrderUnit(item.order_unit ?? '');
    setEditOrderUnitPrice(item.order_unit_price != null ? String(item.order_unit_price) : '');
    setEditInsideUnitPrice(insideUnitPrice != null ? String(insideUnitPrice) : '');
    setEditQtyPerUnit(item.qty_per_unit != null ? String(item.qty_per_unit) : '');
    setEditInnerUnit(item.inner_unit ?? '');
    setEditItemSizeValue(item.item_size_value != null ? String(item.item_size_value) : '');
    setEditItemSizeUnit(item.item_size_unit ?? '');
    setEditReorderLevel(item.reorder_level != null ? String(item.reorder_level) : '');
    setEditReorderQty(item.reorder_qty != null ? String(item.reorder_qty) : '');
    setEditing(true);
  };

  const saveEdit = () => {
    const qtyPerUnitNumber = editQtyPerUnit ? Number(editQtyPerUnit) : null;
    const multiplier = qtyPerUnitNumber && qtyPerUnitNumber > 0 ? qtyPerUnitNumber : 1;
    const derivedOrderUnitPrice = editInsideUnitPrice
      ? Number(editInsideUnitPrice) * multiplier
      : null;

    updateItem.mutate(
      {
        id: item.id,
        data: {
          name: editName,
          category: editCategory,
          unit: editUnit,
          order_unit: editOrderUnit || null,
          order_unit_price: editInsideUnitPrice
            ? derivedOrderUnitPrice
            : (editOrderUnitPrice ? Number(editOrderUnitPrice) : null),
          qty_per_unit: qtyPerUnitNumber,
          inner_unit: editInnerUnit || null,
          item_size_value: editItemSizeValue ? Number(editItemSizeValue) : null,
          item_size_unit: editItemSizeUnit || null,
          item_size: editItemSizeValue && editItemSizeUnit
            ? `${editItemSizeValue} ${editItemSizeUnit}`
            : null,
          reorder_level: editReorderLevel ? Number(editReorderLevel) : null,
          reorder_qty: editReorderQty ? Number(editReorderQty) : null,
        },
      },
      {
        onSuccess: () => {
          setEditing(false);
          setDisplayUnit(null);
        },
      }
    );
  };

  const handleDelete = () => {
    if (confirm('Delete this item? This cannot be undone.')) {
      deleteItem.mutate(item.id, { onSuccess: () => navigate('/inventory') });
    }
  };

  const parsedCountedQty = Number(countedQty);
  const countQtyValid = countedQty.trim() !== '' && Number.isFinite(parsedCountedQty) && parsedCountedQty >= 0;
  const countDelta = countQtyValid ? Math.round((parsedCountedQty - item.current_qty) * 1000) / 1000 : null;

  const submitCycleCount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!countQtyValid) return;

    setItemCount.mutate(
      {
        id: item.id,
        data: {
          counted_qty: parsedCountedQty,
          notes: countNotes || null,
        },
      },
      {
        onSuccess: (result) => {
          setCountedQty(String(result.item.current_qty));
          setCountNotes('');
        },
      },
    );
  };

  const inputClass =
    'bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo';

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/inventory')} className="text-sm text-text-secondary hover:text-accent-indigo transition-colors">
        &larr; Back to Inventory
      </button>

      {/* Item header */}
      <div className="bg-bg-card rounded-xl shadow-sm p-6">
        {editing ? (
          <div className="space-y-4">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className={`${inputClass} w-full`}
              placeholder="Item name"
            />
            <div className="flex gap-3">
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as Category)}
                className={inputClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select
                value={editUnit}
                onChange={(e) => setEditUnit(e.target.value as Unit)}
                className={inputClass}
              >
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>

            {/* New fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Order Unit</label>
                <select
                  value={editOrderUnit}
                  onChange={(e) => setEditOrderUnit((e.target.value as Unit | '') ?? '')}
                  className={`${inputClass} w-full`}
                >
                  <option value="">&mdash;</option>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Qty per Unit</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={editQtyPerUnit}
                  onChange={(e) => setEditQtyPerUnit(e.target.value)}
                  placeholder="e.g. 24"
                  className={`${inputClass} w-full`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Order Unit Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editOrderUnitPrice}
                  onChange={(e) => setEditOrderUnitPrice(e.target.value)}
                  placeholder="e.g. 240"
                  className={`${inputClass} w-full`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Inside Unit Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editInsideUnitPrice}
                  onChange={(e) => setEditInsideUnitPrice(e.target.value)}
                  placeholder="e.g. 8"
                  className={`${inputClass} w-full`}
                />
                <p className="text-[11px] text-text-muted mt-1">
                  Per {insideUnitLabel}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Inner Unit</label>
                <select
                  value={editInnerUnit}
                  onChange={(e) => setEditInnerUnit((e.target.value as Unit | '') ?? '')}
                  className={`${inputClass} w-full`}
                >
                  <option value="">&mdash;</option>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Item Size Value</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={editItemSizeValue}
                  onChange={(e) => setEditItemSizeValue(e.target.value)}
                  placeholder='e.g. 750'
                  className={`${inputClass} w-full`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Item Size Unit</label>
                <select
                  value={editItemSizeUnit}
                  onChange={(e) => setEditItemSizeUnit((e.target.value as Unit | '') ?? '')}
                  className={`${inputClass} w-full`}
                >
                  <option value="">&mdash;</option>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Reorder Level</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={editReorderLevel}
                  onChange={(e) => setEditReorderLevel(e.target.value)}
                  placeholder="Min stock"
                  className={`${inputClass} w-full`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Reorder Qty</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={editReorderQty}
                  onChange={(e) => setEditReorderQty(e.target.value)}
                  placeholder="Order amount"
                  className={`${inputClass} w-full`}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={saveEdit} className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover">
                Save
              </button>
              <button onClick={() => setEditing(false)} className="text-text-secondary text-sm px-3 py-1.5 hover:text-text-primary">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row md:gap-8">
            {/* Left side: item info */}
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-semibold text-text-primary">{item.name}</h1>
                    {reorderStatus === 'OK' && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-badge-green-bg text-badge-green-text">
                        OK
                      </span>
                    )}
                    {reorderStatus === 'REORDER' && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-badge-red-bg text-badge-red-text">
                        REORDER
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-text-secondary">
                    <span>{item.category}</span>
                    <span className="text-text-primary font-mono font-medium">{displayQty}</span>
                    {compatible.length > 1 ? (
                      <select
                        value={activeDisplayUnit}
                        onChange={(e) => setDisplayUnit(e.target.value as Unit)}
                        className="bg-white border border-border rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                      >
                        {compatible.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{item.unit}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={startEdit}
                    className="text-text-secondary text-sm hover:text-text-primary px-3 py-1.5 border border-border rounded-lg hover:bg-bg-hover transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="text-accent-red text-sm hover:bg-badge-red-bg px-3 py-1.5 border border-border rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 mt-4 pt-4 border-t border-border text-sm">
                {packagingDescription && (
                  <div className="sm:col-span-3">
                    <span className="text-xs text-text-muted">Packaging</span>
                    <p className="text-text-primary">{packagingDescription}</p>
                  </div>
                )}
                <div>
                  <span className="text-xs text-text-muted">Order Unit</span>
                  <p className="text-text-primary">{item.order_unit ?? '\u2014'}</p>
                </div>
                <div>
                  <span className="text-xs text-text-muted">Qty per Unit</span>
                  <p className="text-text-primary">{item.qty_per_unit != null ? item.qty_per_unit : '\u2014'}</p>
                </div>
                <div>
                  <span className="text-xs text-text-muted">Order Unit Price</span>
                  <p className="text-text-primary">{formatCurrency(item.order_unit_price)}</p>
                </div>
                <div>
                  <span className="text-xs text-text-muted">Inside Unit Price</span>
                  <p className="text-text-primary">
                    {insideUnitPrice == null
                      ? '\u2014'
                      : `${formatCurrency(insideUnitPrice)} / ${insideUnitLabel}`}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-muted">Item Size</span>
                  <p className="text-text-primary">
                    {item.item_size_value != null && item.item_size_unit
                      ? `${item.item_size_value} ${item.item_size_unit}`
                      : '\u2014'}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-muted">Inner Unit</span>
                  <p className="text-text-primary">{item.inner_unit ?? '\u2014'}</p>
                </div>
                <div>
                  <span className="text-xs text-text-muted">Reorder Level</span>
                  <p className="text-text-primary">{item.reorder_level != null ? item.reorder_level : '\u2014'}</p>
                </div>
                <div>
                  <span className="text-xs text-text-muted">Reorder Qty</span>
                  <p className="text-text-primary">{item.reorder_qty != null ? item.reorder_qty : '\u2014'}</p>
                </div>
              </div>
            </div>

            {/* Right side: stock by area */}
            <div className="md:w-72 shrink-0 mt-6 md:mt-0">
              <div className="bg-bg-page rounded-lg p-4">
                <h2 className="text-sm font-semibold text-text-primary mb-3">Stock by Area</h2>
                {itemStorage && itemStorage.length > 0 ? (
                  <div>
                    {itemStorage.map((is) => (
                      <div key={is.area_id} className="flex items-center justify-between text-sm py-1.5">
                        <span className="text-text-secondary">{is.area_name}</span>
                        <span className="text-text-primary font-mono font-medium">{is.quantity} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-text-secondary text-sm">No stock in any area.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transaction form + Cycle count — side by side */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Log transaction */}
        <TransactionForm item={item} />

        {/* Cycle count */}
        <div className="bg-bg-card rounded-xl shadow-sm p-5">
          <h2 className="text-base font-semibold text-text-primary mb-4">Cycle Count</h2>
          <form onSubmit={submitCycleCount} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Counted Qty ({item.unit})</label>
              <input
                type="number"
                step="any"
                min="0"
                value={countedQty}
                onChange={(e) => setCountedQty(e.target.value)}
                className={`w-full ${inputClass}`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Count Notes (optional)</label>
              <input
                type="text"
                value={countNotes}
                onChange={(e) => setCountNotes(e.target.value)}
                placeholder="Count context, reason, location"
                className={`w-full ${inputClass} placeholder:text-text-muted`}
              />
            </div>
            <button
              type="submit"
              disabled={!countQtyValid || setItemCount.isPending}
              className="bg-accent-amber text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {setItemCount.isPending ? 'Applying...' : 'Apply Count'}
            </button>
          </form>
          {countDelta !== null && (
            <div className="text-xs mt-2 text-text-secondary">
              Variance vs current: <span className={countDelta >= 0 ? 'text-accent-green' : 'text-accent-red'}>
                {countDelta >= 0 ? '+' : ''}{countDelta} {item.unit}
              </span>
            </div>
          )}
          {setItemCount.error && (
            <div className="text-accent-red text-xs mt-2">{setItemCount.error.message}</div>
          )}
        </div>
      </div>

      {/* Transaction history */}
      <div className="bg-bg-card rounded-xl shadow-sm p-5">
        <h2 className="text-base font-semibold text-text-primary mb-4">Transaction History</h2>
        {transactions.length > 0 ? (
          <div>
            {transactions.map((tx) => {
              const txDisplayQty = convertQuantity(
                tx.quantity,
                item.unit,
                activeDisplayUnit,
                {
                  baseUnit: item.unit,
                  orderUnit: item.order_unit,
                  innerUnit: item.inner_unit,
                  qtyPerUnit: item.qty_per_unit,
                  itemSizeValue: item.item_size_value,
                  itemSizeUnit: item.item_size_unit,
                },
              );
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between py-3 border-b border-border last:border-0 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className={`font-mono font-medium ${tx.type === 'in' ? 'text-accent-green' : 'text-accent-red'}`}>
                      {tx.type === 'in' ? '+' : '-'}
                      {txDisplayQty} {activeDisplayUnit}
                    </span>
                    <span className="text-text-secondary">{tx.reason}</span>
                    {tx.notes && <span className="text-text-muted italic">&mdash; {tx.notes}</span>}
                  </div>
                  <span className="text-text-muted text-xs">{new Date(tx.created_at).toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-text-secondary text-sm">No transactions yet.</div>
        )}
      </div>
    </div>
  );
}
