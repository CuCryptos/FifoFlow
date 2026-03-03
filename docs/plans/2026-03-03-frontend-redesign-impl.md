# Frontend Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Overhaul FifoFlow's frontend from dark monospace terminal UI to clean light-mode SaaS with persistent sidebar navigation and smart column groups.

**Architecture:** Pure frontend restyling — no backend changes, no new API endpoints, no schema changes. All hooks/API layer untouched. Replace Tailwind theme tokens, rewrite Layout with sidebar, restyle all 5 pages and 3 modals/forms.

**Tech Stack:** React 19, Tailwind CSS v4, Lucide React (new), Google Fonts (DM Sans + JetBrains Mono)

**Design Reference:** `docs/plans/2026-03-03-frontend-redesign-design.md`

---

### Task 1: Install Dependencies & Update Fonts

**Files:**
- Modify: `packages/client/package.json`
- Modify: `packages/client/src/index.css`

**Step 1: Install lucide-react**

Run: `npm install lucide-react --workspace=packages/client`

**Step 2: Replace index.css with new design tokens and fonts**

Replace the entire contents of `packages/client/src/index.css` with:

```css
@import "tailwindcss";
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

@theme {
  /* Backgrounds */
  --color-bg-page: #FAFBFC;
  --color-bg-card: #FFFFFF;
  --color-bg-table-header: #F8FAFC;
  --color-bg-hover: #F8FAFC;
  --color-bg-area-row: #EEF2FF;

  /* Sidebar */
  --color-sidebar: #0F172A;
  --color-sidebar-hover: #1E293B;
  --color-sidebar-active: #334155;

  /* Text */
  --color-text-primary: #0F172A;
  --color-text-secondary: #64748B;
  --color-text-muted: #94A3B8;

  /* Borders */
  --color-border: #E2E8F0;
  --color-border-emphasis: #CBD5E1;

  /* Accents */
  --color-accent-green: #10B981;
  --color-accent-red: #EF4444;
  --color-accent-amber: #F59E0B;
  --color-accent-indigo: #6366F1;
  --color-accent-indigo-hover: #4F46E5;

  /* Badge backgrounds */
  --color-badge-green-bg: #ECFDF5;
  --color-badge-green-text: #047857;
  --color-badge-red-bg: #FEF2F2;
  --color-badge-red-text: #B91C1C;
  --color-badge-amber-bg: #FFFBEB;
  --color-badge-amber-text: #B45309;

  /* Typography */
  --font-sans: 'DM Sans', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}

body {
  font-family: var(--font-sans);
  background-color: var(--color-bg-page);
  color: var(--color-text-primary);
  margin: 0;
}
```

**Step 3: Verify the dev server starts without errors**

Run: `npm run dev --workspace=packages/client` (check it compiles; Ctrl+C)

**Step 4: Commit**

```bash
git add packages/client/package.json packages/client/src/index.css package-lock.json
git commit -m "feat(ui): install lucide-react and update design tokens to light theme"
```

---

### Task 2: Rewrite Layout with Sidebar Navigation

**Files:**
- Rewrite: `packages/client/src/components/Layout.tsx`

**Step 1: Rewrite Layout.tsx**

Replace the entire file. Key requirements:
- Import icons from `lucide-react`: `LayoutDashboard`, `Package`, `ClipboardCheck`, `Activity`, `PanelLeftClose`, `PanelLeftOpen`, `Menu`, `X`
- `useState` for `sidebarCollapsed` (default false) and `mobileOpen` (default false)
- Sidebar: fixed left, 240px wide (64px when collapsed), slate-900 background
  - Top: "FIFOFLOW" wordmark in indigo, hidden when collapsed
  - Nav items array: `[{ to: '/', label: 'Dashboard', icon: LayoutDashboard }, { to: '/inventory', label: 'Inventory', icon: Package }, { to: '/counts', label: 'Counts', icon: ClipboardCheck }, { to: '/activity', label: 'Activity', icon: Activity }]`
  - Each nav item uses `NavLink` from react-router-dom with active styling: `bg-sidebar-active border-l-[3px] border-accent-indigo text-white` vs `text-text-muted hover:bg-sidebar-hover hover:text-white`
  - Icon size: 20px. Label hidden when collapsed.
  - Bottom: collapse toggle button with `PanelLeftClose`/`PanelLeftOpen` icon
