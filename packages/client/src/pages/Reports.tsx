import { useState } from 'react';
import { useUsageReport, useWasteReport, useCostReport } from '../hooks/useReports';

type Tab = 'usage' | 'waste' | 'cost';
type UsageGroupBy = 'day' | 'week';
type CostGroupBy = 'category' | 'vendor';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

function formatCurrency(v: number): string {
  return '$' + v.toFixed(2);
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card rounded-xl border border-card-border p-4">
      <div className="text-text-muted text-xs uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-text-primary mt-1 font-mono">{value}</div>
    </div>
  );
}

export function Reports() {
  const [tab, setTab] = useState<Tab>('usage');
  const [start, setStart] = useState(() => daysAgo(30));
  const [end, setEnd] = useState(() => formatDate(new Date()));
  const [usageGroupBy, setUsageGroupBy] = useState<UsageGroupBy>('day');
  const [costGroupBy, setCostGroupBy] = useState<CostGroupBy>('category');

  const presets = [
    { label: 'Today', fn: () => { setStart(formatDate(new Date())); setEnd(formatDate(new Date())); } },
    { label: '7 Days', fn: () => { setStart(daysAgo(7)); setEnd(formatDate(new Date())); } },
    { label: '30 Days', fn: () => { setStart(daysAgo(30)); setEnd(formatDate(new Date())); } },
    { label: '90 Days', fn: () => { setStart(daysAgo(90)); setEnd(formatDate(new Date())); } },
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: 'usage', label: 'Usage' },
    { key: 'waste', label: 'Waste' },
    { key: 'cost', label: 'Cost' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">Reports</h1>

      {/* Date range picker */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={p.fn}
              className="px-3 py-1.5 text-xs rounded-lg bg-card border border-card-border text-text-secondary hover:bg-sidebar-hover hover:text-white transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="bg-card border border-card-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
          />
          <span className="text-text-muted">to</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="bg-card border border-card-border rounded-lg px-3 py-1.5 text-sm text-text-primary"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-card-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-accent-indigo text-accent-indigo'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'usage' && (
        <UsageTab start={start} end={end} groupBy={usageGroupBy} setGroupBy={setUsageGroupBy} />
      )}
      {tab === 'waste' && <WasteTab start={start} end={end} />}
      {tab === 'cost' && (
        <CostTab start={start} end={end} groupBy={costGroupBy} setGroupBy={setCostGroupBy} />
      )}
    </div>
  );
}

function GroupByToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1 text-xs rounded-lg transition-colors ${
            value === o.key
              ? 'bg-accent-indigo text-white'
              : 'bg-card border border-card-border text-text-muted hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function UsageTab({
  start,
  end,
  groupBy,
  setGroupBy,
}: {
  start: string;
  end: string;
  groupBy: UsageGroupBy;
  setGroupBy: (v: UsageGroupBy) => void;
}) {
  const { data, isLoading } = useUsageReport(start, end, groupBy);

  if (isLoading) return <div className="text-text-muted">Loading...</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-3 gap-4 flex-1 mr-4">
          <StatCard label="Total In" value={data.totals.in_qty} />
          <StatCard label="Total Out" value={data.totals.out_qty} />
          <StatCard label="Transactions" value={data.totals.tx_count} />
        </div>
        <GroupByToggle
          options={[
            { key: 'day' as UsageGroupBy, label: 'Day' },
            { key: 'week' as UsageGroupBy, label: 'Week' },
          ]}
          value={groupBy}
          onChange={setGroupBy}
        />
      </div>

      <div className="bg-card rounded-xl border border-card-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border text-text-muted text-left">
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium text-right">In</th>
              <th className="px-4 py-3 font-medium text-right">Out</th>
              <th className="px-4 py-3 font-medium text-right">Txns</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                  No transactions in this period
                </td>
              </tr>
            ) : (
              data.rows.map((r, i) => (
                <tr key={i} className="border-b border-card-border/50 hover:bg-sidebar-hover/30">
                  <td className="px-4 py-2.5 font-mono text-xs text-text-muted">{r.period}</td>
                  <td className="px-4 py-2.5 text-text-primary">{r.item_name}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{r.category}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-badge-green-text">
                    {r.in_qty > 0 ? `+${r.in_qty}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-badge-red-text">
                    {r.out_qty > 0 ? `-${r.out_qty}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{r.tx_count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WasteTab({ start, end }: { start: string; end: string }) {
  const { data, isLoading } = useWasteReport(start, end);

  if (isLoading) return <div className="text-text-muted">Loading...</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total Waste Qty" value={data.totals.quantity} />
        <StatCard label="Total Waste Cost" value={formatCurrency(data.totals.estimated_cost)} />
      </div>

      <div className="bg-card rounded-xl border border-card-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border text-text-muted text-left">
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium text-right">Qty Wasted</th>
              <th className="px-4 py-3 font-medium text-right">Est. Cost</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-muted">
                  No waste recorded in this period
                </td>
              </tr>
            ) : (
              data.rows.map((r, i) => (
                <tr key={i} className="border-b border-card-border/50 hover:bg-sidebar-hover/30">
                  <td className="px-4 py-2.5 text-text-primary">{r.item_name}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{r.category}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-badge-red-text">{r.quantity}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                    {formatCurrency(r.estimated_cost)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CostTab({
  start,
  end,
  groupBy,
  setGroupBy,
}: {
  start: string;
  end: string;
  groupBy: CostGroupBy;
  setGroupBy: (v: CostGroupBy) => void;
}) {
  const { data, isLoading } = useCostReport(start, end, groupBy);

  if (isLoading) return <div className="text-text-muted">Loading...</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-3 gap-4 flex-1 mr-4">
          <StatCard label="Total In Cost" value={formatCurrency(data.totals.in_cost)} />
          <StatCard label="Total Out Cost" value={formatCurrency(data.totals.out_cost)} />
          <StatCard label="Net Cost" value={formatCurrency(data.totals.net_cost)} />
        </div>
        <GroupByToggle
          options={[
            { key: 'category' as CostGroupBy, label: 'Category' },
            { key: 'vendor' as CostGroupBy, label: 'Vendor' },
          ]}
          value={groupBy}
          onChange={setGroupBy}
        />
      </div>

      <div className="bg-card rounded-xl border border-card-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border text-text-muted text-left">
              <th className="px-4 py-3 font-medium">{groupBy === 'vendor' ? 'Vendor' : 'Category'}</th>
              <th className="px-4 py-3 font-medium text-right">In Cost</th>
              <th className="px-4 py-3 font-medium text-right">Out Cost</th>
              <th className="px-4 py-3 font-medium text-right">Net Cost</th>
              <th className="px-4 py-3 font-medium text-right">Txns</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                  No cost data in this period
                </td>
              </tr>
            ) : (
              data.rows.map((r, i) => (
                <tr key={i} className="border-b border-card-border/50 hover:bg-sidebar-hover/30">
                  <td className="px-4 py-2.5 text-text-primary">{r.group_name}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-badge-green-text">
                    {formatCurrency(r.in_cost)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-badge-red-text">
                    {formatCurrency(r.out_cost)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                    {formatCurrency(r.net_cost)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-secondary">{r.tx_count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
