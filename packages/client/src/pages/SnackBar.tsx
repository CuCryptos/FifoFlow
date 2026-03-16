import { Suspense, lazy, useState } from 'react';
import { ShoppingBag, List, BarChart3, Minus, Plus } from 'lucide-react';
import { useAllItemStorage, useStorageAreas } from '../hooks/useStorageAreas';
import { useItems, useUpdateItem } from '../hooks/useItems';
import { useCreateSale, useSales } from '../hooks/useSales';
import type { Item } from '@fifoflow/shared';

const SnackBarAnalyticsTab = lazy(async () => ({ default: (await import('./snackBar/AnalyticsTab')).AnalyticsTab }));

type SnackBarTab = 'sell' | 'log' | 'analytics';

export default function SnackBar() {
  const [activeTab, setActiveTab] = useState<SnackBarTab>('sell');

  const tabs: { key: SnackBarTab; label: string; icon: typeof ShoppingBag }[] = [
    { key: 'sell', label: 'Quick Sell', icon: ShoppingBag },
    { key: 'log', label: 'Sales Log', icon: List },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Snack Bar</h1>
      </div>

      <div className="flex gap-1 bg-bg-card rounded-lg p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-accent-indigo text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'sell' && <QuickSellTab />}
      {activeTab === 'log' && <SalesLogTab />}
      {activeTab === 'analytics' && (
        <Suspense fallback={<p className="text-text-muted text-center py-8">Loading analytics...</p>}>
          <SnackBarAnalyticsTab />
        </Suspense>
      )}
    </div>
  );
}

