# Storage Areas Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add user-defined storage areas with per-area quantity tracking, area-aware transactions, and transfer support.

**Architecture:** New `storage_areas` and `item_storage` tables track where stock lives. Transactions reference source/destination areas. `items.current_qty` is recalculated as SUM of `item_storage.quantity` after each transaction. Migration creates a "General" default area and seeds `item_storage` from existing `current_qty` values.

**Tech Stack:** SQLite ALTER TABLE + new tables, Zod schemas, Express routes, React (modal, filter dropdown, expandable rows)

---

### Task 1: Database schema, migration, and shared types/schemas

**Files:**
- Modify: `packages/server/src/db.ts`
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Add tables to db.ts**

Inside the main `db.exec(...)` block in `initializeDb`, add these CREATE TABLE statements after the existing tables:

```sql
CREATE TABLE IF NOT EXISTS storage_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS item_storage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id),
  area_id INTEGER NOT NULL REFERENCES storage_areas(id),
  quantity REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(item_id, area_id)
);
```

Add indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_item_storage_item_id ON item_storage(item_id);
CREATE INDEX IF NOT EXISTS idx_item_storage_area_id ON item_storage(area_id);
```

Add an update trigger for storage_areas:

```sql
CREATE TRIGGER IF NOT EXISTS update_storage_area_timestamp
AFTER UPDATE ON storage_areas
BEGIN
  UPDATE storage_areas SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

**Step 2: Add migration for transactions columns**

After the existing migrations in `initializeDb`, add:

```typescript
// Migrations — add area references to transactions
const txColumns = db.pragma('table_info(transactions)') as Array<{ name: string }>;
const txColumnNames = txColumns.map((c) => c.name);

if (!txColumnNames.includes('from_area_id')) {
  db.exec(`
    ALTER TABLE transactions ADD COLUMN from_area_id INTEGER REFERENCES storage_areas(id);
    ALTER TABLE transactions ADD COLUMN to_area_id INTEGER REFERENCES storage_areas(id);
  `);
}
```

**Step 3: Add data migration**

After the column migrations, add:

```typescript
// Seed default "General" storage area and populate item_storage
const generalArea = db.prepare(
  "SELECT id FROM storage_areas WHERE name = 'General'"
).get() as { id: number } | undefined;

if (!generalArea) {
  const result = db.prepare(
    "INSERT INTO storage_areas (name) VALUES ('General')"
  ).run();
  const generalId = result.lastInsertRowid;

  // Move all existing item quantities into item_storage
  db.prepare(`
    INSERT INTO item_storage (item_id, area_id, quantity)
    SELECT id, ?, current_qty FROM items WHERE current_qty > 0
  `).run(generalId);
}
```

**Step 4: Add shared types**

Add to `packages/shared/src/types.ts`:

```typescript
export interface StorageArea {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ItemStorage {
  item_id: number;
  area_id: number;
  area_name: string;
  quantity: number;
}
```

**Step 5: Add shared schemas**

Add to `packages/shared/src/schemas.ts`:

```typescript
export const createStorageAreaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

export const updateStorageAreaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});
```

Add `from_area_id` and `to_area_id` to `createTransactionSchema`:

```typescript
from_area_id: z.number().int().positive().nullable().optional(),
to_area_id: z.number().int().positive().nullable().optional(),
```

Export the new inferred types:

```typescript
export type CreateStorageAreaInput = z.infer<typeof createStorageAreaSchema>;
export type UpdateStorageAreaInput = z.infer<typeof updateStorageAreaSchema>;
```

**Step 6: Run tests**

```bash
npm test --workspace=packages/server
```

All existing tests should pass (new tables and columns are additive).

**Step 7: Commit**

```bash
git add packages/server/src/db.ts packages/shared/src/types.ts packages/shared/src/schemas.ts
git commit -m "feat: add storage_areas and item_storage schema with migration"
```

---

### Task 2: Store layer for storage area CRUD and item_storage queries

**Files:**
- Modify: `packages/server/src/store/types.ts` — add methods to InventoryStore interface
- Modify: `packages/server/src/store/sqliteStore.ts` — implement methods

