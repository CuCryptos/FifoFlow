# Reports / Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a tabbed reports page with server-side aggregated Usage, Waste, and Cost reports filtered by date range.

**Architecture:** Three new server endpoints perform SQL aggregation on the existing transactions + items tables. A new `/reports` client page with tabs and a date range picker consumes these endpoints. No new database tables.

**Tech Stack:** TypeScript, Express, better-sqlite3, React, TanStack Query, Tailwind CSS

---

### Task 1: Add Report Types to Shared Package

Add the response types for all three report endpoints.

**Files:**
- Modify: `packages/shared/src/types.ts`

**Step 1: Add report types**

In `packages/shared/src/types.ts`, add at the end of the file:

```typescript
export interface UsageRow {
  period: string;
  item_name: string;
  category: string;
  in_qty: number;
  out_qty: number;
  tx_count: number;
}

export interface UsageReport {
  rows: UsageRow[];
  totals: { in_qty: number; out_qty: number; tx_count: number };
}

export interface WasteRow {
  item_name: string;
  category: string;
  quantity: number;
  estimated_cost: number;
}

export interface WasteReport {
  rows: WasteRow[];
  totals: { quantity: number; estimated_cost: number };
}

export interface CostRow {
  group_name: string;
  in_cost: number;
  out_cost: number;
  net_cost: number;
  tx_count: number;
}

export interface CostReport {
  rows: CostRow[];
  totals: { in_cost: number; out_cost: number; net_cost: number };
}
```

**Step 2: Export new types from shared index**

Check `packages/shared/src/index.ts` — if types are re-exported from there, add the new ones. If types.ts is imported directly, no change needed.

**Step 3: Build shared**

```bash
npm run build -w packages/shared
```

**Step 4: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add report types (UsageReport, WasteReport, CostReport)"
```

---

### Task 2: Add Report Store Methods and SQLite Implementation

Add three report methods to the store interface and implement them with SQL aggregation.

**Files:**
- Modify: `packages/server/src/store/types.ts`
- Modify: `packages/server/src/store/sqliteStore.ts`
- Modify: `packages/server/src/store/supabaseStore.ts`

**Step 1: Add report filter interface and store methods**

In `packages/server/src/store/types.ts`, add the import for the new types at the top:

```typescript
import type {
  // ... existing imports ...
  UsageReport,
  WasteReport,
  CostReport,
} from '@fifoflow/shared';
```

Add a report filters interface after the existing filter interfaces:

```typescript
export interface ReportFilters {
  start: string;
  end: string;
  groupBy?: string;
}
```

Add to the `InventoryStore` interface (at the end, before the closing `}`):

```typescript
  // Reports
  getUsageReport(filters: ReportFilters): Promise<UsageReport>;
  getWasteReport(filters: ReportFilters): Promise<WasteReport>;
  getCostReport(filters: ReportFilters): Promise<CostReport>;
```

**Step 2: Implement getUsageReport in SQLite store**

In `packages/server/src/store/sqliteStore.ts`, add the import for new types and add three methods before the closing `}` of the class.

Add to the imports at the top:

```typescript
import type {
  // ... existing imports ...
  UsageReport,
  UsageRow,
  WasteReport,
  WasteRow,
  CostReport,
  CostRow,
} from '@fifoflow/shared';
```

Also import `ReportFilters` from `./types.js`.

Add the getUsageReport method:

```typescript
  async getUsageReport(filters: ReportFilters): Promise<UsageReport> {
    const { start, end, groupBy } = filters;
    const periodExpr = groupBy === 'week'
      ? "strftime('%Y-W%W', t.created_at)"
      : "date(t.created_at)";

    const rows = this.db.prepare(`
      SELECT
        ${periodExpr} as period,
        i.name as item_name,
        i.category,
        COALESCE(SUM(CASE WHEN t.type = 'in' THEN t.quantity ELSE 0 END), 0) as in_qty,
        COALESCE(SUM(CASE WHEN t.type = 'out' THEN t.quantity ELSE 0 END), 0) as out_qty,
        COUNT(*) as tx_count
      FROM transactions t
      JOIN items i ON t.item_id = i.id
      WHERE t.created_at >= ? AND t.created_at < ? || 'T23:59:59.999Z'
      GROUP BY period, i.id
      ORDER BY period DESC, out_qty DESC
    `).all(start, end) as UsageRow[];

    const totals = rows.reduce(
      (acc, r) => ({
        in_qty: acc.in_qty + r.in_qty,
        out_qty: acc.out_qty + r.out_qty,
        tx_count: acc.tx_count + r.tx_count,
      }),
      { in_qty: 0, out_qty: 0, tx_count: 0 },
    );

    return { rows, totals };
  }
