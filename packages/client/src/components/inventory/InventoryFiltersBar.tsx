import { CATEGORIES } from '@fifoflow/shared';
import type { InventoryWorkflowFocus, InventorySortField as SortField } from '../../hooks/useInventoryWorkflow';
import { WorkflowChip, WorkflowFocusBar, WorkflowPanel } from '../workflow/WorkflowPrimitives';
import { INVENTORY_FOCUS_COPY } from './InventoryLaneCard';

const SORT_FIELD_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'category', label: 'Category' },
  { value: 'vendor_id', label: 'Vendor' },
  { value: 'venue_id', label: 'Venue' },
  { value: 'reorder_level', label: 'Reorder level' },
  { value: 'reorder_qty', label: 'Reorder quantity' },
  { value: 'storage_area_id', label: 'Storage area' },
  { value: 'updated_at', label: 'Recently updated' },
];

export function InventoryFiltersBar({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  areaFilter,
  onAreaFilterChange,
  areas,
  sortField,
  onSortFieldChange,
  sortDir,
  onToggleSortDir,
  showReorderOnly,
  onToggleShowReorderOnly,
  showOrdering,
  onToggleShowOrdering,
  onResetFilters,
  laneCards,
  workflowFocus,
  onWorkflowFocusChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  areaFilter: string;
  onAreaFilterChange: (value: string) => void;
  areas: Array<{ id: number; name: string }>;
  sortField: SortField;
  onSortFieldChange: (value: SortField) => void;
  sortDir: 'asc' | 'desc';
  onToggleSortDir: () => void;
  showReorderOnly: boolean;
  onToggleShowReorderOnly: () => void;
  showOrdering: boolean;
  onToggleShowOrdering: () => void;
  onResetFilters: () => void;
  laneCards: Array<{ focus: InventoryWorkflowFocus; count: number }>;
  workflowFocus: InventoryWorkflowFocus;
  onWorkflowFocusChange: (focus: InventoryWorkflowFocus) => void;
}) {
  return (
    <WorkflowPanel
      title="Control Rail"
      description="Filter the catalog, choose the lane, then act directly from compact inventory cards instead of a wide table."
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,0.8fr))]">
        <label className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Search</span>
          <input
            type="text"
            placeholder="Find an item or operator keyword"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </label>
        <label className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Category</span>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="w-full bg-transparent text-sm text-slate-900 focus:outline-none"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Area</span>
          <select
            value={areaFilter}
            onChange={(e) => onAreaFilterChange(e.target.value)}
            className="w-full bg-transparent text-sm text-slate-900 focus:outline-none"
          >
            <option value="">All Areas</option>
            {areas.map((area) => (
              <option key={area.id} value={String(area.id)}>{area.name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sort</span>
          <select
            value={sortField}
            onChange={(event) => onSortFieldChange(event.target.value as SortField)}
            className="w-full bg-transparent text-sm text-slate-900 focus:outline-none"
          >
            {SORT_FIELD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={onToggleSortDir}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            {sortDir === 'asc' ? 'Ascending' : 'Descending'}
          </button>
          <WorkflowChip active={showReorderOnly} onClick={onToggleShowReorderOnly}>
            Needs Reorder
          </WorkflowChip>
          <WorkflowChip active={showOrdering} onClick={onToggleShowOrdering}>
            {showOrdering ? 'Hide purchasing detail' : 'Show purchasing detail'}
          </WorkflowChip>
          <button
            type="button"
            onClick={onResetFilters}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mt-5">
        <WorkflowFocusBar>
          {laneCards.map(({ focus, count }) => (
            <WorkflowChip key={focus} active={workflowFocus === focus} onClick={() => onWorkflowFocusChange(focus)}>
              {INVENTORY_FOCUS_COPY[focus].title} ({count})
            </WorkflowChip>
          ))}
        </WorkflowFocusBar>
      </div>
    </WorkflowPanel>
  );
}
