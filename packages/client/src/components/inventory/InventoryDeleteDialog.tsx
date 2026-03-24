export function InventoryDeleteDialog({
  selectedCount,
  isPending,
  onCancel,
  onConfirm,
}: {
  selectedCount: number;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-sm rounded-xl bg-bg-card p-6 shadow-xl">
        <h3 className="mb-2 text-lg font-semibold text-text-primary">Confirm Delete</h3>
        <p className="mb-4 text-sm text-text-secondary">
          Delete {selectedCount} selected item{selectedCount > 1 ? 's' : ''}? Items with transaction history will be skipped.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-hover"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-lg bg-accent-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-red/90 disabled:opacity-40"
          >
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
