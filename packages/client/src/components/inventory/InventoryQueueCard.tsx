import { UNITS } from '@fifoflow/shared';
import type { Item, ItemStorage } from '@fifoflow/shared';
import { deriveInventoryUnitEconomics } from './InventoryUnitEconomicsSummary';
import {
  InventoryQuickEditTextField,
  InventoryQuickEditNumberField,
  InventoryQuickEditSelectField,
} from './InventoryQuickEditFields';
import { WorkflowStatusPill } from '../workflow/WorkflowPrimitives';

function formatCurrency(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function InventoryQueueCard({
  item,
  itemAreas,
  expanded,
  onToggleExpanded,
  isSelected,
  onToggleSelect,
  onOpen,
  showOrdering,
  venueName,
  storageName,
  nextAction,
  totalValue,
  reorderNeeded,
  issuePills,
  vendors,
}: {
  item: Item;
  itemAreas: ItemStorage[];
  expanded: boolean;
  onToggleExpanded: () => void;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  showOrdering: boolean;
  venueName: string;
  storageName: string;
  nextAction: string;
  totalValue: number | null;
  reorderNeeded: boolean;
  issuePills: Array<{ label: string; tone: 'blue' | 'amber' }>;
  vendors: Array<{ id: number; name: string }>;
}) {
  const hasAreas = itemAreas.length > 0;
  const topIssues = issuePills.slice(0, 2);
  const overflowIssues = issuePills.length - topIssues.length;
  const economics = deriveInventoryUnitEconomics({
    baseUnit: item.unit,
    orderUnit: item.order_unit,
    orderUnitPrice: item.order_unit_price,
    qtyPerUnit: item.qty_per_unit,
    innerUnit: item.inner_unit,
    itemSizeValue: item.item_size_value,
    itemSizeUnit: item.item_size_unit,
  });

  return (
    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start gap-3">
        <label className="mt-1 flex min-h-6 min-w-6 items-center justify-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            aria-label={`Select ${item.name}`}
            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onOpen}
                  className="truncate text-left text-base font-semibold text-slate-950 transition hover:text-slate-700"
                >
                  {item.name}
                </button>
                {isSelected && (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Selected
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                <span>{item.category}</span>
                <span className="text-slate-300">•</span>
                <span>{item.unit}</span>
                {economics.eachLine && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="truncate">{economics.eachLine}</span>
                  </>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <WorkflowStatusPill tone={reorderNeeded ? 'amber' : 'green'}>
                  {reorderNeeded ? 'Needs reorder' : 'In range'}
                </WorkflowStatusPill>
                {topIssues.map((issue) => (
                  <WorkflowStatusPill key={issue.label} tone={issue.tone}>
                    {issue.label}
                  </WorkflowStatusPill>
                ))}
                {overflowIssues > 0 && (
                  <span className="inline-flex rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    +{overflowIssues} more
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {hasAreas && (
                <button
                  type="button"
                  onClick={onToggleExpanded}
                  aria-expanded={expanded}
                  className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
                >
                  {expanded ? 'Hide area balances' : `Area balances (${itemAreas.length})`}
                </button>
              )}
              <button
                type="button"
                onClick={onOpen}
                className="inline-flex min-h-10 items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Open
              </button>
            </div>
          </div>

          {expanded && hasAreas && (
            <div className="mt-3 flex flex-wrap gap-2">
              {itemAreas.map((area) => (
                <div key={area.area_id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                  <span className="font-medium text-slate-900">{area.area_name}</span>
                  <span className="mx-2 text-slate-300">•</span>
                  <span>{area.quantity} {item.unit}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(220px,0.9fr)]">
            <div className="rounded-2xl bg-slate-50 px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Item identity</div>
              <div className="mt-3 grid gap-2">
                <InventoryQuickEditTextField
                  itemId={item.id}
                  field="name"
                  value={item.name}
                  label="Product name"
                  placeholder="Inventory item name"
                />
                <div className="text-xs text-slate-500">
                  Rename the product here or open the item drawer for a fuller edit surface.
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Stocking</div>
              <div className="mt-3 grid gap-2">
                <InventoryQuickEditNumberField
                  itemId={item.id}
                  field="current_qty"
                  value={item.current_qty}
                  label="On hand"
                  suffix={item.unit}
                />
                <div className="grid grid-cols-2 gap-2">
                  <InventoryQuickEditNumberField
                    itemId={item.id}
                    field="reorder_level"
                    value={item.reorder_level}
                    label="Reorder at"
                    suffix={item.unit}
                  />
                  <InventoryQuickEditNumberField
                    itemId={item.id}
                    field="reorder_qty"
                    value={item.reorder_qty}
                    label="Target"
                    suffix={item.unit}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Purchasing</div>
              <div className="mt-3 grid gap-2">
                <InventoryQuickEditSelectField
                  itemId={item.id}
                  field="order_unit"
                  value={item.order_unit}
                  label="Purchase unit"
                  emptyLabel="Missing"
                  options={UNITS.map((unitOption) => ({ value: unitOption, label: unitOption }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <InventoryQuickEditNumberField
                    itemId={item.id}
                    field="qty_per_unit"
                    value={item.qty_per_unit}
                    label="Units / pack"
                  />
                  <InventoryQuickEditNumberField
                    itemId={item.id}
                    field="order_unit_price"
                    value={item.order_unit_price}
                    label="Case price"
                  />
                </div>
                <div className="text-xs text-slate-600">{economics.packLine ?? 'Purchase pack incomplete'}</div>
                <div className="text-xs text-slate-500">{economics.costLine ?? 'Add case price and pack quantity'}</div>
                {showOrdering && economics.purchaseMeasureLine && (
                  <div className="text-xs text-slate-500">{economics.purchaseMeasureLine}</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Ownership</div>
              <div className="mt-3">
                <InventoryQuickEditSelectField
                  itemId={item.id}
                  field="vendor_id"
                  value={item.vendor_id}
                  label="Vendor"
                  emptyLabel="Vendor missing"
                  options={vendors.map((vendor) => ({ value: String(vendor.id), label: vendor.name }))}
                />
              </div>
              <div className="mt-3 text-sm font-medium text-slate-900">{venueName}</div>
              <div className="mt-1 text-xs text-slate-500">{storageName}</div>
            </div>

            <div className="rounded-2xl bg-slate-50 px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Next action</div>
              <div className="mt-3 text-sm font-medium leading-6 text-slate-900">
                {nextAction}
              </div>
              <div className="mt-3 text-xs text-slate-500">
                {totalValue != null ? `${formatCurrency(totalValue)} estimated value` : 'Inventory value needs cost setup'}
              </div>
              {topIssues.length === 0 && !reorderNeeded && (
                <div className="mt-3 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                  Setup is currently clean.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
