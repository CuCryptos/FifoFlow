import * as XLSX from 'xlsx';
import type { Item, StorageArea } from '@fifoflow/shared';

export type GroupBy = 'storage_area' | 'venue' | 'vendor';

interface ExportOptions {
  items: Item[];
  areas: StorageArea[];
  areaLookup: Map<number, string>;
  venueLookup: Map<number, string>;
  vendorLookup: Map<number, string>;
  groupBy: GroupBy;
  format: 'xlsx' | 'pdf';
}

interface RowData {
  Name: string;
  Category: string;
  Group: string;
  Unit: string;
  'In Stock': number;
  'Unit Price': number | null;
  'Case Price': number | null;
  'Total Value': number | null;
}

function getGroupName(item: Item, groupBy: GroupBy, areaLookup: Map<number, string>, venueLookup: Map<number, string>, vendorLookup: Map<number, string>): string {
  switch (groupBy) {
    case 'storage_area':
      return item.storage_area_id ? (areaLookup.get(item.storage_area_id) ?? 'Unassigned') : 'Unassigned';
    case 'venue':
      return item.venue_id ? (venueLookup.get(item.venue_id) ?? 'Unassigned') : 'Unassigned';
    case 'vendor':
      return item.vendor_id ? (vendorLookup.get(item.vendor_id) ?? 'Unassigned') : 'Unassigned';
  }
}

function groupByLabel(groupBy: GroupBy): string {
  switch (groupBy) {
    case 'storage_area': return 'Storage Area';
    case 'venue': return 'Venue';
    case 'vendor': return 'Vendor';
  }
}

function buildRows(items: Item[], groupBy: GroupBy, areaLookup: Map<number, string>, venueLookup: Map<number, string>, vendorLookup: Map<number, string>): RowData[] {
  return items.map((item) => {
    const unitPrice =
      item.order_unit_price != null && item.qty_per_unit != null && item.qty_per_unit > 0
        ? item.order_unit_price / item.qty_per_unit
        : item.order_unit_price;
    const totalValue =
      item.order_unit_price != null && item.current_qty > 0 ? item.order_unit_price * item.current_qty : null;

    return {
      Name: item.name,
      Category: item.category,
      Group: getGroupName(item, groupBy, areaLookup, venueLookup, vendorLookup),
      Unit: item.unit,
      'In Stock': item.current_qty,
      'Unit Price': unitPrice != null ? Math.round(unitPrice * 100) / 100 : null,
      'Case Price': item.order_unit_price,
      'Total Value': totalValue != null ? Math.round(totalValue * 100) / 100 : null,
    };
  });
}

function groupRows(rows: RowData[]): Map<string, RowData[]> {
  const groups = new Map<string, RowData[]>();
  for (const row of rows) {
    const group = row.Group;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(row);
  }
  const sorted = new Map<string, RowData[]>();
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });
  for (const key of keys) {
    sorted.set(key, groups.get(key)!);
  }
  return sorted;
}

