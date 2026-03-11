# Snack Bar Sales Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add sales tracking for an employee Snack Bar with a dedicated page featuring quick-sell, sales log, and analytics with Recharts.

**Architecture:** Separate `sales` table stores sale records. Each sale also creates an "out" transaction from the Snack Bar storage area to decrement inventory. A new `sale_price` column on `items` stores the default sell price. New top-level `/snack-bar` page with three tabs.

**Tech Stack:** Express, better-sqlite3, Zod, React 19, TanStack Query, Recharts, Tailwind CSS v4

---

### Task 1: Install Recharts

**Files:**
- Modify: `packages/client/package.json`

**Step 1: Install recharts**

Run: `npm install recharts --workspace=packages/client`

**Step 2: Verify installation**

Run: `npm ls recharts --workspace=packages/client`
Expected: `recharts@2.x.x` listed

**Step 3: Commit**

```bash
git add packages/client/package.json package-lock.json
git commit -m "chore: add recharts dependency for snack bar analytics"
```

---

### Task 2: Shared Types & Schemas

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/schemas.ts`

**Step 1: Add types to `packages/shared/src/types.ts`**

Add at the end of the file, before any closing exports:

```typescript
// Snack Bar Sales
export interface Sale {
  id: number;
  item_id: number;
  quantity: number;
  sale_price: number;
  total: number;
  created_at: string;
}

export interface SaleWithItem extends Sale {
  item_name: string;
  item_unit: string;
}

export interface SalesSummary {
  total_revenue: number;
  total_items_sold: number;
  sale_count: number;
  daily: Array<{ date: string; revenue: number; items_sold: number; sale_count: number }>;
  top_sellers: Array<{ item_id: number; item_name: string; quantity_sold: number; revenue: number }>;
  profit_margins: Array<{ item_id: number; item_name: string; sale_price: number; cost_price: number | null; margin: number | null }>;
}

export interface SalesFilters {
  start_date?: string;
  end_date?: string;
  item_id?: number;
}
```

**Step 2: Add schemas to `packages/shared/src/schemas.ts`**

Add at the end of the file:

```typescript
// Snack Bar Sales
export const createSaleSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().positive('Quantity must be positive'),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
```

Note: `sale_price` and `total` are computed server-side from the item's `sale_price` field — the client only sends `item_id` and `quantity`.

**Step 3: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/schemas.ts
git commit -m "feat: add snack bar sale types and schemas"
```

---

### Task 3: Database Migration

**Files:**
- Modify: `packages/server/src/db.ts`

**Step 1: Add `sale_price` column to items table**

In `db.ts`, find the section with `addColumnIfMissing` calls (around line 260-277). Add:

```typescript
addColumnIfMissing('sale_price', 'REAL');
```

**Step 2: Add `sales` table**

In `db.ts`, find the `CREATE TABLE IF NOT EXISTS` section (before the column migrations, around line 247). Add:

```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id),
    quantity REAL NOT NULL CHECK(quantity > 0),
    sale_price REAL NOT NULL,
    total REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sales_item_id ON sales(item_id);
  CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
`);
```

**Step 3: Build server to verify**

Run: `npm run build --workspace=packages/shared && npm run build --workspace=packages/server`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/server/src/db.ts
git commit -m "feat: add sales table and sale_price column migration"
```

---

### Task 4: Store Interface & SQLite Implementation

**Files:**
- Modify: `packages/server/src/store/types.ts`
- Modify: `packages/server/src/store/sqliteStore.ts`
- Modify: `packages/server/src/store/supabaseStore.ts`

**Step 1: Add to store interface in `packages/server/src/store/types.ts`**

Find the `InventoryStore` interface and add these methods (near the Reports section):

```typescript
// Snack Bar Sales
createSale(input: { itemId: number; quantity: number; fromAreaId: number }): Promise<SaleWithItem>;
listSales(filters?: SalesFilters): Promise<SaleWithItem[]>;
getSalesSummary(filters?: { start_date?: string; end_date?: string }): Promise<SalesSummary>;
```

Add the import at the top: `Sale`, `SaleWithItem`, `SalesSummary`, `SalesFilters` from `@fifoflow/shared`.

