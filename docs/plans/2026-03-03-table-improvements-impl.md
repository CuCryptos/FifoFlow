# Table Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the 486-item inventory table fully usable with sortable columns, client-side pagination (50/page), sticky headers, bulk actions (category reassign + bulk delete), and toast notifications.

**Architecture:** All sorting and pagination is client-side — fetch all items once, sort/filter/paginate in the browser. Two new server endpoints for bulk operations. A new Toast context provider for app-wide feedback notifications.

**Tech Stack:** React 19, TanStack Query, Tailwind CSS v4, Express 5, Zod v4, better-sqlite3 (local) / Supabase REST (production)

---

### Task 1: Toast Notification System

Create a ToastContext provider and useToast hook for app-wide feedback notifications. Toast types: success (green), error (red), info (neutral). Auto-dismiss after 4 seconds. Fixed stack in bottom-right corner. Max 3 visible.

**Files:**
- Create: `packages/client/src/contexts/ToastContext.tsx`
- Modify: `packages/client/src/App.tsx:16-31`

**Step 1: Create ToastContext with provider and hook**

Create `packages/client/src/contexts/ToastContext.tsx`:

```tsx
import { createContext, useCallback, useContext, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId++;
    setToasts((prev) => {
      const next = [...prev, { id, message, type }];
      // Max 3 visible — remove oldest when exceeded
      return next.length > 3 ? next.slice(next.length - 3) : next;
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const borderColor = {
    success: 'border-l-accent-green',
    error: 'border-l-accent-red',
    info: 'border-l-border-emphasis',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container — fixed bottom-right */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`bg-bg-card border border-border ${borderColor[t.type]} border-l-4 rounded-lg shadow-lg px-4 py-3 text-sm text-text-primary animate-slide-in cursor-pointer`}
            onClick={() => dismiss(t.id)}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
```

**Step 2: Add slide-in animation to Tailwind config**

Add a `@keyframes slide-in` and `animate-slide-in` utility to `packages/client/src/index.css`. Since we're using Tailwind v4 with CSS-based config, add this at the end of the file:

```css
@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.animate-slide-in {
  animation: slide-in 0.2s ease-out;
}
```

**Step 3: Wrap app with ToastProvider**

Modify `packages/client/src/App.tsx` — wrap the `<BrowserRouter>` inside `<ToastProvider>`:

```tsx
import { ToastProvider } from './contexts/ToastContext';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/inventory/:id" element={<ItemDetail />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/counts" element={<Counts />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
```

**Step 4: Verify the app compiles**

Run: `cd packages/client && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/client/src/contexts/ToastContext.tsx packages/client/src/App.tsx packages/client/src/index.css
git commit -m "feat: add toast notification system"
```

---

### Task 2: Server Bulk Endpoints

Add PATCH /api/items/bulk (category reassign) and DELETE /api/items/bulk (with delete protection). Implement in both SQLite and Supabase stores.

**Files:**
- Modify: `packages/server/src/store/types.ts:69-106` — add bulk methods to InventoryStore interface
- Modify: `packages/server/src/store/sqliteStore.ts` — implement bulk methods
- Modify: `packages/server/src/store/supabaseStore.ts` — implement bulk methods
- Modify: `packages/server/src/routes/items.ts` — add bulk routes
- Modify: `packages/shared/src/schemas.ts` — add Zod schemas for bulk input validation

**Step 1: Add Zod schemas for bulk operations**

In `packages/shared/src/schemas.ts`, add:

```typescript
export const bulkUpdateItemsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
  updates: z.object({
    category: z.enum(CATEGORIES),
  }),
});

export const bulkDeleteItemsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

export type BulkUpdateItemsInput = z.infer<typeof bulkUpdateItemsSchema>;
export type BulkDeleteItemsInput = z.infer<typeof bulkDeleteItemsSchema>;
```

Make sure to export these from `packages/shared/src/index.ts`.

**Step 2: Add bulk methods to InventoryStore interface**

In `packages/server/src/store/types.ts`, add to the `InventoryStore` interface:

```typescript
bulkUpdateItems(ids: number[], updates: { category: string }): Promise<{ updated: number }>;
bulkDeleteItems(ids: number[]): Promise<{ deleted: number; skipped: number; skippedIds: number[] }>;
```

**Step 3: Implement bulk methods in SqliteInventoryStore**

In `packages/server/src/store/sqliteStore.ts`, add:

