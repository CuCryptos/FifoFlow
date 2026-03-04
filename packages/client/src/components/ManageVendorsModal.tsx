import { useState, useEffect, useRef } from 'react';
import { useVendors, useCreateVendor, useUpdateVendor, useDeleteVendor } from '../hooks/useVendors';
import { useItems } from '../hooks/useItems';
import { X } from 'lucide-react';

export function ManageVendorsModal({ onClose }: { onClose: () => void }) {
  const { data: vendors } = useVendors();
  const { data: items } = useItems();
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const deleteVendor = useDeleteVendor();

  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const vendorsWithItems = new Set(
    (items ?? []).filter((i) => i.vendor_id != null).map((i) => i.vendor_id!),
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
    createVendor.mutate({ name: trimmed, notes: newNotes.trim() || null }, {
      onSuccess: () => { setNewName(''); setNewNotes(''); },
    });
  };

  const handleEditStart = (id: number, name: string, notes: string | null) => {
    setEditingId(id);
    setEditingName(name);
    setEditingNotes(notes ?? '');
  };

  const handleEditSave = () => {
    if (editingId === null) return;
    const vendor = (vendors ?? []).find((v) => v.id === editingId);
    const trimmedName = editingName.trim();
    const trimmedNotes = editingNotes.trim() || null;
    if (!trimmedName || (trimmedName === vendor?.name && trimmedNotes === vendor?.notes)) {
      setEditingId(null);
      return;
    }
    updateVendor.mutate(
      { id: editingId, data: { name: trimmedName, notes: trimmedNotes } },
      { onSuccess: () => setEditingId(null) },
    );
  };

  const handleDelete = (id: number) => {
    if (!window.confirm('Are you sure you want to delete this vendor?')) return;
    deleteVendor.mutate(id);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-bg-card rounded-2xl shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-text-primary">Manage Vendors</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
          {(vendors ?? []).map((vendor) => {
            const hasItems = vendorsWithItems.has(vendor.id);
            const isEditing = editingId === vendor.id;

            return (
              <div key={vendor.id} className="bg-white border border-border rounded-lg px-4 py-3">
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave();
                        if (e.key === 'Escape') { e.stopPropagation(); setEditingId(null); }
                      }}
                      className="w-full bg-white border border-accent-indigo rounded-lg px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
                      placeholder="Vendor name"
                    />
                    <input
                      type="text"
                      value={editingNotes}
                      onChange={(e) => setEditingNotes(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave();
                        if (e.key === 'Escape') { e.stopPropagation(); setEditingId(null); }
                      }}
                      className="w-full bg-white border border-border rounded-lg px-2 py-1 text-sm text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
                      placeholder="Notes (phone, email, etc.)"
                    />
                    <div className="flex justify-end">
                      <button onClick={handleEditSave} className="text-accent-indigo text-xs px-2 py-1">Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-text-primary truncate block">{vendor.name}</span>
                      {vendor.notes && (
                        <span className="text-xs text-text-muted truncate block">{vendor.notes}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleEditStart(vendor.id, vendor.name, vendor.notes)}
                        className="text-text-secondary hover:text-text-primary text-xs px-2 py-1 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(vendor.id)}
                        disabled={hasItems || deleteVendor.isPending}
                        className="text-accent-red hover:bg-badge-red-bg text-xs px-2 py-1 disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded"
                        title={hasItems ? 'Cannot delete vendor with assigned items.' : 'Delete vendor'}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {(vendors ?? []).length === 0 && (
            <div className="text-text-secondary text-sm">No vendors yet.</div>
          )}
        </div>

        {createVendor.error && <div className="text-accent-red text-xs mb-2">{createVendor.error.message}</div>}
        {deleteVendor.error && <div className="text-accent-red text-xs mb-2">{deleteVendor.error.message}</div>}

        <div className="space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="New vendor name..."
            className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="Notes (optional)..."
              className="flex-1 bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-secondary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || createVendor.isPending}
              className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-50 transition-colors"
            >
              {createVendor.isPending ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