```

**Step 3: Implement getWasteReport in SQLite store**

```typescript
  async getWasteReport(filters: ReportFilters): Promise<WasteReport> {
    const { start, end } = filters;

    const rows = this.db.prepare(`
      SELECT
        i.name as item_name,
        i.category,
        SUM(t.quantity) as quantity,
        COALESCE(SUM(t.estimated_cost), 0) as estimated_cost
      FROM transactions t
      JOIN items i ON t.item_id = i.id
      WHERE t.reason = 'Wasted'
        AND t.created_at >= ? AND t.created_at < ? || 'T23:59:59.999Z'
      GROUP BY i.id
      ORDER BY estimated_cost DESC
    `).all(start, end) as WasteRow[];

    const totals = rows.reduce(
      (acc, r) => ({
        quantity: acc.quantity + r.quantity,
        estimated_cost: acc.estimated_cost + r.estimated_cost,
      }),
      { quantity: 0, estimated_cost: 0 },
    );

    return { rows, totals };
  }
```

**Step 4: Implement getCostReport in SQLite store**

```typescript
  async getCostReport(filters: ReportFilters): Promise<CostReport> {
    const { start, end, groupBy } = filters;
    const groupExpr = groupBy === 'vendor'
      ? "COALESCE(v.name, 'No Vendor')"
      : 'i.category';
    const joinClause = groupBy === 'vendor'
      ? 'LEFT JOIN vendors v ON i.vendor_id = v.id'
      : '';

    const rows = this.db.prepare(`
      SELECT
        ${groupExpr} as group_name,
        COALESCE(SUM(CASE WHEN t.type = 'in' THEN t.estimated_cost ELSE 0 END), 0) as in_cost,
        COALESCE(SUM(CASE WHEN t.type = 'out' THEN t.estimated_cost ELSE 0 END), 0) as out_cost,
        COALESCE(SUM(CASE WHEN t.type = 'in' THEN t.estimated_cost ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN t.type = 'out' THEN t.estimated_cost ELSE 0 END), 0) as net_cost,
        COUNT(*) as tx_count
      FROM transactions t
      JOIN items i ON t.item_id = i.id
      ${joinClause}
      WHERE t.estimated_cost IS NOT NULL
        AND t.created_at >= ? AND t.created_at < ? || 'T23:59:59.999Z'
      GROUP BY group_name
      ORDER BY in_cost DESC
    `).all(start, end) as CostRow[];

    const totals = rows.reduce(
      (acc, r) => ({
        in_cost: acc.in_cost + r.in_cost,
        out_cost: acc.out_cost + r.out_cost,
        net_cost: acc.net_cost + r.net_cost,
      }),
      { in_cost: 0, out_cost: 0, net_cost: 0 },
    );

    return { rows, totals };
  }
```

**Step 5: Add stubs to Supabase store**

In `packages/server/src/store/supabaseStore.ts`, add the import for new types and add three stub methods:

```typescript
  async getUsageReport(_filters: ReportFilters): Promise<UsageReport> {
    return this.notImplemented('getUsageReport');
  }

  async getWasteReport(_filters: ReportFilters): Promise<WasteReport> {
    return this.notImplemented('getWasteReport');
  }

  async getCostReport(_filters: ReportFilters): Promise<CostReport> {
    return this.notImplemented('getCostReport');
  }
```

**Step 6: Build and test**

```bash
npm run build -w packages/server
npm test --workspace=packages/server
```

**Step 7: Commit**

```bash
git add packages/server/src/store/types.ts packages/server/src/store/sqliteStore.ts packages/server/src/store/supabaseStore.ts
git commit -m "feat: add report store methods with SQL aggregation (usage, waste, cost)"
```

---

### Task 3: Add Report API Routes

Create the reports router with three GET endpoints.

**Files:**
- Create: `packages/server/src/routes/reports.ts`
- Modify: `packages/server/src/index.ts`

**Step 1: Create reports route file**

Create `packages/server/src/routes/reports.ts`:

```typescript
import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';

