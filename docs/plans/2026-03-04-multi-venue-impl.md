# Multi-Venue Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add venue support so items can be assigned to venues and the app can filter by selected venue.

**Architecture:** New `venues` table with CRUD. Add `venue_id` (nullable FK) to items only. Add venue filtering to items, dashboard, reports, reorder suggestions, and transactions endpoints. Add venue selector in sidebar and VenueContext for client state. Vendors, orders, storage areas stay global.

**Tech Stack:** TypeScript, Express, better-sqlite3, React, TanStack Query, Tailwind CSS

---

### Task 1: Add Venue Types, Schemas, and Database Table

Add Venue interface, Zod schemas, database table, and venue_id migration on items.

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/server/src/db.ts`

**Step 1: Add Venue type**

In `packages/shared/src/types.ts`, add after the `Vendor` interface (after line 147):

```typescript
export interface Venue {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}
```

Also add `venue_id` to the `Item` interface (after `vendor_id`):

```typescript
  venue_id: number | null;
```

**Step 2: Add venue schemas**

In `packages/shared/src/schemas.ts`, add after the storage area schemas:

```typescript
export const createVenueSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
});

export const updateVenueSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
});

export type CreateVenueInput = z.infer<typeof createVenueSchema>;
export type UpdateVenueInput = z.infer<typeof updateVenueSchema>;
```

Also add `venue_id` to `createItemSchema` and `updateItemSchema`:

```typescript
  venue_id: z.number().int().positive().nullable().optional(),
```

**Step 3: Add venues table and venue_id migration**

In `packages/server/src/db.ts`, add the venues table inside the `db.exec` block (before the vendors table):

```sql
    CREATE TABLE IF NOT EXISTS venues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
```

Add a trigger inside the same `db.exec` block (after the order timestamp trigger):

```sql
    CREATE TRIGGER IF NOT EXISTS update_venue_timestamp
    AFTER UPDATE ON venues
    BEGIN
      UPDATE venues SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
```

Add the venue_id migration on items after the vendor_id migration (after line 166):

```typescript
addColumnIfMissing('venue_id', 'INTEGER REFERENCES venues(id) ON DELETE SET NULL');
```

Add an index after the vendor_id index:

```typescript
db.exec('CREATE INDEX IF NOT EXISTS idx_items_venue_id ON items(venue_id)');
```

**Step 4: Build**

```bash
npm run build -w packages/shared && npm run build -w packages/server
```

**Step 5: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/schemas.ts packages/server/src/db.ts
git commit -m "feat: add venues table, Venue type, and venue_id on items"
```

---

### Task 2: Add Venue Store Methods

Add venue CRUD to the store interface and implement in SQLite store.

**Files:**
- Modify: `packages/server/src/store/types.ts`
- Modify: `packages/server/src/store/sqliteStore.ts`
- Modify: `packages/server/src/store/supabaseStore.ts`

**Step 1: Update store interface**

In `packages/server/src/store/types.ts`, add the imports for new types:

```typescript
import type {
  // ... existing imports ...
  Venue,
  CreateVenueInput,
  UpdateVenueInput,
} from '@fifoflow/shared';
```

Add `venueId` to `ItemListFilters`:

```typescript
export interface ItemListFilters {
  search?: string;
  category?: string;
  venueId?: number;
}
```

Add `venueId` to `TransactionListFilters`:

```typescript
export interface TransactionListFilters {
  item_id?: number;
  type?: string;
  limit?: number;
  offset?: number;
  venueId?: number;
}
```

Add `venueId` to `ReportFilters`:

```typescript
export interface ReportFilters {
  start: string;
  end: string;
  groupBy?: string;
  venueId?: number;
}
```

Add optional `venueId` parameter to `getDashboardStats`:

```typescript
  getDashboardStats(venueId?: number): Promise<DashboardStats>;
```

Add optional `venueId` parameter to `listItemsWithReorderLevel`:

```typescript
  listItemsWithReorderLevel(venueId?: number): Promise<Item[]>;
```