```typescript
async bulkUpdateItems(ids: number[], updates: { category: string }): Promise<{ updated: number }> {
  const placeholders = ids.map(() => '?').join(',');
  const result = this.db.prepare(
    `UPDATE items SET category = ? WHERE id IN (${placeholders})`
  ).run(updates.category, ...ids);
  return { updated: result.changes };
}

async bulkDeleteItems(ids: number[]): Promise<{ deleted: number; skipped: number; skippedIds: number[] }> {
  const skippedIds: number[] = [];
  const deletableIds: number[] = [];

  for (const id of ids) {
    const txCount = await this.countTransactionsForItem(id);
    if (txCount > 0) {
      skippedIds.push(id);
    } else {
      deletableIds.push(id);
    }
  }

  if (deletableIds.length > 0) {
    const placeholders = deletableIds.map(() => '?').join(',');
    this.db.prepare(`DELETE FROM items WHERE id IN (${placeholders})`).run(...deletableIds);
  }

  return {
    deleted: deletableIds.length,
    skipped: skippedIds.length,
    skippedIds,
  };
}
```

**Step 4: Implement bulk methods in SupabaseInventoryStore**

In `packages/server/src/store/supabaseStore.ts`, add:

```typescript
async bulkUpdateItems(ids: number[], updates: { category: string }): Promise<{ updated: number }> {
  // Supabase REST: PATCH with `id=in.(1,2,3)` filter
  const params = new URLSearchParams();
  params.set('id', `in.(${ids.join(',')})`);

  const rows = await this.request<{ id: number }[]>({
    method: 'PATCH',
    path: 'items',
    params,
    body: { category: updates.category },
    prefer: 'return=representation',
  });
  return { updated: rows.length };
}

async bulkDeleteItems(ids: number[]): Promise<{ deleted: number; skipped: number; skippedIds: number[] }> {
  const skippedIds: number[] = [];
  const deletableIds: number[] = [];

  for (const id of ids) {
    const txCount = await this.countTransactionsForItem(id);
    if (txCount > 0) {
      skippedIds.push(id);
    } else {
      deletableIds.push(id);
    }
  }

  if (deletableIds.length > 0) {
    const params = new URLSearchParams();
    params.set('id', `in.(${deletableIds.join(',')})`);
    await this.request<void>({
      method: 'DELETE',
      path: 'items',
      params,
      prefer: 'return=minimal',
    });
  }

  return {
    deleted: deletableIds.length,
    skipped: skippedIds.length,
    skippedIds,
  };
}
```

**Step 5: Add bulk routes**

In `packages/server/src/routes/items.ts`, add these routes BEFORE the `/:id` routes (Express matches in order, and `bulk` would match `:id` otherwise):

```typescript
// PATCH /api/items/bulk — bulk category reassign
router.patch('/bulk', async (req, res) => {
  const parsed = bulkUpdateItemsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const result = await store.bulkUpdateItems(parsed.data.ids, parsed.data.updates);
  res.json(result);
});

// DELETE /api/items/bulk — bulk delete with protection
router.delete('/bulk', async (req, res) => {
  const parsed = bulkDeleteItemsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const result = await store.bulkDeleteItems(parsed.data.ids);
  res.json(result);
});
```

Import `bulkUpdateItemsSchema` and `bulkDeleteItemsSchema` from `@fifoflow/shared`.

**Step 6: Build and verify**

Run: `npm run build -w packages/shared && cd packages/server && npx tsc --noEmit`
Expected: No errors

**Step 7: Run existing server tests**

Run: `npm test --workspace=packages/server`
Expected: All existing tests pass

**Step 8: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/src/index.ts packages/server/src/store/types.ts packages/server/src/store/sqliteStore.ts packages/server/src/store/supabaseStore.ts packages/server/src/routes/items.ts
git commit -m "feat: add bulk update and bulk delete server endpoints"
```

---

### Task 3: Client API and Hooks for Bulk Operations

Add bulk API methods and TanStack Query mutation hooks.

**Files:**
- Modify: `packages/client/src/api.ts:40-63` — add bulk methods to `api.items`
- Modify: `packages/client/src/hooks/useItems.ts` — add `useBulkUpdateItems` and `useBulkDeleteItems` hooks

**Step 1: Add bulk API methods**

In `packages/client/src/api.ts`, add inside `api.items`:

```typescript
bulkUpdate: (data: { ids: number[]; updates: { category: string } }) =>
  fetchJson<{ updated: number }>('/items/bulk', { method: 'PATCH', body: JSON.stringify(data) }),
