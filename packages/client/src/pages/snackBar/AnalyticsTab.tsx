import { useState } from 'react';
import { useSalesSummary } from '../../hooks/useSales';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

export function AnalyticsTab() {
  const [period, setPeriod] = useState<'week' | 'month' | '3months'>('month');

  const getDateRange = () => {
    const now = new Date();
    switch (period) {
      case 'week': {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        return { start_date: d.toISOString().split('T')[0] };
      }
      case 'month': {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 1);
        return { start_date: d.toISOString().split('T')[0] };
      }
      case '3months': {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 3);
        return { start_date: d.toISOString().split('T')[0] };
      }
    }
  };

  const filters = getDateRange();
  const { data: summary, isLoading } = useSalesSummary(filters);

  if (isLoading) return <p className="text-text-muted text-center py-8">Loading analytics...</p>;
  if (!summary) return <p className="text-text-muted text-center py-8">No data available.</p>;

  const chartColors = {
    green: '#34D399',
    indigo: '#818CF8',
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {([['week', 'Last 7 Days'], ['month', 'Last 30 Days'], ['3months', 'Last 3 Months']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === key
                ? 'bg-accent-indigo text-white'
                : 'bg-bg-card text-text-secondary hover:text-text-primary border border-border-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-bg-card rounded-xl border border-border-primary p-4">
          <p className="text-text-muted text-sm">Total Revenue</p>
          <p className="text-2xl font-bold text-accent-green">${summary.total_revenue.toFixed(2)}</p>
        </div>
        <div className="bg-bg-card rounded-xl border border-border-primary p-4">
          <p className="text-text-muted text-sm">Items Sold</p>
          <p className="text-2xl font-bold text-text-primary">{summary.total_items_sold}</p>
        </div>
        <div className="bg-bg-card rounded-xl border border-border-primary p-4">
          <p className="text-text-muted text-sm">Total Sales</p>
          <p className="text-2xl font-bold text-text-primary">{summary.sale_count}</p>
        </div>
      </div>

      {summary.daily.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-border-primary p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-4">Revenue Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={summary.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2F38" />
              <XAxis
                dataKey="date"
                stroke="#6B7280"
                fontSize={12}
                tickFormatter={(d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              />
              <YAxis stroke="#6B7280" fontSize={12} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1A1F2B', border: '1px solid #2A2F38', borderRadius: '8px' }}
                labelStyle={{ color: '#9CA3AF' }}
                formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Revenue']}
              />
              <Line type="monotone" dataKey="revenue" stroke={chartColors.green} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {summary.top_sellers.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-border-primary p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-4">Top Sellers by Revenue</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, summary.top_sellers.length * 40)}>
            <BarChart data={summary.top_sellers} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2F38" />
              <XAxis type="number" stroke="#6B7280" fontSize={12} tickFormatter={(v: number) => `$${v}`} />
              <YAxis type="category" dataKey="item_name" stroke="#6B7280" fontSize={12} width={90} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1A1F2B', border: '1px solid #2A2F38', borderRadius: '8px' }}
                labelStyle={{ color: '#9CA3AF' }}
                formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Revenue']}
              />
              <Bar dataKey="revenue" fill={chartColors.indigo} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {summary.profit_margins.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-border-primary p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-4">Profit Margins</h3>
          <div className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-primary">
                  <th className="text-left px-4 py-2 text-xs font-medium text-text-muted uppercase">Item</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-muted uppercase">Sell Price</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-muted uppercase">Cost</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-text-muted uppercase">Margin</th>
                </tr>
              </thead>
              <tbody>
                {summary.profit_margins.map((pm) => (
                  <tr key={pm.item_id} className="border-b border-border-primary last:border-0">
                    <td className="px-4 py-2 text-sm text-text-primary">{pm.item_name}</td>
                    <td className="px-4 py-2 text-sm text-text-secondary text-right">${pm.sale_price.toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm text-text-secondary text-right">
                      {pm.cost_price != null ? `$${pm.cost_price.toFixed(2)}` : '\u2014'}
                    </td>
                    <td className={`px-4 py-2 text-sm font-medium text-right ${
                      pm.margin != null && pm.margin > 0 ? 'text-accent-green' : 'text-text-muted'
                    }`}>
                      {pm.margin != null ? `${pm.margin}%` : '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