**Step 2: Implement in `packages/server/src/store/sqliteStore.ts`**

Add these methods to the `SqliteInventoryStore` class:

```typescript
async createSale(input: { itemId: number; quantity: number; fromAreaId: number }): Promise<SaleWithItem> {
  const item = this.db.prepare('SELECT * FROM items WHERE id = ?').get(input.itemId) as Item | undefined;
  if (!item) throw new Error('Item not found');
  if (!item.sale_price) throw new Error('Item has no sale price set');

  const total = input.quantity * item.sale_price;

  const execute = this.db.transaction(() => {
    // 1. Insert sale record
    const result = this.db.prepare(
      'INSERT INTO sales (item_id, quantity, sale_price, total) VALUES (?, ?, ?, ?)'
    ).run(input.itemId, input.quantity, item.sale_price, total);

    // 2. Decrement inventory from snack bar area
    this.db.prepare(
      'UPDATE item_storage SET quantity = quantity - ? WHERE item_id = ? AND area_id = ?'
    ).run(input.quantity, input.itemId, input.fromAreaId);

    // 3. Recalculate current_qty
    const sumRow = this.db.prepare(
      'SELECT COALESCE(SUM(quantity), 0) as total FROM item_storage WHERE item_id = ?'
    ).get(input.itemId) as { total: number };
    this.db.prepare('UPDATE items SET current_qty = ? WHERE id = ?').run(sumRow.total, input.itemId);

    // 4. Create companion transaction for audit trail
    this.db.prepare(
      'INSERT INTO transactions (item_id, type, quantity, reason, notes, from_area_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(input.itemId, 'out', input.quantity, 'Used', 'Snack bar sale', input.fromAreaId);

    const sale = this.db.prepare(`
      SELECT s.*, i.name as item_name, i.unit as item_unit
      FROM sales s JOIN items i ON s.item_id = i.id
      WHERE s.id = ?
    `).get(result.lastInsertRowid) as SaleWithItem;

    return sale;
  });

  return execute();
}

async listSales(filters?: SalesFilters): Promise<SaleWithItem[]> {
  let sql = `
    SELECT s.*, i.name as item_name, i.unit as item_unit
    FROM sales s JOIN items i ON s.item_id = i.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters?.start_date) {
    sql += ' AND s.created_at >= ?';
    params.push(filters.start_date);
  }
  if (filters?.end_date) {
    sql += ' AND s.created_at <= ?';
    params.push(filters.end_date + ' 23:59:59');
  }
  if (filters?.item_id) {
    sql += ' AND s.item_id = ?';
    params.push(filters.item_id);
  }

  sql += ' ORDER BY s.created_at DESC';

  return this.db.prepare(sql).all(...params) as SaleWithItem[];
}

