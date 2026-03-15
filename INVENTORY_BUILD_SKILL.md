# INVENTORY SYSTEM BUILD SKILL
## For Claude Code - Read This Before Writing Any Code

---

## CRITICAL: HOW TO USE THIS FILE

Before building ANY feature:
1. Read this entire file
2. Identify which PHASE you're working on
3. Build ONLY that phase
4. Test it works before moving on
5. Do NOT add features from later phases

---

## THE GOLDEN RULE

**Build the simplest thing that works. Then stop.**

Do NOT:
- Add "nice to have" features
- Create complex abstractions
- Build for future requirements
- Over-engineer anything

DO:
- Copy working patterns exactly
- Keep components small and focused
- Test each piece before moving on
- Ask for clarification if unsure

---

## PHASE 1: Display Inventory Table (BUILD THIS FIRST)

### Goal
Show a table of inventory items grouped by category. That's it.

### Done When
- [ ] Table displays all items from Supabase `items` table
- [ ] Items are grouped by category with collapsible sections
- [ ] Each row shows: Name, Order Unit, Order Cost, Qty/Unit, Cost per Item, Stock, Reorder Level, Status
- [ ] "Cost per Item" is calculated: `order_cost / qty_per_unit`
- [ ] "Status" shows "OK" (green) or "REORDER" (red) based on `stock_quantity < reorder_level`
- [ ] Page loads without errors

### Database Schema (use exactly this)
```sql
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  order_unit VARCHAR(50),
  order_cost DECIMAL(10,2),
  qty_per_unit INTEGER,
  item_size VARCHAR(50),
  stock_quantity INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 0,
  reorder_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### TypeScript Types (use exactly this)
```typescript
// types/inventory.ts
export interface Item {
  id: string;
  name: string;
  category: string | null;
  order_unit: string | null;
  order_cost: number | null;
  qty_per_unit: number | null;
  item_size: string | null;
  stock_quantity: number;
  reorder_level: number;
  reorder_quantity: number;
  created_at: string;
  updated_at: string;
}

export interface ItemWithCalculations extends Item {
  cost_per_item: number | null;
  reorder_status: 'OK' | 'REORDER';
}

export function calculateItemFields(item: Item): ItemWithCalculations {
  return {
    ...item,
    cost_per_item: (item.order_cost && item.qty_per_unit && item.qty_per_unit > 0)
      ? item.order_cost / item.qty_per_unit
      : null,
    reorder_status: item.stock_quantity < item.reorder_level ? 'REORDER' : 'OK'
  };
}
```

### Working Component Code (adapt this)
```typescript
// components/InventoryTable.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Item, ItemWithCalculations, calculateItemFields } from '@/types/inventory';

