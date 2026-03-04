import { Link } from 'react-router-dom';
import { useDashboardStats } from '../hooks/useDashboard';
import { useTransactions } from '../hooks/useTransactions';
import { useReorderSuggestions } from '../hooks/useItems';
import { LOW_STOCK_THRESHOLD } from '@fifoflow/shared';

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
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: recentTx, isLoading: txLoading } = useTransactions({ limit: 10 });
  const { data: reorderSuggestions } = useReorderSuggestions();

  const reorderSpend = (reorderSuggestions ?? []).reduce(
    (sum, r) => sum + (r.estimated_total_cost ?? 0),
    0,
  );

  if (statsLoading) return <div className="text-text-secondary">Loading...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Total Items" value={stats?.total_items ?? 0} />
        <StatCard
          label="Low Stock"
          value={stats?.low_stock_count ?? 0}
          color="amber"
          subtitle={`\u2264 ${LOW_STOCK_THRESHOLD} units`}
        />
        <StatCard label="Out of Stock" value={stats?.out_of_stock_count ?? 0} color="red" />
        <StatCard
          label="Today's Transactions"
          value={stats?.today_transaction_count ?? 0}
          color="green"
        />
        <StatCard
          label="Est. Reorder Spend"
          value={reorderSpend}
          color="amber"
          format="currency"
        />
      </div>

      {/* Recent activity */}
      <div className="bg-bg-card rounded-xl shadow-sm p-5">
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
      </div>

      {/* Items needing reorder */}
      {!!reorderSuggestions?.length && (
        <div className="bg-bg-card rounded-xl shadow-sm p-5">
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
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  subtitle,
  format,
}: {
  label: string;
  value: number;
  color?: 'green' | 'red' | 'amber';
  subtitle?: string;
  format?: 'currency';
}) {
  const borderClass =
    color === 'green'
      ? 'border-accent-green'
      : color === 'red'
        ? 'border-accent-red'
        : color === 'amber'
          ? 'border-accent-amber'
          : 'border-accent-indigo';

  const displayValue =
    format === 'currency'
      ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      : value;

  return (
    <div className={`bg-bg-card rounded-xl shadow-sm p-5 border-l-4 ${borderClass}`}>
      <div className="text-xs font-medium text-text-muted uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-mono font-semibold text-text-primary">{displayValue}</div>
      {subtitle && <div className="text-xs text-text-secondary mt-1">{subtitle}</div>}
    </div>
  );
}