Add venue methods to the `InventoryStore` interface:

```typescript
  // Venues
  listVenues(): Promise<Venue[]>;
  getVenueById(id: number): Promise<Venue | undefined>;
  createVenue(input: CreateVenueInput): Promise<Venue>;
  updateVenue(id: number, input: UpdateVenueInput): Promise<Venue>;
  deleteVenue(id: number): Promise<void>;
  countItemsForVenue(venueId: number): Promise<number>;
```

**Step 2: Implement venue CRUD in SQLite store**

In `packages/server/src/store/sqliteStore.ts`, add the venue type imports and implement the venue methods (follow the same pattern as storage area methods):

```typescript
  // ── Venues ──────────────────────────────────────────────────

  async listVenues(): Promise<Venue[]> {
    return this.db.prepare('SELECT * FROM venues ORDER BY name ASC').all() as Venue[];
  }

  async getVenueById(id: number): Promise<Venue | undefined> {
    return this.db.prepare('SELECT * FROM venues WHERE id = ?').get(id) as Venue | undefined;
  }

  async createVenue(input: CreateVenueInput): Promise<Venue> {
    const result = this.db.prepare('INSERT INTO venues (name) VALUES (?)').run(input.name);
    return this.db.prepare('SELECT * FROM venues WHERE id = ?').get(result.lastInsertRowid) as Venue;
  }

  async updateVenue(id: number, input: UpdateVenueInput): Promise<Venue> {
    this.db.prepare('UPDATE venues SET name = ? WHERE id = ?').run(input.name, id);
    return this.db.prepare('SELECT * FROM venues WHERE id = ?').get(id) as Venue;
  }

  async deleteVenue(id: number): Promise<void> {
    this.db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  }

  async countItemsForVenue(venueId: number): Promise<number> {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM items WHERE venue_id = ?'
    ).get(venueId) as { count: number };
    return row.count;
  }
```

**Step 3: Add venue filtering to listItems**

In `sqliteStore.ts`, update `listItems` to support `venueId` filter:

```typescript
  async listItems(filters?: ItemListFilters): Promise<Item[]> {
    let sql = 'SELECT * FROM items WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.category) {
      sql += ' AND category = ?';
      params.push(filters.category);
    }
    if (filters?.search) {
      sql += ' AND name LIKE ?';
      params.push(`%${filters.search}%`);
    }
    if (filters?.venueId !== undefined) {
      sql += ' AND venue_id = ?';
      params.push(filters.venueId);
    }

    sql += ' ORDER BY name ASC';
    return this.db.prepare(sql).all(...params) as Item[];
  }
```

**Step 4: Add venue filtering to listItemsWithReorderLevel**

```typescript
  async listItemsWithReorderLevel(venueId?: number): Promise<Item[]> {
    let sql = 'SELECT * FROM items WHERE reorder_level IS NOT NULL';
    const params: unknown[] = [];
    if (venueId !== undefined) {
      sql += ' AND venue_id = ?';
      params.push(venueId);
    }
    return this.db.prepare(sql).all(...params) as Item[];
  }
```

**Step 5: Add venue filtering to getDashboardStats**