export default function InventoryTable() {
  const [items, setItems] = useState<ItemWithCalculations[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchItems() {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('category')
        .order('name');
      
      if (error) {
        console.error('Error fetching items:', error);
        return;
      }
      
      const itemsWithCalcs = (data || []).map(calculateItemFields);
      setItems(itemsWithCalcs);
      setLoading(false);
    }
    
    fetchItems();
  }, []);

  if (loading) return <div>Loading...</div>;

  // Group by category
  const grouped = items.reduce((acc, item) => {
    const cat = item.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, ItemWithCalculations[]>);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Inventory</h1>
      
      {Object.entries(grouped).map(([category, categoryItems]) => (
        <div key={category} className="mb-6">
          <h2 className="text-lg font-semibold bg-gray-100 p-2 mb-2">{category}</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2 border">Item</th>
                <th className="text-left p-2 border">Order Unit</th>
                <th className="text-right p-2 border">Cost</th>
                <th className="text-right p-2 border">Qty/Unit</th>
                <th className="text-right p-2 border">Cost/Item</th>
                <th className="text-right p-2 border">Stock</th>
                <th className="text-right p-2 border">Reorder Level</th>
                <th className="text-center p-2 border">Status</th>
              </tr>
            </thead>
            <tbody>
              {categoryItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="p-2 border">{item.name}</td>
                  <td className="p-2 border">{item.order_unit || '-'}</td>
                  <td className="p-2 border text-right">
                    {item.order_cost ? `$${item.order_cost.toFixed(2)}` : '-'}
                  </td>
                  <td className="p-2 border text-right">{item.qty_per_unit || '-'}</td>
                  <td className="p-2 border text-right">
                    {item.cost_per_item ? `$${item.cost_per_item.toFixed(2)}` : '-'}
                  </td>
                  <td className="p-2 border text-right">{item.stock_quantity}</td>
                  <td className="p-2 border text-right">{item.reorder_level}</td>
                  <td className="p-2 border text-center">
                    <span className={`px-2 py-1 rounded text-sm font-medium ${
                      item.reorder_status === 'OK' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {item.reorder_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
```

### File Structure
```
/app
  /page.tsx              → imports and renders InventoryTable
/components
  /InventoryTable.tsx    → the table component above
/types
  /inventory.ts          → the types above
/lib
  /supabase
    /client.ts           → supabase browser client (you likely have this)
```

---

## PHASE 2: Add Item Form (ONLY after Phase 1 works)

### Goal
Add a button that opens a form to create a new item.

### Done When
- [ ] "+ Add Item" button appears above the table
- [ ] Clicking it opens a modal/drawer with a form
- [ ] Form has fields: Name, Category, Order Unit, Order Cost, Qty per Unit, Item Size, Stock, Reorder Level, Reorder Qty
- [ ] Submitting the form creates a new row in Supabase
- [ ] Table refreshes to show the new item
- [ ] Form closes after successful submit

### Working Component Code
```typescript
// components/ItemForm.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ItemFormProps {
  onClose: () => void;
  onSaved: () => void;
}

export default function ItemForm({ onClose, onSaved }: ItemFormProps) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    order_unit: '',
    order_cost: '',
    qty_per_unit: '',
    item_size: '',
    stock_quantity: '0',
    reorder_level: '0',
    reorder_quantity: '0',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const { error } = await supabase.from('items').insert({
      name: formData.name,
      category: formData.category || null,
      order_unit: formData.order_unit || null,
      order_cost: formData.order_cost ? parseFloat(formData.order_cost) : null,
      qty_per_unit: formData.qty_per_unit ? parseInt(formData.qty_per_unit) : null,
      item_size: formData.item_size || null,
      stock_quantity: parseInt(formData.stock_quantity) || 0,
      reorder_level: parseInt(formData.reorder_level) || 0,
      reorder_quantity: parseInt(formData.reorder_quantity) || 0,
    });

    setSaving(false);

    if (error) {
      alert('Error saving item: ' + error.message);
      return;
    }

    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Add Item</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Item Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full border rounded p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <input
              type="text"
              name="category"
              value={formData.category}
              onChange={handleChange}
              placeholder="e.g., Bottled Beer"
              className="w-full border rounded p-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Order Unit</label>
              <input
                type="text"
                name="order_unit"
                value={formData.order_unit}
                onChange={handleChange}
                placeholder="e.g., Case"
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Order Cost ($)</label>
              <input
                type="number"
                name="order_cost"
                value={formData.order_cost}
                onChange={handleChange}
                step="0.01"
                placeholder="0.00"
                className="w-full border rounded p-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Qty per Unit</label>
              <input
                type="number"
                name="qty_per_unit"
                value={formData.qty_per_unit}
                onChange={handleChange}
                placeholder="e.g., 24"
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Item Size</label>
              <input
                type="text"
                name="item_size"
                value={formData.item_size}
                onChange={handleChange}
                placeholder="e.g., 12 oz bottle"
                className="w-full border rounded p-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Stock</label>
              <input
                type="number"
                name="stock_quantity"
                value={formData.stock_quantity}
                onChange={handleChange}
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reorder Level</label>
              <input
                type="number"
                name="reorder_level"
                value={formData.reorder_level}
                onChange={handleChange}
                className="w-full border rounded p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reorder Qty</label>
              <input
                type="number"
                name="reorder_quantity"
                value={formData.reorder_quantity}
                onChange={handleChange}
                className="w-full border rounded p-2"
              />
            </div>
          </div>

          {/* Calculated field - display only */}
          {formData.order_cost && formData.qty_per_unit && (
            <div className="bg-gray-50 p-3 rounded">
              <span className="text-sm text-gray-600">Cost per Item: </span>
              <span className="font-medium">
                ${(parseFloat(formData.order_cost) / parseInt(formData.qty_per_unit)).toFixed(2)}
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

---

## PHASE 3: Edit Item (ONLY after Phase 2 works)

### Goal
Click a row to edit that item.

### Done When
- [ ] Clicking a row opens the form pre-filled with that item's data
- [ ] Form title changes to "Edit Item"
- [ ] Submitting updates the existing row (not creates new)
- [ ] Table refreshes to show changes

### Changes Required
- Add `editingItem` state to parent
- Pass item to ItemForm
- ItemForm checks if item exists → uses UPDATE instead of INSERT

---

## PHASE 4: Delete Item (ONLY after Phase 3 works)

### Goal
Delete an item.

### Done When
- [ ] Delete button appears in edit form (or on row)
- [ ] Confirmation dialog appears before delete
- [ ] Item is removed from Supabase
- [ ] Table refreshes

---

## PHASE 5: Filters (ONLY after Phase 4 works)

### Goal
Filter the table.

### Done When
- [ ] Category dropdown filters to one category
- [ ] Status filter shows only "REORDER" items
- [ ] Search box filters by item name
- [ ] Filters can be combined

---

## STOP HERE

Do not build beyond Phase 5 until all phases work perfectly.

Future phases (build later):
- Phase 6: CSV Import
- Phase 7: Locations (Front Bar, Back Bar)
- Phase 8: Usage Tracking
- Phase 9: Recipes
- Phase 10: AI Assistant

---

## TROUBLESHOOTING

### "Cost per Item shows wrong value"
- Check: Is the calculation `order_cost / qty_per_unit`?
- Check: Are both values numbers (not strings)?
- Check: Is qty_per_unit > 0?

### "Status always shows OK"
- Check: Is the comparison `stock_quantity < reorder_level`?
- Check: Are both values integers?

### "Items don't appear"
- Check: Is the Supabase query correct?
- Check: Is there data in the table?
- Check: Are environment variables set?

### "Form doesn't save"
- Check: Is the insert/update query correct?
- Check: Are required fields filled?
- Check: Does the user have permission?

---

## REFERENCE PROJECTS

If you need to see how other apps do this:

1. **FinOpenPOS** - https://github.com/JoaoHenriqueBarbosa/FinOpenPOS
   - Next.js + Supabase inventory system
   - Look at their schema.sql and components

2. **shadcn/ui Data Table** - https://ui.shadcn.com/docs/components/data-table
   - Clean table component patterns
   - Filtering, sorting, pagination

---

## VERSION
Skill version: 1.0
Last updated: 2025-02-28
