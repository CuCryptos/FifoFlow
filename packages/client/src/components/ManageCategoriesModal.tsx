import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useCreateItemCategory, useDeleteItemCategory, useItemCategories } from '../hooks/useItems';

export function ManageCategoriesModal({ onClose }: { onClose: () => void }) {
  const { data: categories } = useItemCategories();
  const createCategory = useCreateItemCategory();
  const deleteCategory = useDeleteItemCategory();

  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createCategory.mutate(
      { name: trimmed },
      {
        onSuccess: () => setNewName(''),
      },
    );
  };

  const handleDelete = (id: number, name: string) => {
    if (!window.confirm(`Delete category "${name}"?`)) return;
    deleteCategory.mutate(id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-bg-card p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Manage Categories</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Add custom inventory categories and delete ones that are no longer in use.
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted transition-colors hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 max-h-72 space-y-2 overflow-y-auto">
          {(categories ?? []).map((category) => {
            const hasUsage = category.item_count > 0 || category.count_session_count > 0;
            return (
              <div key={category.id} className="rounded-lg border border-border bg-white px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-text-primary">{category.name}</div>
                    <div className="mt-1 text-xs text-text-muted">
                      {category.item_count} item{category.item_count === 1 ? '' : 's'}
                      {' · '}
                      {category.count_session_count} count template{category.count_session_count === 1 ? '' : 's'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(category.id, category.name)}
                    disabled={hasUsage || deleteCategory.isPending}
                    className="rounded px-2 py-1 text-xs text-accent-red transition-colors hover:bg-badge-red-bg disabled:cursor-not-allowed disabled:opacity-30"
                    title={hasUsage ? 'Reassign items and count templates before deleting this category.' : 'Delete category'}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
          {(categories ?? []).length === 0 && (
            <div className="text-sm text-text-secondary">No categories yet.</div>
          )}
        </div>

        {createCategory.error && <div className="mb-2 text-xs text-accent-red">{createCategory.error.message}</div>}
        {deleteCategory.error && <div className="mb-2 text-xs text-accent-red">{deleteCategory.error.message}</div>}

        <div className="space-y-2">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleCreate();
            }}
            placeholder="New inventory category..."
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-indigo focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
          />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary">
              Close
            </button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || createCategory.isPending}
              className="rounded-lg bg-accent-indigo px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-indigo-hover disabled:opacity-50"
            >
              {createCategory.isPending ? 'Adding...' : 'Add Category'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