bulkDelete: (data: { ids: number[] }) =>
  fetchJson<{ deleted: number; skipped: number; skippedIds: number[] }>('/items/bulk', { method: 'DELETE', body: JSON.stringify(data) }),
```

**Step 2: Add mutation hooks**

In `packages/client/src/hooks/useItems.ts`, add:

```typescript
export function useBulkUpdateItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { ids: number[]; updates: { category: string } }) => api.items.bulkUpdate(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); },
  });
}

export function useBulkDeleteItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { ids: number[] }) => api.items.bulkDelete(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
```

**Step 3: Verify compilation**

Run: `cd packages/client && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/client/src/api.ts packages/client/src/hooks/useItems.ts
git commit -m "feat: add client API and hooks for bulk item operations"
```

---

### Task 4: Sortable Columns

Add sort state to Inventory page. Click any column header to sort ascending, click again for descending. Visual arrow indicator on active sort column. Default sort: name ascending.

**Files:**
- Modify: `packages/client/src/pages/Inventory.tsx`

**Step 1: Add sort state and comparator**

At the top of the `Inventory` component (after existing state), add:

```typescript
type SortField = 'name' | 'category' | 'current_qty' | 'unit' | 'reorder_level' | 'reorder_qty' | 'order_unit' | 'order_unit_price' | 'qty_per_unit';
type SortDir = 'asc' | 'desc';

const [sortField, setSortField] = useState<SortField>('name');
const [sortDir, setSortDir] = useState<SortDir>('asc');

const toggleSort = (field: SortField) => {
  if (sortField === field) {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
  } else {
    setSortField(field);
    setSortDir('asc');
  }
};
```

Note: `SortField` and `SortDir` type aliases should be defined outside the component, before the `Inventory` function.

**Step 2: Add sorted items computation**

After the existing `itemsToRender` filter, replace direct usage with a sorted version:

```typescript
const sortedItems = useMemo(() => {
  const arr = [...itemsToRender];
  arr.sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    // Nulls sort to end
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    // String comparison for text fields
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      const cmp = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    }
    // Numeric comparison
    const diff = Number(aVal) - Number(bVal);
    return sortDir === 'asc' ? diff : -diff;
  });
  return arr;
}, [itemsToRender, sortField, sortDir]);
```

Use `sortedItems` instead of `itemsToRender` in the `tbody` map.

**Step 3: Create a SortHeader helper component**

Above the `Inventory` component:

```typescript
function SortHeader({
  label,
  field,
  activeField,
  dir,
  onToggle,
  className = '',
}: {
  label: string;
  field: SortField;
  activeField: SortField;
  dir: SortDir;
  onToggle: (field: SortField) => void;
  className?: string;
}) {
  const isActive = field === activeField;
  return (
    <th
      className={`px-3 py-2.5 font-medium text-xs uppercase tracking-wide cursor-pointer select-none hover:text-text-primary transition-colors ${className}`}
      onClick={() => onToggle(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          <span className="text-accent-indigo">{dir === 'asc' ? '▲' : '▼'}</span>
        ) : (
          <span className="text-text-muted/40">▲</span>
        )}
      </span>
    </th>
  );
}
```

**Step 4: Replace column headers with SortHeader**

Replace the column header `<th>` elements in Row 2 of `<thead>` with `<SortHeader>` for sortable columns. Non-sortable columns (Reorder badge, Stock Unit, collapsible group columns) keep plain `<th>`.

Example for Name column:
```tsx
<SortHeader label="Name" field="name" activeField={sortField} dir={sortDir} onToggle={toggleSort} />
```

For right-aligned columns like "In Stock":
```tsx
<SortHeader label="In Stock" field="current_qty" activeField={sortField} dir={sortDir} onToggle={toggleSort} className="text-right" />
```

Sortable columns: Name (`name`), Category (`category`), In Stock (`current_qty`), Reorder Level (`reorder_level`), Reorder Qty (`reorder_qty`), Order Unit (`order_unit`), Pack Qty (`qty_per_unit`), Order Price (`order_unit_price`).

Non-sortable (keep as plain `<th>`): Stock Unit, Reorder badge, Inner Unit, Size Value, Size Unit, Inside Price, Order Qty, Total Cost.

**Step 5: Update footer to use sortedItems count**

The footer currently shows `itemsToRender.length`. Keep this — it's the total filtered count which is still correct since `sortedItems` has the same length.

**Step 6: Verify app compiles and sorting works visually**

Run: `cd packages/client && npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add packages/client/src/pages/Inventory.tsx
git commit -m "feat: add sortable columns to inventory table"
```

---

### Task 5: Client-Side Pagination

Add 50-items-per-page pagination with page controls at the bottom of the table. Reset to page 1 when search, filter, or sort changes.

**Files:**
- Modify: `packages/client/src/pages/Inventory.tsx`

**Step 1: Add pagination state and computed values**

In the `Inventory` component, add:

```typescript
const ITEMS_PER_PAGE = 50;
const [currentPage, setCurrentPage] = useState(1);

