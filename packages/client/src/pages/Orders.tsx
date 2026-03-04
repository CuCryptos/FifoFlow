import { useState, useMemo } from 'react';
import { useItems, useReorderSuggestions } from '../hooks/useItems';
import { useVendors } from '../hooks/useVendors';
import { useCreateOrder } from '../hooks/useOrders';
import { useToast } from '../contexts/ToastContext';
import { ManageVendorsModal } from '../components/ManageVendorsModal';
import type { Vendor, ReorderSuggestion } from '@fifoflow/shared';

type OrderTab = 'generate' | 'history';

export function Orders() {
  const [activeTab, setActiveTab] = useState<OrderTab>('generate');
  const [showVendorsModal, setShowVendorsModal] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">Orders</h1>
        <button
          onClick={() => setShowVendorsModal(true)}
          className="bg-bg-card border border-border-emphasis text-text-secondary px-4 py-2 rounded-lg text-sm font-medium hover:bg-bg-hover transition-colors"
        >
          Manage Vendors
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg-card rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('generate')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'generate'
              ? 'bg-accent-indigo text-white'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Generate Orders
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-accent-indigo text-white'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Order History
        </button>
      </div>

      {activeTab === 'generate' && <OrderGenerator />}
      {activeTab === 'history' && <OrderHistory />}

      {showVendorsModal && (
        <ManageVendorsModal onClose={() => setShowVendorsModal(false)} />
      )}
    </div>
  );
}

