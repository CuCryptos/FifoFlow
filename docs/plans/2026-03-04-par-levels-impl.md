# Par Levels — Fix Dashboard Low Stock Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hardcoded `LOW_STOCK_THRESHOLD = 5` with per-item `reorder_level` for the dashboard Low Stock count.

**Architecture:** Remove the global constant, update `getDashboardStats` to query items where `current_qty <= reorder_level`, and update the dashboard UI. No new tables or endpoints.

**Tech Stack:** TypeScript, Express, better-sqlite3, React, Tailwind CSS

---

### Task 1: Update getDashboardStats and Remove LOW_STOCK_THRESHOLD

Remove the global constant, update the store interface, and fix the SQL query.

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/server/src/store/types.ts`
- Modify: `packages/server/src/store/sqliteStore.ts`
- Modify: `packages/server/src/store/supabaseStore.ts`
- Modify: `packages/server/src/routes/dashboard.ts`

**Step 1: Remove LOW_STOCK_THRESHOLD from constants.ts**

In `packages/shared/src/constants.ts`, delete line 51:

```typescript
export const LOW_STOCK_THRESHOLD = 5;
```

**Step 2: Update store interface**

In `packages/server/src/store/types.ts`, change line 101 from:

```typescript
getDashboardStats(lowStockThreshold: number): Promise<DashboardStats>;
```

To:

```typescript
getDashboardStats(): Promise<DashboardStats>;
```

**Step 3: Update SQLite store getDashboardStats**

In `packages/server/src/store/sqliteStore.ts`, change the method signature and low stock query.

Change:

```typescript
async getDashboardStats(lowStockThreshold: number): Promise<DashboardStats> {
    const totalItems = this.db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number };
    const lowStock = this.db.prepare(
      'SELECT COUNT(*) as count FROM items WHERE current_qty > 0 AND current_qty <= ?'
    ).get(lowStockThreshold) as { count: number };
```

To:

```typescript
async getDashboardStats(): Promise<DashboardStats> {
    const totalItems = this.db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number };
    const lowStock = this.db.prepare(
      'SELECT COUNT(*) as count FROM items WHERE reorder_level IS NOT NULL AND current_qty > 0 AND current_qty <= reorder_level'
    ).get() as { count: number };
```

**Step 4: Update Supabase store getDashboardStats**

In `packages/server/src/store/supabaseStore.ts`, change method signature and low stock filter.

Change:

```typescript
async getDashboardStats(lowStockThreshold: number): Promise<DashboardStats> {
```

To:

```typescript
async getDashboardStats(): Promise<DashboardStats> {
```

And change the lowStock count filter from:

```typescript
this.count('items', [
  { column: 'current_qty', operator: 'gt', value: 0 },
  { column: 'current_qty', operator: 'lte', value: lowStockThreshold },
]),
```

To:

```typescript
this.count('items', [
  { column: 'reorder_level', operator: 'gt', value: 0 },
  { column: 'current_qty', operator: 'gt', value: 0 },
  { column: 'current_qty', operator: 'lte', value: 'reorder_level' },
]),
```

Note: The Supabase store is a stub (`notImplemented`), so this filter change may not matter. Just update the signature to match the interface.

**Step 5: Update dashboard route**

In `packages/server/src/routes/dashboard.ts`, remove the LOW_STOCK_THRESHOLD import and parameter.

Change:

```typescript
import { Router } from 'express';
import { LOW_STOCK_THRESHOLD } from '@fifoflow/shared';
import type { InventoryStore } from '../store/types.js';

export function createDashboardRoutes(store: InventoryStore): Router {
  const router = Router();

  router.get('/stats', async (_req, res) => {
    const stats = await store.getDashboardStats(LOW_STOCK_THRESHOLD);
    res.json(stats);
  });

  return router;
}
```

To:

```typescript
import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';

export function createDashboardRoutes(store: InventoryStore): Router {
  const router = Router();

  router.get('/stats', async (_req, res) => {
    const stats = await store.getDashboardStats();
    res.json(stats);
  });

  return router;
}
```

**Step 6: Build and run tests**

```bash
npm run build -w packages/shared && npm run build -w packages/server
npm test --workspace=packages/server
```

**Step 7: Commit**

```bash
git add packages/shared/src/constants.ts packages/server/src/store/types.ts packages/server/src/store/sqliteStore.ts packages/server/src/store/supabaseStore.ts packages/server/src/routes/dashboard.ts
git commit -m "feat: use per-item reorder_level for dashboard low stock count"
```

---

### Task 2: Update Dashboard UI

Remove the LOW_STOCK_THRESHOLD import and subtitle from the Low Stock card.

**Files:**
- Modify: `packages/client/src/pages/Dashboard.tsx`

**Step 1: Remove LOW_STOCK_THRESHOLD import and subtitle**

In `packages/client/src/pages/Dashboard.tsx`, remove line 5:

```typescript
import { LOW_STOCK_THRESHOLD } from '@fifoflow/shared';
```

Then change the Low Stock StatCard from:

```tsx
<StatCard
  label="Low Stock"
  value={stats?.low_stock_count ?? 0}
  color="amber"
  subtitle={`≤ ${LOW_STOCK_THRESHOLD} units`}
/>
```

To:

```tsx
<StatCard
  label="Low Stock"
  value={stats?.low_stock_count ?? 0}
  color="amber"
  subtitle="below par"
/>
```

**Step 2: Build**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add packages/client/src/pages/Dashboard.tsx
git commit -m "feat: update dashboard Low Stock card to show 'below par' subtitle"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Remove LOW_STOCK_THRESHOLD, update store + route | `constants.ts`, `types.ts`, `sqliteStore.ts`, `supabaseStore.ts`, `dashboard.ts` |
| 2 | Update Dashboard UI | `Dashboard.tsx` |

Task 1 is backend. Task 2 is frontend (depends on Task 1 for build).