async getSalesSummary(filters?: { start_date?: string; end_date?: string }): Promise<SalesSummary> {
  let whereClause = '1=1';
  const params: any[] = [];

  if (filters?.start_date) {
    whereClause += ' AND s.created_at >= ?';
    params.push(filters.start_date);
  }
  if (filters?.end_date) {
    whereClause += ' AND s.created_at <= ?';
    params.push(filters.end_date + ' 23:59:59');
  }

  // Totals
  const totals = this.db.prepare(`
    SELECT COALESCE(SUM(total), 0) as total_revenue,
           COALESCE(SUM(quantity), 0) as total_items_sold,
           COUNT(*) as sale_count
    FROM sales s WHERE ${whereClause}
  `).get(...params) as { total_revenue: number; total_items_sold: number; sale_count: number };

  // Daily breakdown
  const daily = this.db.prepare(`
    SELECT date(s.created_at) as date,
           SUM(s.total) as revenue,
           SUM(s.quantity) as items_sold,
           COUNT(*) as sale_count
    FROM sales s WHERE ${whereClause}
    GROUP BY date(s.created_at)
    ORDER BY date
  `).all(...params) as SalesSummary['daily'];

  // Top sellers
  const top_sellers = this.db.prepare(`
    SELECT s.item_id, i.name as item_name,
           SUM(s.quantity) as quantity_sold,
           SUM(s.total) as revenue
    FROM sales s JOIN items i ON s.item_id = i.id
    WHERE ${whereClause}
    GROUP BY s.item_id
    ORDER BY revenue DESC
    LIMIT 10
  `).all(...params) as SalesSummary['top_sellers'];

  // Profit margins
  const profit_margins = this.db.prepare(`
    SELECT i.id as item_id, i.name as item_name,
           i.sale_price,
           vp.unit_price as cost_price,
           CASE WHEN vp.unit_price IS NOT NULL AND i.sale_price > 0
             THEN ROUND((i.sale_price - vp.unit_price) / i.sale_price * 100, 1)
             ELSE NULL
           END as margin
    FROM items i
    LEFT JOIN vendor_prices vp ON vp.item_id = i.id AND vp.is_preferred = 1
    WHERE i.sale_price IS NOT NULL AND i.sale_price > 0
    ORDER BY i.name
  `).all() as SalesSummary['profit_margins'];

  return { ...totals, daily, top_sellers, profit_margins };
}
```

**Step 3: Add stubs in `packages/server/src/store/supabaseStore.ts`**

Add to the class:

```typescript
async createSale(_input: { itemId: number; quantity: number; fromAreaId: number }): Promise<SaleWithItem> {
  this.notImplemented('createSale');
}

async listSales(_filters?: SalesFilters): Promise<SaleWithItem[]> {
  this.notImplemented('listSales');
}

async getSalesSummary(_filters?: { start_date?: string; end_date?: string }): Promise<SalesSummary> {
  this.notImplemented('getSalesSummary');
}
```

**Step 4: Build to verify**

Run: `npm run build --workspace=packages/shared && npm run build --workspace=packages/server`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add packages/server/src/store/types.ts packages/server/src/store/sqliteStore.ts packages/server/src/store/supabaseStore.ts
git commit -m "feat: add snack bar sales store methods"
```

---

### Task 5: API Routes

**Files:**
- Create: `packages/server/src/routes/sales.ts`
- Modify: `packages/server/src/index.ts`

**Step 1: Create sales route file `packages/server/src/routes/sales.ts`**

```typescript
import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';
import { createSaleSchema } from '@fifoflow/shared';

export function createSalesRoutes(store: InventoryStore): Router {
  const router = Router();

  // GET /api/sales
  router.get('/', async (req, res) => {
    const { start_date, end_date, item_id } = req.query;
    const sales = await store.listSales({
      start_date: typeof start_date === 'string' ? start_date : undefined,
      end_date: typeof end_date === 'string' ? end_date : undefined,
      item_id: item_id ? Number(item_id) : undefined,
    });
    res.json(sales);
  });

  // GET /api/sales/summary
  router.get('/summary', async (req, res) => {
    const { start_date, end_date } = req.query;
    const summary = await store.getSalesSummary({
      start_date: typeof start_date === 'string' ? start_date : undefined,
      end_date: typeof end_date === 'string' ? end_date : undefined,
    });
    res.json(summary);
  });

  // POST /api/sales
  router.post('/', async (req, res) => {
    const parsed = createSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    // Find the Snack Bar storage area
    const areas = await store.listStorageAreas();
    const snackBarArea = areas.find(a => a.name === 'Snack Bar');
    if (!snackBarArea) {
      res.status(400).json({ error: 'Snack Bar storage area not found. Create it first.' });
      return;
    }

    // Check stock in snack bar area
    const itemStorage = await store.listItemStorage(parsed.data.item_id);
    const areaStock = itemStorage.find(is => is.area_id === snackBarArea.id);
    if (!areaStock || areaStock.quantity < parsed.data.quantity) {
      res.status(400).json({
        error: `Insufficient stock in Snack Bar. Available: ${areaStock?.quantity ?? 0}`,
      });
      return;
    }

    try {
      const sale = await store.createSale({
        itemId: parsed.data.item_id,
        quantity: parsed.data.quantity,
        fromAreaId: snackBarArea.id,
      });
      res.status(201).json(sale);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
```

