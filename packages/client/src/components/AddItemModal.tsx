import { useState } from 'react';
import { useCreateItem } from '../hooks/useItems';
import { CATEGORIES, UNITS } from '@fifoflow/shared';
import type { Category, Unit } from '@fifoflow/shared';

export function AddItemModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [unit, setUnit] = useState<Unit>(UNITS[0]);
  const createItem = useCreateItem();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createItem.mutate({ name, category, unit }, {
      onSuccess: () => onClose(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-light border border-border rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Add Item</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
              >
                {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as Unit)}
                className="w-full bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          {createItem.error && (
            <div className="text-accent-red text-xs">{createItem.error.message}</div>
          )}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createItem.isPending}
              className="bg-accent-green text-navy px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {createItem.isPending ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
