import { useDashboardStats } from '../hooks/useDashboard';
import { useTransactions } from '../hooks/useTransactions';
import { LOW_STOCK_THRESHOLD } from '@fifoflow/shared';

export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: recentTx, isLoading: txLoading } = useTransactions({ limit: 10 });

  if (statsLoading) return <div className="text-text-secondary">Loading...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Items" value={stats?.total_items ?? 0} />
        <StatCard label="Low Stock" value={stats?.low_stock_count ?? 0} color="amber" subtitle={`≤ ${LOW_STOCK_THRESHOLD} units`} />
        <StatCard label="Out of Stock" value={stats?.out_of_stock_count ?? 0} color="red" />
        <StatCard label="Today's Transactions" value={stats?.today_transaction_count ?? 0} color="green" />
      </div>

      {/* Recent activity */}
      <div>
        <h2 className="text-sm font-medium text-text-secondary mb-3">Recent Activity</h2>
        {txLoading ? (
          <div className="text-text-secondary text-sm">Loading...</div>
        ) : recentTx && recentTx.length > 0 ? (
          <div className="space-y-2">
            {recentTx.map((tx) => (
              <div key={tx.id} className="bg-navy-light border border-border rounded px-4 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className={tx.type === 'in' ? 'text-accent-green' : 'text-accent-red'}>
                    {tx.type === 'in' ? '+' : '-'}{tx.quantity}
                  </span>
                  <span className="text-text-primary">{tx.item_name}</span>
                  <span className="text-text-secondary">{tx.reason}</span>
                </div>
                <span className="text-text-secondary text-xs">
                  {new Date(tx.created_at).toLocaleString()}
                </span>
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

function StatCard({ label, value, color, subtitle }: {
  label: string; value: number; color?: 'green' | 'red' | 'amber'; subtitle?: string;
}) {
  const colorClass = color === 'green' ? 'text-accent-green'
    : color === 'red' ? 'text-accent-red'
    : color === 'amber' ? 'text-accent-amber'
    : 'text-text-primary';

  return (
    <div className="bg-navy-light border border-border rounded-lg p-4">
      <div className="text-text-secondary text-xs mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
      {subtitle && <div className="text-text-secondary text-xs mt-1">{subtitle}</div>}
    </div>
  );
}
