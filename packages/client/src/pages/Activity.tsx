import { useState } from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { Link } from 'react-router-dom';
import { useVenueContext } from '../contexts/VenueContext';
import {
  WorkflowChip,
  WorkflowFocusBar,
  WorkflowPage,
  WorkflowPanel,
} from '../components/workflow/WorkflowPrimitives';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Activity() {
  const { selectedVenueId } = useVenueContext();
  const [typeFilter, setTypeFilter] = useState<string>('');
  const { data: transactions, isLoading } = useTransactions({
    type: typeFilter || undefined,
    limit: 100,
    venue_id: selectedVenueId ?? undefined,
  });

  return (
    <WorkflowPage
      eyebrow="Movement Log"
      title="Trace inventory movement with a cleaner operating log."
      description="This page remains transaction-first, but it now uses the same workflow shell as the rest of the operator surface."
    >
      <WorkflowPanel
        title="Activity Log"
        description="Recent inventory movement, filtered by direction."
        actions={(
          <WorkflowFocusBar>
          {['', 'in', 'out'].map((t) => (
            <WorkflowChip
              key={t}
              active={typeFilter === t}
              onClick={() => setTypeFilter(t)}
            >
              {t === '' ? 'All' : t === 'in' ? 'IN' : 'OUT'}
            </WorkflowChip>
          ))}
          </WorkflowFocusBar>
        )}
      >

      {isLoading ? (
        <div className="text-text-secondary text-sm">Loading...</div>
      ) : transactions && transactions.length > 0 ? (
        <div className="bg-bg-card rounded-xl shadow-sm">
          {transactions.map((tx) => (
            <div key={tx.id} className="px-5 py-3 border-b border-border last:border-0 hover:bg-bg-hover transition-colors flex items-center justify-between text-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`w-2 h-2 rounded-full shrink-0 ${tx.type === 'in' ? 'bg-accent-green' : 'bg-accent-red'}`} />
                <span className={`font-mono font-medium ${tx.type === 'in' ? 'text-accent-green' : 'text-accent-red'}`}>
                  {tx.type === 'in' ? '+' : '-'}{tx.quantity} {tx.item_unit}
                </span>
                <Link to={`/inventory/${tx.item_id}`} className="text-accent-indigo hover:underline">
                  {tx.item_name}
                </Link>
                <span className="text-text-secondary">{tx.reason}</span>
                {tx.notes && <span className="text-text-muted italic">— {tx.notes}</span>}
              </div>
              <span className="text-text-muted text-xs whitespace-nowrap ml-4" title={new Date(tx.created_at).toLocaleString()}>
                {timeAgo(tx.created_at)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-text-secondary text-sm">No transactions found.</div>
      )}
      </WorkflowPanel>
    </WorkflowPage>
  );
}