- Mobile: hamburger `Menu` icon in a 56px top bar (shown only below `lg` breakpoint). Sidebar becomes overlay with backdrop.
- Content area: `ml-[240px]` (or `ml-16` when collapsed), `lg:` responsive
  - Top breadcrumb bar: 56px, white bg, border-bottom. Uses `useLocation` + `useParams` for breadcrumb trail. Right side: empty (page actions live in pages themselves now via a portal or just positioned).
  - Main content: `<Outlet />` with `p-6 bg-bg-page min-h-screen`

**Step 2: Verify navigation works on all routes**

Run dev server, click through Dashboard, Inventory, Counts, Activity. Confirm sidebar highlights active route. Test collapse toggle.

**Step 3: Commit**

```bash
git add packages/client/src/components/Layout.tsx
git commit -m "feat(ui): rewrite layout with persistent sidebar navigation"
```

---

### Task 3: Restyle Dashboard Page

**Files:**
- Modify: `packages/client/src/pages/Dashboard.tsx`

**Step 1: Restyle Dashboard.tsx**

Key changes to make:
- `StatCard` component: white bg, rounded-xl, `shadow-sm` (`0 1px 3px rgba(0,0,0,0.08)`), 4px colored left border (`border-l-4`). Label in 12px `text-text-secondary`. Value in 28px `font-mono font-semibold`. Optional trend line below.
- Add 5th KPI card: "Est. Reorder Spend" — import `useReorderSuggestions` from `../hooks/useItems`, sum `estimated_total_cost`, format as currency, amber left border.
- KPI grid: `grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4`
- Recent Activity section: white card container with `rounded-xl shadow-sm p-5`. Rows with subtle bottom border, no card per-row. Use relative time formatting (helper function `timeAgo(dateStr)` — compute diff in seconds, return "Xm ago", "Xh ago", "Xd ago"). Green/red dot (`w-2 h-2 rounded-full inline-block`) before +/- quantity.
- New "Items Needing Reorder" section: white card, table-like rows showing item name (link), current qty, reorder level, REORDER badge. Only show if reorderSuggestions has items.
- All text colors: use `text-text-primary`, `text-text-secondary`, `text-text-muted` (new tokens)
- Remove all old navy/border color references

**Step 2: Verify dashboard renders with all cards and sections**

Run dev server, check `/` route.

**Step 3: Commit**

```bash
git add packages/client/src/pages/Dashboard.tsx
git commit -m "feat(ui): restyle dashboard with light theme KPI cards and reorder summary"
```

---

### Task 4: Restyle Inventory Page — Table Shell & Filters

**Files:**
- Modify: `packages/client/src/pages/Inventory.tsx`

This is the largest file. Split into two tasks: shell/filters first, then column groups.

**Step 1: Restyle the page header, filters, and reorder summary bar**

Key changes:
- Page header: `text-2xl font-semibold text-text-primary`. Action buttons on right use new button styles:
  - "Manage Areas": white bg, `border border-border-emphasis text-text-secondary rounded-lg hover:bg-bg-hover`
  - "+ Add Item": `bg-accent-indigo text-white rounded-lg hover:bg-accent-indigo-hover`
- Filter bar: wrap in a white card (`bg-bg-card rounded-xl shadow-sm p-4`). Search input, selects, and reorder toggle all use new input styling: white bg, `border-border rounded-lg focus:ring-2 focus:ring-accent-indigo focus:border-accent-indigo`.
- Reorder toggle: pill-style — `rounded-full` with `bg-badge-red-bg text-badge-red-text` when active, `border border-border text-text-secondary` when inactive.
- Reorder summary bar: inside the table card, subtle bg-bg-page strip with item count + estimated spend.

