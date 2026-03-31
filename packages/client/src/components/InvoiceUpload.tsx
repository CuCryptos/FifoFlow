import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useVendors } from '../hooks/useVendors';
import { useCreateItem, useItems } from '../hooks/useItems';
import { useConfirmInvoice, useParseInvoice } from '../hooks/useInvoices';
import { useToast } from '../contexts/ToastContext';
import { api } from '../api';
import { useVenueContext } from '../contexts/VenueContext';
import { CATEGORIES, UNITS } from '@fifoflow/shared';
import type { Category, InvoiceLine, InvoiceParseResult, Unit } from '@fifoflow/shared';

interface Props {
  onClose: () => void;
}

export function InvoiceUpload({ onClose }: Props) {
  const { selectedVenueId } = useVenueContext();
  const { data: vendors } = useVendors();
  const { data: items } = useItems({ venue_id: selectedVenueId ?? undefined });
  const parseInvoice = useParseInvoice();
  const confirmInvoice = useConfirmInvoice();
  const createItem = useCreateItem();
  const { toast } = useToast();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<InvoiceParseResult[]>([]);
  const [activeResultIdx, setActiveResultIdx] = useState(0);
  const [lineOverrides, setLineOverrides] = useState<Map<string, number | null>>(new Map());
  const [vendorOverrides, setVendorOverrides] = useState<Map<number, number>>(new Map());
  const [createVpFlags, setCreateVpFlags] = useState<Map<string, boolean>>(new Map());
  const [createItemFlags, setCreateItemFlags] = useState<Map<string, boolean>>(new Map());
  const [recordTransactions, setRecordTransactions] = useState(false);

  const addFiles = (incoming: FileList | File[]) => {
    const nextFiles = Array.from(incoming);
    const supportedFiles: File[] = [];
    let unsupportedCount = 0;

    for (const file of nextFiles) {
      const mime = file.type.toLowerCase();
      const name = file.name.toLowerCase();
      const supported =
        mime === 'application/pdf'
        || mime === 'image/png'
        || mime === 'image/jpeg'
        || mime === 'image/jpg'
        || mime === 'image/webp'
        || mime === 'image/heic'
        || mime === 'image/heif'
        || name.endsWith('.pdf')
        || name.endsWith('.png')
        || name.endsWith('.jpg')
        || name.endsWith('.jpeg')
        || name.endsWith('.webp')
        || name.endsWith('.heic')
        || name.endsWith('.heif');

      if (supported) {
        supportedFiles.push(file);
      } else {
        unsupportedCount++;
      }
    }

    if (unsupportedCount > 0) {
      toast(`${unsupportedCount} file${unsupportedCount > 1 ? 's were' : ' was'} skipped. Only PDF, PNG, JPEG, WebP, HEIC, and HEIF are supported right now.`, 'info');
    }

    if (!supportedFiles.length) {
      return;
    }

    setFiles((current) => {
      const deduped = new Map<string, File>();
      for (const file of [...current, ...supportedFiles]) {
        deduped.set(`${file.name}:${file.size}:${file.lastModified}`, file);
      }
      return [...deduped.values()];
    });
  };

  const removeFileAt = (index: number) => {
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleParse = () => {
    if (files.length === 0) return;
    parseInvoice.mutate(
      { files },
      {
        onSuccess: (data) => {
          setResults(data);
          setActiveResultIdx(0);
          const flags = new Map<string, boolean>();
          const itemFlags = new Map<string, boolean>();
          data.forEach((result, ri) => {
            result.lines.forEach((line, li) => {
              const key = `${ri}-${li}`;
              flags.set(
                key,
                line.matched_item_id != null
                && (line.match_confidence === 'exact' || line.match_confidence === 'high')
                && !line.existing_vendor_price_id,
              );
              itemFlags.set(key, line.matched_item_id == null);
            });
          });
          setCreateVpFlags(flags);
          setCreateItemFlags(itemFlags);
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
    const needsItemCreation = results.some((result, ri) => result.lines.some((line, li) => {
      const key = `${ri}-${li}`;
      const overrideItemId = lineOverrides.get(key);
      const itemId = overrideItemId !== undefined ? overrideItemId : line.matched_item_id;
      return !itemId && (createItemFlags.get(key) ?? false);
    }));

    if (needsItemCreation && !selectedVenueId) {
      toast('Select a venue before creating inventory items from invoice lines', 'error');
      return;
    }

    setIsConfirming(true);
    let totalItemsCreated = 0;
    let totalVpCreated = 0;
    let totalTxCreated = 0;
    let totalVendorsAssigned = 0;

    try {
      const createdItemIds = new Map<string, number>();
      const payloads: Array<Parameters<typeof api.invoices.confirm>[0]> = [];

      for (const [ri, result] of results.entries()) {
        const vendorId = vendorOverrides.get(ri) ?? result.vendor_id;
        if (!vendorId) continue;

        const lines: Parameters<typeof api.invoices.confirm>[0]['lines'] = [];
        for (const [li, line] of result.lines.entries()) {
          const key = `${ri}-${li}`;
          const overrideItemId = lineOverrides.get(key);
          let itemId = overrideItemId !== undefined ? overrideItemId : line.matched_item_id;

          if (!itemId && (createItemFlags.get(key) ?? false)) {
            const dedupeKey = `${vendorId}:${normalizeInvoiceItemName(line.vendor_item_name)}`;
            const existingCreatedItemId = createdItemIds.get(dedupeKey);

            if (existingCreatedItemId) {
              itemId = existingCreatedItemId;
            } else {
              const createdItem = await createItem.mutateAsync({
                name: line.vendor_item_name,
                category: inferCategoryFromInvoiceLine(line.vendor_item_name),
                unit: inferInventoryUnitFromInvoiceLine(line),
                order_unit: coerceInvoiceUnit(line.unit),
                order_unit_price: line.unit_price,
                vendor_id: vendorId,
                venue_id: selectedVenueId ?? null,
              });
              itemId = createdItem.id;
              createdItemIds.set(dedupeKey, itemId);
              totalItemsCreated++;
            }
          }

          if (!itemId) continue;

          lines.push({
            vendor_item_name: line.vendor_item_name,
            matched_item_id: itemId,
            quantity: line.quantity,
            unit: line.unit,
            unit_price: line.unit_price,
            create_vendor_price: createVpFlags.get(key) ?? false,
          });
        }

        if (lines.length > 0) {
          payloads.push({ vendor_id: vendorId, lines, record_transactions: recordTransactions });
        }
      }

      if (payloads.length === 0) {
        toast('No invoices with matched vendors to confirm', 'info');
        return;
      }

      for (const payload of payloads) {
        const data = await confirmInvoice.mutateAsync(payload);
        totalVpCreated += data.vendor_prices_created;
        totalTxCreated += data.transactions_created;
        totalVendorsAssigned += data.vendors_assigned ?? 0;
      }
      const parts = [];
      if (totalItemsCreated > 0) parts.push(`${totalItemsCreated} inventory items created`);
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
                ref={filePickerRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif"
                multiple
                onChange={(e) => {
                  addFiles(e.target.files ?? []);
                  e.currentTarget.value = '';
                }}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  addFiles(e.target.files ?? []);
                  e.currentTarget.value = '';
                }}
                className="hidden"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => filePickerRef.current?.click()}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text-primary hover:bg-bg-hover transition-colors"
                >
                  Choose files
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="rounded-lg border border-accent-indigo/30 bg-accent-indigo/5 px-3 py-2 text-sm font-medium text-accent-indigo hover:bg-accent-indigo/10 transition-colors"
                >
                  Take photo
                </button>
              </div>
              <p className="text-xs text-text-muted mt-1">
                Use `Take photo` on a phone or laptop camera, or choose existing PDFs and images, including HEIC from newer iPhones. Everything still goes through the same invoice parser and review flow.
              </p>
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm text-text-secondary">
                  {files.length} file{files.length > 1 ? 's' : ''} selected
                </div>
                <div className="flex flex-wrap gap-2">
                  {files.map((file, index) => (
                    <span
                      key={`${file.name}:${file.size}:${file.lastModified}`}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-xs text-text-secondary"
                    >
                      <span>{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFileAt(index)}
                        className="text-text-muted hover:text-text-primary"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
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
                {activeResult.lines.some((line) => line.match_confidence === 'low') && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Low-confidence rows are not auto-matched. Review the suggested items before confirming.
                  </div>
                )}

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
                        <th className="px-2 py-2 text-text-secondary font-medium text-center">Create Item</th>
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
                                  const key = `${activeResultIdx}-${li}`;
                                  const newMap = new Map(lineOverrides);
                                  newMap.set(key, e.target.value ? Number(e.target.value) : null);
                                  setLineOverrides(newMap);

                                  const newCreateItemMap = new Map(createItemFlags);
                                  newCreateItemMap.set(key, !e.target.value && line.matched_item_id == null);
                                  setCreateItemFlags(newCreateItemMap);
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
                                            const key = `${activeResultIdx}-${li}`;
                                            const newMap = new Map(lineOverrides);
                                            newMap.set(key, suggestion.item_id);
                                            setLineOverrides(newMap);

                                            const newCreateItemMap = new Map(createItemFlags);
                                            newCreateItemMap.set(key, false);
                                            setCreateItemFlags(newCreateItemMap);
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
                              checked={createItemFlags.get(`${activeResultIdx}-${li}`) ?? false}
                              onChange={(e) => {
                                const key = `${activeResultIdx}-${li}`;
                                const newMap = new Map(createItemFlags);
                                newMap.set(key, e.target.checked);
                                setCreateItemFlags(newMap);

                                if (e.target.checked) {
                                  const newOverrides = new Map(lineOverrides);
                                  newOverrides.set(key, null);
                                  setLineOverrides(newOverrides);
                                }
                              }}
                              disabled={getEffectiveItemId(line, activeResultIdx, li) != null}
                              className="rounded border-border text-accent-indigo focus:ring-accent-indigo/20 cursor-pointer disabled:opacity-30"
                            />
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
              {selectedVenueId ? (
                <span className="text-xs text-text-muted">
                  Unmatched rows marked `Create Item` will be saved into the selected venue.
                </span>
              ) : (
                <span className="text-xs text-amber-700">
                  Select a venue before confirming invoice rows that need new inventory items.
                </span>
              )}
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => {
                  setResults([]);
                  setLineOverrides(new Map());
                  setCreateVpFlags(new Map());
                  setCreateItemFlags(new Map());
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

function normalizeInvoiceItemName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function coerceInvoiceUnit(unit: string | null | undefined): Unit | null {
  if (!unit) return null;
  const normalized = unit.trim().toLowerCase();
  return UNITS.find((candidate) => candidate.toLowerCase() === normalized) ?? null;
}

function inferCategoryFromInvoiceLine(name: string): Category {
  const text = name.toLowerCase();
  if (/(vodka|gin|rum|tequila|whiskey|whisky|bourbon|mezcal|liqueur|cordial|amaro|brandy|cognac)/.test(text)) return 'Spirits';
  if (/(beer|ipa|lager|ale|stout|porter|pilsner|seltzer)/.test(text)) return 'Beer';
  if (/(wine|cabernet|pinot|sauvignon|chardonnay|merlot|rose|prosecco|champagne)/.test(text)) return 'Wine';
  if (/(tonic|soda|cola|ginger beer|ginger ale|juice|syrup|bitters|mix|mixer)/.test(text)) return 'Mixers';
  if (/(milk|cream|cheese|yogurt|butter)/.test(text)) return 'Dairy';
  if (/(beef|pork|chicken|lamb|duck|sausage|bacon)/.test(text)) return 'Meat';
  if (/(salmon|tuna|shrimp|fish|oyster|mussel|crab|lobster)/.test(text)) return 'Seafood';
  if (/(lettuce|tomato|onion|potato|cabbage|carrot|lime|lemon|orange|cilantro|parsley|produce)/.test(text)) return 'Produce';
  return CATEGORIES.includes('Other') ? 'Other' : CATEGORIES[0];
}

function inferInventoryUnitFromInvoiceLine(line: Pick<InvoiceLine, 'vendor_item_name' | 'unit'>): Unit {
  const unitFromInvoice = coerceInvoiceUnit(line.unit);
  const text = `${line.vendor_item_name} ${line.unit ?? ''}`.toLowerCase();

  if (/\bbottle\b|\bbtls?\b/.test(text)) return 'bottle';
  if (/\bcan\b|\bcans\b/.test(text)) return 'can';
  if (/\bcase\b|\bcs\b/.test(text) && /\bbottle\b|\bbtls?\b/.test(text)) return 'bottle';
  if (/\bcase\b|\bcs\b/.test(text) && /\bcan\b|\bcans\b/.test(text)) return 'can';

  if (unitFromInvoice && unitFromInvoice !== 'case' && unitFromInvoice !== 'box' && unitFromInvoice !== 'pack') {
    return unitFromInvoice;
  }

  return 'each';
}