```typescript
  async getDashboardStats(venueId?: number): Promise<DashboardStats> {
    const venueFilter = venueId !== undefined ? ' AND venue_id = ?' : '';
    const venueParams = venueId !== undefined ? [venueId] : [];

    const totalItems = this.db.prepare(
      `SELECT COUNT(*) as count FROM items WHERE 1=1${venueFilter}`
    ).get(...venueParams) as { count: number };
    const lowStock = this.db.prepare(
      `SELECT COUNT(*) as count FROM items WHERE reorder_level IS NOT NULL AND current_qty > 0 AND current_qty <= reorder_level${venueFilter}`
    ).get(...venueParams) as { count: number };
    const outOfStock = this.db.prepare(
      `SELECT COUNT(*) as count FROM items WHERE current_qty = 0${venueFilter}`
    ).get(...venueParams) as { count: number };

    const todayTxSql = venueId !== undefined
      ? "SELECT COUNT(*) as count FROM transactions t JOIN items i ON t.item_id = i.id WHERE date(t.created_at) = date('now') AND i.venue_id = ?"
      : "SELECT COUNT(*) as count FROM transactions WHERE date(created_at) = date('now')";
    const todayTx = this.db.prepare(todayTxSql).get(...venueParams) as { count: number };

    const inventoryValue = this.db.prepare(`
      SELECT COALESCE(SUM(
        current_qty * order_unit_price / COALESCE(qty_per_unit, 1)
      ), 0) as value
      FROM items
      WHERE order_unit_price IS NOT NULL AND current_qty > 0${venueFilter}
    `).get(...venueParams) as { value: number };

    return {
      total_items: totalItems.count,
      low_stock_count: lowStock.count,
      out_of_stock_count: outOfStock.count,
      today_transaction_count: todayTx.count,
      total_inventory_value: Math.round(inventoryValue.value * 100) / 100,
    };
  }
```

**Step 6: Add venue filtering to listTransactions**

```typescript
  async listTransactions(filters?: TransactionListFilters): Promise<TransactionWithItem[]> {
    let sql = `
      SELECT t.*, i.name as item_name, i.unit as item_unit
      FROM transactions t
      JOIN items i ON t.item_id = i.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (filters?.item_id !== undefined) {
      sql += ' AND t.item_id = ?';
      params.push(filters.item_id);
    }
    if (filters?.type) {
      sql += ' AND t.type = ?';
      params.push(filters.type);
    }
    if (filters?.venueId !== undefined) {
      sql += ' AND i.venue_id = ?';
      params.push(filters.venueId);
    }

    sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(filters?.limit ?? 50, filters?.offset ?? 0);

    return this.db.prepare(sql).all(...params) as TransactionWithItem[];
  }