**Step 2: Restyle the InlineEdit component**

- Display state: `hover:bg-bg-hover rounded-lg` instead of `hover:border-border`. Text uses `text-text-primary`.
- Edit state: white bg, `border-accent-indigo ring-2 ring-accent-indigo/20` instead of green border.

**Step 3: Restyle the InlineInsidePrice component**

Same pattern as InlineEdit — update all color classes.

**Step 4: Restyle ReorderBadge**

- OK: `bg-badge-green-bg text-badge-green-text rounded-md`
- REORDER: `bg-badge-red-bg text-badge-red-text rounded-md`

**Step 5: Verify filters, inline editing, badges all work**

**Step 6: Commit**

```bash
git add packages/client/src/pages/Inventory.tsx
git commit -m "feat(ui): restyle inventory page header, filters, inline editors, and badges"
```

---

### Task 5: Inventory Page — Column Groups

**Files:**
- Modify: `packages/client/src/pages/Inventory.tsx`

**Step 1: Add column group state and header rendering**

Add state: `const [showOrdering, setShowOrdering] = useState(false);` and `const [showPricing, setShowPricing] = useState(false);`

Restructure the `<thead>` to have two header rows:
- Row 1 (group headers): `STOCK` spanning Name through Reorder Status (6 cols), `ORDERING ▸` button spanning ordering cols (collapsed = 1 col with just the toggle, expanded = 5 cols), `PRICING ▸` button spanning pricing cols (collapsed = 1 col, expanded = 4 cols). Style: `text-[11px] uppercase tracking-wider text-text-muted bg-bg-page border-b border-border`.
- Row 2 (column headers): individual column names. Only render ordering/pricing column headers when their group is expanded.

Group toggle buttons: `cursor-pointer hover:text-text-primary` with chevron rotation (▸ collapsed, ▾ expanded).

**Step 2: Conditionally render table body cells**

For each `<tr>`, only render the ordering cells (Order Unit, Pack Qty, Inner Unit, Size Value, Size Unit) when `showOrdering` is true. Only render pricing cells (Order Price, Inside Price, Order Qty, Total Cost) when `showPricing` is true.

When a group is collapsed, render a single empty `<td>` as placeholder to maintain column alignment.

**Step 3: Restyle table container and rows**

- Table card: `bg-bg-card rounded-xl shadow-sm overflow-hidden`
- Header row: `bg-bg-table-header`
- Body rows: white bg, `border-b border-border hover:bg-bg-hover transition-colors`
- Expanded area rows: `bg-bg-area-row`
- Footer row: `bg-bg-page px-4 py-3 text-sm text-text-secondary` with item count and reorder spend

**Step 4: Verify column groups expand/collapse correctly**

Test: click ORDERING header to expand, verify 5 cols appear. Collapse. Same for PRICING.

**Step 5: Commit**

```bash
git add packages/client/src/pages/Inventory.tsx
git commit -m "feat(ui): add collapsible column groups to inventory table"
```

---

### Task 6: Restyle Item Detail Page

**Files:**
- Modify: `packages/client/src/pages/ItemDetail.tsx`

**Step 1: Restyle the page layout**

Key changes:
- Back link: `text-text-secondary hover:text-accent-indigo` with `←` arrow
- Item header card: white bg, rounded-xl, shadow-sm, p-6
  - Two-column layout at `md:` breakpoint: item info left (`md:w-2/3`), stock-by-area right (`md:w-1/3`)
  - Item name: `text-2xl font-semibold`
  - Category + unit: `text-text-secondary text-sm`
  - Reorder badges: use new badge-green/badge-red tokens
  - Details grid: `grid-cols-2 sm:grid-cols-3` with label (`text-xs text-text-muted`) above value (`text-sm text-text-primary`)
  - Stock-by-area: inside a `bg-bg-page rounded-lg p-4` sub-section within the card. Area name left, quantity right with `font-mono` styling.
- Edit/Delete buttons: Edit = secondary button style, Delete = ghost danger style (`text-accent-red hover:bg-badge-red-bg`)
- Edit mode: keep inline (not modal for now to reduce scope), restyle inputs with new tokens