**Step 1: Add to InventoryStore interface in types.ts**

```typescript
// Storage Areas
listStorageAreas(): Promise<StorageArea[]>;
getStorageAreaById(id: number): Promise<StorageArea | undefined>;
createStorageArea(input: CreateStorageAreaInput): Promise<StorageArea>;
updateStorageArea(id: number, input: UpdateStorageAreaInput): Promise<StorageArea>;
deleteStorageArea(id: number): Promise<void>;
countItemsInArea(areaId: number): Promise<number>;

// Item Storage
listItemStorage(itemId: number): Promise<ItemStorage[]>;
getItemStorageByArea(itemId: number, areaId: number): Promise<ItemStorage | undefined>;
```

Import the new types from `@fifoflow/shared`.

**Step 2: Implement in SqliteInventoryStore**

```typescript
async listStorageAreas(): Promise<StorageArea[]> {
  return this.db.prepare('SELECT * FROM storage_areas ORDER BY name ASC').all() as StorageArea[];
}

async getStorageAreaById(id: number): Promise<StorageArea | undefined> {
  return this.db.prepare('SELECT * FROM storage_areas WHERE id = ?').get(id) as StorageArea | undefined;
}

async createStorageArea(input: CreateStorageAreaInput): Promise<StorageArea> {
  const result = this.db.prepare('INSERT INTO storage_areas (name) VALUES (?)').run(input.name);
  return this.db.prepare('SELECT * FROM storage_areas WHERE id = ?').get(result.lastInsertRowid) as StorageArea;
}

async updateStorageArea(id: number, input: UpdateStorageAreaInput): Promise<StorageArea> {
  this.db.prepare('UPDATE storage_areas SET name = ? WHERE id = ?').run(input.name, id);
  return this.db.prepare('SELECT * FROM storage_areas WHERE id = ?').get(id) as StorageArea;
}

async deleteStorageArea(id: number): Promise<void> {
  this.db.prepare('DELETE FROM storage_areas WHERE id = ?').run(id);
}

async countItemsInArea(areaId: number): Promise<number> {
  const row = this.db.prepare(
    'SELECT COUNT(*) as count FROM item_storage WHERE area_id = ? AND quantity > 0'
  ).get(areaId) as { count: number };
  return row.count;
}

async listItemStorage(itemId: number): Promise<ItemStorage[]> {
  return this.db.prepare(`
    SELECT is2.item_id, is2.area_id, sa.name as area_name, is2.quantity
    FROM item_storage is2
    JOIN storage_areas sa ON sa.id = is2.area_id
    WHERE is2.item_id = ?
    ORDER BY sa.name ASC
  `).all(itemId) as ItemStorage[];
}

async getItemStorageByArea(itemId: number, areaId: number): Promise<ItemStorage | undefined> {
  return this.db.prepare(`
    SELECT is2.item_id, is2.area_id, sa.name as area_name, is2.quantity
    FROM item_storage is2
    JOIN storage_areas sa ON sa.id = is2.area_id
    WHERE is2.item_id = ? AND is2.area_id = ?
  `).get(itemId, areaId) as ItemStorage | undefined;
}
```

**Step 3: Run tests**

```bash
npm test --workspace=packages/server
```

**Step 4: Commit**

```bash
git add packages/server/src/store/types.ts packages/server/src/store/sqliteStore.ts
git commit -m "feat: add storage area CRUD and item_storage store methods"
```

---

### Task 3: Storage area API routes and tests

**Files:**
- Create: `packages/server/src/routes/storageAreas.ts`
- Modify: `packages/server/src/index.ts` — mount new routes
- Create: `packages/server/src/__tests__/storageAreas.test.ts`

**Step 1: Create route file**

