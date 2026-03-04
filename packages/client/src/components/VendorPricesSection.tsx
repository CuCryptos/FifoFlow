import { useState } from 'react';
import { useVendorPrices, useCreateVendorPrice, useUpdateVendorPrice, useDeleteVendorPrice } from '../hooks/useVendorPrices';
import { useVendors } from '../hooks/useVendors';
import { UNITS } from '@fifoflow/shared';
import type { Unit, VendorPrice } from '@fifoflow/shared';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const inputClass =
  'bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo';

export function VendorPricesSection({ itemId }: { itemId: number }) {
  const { data: vendorPrices, isLoading } = useVendorPrices(itemId);
  const { data: vendors } = useVendors();
  const createVp = useCreateVendorPrice();
  const updateVp = useUpdateVendorPrice();
  const deleteVp = useDeleteVendorPrice();

  const [expanded, setExpanded] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Add form state
  const [addVendorId, setAddVendorId] = useState('');
  const [addItemName, setAddItemName] = useState('');
  const [addOrderUnit, setAddOrderUnit] = useState<Unit | ''>('');
  const [addPrice, setAddPrice] = useState('');
  const [addQtyPerUnit, setAddQtyPerUnit] = useState('');
  const [addIsDefault, setAddIsDefault] = useState(false);

  // Edit form state
  const [editItemName, setEditItemName] = useState('');
  const [editOrderUnit, setEditOrderUnit] = useState<Unit | ''>('');
  const [editPrice, setEditPrice] = useState('');
  const [editQtyPerUnit, setEditQtyPerUnit] = useState('');

  const resetAddForm = () => {
    setAddVendorId('');
    setAddItemName('');
    setAddOrderUnit('');
    setAddPrice('');
    setAddQtyPerUnit('');
    setAddIsDefault(false);
    setShowAdd(false);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    createVp.mutate(
      {
        itemId,
        data: {
          vendor_id: Number(addVendorId),
          vendor_item_name: addItemName || null,
          order_unit: addOrderUnit || null,
          order_unit_price: Number(addPrice),
          qty_per_unit: addQtyPerUnit ? Number(addQtyPerUnit) : null,
          is_default: addIsDefault,
        },
      },
      { onSuccess: resetAddForm },
    );
  };

  const startEdit = (vp: VendorPrice) => {
    setEditingId(vp.id);
    setEditItemName(vp.vendor_item_name ?? '');
    setEditOrderUnit(vp.order_unit ?? '');
    setEditPrice(String(vp.order_unit_price));
    setEditQtyPerUnit(vp.qty_per_unit != null ? String(vp.qty_per_unit) : '');
  };

  const handleSaveEdit = (vp: VendorPrice) => {
    updateVp.mutate(
      {
        itemId,
        id: vp.id,
        data: {
          vendor_item_name: editItemName || null,
          order_unit: editOrderUnit || null,
          order_unit_price: Number(editPrice),
          qty_per_unit: editQtyPerUnit ? Number(editQtyPerUnit) : null,
        },
      },
      { onSuccess: () => setEditingId(null) },
    );
  };

  const handleToggleDefault = (vp: VendorPrice) => {
    updateVp.mutate({
      itemId,
      id: vp.id,
      data: { is_default: !vp.is_default },
    });
  };

  const handleDelete = (vp: VendorPrice) => {
    if (!confirm(`Remove ${vp.vendor_name} pricing?`)) return;
    deleteVp.mutate({ itemId, id: vp.id });
  };

  return (
    <div className="bg-bg-card rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-base font-semibold text-text-primary flex items-center gap-2"
        >
          <span className={`text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
          Vendor Prices
          {vendorPrices && <span className="text-sm font-normal text-text-muted ml-1">({vendorPrices.length})</span>}
        </button>
        {expanded && (
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="text-sm text-accent-indigo hover:text-accent-indigo-hover"
          >
            {showAdd ? 'Cancel' : '+ Add'}
          </button>
        )}
      </div>

      {!expanded ? null : isLoading ? (
        <div className="text-text-secondary text-sm">Loading...</div>
      ) : (
        <>
          {/* Add form */}
          {showAdd && vendors && (
            <form onSubmit={handleAdd} className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 p-4 bg-bg-page rounded-lg">
              <div className="col-span-2 sm:col-span-3">
                <label className="block text-xs font-medium text-text-muted mb-1">Vendor</label>
                <select
                  value={addVendorId}
                  onChange={(e) => setAddVendorId(e.target.value)}
                  required
                  className={`${inputClass} w-full`}
                >
                  <option value="">Select vendor...</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Vendor Item Name</label>
                <input
                  type="text"
                  value={addItemName}
                  onChange={(e) => setAddItemName(e.target.value)}
                  placeholder="e.g. Premium Bananas"
                  className={`${inputClass} w-full`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Order Unit</label>
                <select
                  value={addOrderUnit}
                  onChange={(e) => setAddOrderUnit(e.target.value as Unit | '')}
                  className={`${inputClass} w-full`}
                >
                  <option value="">&mdash;</option>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={addPrice}
                  onChange={(e) => setAddPrice(e.target.value)}
                  required
                  className={`${inputClass} w-full`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Qty per Unit</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={addQtyPerUnit}
                  onChange={(e) => setAddQtyPerUnit(e.target.value)}
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addIsDefault}
                    onChange={(e) => setAddIsDefault(e.target.checked)}
                    className="rounded border-border"
                  />
                  Default
                </label>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={createVp.isPending}
                  className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-50"
                >
                  {createVp.isPending ? 'Adding...' : 'Add'}
                </button>
              </div>
              {createVp.error && (
                <div className="col-span-2 sm:col-span-3 text-accent-red text-xs">{createVp.error.message}</div>
              )}
            </form>
          )}

          {/* Table */}
          {vendorPrices && vendorPrices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-muted text-xs border-b border-border">
                    <th className="pb-2 pr-3">Vendor</th>
                    <th className="pb-2 pr-3">Vendor Item Name</th>
                    <th className="pb-2 pr-3">Unit</th>
                    <th className="pb-2 pr-3">Price</th>
                    <th className="pb-2 pr-3">Qty/Unit</th>
                    <th className="pb-2 pr-3">Default</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorPrices.map((vp) => (
                    <tr key={vp.id} className="border-b border-border last:border-0">
                      {editingId === vp.id ? (
                        <>
                          <td className="py-2 pr-3 text-text-primary">{vp.vendor_name}</td>
                          <td className="py-2 pr-3">
                            <input
                              type="text"
                              value={editItemName}
                              onChange={(e) => setEditItemName(e.target.value)}
                              className={`${inputClass} w-full max-w-40`}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <select
                              value={editOrderUnit}
                              onChange={(e) => setEditOrderUnit(e.target.value as Unit | '')}
                              className={`${inputClass} w-20`}
                            >
                              <option value="">&mdash;</option>
                              {UNITS.map((u) => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              className={`${inputClass} w-24`}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={editQtyPerUnit}
                              onChange={(e) => setEditQtyPerUnit(e.target.value)}
                              className={`${inputClass} w-20`}
                            />
                          </td>
                          <td className="py-2 pr-3"></td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(vp)}
                                disabled={updateVp.isPending}
                                className="text-accent-green text-xs hover:underline"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="text-text-muted text-xs hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 pr-3 text-text-primary">{vp.vendor_name}</td>
                          <td className="py-2 pr-3 text-text-secondary">{vp.vendor_item_name ?? '\u2014'}</td>
                          <td className="py-2 pr-3 text-text-secondary">{vp.order_unit ?? '\u2014'}</td>
                          <td className="py-2 pr-3 text-text-primary font-mono">{formatCurrency(vp.order_unit_price)}</td>
                          <td className="py-2 pr-3 text-text-secondary">{vp.qty_per_unit ?? '\u2014'}</td>
                          <td className="py-2 pr-3">
                            <button
                              type="button"
                              onClick={() => handleToggleDefault(vp)}
                              className={`text-sm ${vp.is_default ? 'text-accent-amber' : 'text-text-muted hover:text-text-secondary'}`}
                              title={vp.is_default ? 'Default vendor' : 'Set as default'}
                            >
                              {vp.is_default ? '\u2605' : '\u2606'}
                            </button>
                          </td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(vp)}
                                className="text-text-secondary text-xs hover:text-text-primary"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(vp)}
                                className="text-accent-red text-xs hover:underline"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-text-secondary text-sm">No vendor prices configured.</div>
          )}
        </>
      )}
    </div>
  );
}