**Step 2: Register route in `packages/server/src/index.ts`**

Add import at top with other route imports:

```typescript
import { createSalesRoutes } from './routes/sales.js';
```

Add route registration after the other `app.use` lines (around line 47):

```typescript
app.use('/api/sales', createSalesRoutes(store));
```

**Step 3: Build to verify**

Run: `npm run build --workspace=packages/shared && npm run build --workspace=packages/server`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/server/src/routes/sales.ts packages/server/src/index.ts
git commit -m "feat: add snack bar sales API routes"
```

---

### Task 6: Client API & Hooks

**Files:**
- Modify: `packages/client/src/api.ts`
- Create: `packages/client/src/hooks/useSales.ts`

**Step 1: Add API methods to `packages/client/src/api.ts`**

Add imports at the top for the new types: `Sale`, `SaleWithItem`, `SalesSummary`, `CreateSaleInput` from `@fifoflow/shared`.

Add to the `api` object (after the last namespace, before the closing `}`):

```typescript
sales: {
  list: (params?: { start_date?: string; end_date?: string; item_id?: number }) => {
    const qs = new URLSearchParams();
    if (params?.start_date) qs.set('start_date', params.start_date);
    if (params?.end_date) qs.set('end_date', params.end_date);
    if (params?.item_id) qs.set('item_id', String(params.item_id));
    const query = qs.toString();
    return fetchJson<SaleWithItem[]>(`/sales${query ? `?${query}` : ''}`);
  },
  create: (data: CreateSaleInput) =>
    fetchJson<SaleWithItem>('/sales', { method: 'POST', body: JSON.stringify(data) }),
  summary: (params?: { start_date?: string; end_date?: string }) => {
    const qs = new URLSearchParams();
    if (params?.start_date) qs.set('start_date', params.start_date);
    if (params?.end_date) qs.set('end_date', params.end_date);
    const query = qs.toString();
    return fetchJson<SalesSummary>(`/sales/summary${query ? `?${query}` : ''}`);
  },
},
```

**Step 2: Create hooks file `packages/client/src/hooks/useSales.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateSaleInput } from '@fifoflow/shared';

export function useSales(params?: { start_date?: string; end_date?: string; item_id?: number }) {
  return useQuery({
    queryKey: ['sales', params],
    queryFn: () => api.sales.list(params),
  });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSaleInput) => api.sales.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['salesSummary'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['allItemStorage'] });
    },
  });
}

export function useSalesSummary(params?: { start_date?: string; end_date?: string }) {
  return useQuery({
    queryKey: ['salesSummary', params],
    queryFn: () => api.sales.summary(params),
  });
}
```

**Step 3: Build to verify**

Run: `npm run build --workspace=packages/shared && npm run build --workspace=packages/client`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/client/src/api.ts packages/client/src/hooks/useSales.ts
git commit -m "feat: add snack bar sales API client and hooks"
```

---

### Task 7: Snack Bar Page — Inventory & Quick Sell Tab

**Files:**
- Create: `packages/client/src/pages/SnackBar.tsx`
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/components/Layout.tsx`

**Step 1: Create the page `packages/client/src/pages/SnackBar.tsx`**

```tsx
import { useState } from 'react';
import { ShoppingBag, List, BarChart3, Minus, Plus, DollarSign } from 'lucide-react';
import { useAllItemStorage } from '../hooks/useStorageAreas';
import { useItems, useUpdateItem } from '../hooks/useItems';
import { useStorageAreas } from '../hooks/useStorageAreas';
import { useCreateSale, useSales, useSalesSummary } from '../hooks/useSales';
import type { Item, SaleWithItem } from '@fifoflow/shared';

type SnackBarTab = 'sell' | 'log' | 'analytics';

export default function SnackBar() {
  const [activeTab, setActiveTab] = useState<SnackBarTab>('sell');

  const tabs: { key: SnackBarTab; label: string; icon: typeof ShoppingBag }[] = [
    { key: 'sell', label: 'Quick Sell', icon: ShoppingBag },
    { key: 'log', label: 'Sales Log', icon: List },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Snack Bar</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg-card rounded-lg p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-accent-indigo text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'sell' && <QuickSellTab />}
      {activeTab === 'log' && <SalesLogTab />}
      {activeTab === 'analytics' && <AnalyticsTab />}
    </div>
  );
}