```typescript
import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';
import { createStorageAreaSchema, updateStorageAreaSchema } from '@fifoflow/shared';

export function createStorageAreaRoutes(store: InventoryStore): Router {
  const router = Router();

  // GET /api/storage-areas
  router.get('/', async (_req, res) => {
    const areas = await store.listStorageAreas();
    res.json(areas);
  });

  // GET /api/storage-areas/:id
  router.get('/:id', async (req, res) => {
    const area = await store.getStorageAreaById(Number(req.params.id));
    if (!area) { res.status(404).json({ error: 'Storage area not found' }); return; }
    res.json(area);
  });

  // POST /api/storage-areas
  router.post('/', async (req, res) => {
    const parsed = createStorageAreaSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    try {
      const area = await store.createStorageArea(parsed.data);
      res.status(201).json(area);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'A storage area with this name already exists' });
        return;
      }
      throw err;
    }
  });

  // PUT /api/storage-areas/:id
  router.put('/:id', async (req, res) => {
    const area = await store.getStorageAreaById(Number(req.params.id));
    if (!area) { res.status(404).json({ error: 'Storage area not found' }); return; }
    const parsed = updateStorageAreaSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    try {
      const updated = await store.updateStorageArea(area.id, parsed.data);
      res.json(updated);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'A storage area with this name already exists' });
        return;
      }
      throw err;
    }
  });

  // DELETE /api/storage-areas/:id
  router.delete('/:id', async (req, res) => {
    const area = await store.getStorageAreaById(Number(req.params.id));
    if (!area) { res.status(404).json({ error: 'Storage area not found' }); return; }
    const itemCount = await store.countItemsInArea(area.id);
    if (itemCount > 0) {
      res.status(409).json({ error: 'Cannot delete area with stock in it. Move all items first.' });
      return;
    }
    await store.deleteStorageArea(area.id);
    res.status(204).send();
  });

  return router;
}
```

**Step 2: Mount in index.ts**

Add to `packages/server/src/index.ts`:

```typescript
import { createStorageAreaRoutes } from './routes/storageAreas.js';
// ...
app.use('/api/storage-areas', createStorageAreaRoutes(store));
```

**Step 3: Write tests**

Create `packages/server/src/__tests__/storageAreas.test.ts`. Follow the existing test pattern: in-memory SQLite, createTestApp factory, supertest. Tests should cover:

- POST /api/storage-areas — creates an area, returns 201
- POST /api/storage-areas — duplicate name returns 409
- POST /api/storage-areas — empty name returns 400
- GET /api/storage-areas — lists all areas (includes "General" from migration)
- GET /api/storage-areas/:id — returns area, 404 for missing
- PUT /api/storage-areas/:id — renames area
- DELETE /api/storage-areas/:id — deletes empty area, returns 204
- DELETE /api/storage-areas/:id — area with stock returns 409

**Step 4: Run tests**

```bash
npm test --workspace=packages/server
```

**Step 5: Commit**

```bash
git add packages/server/src/routes/storageAreas.ts packages/server/src/index.ts packages/server/src/__tests__/storageAreas.test.ts
git commit -m "feat: add storage area CRUD API routes with tests"
```

---

### Task 4: Area-aware transaction handling

**Files:**
- Modify: `packages/server/src/store/types.ts` — update InsertTransactionAndAdjustQtyInput
- Modify: `packages/server/src/store/sqliteStore.ts` — update insertTransactionAndAdjustQty
- Modify: `packages/server/src/routes/transactions.ts` — pass area IDs through
- Modify: `packages/server/src/__tests__/transactions.test.ts` — add area-aware tests

**Step 1: Update InsertTransactionAndAdjustQtyInput**

Add optional area fields:

```typescript
export interface InsertTransactionAndAdjustQtyInput {
  itemId: number;
  type: TransactionType;
  quantity: number;
  reason: TransactionReason;
  notes: string | null;
  delta: number;
  fromAreaId?: number | null;
  toAreaId?: number | null;
}
```

**Step 2: Update insertTransactionAndAdjustQty in sqliteStore.ts**

The new logic:

