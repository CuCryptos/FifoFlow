# Inventory Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the inventory list into a spreadsheet-style table with inline-editable fields (order unit, qty/unit, item size, reorder level, reorder qty) and auto-calculated reorder status.

**Architecture:** Add 5 nullable columns to items table via ALTER TABLE. Extend shared types and Zod schemas. The PUT /api/items/:id route already handles dynamic field updates so no route changes needed. Rebuild the Inventory page component with inline-editable cells that auto-save on blur.

**Tech Stack:** SQLite ALTER TABLE, Zod, React (inline editing with onBlur save)

---

### Task 1: Add new columns to database and update shared types/schemas

**Files:**
- Modify: `packages/server/src/db.ts` — add ALTER TABLE migrations
- Modify: `packages/shared/src/types.ts` — add new fields to Item interface
- Modify: `packages/shared/src/schemas.ts` — add new fields to updateItemSchema

**Step 1: Add migration to db.ts**

After the existing `db.exec(...)` in `initializeDb`, add:

```typescript
  // Migrations — add new inventory fields
  const columns = db.pragma('table_info(items)') as Array<{ name: string }>;
  const columnNames = columns.map((c) => c.name);

  if (!columnNames.includes('order_unit')) {
    db.exec(`
      ALTER TABLE items ADD COLUMN order_unit TEXT;
      ALTER TABLE items ADD COLUMN qty_per_unit REAL;
      ALTER TABLE items ADD COLUMN item_size TEXT;
      ALTER TABLE items ADD COLUMN reorder_level REAL;
      ALTER TABLE items ADD COLUMN reorder_qty REAL;
    `);
  }
```

**Step 2: Update Item interface in types.ts**

Add to the Item interface:
```typescript
  order_unit: string | null;
  qty_per_unit: number | null;
  item_size: string | null;
  reorder_level: number | null;
  reorder_qty: number | null;
```

**Step 3: Update updateItemSchema in schemas.ts**

Add to the updateItemSchema:
```typescript
  order_unit: z.string().max(50).nullable().optional(),
  qty_per_unit: z.number().positive().nullable().optional(),
  item_size: z.string().max(100).nullable().optional(),
  reorder_level: z.number().min(0).nullable().optional(),
  reorder_qty: z.number().positive().nullable().optional(),
```

**Step 4: Run tests**

```bash
npm test --workspace=packages/server
```

All 23 tests should pass (the PUT route already handles dynamic fields).

**Step 5: Commit**

```bash
git add packages/server/src/db.ts packages/shared/src/types.ts packages/shared/src/schemas.ts
git commit -m "feat: add order_unit, qty_per_unit, item_size, reorder_level, reorder_qty to items"
```

---

### Task 2: Rebuild Inventory page with spreadsheet-style inline editing

**Files:**
- Modify: `packages/client/src/pages/Inventory.tsx`

**Step 1: Replace Inventory.tsx**

The new implementation needs:
- An `InlineEdit` helper component that renders a value as text, shows an input on focus, and calls `onSave` on blur
- The `useUpdateItem` hook for saving inline edits
- Table columns: Name, Category, Order Unit, Qty/Unit, Item Size, Stock Qty, Unit (with conversion), Reorder Level, Reorder (auto badge), Reorder Qty
- The Reorder badge: OK (green) when stock > reorder_level, REORDER (red) when stock ≤ reorder_level, "—" when no reorder_level set

Key patterns:
- Each inline-editable cell uses local state initialized from the item prop
- On blur, if the value changed, call `updateItem.mutate({ id, data: { field: newValue } })`
- For select fields (order_unit), save on change instead of blur
- Use `UNITS` array for the order_unit select dropdown

**Step 2: Verify build**

```bash
cd /Users/curtisvaughan/FifoFlow/packages/client && npx vite build
```

**Step 3: Commit**

```bash
git add packages/client/src/pages/Inventory.tsx
git commit -m "feat: redesign inventory page with inline-editable spreadsheet layout"
```

---

### Task 3: Update Item Detail page to show new fields

**Files:**
- Modify: `packages/client/src/pages/ItemDetail.tsx`

**Step 1: Update the edit form to include new fields**

Add the new fields (order_unit, qty_per_unit, item_size, reorder_level, reorder_qty) to:
- The view mode display section
- The edit form
- Include them in the saveEdit mutation

**Step 2: Verify build and commit**

```bash
cd /Users/curtisvaughan/FifoFlow/packages/client && npx vite build
git add packages/client/src/pages/ItemDetail.tsx
git commit -m "feat: add new inventory fields to item detail page"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | DB migration + shared types/schemas | db.ts, types.ts, schemas.ts |
| 2 | Inventory page redesign with inline editing | Inventory.tsx |
| 3 | Item detail page updates | ItemDetail.tsx |
