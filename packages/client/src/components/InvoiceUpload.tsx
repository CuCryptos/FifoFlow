import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useVendors } from '../hooks/useVendors';
import { useItems } from '../hooks/useItems';
import { useParseInvoice } from '../hooks/useInvoices';
import { useToast } from '../contexts/ToastContext';
import { api } from '../api';
import type { InvoiceLine, InvoiceParseResult } from '@fifoflow/shared';

interface Props {
  onClose: () => void;
}

export function InvoiceUpload({ onClose }: Props) {
  const { data: vendors } = useVendors();
  const { data: items } = useItems();
  const parseInvoice = useParseInvoice();
  const { toast } = useToast();

  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<InvoiceParseResult[]>([]);
  const [activeResultIdx, setActiveResultIdx] = useState(0);
  const [lineOverrides, setLineOverrides] = useState<Map<string, number | null>>(new Map());
  const [vendorOverrides, setVendorOverrides] = useState<Map<number, number>>(new Map());
  const [createVpFlags, setCreateVpFlags] = useState<Map<string, boolean>>(new Map());
  const [recordTransactions, setRecordTransactions] = useState(false);

  const handleParse = () => {
    if (files.length === 0) return;
    parseInvoice.mutate(
      { files },
      {
        onSuccess: (data) => {
          setResults(data);
          setActiveResultIdx(0);
          const flags = new Map<string, boolean>();
          data.forEach((result, ri) => {
            result.lines.forEach((line, li) => {
              flags.set(`${ri}-${li}`, !line.existing_vendor_price_id);
            });
          });
          setCreateVpFlags(flags);
        },
        onError: (err) => {
          toast(`Parse failed: ${err.message}`, 'error');
        },
      },
    );
  };

  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    if (results.length === 0) return;

    // Build all confirmable payloads
    const payloads: Array<Parameters<typeof api.invoices.confirm>[0]> = [];
    results.forEach((result, ri) => {
      const vendorId = vendorOverrides.get(ri) ?? result.vendor_id;
      if (!vendorId) return;

      const lines = result.lines
        .map((line, li) => {
          const key = `${ri}-${li}`;
          const overrideItemId = lineOverrides.get(key);
          const itemId = overrideItemId !== undefined ? overrideItemId : line.matched_item_id;
          if (!itemId) return null;
          return {
            vendor_item_name: line.vendor_item_name,
            matched_item_id: itemId,
            quantity: line.quantity,
            unit: line.unit,
            unit_price: line.unit_price,
            create_vendor_price: createVpFlags.get(key) ?? false,
          };
        })
        .filter((l): l is NonNullable<typeof l> => l !== null);

      if (lines.length > 0) {
        payloads.push({ vendor_id: vendorId, lines, record_transactions: recordTransactions });
      }
    });

    if (payloads.length === 0) {
      toast('No invoices with matched vendors to confirm', 'info');
      return;
    }

    setIsConfirming(true);
    let totalVpCreated = 0;
    let totalTxCreated = 0;
    let totalVendorsAssigned = 0;

    try {
      for (const payload of payloads) {
        const data = await api.invoices.confirm(payload);
        totalVpCreated += data.vendor_prices_created;
        totalTxCreated += data.transactions_created;
        totalVendorsAssigned += data.vendors_assigned ?? 0;
      }
      const parts = [];
      if (totalVendorsAssigned > 0) parts.push(`${totalVendorsAssigned} vendors assigned`);
      if (totalVpCreated > 0) parts.push(`${totalVpCreated} vendor prices created`);
      if (totalTxCreated > 0) parts.push(`${totalTxCreated} transactions recorded`);
      toast(parts.join(', ') || 'No changes made', 'success');
      onClose();
    } catch (err: any) {
      toast(`Confirm failed: ${err.message}`, 'error');
    } finally {
      setIsConfirming(false);
    }
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

  const activeResult = results[activeResultIdx];
  const itemById = useMemo(() => new Map((items ?? []).map((item) => [item.id, item])), [items]);
  const getEffectiveItemId = (line: InvoiceLine, ri: number, li: number): number | null => {
    const override = lineOverrides.get(`${ri}-${li}`);
    return override !== undefined ? override : line.matched_item_id;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-bg-card rounded-xl shadow-xl p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Upload Invoices</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {results.length === 0 ? (
          /* Phase 1: Upload */
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Invoice Files</label>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary w-full"
              />
              <p className="text-xs text-text-muted mt-1">
                Select one or more invoices (PDF, PNG, JPEG, WebP). Vendor will be auto-detected.
              </p>
            </div>

            {files.length > 0 && (
              <div className="text-sm text-text-secondary">
                {files.length} file{files.length > 1 ? 's' : ''} selected: {files.map((f) => f.name).join(', ')}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm border border-border text-text-secondary hover:bg-bg-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleParse}
                disabled={files.length === 0 || parseInvoice.isPending}
                className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {parseInvoice.isPending ? `Parsing${files.length > 1 ? ` (${files.length} files)` : ''}...` : `Parse ${files.length > 1 ? `${files.length} Invoices` : 'Invoice'}`}
              </button>
            </div>
          </div>
        ) : (
          /* Phase 2: Review Results */
          <div className="space-y-4">
            {/* Invoice tabs for multi-file */}
            {results.length > 1 && (
              <div className="flex gap-1 border-b border-border overflow-x-auto">
                {results.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveResultIdx(i)}
                    className={`px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                      i === activeResultIdx
                        ? 'text-accent-indigo border-b-2 border-accent-indigo'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {r.vendor_name || `Invoice ${i + 1}`}
                    {r.invoice_number ? ` #${r.invoice_number}` : ''}
                  </button>
                ))}
              </div>
            )}

            {activeResult && (
              <>
                {/* Vendor info */}
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-text-secondary">Vendor:</span>
                    {activeResult.vendor_id ? (
                      <span className="font-medium text-text-primary">{activeResult.vendor_name}</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-amber-600 font-medium">
                          "{activeResult.detected_vendor_name}" (not matched)
                        </span>
                        <select
                          value={vendorOverrides.get(activeResultIdx) ?? ''}
                          onChange={(e) => {
                            const newMap = new Map(vendorOverrides);
                            if (e.target.value) {
                              newMap.set(activeResultIdx, Number(e.target.value));
                            } else {
                              newMap.delete(activeResultIdx);
                            }
                            setVendorOverrides(newMap);
                          }}
                          className="bg-white border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-indigo/20"
                        >
                          <option value="">Assign vendor...</option>
                          {(vendors ?? []).map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  {activeResult.invoice_number && (
                    <span className="text-text-secondary">Invoice #: <strong className="text-text-primary">{activeResult.invoice_number}</strong></span>
                  )}
                  {activeResult.invoice_date && (
                    <span className="text-text-secondary">Date: <strong className="text-text-primary">{activeResult.invoice_date}</strong></span>
                  )}
                </div>

                <div className="flex gap-3 text-sm">
                  <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded">{activeResult.summary.matched} matched</span>
                  <span className="px-2 py-1 bg-gray-50 text-gray-600 rounded">{activeResult.summary.unmatched} unmatched</span>
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">Total: ${(activeResult.summary.total_amount ?? 0).toFixed(2)}</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-2 py-2 text-text-secondary font-medium">Vendor Item</th>
                        <th className="px-2 py-2 text-text-secondary font-medium text-right">Qty</th>
                        <th className="px-2 py-2 text-text-secondary font-medium">Unit</th>
                        <th className="px-2 py-2 text-text-secondary font-medium text-right">Price</th>
                        <th className="px-2 py-2 text-text-secondary font-medium text-right">Total</th>
                        <th className="px-2 py-2 text-text-secondary font-medium">Match</th>
                        <th className="px-2 py-2 text-text-secondary font-medium">Mapped Item</th>
                        <th className="px-2 py-2 text-text-secondary font-medium text-center">Create VP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeResult.lines.map((line, li) => (
                        <tr key={li} className="border-b border-border/50 hover:bg-bg-hover/50 align-top">
                          <td className="px-2 py-2 text-text-primary">{line.vendor_item_name}</td>
                          <td className="px-2 py-2 text-text-primary text-right">{line.quantity}</td>
                          <td className="px-2 py-2 text-text-secondary">{line.unit}</td>
                          <td className="px-2 py-2 text-text-primary text-right">${(line.unit_price ?? 0).toFixed(2)}</td>
                          <td className="px-2 py-2 text-text-primary text-right">${(line.line_total ?? 0).toFixed(2)}</td>
                          <td className="px-2 py-2">{getConfidenceBadge(line.match_confidence)}</td>
                          <td className="px-2 py-2">
                            <div className="space-y-2 max-w-[280px]">
                              <select
                                value={getEffectiveItemId(line, activeResultIdx, li) ?? ''}
                                onChange={(e) => {
                                  const newMap = new Map(lineOverrides);
                                  newMap.set(`${activeResultIdx}-${li}`, e.target.value ? Number(e.target.value) : null);
                                  setLineOverrides(newMap);
                                }}
                                className="bg-white border border-border rounded px-2 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-accent-indigo/20"
                              >
                                <option value="">-- No match --</option>
                                {(line.suggested_matches?.length ?? 0) > 0 && (
                                  <optgroup label="Likely matches">
                                    {line.suggested_matches?.map((suggestion) => (
                                      <option key={`suggested-${suggestion.item_id}`} value={suggestion.item_id}>
                                        {suggestion.item_name}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                <optgroup label="All inventory items">
                                  {(items ?? []).map((item) => (
                                    <option key={item.id} value={item.id}>{item.name}</option>
                                  ))}
                                </optgroup>
                              </select>

                              {(line.suggested_matches?.length ?? 0) > 0 ? (
                                <div className="space-y-1">
                                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted">
                                    Likely matches
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {line.suggested_matches?.map((suggestion) => {
                                      const selected = getEffectiveItemId(line, activeResultIdx, li) === suggestion.item_id;
                                      return (
                                        <button
                                          key={`chip-${suggestion.item_id}`}
                                          type="button"
                                          onClick={() => {
                                            const newMap = new Map(lineOverrides);
                                            newMap.set(`${activeResultIdx}-${li}`, suggestion.item_id);
                                            setLineOverrides(newMap);
                                          }}
                                          className={`rounded-full border px-2 py-1 text-[11px] transition-colors ${
                                            selected
                                              ? 'border-accent-indigo bg-accent-indigo/10 text-accent-indigo'
                                              : 'border-border bg-white text-text-secondary hover:border-accent-indigo/40 hover:text-text-primary'
                                          }`}
                                        >
                                          {suggestion.item_name}
                                          <span className="ml-1 text-text-muted">
                                            {suggestion.matched_via === 'vendor_alias' ? 'vendor' : 'name'}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div className="space-y-1">
                                    {line.suggested_matches?.map((suggestion) => {
                                      const matchedItem = itemById.get(suggestion.item_id);
                                      return (
                                        <div key={`context-${suggestion.item_id}`} className="rounded-lg bg-bg-secondary/50 px-2 py-1.5 text-[11px] text-text-secondary">
                                          <div className="font-medium text-text-primary">
                                            {suggestion.item_name}
                                            <span className="ml-1 text-text-muted">
                                              {Math.round(suggestion.match_score * 100)}%
                                            </span>
                                          </div>
                                          <div>
                                            Via {suggestion.matched_via === 'vendor_alias' ? 'vendor alias' : 'inventory name'}
                                            {matchedItem?.vendor_id ? ' • vendor linked' : ''}
                                            {matchedItem?.order_unit && matchedItem?.order_unit_price != null ? ` • ${matchedItem.order_unit} $${matchedItem.order_unit_price.toFixed(2)}` : ''}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : line.match_confidence === 'none' ? (
                                <div className="rounded-lg border border-dashed border-border px-2 py-1.5 text-[11px] text-text-muted">
                                  No sensible match. Pick an inventory item manually.
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={createVpFlags.get(`${activeResultIdx}-${li}`) ?? false}
                              onChange={(e) => {
                                const newMap = new Map(createVpFlags);
                                newMap.set(`${activeResultIdx}-${li}`, e.target.checked);
                                setCreateVpFlags(newMap);
                              }}
                              disabled={!getEffectiveItemId(line, activeResultIdx, li)}
                              className="rounded border-border text-accent-indigo focus:ring-accent-indigo/20 cursor-pointer disabled:opacity-30"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

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
                  setResults([]);
                  setLineOverrides(new Map());
                  setCreateVpFlags(new Map());
                  setVendorOverrides(new Map());
                  setFiles([]);
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
                  disabled={isConfirming}
                  className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isConfirming ? 'Confirming...' : `Confirm All (${results.length} invoice${results.length > 1 ? 's' : ''})`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