```typescript
async insertTransactionAndAdjustQty(input: InsertTransactionAndAdjustQtyInput) {
  const execute = this.db.transaction(() => {
    // Insert transaction with area references
    const result = this.db.prepare(
      'INSERT INTO transactions (item_id, type, quantity, reason, notes, from_area_id, to_area_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(input.itemId, input.type, input.quantity, input.reason, input.notes, input.fromAreaId ?? null, input.toAreaId ?? null);

    // Update item_storage quantities
    if (input.fromAreaId) {
      // Decrement source area (OUT or Transfer source)
      this.db.prepare(
        'UPDATE item_storage SET quantity = quantity - ? WHERE item_id = ? AND area_id = ?'
      ).run(input.quantity, input.itemId, input.fromAreaId);
    }

    if (input.toAreaId) {
      // Increment destination area (IN or Transfer destination)
      // Upsert: insert if not exists, update if exists
      this.db.prepare(`
        INSERT INTO item_storage (item_id, area_id, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT(item_id, area_id) DO UPDATE SET quantity = quantity + excluded.quantity
      `).run(input.itemId, input.toAreaId, input.quantity);
    }

    // Recalculate current_qty from item_storage
    const sumRow = this.db.prepare(
      'SELECT COALESCE(SUM(quantity), 0) as total FROM item_storage WHERE item_id = ?'
    ).get(input.itemId) as { total: number };
    this.db.prepare('UPDATE items SET current_qty = ? WHERE id = ?')
      .run(sumRow.total, input.itemId);

    // Fetch updated records
    const transaction = this.db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
    const item = this.db.prepare('SELECT * FROM items WHERE id = ?').get(input.itemId);
    return { transaction, item };
  });

  return execute();
}
```

**Step 3: Update createTransactionHandler in transactions.ts**

After the existing validation and conversion logic, extract `from_area_id` and `to_area_id` from the parsed body:

```typescript
const { type, quantity, unit, reason, notes, from_area_id, to_area_id } = parsed.data;
```

Add area validation before the store call:

```typescript
// Validate area references
if (reason === 'Transferred') {
  if (!from_area_id || !to_area_id) {
    res.status(400).json({ error: 'Transfers require both from_area_id and to_area_id' });
    return;
  }
  if (from_area_id === to_area_id) {
    res.status(400).json({ error: 'Cannot transfer to the same area' });
    return;
  }
}

// For non-transfer IN transactions, require to_area_id
if (type === 'in' && reason !== 'Transferred' && !to_area_id) {
  // Default to first available area or "General"
  // (or require it — see validation note below)
}

// Check source area has sufficient quantity
if (from_area_id) {
  const areaStock = await store.getItemStorageByArea(item.id, from_area_id);
  const areaQty = areaStock?.quantity ?? 0;
  if (areaQty < normalizedQty) {
    res.status(400).json({ error: 'Insufficient quantity in source area' });
    return;
  }
}
```

Pass area IDs to the store call:

```typescript
const result = await store.insertTransactionAndAdjustQty({
  itemId, type, quantity: normalizedQty, reason, notes: notes ?? null, delta,
  fromAreaId: from_area_id ?? null,
  toAreaId: to_area_id ?? null,
});
```

**Step 4: Update listItems to optionally include area breakdown**

Add a new store method `listItemsWithStorage` or modify `listItems` to optionally join with `item_storage`. The simpler approach: add an `area_id` filter to `listItems` and return area-specific quantity:

Add to store interface:

```typescript
listItemStorage(itemId: number): Promise<ItemStorage[]>;
listAllItemStorage(): Promise<ItemStorage[]>;
```

Implement `listAllItemStorage`:

```typescript
async listAllItemStorage(): Promise<ItemStorage[]> {
  return this.db.prepare(`
    SELECT is2.item_id, is2.area_id, sa.name as area_name, is2.quantity
    FROM item_storage is2
    JOIN storage_areas sa ON sa.id = is2.area_id
    ORDER BY is2.item_id, sa.name
  `).all() as ItemStorage[];
}
```

Add a new GET endpoint or query param to items route for fetching item storage alongside items.

**Step 5: Write tests**

Add to `packages/server/src/__tests__/transactions.test.ts`:

- Test IN transaction with to_area_id — creates/updates item_storage, recalculates current_qty
- Test OUT transaction with from_area_id — decrements area quantity
- Test Transfer — decrements source, increments destination, current_qty unchanged
- Test OUT exceeding area quantity — returns 400
- Test Transfer with same from/to area — returns 400

**Step 6: Run tests**

```bash
npm test --workspace=packages/server
```

**Step 7: Commit**

```bash
git add packages/server/src/store/types.ts packages/server/src/store/sqliteStore.ts packages/server/src/routes/transactions.ts packages/server/src/__tests__/transactions.test.ts
git commit -m "feat: area-aware transaction handling with per-area stock tracking"
```

---

### Task 5: Client API layer and hooks for storage areas

**Files:**
- Modify: `packages/client/src/api.ts` — add storageAreas namespace
- Create: `packages/client/src/hooks/useStorageAreas.ts`
- Modify: `packages/client/src/hooks/useTransactions.ts` — update createTransaction to include area IDs

**Step 1: Add to api.ts**

```typescript
storageAreas: {
  list: () => fetchJson<StorageArea[]>('/storage-areas'),
  get: (id: number) => fetchJson<StorageArea>(`/storage-areas/${id}`),
  create: (data: CreateStorageAreaInput) =>
    fetchJson<StorageArea>('/storage-areas', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: UpdateStorageAreaInput) =>
    fetchJson<StorageArea>(`/storage-areas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    fetchJson<void>(`/storage-areas/${id}`, { method: 'DELETE' }),
},
```

Add to items namespace:

```typescript
listStorage: (itemId: number) =>
  fetchJson<ItemStorage[]>(`/items/${itemId}/storage`),