**Step 2: Restyle transaction form and cycle count sections**

- Side-by-side layout at `md:` breakpoint: `grid md:grid-cols-2 gap-4`
- Each in a white card with rounded-xl, shadow-sm, p-5
- Section titles: `text-base font-semibold text-text-primary mb-4`
- Input styling: white bg, border-border, rounded-lg, focus:ring-accent-indigo
- IN/OUT toggle: indigo active state for IN, red for OUT (pill-style buttons)
- Log button: `bg-accent-indigo text-white rounded-lg`
- Apply Count button: `bg-accent-amber text-white rounded-lg`

**Step 3: Restyle transaction history**

- White card container, rounded-xl, shadow-sm
- Clean table rows (not individual cards per transaction)
- Green/red dot + quantity, muted reason text, right-aligned relative timestamp

**Step 4: Verify all interactions: edit mode, log transaction, cycle count**

**Step 5: Commit**

```bash
git add packages/client/src/pages/ItemDetail.tsx
git commit -m "feat(ui): restyle item detail page with two-column layout"
```

---

### Task 7: Restyle Modals (AddItemModal & ManageAreasModal)

**Files:**
- Modify: `packages/client/src/components/AddItemModal.tsx`
- Modify: `packages/client/src/components/ManageAreasModal.tsx`

**Step 1: Restyle AddItemModal**

- Backdrop: `bg-black/50 backdrop-blur-sm`
- Modal: `bg-bg-card rounded-2xl shadow-xl p-6 w-full max-w-md`
- Title: `text-lg font-semibold text-text-primary`
- Add a close X button in header (import `X` from lucide-react)
- All inputs: white bg, border-border, rounded-lg, focus:ring-2 focus:ring-accent-indigo
- Labels: `text-xs font-medium text-text-secondary`
- Packaging section border: `border border-border rounded-lg p-4` with section label
- Cancel button: ghost style. Submit button: `bg-accent-indigo text-white rounded-lg`

**Step 2: Restyle ManageAreasModal**

- Same backdrop and modal container styling
- Add X close button in header
- Area list items: white bg, `border border-border rounded-lg px-4 py-3`
- Edit/Delete buttons: ghost styles with appropriate colors
- New area input: same input styling
- Add button: `bg-accent-indigo text-white rounded-lg`

**Step 3: Verify both modals open, function, and close correctly**

**Step 4: Commit**

```bash
git add packages/client/src/components/AddItemModal.tsx packages/client/src/components/ManageAreasModal.tsx
git commit -m "feat(ui): restyle add-item and manage-areas modals"
```

---

### Task 8: Restyle TransactionForm Component

**Files:**
- Modify: `packages/client/src/components/TransactionForm.tsx`

**Step 1: Restyle TransactionForm**

Key changes:
- Card styling applied by parent (ItemDetail), so just restyle internals
- IN/OUT toggle: rounded-lg overflow-hidden, IN active = `bg-accent-green/10 text-accent-green font-medium`, OUT active = `bg-accent-red/10 text-accent-red font-medium`, inactive = `text-text-muted hover:text-text-secondary`
- All inputs/selects: white bg, border-border, rounded-lg, focus:ring-accent-indigo
- Area selects: same styling
- Notes input: same styling
- Log button: `bg-accent-indigo text-white rounded-lg hover:bg-accent-indigo-hover`
- Helper text: `text-text-secondary`, error text: `text-accent-red`
- Estimated cost text: `font-mono text-text-primary`

**Step 2: Verify transaction form works on item detail page**

**Step 3: Commit**

```bash
git add packages/client/src/components/TransactionForm.tsx
git commit -m "feat(ui): restyle transaction form with light theme"
```

---

### Task 9: Restyle Activity Page

**Files:**
- Modify: `packages/client/src/pages/Activity.tsx`

**Step 1: Restyle Activity.tsx**

