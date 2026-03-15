# Inventory Management UI System

This defines reusable UI components for both public site and logged-in dashboard.

---

## DESIGN TOKENS

### Typography
- H1: 2.5rem
- H2: 2rem
- H3: 1.5rem
- Body: 1rem–1.125rem
- Line height: 1.5–1.6

Primary font:
Modern sans serif (Inter, Manrope, or similar)

---

### Color System

Primary:
- Deep Navy or Charcoal

Accent:
- Blue (primary actions)
- Green (success)
- Amber (warning)
- Red (critical)

Neutral:
- Light gray backgrounds
- Mid-gray borders

Rules:
Colors must convey meaning.
No decorative color usage.

---

## CORE COMPONENTS

### 1. Hero Section (Public Website)
- Headline
- Subheadline
- Primary CTA
- Optional product screenshot

---

### 2. Feature Card
- Icon
- Title
- 1–2 sentence description

Used in:
Features page
Homepage
Solutions page

---

### 3. KPI Card (Dashboard)

Structure:
- Label
- Large metric
- Status indicator
- Optional trend arrow

Example:
Low Stock Items: 12 (Amber)
Open Orders: 5 (Neutral)
Critical Alerts: 2 (Red)

---

### 4. Sidebar Navigation

- Persistent vertical layout
- Icons + text
- Active state highlighted
- Collapsible for mobile

---

### 5. Data Table Component

Features:
- Sticky header
- Sortable columns
- Search input
- Filter dropdown
- Bulk select checkbox
- Pagination controls

---

### 6. Alert Banner

Types:
- Success
- Warning
- Critical
- Info

Dismissible.
Short message.
Optional action button.

---

### 7. Modal System

Used for:
- Add inventory item
- Edit supplier
- Confirm deletion
- Reorder prompt

Must:
- Darken background
- Close via X or ESC
- Prevent accidental loss

---

### 8. Chart Module

Use:
- Bar chart
- Line chart
- Pie chart (limited use)

Guidelines:
- Minimal colors
- Clear legend
- Tooltip hover

---

### 9. Pricing Section (Public Site)

- Tier cards
- Clear feature breakdown
- Highlight recommended plan
- CTA under each tier

---

### 10. CTA Banner

- Strong message
- One primary button
- Secondary link optional

Used at:
Bottom of homepage
Bottom of feature pages

---

## ACCESSIBILITY

- 4.5:1 contrast ratio
- Keyboard navigable
- ARIA roles for nav + modals
- Visible focus states

---

## FUTURE EXPANSION

Components should support:
- Multi-location management
- Role-based permissions UI
- Advanced reporting dashboards
- Integrations section

---

## FINAL PRINCIPLE

Design must reduce friction.

Every screen should answer:
"What does the user need right now?"

Remove everything else.