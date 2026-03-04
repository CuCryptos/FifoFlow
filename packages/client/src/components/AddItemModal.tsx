import { useState } from 'react';
import { useCreateItem } from '../hooks/useItems';
import { CATEGORIES, UNITS } from '@fifoflow/shared';
import type { Category, Unit } from '@fifoflow/shared';
import { X } from 'lucide-react';

export function AddItemModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [unit, setUnit] = useState<Unit>(UNITS[0]);
  const [orderUnit, setOrderUnit] = useState<Unit | ''>('');
  const [orderUnitPrice, setOrderUnitPrice] = useState('');
  const [qtyPerUnit, setQtyPerUnit] = useState('');
  const [innerUnit, setInnerUnit] = useState<Unit | ''>('');
  const [itemSizeValue, setItemSizeValue] = useState('');
  const [itemSizeUnit, setItemSizeUnit] = useState<Unit | ''>('');
  const createItem = useCreateItem();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createItem.mutate(
      {
        name,
        category,
        unit,
        order_unit: orderUnit || null,
        order_unit_price: orderUnitPrice ? Number(orderUnitPrice) : null,
        qty_per_unit: qtyPerUnit ? Number(qtyPerUnit) : null,
        inner_unit: innerUnit || null,
        item_size_value: itemSizeValue ? Number(itemSizeValue) : null,
        item_size_unit: itemSizeUnit || null,
        item_size: itemSizeValue && itemSizeUnit ? `${itemSizeValue} ${itemSizeUnit}` : null,
      },
      {
        onSuccess: () => onClose(),
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bg-card rounded-2xl shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-text-primary">Add Item</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
              >
                {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as Unit)}
                className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="border border-border rounded-lg p-4 space-y-3">
            <p className="text-xs font-medium text-text-secondary">Packaging (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Order Unit</label>
                <select
                  value={orderUnit}
                  onChange={(e) => setOrderUnit((e.target.value as Unit | '') ?? '')}
                  className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                >
                  <option value="">—</option>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Order Unit Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={orderUnitPrice}
                  onChange={(e) => setOrderUnitPrice(e.target.value)}
                  placeholder="e.g. 240"
                  className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Qty per Order Unit</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={qtyPerUnit}
                  onChange={(e) => setQtyPerUnit(e.target.value)}
                  placeholder="e.g. 12"
                  className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Inner Unit</label>
                <select
                  value={innerUnit}
                  onChange={(e) => setInnerUnit((e.target.value as Unit | '') ?? '')}
                  className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                >
                  <option value="">—</option>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Item Size Value</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={itemSizeValue}
                  onChange={(e) => setItemSizeValue(e.target.value)}
                  placeholder="e.g. 750"
                  className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Item Size Unit</label>
                <select
                  value={itemSizeUnit}
                  onChange={(e) => setItemSizeUnit((e.target.value as Unit | '') ?? '')}
                  className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                >
                  <option value="">—</option>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          {createItem.error && (
            <div className="text-accent-red text-xs">{createItem.error.message}</div>
          )}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createItem.isPending}
              className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-50 transition-colors"
            >
              {createItem.isPending ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
