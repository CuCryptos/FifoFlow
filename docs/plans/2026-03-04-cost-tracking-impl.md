# Cost Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track estimated cost on every transaction and show total inventory value on the dashboard.

**Architecture:** Add `estimated_cost` column to transactions table (migration). Calculate cost server-side during transaction creation using existing unit conversion logic. Add `total_inventory_value` to dashboard stats via SQL aggregation. Display on dashboard and in activity logs.

**Tech Stack:** TypeScript, Express, better-sqlite3, React, TanStack Query, Tailwind CSS

---

### Task 1: Add estimated_cost to Transaction Type and Database

Add the `estimated_cost` field to the Transaction interface, add the column migration, and add `total_inventory_value` to DashboardStats.

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/server/src/db.ts`

**Step 1: Add estimated_cost to Transaction interface**

In `packages/shared/src/types.ts`, add `estimated_cost` to the `Transaction` interface (after `to_area_id`):

```typescript
export interface Transaction {
  id: number;
  item_id: number;
  type: TransactionType;
  quantity: number;
  reason: TransactionReason;
  notes: string | null;
  from_area_id: number | null;
  to_area_id: number | null;
  estimated_cost: number | null;
  created_at: string;
}
```

**Step 2: Add total_inventory_value to DashboardStats**

In `packages/shared/src/types.ts`, add to `DashboardStats`:

```typescript
export interface DashboardStats {
  total_items: number;
  low_stock_count: number;
  out_of_stock_count: number;
  today_transaction_count: number;
  total_inventory_value: number;
}
```

**Step 3: Add estimated_cost column migration**

In `packages/server/src/db.ts`, find the migrations section (the `addColumnIfMissing` calls). Add after the existing ones:

```typescript
addColumnIfMissing('estimated_cost', 'REAL', 'transactions');
```

IMPORTANT: The existing `addColumnIfMissing` function operates on the `items` table by default. Check its signature. If it only works on `items`, you'll need to add a table parameter or write a direct migration. Read the function to see how it works.

The function signature is likely:
```typescript
function addColumnIfMissing(column: string, type: string, table?: string)
```

If the function doesn't support a table parameter, add support for it by making the table name configurable (defaulting to `'items'`).

**Step 4: Build shared and server**

```bash
npm run build -w packages/shared && npm run build -w packages/server
```

**Step 5: Commit**

```bash
git add packages/shared/src/types.ts packages/server/src/db.ts
git commit -m "feat: add estimated_cost to transactions and total_inventory_value to dashboard stats"
```

---

### Task 2: Add estimated_cost to InsertTransactionAndAdjustQty Input and SQLite Store

Pass estimated_cost through the transaction creation pipeline and store it.

**Files:**
- Modify: `packages/server/src/store/types.ts`
- Modify: `packages/server/src/store/sqliteStore.ts`
- Modify: `packages/server/src/store/supabaseStore.ts`

**Step 1: Add estimated_cost to InsertTransactionAndAdjustQtyInput**

In `packages/server/src/store/types.ts`, add to `InsertTransactionAndAdjustQtyInput`:

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
  estimatedCost?: number | null;
}
```

**Step 2: Update SQLite insertTransactionAndAdjustQty**

In `packages/server/src/store/sqliteStore.ts`, find the `insertTransactionAndAdjustQty` method. Update the INSERT statement to include `estimated_cost`:

Change:
```typescript
const result = this.db.prepare(
  'INSERT INTO transactions (item_id, type, quantity, reason, notes, from_area_id, to_area_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
).run(input.itemId, input.type, input.quantity, input.reason, input.notes, input.fromAreaId ?? null, input.toAreaId ?? null);
```

To:
```typescript
const result = this.db.prepare(
  'INSERT INTO transactions (item_id, type, quantity, reason, notes, from_area_id, to_area_id, estimated_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
).run(input.itemId, input.type, input.quantity, input.reason, input.notes, input.fromAreaId ?? null, input.toAreaId ?? null, input.estimatedCost ?? null);
```

**Step 3: Update getDashboardStats in SQLite store**

In `packages/server/src/store/sqliteStore.ts`, find the `getDashboardStats` method. Add a query for total inventory value:

```typescript
const inventoryValue = this.db.prepare(`
  SELECT COALESCE(SUM(
    current_qty * order_unit_price / COALESCE(qty_per_unit, 1)
  ), 0) as value
  FROM items
  WHERE order_unit_price IS NOT NULL AND current_qty > 0
`).get() as { value: number };
```

Add `total_inventory_value: Math.round(inventoryValue.value * 100) / 100` to the return object.

**Step 4: Update Supabase store getDashboardStats**

In `packages/server/src/store/supabaseStore.ts`, find `getDashboardStats` and add `total_inventory_value: 0` to its return object.

**Step 5: Build and run tests**

