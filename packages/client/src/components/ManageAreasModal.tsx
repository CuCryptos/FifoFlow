import { useState, useEffect, useRef } from 'react';
import {
  useStorageAreas,
  useCreateStorageArea,
  useUpdateStorageArea,
  useDeleteStorageArea,
  useAllItemStorage,
} from '../hooks/useStorageAreas';
import { X } from 'lucide-react';

export function ManageAreasModal({ onClose }: { onClose: () => void }) {
  const { data: areas } = useStorageAreas();
  const { data: allItemStorage } = useAllItemStorage();
  const createArea = useCreateStorageArea();
  const updateArea = useUpdateStorageArea();
  const deleteArea = useDeleteStorageArea();

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  // Build a set of area IDs that have stock
  const areasWithStock = new Set(
    (allItemStorage ?? []).filter((s) => s.quantity > 0).map((s) => s.area_id),
  );

  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createArea.mutate({ name: trimmed }, {
      onSuccess: () => setNewName(''),
    });
  };

  const handleRenameStart = (id: number, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleRenameSave = () => {
    if (editingId === null) return;
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === (areas ?? []).find((a) => a.id === editingId)?.name) {
      setEditingId(null);
      return;
    }
    updateArea.mutate(
      { id: editingId, data: { name: trimmed } },
      { onSuccess: () => setEditingId(null) },
    );
  };

  const handleDelete = (id: number) => {
    if (!window.confirm('Are you sure you want to delete this area?')) return;
    deleteArea.mutate(id);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-bg-card rounded-2xl shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-text-primary">Manage Storage Areas</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Area list */}
        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
          {(areas ?? []).map((area) => {
            const hasStock = areasWithStock.has(area.id);
            const isEditing = editingId === area.id;

            return (
              <div
                key={area.id}
                className="flex items-center gap-2 bg-white border border-border rounded-lg px-4 py-3"
              >
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleRenameSave}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') editInputRef.current?.blur();
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        setEditingId(null);
                      }
                    }}
                    className="flex-1 bg-white border border-accent-indigo rounded-lg px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
                  />
                ) : (
                  <span
                    className="flex-1 text-sm text-text-primary cursor-text truncate"
                    onClick={() => handleRenameStart(area.id, area.name)}
                    title="Click to rename"
                  >
                    {area.name}
                  </span>
                )}

                <div className="flex items-center gap-1 shrink-0">
                  {!isEditing && (
                    <button
                      onClick={() => handleRenameStart(area.id, area.name)}
                      className="text-text-secondary hover:text-text-primary text-xs px-2 py-1 transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(area.id)}
                    disabled={hasStock || deleteArea.isPending}
                    className="text-accent-red hover:bg-badge-red-bg text-xs px-2 py-1 disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded"
                    title={hasStock ? 'Cannot delete area with stock. Move all items first.' : 'Delete area'}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}

          {(areas ?? []).length === 0 && (
            <div className="text-text-secondary text-sm">No storage areas yet.</div>
          )}
        </div>

        {/* Error messages */}
        {createArea.error && (
          <div className="text-accent-red text-xs mb-2">{createArea.error.message}</div>
        )}
        {updateArea.error && (
          <div className="text-accent-red text-xs mb-2">{updateArea.error.message}</div>
        )}
        {deleteArea.error && (
          <div className="text-accent-red text-xs mb-2">{deleteArea.error.message}</div>
        )}

        {/* Add new area */}
        <div className="flex gap-2">
          <input
            ref={newInputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="New area name..."
            className="flex-1 bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || createArea.isPending}
            className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-50 transition-colors"
          >
            {createArea.isPending ? 'Adding...' : 'Add'}
          </button>
        </div>

        {/* Close */}
        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
