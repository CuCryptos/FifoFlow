import { Link } from 'react-router-dom';
import { useDashboardStats } from '../hooks/useDashboard';
import { useTransactions } from '../hooks/useTransactions';
import { useReorderSuggestions } from '../hooks/useItems';
import { useVenueContext } from '../contexts/VenueContext';
import {
  WorkflowMetricCard,
  WorkflowMetricGrid,
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

export function Dashboard() {
  const { selectedVenueId } = useVenueContext();
  const { data: stats, isLoading: statsLoading } = useDashboardStats(selectedVenueId ?? undefined);
  const { data: recentTx, isLoading: txLoading } = useTransactions({ limit: 10, venue_id: selectedVenueId ?? undefined });
  const { data: reorderSuggestions } = useReorderSuggestions(selectedVenueId ?? undefined);

  const reorderSpend = (reorderSuggestions ?? []).reduce(
    (sum, r) => sum + (r.estimated_total_cost ?? 0),
    0,
  );

  if (statsLoading) return <div className="text-text-secondary">Loading...</div>;

  return (
    <WorkflowPage
      eyebrow="Operations Snapshot"
      title="Use the dashboard as a compact operational snapshot, not the primary control surface."
      description="The memo remains the lead surface. This page is now framed as a quick summary of inventory pressure, recent movement, and reorder exposure."
    >
      <WorkflowMetricGrid>
        <WorkflowMetricCard label="Total Items" value={stats?.total_items ?? 0} detail="Active stocked items in scope." />
        <WorkflowMetricCard label="Low Stock" value={stats?.low_stock_count ?? 0} detail="Below par." tone="amber" />
        <WorkflowMetricCard label="Out of Stock" value={stats?.out_of_stock_count ?? 0} detail="Immediate service risk." tone="red" />
        <WorkflowMetricCard label="Today's Transactions" value={stats?.today_transaction_count ?? 0} detail="Stock movement logged today." tone="green" />
        <WorkflowMetricCard label="Est. Reorder Spend" value={reorderSpend.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} detail="Current reorder queue exposure." tone="amber" />
        <WorkflowMetricCard label="Inventory Value" value={(stats?.total_inventory_value ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} detail="Current book value from stored pricing." tone="green" />
      </WorkflowMetricGrid>

      <WorkflowPanel
        title="Recent Activity"
        description="Most recent inventory movements in the current operating scope."
      >
        <h2 className="text-base font-semibold text-text-primary mb-4">Recent Activity</h2>
        {txLoading ? (
          <div className="text-text-secondary text-sm">Loading...</div>
        ) : recentTx && recentTx.length > 0 ? (
          <div>
            {recentTx.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between py-3 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-3 text-sm">
                  <span
                    className={`w-2 h-2 rounded-full inline-block ${
                      tx.type === 'in' ? 'bg-accent-green' : 'bg-accent-red'
                    }`}
                  />
                  <span className="font-mono font-medium">
                    {tx.type === 'in' ? '+' : '-'}{tx.quantity}
                  </span>
                  {tx.estimated_cost != null && (
                    <span className="text-text-muted text-xs font-mono">
                      ${tx.estimated_cost.toFixed(2)}
                    </span>
                  )}
                  <span className="text-text-primary">{tx.item_name}</span>
                  <span className="text-text-secondary">{tx.reason}</span>
                </div>
                <span
                  className="text-xs text-text-muted"
                  title={new Date(tx.created_at).toLocaleString()}
                >
                  {timeAgo(tx.created_at)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-text-secondary text-sm">No transactions yet.</div>
        )}
      </WorkflowPanel>

      {!!reorderSuggestions?.length && (
        <WorkflowPanel
          title="Items Needing Reorder"
          description="Items below reorder level from the live inventory dataset."
        >
          <h2 className="text-base font-semibold text-text-primary mb-4">
            Items Needing Reorder
          </h2>
          <div>
            {reorderSuggestions.map((item) => (
              <div
                key={item.item_id}
                className="flex items-center justify-between py-3 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-3 text-sm">
                  <Link
                    to={`/inventory/${item.item_id}`}
                    className="text-accent-indigo hover:underline"
                  >
                    {item.item_name}
                  </Link>
                  <span className="text-text-secondary">
                    {item.current_qty}/{item.reorder_level} {item.base_unit}
                  </span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-md bg-badge-red-bg text-badge-red-text">
                  REORDER
                </span>
              </div>
            ))}
          </div>
        </WorkflowPanel>
      )}
    </WorkflowPage>
  );
}