```

**Step 7: Add venue filtering to report methods**

Update all three report methods to support `venueId` in their filters. Add `AND i.venue_id = ?` to the WHERE clause when `filters.venueId` is defined. The pattern is the same for all three — append the filter and push the param.

For `getUsageReport`, change:

```typescript
  async getUsageReport(filters: ReportFilters): Promise<UsageReport> {
    const { start, end, groupBy, venueId } = filters;
    const venueFilter = venueId !== undefined ? ' AND i.venue_id = ?' : '';
    const venueParams = venueId !== undefined ? [venueId] : [];
```

Then in the SQL WHERE clause, append `${venueFilter}` and spread `...venueParams` into the `.all()` call: `.all(start, end, ...venueParams)`.

Apply the same pattern to `getWasteReport` and `getCostReport`.

**Step 8: Add stubs to Supabase store**

Add venue stubs to `supabaseStore.ts` (same pattern as vendor stubs). Update method signatures to match new interface (add optional `venueId` params to `getDashboardStats`, `listItemsWithReorderLevel`).

**Step 9: Build and test**

```bash
npm run build -w packages/shared && npm run build -w packages/server
npm test --workspace=packages/server
```

**Step 10: Commit**

```bash
git add packages/server/src/store/types.ts packages/server/src/store/sqliteStore.ts packages/server/src/store/supabaseStore.ts
git commit -m "feat: add venue store methods and venue filtering on items, dashboard, reports, transactions"
```

---

### Task 3: Add Venue API Routes and Wire Venue Filtering into Existing Routes

Create venue CRUD routes and add venue_id query param support to existing routes.

**Files:**
- Create: `packages/server/src/routes/venues.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `packages/server/src/routes/items.ts`
- Modify: `packages/server/src/routes/dashboard.ts`
- Modify: `packages/server/src/routes/transactions.ts`
- Modify: `packages/server/src/routes/reports.ts`

**Step 1: Create venues route**

Create `packages/server/src/routes/venues.ts` (follow storageAreas.ts pattern exactly):

```typescript
import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';
import { createVenueSchema, updateVenueSchema } from '@fifoflow/shared';

export function createVenueRoutes(store: InventoryStore): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const venues = await store.listVenues();
    res.json(venues);
  });

  router.get('/:id', async (req, res) => {
    const venue = await store.getVenueById(Number(req.params.id));
    if (!venue) {
      res.status(404).json({ error: 'Venue not found' });
      return;
    }
    res.json(venue);
  });

  router.post('/', async (req, res) => {
    const parsed = createVenueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const venue = await store.createVenue(parsed.data);
      res.status(201).json(venue);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'A venue with this name already exists' });
        return;
      }
      throw err;
    }
  });

  router.put('/:id', async (req, res) => {
    const venue = await store.getVenueById(Number(req.params.id));
    if (!venue) {
      res.status(404).json({ error: 'Venue not found' });
      return;
    }
    const parsed = updateVenueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const updated = await store.updateVenue(venue.id, parsed.data);
      res.json(updated);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'A venue with this name already exists' });
        return;
      }
      throw err;
    }
  });

  router.delete('/:id', async (req, res) => {
    const venue = await store.getVenueById(Number(req.params.id));
    if (!venue) {
      res.status(404).json({ error: 'Venue not found' });
      return;
    }
    const itemCount = await store.countItemsForVenue(venue.id);
    if (itemCount > 0) {
      res.status(409).json({ error: 'Cannot delete venue with items assigned. Reassign items first.' });
      return;
    }
    await store.deleteVenue(venue.id);
    res.status(204).send();
  });

  return router;
}
```

**Step 2: Register venue routes in index.ts**

Add import and `app.use('/api/venues', createVenueRoutes(store));`.

**Step 3: Add venue_id filter to items route**

In `packages/server/src/routes/items.ts`, update the `GET /` handler to pass `venue_id`:

```typescript
  router.get('/', async (req, res) => {
    const { search, category, venue_id } = req.query;
    const items = await store.listItems({
      search: typeof search === 'string' ? search : undefined,
      category: typeof category === 'string' ? category : undefined,
      venueId: typeof venue_id === 'string' ? Number(venue_id) : undefined,
    });
    res.json(items);
  });
```

Also update the reorder-suggestions handler to pass venue_id:

```typescript
  router.get('/reorder-suggestions', async (req, res) => {
    const venueId = typeof req.query.venue_id === 'string' ? Number(req.query.venue_id) : undefined;
    const items = await store.listItemsWithReorderLevel(venueId) as Item[];
    // ... rest unchanged
  });
```

**Step 4: Add venue_id to dashboard route**

```typescript
  router.get('/stats', async (req, res) => {
    const venueId = typeof req.query.venue_id === 'string' ? Number(req.query.venue_id) : undefined;
    const stats = await store.getDashboardStats(venueId);
    res.json(stats);
  });
```

**Step 5: Add venue_id to transactions route**

In `packages/server/src/routes/transactions.ts`, read `venue_id` from query and pass to store:

```typescript
  const venueId = typeof req.query.venue_id === 'string' ? Number(req.query.venue_id) : undefined;
```

Pass it in the filters object when calling `store.listTransactions`.

**Step 6: Add venue_id to reports routes**

In `packages/server/src/routes/reports.ts`, read `venue_id` from query in all three handlers and pass it in the filters object.

**Step 7: Build and test**

```bash
npm run build -w packages/server
npm test --workspace=packages/server
```

**Step 8: Commit**

```bash
git add packages/server/src/routes/venues.ts packages/server/src/index.ts packages/server/src/routes/items.ts packages/server/src/routes/dashboard.ts packages/server/src/routes/transactions.ts packages/server/src/routes/reports.ts
git commit -m "feat: add venue CRUD routes and venue filtering on items, dashboard, reports, transactions"
```

---

### Task 4: Add Client API, Hooks, and VenueContext

Add venue API methods, hooks, and React context for venue selection.

**Files:**
- Modify: `packages/client/src/api.ts`
- Create: `packages/client/src/hooks/useVenues.ts`
- Create: `packages/client/src/contexts/VenueContext.tsx`
- Modify: `packages/client/src/hooks/useItems.ts`
- Modify: `packages/client/src/hooks/useDashboard.ts`
- Modify: `packages/client/src/hooks/useTransactions.ts`
- Modify: `packages/client/src/hooks/useReports.ts`
- Modify: `packages/client/src/App.tsx`

**Step 1: Add venue API methods**

In `packages/client/src/api.ts`, add type imports for `Venue`, `CreateVenueInput`, `UpdateVenueInput`.

Add a `venues` section to the api object:

```typescript
  venues: {
    list: () => fetchJson<Venue[]>('/venues'),
    get: (id: number) => fetchJson<Venue>(`/venues/${id}`),
    create: (data: CreateVenueInput) =>
      fetchJson<Venue>('/venues', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: UpdateVenueInput) =>
      fetchJson<Venue>(`/venues/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      fetchJson<void>(`/venues/${id}`, { method: 'DELETE' }),
  },
