import { useState } from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { Link } from 'react-router-dom';

export function Activity() {
  const [typeFilter, setTypeFilter] = useState<string>('');
  const { data: transactions, isLoading } = useTransactions({
    type: typeFilter || undefined,
    limit: 100,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Activity Log</h1>
        <div className="flex gap-2">
          {['', 'in', 'out'].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                typeFilter === t
                  ? 'bg-navy-lighter text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t === '' ? 'All' : t === 'in' ? 'IN' : 'OUT'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-text-secondary text-sm">Loading...</div>
      ) : transactions && transactions.length > 0 ? (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <div key={tx.id} className="bg-navy-light border border-border rounded px-4 py-3 flex items-center justify-between text-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`font-medium ${tx.type === 'in' ? 'text-accent-green' : 'text-accent-red'}`}>
                  {tx.type === 'in' ? '+' : '-'}{tx.quantity} {tx.item_unit}
                </span>
                <Link to={`/inventory/${tx.item_id}`} className="text-accent-green hover:underline">
                  {tx.item_name}
                </Link>
                <span className="text-text-secondary">{tx.reason}</span>
                {tx.notes && <span className="text-text-secondary italic">— {tx.notes}</span>}
              </div>
              <span className="text-text-secondary text-xs whitespace-nowrap ml-4">
                {new Date(tx.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-text-secondary text-sm">No transactions found.</div>
      )}
    </div>
  );
}
