# Expanded Units Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 10 new measurement units (kg, g, L, pint, cup, tbsp, tsp, dozen, pack, sleeve) with full conversion support.

**Architecture:** Extend the existing `UNITS` constant and `UNIT_GROUPS` conversion table. No new files, no schema changes, no UI changes — downstream consumers already read from these constants.

**Tech Stack:** TypeScript, Zod (shared package)

---

### Task 1: Add New Units and Conversion Factors

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/conversions.ts`

**Step 1: Add 10 new units to the UNITS array**

In `packages/shared/src/constants.ts`, replace the UNITS array with:

```typescript
export const UNITS = [
  'each',
  'lb',
  'oz',
  'kg',
  'g',
  'gal',
  'qt',
  'pint',
  'cup',
  'fl oz',
  'tbsp',
  'tsp',
  'ml',
  'L',
  'dozen',
  'case',
  'bag',
  'box',
  'bottle',
  'pack',
  'sleeve',
] as const;
```

**Step 2: Expand UNIT_GROUPS in conversions.ts**

In `packages/shared/src/conversions.ts`, replace the `UNIT_GROUPS` array with:

```typescript
const UNIT_GROUPS: { units: Unit[]; factors: Record<string, number> }[] = [
  {
    units: ['lb', 'oz', 'kg', 'g'],
    factors: { lb: 1, oz: 16, kg: 0.453592, g: 453.592 },
  },
  {
    units: ['gal', 'qt', 'pint', 'cup', 'fl oz', 'tbsp', 'tsp', 'ml', 'L'],
    factors: { gal: 1, qt: 4, pint: 8, cup: 16, 'fl oz': 128, tbsp: 256, tsp: 768, ml: 3785.41, L: 3.78541 },
  },
  {
    units: ['dozen', 'each'],
    factors: { dozen: 1, each: 12 },
  },
];
```

**Step 3: Build all packages**

```bash
npm run build
```

Expected: Success. All downstream packages (server, client) should compile without errors since the `Unit` type is inferred from the `UNITS` const array.

**Step 4: Run server tests**

```bash
npm test --workspace=packages/server
```

Expected: All 86 tests pass (no test changes needed — existing tests use `each`, `lb`, `case` etc. which are unchanged).

**Step 5: Commit**

```bash
git add packages/shared/src/constants.ts packages/shared/src/conversions.ts
git commit -m "feat: add 10 new units with conversion support (metric, dry measure, count)"
```