```

Update `items.list` to accept optional `venue_id`:

```typescript
    list: (params?: { search?: string; category?: string; venue_id?: number }) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.category) qs.set('category', params.category);
      if (params?.venue_id) qs.set('venue_id', String(params.venue_id));
      const query = qs.toString();
      return fetchJson<Item[]>(`/items${query ? `?${query}` : ''}`);
    },
```

Update `items.reorderSuggestions` to accept optional `venue_id`:

```typescript
    reorderSuggestions: (venueId?: number) => {
      const qs = venueId ? `?venue_id=${venueId}` : '';
      return fetchJson<ReorderSuggestion[]>(`/items/reorder-suggestions${qs}`);
    },
```

Update `dashboard.stats` to accept optional `venue_id`:

```typescript
    stats: (venueId?: number) => {
      const qs = venueId ? `?venue_id=${venueId}` : '';
      return fetchJson<DashboardStats>(`/dashboard/stats${qs}`);
    },
```

Update `transactions.list` to accept optional `venue_id`:

```typescript
    list: (params?: { item_id?: number; type?: string; limit?: number; offset?: number; venue_id?: number }) => {
      const qs = new URLSearchParams();
      if (params?.item_id) qs.set('item_id', String(params.item_id));
      if (params?.type) qs.set('type', params.type);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.offset) qs.set('offset', String(params.offset));
      if (params?.venue_id) qs.set('venue_id', String(params.venue_id));
      const query = qs.toString();
      return fetchJson<TransactionWithItem[]>(`/transactions${query ? `?${query}` : ''}`);
    },
```

Update all three `reports` methods to accept optional `venue_id` and pass it in the URLSearchParams.

**Step 2: Create VenueContext**

Create `packages/client/src/contexts/VenueContext.tsx`:

```typescript
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface VenueContextType {
  selectedVenueId: number | null;
  setSelectedVenueId: (id: number | null) => void;
}

const VenueContext = createContext<VenueContextType>({
  selectedVenueId: null,
  setSelectedVenueId: () => {},
});

export function VenueProvider({ children }: { children: ReactNode }) {
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(() => {
    const stored = localStorage.getItem('fifoflow_venue_id');
    return stored ? Number(stored) : null;
  });

  useEffect(() => {
    if (selectedVenueId !== null) {
      localStorage.setItem('fifoflow_venue_id', String(selectedVenueId));
    } else {
      localStorage.removeItem('fifoflow_venue_id');
    }
  }, [selectedVenueId]);

  return (
    <VenueContext.Provider value={{ selectedVenueId, setSelectedVenueId }}>
      {children}
    </VenueContext.Provider>
  );
}

export function useVenueContext() {
  return useContext(VenueContext);
}
```

**Step 3: Create venue hooks**

Create `packages/client/src/hooks/useVenues.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateVenueInput, UpdateVenueInput } from '@fifoflow/shared';

export function useVenues() {
  return useQuery({
    queryKey: ['venues'],
    queryFn: () => api.venues.list(),
  });
}

