import type { Item, StorageArea, Vendor, Venue } from '@fifoflow/shared';
import type { GroupBy } from '../../utils/exportInventory';
import type { InventoryBarExportMode, InventoryExportGroupBy } from '../../hooks/useInventoryWorkflow';

export function InventoryPageActions({
  exportGroupBy,
  onExportGroupByChange,
  barExportMode,
  onBarExportModeChange,
  areas,
  vendors,
  venues,
  sortedItems,
  onOpenInvoiceUpload,
  onOpenAddItem,
  onOpenManageCategories,
}: {
  exportGroupBy: InventoryExportGroupBy;
  onExportGroupByChange: (value: InventoryExportGroupBy) => void;
  barExportMode: InventoryBarExportMode;
  onBarExportModeChange: (value: InventoryBarExportMode) => void;
  areas: StorageArea[];
  vendors: Vendor[];
  venues: Venue[];
  sortedItems: Item[];
  onOpenInvoiceUpload: () => void;
  onOpenAddItem: () => void;
  onOpenManageCategories: () => void;
}) {
  return (
    <>
      <select
        value={exportGroupBy}
        onChange={(e) => onExportGroupByChange(e.target.value as InventoryExportGroupBy)}
        className="rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
      >
        <option value="storage_area">Group by Area</option>
        <option value="venue">Group by Venue</option>
        <option value="vendor">Group by Vendor</option>
      </select>
      <select
        value={barExportMode}
        onChange={(e) => onBarExportModeChange(e.target.value as InventoryBarExportMode)}
        className="rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
      >
        <option value="combined">Bar Combined</option>
        <option value="split_bar">Split Alcohol / NA</option>
      </select>
      <button
        onClick={async () => {
          const aLookup = new Map(areas.map((a) => [a.id, a.name]));
          const venueLookup = new Map(venues.map((v) => [v.id, v.name]));
          const vendorLookup = new Map(vendors.map((v) => [v.id, v.name]));
          const { exportToPdf } = await import('../../utils/exportInventory');
          exportToPdf({
            items: sortedItems,
            areas,
            areaLookup: aLookup,
            venueLookup,
            vendorLookup,
            groupBy: exportGroupBy as GroupBy,
            barMode: barExportMode,
            format: 'pdf',
          });
        }}
        className="rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
      >
        Export PDF
      </button>
      <button
        onClick={async () => {
          const aLookup = new Map(areas.map((a) => [a.id, a.name]));
          const venueLookup = new Map(venues.map((v) => [v.id, v.name]));
          const vendorLookup = new Map(vendors.map((v) => [v.id, v.name]));
          const { exportToExcel } = await import('../../utils/exportInventory');
          exportToExcel({
            items: sortedItems,
            areas,
            areaLookup: aLookup,
            venueLookup,
            vendorLookup,
            groupBy: exportGroupBy as GroupBy,
            barMode: barExportMode,
            format: 'xlsx',
          });
        }}
        className="rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
      >
        Export Excel
      </button>
      <button
        onClick={onOpenManageCategories}
        className="rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
      >
        Manage Categories
      </button>
      <button
        onClick={onOpenInvoiceUpload}
        className="rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
      >
        Upload Invoice
      </button>
      <button
        onClick={onOpenAddItem}
        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Add Item
      </button>
    </>
  );
}