function QuickSellTab() {
  const { data: allStorage } = useAllItemStorage();
  const { data: items } = useItems();
  const { data: areas } = useStorageAreas();
  const createSale = useCreateSale();
  const updateItem = useUpdateItem();
  const [sellModal, setSellModal] = useState<{ item: Item; maxQty: number; perUnit: number; costPerUnit: number | null } | null>(null);
  const [sellQty, setSellQty] = useState(1);
  const [editingPrice, setEditingPrice] = useState<number | null>(null);
  const [priceValue, setPriceValue] = useState('');

  const snackBarArea = areas?.find(a => a.name === 'Snack Bar');
  if (!snackBarArea) {
    return (
      <div className="bg-bg-card rounded-xl border border-border-primary p-8 text-center">
        <p className="text-text-secondary mb-2">No "Snack Bar" storage area found.</p>
        <p className="text-text-muted text-sm">Create a storage area named "Snack Bar" and transfer items to it.</p>
      </div>
    );
  }

  const snackBarItems = (allStorage ?? [])
    .filter(s => s.area_id === snackBarArea.id && s.quantity > 0)
    .map(s => {
      const item = items?.find(i => i.id === s.item_id);
      if (!item) return null;
      const perUnit = item.qty_per_unit ?? 1;
      const unitQty = Math.floor(s.quantity * perUnit);
      const costPerUnit = item.order_unit_price && perUnit > 0
        ? item.order_unit_price / perUnit
        : null;
      return { item, qty: s.quantity, unitQty, perUnit, costPerUnit };
    })
    .filter(Boolean) as Array<{ item: Item; qty: number; unitQty: number; perUnit: number; costPerUnit: number | null }>;

  const handleSell = () => {
    if (!sellModal) return;
    // Convert individual units back to case fraction for inventory
    const caseQty = sellQty / sellModal.perUnit;
    createSale.mutate(
      { item_id: sellModal.item.id, quantity: caseQty, unit_qty: sellQty },
      {
        onSuccess: () => {
          setSellModal(null);
          setSellQty(1);
        },
      }
    );
  };

  const handleSavePrice = (itemId: number) => {
    const price = parseFloat(priceValue);
    if (!isNaN(price) && price >= 0) {
      updateItem.mutate({ id: itemId, data: { sale_price: price } });
    }
    setEditingPrice(null);
  };

  return (
    <>
      {snackBarItems.length === 0 ? (
        <div className="bg-bg-card rounded-xl border border-border-primary p-8 text-center">
          <p className="text-text-secondary">No items in Snack Bar storage area.</p>
          <p className="text-text-muted text-sm mt-1">Transfer items to the "Snack Bar" area to start selling.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {snackBarItems.map(({ item, unitQty, perUnit, costPerUnit }) => (
            <div key={item.id} className="bg-bg-card rounded-xl border border-border-primary p-4 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-text-primary">{item.name}</h3>
                  <p className="text-sm text-text-muted">{item.category}</p>
                </div>
                <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                  unitQty <= 5 ? 'bg-red-500/20 text-red-400' : 'bg-accent-green/20 text-accent-green'
                }`}>
                  {unitQty} units
                </span>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <span className="text-text-muted">
                  Cost: {costPerUnit != null ? <span className="text-text-secondary">${costPerUnit.toFixed(2)}</span> : <span className="text-text-muted">{'\u2014'}</span>}
                </span>
                <span className="text-text-muted">
                  Sell:{' '}
                  {editingPrice === item.id ? (
                    <span className="inline-flex items-center gap-0.5">
                      $<input
                        type="number"
                        value={priceValue}
                        onChange={e => setPriceValue(e.target.value)}
                        onBlur={() => handleSavePrice(item.id)}
                        onKeyDown={e => e.key === 'Enter' && handleSavePrice(item.id)}
                        className="w-16 bg-bg-primary border border-border-primary rounded px-1.5 py-0.5 text-sm text-text-primary"
                        autoFocus
                        step="0.01"
                        min="0"
                      />
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingPrice(item.id);
                        setPriceValue(String(item.sale_price ?? ''));
                      }}
                      className="text-text-secondary hover:text-text-primary transition-colors"
                      title="Click to edit sell price"
                    >
                      {item.sale_price ? `$${item.sale_price.toFixed(2)}` : 'Set price'}
                    </button>
                  )}
                </span>
              </div>

              <button
                onClick={() => {
                  setSellModal({ item, maxQty: unitQty, perUnit, costPerUnit });
                  setSellQty(1);
                }}
                disabled={!item.sale_price}
                className="w-full px-4 py-2 bg-accent-green text-white rounded-lg text-sm font-medium hover:bg-accent-green/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Sell
              </button>
            </div>
          ))}
        </div>
      )}

      {sellModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSellModal(null)}>
          <div className="bg-bg-card rounded-xl border border-border-primary p-6 w-80 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-text-primary">Sell {sellModal.item.name}</h3>
            <p className="text-sm text-text-muted">
              ${sellModal.item.sale_price?.toFixed(2)} per unit
              {sellModal.costPerUnit != null && (
                <span className="ml-2 text-text-muted">(cost: ${sellModal.costPerUnit.toFixed(2)})</span>
              )}
            </p>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setSellQty(Math.max(1, sellQty - 1))}
                className="p-2 rounded-lg bg-bg-primary border border-border-primary text-text-primary hover:bg-bg-hover"
              >
                <Minus size={16} />
              </button>
              <span className="text-2xl font-bold text-text-primary w-12 text-center">{sellQty}</span>
              <button
                onClick={() => setSellQty(Math.min(sellModal.maxQty, sellQty + 1))}
                className="p-2 rounded-lg bg-bg-primary border border-border-primary text-text-primary hover:bg-bg-hover"
              >
                <Plus size={16} />
              </button>
            </div>

            <p className="text-center text-text-secondary">
              Total: <span className="font-bold text-accent-green">${((sellModal.item.sale_price ?? 0) * sellQty).toFixed(2)}</span>
            </p>
            <p className="text-center text-xs text-text-muted">
              Available: {sellModal.maxQty} units
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setSellModal(null)}
                className="flex-1 px-4 py-2 bg-bg-primary border border-border-primary rounded-lg text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleSell}
                disabled={createSale.isPending}
                className="flex-1 px-4 py-2 bg-accent-green text-white rounded-lg font-medium hover:bg-accent-green/80 disabled:opacity-50"
              >
                {createSale.isPending ? 'Selling...' : 'Confirm'}
              </button>
            </div>

            {createSale.isError && (
              <p className="text-sm text-red-400 text-center">{createSale.error.message}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SalesLogTab() {
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const getDateRange = () => {
    const now = new Date();
    switch (dateRange) {
      case 'today':
        return { start_date: now.toISOString().split('T')[0] };
      case 'week': {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return { start_date: weekAgo.toISOString().split('T')[0] };
      }
      case 'month': {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return { start_date: monthAgo.toISOString().split('T')[0] };
      }
      case 'custom':
        return {
          start_date: customStart || undefined,
          end_date: customEnd || undefined,
        };
    }
  };

  const filters = getDateRange();
  const { data: sales, isLoading } = useSales(filters);

  const totalRevenue = sales?.reduce((sum, s) => sum + s.total, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['today', 'week', 'month', 'custom'] as const).map(range => (
          <button
            key={range}
            onClick={() => setDateRange(range)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              dateRange === range
                ? 'bg-accent-indigo text-white'
                : 'bg-bg-card text-text-secondary hover:text-text-primary border border-border-primary'
            }`}
          >
            {range === 'today' ? 'Today' : range === 'week' ? 'This Week' : range === 'month' ? 'This Month' : 'Custom'}
          </button>
        ))}
        {dateRange === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm text-text-primary"
            />
            <span className="text-text-muted">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="bg-bg-primary border border-border-primary rounded px-2 py-1 text-sm text-text-primary"
            />
          </div>
        )}
      </div>

      <div className="bg-bg-card rounded-xl border border-border-primary p-4 flex items-center justify-between">
        <span className="text-text-secondary text-sm">{sales?.length ?? 0} sales</span>
        <span className="text-accent-green font-bold">${totalRevenue.toFixed(2)} revenue</span>
      </div>

      {isLoading ? (
        <p className="text-text-muted text-center py-8">Loading...</p>
      ) : !sales?.length ? (
        <p className="text-text-muted text-center py-8">No sales found for this period.</p>
      ) : (
        <div className="bg-bg-card rounded-xl border border-border-primary overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-primary">
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Date/Time</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Item</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Qty</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Price</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(sale => (
                <tr key={sale.id} className="border-b border-border-primary last:border-0 hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {new Date(sale.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary font-medium">{sale.item_name}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary text-right">
                    {sale.unit_qty}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary text-right">${sale.sale_price.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-accent-green font-medium text-right">${sale.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
