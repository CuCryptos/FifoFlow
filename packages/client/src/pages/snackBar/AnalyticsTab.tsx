import { useEffect, useMemo, useRef, useState } from 'react';
import { useSalesSummary } from '../../hooks/useSales';
import type { SalesSummary } from '@fifoflow/shared';

const CHART_HEIGHT = 240;
const CHART_WIDTH = 720;
const CHART_PADDING = { top: 18, right: 18, bottom: 34, left: 48 };

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

  if (isLoading) return <p className="py-8 text-center text-text-muted">Loading analytics...</p>;
  if (!summary) return <p className="py-8 text-center text-text-muted">No data available.</p>;

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {([['week', 'Last 7 Days'], ['month', 'Last 30 Days'], ['3months', 'Last 3 Months']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              period === key
                ? 'bg-accent-indigo text-white'
                : 'border border-border-primary bg-bg-card text-text-secondary hover:text-text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border-primary bg-bg-card p-4">
          <p className="text-sm text-text-muted">Total Revenue</p>
          <p className="text-2xl font-bold text-accent-green">${summary.total_revenue.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-border-primary bg-bg-card p-4">
          <p className="text-sm text-text-muted">Items Sold</p>
          <p className="text-2xl font-bold text-text-primary">{summary.total_items_sold}</p>
        </div>
        <div className="rounded-xl border border-border-primary bg-bg-card p-4">
          <p className="text-sm text-text-muted">Total Sales</p>
          <p className="text-2xl font-bold text-text-primary">{summary.sale_count}</p>
        </div>
      </div>

      {summary.daily.length > 0 && (
        <div className="rounded-xl border border-border-primary bg-bg-card p-4">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-text-secondary">Revenue Over Time</h3>
              <p className="mt-1 text-xs text-text-muted">Daily sales revenue in the selected operating window.</p>
            </div>
            <div className="text-right text-xs text-text-muted">
              Peak day {formatCurrency(Math.max(...summary.daily.map((entry) => entry.revenue)))}
            </div>
          </div>
          <RevenueTimelineChart daily={summary.daily} />
        </div>
      )}

      {summary.top_sellers.length > 0 && (
        <div className="rounded-xl border border-border-primary bg-bg-card p-4">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-text-secondary">Top Sellers by Revenue</h3>
              <p className="mt-1 text-xs text-text-muted">Highest revenue items in the current sales window.</p>
            </div>
            <div className="text-right text-xs text-text-muted">
              {summary.top_sellers.length} ranked item{summary.top_sellers.length === 1 ? '' : 's'}
            </div>
          </div>
          <TopSellerBarChart sellers={summary.top_sellers} />
        </div>
      )}

      {summary.profit_margins.length > 0 && (
        <div className="rounded-xl border border-border-primary bg-bg-card p-4">
          <h3 className="mb-4 text-sm font-medium text-text-secondary">Profit Margins</h3>
          <div className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-primary">
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-text-muted">Item</th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase text-text-muted">Sell Price</th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase text-text-muted">Cost</th>
                  <th className="px-4 py-2 text-right text-xs font-medium uppercase text-text-muted">Margin</th>
                </tr>
              </thead>
              <tbody>
                {summary.profit_margins.map((pm) => (
                  <tr key={pm.item_id} className="border-b border-border-primary last:border-0">
                    <td className="px-4 py-2 text-sm text-text-primary">{pm.item_name}</td>
                    <td className="px-4 py-2 text-right text-sm text-text-secondary">${pm.sale_price.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right text-sm text-text-secondary">
                      {pm.cost_price != null ? `$${pm.cost_price.toFixed(2)}` : '\u2014'}
                    </td>
                    <td className={`px-4 py-2 text-right text-sm font-medium ${
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

type RevenueHoverPoint = {
  x: number;
  y: number;
  date: string;
  revenue: number;
  itemsSold: number;
  saleCount: number;
};

function RevenueTimelineChart({ daily }: { daily: SalesSummary['daily'] }) {
  const [hoveredPoint, setHoveredPoint] = useState<RevenueHoverPoint | null>(null);
  const tooltipId = 'snackbar-revenue-tooltip';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chart = useMemo(() => {
    const revenueMax = Math.max(...daily.map((entry) => entry.revenue), 1);
    const innerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
    const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    const step = daily.length > 1 ? innerWidth / (daily.length - 1) : 0;

    const points = daily.map((entry, index) => {
      const x = CHART_PADDING.left + step * index;
      const y = CHART_PADDING.top + innerHeight - (entry.revenue / revenueMax) * innerHeight;
      return { ...entry, x, y };
    });

    const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      y: CHART_PADDING.top + innerHeight - innerHeight * ratio,
      value: revenueMax * ratio,
    }));

    return { innerHeight, points, polyline, ticks };
  }, [daily]);

  useEffect(() => {
    if (!hoveredPoint) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setHoveredPoint(null);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [hoveredPoint]);

  return (
    <div className="space-y-3">
      <div className="text-xs text-text-muted">Hover, focus, or tap a point for exact revenue details.</div>
      <div ref={containerRef} className="relative h-[240px] w-full">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="revenue-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#34D399" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#34D399" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {chart.ticks.map((tick) => (
            <g key={tick.y}>
              <line
                x1={CHART_PADDING.left}
                x2={CHART_WIDTH - CHART_PADDING.right}
                y1={tick.y}
                y2={tick.y}
                stroke="#2A2F38"
                strokeDasharray="4 6"
              />
              <text x={CHART_PADDING.left - 10} y={tick.y + 4} textAnchor="end" fontSize="11" fill="#6B7280">
                {formatCurrency(tick.value)}
              </text>
            </g>
          ))}

          {chart.points.length > 1 && (
            <path
              d={`M ${chart.points.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${chart.points[chart.points.length - 1].x} ${CHART_HEIGHT - CHART_PADDING.bottom} L ${chart.points[0].x} ${CHART_HEIGHT - CHART_PADDING.bottom} Z`}
              fill="url(#revenue-fill)"
            />
          )}

          <polyline
            fill="none"
            stroke="#34D399"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={chart.polyline}
          />

          {chart.points.map((point) => (
            <g key={point.date}>
              <circle
                cx={point.x}
                cy={point.y}
                r="10"
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`Revenue ${formatCurrency(point.revenue)} on ${formatChartDate(point.date)} from ${point.sale_count} sales and ${point.items_sold} items sold`}
                aria-describedby={hoveredPoint?.date === point.date ? tooltipId : undefined}
                onMouseEnter={() => setHoveredPoint(buildRevenueHoverPoint(point))}
                onMouseLeave={() => setHoveredPoint(null)}
                onFocus={() => setHoveredPoint(buildRevenueHoverPoint(point))}
                onBlur={() => setHoveredPoint(null)}
                onClick={() => setHoveredPoint((current) => current?.date === point.date ? null : buildRevenueHoverPoint(point))}
              />
              <circle cx={point.x} cy={point.y} r="4" fill="#0F172A" pointerEvents="none" />
              <circle cx={point.x} cy={point.y} r="2.5" fill="#34D399" pointerEvents="none" />
            </g>
          ))}
        </svg>
        {hoveredPoint && (
          <div
            id={tooltipId}
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs text-white shadow-xl"
            style={{
              left: `${(hoveredPoint.x / CHART_WIDTH) * 100}%`,
              top: `${(hoveredPoint.y / CHART_HEIGHT) * 100}%`,
            }}
          >
            <div className="font-semibold">{formatChartDate(hoveredPoint.date)}</div>
            <div className="mt-1 font-mono">{formatCurrency(hoveredPoint.revenue)}</div>
            <div className="text-slate-300">{hoveredPoint.saleCount} sales • {hoveredPoint.itemsSold} items</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-text-muted sm:grid-cols-4">
        {daily.map((entry) => (
          <div key={entry.date} className="rounded-lg border border-border-primary bg-bg-page px-3 py-2">
            <div>{formatChartDate(entry.date)}</div>
            <div className="mt-1 font-mono text-text-primary">{formatCurrency(entry.revenue)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopSellerBarChart({ sellers }: { sellers: SalesSummary['top_sellers'] }) {
  const [hoveredSellerId, setHoveredSellerId] = useState<number | null>(null);
  const tooltipId = 'snackbar-seller-tooltip';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const maxRevenue = Math.max(...sellers.map((seller) => seller.revenue), 1);

  useEffect(() => {
    if (hoveredSellerId == null) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setHoveredSellerId(null);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [hoveredSellerId]);

  return (
    <div ref={containerRef} className="space-y-3">
      <div className="text-xs text-text-muted">Hover, focus, or tap a row for exact seller totals.</div>
      {sellers.map((seller) => {
        const width = Math.max((seller.revenue / maxRevenue) * 100, 6);
        const hovered = hoveredSellerId === seller.item_id;
        return (
          <div
            key={seller.item_id}
            className={`relative min-h-[44px] space-y-1.5 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-accent-indigo/40 ${hovered ? 'bg-slate-50' : ''}`}
            tabIndex={0}
            role="img"
            aria-label={`${seller.item_name}, ${formatCurrency(seller.revenue)} revenue, ${seller.quantity_sold} sold`}
            aria-describedby={hovered ? tooltipId : undefined}
            onMouseEnter={() => setHoveredSellerId(seller.item_id)}
            onMouseLeave={() => setHoveredSellerId(null)}
            onFocus={() => setHoveredSellerId(seller.item_id)}
            onBlur={() => setHoveredSellerId(null)}
            onClick={() => setHoveredSellerId((current) => current === seller.item_id ? null : seller.item_id)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-primary">{seller.item_name}</div>
                <div className="text-xs text-text-muted">{seller.quantity_sold} sold</div>
              </div>
              <div className="text-sm font-mono text-text-primary">{formatCurrency(seller.revenue)}</div>
            </div>
            <div className="h-3 rounded-full bg-bg-page">
              <div
                className="h-3 rounded-full bg-accent-indigo transition-[width] duration-300 ease-out"
                style={{ width: `${width}%` }}
              />
            </div>
            {hovered && (
              <div
                id={tooltipId}
                role="status"
                aria-live="polite"
                className="pointer-events-none absolute right-0 top-0 rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs text-white shadow-xl"
              >
                <div className="font-semibold">{seller.item_name}</div>
                <div className="mt-1 font-mono">{formatCurrency(seller.revenue)}</div>
                <div className="text-slate-300">{seller.quantity_sold} sold</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function buildRevenueHoverPoint(point: SalesSummary['daily'][number] & { x: number; y: number }): RevenueHoverPoint {
  return {
    x: point.x,
    y: point.y,
    date: point.date,
    revenue: point.revenue,
    itemsSold: point.items_sold,
    saleCount: point.sale_count,
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatChartDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