function fmt(n: number | null): string {
  if (n == null) return '';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function exportToExcel(opts: ExportOptions) {
  const label = groupByLabel(opts.groupBy);
  const rows = buildRows(opts.items, opts.groupBy, opts.areaLookup, opts.venueLookup, opts.vendorLookup);
  const grouped = groupRows(rows);

  const sheetData: Record<string, string | number | null>[] = [];
  let grandTotal = 0;
  let grandItems = 0;

  for (const [group, groupRowList] of grouped) {
    sheetData.push({ Name: `— ${group} —`, Category: '', [label]: '', Unit: '', 'In Stock': null, 'Unit Price': null, 'Case Price': null, 'Total Value': null });

    let groupTotal = 0;
    let groupItemCount = 0;
    for (const row of groupRowList) {
      const { Group: _, ...rest } = row;
      sheetData.push({ ...rest, [label]: row.Group } as unknown as Record<string, string | number | null>);
      groupTotal += row['Total Value'] ?? 0;
      groupItemCount += row['In Stock'];
    }

    sheetData.push({
      Name: `${group} Total`,
      Category: '',
      [label]: '',
      Unit: '',
      'In Stock': groupItemCount,
      'Unit Price': null,
      'Case Price': null,
      'Total Value': groupTotal > 0 ? Math.round(groupTotal * 100) / 100 : null,
    });
    sheetData.push({});

    grandTotal += groupTotal;
    grandItems += groupItemCount;
  }

  sheetData.push({
    Name: 'GRAND TOTAL',
    Category: '',
    [label]: '',
    Unit: '',
    'In Stock': grandItems,
    'Unit Price': null,
    'Case Price': null,
    'Total Value': grandTotal > 0 ? Math.round(grandTotal * 100) / 100 : null,
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheetData);

  ws['!cols'] = [
    { wch: 40 }, // Name
    { wch: 18 }, // Category
    { wch: 18 }, // Group label
    { wch: 8 },  // Unit
    { wch: 10 }, // In Stock
    { wch: 12 }, // Unit Price
    { wch: 12 }, // Case Price
    { wch: 14 }, // Total Value
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
  XLSX.writeFile(wb, `inventory-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportToPdf(opts: ExportOptions) {
  const label = groupByLabel(opts.groupBy);
  const rows = buildRows(opts.items, opts.groupBy, opts.areaLookup, opts.venueLookup, opts.vendorLookup);
  const grouped = groupRows(rows);

  let grandTotal = 0;
  let grandItems = 0;

  let html = `<!DOCTYPE html>
<html><head><title>Inventory Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #111; padding: 20px; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .date { color: #666; margin-bottom: 4px; font-size: 11px; }
  .grouped-by { color: #666; margin-bottom: 16px; font-size: 11px; font-style: italic; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f3f4f6; text-align: left; padding: 6px 8px; border-bottom: 2px solid #d1d5db; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
  .text-right { text-align: right; }
  .area-header { background: #eef2ff; font-weight: 600; font-size: 12px; }
  .area-header td { padding: 8px; border-bottom: 2px solid #c7d2fe; }
  .subtotal { background: #f9fafb; font-weight: 600; }
  .subtotal td { border-top: 1px solid #9ca3af; border-bottom: 2px solid #d1d5db; }
  .grand-total { background: #1e1b4b; color: white; font-weight: 700; font-size: 12px; }
  .grand-total td { padding: 8px; }
  .mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
  @media print { body { padding: 0; } }
</style>
</head><body>
<h1>Inventory Report</h1>
<div class="date">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
<div class="grouped-by">Grouped by: ${label}</div>
<table>
<thead><tr>
  <th>Name</th>
  <th>Category</th>
  <th class="text-right">In Stock</th>
  <th>Unit</th>
  <th class="text-right">Unit Price</th>
  <th class="text-right">Case Price</th>
  <th class="text-right">Total Value</th>
</tr></thead>
<tbody>`;

  for (const [group, groupRowList] of grouped) {
    let groupTotal = 0;
    let groupItemCount = 0;

    html += `<tr class="area-header"><td colspan="7">${group}</td></tr>`;

    for (const row of groupRowList) {
      groupTotal += row['Total Value'] ?? 0;
      groupItemCount += row['In Stock'];
      html += `<tr>
        <td>${row.Name}</td>
        <td>${row.Category}</td>
        <td class="text-right mono">${row['In Stock']}</td>
        <td>${row.Unit}</td>
        <td class="text-right mono">${fmt(row['Unit Price'])}</td>
        <td class="text-right mono">${fmt(row['Case Price'])}</td>
        <td class="text-right mono">${fmt(row['Total Value'])}</td>
      </tr>`;
    }

    html += `<tr class="subtotal">
      <td colspan="2">${group} — ${groupRowList.length} items</td>
      <td class="text-right mono">${groupItemCount}</td>
      <td></td>
      <td></td>
      <td></td>
      <td class="text-right mono">${fmt(Math.round(groupTotal * 100) / 100)}</td>
    </tr>`;

    grandTotal += groupTotal;
    grandItems += groupItemCount;
  }

  html += `<tr class="grand-total">
    <td colspan="2">GRAND TOTAL — ${opts.items.length} items</td>
    <td class="text-right mono">${grandItems}</td>
    <td></td>
    <td></td>
    <td></td>
    <td class="text-right mono">${fmt(Math.round(grandTotal * 100) / 100)}</td>
  </tr>`;

  html += `</tbody></table></body></html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
  };
}
