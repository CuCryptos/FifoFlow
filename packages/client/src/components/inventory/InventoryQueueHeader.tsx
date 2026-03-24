export function InventoryQueueHeader({
  showingStart,
  showingEnd,
  totalCount,
  currentLaneTitle,
  selectedCount,
  visibleSelectionCount,
  allVisibleSelected,
  onToggleVisibleSelection,
  onClearSelection,
}: {
  showingStart: number;
  showingEnd: number;
  totalCount: number;
  currentLaneTitle: string;
  selectedCount: number;
  visibleSelectionCount: number;
  allVisibleSelected: boolean;
  onToggleVisibleSelection: () => void;
  onClearSelection: () => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto]">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Queue view</div>
        <div className="mt-2 text-sm font-medium text-slate-900">
          Showing {showingStart}–{showingEnd} of {totalCount} items
        </div>
        <div className="mt-1 text-sm text-slate-600">
          Page view in the {currentLaneTitle.toLowerCase()} lane.
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Selection pressure</div>
        <div className="mt-2 text-sm font-medium text-slate-900">
          {selectedCount > 0 ? `${selectedCount} selected` : 'No items selected'}
        </div>
        <div className="mt-1 text-sm text-slate-600">
          {visibleSelectionCount > 0
            ? `${visibleSelectionCount} visible selections ready for batch actions.`
            : 'Select visible items or cherry-pick rows for bulk edits.'}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
        <button
          type="button"
          onClick={onToggleVisibleSelection}
          className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
        >
          {allVisibleSelected ? 'Unselect visible' : 'Select visible'}
        </button>
        <button
          type="button"
          onClick={onClearSelection}
          disabled={selectedCount === 0}
          className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:opacity-40"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}