export function createReportRoutes(store: InventoryStore): Router {
  const router = Router();

  function defaultStart(): string {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }

  function defaultEnd(): string {
    return new Date().toISOString().slice(0, 10);
  }

  router.get('/usage', async (req, res) => {
    const start = (req.query.start as string) || defaultStart();
    const end = (req.query.end as string) || defaultEnd();
    const groupBy = (req.query.group_by as string) || 'day';
    const report = await store.getUsageReport({ start, end, groupBy });
    res.json(report);
  });

  router.get('/waste', async (req, res) => {
    const start = (req.query.start as string) || defaultStart();
    const end = (req.query.end as string) || defaultEnd();
    const report = await store.getWasteReport({ start, end });
    res.json(report);
  });

  router.get('/cost', async (req, res) => {
    const start = (req.query.start as string) || defaultStart();
    const end = (req.query.end as string) || defaultEnd();
    const groupBy = (req.query.group_by as string) || 'category';
    const report = await store.getCostReport({ start, end, groupBy });
    res.json(report);
  });

  return router;
}
```

**Step 2: Register routes in index.ts**

In `packages/server/src/index.ts`, add the import:

```typescript
import { createReportRoutes } from './routes/reports.js';
```

Add the route registration after the existing `app.use` lines:

```typescript
app.use('/api/reports', createReportRoutes(store));
```

**Step 3: Build and test**

```bash
npm run build -w packages/server
npm test --workspace=packages/server
```

**Step 4: Commit**

```bash
git add packages/server/src/routes/reports.ts packages/server/src/index.ts
git commit -m "feat: add /api/reports endpoints (usage, waste, cost)"
```

---

### Task 4: Add Client API and Hooks for Reports

Add the API functions and TanStack Query hooks.

**Files:**
- Modify: `packages/client/src/api.ts`
- Create: `packages/client/src/hooks/useReports.ts`

**Step 1: Add report API methods**

In `packages/client/src/api.ts`, add the import for report types at the top:

```typescript
import type {
  // ... existing imports ...
  UsageReport,
  WasteReport,
  CostReport,
} from '@fifoflow/shared';
```

Add a `reports` section to the `api` object (after the `dashboard` section):

```typescript
  reports: {
    usage: (params: { start: string; end: string; group_by?: string }) => {
      const qs = new URLSearchParams({ start: params.start, end: params.end });
      if (params.group_by) qs.set('group_by', params.group_by);
      return fetchJson<UsageReport>(`/reports/usage?${qs}`);
    },
    waste: (params: { start: string; end: string }) => {
      const qs = new URLSearchParams({ start: params.start, end: params.end });
      return fetchJson<WasteReport>(`/reports/waste?${qs}`);
    },
    cost: (params: { start: string; end: string; group_by?: string }) => {
      const qs = new URLSearchParams({ start: params.start, end: params.end });
      if (params.group_by) qs.set('group_by', params.group_by);
      return fetchJson<CostReport>(`/reports/cost?${qs}`);
    },
  },
```

**Step 2: Create report hooks**

Create `packages/client/src/hooks/useReports.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export function useUsageReport(start: string, end: string, groupBy: string = 'day') {
  return useQuery({
    queryKey: ['reports', 'usage', start, end, groupBy],
    queryFn: () => api.reports.usage({ start, end, group_by: groupBy }),
  });
}

export function useWasteReport(start: string, end: string) {
  return useQuery({
    queryKey: ['reports', 'waste', start, end],
    queryFn: () => api.reports.waste({ start, end }),
  });
}

export function useCostReport(start: string, end: string, groupBy: string = 'category') {
  return useQuery({
    queryKey: ['reports', 'cost', start, end, groupBy],
    queryFn: () => api.reports.cost({ start, end, group_by: groupBy }),
  });
}
```

**Step 3: Build**

```bash
npm run build -w packages/shared && npm run build -w packages/client
```

**Step 4: Commit**

```bash
git add packages/client/src/api.ts packages/client/src/hooks/useReports.ts
git commit -m "feat: add client API and hooks for reports"
```

---

### Task 5: Create Reports Page with Tabs and Date Picker

Build the full Reports page with Usage, Waste, and Cost tabs.

**Files:**
- Create: `packages/client/src/pages/Reports.tsx`
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/components/Layout.tsx`

**Step 1: Create the Reports page**

Create `packages/client/src/pages/Reports.tsx`. This is the largest file — it contains:

1. A date range picker with preset buttons (Today, 7 Days, 30 Days, 90 Days)
2. Three tabs (Usage, Waste, Cost)
3. Summary stat cards per tab
4. Data tables per tab
5. Group-by toggles on Usage (day/week) and Cost (category/vendor) tabs

