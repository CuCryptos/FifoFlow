import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useItems } from '../hooks/useItems';
import { CATEGORIES, LOW_STOCK_THRESHOLD } from '@fifoflow/shared';
import { getCompatibleUnits, convertQuantity } from '@fifoflow/shared';
import type { Unit } from '@fifoflow/shared';
import { AddItemModal } from '../components/AddItemModal';

export function Inventory() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [displayUnits, setDisplayUnits] = useState<Record<number, Unit>>({});
  const [orderQtys, setOrderQtys] = useState<Record<number, string>>({});
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
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Item list */}
      {isLoading ? (
        <div className="text-text-secondary text-sm">Loading...</div>
      ) : items && items.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-lighter text-text-secondary text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 font-medium">Order Qty</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const displayUnit = getDisplayUnit(item.id, item.unit);
                const displayQty = convertQuantity(item.current_qty, item.unit, displayUnit);
                const compatible = getCompatibleUnits(item.unit);
                return (
                  <tr key={item.id} className="border-t border-border hover:bg-navy-lighter/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/inventory/${item.id}`} className="text-accent-green hover:underline">
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{item.category}</td>
                    <td className="px-4 py-3 font-medium">{displayQty}</td>
                    <td className="px-4 py-3">
                      {compatible.length > 1 ? (
                        <select
                          value={displayUnit}
                          onChange={(e) => setDisplayUnit(item.id, e.target.value as Unit)}
                          className="bg-navy border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-green"
                        >
                          {compatible.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-text-secondary">{item.unit}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="—"
                        value={orderQtys[item.id] ?? ''}
                        onChange={(e) =>
                          setOrderQtys((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        className="w-20 bg-navy border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent-green"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StockBadge qty={item.current_qty} />
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

      {showAddModal && <AddItemModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}

function StockBadge({ qty }: { qty: number }) {
  if (qty === 0) {
    return <span className="text-xs px-2 py-0.5 rounded bg-accent-red/20 text-accent-red">OUT</span>;
  }
  if (qty <= LOW_STOCK_THRESHOLD) {
    return <span className="text-xs px-2 py-0.5 rounded bg-accent-amber/20 text-accent-amber">LOW</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded bg-accent-green/20 text-accent-green">OK</span>;
}