```bash
npm run build -w packages/shared && npm run build -w packages/server
npm test --workspace=packages/server
```

**Step 6: Commit**

```bash
git add packages/server/src/store/types.ts packages/server/src/store/sqliteStore.ts packages/server/src/store/supabaseStore.ts
git commit -m "feat: store estimated_cost on transactions and add inventory value to dashboard stats"
```

---

### Task 3: Calculate and Pass estimated_cost in Transaction Route

Calculate the estimated cost server-side during transaction creation.

**Files:**
- Modify: `packages/server/src/routes/transactions.ts`

**Step 1: Add cost calculation**

In `packages/server/src/routes/transactions.ts`, in the `createTransactionHandler` function, after `normalizedQty` is calculated (around line 55) and before `const delta = ...`, add the cost calculation:

```typescript
// Calculate estimated cost from item's unit price
let estimatedCost: number | null = null;
if (item.order_unit_price != null) {
  const perBaseUnitCost = item.order_unit_price / ((item.qty_per_unit != null && item.qty_per_unit > 0) ? item.qty_per_unit : 1);
  estimatedCost = Math.round(normalizedQty * perBaseUnitCost * 100) / 100;
}
```

Then pass `estimatedCost` to `insertTransactionAndAdjustQty`:

```typescript
const result = await store.insertTransactionAndAdjustQty({
  itemId,
  type,
  quantity: normalizedQty,
  reason,
  notes: notes ?? null,
  delta,
  fromAreaId: from_area_id ?? null,
  toAreaId: to_area_id ?? null,
  estimatedCost,
});
```

**Step 2: Build and run tests**

```bash
npm run build -w packages/server
npm test --workspace=packages/server
```

**Step 3: Commit**

```bash
git add packages/server/src/routes/transactions.ts
git commit -m "feat: auto-calculate estimated_cost on transaction creation"
```

---

### Task 4: Display Inventory Value on Dashboard and Cost in Activity Log

Add the Inventory Value KPI card and show cost on transactions.

**Files:**
- Modify: `packages/client/src/pages/Dashboard.tsx`

**Step 1: Add Inventory Value KPI card**

In `packages/client/src/pages/Dashboard.tsx`, add a new `StatCard` in the KPI cards grid. Place it after "Est. Reorder Spend". Update the grid from `lg:grid-cols-5` to `lg:grid-cols-6`:

```tsx
<StatCard
  label="Inventory Value"
  value={stats?.total_inventory_value ?? 0}
  color="green"
  format="currency"
/>
```

**Step 2: Show cost in activity log transactions**

In the Recent Activity section, update the transaction row to show cost. After the quantity display, add the cost:

Change:
```tsx
<span className="font-mono font-medium">
  {tx.type === 'in' ? '+' : '-'}{tx.quantity}
</span>
```

To:
```tsx
<span className="font-mono font-medium">
  {tx.type === 'in' ? '+' : '-'}{tx.quantity}
</span>
{tx.estimated_cost != null && (
  <span className="text-text-muted text-xs font-mono">
    ${tx.estimated_cost.toFixed(2)}
  </span>
)}
```

**Step 3: Build**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add packages/client/src/pages/Dashboard.tsx
git commit -m "feat: add inventory value KPI card and cost display in activity log"
```

---

### Task 5: Show Cost in Item Detail Transaction History

Show estimated_cost on transactions in the item detail page.

**Files:**
- Modify: `packages/client/src/pages/ItemDetail.tsx`

**Step 1: Add cost display to transaction history**

Read `packages/client/src/pages/ItemDetail.tsx` and find where transactions are rendered (likely a list of transaction rows). For each transaction that has `estimated_cost`, display it next to the quantity.

Find the transaction rendering pattern (it will show something like `+5 each` or `-3 lb`). After the quantity/unit display, add:

```tsx
{tx.estimated_cost != null && (
  <span className="text-text-muted text-xs font-mono ml-1">
    (${tx.estimated_cost.toFixed(2)})
  </span>
)}
```

**Step 2: Build and verify**

```bash
npm run build
```

**Step 3: Run server tests**

```bash
npm test --workspace=packages/server
```

**Step 4: Commit**

```bash
git add packages/client/src/pages/ItemDetail.tsx
git commit -m "feat: show estimated cost in item detail transaction history"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Add estimated_cost column + type changes | `types.ts`, `db.ts` |
| 2 | Store pipeline + dashboard stats query | `store/types.ts`, `sqliteStore.ts`, `supabaseStore.ts` |
| 3 | Server-side cost calculation in transaction route | `transactions.ts` |
| 4 | Dashboard inventory value card + cost in activity log | `Dashboard.tsx` |
| 5 | Cost in item detail transaction history | `ItemDetail.tsx` |

Tasks 1-3 are backend (sequential). Tasks 4-5 are frontend (can run after 3).
