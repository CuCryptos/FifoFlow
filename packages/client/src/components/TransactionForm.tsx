import { useState } from 'react';
import { useCreateTransaction } from '../hooks/useTransactions';
import { TRANSACTION_TYPES, TRANSACTION_REASONS } from '@fifoflow/shared';
import type { TransactionType, TransactionReason } from '@fifoflow/shared';

export function TransactionForm({ itemId }: { itemId: number }) {
  const [type, setType] = useState<TransactionType>('in');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<TransactionReason>('Received');
  const [notes, setNotes] = useState('');
  const createTx = useCreateTransaction();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTx.mutate(
      { itemId, data: { type, quantity: Number(quantity), reason, notes: notes || null } },
      {
        onSuccess: () => {
          setQuantity('');
          setNotes('');
        },
      }
    );
  };

  return (
    <div className="bg-navy-light border border-border rounded-lg p-4">
      <h2 className="text-sm font-medium text-text-secondary mb-3">Log Transaction</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
        <div className="flex rounded overflow-hidden border border-border">
          {TRANSACTION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                type === t
                  ? t === 'in' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <input
          type="number"
          step="any"
          min="0.01"
          placeholder="Qty"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
          className="w-24 bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
        />
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as TransactionReason)}
          className="bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
        >
          {TRANSACTION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input
          type="text"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="flex-1 min-w-32 bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent-green"
        />
        <button
          type="submit"
          disabled={createTx.isPending}
          className="bg-accent-green text-navy px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {createTx.isPending ? 'Logging...' : 'Log'}
        </button>
      </form>
      {createTx.error && (
        <div className="text-accent-red text-xs mt-2">{createTx.error.message}</div>
      )}
    </div>
  );
}
