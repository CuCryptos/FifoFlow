import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useItem, useUpdateItem, useDeleteItem } from '../hooks/useItems';
import { CATEGORIES, UNITS } from '@fifoflow/shared';
import type { Category, Unit } from '@fifoflow/shared';
import { TransactionForm } from '../components/TransactionForm';

export function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useItem(Number(id));
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<Category>(CATEGORIES[0]);
  const [editUnit, setEditUnit] = useState<Unit>(UNITS[0]);

  if (isLoading) return <div className="text-text-secondary">Loading...</div>;
  if (!data) return <div className="text-accent-red">Item not found.</div>;

  const { item, transactions } = data;

  const startEdit = () => {
    setEditName(item.name);
    setEditCategory(item.category);
    setEditUnit(item.unit);
    setEditing(true);
  };

  const saveEdit = () => {
    updateItem.mutate(
      { id: item.id, data: { name: editName, category: editCategory, unit: editUnit } },
      { onSuccess: () => setEditing(false) }
    );
  };

  const handleDelete = () => {
    if (confirm('Delete this item? This cannot be undone.')) {
      deleteItem.mutate(item.id, { onSuccess: () => navigate('/inventory') });
    }
  };

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/inventory')} className="text-text-secondary text-sm hover:text-text-primary">
        ← Back to Inventory
      </button>

      {/* Item header */}
      <div className="bg-navy-light border border-border rounded-lg p-6">
        {editing ? (
          <div className="space-y-3">
            <input value={editName} onChange={(e) => setEditName(e.target.value)}
              className="bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary w-full focus:outline-none focus:border-accent-green" />
            <div className="flex gap-3">
              <select value={editCategory} onChange={(e) => setEditCategory(e.target.value as Category)}
                className="bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select value={editUnit} onChange={(e) => setEditUnit(e.target.value as Unit)}
                className="bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green">
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={saveEdit} className="bg-accent-green text-navy px-3 py-1.5 rounded text-sm font-medium">Save</button>
              <button onClick={() => setEditing(false)} className="text-text-secondary text-sm px-3 py-1.5">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold">{item.name}</h1>
              <div className="flex gap-4 mt-2 text-sm text-text-secondary">
                <span>{item.category}</span>
                <span>{item.current_qty} {item.unit}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={startEdit} className="text-text-secondary text-sm hover:text-text-primary px-3 py-1.5 border border-border rounded">Edit</button>
              <button onClick={handleDelete} className="text-accent-red text-sm hover:opacity-80 px-3 py-1.5 border border-border rounded">Delete</button>
            </div>
          </div>
        )}
      </div>

      {/* Log transaction */}
      <TransactionForm itemId={item.id} />

      {/* Transaction history */}
      <div>
        <h2 className="text-sm font-medium text-text-secondary mb-3">Transaction History</h2>
        {transactions.length > 0 ? (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="bg-navy-light border border-border rounded px-4 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className={tx.type === 'in' ? 'text-accent-green' : 'text-accent-red'}>
                    {tx.type === 'in' ? '+' : '-'}{tx.quantity}
                  </span>
                  <span className="text-text-secondary">{tx.reason}</span>
                  {tx.notes && <span className="text-text-secondary italic">— {tx.notes}</span>}
                </div>
                <span className="text-text-secondary text-xs">{new Date(tx.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-text-secondary text-sm">No transactions yet.</div>
        )}
      </div>
    </div>
  );
}
