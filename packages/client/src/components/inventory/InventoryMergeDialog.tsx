import type { Item } from '@fifoflow/shared';

export function InventoryMergeDialog({
  items,
  mergeTargetId,
  onMergeTargetChange,
  onCancel,
  onConfirm,
  isPending,
}: {
  items: Item[];
  mergeTargetId: number | null;
  onMergeTargetChange: (value: number | null) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-xl bg-bg-card p-6 shadow-xl">
        <h3 className="mb-2 text-lg font-semibold text-text-primary">Merge Items</h3>
        <p className="mb-4 text-sm text-text-secondary">
          Select the target (canonical) item. All other items will be merged into it.
        </p>
        <div className="mb-4 max-h-60 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <label
              key={item.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors ${
                mergeTargetId === item.id
                  ? 'border-accent-indigo/30 bg-accent-indigo/10'
                  : 'border-transparent hover:bg-bg-hover'
              }`}
            >
              <input
                type="radio"
                name="merge-target"
                checked={mergeTargetId === item.id}
                onChange={() => onMergeTargetChange(item.id)}
                className="text-accent-indigo focus:ring-accent-indigo/20"
              />
              <div>
                <div className="text-sm font-medium text-text-primary">{item.name}</div>
                <div className="text-xs text-text-muted">{item.category} · {item.current_qty} {item.unit}</div>
              </div>
            </label>
          ))}
        </div>
        {mergeTargetId && (
          <p className="mb-4 rounded bg-bg-page p-2 text-xs text-text-muted">
            Merge {items.length - 1} item{items.length - 1 !== 1 ? 's' : ''} into{' '}
            <strong>{items.find((item) => item.id === mergeTargetId)?.name}</strong>. Transaction history, vendor prices,
            and storage quantities will be consolidated.
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-hover"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!mergeTargetId || isPending}
            className="rounded-lg bg-accent-indigo px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-indigo-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? 'Merging...' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  );
}
