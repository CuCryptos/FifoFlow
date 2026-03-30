import { useMemo, useState } from 'react';
import { useCreateItem } from '../hooks/useItems';
import { CATEGORIES, UNITS } from '@fifoflow/shared';
import type { Category, Unit } from '@fifoflow/shared';
import { X } from 'lucide-react';
import { InventoryUnitEconomicsSummary } from './inventory/InventoryUnitEconomicsSummary';
import { useProductEnrichmentSearch } from '../hooks/useProductEnrichment';

export function AddItemModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [unit, setUnit] = useState<Unit>(UNITS[0]);
  const [orderUnit, setOrderUnit] = useState<Unit | ''>('');
  const [orderUnitPrice, setOrderUnitPrice] = useState('');
  const [qtyPerUnit, setQtyPerUnit] = useState('');
  const [innerUnit, setInnerUnit] = useState<Unit | ''>('');
  const [itemSizeValue, setItemSizeValue] = useState('');
  const [itemSizeUnit, setItemSizeUnit] = useState<Unit | ''>('');
  const [brandName, setBrandName] = useState('');
  const [manufacturerName, setManufacturerName] = useState('');
  const [gtin, setGtin] = useState('');
  const [upc, setUpc] = useState('');
  const [syscoSupc, setSyscoSupc] = useState('');
  const [manufacturerItemCode, setManufacturerItemCode] = useState('');
  const createItem = useCreateItem();
  const searchTerm = name.trim();
  const suggestionQuery = useProductEnrichmentSearch(
    { query: searchTerm, limit: 6 },
    searchTerm.length >= 2,
  );
  const suggestions = suggestionQuery.data?.products ?? [];
  const selectedIdentityCount = useMemo(
    () => [brandName, manufacturerName, gtin, upc, syscoSupc, manufacturerItemCode].filter((value) => value.trim().length > 0).length,
    [brandName, manufacturerItemCode, gtin, manufacturerName, syscoSupc, upc],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createItem.mutate(
      {
        name,
        category,
        unit,
        order_unit: orderUnit || null,
        order_unit_price: orderUnitPrice ? Number(orderUnitPrice) : null,
        qty_per_unit: qtyPerUnit ? Number(qtyPerUnit) : null,
        inner_unit: innerUnit || null,
        item_size_value: itemSizeValue ? Number(itemSizeValue) : null,
        item_size_unit: itemSizeUnit || null,
        item_size: itemSizeValue && itemSizeUnit ? `${itemSizeValue} ${itemSizeUnit}` : null,
        brand_name: brandName || null,
        manufacturer_name: manufacturerName || null,
        gtin: gtin || null,
        upc: upc || null,
        sysco_supc: syscoSupc || null,
        manufacturer_item_code: manufacturerItemCode || null,
      },
      {
        onSuccess: () => onClose(),
      }
    );
  };

  const applySuggestion = (product: NonNullable<typeof suggestions>[number]) => {
    setName(product.product_name);
    setBrandName(product.brand_name ?? '');
    setManufacturerName(product.manufacturer_name ?? '');
    setGtin(product.gtin ?? '');
    setUpc(product.upc ?? '');
    setSyscoSupc(product.sysco_supc ?? '');
    setManufacturerItemCode(product.vendor_item_code ?? '');

    const inferredCategory = inferCategoryFromProduct(product);
    if (inferredCategory) {
      setCategory(inferredCategory);
    }

    const inferredUnit = inferInventoryUnitFromProduct(product);
    if (inferredUnit) {
      setUnit(inferredUnit);
    }

    const inferredOrderUnit = inferOrderUnitFromProduct(product);
    if (inferredOrderUnit) {
      setOrderUnit(inferredOrderUnit);
    }

    const inferredSize = inferSizeFromProduct(product);
    if (inferredSize) {
      setItemSizeValue(String(inferredSize.value));
      setItemSizeUnit(inferredSize.unit);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bg-card rounded-2xl shadow-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Add Inventory Item</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Define the counting unit first, then the purchase pack, then the measurable content recipes can consume.
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-border p-4">
                <p className="text-xs font-medium text-text-secondary">Inventory identity</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-text-muted mb-1">Item name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                      autoFocus
                    />
                    <p className="mt-1 text-[11px] text-text-muted">
                      Search by brand or product name. FIFOFlow will suggest matched national products so liquor, beer, and mixers are easier to standardize.
                    </p>
                    {searchTerm.length >= 2 ? (
                      <div className="mt-2 space-y-2">
                        {suggestionQuery.isLoading ? (
                          <div className="rounded-xl border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary">
                            Looking up branded product suggestions...
                          </div>
                        ) : suggestions.length > 0 ? (
                          suggestions.map((product) => (
                            <button
                              key={`${product.catalog_code}-${product.id}`}
                              type="button"
                              onClick={() => applySuggestion(product)}
                              className="w-full rounded-xl border border-border bg-bg-secondary px-3 py-3 text-left transition hover:border-accent-indigo/30 hover:bg-white"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm font-medium text-text-primary">{product.product_name}</div>
                                <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">{product.catalog_name}</div>
                              </div>
                              <div className="mt-1 text-xs text-text-secondary">
                                {[product.brand_name, product.pack_text, product.size_text].filter(Boolean).join(' • ') || 'Branded product match'}
                              </div>
                            </button>
                          ))
                        ) : suggestionQuery.isFetched ? (
                          <div className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-text-secondary">
                            No branded matches yet for this search.
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Brand</label>
                    <input
                      type="text"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="Tito's / Fever-Tree / Modelo"
                      className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Manufacturer</label>
                    <input
                      type="text"
                      value={manufacturerName}
                      onChange={(e) => setManufacturerName(e.target.value)}
                      placeholder="Manufacturer or producer"
                      className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as Category)}
                      className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                    >
                      {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Inventory tracking unit</label>
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value as Unit)}
                      className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                    >
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <p className="mt-1 text-[11px] text-text-muted">
                      Use the unit your team physically counts on the shelf. For bottled wine, this is usually `bottle`, not `ml`.
                    </p>
                  </div>
                  <div className="md:col-span-2 rounded-xl border border-border/80 bg-bg-secondary px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-medium text-text-secondary">Product identifiers</div>
                      <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                        {selectedIdentityCount > 0 ? `${selectedIdentityCount} loaded` : 'Optional'}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <input
                        type="text"
                        value={gtin}
                        onChange={(e) => setGtin(e.target.value)}
                        placeholder="GTIN"
                        className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                      />
                      <input
                        type="text"
                        value={upc}
                        onChange={(e) => setUpc(e.target.value)}
                        placeholder="UPC"
                        className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                      />
                      <input
                        type="text"
                        value={syscoSupc}
                        onChange={(e) => setSyscoSupc(e.target.value)}
                        placeholder="Sysco SUPC"
                        className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                      />
                      <input
                        type="text"
                        value={manufacturerItemCode}
                        onChange={(e) => setManufacturerItemCode(e.target.value)}
                        placeholder="Vendor / manufacturer code"
                        className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border p-4">
                <p className="text-xs font-medium text-text-secondary">Purchase pack</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Purchase unit</label>
                    <select
                      value={orderUnit}
                      onChange={(e) => setOrderUnit((e.target.value as Unit | '') ?? '')}
                      className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                    >
                      <option value="">—</option>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Purchase price</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={orderUnitPrice}
                      onChange={(e) => setOrderUnitPrice(e.target.value)}
                      placeholder="e.g. 120"
                      className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Units inside each purchase</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={qtyPerUnit}
                      onChange={(e) => setQtyPerUnit(e.target.value)}
                      placeholder="e.g. 6"
                      className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Individual counted unit</label>
                    <select
                      value={innerUnit}
                      onChange={(e) => setInnerUnit((e.target.value as Unit | '') ?? '')}
                      className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                    >
                      <option value="">Use tracking unit</option>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border p-4">
                <p className="text-xs font-medium text-text-secondary">Measurable content for recipes and usage</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Content per counted unit</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={itemSizeValue}
                      onChange={(e) => setItemSizeValue(e.target.value)}
                      placeholder="e.g. 750"
                      className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Measurable unit</label>
                    <select
                      value={itemSizeUnit}
                      onChange={(e) => setItemSizeUnit((e.target.value as Unit | '') ?? '')}
                      className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
                    >
                      <option value="">—</option>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <InventoryUnitEconomicsSummary
              input={{
                baseUnit: unit,
                orderUnit,
                orderUnitPrice,
                qtyPerUnit,
                innerUnit,
                itemSizeValue,
                itemSizeUnit,
              }}
            />
          </div>
          {createItem.error && (
            <div className="text-accent-red text-xs">{createItem.error.message}</div>
          )}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createItem.isPending}
              className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-50 transition-colors"
            >
              {createItem.isPending ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function inferCategoryFromProduct(product: { product_name: string; brand_name: string | null; pack_text: string | null }): Category | null {
  const text = [product.brand_name, product.product_name, product.pack_text].filter(Boolean).join(' ').toLowerCase();
  if (/(vodka|gin|rum|tequila|whiskey|whisky|bourbon|liqueur|mezcal|cordial|amaro|cognac|brandy)/.test(text)) return 'Spirits';
  if (/(beer|ipa|lager|ale|stout|porter|pilsner|seltzer)/.test(text)) return 'Beer';
  if (/(wine|cabernet|pinot|sauvignon|chardonnay|merlot|rose|prosecco|champagne)/.test(text)) return 'Wine';
  if (/(mixer|tonic|soda|cola|ginger beer|ginger ale|juice|syrup|bitters|mix)/.test(text)) return 'Mixers';
  return null;
}

function inferInventoryUnitFromProduct(product: { product_name: string; pack_text: string | null; size_text: string | null }): Unit | null {
  const text = [product.product_name, product.pack_text, product.size_text].filter(Boolean).join(' ').toLowerCase();
  if (/\bcan\b|\bcans\b/.test(text)) return 'can';
  if (/\bbottle\b|\bbtls?\b/.test(text)) return 'bottle';
  return null;
}

function inferOrderUnitFromProduct(product: { pack_text: string | null; size_text: string | null }): Unit | '' {
  const text = [product.pack_text, product.size_text].filter(Boolean).join(' ').toLowerCase();
  if (/\bcase\b|\bcs\b|\d+\s*\/\s*\d+/.test(text)) return 'case';
  if (/\bpack\b/.test(text)) return 'pack';
  if (/\bbox\b/.test(text)) return 'box';
  return '';
}

function inferSizeFromProduct(product: { size_text: string | null; product_name: string }): { value: number; unit: Unit } | null {
  const source = product.size_text ?? product.product_name;
  const match = source.match(/(\d+(?:\.\d+)?)\s*(ml|l|fl\s?oz|oz)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unitRaw = match[2].toLowerCase().replace(/\s+/g, ' ');
  if (unitRaw === 'ml') return { value, unit: 'ml' };
  if (unitRaw === 'l') return { value, unit: 'L' };
  if (unitRaw === 'fl oz') return { value, unit: 'fl oz' };
  return { value, unit: 'oz' };
}