Key changes:
- Page title: `text-2xl font-semibold text-text-primary`
- Filter toggles: pill-style group — `inline-flex rounded-lg border border-border overflow-hidden`. Each button: `px-4 py-2 text-sm`. Active: `bg-accent-indigo text-white`. Inactive: `bg-bg-card text-text-secondary hover:bg-bg-hover`.
- Transaction list: white card container (`bg-bg-card rounded-xl shadow-sm`)
- Each row: `px-5 py-3 border-b border-border hover:bg-bg-hover flex items-center justify-between`
- Left side: small colored dot (`w-2 h-2 rounded-full bg-accent-green` or `bg-accent-red`) + quantity in `font-mono font-medium` + item name link (`text-accent-indigo hover:underline`) + reason in `text-text-secondary`
- Right side: relative timestamp (`timeAgo` helper) in `text-text-muted text-xs`, full timestamp via `title` attribute on hover

**Step 2: Add a `timeAgo` utility**

Create a small helper function inside the file (not a separate file):
```typescript
function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

**Step 3: Verify filter toggles and transaction list render**

**Step 4: Commit**

```bash
git add packages/client/src/pages/Activity.tsx
git commit -m "feat(ui): restyle activity page with pill toggles and relative timestamps"
```

---

### Task 10: Restyle Counts Page

**Files:**
- Modify: `packages/client/src/pages/Counts.tsx`

**Step 1: Restyle Counts.tsx**

Key changes:
- Page title: `text-2xl font-semibold text-text-primary`
- All section cards: `bg-bg-card rounded-xl shadow-sm p-5`
- Section titles: `text-base font-semibold text-text-primary mb-4`
- "Open New Session" form: inputs with new styling, submit button `bg-accent-indigo text-white rounded-lg`
- Active session banner: white card with `border-l-4 border-accent-green`. Session name prominent, progress section right-aligned.
- Progress bar: `bg-border rounded-full h-2.5` track, `bg-accent-green rounded-full` fill
- Record entry form: same input styling, "Add Count" button `bg-accent-amber text-white rounded-lg`
- Status badges: COUNTED = `bg-badge-green-bg text-badge-green-text rounded-md`, PENDING = `bg-badge-amber-bg text-badge-amber-text rounded-md`
- Tables (checklist, entries, history): inside white cards with clean borders. Header: `bg-bg-table-header`. Rows: `border-b border-border hover:bg-bg-hover`.
- Close Session: danger section with `bg-accent-red text-white rounded-lg` button
- Force close checkbox: styled with `accent-accent-red`

**Step 2: Verify count session workflow: create, record entries, close**

**Step 3: Commit**

```bash
git add packages/client/src/pages/Counts.tsx
git commit -m "feat(ui): restyle counts page with light theme cards and progress bar"
```

---

### Task 11: Final Visual QA Pass

**Files:**
- Potentially any file from Tasks 1-10

**Step 1: Run dev server and check every page**

Checklist:
- [ ] Sidebar navigation highlights correctly on each route
- [ ] Sidebar collapse/expand works
- [ ] Dashboard: all 5 KPI cards render, recent activity shows, reorder section shows
- [ ] Inventory: filters work, column groups expand/collapse, inline edit works, area rows expand
- [ ] Item Detail: two-column layout, edit mode, transaction form, cycle count, transaction history
- [ ] Counts: create session, record entry, checklist, close session
- [ ] Activity: filter toggles, relative timestamps, item links
- [ ] AddItemModal: opens, form works, closes
- [ ] ManageAreasModal: opens, CRUD works, closes
- [ ] No remaining navy/dark theme color classes anywhere

**Step 2: Search for any leftover old color tokens**

Run: `grep -r "bg-navy\|text-accent-green\|border-border\b" packages/client/src/ --include="*.tsx"` — verify no old-token references remain (note: `border-border` is intentionally kept as it maps to the new `--color-border` token, but `bg-navy`, `text-accent-green` etc. should be gone).

**Step 3: Commit any fixes**

```bash
git add -A packages/client/src/
git commit -m "fix(ui): final visual QA cleanup for frontend redesign"
```
