import { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { useVendors } from '../hooks/useVendors';
import { useItems } from '../hooks/useItems';
import { useParseInvoice, useConfirmInvoice } from '../hooks/useInvoices';
import { useToast } from '../contexts/ToastContext';
import type { InvoiceLine, InvoiceParseResult } from '@fifoflow/shared';

interface Props {
  onClose: () => void;
}

export function InvoiceUpload({ onClose }: Props) {
  const { data: vendors } = useVendors();
  const { data: items } = useItems();
  const parseInvoice = useParseInvoice();
  const confirmInvoice = useConfirmInvoice();
  const { toast } = useToast();

  const [vendorId, setVendorId] = useState<number | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<InvoiceParseResult | null>(null);
  const [lineOverrides, setLineOverrides] = useState<Map<number, number | null>>(new Map());
  const [createVpFlags, setCreateVpFlags] = useState<Map<number, boolean>>(new Map());
  const [recordTransactions, setRecordTransactions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleParse = () => {
    if (!file || !vendorId) return;
    parseInvoice.mutate(
      { file, vendorId: vendorId as number },
      {
        onSuccess: (data) => {
          setResult(data);
          // Default: create vendor price for lines without existing one
          const flags = new Map<number, boolean>();
          data.lines.forEach((line, i) => {
            flags.set(i, !line.existing_vendor_price_id);
          });
          setCreateVpFlags(flags);
        },
        onError: (err) => {
          toast(`Parse failed: ${err.message}`, 'error');
        },
      },
    );
  };

  const handleConfirm = () => {
    if (!result) return;
    const lines = result.lines
      .map((line, i) => {
        const overrideItemId = lineOverrides.get(i);
        const itemId = overrideItemId !== undefined ? overrideItemId : line.matched_item_id;
        if (!itemId) return null;
        return {
          vendor_item_name: line.vendor_item_name,
          matched_item_id: itemId,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unit_price,
          create_vendor_price: createVpFlags.get(i) ?? false,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    if (lines.length === 0) {
      toast('No lines with matched items to confirm', 'info');
      return;
    }

    confirmInvoice.mutate(
      {
        vendor_id: result.vendor_id,
        lines,
        record_transactions: recordTransactions,
      },
      {
        onSuccess: (data) => {
          const parts = [];
          if (data.vendor_prices_created > 0) parts.push(`${data.vendor_prices_created} vendor prices created`);
          if (data.transactions_created > 0) parts.push(`${data.transactions_created} transactions recorded`);
          toast(parts.join(', ') || 'No changes made', 'success');
          onClose();
        },
        onError: (err) => {
          toast(`Confirm failed: ${err.message}`, 'error');
        },
      },
    );
  };

  const getConfidenceBadge = (confidence: InvoiceLine['match_confidence']) => {
    const styles = {
      exact: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      high: 'bg-amber-100 text-amber-700 border-amber-200',
      low: 'bg-red-100 text-red-700 border-red-200',
      none: 'bg-gray-100 text-gray-500 border-gray-200',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[confidence]}`}>
        {confidence}
      </span>
    );
  };

  const getEffectiveItemId = (line: InvoiceLine, index: number): number | null => {
    const override = lineOverrides.get(index);
    return override !== undefined ? override : line.matched_item_id;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-bg-card rounded-xl shadow-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Upload Invoice</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!result ? (
          /* Phase 1: Upload */
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Vendor</label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value ? Number(e.target.value) : '')}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary w-full focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
              >
                <option value="">Select vendor...</option>
                {(vendors ?? []).map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Invoice File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary w-full"
              />
              <p className="text-xs text-text-muted mt-1">Supported: PDF, PNG, JPEG, WebP (max 10MB)</p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm border border-border text-text-secondary hover:bg-bg-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleParse}
                disabled={!vendorId || !file || parseInvoice.isPending}
                className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {parseInvoice.isPending ? 'Parsing...' : 'Parse Invoice'}
              </button>
            </div>
          </div>
        ) : (
          /* Phase 2: Review Results */
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm text-text-secondary">
              <span>Vendor: <strong className="text-text-primary">{result.vendor_name}</strong></span>
              {result.invoice_number && <span>Invoice #: <strong className="text-text-primary">{result.invoice_number}</strong></span>}
              {result.invoice_date && <span>Date: <strong className="text-text-primary">{result.invoice_date}</strong></span>}
            </div>

            <div className="flex gap-3 text-sm">
              <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded">{result.summary.matched} matched</span>
              <span className="px-2 py-1 bg-gray-50 text-gray-600 rounded">{result.summary.unmatched} unmatched</span>
              <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">Total: ${result.summary.total_amount.toFixed(2)}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-2 py-2 text-text-secondary font-medium">Vendor Item</th>
                    <th className="px-2 py-2 text-text-secondary font-medium text-right">Qty</th>
                    <th className="px-2 py-2 text-text-secondary font-medium">Unit</th>
                    <th className="px-2 py-2 text-text-secondary font-medium text-right">Price</th>
                    <th className="px-2 py-2 text-text-secondary font-medium">Match</th>
                    <th className="px-2 py-2 text-text-secondary font-medium">Mapped Item</th>
                    <th className="px-2 py-2 text-text-secondary font-medium text-center">Create VP</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((line, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-bg-hover/50">
                      <td className="px-2 py-2 text-text-primary">{line.vendor_item_name}</td>
                      <td className="px-2 py-2 text-text-primary text-right">{line.quantity}</td>
                      <td className="px-2 py-2 text-text-secondary">{line.unit}</td>
                      <td className="px-2 py-2 text-text-primary text-right">${line.unit_price.toFixed(2)}</td>
                      <td className="px-2 py-2">{getConfidenceBadge(line.match_confidence)}</td>
                      <td className="px-2 py-2">
                        <select
                          value={getEffectiveItemId(line, i) ?? ''}
                          onChange={(e) => {
                            const newMap = new Map(lineOverrides);
                            newMap.set(i, e.target.value ? Number(e.target.value) : null);
                            setLineOverrides(newMap);
                          }}
                          className="bg-white border border-border rounded px-2 py-1 text-xs w-full max-w-[200px] focus:outline-none focus:ring-1 focus:ring-accent-indigo/20"
                        >
                          <option value="">-- No match --</option>
                          {(items ?? []).map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={createVpFlags.get(i) ?? false}
                          onChange={(e) => {
                            const newMap = new Map(createVpFlags);
                            newMap.set(i, e.target.checked);
                            setCreateVpFlags(newMap);
                          }}
                          disabled={!getEffectiveItemId(line, i)}
                          className="rounded border-border text-accent-indigo focus:ring-accent-indigo/20 cursor-pointer disabled:opacity-30"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={recordTransactions}
                  onChange={(e) => setRecordTransactions(e.target.checked)}
                  className="rounded border-border text-accent-indigo focus:ring-accent-indigo/20"
                />
                Also record as received transactions
              </label>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => {
                  setResult(null);
                  setLineOverrides(new Map());
                  setCreateVpFlags(new Map());
                }}
                className="px-4 py-2 rounded-lg text-sm border border-border text-text-secondary hover:bg-bg-hover transition-colors"
              >
                Back
              </button>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm border border-border text-text-secondary hover:bg-bg-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={confirmInvoice.isPending}
                  className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {confirmInvoice.isPending ? 'Confirming...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