export function useCreateVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateVenueInput) => api.venues.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['venues'] }); },
  });
}

export function useUpdateVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateVenueInput }) => api.venues.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['venues'] }); },
  });
}

export function useDeleteVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.venues.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['venues'] }); },
  });
}
```

**Step 4: Update hooks to use venue context**

Update `useItems` in `packages/client/src/hooks/useItems.ts`:

```typescript
export function useItems(params?: { search?: string; category?: string; venue_id?: number }) {
  return useQuery({
    queryKey: ['items', params],
    queryFn: () => api.items.list(params),
  });
}
```

Update `useReorderSuggestions`:

```typescript
export function useReorderSuggestions(venueId?: number) {
  return useQuery({
    queryKey: ['items', 'reorder-suggestions', venueId],
    queryFn: () => api.items.reorderSuggestions(venueId),
  });
}
```

Update `useDashboardStats` in `packages/client/src/hooks/useDashboard.ts`:

```typescript
export function useDashboardStats(venueId?: number) {
  return useQuery({
    queryKey: ['dashboard', 'stats', venueId],
    queryFn: () => api.dashboard.stats(venueId),
    refetchInterval: 30000,
  });
}
```

Update `useTransactions` in `packages/client/src/hooks/useTransactions.ts`:

```typescript
export function useTransactions(params?: { item_id?: number; type?: string; limit?: number; venue_id?: number }) {
  return useQuery({
    queryKey: ['transactions', params],
    queryFn: () => api.transactions.list(params),
  });
}
```

Update all three report hooks in `packages/client/src/hooks/useReports.ts` to accept optional `venueId` and pass it to the API.

**Step 5: Wrap App with VenueProvider**

In `packages/client/src/App.tsx`, import `VenueProvider` and wrap the app:

```tsx
<QueryClientProvider client={queryClient}>
  <ToastProvider>
    <VenueProvider>
      <BrowserRouter>
        ...
      </BrowserRouter>
    </VenueProvider>
  </ToastProvider>
</QueryClientProvider>
```

**Step 6: Build**

```bash
npm run build
```

**Step 7: Commit**

```bash
git add packages/client/src/api.ts packages/client/src/contexts/VenueContext.tsx packages/client/src/hooks/useVenues.ts packages/client/src/hooks/useItems.ts packages/client/src/hooks/useDashboard.ts packages/client/src/hooks/useTransactions.ts packages/client/src/hooks/useReports.ts packages/client/src/App.tsx
git commit -m "feat: add client venue API, hooks, VenueContext, and venue filtering on all data hooks"
```

---

### Task 5: Add Venue Selector to Sidebar and Manage Venues Modal

Add the venue dropdown in the sidebar and the manage venues modal.

**Files:**
- Modify: `packages/client/src/components/Layout.tsx`
- Create: `packages/client/src/components/ManageVenuesModal.tsx`

**Step 1: Create ManageVenuesModal**

Create `packages/client/src/components/ManageVenuesModal.tsx` following the ManageAreasModal pattern exactly. Read ManageAreasModal.tsx for the pattern. It should:

- List all venues with inline name editing
- Add new venue form at the bottom
- Delete button with protection (can't delete if items assigned)
- Use `useVenues`, `useCreateVenue`, `useUpdateVenue`, `useDeleteVenue` hooks

**Step 2: Add venue selector to Layout**

In `packages/client/src/components/Layout.tsx`:

- Import `useVenueContext` from `../contexts/VenueContext`
- Import `useVenues` from `../hooks/useVenues`
- Import `ManageVenuesModal`
- Import `Building2, Settings` from `lucide-react`

Add a venue selector dropdown in the sidebar, between the wordmark section and the nav section. It should:

- Show a `<select>` with "All Venues" as default, then list all venues
- On change, call `setSelectedVenueId`
- Include a small gear/settings button to open ManageVenuesModal
- Use the same dark theme styling as the rest of the sidebar

```tsx
{/* Venue selector */}
<div className="px-4 mb-4">
  <div className="flex items-center gap-1">
    <select
      value={selectedVenueId ?? ''}
      onChange={(e) => setSelectedVenueId(e.target.value ? Number(e.target.value) : null)}
      className="flex-1 bg-sidebar-active text-white text-sm rounded-lg px-2 py-1.5 border border-card-border"
    >
      <option value="">All Venues</option>
      {venues?.map((v) => (
        <option key={v.id} value={v.id}>{v.name}</option>
      ))}
    </select>
    <button
      onClick={() => setManageVenuesOpen(true)}
      className="text-text-muted hover:text-white p-1"
    >
      <Settings size={14} />
    </button>
  </div>
