# Frontend Redesign Design

Full visual overhaul of FifoFlow from dark monospace terminal aesthetic to clean light-mode SaaS professional UI with persistent sidebar navigation and smart column grouping.

## Design Tokens

### Typography
- **Display/Headings**: DM Sans (600/700 weight)
- **Body text**: DM Sans (400/500)
- **Data/Numbers**: JetBrains Mono (400/500)
- **Scale**: H1 1.875rem, H2 1.5rem, H3 1.25rem, Body 0.875rem (14px base)

### Color Palette

| Token | Value | Usage |
|---|---|---|
| bg-page | #FAFBFC | Content area background |
| bg-card | #FFFFFF | Card surfaces |
| sidebar | #0F172A | Sidebar background (slate-900) |
| sidebar-hover | #1E293B | Sidebar hover state (slate-800) |
| sidebar-active | #334155 | Sidebar active state (slate-700) |
| text-primary | #0F172A | Headings, body text |
| text-secondary | #64748B | Labels, muted text |
| text-muted | #94A3B8 | Placeholder, disabled |
| border | #E2E8F0 | Default borders |
| border-emphasis | #CBD5E1 | Stronger borders |
| accent-green | #10B981 | Success, stock OK, IN (emerald-500) |
| accent-red | #EF4444 | Alerts, REORDER, OUT (red-500) |
| accent-amber | #F59E0B | Warnings, low stock, counts (amber-500) |
| accent-indigo | #6366F1 | Primary actions, links (indigo-500) |
| accent-indigo-hover | #4F46E5 | Primary hover (indigo-600) |

### Spacing & Radius
- **Base grid**: 4px
- **Content padding**: 24px
- **Card padding**: 20px
- **Table cells**: 12px horizontal, 10px vertical
- **Card radius**: 12px
- **Button/input radius**: 8px
- **Badge radius**: 6px

## Layout

### Shell Structure

```
┌──────────┬─────────────────────────────────────────┐
│          │  Breadcrumb bar (56px)                   │
│  Sidebar ├─────────────────────────────────────────┤
│  (240px) │                                         │
│          │  Page Content (#FAFBFC)                  │
│          │  padding: 24px                           │
│          │                                         │
└──────────┴─────────────────────────────────────────┘
```

### Sidebar (240px, collapsible to 64px)
- **Top**: FifoFlow wordmark in indigo on slate-900 background
- **Nav items** with Lucide icons + text labels:
  - Dashboard (LayoutDashboard)
  - Inventory (Package)
  - Counts (ClipboardCheck)
  - Activity (Activity)
- **Divider**, then future placeholders (Vendors, Reports, Settings)
- **Bottom**: collapse toggle (PanelLeftClose / PanelLeftOpen)
- **Active state**: slate-700 bg + 3px indigo left border
- **Hover**: slate-800 bg
- **Mobile**: overlay drawer from left, triggered by hamburger in 56px top bar

### Breadcrumb Bar
- Height: 56px, white bg, bottom border #E2E8F0
- Left: breadcrumb trail (e.g., Inventory > Absolut Vodka)
- Right: page-level action buttons (+ Add Item, Manage Areas, etc.)

## Components

### KPI Cards
- White card, 12px radius, shadow `0 1px 3px rgba(0,0,0,0.08)`
- Muted label (12px) top, large metric (28px JetBrains Mono 600) center
- Optional trend indicator (green/red small text + arrow) bottom
- 4px colored left border matching semantic meaning (green/red/amber/indigo)

### Data Tables
- White card container, 12px radius
- **Column group headers**: thin row above main header with group labels ("STOCK", "ORDERING", "PRICING") in 11px muted text. Each group collapsible via chevron.
- **Default visible columns**: Name, Category, In Stock, Unit, Reorder Level, Reorder Status
- **Collapsed "Ordering" group**: Order Unit, Pack Qty, Inner Unit, Size Value, Size Unit
- **Collapsed "Pricing" group**: Order Price, Inside Price, Order Qty, Total Cost
- Header row: #F8FAFC bg, 500 weight, sticky on scroll
- Body rows: white bg, 1px #E2E8F0 border-bottom, hover → #F8FAFC
- Numeric columns right-aligned
- Inline edit: click reveals input with indigo focus ring, saves on blur
- Expandable area rows: #EEF2FF (indigo-50) sub-row background
- Footer: item count left, reorder spend summary right

### Badges
- **OK**: emerald-50 bg, emerald-700 text, 6px radius
- **REORDER**: red-50 bg, red-700 text
- **LOW**: amber-50 bg, amber-700 text
- **PENDING**: amber-50 bg, amber-700 text
- **COUNTED**: emerald-50 bg, emerald-700 text

### Buttons
- **Primary**: indigo-500 bg, white text, 8px radius, hover → indigo-600, subtle shadow
- **Secondary**: white bg, slate-300 border, slate-700 text, hover → slate-50 bg
- **Danger**: red-500 bg, white text, hover → red-600
- **Ghost**: transparent bg, slate-500 text, hover → slate-100 bg

### Inputs & Selects
- White bg, #E2E8F0 border, 8px radius
- Focus: 2px indigo-500 ring, border → indigo-500
- Labels: 12px secondary text, 4px gap above input
- Placeholder: slate-400

### Modals
- Centered, max-width 480px (small) or 640px (medium)
- White bg, 16px radius, shadow-xl
- Backdrop: black/50 + backdrop-blur-sm
- Header: title + close X. Footer: right-aligned action buttons.

### Toast Notifications
- Fixed bottom-right, 12px radius, shadow-lg
- Slide-in from right, auto-dismiss 3s
- Left color stripe matching type (green/red/amber)
- Icon + message + optional dismiss X

## Page Designs

### Dashboard (`/`)
- 5 KPI cards: Total Items, Low Stock, Out of Stock, Today's Transactions, Est. Reorder Spend
- Responsive grid: 5-across wide, 3+2 medium, stacked mobile
- "Recent Activity" card with relative timestamps ("2m ago")
- "Items Needing Reorder" summary card with links to items

### Inventory (`/inventory`)
- Filter bar: search input + Category dropdown + Area dropdown + Reorder toggle
- Table with collapsible column groups (Stock default visible, Ordering/Pricing collapsed)
- Expandable per-area rows with indigo-50 background
- Footer row: item count + reorder spend

### Item Detail (`/inventory/:id`)
- Two-column top section: item info (left), stock-by-area table (right)
- Log Transaction and Cycle Count forms side by side below
- Transaction history table at bottom
- Edit mode as modal instead of inline replacement

### Counts (`/counts`)
- Status banner when session active (green border, name + progress)
- Segmented progress bar with percentage label
- Session checklist and entries tables with updated styling
- "Open Session" card prominent when no active session

### Activity (`/activity`)
- Pill-style toggle group for All / IN / OUT filters
- Relative timestamps with full timestamp on hover
- Small colored dot (green/red) per row instead of just colored text

## Technical Notes

### Dependencies
- Google Fonts: DM Sans (400–700), JetBrains Mono (400–500)
- Lucide React: icon library for sidebar and UI icons
- Tailwind CSS v4: update theme tokens in index.css

### Migration Strategy
- Replace all Tailwind color/theme tokens in index.css
- Build Layout component with sidebar first
- Restyle pages one at a time, reusing shared component patterns
- No new shared component library — keep inline Tailwind patterns consistent across pages