function QuickSellTab() {
  const { data: allStorage } = useAllItemStorage();
  const { data: items } = useItems();
  const { data: areas } = useStorageAreas();
  const createSale = useCreateSale();
  const updateItem = useUpdateItem();
  const [sellModal, setSellModal] = useState<{ item: Item; maxQty: number } | null>(null);
  const [sellQty, setSellQty] = useState(1);
  const [editingPrice, setEditingPrice] = useState<number | null>(null);
  const [priceValue, setPriceValue] = useState('');

  const snackBarArea = areas?.find(a => a.name === 'Snack Bar');
  if (!snackBarArea) {
    return (
      <div className="bg-bg-card rounded-xl border border-border-primary p-8 text-center">
        <p className="text-text-secondary mb-2">No "Snack Bar" storage area found.</p>
        <p className="text-text-muted text-sm">Create a storage area named "Snack Bar" and transfer items to it.</p>
      </div>
    );
  }

  // Items with stock in Snack Bar area
  const snackBarItems = (allStorage ?? [])
    .filter(s => s.area_id === snackBarArea.id && s.quantity > 0)
    .map(s => {
      const item = items?.find(i => i.id === s.item_id);
      return item ? { item, qty: s.quantity } : null;
    })
    .filter(Boolean) as Array<{ item: Item; qty: number }>;

  const handleSell = () => {
    if (!sellModal) return;
    createSale.mutate(
      { item_id: sellModal.item.id, quantity: sellQty },
      {
        onSuccess: () => {
          setSellModal(null);
          setSellQty(1);
        },
      }
    );
  };

  const handleSavePrice = (itemId: number) => {
    const price = parseFloat(priceValue);
    if (!isNaN(price) && price >= 0) {
      updateItem.mutate({ id: itemId, data: { sale_price: price } });
    }
    setEditingPrice(null);
  };

  return (
    <>
      {snackBarItems.length === 0 ? (
        <div className="bg-bg-card rounded-xl border border-border-primary p-8 text-center">
          <p className="text-text-secondary">No items in Snack Bar storage area.</p>
          <p className="text-text-muted text-sm mt-1">Transfer items to the "Snack Bar" area to start selling.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {snackBarItems.map(({ item, qty }) => (
            <div key={item.id} className="bg-bg-card rounded-xl border border-border-primary p-4 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-text-primary">{item.name}</h3>
                  <p className="text-sm text-text-muted">{item.category}</p>
                </div>
                <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                  qty <= 2 ? 'bg-red-500/20 text-red-400' : 'bg-accent-green/20 text-accent-green'
                }`}>
                  {qty} {item.unit}
                </span>
              </div>

              <div className="flex items-center justify-between">
                {editingPrice === item.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-text-muted">$</span>
                    <input
                      type="number"
                      value={priceValue}
                      onChange={e => setPriceValue(e.target.value)}
                      onBlur={() => handleSavePrice(item.id)}
                      onKeyDown={e => e.key === 'Enter' && handleSavePrice(item.id)}
                      className="w-20 bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm text-text-primary"
                      autoFocus
                      step="0.01"
                      min="0"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingPrice(item.id);
                      setPriceValue(String(item.sale_price ?? ''));
                    }}
                    className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
                    title="Click to edit price"
                  >
                    <DollarSign size={14} />
                    {item.sale_price ? `$${item.sale_price.toFixed(2)}` : 'Set price'}
                  </button>
                )}

                <button
                  onClick={() => {
                    setSellModal({ item, maxQty: qty });
                    setSellQty(1);
                  }}
                  disabled={!item.sale_price}
                  className="px-4 py-1.5 bg-accent-green text-white rounded-lg text-sm font-medium hover:bg-accent-green/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Sell
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sell Modal */}
      {sellModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSellModal(null)}>
          <div className="bg-bg-card rounded-xl border border-border-primary p-6 w-80 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-text-primary">Sell {sellModal.item.name}</h3>
            <p className="text-sm text-text-muted">
              Price: ${sellModal.item.sale_price?.toFixed(2)} per {sellModal.item.unit}
            </p>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setSellQty(Math.max(1, sellQty - 1))}
                className="p-2 rounded-lg bg-bg-primary border border-border-primary text-text-primary hover:bg-bg-hover"
              >
                <Minus size={16} />
              </button>
              <span className="text-2xl font-bold text-text-primary w-12 text-center">{sellQty}</span>
              <button
                onClick={() => setSellQty(Math.min(sellModal.maxQty, sellQty + 1))}
                className="p-2 rounded-lg bg-bg-primary border border-border-primary text-text-primary hover:bg-bg-hover"
              >
                <Plus size={16} />
              </button>
            </div>

            <p className="text-center text-text-secondary">
              Total: <span className="font-bold text-accent-green">${((sellModal.item.sale_price ?? 0) * sellQty).toFixed(2)}</span>
            </p>
            <p className="text-center text-xs text-text-muted">
              Available: {sellModal.maxQty} {sellModal.item.unit}
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setSellModal(null)}
                className="flex-1 px-4 py-2 bg-bg-primary border border-border-primary rounded-lg text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleSell}
                disabled={createSale.isPending}
                className="flex-1 px-4 py-2 bg-accent-green text-white rounded-lg font-medium hover:bg-accent-green/80 disabled:opacity-50"
              >
                {createSale.isPending ? 'Selling...' : 'Confirm'}
              </button>
            </div>

            {createSale.isError && (
              <p className="text-sm text-red-400 text-center">{createSale.error.message}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SalesLogTab() {
  // Placeholder — implemented in Task 8
  return <div className="text-text-muted">Sales log coming soon...</div>;
}

function AnalyticsTab() {
  // Placeholder — implemented in Task 9
  return <div className="text-text-muted">Analytics coming soon...</div>;
}
```

**Step 2: Add route in `packages/client/src/App.tsx`**

Add import at top:

```typescript
import SnackBar from './pages/SnackBar';
```

Add route inside `<Routes>` alongside other routes:

```tsx
<Route path="/snack-bar" element={<SnackBar />} />
```

**Step 3: Add nav item in `packages/client/src/components/Layout.tsx`**

Add `Coffee` to the lucide-react import (line 1-16).

Add to the `navItems` array (around line 28, after Reports):

```typescript
{ to: '/snack-bar', label: 'Snack Bar', icon: Coffee },
```

**Step 4: Add `sale_price` to Item type in `packages/shared/src/types.ts`**

Add `sale_price: number | null;` to the `Item` interface (after `storage_area_id`).

**Step 5: Add `sale_price` to update schema in `packages/shared/src/schemas.ts`**

Add to `updateItemSchema`:

```typescript
sale_price: z.number().min(0).nullable().optional(),
```

**Step 6: Build and verify**

Run: `npm run build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add packages/client/src/pages/SnackBar.tsx packages/client/src/App.tsx packages/client/src/components/Layout.tsx packages/shared/src/types.ts packages/shared/src/schemas.ts
git commit -m "feat: add snack bar page with quick sell tab"
```

---

### Task 8: Sales Log Tab

**Files:**
- Modify: `packages/client/src/pages/SnackBar.tsx`

**Step 1: Replace the `SalesLogTab` placeholder**

```tsx
function SalesLogTab() {
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const getDateRange = () => {
    const now = new Date();
    switch (dateRange) {
      case 'today':
        return { start_date: now.toISOString().split('T')[0] };
      case 'week': {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return { start_date: weekAgo.toISOString().split('T')[0] };
      }
      case 'month': {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return { start_date: monthAgo.toISOString().split('T')[0] };
      }
      case 'custom':
        return {
          start_date: customStart || undefined,
          end_date: customEnd || undefined,
        };
    }
  };

  const filters = getDateRange();
  const { data: sales, isLoading } = useSales(filters);

  const totalRevenue = sales?.reduce((sum, s) => sum + s.total, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-2">
        {(['today', 'week', 'month', 'custom'] as const).map(range => (
          <button
            key={range}
            onClick={() => setDateRange(range)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              dateRange === range
                ? 'bg-accent-indigo text-white'
                : 'bg-bg-card text-text-secondary hover:text-text-primary border border-border-primary'
            }`}
          >
            {range === 'today' ? 'Today' : range === 'week' ? 'This Week' : range === 'month' ? 'This Month' : 'Custom'}
          </button>
        ))}
        {dateRange === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm text-text-primary"
            />
            <span className="text-text-muted">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm text-text-primary"
            />
          </div>
        )}
      </div>

      {/* Summary bar */}
      <div className="bg-bg-card rounded-xl border border-border-primary p-4 flex items-center justify-between">
        <span className="text-text-secondary text-sm">{sales?.length ?? 0} sales</span>
        <span className="text-accent-green font-bold">${totalRevenue.toFixed(2)} revenue</span>
      </div>

      {/* Sales table */}
      {isLoading ? (
        <p className="text-text-muted text-center py-8">Loading...</p>
      ) : !sales?.length ? (
        <p className="text-text-muted text-center py-8">No sales found for this period.</p>
      ) : (
        <div className="bg-bg-card rounded-xl border border-border-primary overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-primary">
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Date/Time</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Item</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Qty</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Price</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(sale => (
                <tr key={sale.id} className="border-b border-border-primary last:border-0 hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {new Date(sale.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary font-medium">{sale.item_name}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary text-right">
                    {sale.quantity} {sale.item_unit}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary text-right">${sale.sale_price.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-accent-green font-medium text-right">${sale.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

Add `useState` import if not already present (it should be from Task 7).

**Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/client/src/pages/SnackBar.tsx
git commit -m "feat: add sales log tab with date filtering"
```

---

### Task 9: Analytics Tab

**Files:**
- Modify: `packages/client/src/pages/SnackBar.tsx`

**Step 1: Add Recharts imports at the top of `SnackBar.tsx`**

```typescript
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
```

**Step 2: Replace the `AnalyticsTab` placeholder**

```tsx
function AnalyticsTab() {
  const [period, setPeriod] = useState<'week' | 'month' | '3months'>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const getDateRange = () => {
    const now = new Date();
    switch (period) {
      case 'week': {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        return { start_date: d.toISOString().split('T')[0] };
      }
      case 'month': {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 1);
        return { start_date: d.toISOString().split('T')[0] };
      }
      case '3months': {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 3);
        return { start_date: d.toISOString().split('T')[0] };
      }
    }
  };

  const filters = getDateRange();
  const { data: summary, isLoading } = useSalesSummary(filters);

  if (isLoading) return <p className="text-text-muted text-center py-8">Loading analytics...</p>;
  if (!summary) return <p className="text-text-muted text-center py-8">No data available.</p>;

  const chartColors = {
    green: '#34D399',
    indigo: '#818CF8',
    amber: '#E8A838',
    red: '#F87171',
  };

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex gap-2">
        {([['week', 'Last 7 Days'], ['month', 'Last 30 Days'], ['3months', 'Last 3 Months']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === key
                ? 'bg-accent-indigo text-white'
                : 'bg-bg-card text-text-secondary hover:text-text-primary border border-border-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-bg-card rounded-xl border border-border-primary p-4">
          <p className="text-text-muted text-sm">Total Revenue</p>
          <p className="text-2xl font-bold text-accent-green">${summary.total_revenue.toFixed(2)}</p>
        </div>
        <div className="bg-bg-card rounded-xl border border-border-primary p-4">
          <p className="text-text-muted text-sm">Items Sold</p>
          <p className="text-2xl font-bold text-text-primary">{summary.total_items_sold}</p>
        </div>
        <div className="bg-bg-card rounded-xl border border-border-primary p-4">
          <p className="text-text-muted text-sm">Total Sales</p>
          <p className="text-2xl font-bold text-text-primary">{summary.sale_count}</p>
        </div>
      </div>

      {/* Revenue over time */}
      {summary.daily.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-border-primary p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-4">Revenue Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={summary.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2F38" />
              <XAxis
                dataKey="date"
                stroke="#6B7280"
                fontSize={12}
                tickFormatter={(d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              />
              <YAxis stroke="#6B7280" fontSize={12} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1A1F2B', border: '1px solid #2A2F38', borderRadius: '8px' }}
                labelStyle={{ color: '#9CA3AF' }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']}
              />
              <Line type="monotone" dataKey="revenue" stroke={chartColors.green} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top sellers */}
      {summary.top_sellers.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-border-primary p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-4">Top Sellers by Revenue</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, summary.top_sellers.length * 40)}>
            <BarChart data={summary.top_sellers} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2F38" />
              <XAxis type="number" stroke="#6B7280" fontSize={12} tickFormatter={(v: number) => `$${v}`} />
              <YAxis type="category" dataKey="item_name" stroke="#6B7280" fontSize={12} width={90} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1A1F2B', border: '1px solid #2A2F38', borderRadius: '8px' }}
                labelStyle={{ color: '#9CA3AF' }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']}
              />
              <Bar dataKey="revenue" fill={chartColors.indigo} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Profit margins */}
      {summary.profit_margins.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-border-primary p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-4">Profit Margins</h3>
          <div className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-primary">
                  <th className="text-left px-4 py-2 text-xs font-medium text-text-muted uppercase">Item</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-muted uppercase">Sell Price</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-muted uppercase">Cost</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-muted uppercase">Margin</th>
                </tr>
              </thead>
              <tbody>
                {summary.profit_margins.map(pm => (
                  <tr key={pm.item_id} className="border-b border-border-primary last:border-0">
                    <td className="px-4 py-2 text-sm text-text-primary">{pm.item_name}</td>
                    <td className="px-4 py-2 text-sm text-text-secondary text-right">${pm.sale_price.toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm text-text-secondary text-right">
                      {pm.cost_price != null ? `$${pm.cost_price.toFixed(2)}` : '—'}
                    </td>
                    <td className={`px-4 py-2 text-sm font-medium text-right ${
                      pm.margin != null && pm.margin > 0 ? 'text-accent-green' : 'text-text-muted'
                    }`}>
                      {pm.margin != null ? `${pm.margin}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/client/src/pages/SnackBar.tsx
git commit -m "feat: add analytics tab with revenue charts and profit margins"
```

---

### Task 10: Add sale_price to SQLite store SELECT queries

**Files:**
- Modify: `packages/server/src/store/sqliteStore.ts`

**Step 1: Find all `SELECT * FROM items` or item column lists**

The `sale_price` column is added via migration, so `SELECT *` queries will already include it. However, check if any item queries use explicit column lists — if so, add `sale_price` to them.

Also ensure the `updateItem` method handles `sale_price` in its update logic. Find the `updateItem` method and verify it handles arbitrary fields from `UpdateItemInput`. If it builds SET clauses dynamically from the input object, `sale_price` will work automatically.

**Step 2: Build and test**

Run: `npm run build && npm run dev`
Test manually: navigate to /snack-bar, verify the page loads.

**Step 3: Commit if changes were needed**

```bash
git add packages/server/src/store/sqliteStore.ts
git commit -m "fix: ensure sale_price included in item queries"
```

---

### Task 11: End-to-End Smoke Test

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Manual testing checklist**

1. Navigate to Snack Bar in sidebar — page loads with three tabs
2. If no "Snack Bar" storage area exists, create one via the Manage Areas modal on the Inventory page
3. Transfer some items into the Snack Bar area
4. Return to Snack Bar page — items appear in Quick Sell grid
5. Click an item's price area, set a sale price (e.g., $2.50) — saves on blur/enter
6. Click "Sell" button — modal appears with quantity selector
7. Confirm sale — inventory decrements, sale recorded
8. Switch to Sales Log tab — sale appears with correct date, qty, price, total
9. Filter by Today/Week/Month — filters work
10. Switch to Analytics tab — summary cards show correct totals
11. Revenue chart renders (may need multiple sales on different days to see line)
12. Top sellers bar chart shows items
13. Profit margins table shows sell price vs cost

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: snack bar smoke test fixes"
```