</div>
```

Also add the mobile venue selector in the mobile sidebar.

**Step 3: Build**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add packages/client/src/components/Layout.tsx packages/client/src/components/ManageVenuesModal.tsx
git commit -m "feat: add venue selector in sidebar and manage venues modal"
```

---

### Task 6: Wire Venue Context into Pages

Update all pages to read from VenueContext and pass venue_id to their hooks.

**Files:**
- Modify: `packages/client/src/pages/Dashboard.tsx`
- Modify: `packages/client/src/pages/Inventory.tsx`
- Modify: `packages/client/src/pages/Activity.tsx`
- Modify: `packages/client/src/pages/Reports.tsx`

**Step 1: Update Dashboard**

In `packages/client/src/pages/Dashboard.tsx`:

- Import `useVenueContext`
- Get `selectedVenueId` from context
- Pass to `useDashboardStats(selectedVenueId ?? undefined)`
- Pass to `useTransactions({ limit: 10, venue_id: selectedVenueId ?? undefined })`
- Pass to `useReorderSuggestions(selectedVenueId ?? undefined)`

**Step 2: Update Inventory**

In `packages/client/src/pages/Inventory.tsx`:

- Import `useVenueContext`
- Get `selectedVenueId` from context
- Pass `venue_id: selectedVenueId ?? undefined` to `useItems`
- Add a venue dropdown column in the items table (same pattern as vendor dropdown)

Read the Inventory.tsx file to find where the vendor dropdown column is rendered and follow the same pattern for venue.

**Step 3: Update Activity**

In `packages/client/src/pages/Activity.tsx`:

- Import `useVenueContext`
- Get `selectedVenueId` from context
- Pass `venue_id: selectedVenueId ?? undefined` to `useTransactions`

**Step 4: Update Reports**

In `packages/client/src/pages/Reports.tsx`:

- Import `useVenueContext`
- Get `selectedVenueId` from context
- Pass `selectedVenueId ?? undefined` to all three report hooks

**Step 5: Build and test**

```bash
npm run build
npm test --workspace=packages/server
```

**Step 6: Commit**

```bash
git add packages/client/src/pages/Dashboard.tsx packages/client/src/pages/Inventory.tsx packages/client/src/pages/Activity.tsx packages/client/src/pages/Reports.tsx
git commit -m "feat: wire venue context into Dashboard, Inventory, Activity, and Reports pages"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Venue type, schemas, database table + migration | `types.ts`, `schemas.ts`, `db.ts` |
| 2 | Venue store methods + venue filtering on all queries | `store/types.ts`, `sqliteStore.ts`, `supabaseStore.ts` |
| 3 | Venue CRUD routes + venue_id on existing routes | `routes/venues.ts`, `items.ts`, `dashboard.ts`, `transactions.ts`, `reports.ts` |
| 4 | Client API, hooks, VenueContext | `api.ts`, `VenueContext.tsx`, `useVenues.ts`, all data hooks |
| 5 | Sidebar venue selector + ManageVenuesModal | `Layout.tsx`, `ManageVenuesModal.tsx` |
| 6 | Wire venue context into all pages | `Dashboard.tsx`, `Inventory.tsx`, `Activity.tsx`, `Reports.tsx` |

Tasks 1-3 are backend (sequential). Tasks 4-5 are client infrastructure. Task 6 wires everything together.
