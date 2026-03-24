function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [];
  if (current <= 3) {
    pages.push(1, 2, 3, 4, '...', total);
  } else if (current >= total - 2) {
    pages.push(1, '...', total - 3, total - 2, total - 1, total);
  } else {
    pages.push(1, '...', current - 1, current, current + 1, '...', total);
  }
  return pages;
}

export function InventoryPagination({
  currentPage,
  totalPages,
  showingStart,
  showingEnd,
  totalCount,
  onPrevious,
  onNext,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  showingStart: number;
  showingEnd: number;
  totalCount: number;
  onPrevious: () => void;
  onNext: () => void;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-medium text-slate-900">
            Showing {showingStart}–{showingEnd} of {totalCount} items
          </div>
          <div className="text-sm text-slate-600">
            Page {currentPage} of {Math.max(totalPages, 1)}. Bulk actions only apply to the visible selected cards.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onPrevious}
            disabled={currentPage === 1}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:opacity-40 disabled:hover:border-slate-300"
          >
            Previous
          </button>
          {getPageNumbers(currentPage, totalPages).map((pageNumber, index) => (
            pageNumber === '...' ? (
              <span key={`ellipsis-${index}`} className="px-1 text-sm text-slate-400">…</span>
            ) : (
              <button
                key={pageNumber}
                onClick={() => onPageChange(pageNumber)}
                className={pageNumber === currentPage
                  ? 'rounded-full bg-slate-950 px-3 py-1.5 text-sm font-semibold text-white'
                  : 'rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950'}
              >
                {pageNumber}
              </button>
            )
          ))}
          <button
            onClick={onNext}
            disabled={currentPage === totalPages}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:opacity-40 disabled:hover:border-slate-300"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