```tsx
import { useState, useMemo } from 'react';
import { useUsageReport, useWasteReport, useCostReport } from '../hooks/useReports';

type Tab = 'usage' | 'waste' | 'cost';
type UsageGroupBy = 'day' | 'week';
type CostGroupBy = 'category' | 'vendor';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

function formatCurrency(v: number): string {
  return '$' + v.toFixed(2);
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card rounded-xl border border-card-border p-4">
      <div className="text-text-muted text-xs uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-text-primary mt-1 font-mono">{value}</div>
    </div>
  );
}

export function Reports() {
  const [tab, setTab] = useState<Tab>('usage');
  const [start, setStart] = useState(() => daysAgo(30));
  const [end, setEnd] = useState(() => formatDate(new Date()));
  const [usageGroupBy, setUsageGroupBy] = useState<UsageGroupBy>('day');
  const [costGroupBy, setCostGroupBy] = useState<CostGroupBy>('category');

  const presets = [
    { label: 'Today', fn: () => { setStart(formatDate(new Date())); setEnd(formatDate(new Date())); } },
    { label: '7 Days', fn: () => { setStart(daysAgo(7)); setEnd(formatDate(new Date())); } },
    { label: '30 Days', fn: () => { setStart(daysAgo(30)); setEnd(formatDate(new Date())); } },
    { label: '90 Days', fn: () => { setStart(daysAgo(90)); setEnd(formatDate(new Date())); } },
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: 'usage', label: 'Usage' },
    { key: 'waste', label: 'Waste' },
    { key: 'cost', label: 'Cost' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Reports</h1>

      {/* Date range picker */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={p.fn}
              className="px-3 py-1.5 text-xs rounded-lg bg-card border border-card-border text-text-secondary hover:bg-sidebar-hover hover:text-white transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="bg-card border border-card-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
          />
          <span className="text-text-muted">to</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="bg-card border border-card-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-card-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-accent-indigo text-accent-indigo'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'usage' && (
        <UsageTab start={start} end={end} groupBy={usageGroupBy} setGroupBy={setUsageGroupBy} />
      )}
      {tab === 'waste' && <WasteTab start={start} end={end} />}
      {tab === 'cost' && (
        <CostTab start={start} end={end} groupBy={costGroupBy} setGroupBy={setCostGroupBy} />
      )}
    </div>
  );
}

function GroupByToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1 text-xs rounded-lg transition-colors ${
            value === o.key
              ? 'bg-accent-indigo text-white'
              : 'bg-card border border-card-border text-text-muted hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function UsageTab({
  start,
  end,
  groupBy,
  setGroupBy,
}: {
  start: string;
  end: string;
  groupBy: UsageGroupBy;
  setGroupBy: (v: UsageGroupBy) => void;
}) {
  const { data, isLoading } = useUsageReport(start, end, groupBy);

  if (isLoading) return <div className="text-text-muted">Loading...</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-3 gap-4 flex-1 mr-4">
          <StatCard label="Total In" value={data.totals.in_qty} />
          <StatCard label="Total Out" value={data.totals.out_qty} />
          <StatCard label="Transactions" value={data.totals.tx_count} />
        </div>
        <GroupByToggle
          options={[
            { key: 'day' as UsageGroupBy, label: 'Day' },
            { key: 'week' as UsageGroupBy, label: 'Week' },
          ]}
          value={groupBy}
          onChange={setGroupBy}
        />
      </div>

      <div className="bg-card rounded-xl border border-card-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border text-text-muted text-left">
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium text-right">In</th>
              <th className="px-4 py-3 font-medium text-right">Out</th>
              <th className="px-4 py-3 font-medium text-right">Txns</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                  No transactions in this period
                </td>
              </tr>
            ) : (
              data.rows.map((r, i) => (
                <tr key={i} className="border-b border-card-border/50 hover:bg-sidebar-hover/30">
                  <td className="px-4 py-2.5 font-mono text-xs text-text-muted">{r.period}</td>
                  <td className="px-4 py-2.5 text-text-primary">{r.item_name}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{r.category}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-badge-green-text">
                    {r.in_qty > 0 ? `+${r.in_qty}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-badge-red-text">
                    {r.out_qty > 0 ? `-${r.out_qty}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{r.tx_count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WasteTab({ start, end }: { start: string; end: string }) {
  const { data, isLoading } = useWasteReport(start, end);

  if (isLoading) return <div className="text-text-muted">Loading...</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total Waste Qty" value={data.totals.quantity} />
        <StatCard label="Total Waste Cost" value={formatCurrency(data.totals.estimated_cost)} />
      </div>

      <div className="bg-card rounded-xl border border-card-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border text-text-muted text-left">
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium text-right">Qty Wasted</th>
              <th className="px-4 py-3 font-medium text-right">Est. Cost</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-muted">
                  No waste recorded in this period
                </td>
              </tr>
            ) : (
              data.rows.map((r, i) => (
                <tr key={i} className="border-b border-card-border/50 hover:bg-sidebar-hover/30">
                  <td className="px-4 py-2.5 text-text-primary">{r.item_name}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{r.category}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-badge-red-text">{r.quantity}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                    {formatCurrency(r.estimated_cost)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CostTab({
  start,
  end,
  groupBy,
  setGroupBy,
}: {
  start: string;
  end: string;
  groupBy: CostGroupBy;
  setGroupBy: (v: CostGroupBy) => void;
}) {
  const { data, isLoading } = useCostReport(start, end, groupBy);

  if (isLoading) return <div className="text-text-muted">Loading...</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-3 gap-4 flex-1 mr-4">
          <StatCard label="Total In Cost" value={formatCurrency(data.totals.in_cost)} />
          <StatCard label="Total Out Cost" value={formatCurrency(data.totals.out_cost)} />
          <StatCard label="Net Cost" value={formatCurrency(data.totals.net_cost)} />
        </div>
        <GroupByToggle
          options={[
            { key: 'category' as CostGroupBy, label: 'Category' },
            { key: 'vendor' as CostGroupBy, label: 'Vendor' },
          ]}
          value={groupBy}
          onChange={setGroupBy}
        />
      </div>

      <div className="bg-card rounded-xl border border-card-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border text-text-muted text-left">
              <th className="px-4 py-3 font-medium">{groupBy === 'vendor' ? 'Vendor' : 'Category'}</th>
              <th className="px-4 py-3 font-medium text-right">In Cost</th>
              <th className="px-4 py-3 font-medium text-right">Out Cost</th>
              <th className="px-4 py-3 font-medium text-right">Net Cost</th>
              <th className="px-4 py-3 font-medium text-right">Txns</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                  No cost data in this period
                </td>
              </tr>
            ) : (
              data.rows.map((r, i) => (
                <tr key={i} className="border-b border-card-border/50 hover:bg-sidebar-hover/30">
                  <td className="px-4 py-2.5 text-text-primary">{r.group_name}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-badge-green-text">
                    {formatCurrency(r.in_cost)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-badge-red-text">
                    {formatCurrency(r.out_cost)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                    {formatCurrency(r.net_cost)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{r.tx_count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Step 2: Add route to App.tsx**

In `packages/client/src/App.tsx`, add the import:

```typescript
import { Reports } from './pages/Reports';
```

Add the route inside the `<Route element={<Layout />}>` group, after the `/counts` route:

```tsx
<Route path="/reports" element={<Reports />} />
```

**Step 3: Add nav item to Layout.tsx**

In `packages/client/src/components/Layout.tsx`, add `BarChart3` to the lucide-react import:

```typescript
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ClipboardCheck,
  Activity,
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from 'lucide-react';
```

Add to the `navItems` array (after Activity):

```typescript
{ to: '/reports', label: 'Reports', icon: BarChart3 },
```

**Step 4: Build**

```bash
npm run build
```

**Step 5: Run server tests**

```bash
npm test --workspace=packages/server
```

**Step 6: Commit**

```bash
git add packages/client/src/pages/Reports.tsx packages/client/src/App.tsx packages/client/src/components/Layout.tsx
git commit -m "feat: add Reports page with Usage, Waste, and Cost tabs"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Add report types to shared package | `types.ts` |
| 2 | Store methods + SQL aggregation | `store/types.ts`, `sqliteStore.ts`, `supabaseStore.ts` |
| 3 | Report API routes | `routes/reports.ts`, `index.ts` |
| 4 | Client API + hooks | `api.ts`, `hooks/useReports.ts` |
| 5 | Reports page with tabs, date picker, tables | `Reports.tsx`, `App.tsx`, `Layout.tsx` |

Tasks 1-3 are backend (sequential). Task 4 bridges client/server. Task 5 is frontend (depends on 4).
