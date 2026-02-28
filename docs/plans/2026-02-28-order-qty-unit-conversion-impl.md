# Order Qty + Unit Conversion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an editable Order Qty input and on-the-fly unit conversion to the inventory list and item detail pages.

**Architecture:** Unit conversion logic lives in the shared package as pure functions. The frontend adds display-unit state per item row and a transient order-qty map. No database or API changes needed — the new units (`ml`, `fl oz`) are just added to the shared constants, and all conversion is client-side.

**Tech Stack:** TypeScript (shared conversions), React (state management for display units and order quantities)

---

### Task 1: Add new units and unit conversion logic to shared package

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/conversions.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Add `ml` and `fl oz` to the UNITS array**

In `packages/shared/src/constants.ts`, change the UNITS array to:
```typescript
export const UNITS = [
  'each',
  'lb',
  'oz',
  'gal',
  'qt',
  'fl oz',
  'ml',
  'case',
  'bag',
  'box',
  'bottle',
] as const;
```

**Step 2: Create the conversions module**

`packages/shared/src/conversions.ts`:
```typescript
import type { Unit } from './types.js';

// Each group defines units that can convert between each other.
// Factor is relative to the group's base unit (first in the array).
const UNIT_GROUPS: { units: Unit[]; factors: Record<string, number> }[] = [
  {
    units: ['lb', 'oz'],
    factors: { lb: 1, oz: 16 },
  },
  {
    units: ['gal', 'qt', 'fl oz', 'ml'],
    factors: { gal: 1, qt: 4, 'fl oz': 128, ml: 3785.41 },
  },
];

/**
 * Get all units compatible with the given unit (including itself).
 * Returns a single-element array if the unit has no conversion group.
 */
export function getCompatibleUnits(unit: Unit): Unit[] {
  for (const group of UNIT_GROUPS) {
    if (group.units.includes(unit)) {
      return group.units;
    }
  }
  return [unit];
}

/**
 * Convert a quantity from one unit to another.
 * Returns the original quantity if units are not in the same group.
 */
export function convertQuantity(qty: number, fromUnit: Unit, toUnit: Unit): number {
  if (fromUnit === toUnit) return qty;

  for (const group of UNIT_GROUPS) {
    const fromFactor = group.factors[fromUnit];
    const toFactor = group.factors[toUnit];
    if (fromFactor !== undefined && toFactor !== undefined) {
      // Convert: qty in fromUnit -> base unit -> toUnit
      const baseQty = qty / fromFactor;
      return Math.round(baseQty * toFactor * 100) / 100;
    }
  }

  return qty; // incompatible units, return unchanged
}
```

**Step 3: Export from barrel**

Add to `packages/shared/src/index.ts`:
```typescript
export * from './conversions.js';
```

**Step 4: Verify typecheck passes**

```bash
npm run typecheck --workspace=packages/shared
```

**Step 5: Commit**

```bash
git add packages/shared/src/
git commit -m "feat: add ml/fl oz units and unit conversion logic"
```

---

### Task 2: Update Inventory list with unit conversion dropdown and Order Qty column

**Files:**
- Modify: `packages/client/src/pages/Inventory.tsx`

**Step 1: Replace the Inventory page**

The updated `packages/client/src/pages/Inventory.tsx`:
```tsx
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
```

**Step 2: Verify build**

```bash
cd /Users/curtisvaughan/FifoFlow/packages/client && npx vite build
```

**Step 3: Commit**

```bash
git add packages/client/src/pages/Inventory.tsx
git commit -m "feat: add order qty column and unit conversion dropdown to inventory list"
```

---

### Task 3: Update Item Detail page with unit conversion and Order Qty

**Files:**
- Modify: `packages/client/src/pages/ItemDetail.tsx`

**Step 1: Update the ItemDetail page**

Replace `packages/client/src/pages/ItemDetail.tsx` with:
```tsx
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
  const [orderQty, setOrderQty] = useState('');

  if (isLoading) return <div className="text-text-secondary">Loading...</div>;
  if (!data) return <div className="text-accent-red">Item not found.</div>;

  const { item, transactions } = data;
  const activeDisplayUnit = displayUnit ?? item.unit;
  const displayQty = convertQuantity(item.current_qty, item.unit, activeDisplayUnit);
  const compatible = getCompatibleUnits(item.unit);

  const startEdit = () => {
    setEditName(item.name);
    setEditCategory(item.category);
    setEditUnit(item.unit);
    setEditing(true);
  };

  const saveEdit = () => {
    updateItem.mutate(
      { id: item.id, data: { name: editName, category: editCategory, unit: editUnit } },
      {
        onSuccess: () => {
          setEditing(false);
          setDisplayUnit(null); // reset display unit since stored unit may have changed
        },
      }
    );
  };

  const handleDelete = () => {
    if (confirm('Delete this item? This cannot be undone.')) {
      deleteItem.mutate(item.id, { onSuccess: () => navigate('/inventory') });
    }
  };

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/inventory')} className="text-text-secondary text-sm hover:text-text-primary">
        ← Back to Inventory
      </button>

      {/* Item header */}
      <div className="bg-navy-light border border-border rounded-lg p-6">
        {editing ? (
          <div className="space-y-3">
            <input value={editName} onChange={(e) => setEditName(e.target.value)}
              className="bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary w-full focus:outline-none focus:border-accent-green" />
            <div className="flex gap-3">
              <select value={editCategory} onChange={(e) => setEditCategory(e.target.value as Category)}
                className="bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select value={editUnit} onChange={(e) => setEditUnit(e.target.value as Unit)}
                className="bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green">
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={saveEdit} className="bg-accent-green text-navy px-3 py-1.5 rounded text-sm font-medium">Save</button>
              <button onClick={() => setEditing(false)} className="text-text-secondary text-sm px-3 py-1.5">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold">{item.name}</h1>
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
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                ) : (
                  <span>{item.unit}</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <label className="text-xs text-text-secondary">Order Qty:</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="—"
                  value={orderQty}
                  onChange={(e) => setOrderQty(e.target.value)}
                  className="w-24 bg-navy border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent-green"
                />
                <span className="text-xs text-text-secondary">{activeDisplayUnit}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={startEdit} className="text-text-secondary text-sm hover:text-text-primary px-3 py-1.5 border border-border rounded">Edit</button>
              <button onClick={handleDelete} className="text-accent-red text-sm hover:opacity-80 px-3 py-1.5 border border-border rounded">Delete</button>
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
                <div key={tx.id} className="bg-navy-light border border-border rounded px-4 py-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <span className={tx.type === 'in' ? 'text-accent-green' : 'text-accent-red'}>
                      {tx.type === 'in' ? '+' : '-'}{txDisplayQty} {activeDisplayUnit}
                    </span>
                    <span className="text-text-secondary">{tx.reason}</span>
                    {tx.notes && <span className="text-text-secondary italic">— {tx.notes}</span>}
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
```

**Step 2: Verify build**

```bash
cd /Users/curtisvaughan/FifoFlow/packages/client && npx vite build
```

**Step 3: Commit**

```bash
git add packages/client/src/pages/ItemDetail.tsx
git commit -m "feat: add unit conversion and order qty to item detail page"
```

---

## Summary

| Task | What | Files Changed |
|------|------|---------------|
| 1 | Add ml/fl oz units + conversion logic | shared: constants.ts, conversions.ts, index.ts |
| 2 | Inventory list: unit dropdown + order qty column | client: Inventory.tsx |
| 3 | Item detail: unit dropdown + order qty + converted tx history | client: ItemDetail.tsx |
