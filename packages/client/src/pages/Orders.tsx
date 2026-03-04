import { useState, useMemo } from 'react';
import { useItems, useReorderSuggestions } from '../hooks/useItems';
import { useVendors } from '../hooks/useVendors';
import { useOrders, useOrder, useCreateOrder, useUpdateOrderStatus, useDeleteOrder } from '../hooks/useOrders';
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
  const { data: orders, isLoading } = useOrders();
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  if (isLoading) return <div className="text-text-secondary text-sm">Loading...</div>;
  if (!orders?.length) return <div className="text-text-secondary text-sm">No orders yet.</div>;

  if (selectedOrderId) {
    return <OrderDetailView orderId={selectedOrderId} onBack={() => setSelectedOrderId(null)} />;
  }

  return (
    <div className="bg-bg-card rounded-xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-bg-table-header text-text-secondary text-left">
            <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide">Date</th>
            <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide">Vendor</th>
            <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Items</th>
            <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Est. Cost</th>
            <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr
              key={order.id}
              onClick={() => setSelectedOrderId(order.id)}
              className="border-b border-border hover:bg-bg-hover cursor-pointer transition-colors"
            >
              <td className="px-4 py-2 text-text-primary">
                {new Date(order.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-2 text-text-primary">{order.vendor_name}</td>
              <td className="px-4 py-2 text-right font-mono text-text-secondary">{order.item_count}</td>
              <td className="px-4 py-2 text-right font-mono text-text-primary">
                ${order.total_estimated_cost.toFixed(2)}
              </td>
              <td className="px-4 py-2">
                <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                  order.status === 'sent'
                    ? 'bg-badge-green-bg text-badge-green-text'
                    : 'bg-badge-amber-bg text-badge-amber-text'
                }`}>
                  {order.status === 'sent' ? 'Sent' : 'Draft'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderDetailView({ orderId, onBack }: { orderId: number; onBack: () => void }) {
  const { data: order, isLoading } = useOrder(orderId);
  const updateStatus = useUpdateOrderStatus();
  const deleteOrder = useDeleteOrder();
  const { toast } = useToast();

  if (isLoading) return <div className="text-text-secondary text-sm">Loading...</div>;
  if (!order) return <div className="text-accent-red text-sm">Order not found.</div>;

  const handleMarkSent = () => {
    updateStatus.mutate(
      { id: order.id, status: 'sent' },
      { onSuccess: () => toast('Order marked as sent', 'success') },
    );
  };

  const handleDelete = () => {
    if (!window.confirm('Delete this draft order?')) return;
    deleteOrder.mutate(order.id, {
      onSuccess: () => { toast('Order deleted', 'success'); onBack(); },
      onError: (err) => toast(`Failed: ${err.message}`, 'error'),
    });
  };

  const handleCopy = () => {
    const lines = [
      `Order for ${order.vendor_name}`,
      `Date: ${new Date(order.created_at).toLocaleDateString()}`,
      `Status: ${order.status}`,
      '',
    ];
    for (const item of order.items) {
      const price = item.unit_price > 0 ? ` @ $${item.unit_price.toFixed(2)}/${item.unit}` : '';
      lines.push(`${item.item_name}: ${item.quantity} ${item.unit}${price}`);
    }
    lines.push('', `Estimated Total: $${order.total_estimated_cost.toFixed(2)}`);
    navigator.clipboard.writeText(lines.join('\n'));
    toast('Order copied to clipboard', 'success');
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-accent-indigo text-sm hover:underline">
        &larr; Back to Order History
      </button>

      <div className="bg-bg-card rounded-xl shadow-sm">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-text-primary">{order.vendor_name}</h3>
            <span className="text-xs text-text-muted">
              {new Date(order.created_at).toLocaleDateString()} &middot;{' '}
              <span className={order.status === 'sent' ? 'text-badge-green-text' : 'text-badge-amber-text'}>
                {order.status === 'sent' ? 'Sent' : 'Draft'}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="border border-border text-text-secondary px-3 py-1.5 rounded-lg text-sm hover:bg-bg-hover transition-colors"
            >
              Copy
            </button>
            <button
              onClick={() => window.print()}
              className="border border-border text-text-secondary px-3 py-1.5 rounded-lg text-sm hover:bg-bg-hover transition-colors"
            >
              Print
            </button>
            {order.status === 'draft' && (
              <>
                <button
                  onClick={handleMarkSent}
                  disabled={updateStatus.isPending}
                  className="bg-accent-indigo text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
                >
                  Mark Sent
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteOrder.isPending}
                  className="bg-accent-red/10 text-accent-red border border-accent-red/30 px-3 py-1.5 rounded-lg text-sm hover:bg-accent-red/20 transition-colors"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-table-header text-text-secondary text-left">
              <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide">Item</th>
              <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Qty</th>
              <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide">Unit</th>
              <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Unit Price</th>
              <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-border">
                <td className="px-4 py-2 text-text-primary">{item.item_name}</td>
                <td className="px-4 py-2 text-right font-mono">{item.quantity}</td>
                <td className="px-4 py-2 text-text-secondary">{item.unit}</td>
                <td className="px-4 py-2 text-right font-mono text-text-secondary">
                  ${item.unit_price.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-text-primary">
                  ${item.line_total.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-bg-page">
              <td colSpan={4} className="px-4 py-3 text-sm text-text-secondary text-right font-medium">
                Estimated Total
              </td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-text-primary">
                ${order.total_estimated_cost.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>

        {order.notes && (
          <div className="px-4 py-3 border-t border-border text-sm text-text-secondary">
            <span className="font-medium">Notes:</span> {order.notes}
          </div>
        )}
      </div>
    </div>
  );
}