listAllStorage: () =>
  fetchJson<ItemStorage[]>(`/items/storage`),
```

Import the new types from `@fifoflow/shared`.

**Step 2: Create hooks file**

```typescript
// packages/client/src/hooks/useStorageAreas.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateStorageAreaInput, UpdateStorageAreaInput } from '@fifoflow/shared';

export function useStorageAreas() {
  return useQuery({
    queryKey: ['storageAreas'],
    queryFn: () => api.storageAreas.list(),
  });
}

export function useCreateStorageArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateStorageAreaInput) => api.storageAreas.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['storageAreas'] }); },
  });
}

export function useUpdateStorageArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateStorageAreaInput }) =>
      api.storageAreas.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['storageAreas'] }); },
  });
}

export function useDeleteStorageArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.storageAreas.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['storageAreas'] }); },
  });
}

export function useAllItemStorage() {
  return useQuery({
    queryKey: ['itemStorage'],
    queryFn: () => api.items.listAllStorage(),
  });
}

export function useItemStorage(itemId: number) {
  return useQuery({
    queryKey: ['itemStorage', itemId],
    queryFn: () => api.items.listStorage(itemId),
  });
}
```

**Step 3: Update useTransactions.ts**

The `useCreateTransaction` mutation should invalidate `['itemStorage']` too:

```typescript
onSuccess: () => {
  qc.invalidateQueries({ queryKey: ['items'] });
  qc.invalidateQueries({ queryKey: ['transactions'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  qc.invalidateQueries({ queryKey: ['itemStorage'] });
},
```

**Step 4: Verify build**

```bash
cd /Users/curtisvaughan/FifoFlow/packages/client && npx vite build
```

**Step 5: Commit**

```bash
git add packages/client/src/api.ts packages/client/src/hooks/useStorageAreas.ts packages/client/src/hooks/useTransactions.ts
git commit -m "feat: add client API and hooks for storage areas"
```

---

### Task 6: Area management modal

**Files:**
- Create: `packages/client/src/components/ManageAreasModal.tsx`
- Modify: `packages/client/src/pages/Inventory.tsx` — add "Manage Areas" button

**Step 1: Create ManageAreasModal component**

A modal with:
- List of all storage areas with edit/delete buttons
- Inline rename (click name to edit, blur to save)
- Delete button (disabled or hidden for areas with stock, with tooltip)
- "Add Area" input at the bottom
- Uses `useStorageAreas`, `useCreateStorageArea`, `useUpdateStorageArea`, `useDeleteStorageArea` hooks

Style with existing Tailwind classes: bg-navy-light, border-border, text-text-primary, etc. Follow the existing AddItemModal pattern for the modal overlay.

**Step 2: Add button to Inventory page**

Next to the "+ Add Item" button, add a "Manage Areas" button that opens the modal:

```tsx
<button
  onClick={() => setShowAreasModal(true)}
  className="border border-border text-text-secondary px-4 py-2 rounded text-sm font-medium hover:text-text-primary transition-colors"
>
  Manage Areas
</button>
```

Add state: `const [showAreasModal, setShowAreasModal] = useState(false);`

Render: `{showAreasModal && <ManageAreasModal onClose={() => setShowAreasModal(false)} />}`

**Step 3: Verify build**

```bash
cd /Users/curtisvaughan/FifoFlow/packages/client && npx vite build
```

**Step 4: Commit**

```bash
git add packages/client/src/components/ManageAreasModal.tsx packages/client/src/pages/Inventory.tsx
git commit -m "feat: add manage storage areas modal"
```

---

### Task 7: Inventory page area filter and expandable rows

**Files:**
- Modify: `packages/client/src/pages/Inventory.tsx`

**Step 1: Add area filter dropdown**

Next to the Category filter, add a Storage Area dropdown:

```tsx
const { data: areas } = useStorageAreas();
const [areaFilter, setAreaFilter] = useState('');
```

```tsx
<select
  value={areaFilter}
  onChange={(e) => setAreaFilter(e.target.value)}
  className="bg-navy-light border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
>
  <option value="">All Areas</option>
  {areas?.map((area) => (
    <option key={area.id} value={String(area.id)}>{area.name}</option>
  ))}
</select>
```

**Step 2: Fetch and use item_storage data**

```tsx
const { data: allItemStorage } = useAllItemStorage();

// Build a lookup: Map<itemId, ItemStorage[]>
const storageByItem = useMemo(() => {
  const map = new Map<number, ItemStorage[]>();
  if (allItemStorage) {
    for (const is of allItemStorage) {
      const arr = map.get(is.item_id) ?? [];
      arr.push(is);
      map.set(is.item_id, arr);
    }
  }
  return map;
}, [allItemStorage]);
```

When `areaFilter` is set, show the area-specific quantity in the Stock Qty column instead of the total. When "All Areas" is selected, show the total as today.

**Step 3: Add expandable rows**

Track expanded state:

```tsx
const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

const toggleExpand = (itemId: number) => {
  setExpandedItems((prev) => {
    const next = new Set(prev);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    return next;
  });
};
```

Add a chevron toggle in the first column (before the name link). When expanded, render a sub-row beneath the item row showing the per-area breakdown:

```tsx
{expandedItems.has(item.id) && (
  <tr className="bg-navy-lighter/30">
    <td colSpan={/* total columns */} className="px-3 py-2 pl-10">
      <div className="flex flex-wrap gap-4 text-xs text-text-secondary">
        {(storageByItem.get(item.id) ?? []).map((is) => (
          <span key={is.area_id}>
            {is.area_name}: <span className="text-text-primary font-medium">{is.quantity}</span>
          </span>
        ))}
      </div>
    </td>
  </tr>
)}
```

**Step 4: Verify build**

```bash
cd /Users/curtisvaughan/FifoFlow/packages/client && npx vite build
```

**Step 5: Commit**

```bash
git add packages/client/src/pages/Inventory.tsx
git commit -m "feat: add storage area filter and expandable per-area rows to inventory"
```

---

### Task 8: Item Detail page stock-by-area and area-aware TransactionForm

**Files:**
- Modify: `packages/client/src/pages/ItemDetail.tsx`
- Modify: `packages/client/src/components/TransactionForm.tsx`

**Step 1: Add "Stock by Area" section to ItemDetail**

Below the item header card and before the TransactionForm, add a section:

```tsx
const { data: itemStorage } = useItemStorage(item.id);
```

```tsx
{/* Stock by Area */}
<div className="bg-navy-light border border-border rounded-lg p-4">
  <h2 className="text-sm font-medium text-text-secondary mb-3">Stock by Area</h2>
  {itemStorage && itemStorage.length > 0 ? (
    <div className="space-y-2">
      {itemStorage.map((is) => (
        <div key={is.area_id} className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">{is.area_name}</span>
          <span className="text-text-primary font-medium">{is.quantity} {item.unit}</span>
        </div>
      ))}
    </div>
  ) : (
    <div className="text-text-secondary text-sm">No stock in any area.</div>
  )}
</div>
```

Import `useItemStorage` from the new hooks file.

**Step 2: Update TransactionForm to include area selector**

The TransactionForm currently takes `item` as a prop. It needs to also accept `storageAreas` (or fetch them internally) and include area selection.

Add state:

```tsx
const { data: areas } = useStorageAreas();
const { data: itemStorage } = useItemStorage(item.id);
const [fromAreaId, setFromAreaId] = useState<number | null>(null);
const [toAreaId, setToAreaId] = useState<number | null>(null);
```

Add UI for area selection (between the type toggle and quantity input):

- For IN transactions (type === 'in'): show "To Area" dropdown
- For OUT transactions (type === 'out' and reason !== 'Transferred'): show "From Area" dropdown
- For Transfers (reason === 'Transferred'): show both "From Area" and "To Area" dropdowns

```tsx
{/* Area Selection */}
{areas && areas.length > 0 && (
  <div className="flex gap-3">
    {(type === 'out' || reason === 'Transferred') && (
      <select
        value={fromAreaId ?? ''}
        onChange={(e) => setFromAreaId(e.target.value ? Number(e.target.value) : null)}
        className="bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green flex-1"
      >
        <option value="">From Area...</option>
        {(itemStorage ?? []).filter(is => is.quantity > 0).map((is) => (
          <option key={is.area_id} value={is.area_id}>
            {is.area_name} ({is.quantity} {item.unit})
          </option>
        ))}
      </select>
    )}
    {(type === 'in' || reason === 'Transferred') && (
      <select
        value={toAreaId ?? ''}
        onChange={(e) => setToAreaId(e.target.value ? Number(e.target.value) : null)}
        className="bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green flex-1"
      >
        <option value="">To Area...</option>
        {areas.map((area) => (
          <option key={area.id} value={area.id}>{area.name}</option>
        ))}
      </select>
    )}
  </div>
)}
```

Update the submit handler to include area IDs:

```typescript
createTx.mutate({
  itemId: item.id,
  data: {
    type,
    quantity: Number(quantity),
    unit,
    reason,
    notes: notes || null,
    from_area_id: fromAreaId,
    to_area_id: toAreaId,
  },
}, { onSuccess: () => { /* reset state */ } });
```

Also auto-select the area if the item only has stock in one area (for OUT transactions).

**Step 3: Reset area state when type/reason changes**

```tsx
useEffect(() => {
  setFromAreaId(null);
  setToAreaId(null);
}, [type, reason]);
```

Auto-select if item only has one area:

```tsx
useEffect(() => {
  if (itemStorage && itemStorage.length === 1) {
    if (type === 'out') setFromAreaId(itemStorage[0].area_id);
    if (type === 'in') setToAreaId(itemStorage[0].area_id);
  }
}, [type, itemStorage]);
```

**Step 4: Verify build**

```bash
cd /Users/curtisvaughan/FifoFlow/packages/client && npx vite build
```

**Step 5: Commit**

```bash
git add packages/client/src/pages/ItemDetail.tsx packages/client/src/components/TransactionForm.tsx
git commit -m "feat: add stock-by-area display and area-aware transaction form"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | DB schema + migration + shared types/schemas | db.ts, types.ts, schemas.ts |
| 2 | Store layer for area CRUD + item_storage | store/types.ts, sqliteStore.ts |
| 3 | Storage area API routes + tests | routes/storageAreas.ts, index.ts, tests |
| 4 | Area-aware transaction handling + tests | store, transactions.ts, tests |
| 5 | Client API + hooks | api.ts, useStorageAreas.ts, useTransactions.ts |
| 6 | Area management modal | ManageAreasModal.tsx, Inventory.tsx |
| 7 | Inventory area filter + expandable rows | Inventory.tsx |
| 8 | Item Detail stock-by-area + TransactionForm | ItemDetail.tsx, TransactionForm.tsx |
