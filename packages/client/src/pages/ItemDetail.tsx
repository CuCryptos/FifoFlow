import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useItem, useUpdateItem, useDeleteItem } from '../hooks/useItems';
import { CATEGORIES, UNITS } from '@fifoflow/shared';
import { getCompatibleUnits, convertQuantity } from '@fifoflow/shared';
import type { Category, Unit } from '@fifoflow/shared';
import { TransactionForm } from '../components/TransactionForm';

export function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useItem(Number(id));
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<Category>(CATEGORIES[0]);
  const [editUnit, setEditUnit] = useState<Unit>(UNITS[0]);
  const [displayUnit, setDisplayUnit] = useState<Unit | null>(null);

  // New field edit states
  const [editOrderUnit, setEditOrderUnit] = useState('');
  const [editQtyPerUnit, setEditQtyPerUnit] = useState('');
  const [editItemSize, setEditItemSize] = useState('');
  const [editReorderLevel, setEditReorderLevel] = useState('');
  const [editReorderQty, setEditReorderQty] = useState('');

  if (isLoading) return <div className="text-text-secondary">Loading...</div>;
  if (!data) return <div className="text-accent-red">Item not found.</div>;

  const { item, transactions } = data;
  const activeDisplayUnit = displayUnit ?? item.unit;
  const displayQty = convertQuantity(item.current_qty, item.unit, activeDisplayUnit);
  const compatible = getCompatibleUnits(item.unit);

  const reorderStatus =
    item.reorder_level == null
      ? null
      : item.current_qty <= item.reorder_level
        ? 'REORDER'
        : 'OK';

  const startEdit = () => {
    setEditName(item.name);
    setEditCategory(item.category);
    setEditUnit(item.unit);
    setEditOrderUnit(item.order_unit ?? '');
    setEditQtyPerUnit(item.qty_per_unit != null ? String(item.qty_per_unit) : '');
    setEditItemSize(item.item_size ?? '');
    setEditReorderLevel(item.reorder_level != null ? String(item.reorder_level) : '');
    setEditReorderQty(item.reorder_qty != null ? String(item.reorder_qty) : '');
    setEditing(true);
  };

  const saveEdit = () => {
    updateItem.mutate(
      {
        id: item.id,
        data: {
          name: editName,
          category: editCategory,
          unit: editUnit,
          order_unit: editOrderUnit || null,
          qty_per_unit: editQtyPerUnit ? Number(editQtyPerUnit) : null,
          item_size: editItemSize || null,
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

  const inputClass =
    'bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green';

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/inventory')} className="text-text-secondary text-sm hover:text-text-primary">
        &larr; Back to Inventory
      </button>

      {/* Item header */}
      <div className="bg-navy-light border border-border rounded-lg p-6">
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
                <label className="block text-xs text-text-secondary mb-1">Order Unit</label>
                <select
                  value={editOrderUnit}
                  onChange={(e) => setEditOrderUnit(e.target.value)}
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
                <label className="block text-xs text-text-secondary mb-1">Qty per Unit</label>
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
                <label className="block text-xs text-text-secondary mb-1">Item Size</label>
                <input
                  type="text"
                  value={editItemSize}
                  onChange={(e) => setEditItemSize(e.target.value)}
                  placeholder='e.g. 12 oz bottle'
                  className={`${inputClass} w-full`}
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Reorder Level</label>
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
                <label className="block text-xs text-text-secondary mb-1">Reorder Qty</label>
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
              <button onClick={saveEdit} className="bg-accent-green text-navy px-3 py-1.5 rounded text-sm font-medium">
                Save
              </button>
              <button onClick={() => setEditing(false)} className="text-text-secondary text-sm px-3 py-1.5">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold">{item.name}</h1>
                  {reorderStatus === 'OK' && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-accent-green/20 text-accent-green">
                      OK
                    </span>
                  )}
                  {reorderStatus === 'REORDER' && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-accent-red/20 text-accent-red">
                      REORDER
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-text-secondary">
                  <span>{item.category}</span>
                  <span className="text-text-primary font-medium">{displayQty}</span>
                  {compatible.length > 1 ? (
                    <select
                      value={activeDisplayUnit}
                      onChange={(e) => setDisplayUnit(e.target.value as Unit)}
                      className="bg-navy border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-green"
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
                  className="text-text-secondary text-sm hover:text-text-primary px-3 py-1.5 border border-border rounded"
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="text-accent-red text-sm hover:opacity-80 px-3 py-1.5 border border-border rounded"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 mt-4 pt-4 border-t border-border text-sm">
              <div>
                <span className="text-text-secondary text-xs">Order Unit</span>
                <p className="text-text-primary">{item.order_unit ?? '\u2014'}</p>
              </div>
              <div>
                <span className="text-text-secondary text-xs">Qty per Unit</span>
                <p className="text-text-primary">{item.qty_per_unit != null ? item.qty_per_unit : '\u2014'}</p>
              </div>
              <div>
                <span className="text-text-secondary text-xs">Item Size</span>
                <p className="text-text-primary">{item.item_size ?? '\u2014'}</p>
              </div>
              <div>
                <span className="text-text-secondary text-xs">Reorder Level</span>
                <p className="text-text-primary">{item.reorder_level != null ? item.reorder_level : '\u2014'}</p>
              </div>
              <div>
                <span className="text-text-secondary text-xs">Reorder Qty</span>
                <p className="text-text-primary">{item.reorder_qty != null ? item.reorder_qty : '\u2014'}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Log transaction */}
      <TransactionForm itemId={item.id} />

      {/* Transaction history */}
      <div>
        <h2 className="text-sm font-medium text-text-secondary mb-3">Transaction History</h2>
        {transactions.length > 0 ? (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const txDisplayQty = convertQuantity(tx.quantity, item.unit, activeDisplayUnit);
              return (
                <div
                  key={tx.id}
                  className="bg-navy-light border border-border rounded px-4 py-3 flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className={tx.type === 'in' ? 'text-accent-green' : 'text-accent-red'}>
                      {tx.type === 'in' ? '+' : '-'}
                      {txDisplayQty} {activeDisplayUnit}
                    </span>
                    <span className="text-text-secondary">{tx.reason}</span>
                    {tx.notes && <span className="text-text-secondary italic">&mdash; {tx.notes}</span>}
                  </div>
                  <span className="text-text-secondary text-xs">{new Date(tx.created_at).toLocaleString()}</span>
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