function OrderGenerator() {
  const { data: suggestions, isLoading } = useReorderSuggestions();
  const { data: items } = useItems();
  const { data: vendors } = useVendors();
  const createOrder = useCreateOrder();
  const { toast } = useToast();
  const [quantities, setQuantities] = useState<Record<number, string>>({});

  // Build item -> vendor lookup
  const itemVendorMap = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const item of items ?? []) {
      map.set(item.id, item.vendor_id);
    }
    return map;
  }, [items]);

  // Build vendor lookup
  const vendorMap = useMemo(() => {
    const map = new Map<number, Vendor>();
    for (const v of vendors ?? []) map.set(v.id, v);
    return map;
  }, [vendors]);

  // Group suggestions by vendor
  const groupedByVendor = useMemo(() => {
    const groups = new Map<number | null, ReorderSuggestion[]>();
    for (const s of suggestions ?? []) {
      const vendorId = itemVendorMap.get(s.item_id) ?? null;
      const arr = groups.get(vendorId) ?? [];
      arr.push(s);
      groups.set(vendorId, arr);
    }
    // Sort: named vendors first (alphabetical), unassigned last
    const entries = Array.from(groups.entries());
    entries.sort((a, b) => {
      if (a[0] === null) return 1;
      if (b[0] === null) return -1;
      const nameA = vendorMap.get(a[0])?.name ?? '';
      const nameB = vendorMap.get(b[0])?.name ?? '';
      return nameA.localeCompare(nameB);
    });
    return entries;
  }, [suggestions, itemVendorMap, vendorMap]);

  const getQty = (itemId: number, defaultQty: number) => {
    const custom = quantities[itemId];
    if (custom !== undefined) return Number(custom) || 0;
    return defaultQty;
  };

  const handleCreateOrder = (vendorId: number, vendorSuggestions: ReorderSuggestion[]) => {
    const orderItems = vendorSuggestions.map((s) => ({
      item_id: s.item_id,
      quantity: getQty(s.item_id, s.estimated_order_units ?? s.suggested_qty),
      unit: s.order_unit ?? s.base_unit,
      unit_price: s.order_unit_price ?? 0,
    }));
    createOrder.mutate(
      { vendor_id: vendorId, items: orderItems },
      {
        onSuccess: () => toast('Order created as draft', 'success'),
        onError: (err) => toast(`Failed to create order: ${err.message}`, 'error'),
      },
    );
  };

  const handleCopyToClipboard = (vendorName: string, vendorSuggestions: ReorderSuggestion[]) => {
    const lines = [`Order for ${vendorName}`, `Date: ${new Date().toLocaleDateString()}`, ''];
    for (const s of vendorSuggestions) {
      const qty = getQty(s.item_id, s.estimated_order_units ?? s.suggested_qty);
      const unit = s.order_unit ?? s.base_unit;
      const price = s.order_unit_price != null ? ` @ $${s.order_unit_price.toFixed(2)}/${unit}` : '';
      lines.push(`${s.item_name}: ${qty} ${unit}${price}`);
    }
    const total = vendorSuggestions.reduce((sum, s) => {
      const qty = getQty(s.item_id, s.estimated_order_units ?? s.suggested_qty);
      return sum + qty * (s.order_unit_price ?? 0);
    }, 0);
    lines.push('', `Estimated Total: $${total.toFixed(2)}`);
    navigator.clipboard.writeText(lines.join('\n'));
    toast('Order copied to clipboard', 'success');
  };

  if (isLoading) return <div className="text-text-secondary text-sm">Loading...</div>;
  if (!suggestions?.length) return <div className="text-text-secondary text-sm">No items need reordering.</div>;

  return (
    <div className="space-y-4">
      {groupedByVendor.map(([vendorId, vendorSuggestions]) => {
        const vendorName = vendorId != null ? vendorMap.get(vendorId)?.name ?? 'Unknown' : 'Unassigned';
        const groupTotal = vendorSuggestions.reduce((sum, s) => {
          const qty = getQty(s.item_id, s.estimated_order_units ?? s.suggested_qty);
          return sum + qty * (s.order_unit_price ?? 0);
        }, 0);

        return (
          <div key={vendorId ?? 'unassigned'} className="bg-bg-card rounded-xl shadow-sm">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary">{vendorName}</h3>
              <span className="text-sm text-text-secondary font-mono">
                Est. ${groupTotal.toFixed(2)}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-table-header text-text-secondary text-left">
                  <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide">Item</th>
                  <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Current</th>
                  <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Order Qty</th>
                  <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide">Unit</th>
                  <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Unit Price</th>
                  <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {vendorSuggestions.map((s) => {
                  const qty = getQty(s.item_id, s.estimated_order_units ?? s.suggested_qty);
                  const unit = s.order_unit ?? s.base_unit;
                  const lineTotal = qty * (s.order_unit_price ?? 0);
                  return (
                    <tr key={s.item_id} className="border-b border-border hover:bg-bg-hover">
                      <td className="px-4 py-2 text-text-primary">{s.item_name}</td>
                      <td className="px-4 py-2 text-right font-mono text-text-secondary">
                        {s.current_qty} {s.base_unit}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={quantities[s.item_id] ?? (s.estimated_order_units ?? s.suggested_qty)}
                          onChange={(e) => setQuantities((prev) => ({ ...prev, [s.item_id]: e.target.value }))}
                          className="w-20 bg-white border border-border rounded-lg px-2 py-1 text-xs text-right text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
                        />
                      </td>
                      <td className="px-4 py-2 text-text-secondary">{unit}</td>
                      <td className="px-4 py-2 text-right font-mono text-text-secondary">
                        {s.order_unit_price != null ? `$${s.order_unit_price.toFixed(2)}` : '\u2014'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-text-primary">
                        {s.order_unit_price != null ? `$${lineTotal.toFixed(2)}` : '\u2014'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
              <button
                onClick={() => handleCopyToClipboard(vendorName, vendorSuggestions)}
                className="border border-border text-text-secondary px-3 py-1.5 rounded-lg text-sm hover:bg-bg-hover transition-colors"
              >
                Copy
              </button>
              {vendorId != null && (
                <button
                  onClick={() => handleCreateOrder(vendorId, vendorSuggestions)}
                  disabled={createOrder.isPending}
                  className="bg-accent-indigo text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
                >
                  Create Order
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrderHistory() {
  return <div className="text-text-secondary text-sm">Order history coming soon...</div>;
}