// Reset to page 1 when filters or sort changes
useEffect(() => {
  setCurrentPage(1);
}, [search, category, areaFilter, showReorderOnly, sortField, sortDir]);

const totalPages = Math.ceil(sortedItems.length / ITEMS_PER_PAGE);
const paginatedItems = sortedItems.slice(
  (currentPage - 1) * ITEMS_PER_PAGE,
  currentPage * ITEMS_PER_PAGE,
);
const showingStart = sortedItems.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
const showingEnd = Math.min(currentPage * ITEMS_PER_PAGE, sortedItems.length);
```

**Step 2: Replace sortedItems.map with paginatedItems.map**

In the `<tbody>`, change `sortedItems.map(...)` to `paginatedItems.map(...)`.

**Step 3: Update footer with pagination controls**

Replace the existing `<tfoot>` with:

```tsx
<tfoot>
  <tr className="bg-bg-page">
    <td colSpan={colSpanTotal} className="px-4 py-3 text-sm text-text-secondary">
      <div className="flex items-center justify-between">
        <span>
          Showing {showingStart}–{showingEnd} of {sortedItems.length} items
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 rounded text-xs border border-border hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {getPageNumbers(currentPage, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="px-1 text-text-muted">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p as number)}
                  className={`px-2 py-1 rounded text-xs border ${
                    p === currentPage
                      ? 'bg-accent-indigo text-white border-accent-indigo'
                      : 'border-border hover:bg-bg-hover'
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-1 rounded text-xs border border-border hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </td>
  </tr>
</tfoot>
```

**Step 4: Add getPageNumbers helper**

Before the `Inventory` component, add a helper to calculate which page numbers to show (max 5 with ellipsis):

```typescript
function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [];
  if (current <= 3) {
    pages.push(1, 2, 3, 4, '...', total);
  } else if (current >= total - 2) {
    pages.push(1, '...', total - 3, total - 2, total - 1, total);
  } else {
    pages.push(1, '...', current - 1, current, current + 1, '...', total);
  }
  return pages;
}
```

**Step 5: Compute colSpanTotal**

The colspan for the footer row is dynamic based on visible column groups. Add a computed value:

```typescript
const colSpanTotal = 7 + (showOrdering ? 5 : 1) + (showPricing ? 4 : 1);
```

Also use this for the existing expanded-area sub-row colspan and the group header row.

**Step 6: Verify app compiles**

Run: `cd packages/client && npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add packages/client/src/pages/Inventory.tsx
git commit -m "feat: add client-side pagination to inventory table"
```

---

### Task 6: Sticky Table Header

Make the thead stick to the top of the scrollable area with a solid background so rows don't show through.

**Files:**
- Modify: `packages/client/src/pages/Inventory.tsx`

**Step 1: Add sticky positioning to thead rows**

Update both thead `<tr>` elements:

Row 1 (group headers) — add `sticky top-0 z-20`:
```tsx
<tr className="bg-bg-page sticky top-0 z-20">
```

Row 2 (column headers) — add `sticky top-[29px] z-20` (offset by the height of row 1, which is ~29px with py-1.5 + text-[11px]):
```tsx
<tr className="bg-bg-table-header text-text-secondary text-left sticky top-[29px] z-20">
```

Add a subtle bottom border/shadow to the second header row for visual separation when scrolling:
```tsx
<tr className="bg-bg-table-header text-text-secondary text-left sticky top-[29px] z-20 shadow-[0_1px_0_0_var(--color-border)]">
```

**Step 2: Make the table container scrollable with a max height**

The table is inside `<div className="bg-bg-card rounded-xl shadow-sm overflow-x-auto">`. Add `max-h-[calc(100vh-16rem)] overflow-y-auto` so the sticky header has a scroll container:

```tsx
<div className="bg-bg-card rounded-xl shadow-sm overflow-x-auto max-h-[calc(100vh-16rem)] overflow-y-auto">
```

**Step 3: Verify app compiles and sticky header works**

Run: `cd packages/client && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/client/src/pages/Inventory.tsx
git commit -m "feat: add sticky table header to inventory"
```

---

### Task 7: Bulk Selection

Add a checkbox column on the left of each row with a "select all" checkbox in the header that toggles all items on the current page.

**Files:**
- Modify: `packages/client/src/pages/Inventory.tsx`

**Step 1: Add selection state**

In the `Inventory` component, add:

```typescript
const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

// Clear selection when page, filters, or sort changes
useEffect(() => {
  setSelectedIds(new Set());
}, [currentPage, search, category, areaFilter, showReorderOnly, sortField, sortDir]);
```

**Step 2: Add select-all toggle**

Compute whether all items on the current page are selected:

```typescript
const allOnPageSelected = paginatedItems.length > 0 && paginatedItems.every((item) => selectedIds.has(item.id));

const toggleSelectAll = () => {
  if (allOnPageSelected) {
    setSelectedIds(new Set());
  } else {
    setSelectedIds(new Set(paginatedItems.map((item) => item.id)));
  }
};

const toggleSelectOne = (id: number) => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};
```

**Step 3: Add checkbox column to group header row**

Add a `<th>` at the start of the group header row (Row 1) with empty content (just takes up space):

```tsx
<th className="w-10 px-3 py-1.5" />
```

Update the first `<th colSpan={7}>` to `colSpan={6}` since the checkbox column took one slot. Actually, better to add the checkbox `<th>` as its own column and not change colSpan — just add `+ 1` to colSpanTotal.

Wait — simpler approach: Add checkbox as a standalone column. Update `colSpanTotal`:
```typescript
const colSpanTotal = 1 + 7 + (showOrdering ? 5 : 1) + (showPricing ? 4 : 1);
```

**Step 4: Add checkbox to column header row**

At the start of Row 2 headers:

```tsx
<th className="px-3 py-2.5 w-10">
  <input
    type="checkbox"
    checked={allOnPageSelected}
    onChange={toggleSelectAll}
    className="rounded border-border text-accent-indigo focus:ring-accent-indigo/20 cursor-pointer"
  />
</th>
```

**Step 5: Add checkbox to each data row**

At the start of each `<tr>` in the `<tbody>` map, add:

```tsx
<td className="px-3 py-2 w-10">
  <input
    type="checkbox"
    checked={selectedIds.has(item.id)}
    onChange={() => toggleSelectOne(item.id)}
    className="rounded border-border text-accent-indigo focus:ring-accent-indigo/20 cursor-pointer"
  />
</td>
```

**Step 6: Update group header row colSpans**

The first `<th>` in the group header row needs to account for the checkbox column. Add the checkbox `<th>` before the existing group headers and adjust colSpan for "Stock" from 7 to 7 (checkbox is its own `<th>` before the Stock group).

Actually, the group header row structure should be:
```tsx
<tr className="bg-bg-page sticky top-0 z-20">
  <th className="w-10" /> {/* checkbox spacer */}
  <th colSpan={6} className="...">Stock</th>
  <th colSpan={showOrdering ? 5 : 1} className="...">Ordering</th>
  <th colSpan={showPricing ? 4 : 1} className="...">Pricing</th>
</tr>
```

Stock goes from colSpan=7 to colSpan=6 since checkbox takes one column.

**Step 7: Verify compilation**

Run: `cd packages/client && npx tsc --noEmit`
Expected: No errors

**Step 8: Commit**

```bash
git add packages/client/src/pages/Inventory.tsx
git commit -m "feat: add bulk selection checkboxes to inventory table"
```

---

### Task 8: Bulk Actions Toolbar

Add a toolbar at the bottom of the table card when items are selected. Shows count of selected items, a category reassign dropdown with Apply button, and a bulk delete button with confirmation dialog.

**Files:**
- Modify: `packages/client/src/pages/Inventory.tsx`

**Step 1: Add bulk action imports and mutations**

At the top of `Inventory.tsx`, import the new hooks and toast:

```typescript
import { useItems, useReorderSuggestions, useUpdateItem, useBulkUpdateItems, useBulkDeleteItems } from '../hooks/useItems';
import { useToast } from '../contexts/ToastContext';
```

Inside the component:

```typescript
const bulkUpdate = useBulkUpdateItems();
const bulkDelete = useBulkDeleteItems();
const { toast } = useToast();
const [bulkCategory, setBulkCategory] = useState('');
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
```

**Step 2: Add bulk actions toolbar**

After the `</table>` closing tag but still inside the table container `<div>`, add:

```tsx
{selectedIds.size > 0 && (
  <div className="border-t border-border bg-bg-page px-4 py-3 flex items-center gap-4 flex-wrap">
    <span className="text-sm font-medium text-text-primary">
      {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
    </span>

    {/* Category reassign */}
    <div className="flex items-center gap-2">
      <select
        value={bulkCategory}
        onChange={(e) => setBulkCategory(e.target.value)}
        className="bg-white border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
      >
        <option value="">Reassign category…</option>
        {CATEGORIES.map((cat) => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
      </select>
      <button
        onClick={() => {
          if (!bulkCategory) return;
          bulkUpdate.mutate(
            { ids: Array.from(selectedIds), updates: { category: bulkCategory } },
            {
              onSuccess: (data) => {
                toast(`Updated ${data.updated} item${data.updated !== 1 ? 's' : ''} to ${bulkCategory}`, 'success');
                setSelectedIds(new Set());
                setBulkCategory('');
              },
              onError: (err) => {
                toast(`Failed to update: ${err.message}`, 'error');
              },
            },
          );
        }}
        disabled={!bulkCategory || bulkUpdate.isPending}
        className="bg-accent-indigo text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Apply
      </button>
    </div>

    {/* Bulk delete */}
    <button
      onClick={() => setShowDeleteConfirm(true)}
      className="ml-auto bg-accent-red/10 text-accent-red border border-accent-red/30 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent-red/20 transition-colors"
    >
      Delete Selected
    </button>
  </div>
)}
```

**Step 3: Add delete confirmation dialog**

After the bulk actions toolbar (still inside the component return), add:

```tsx
{showDeleteConfirm && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
    <div className="bg-bg-card rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
      <h3 className="text-lg font-semibold text-text-primary mb-2">Confirm Delete</h3>
      <p className="text-sm text-text-secondary mb-4">
        Delete {selectedIds.size} selected item{selectedIds.size > 1 ? 's' : ''}? Items with transaction history will be skipped.
      </p>
      <div className="flex justify-end gap-3">
        <button
          onClick={() => setShowDeleteConfirm(false)}
          className="px-4 py-2 rounded-lg text-sm border border-border text-text-secondary hover:bg-bg-hover transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            bulkDelete.mutate(
              { ids: Array.from(selectedIds) },
              {
                onSuccess: (data) => {
                  let msg = `Deleted ${data.deleted} item${data.deleted !== 1 ? 's' : ''}`;
                  if (data.skipped > 0) {
                    msg += `, ${data.skipped} skipped (have transaction history)`;
                  }
                  toast(msg, data.skipped > 0 ? 'info' : 'success');
                  setSelectedIds(new Set());
                  setShowDeleteConfirm(false);
                },
                onError: (err) => {
                  toast(`Failed to delete: ${err.message}`, 'error');
                  setShowDeleteConfirm(false);
                },
              },
            );
          }}
          disabled={bulkDelete.isPending}
          className="bg-accent-red text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-red/90 disabled:opacity-40 transition-colors"
        >
          {bulkDelete.isPending ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
)}
```

**Step 4: Verify full app compilation**

Run: `npm run build -w packages/shared && cd packages/client && npx tsc --noEmit`
Expected: No errors

**Step 5: Run full build to verify everything**

Run: `npm run build`
Expected: Build succeeds for shared, server, and client

**Step 6: Run server tests**

Run: `npm test --workspace=packages/server`
Expected: All tests pass

**Step 7: Commit**

```bash
git add packages/client/src/pages/Inventory.tsx
git commit -m "feat: add bulk actions toolbar with category reassign and bulk delete"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Toast notification system | `ToastContext.tsx`, `App.tsx`, `index.css` |
| 2 | Server bulk endpoints | `types.ts`, `sqliteStore.ts`, `supabaseStore.ts`, `items.ts`, `schemas.ts` |
| 3 | Client API + hooks for bulk | `api.ts`, `useItems.ts` |
| 4 | Sortable columns | `Inventory.tsx` |
| 5 | Client-side pagination | `Inventory.tsx` |
| 6 | Sticky table header | `Inventory.tsx` |
| 7 | Bulk selection checkboxes | `Inventory.tsx` |
| 8 | Bulk actions toolbar | `Inventory.tsx` |

Tasks 1–3 are infrastructure and can be built independently. Tasks 4–6 modify Inventory.tsx sequentially. Task 7 depends on Task 5 (needs `paginatedItems`). Task 8 depends on Tasks 1, 3, and 7.
