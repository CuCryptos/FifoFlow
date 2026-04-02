import * as XLSX from 'xlsx';
import type { Item, StorageArea } from '@fifoflow/shared';

export type GroupBy = 'storage_area' | 'venue' | 'vendor';
export type BarMode = 'combined' | 'split_bar';

interface ExportOptions {
  items: Item[];
  areas: StorageArea[];
  areaLookup: Map<number, string>;
  venueLookup: Map<number, string>;
  vendorLookup: Map<number, string>;
  groupBy: GroupBy;
  barMode: BarMode;
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
  Section: ExportSection;
}

type ExportSection = 'Alcohol' | 'Non-Alcohol' | 'Other Inventory';

const ALCOHOL_CATEGORIES = new Set(['Beer', 'Wine', 'Spirits', 'Ready to Drink']);
const NON_ALCOHOL_CATEGORIES = new Set(['Mixer', 'Mixers', 'Non-Alcoholic', 'Beverages']);
const OTHER_INVENTORY_CATEGORIES = new Set(['Glassware', 'Bar Supplies']);
const SECTION_ORDER: ExportSection[] = ['Alcohol', 'Non-Alcohol', 'Other Inventory'];
const ALCOHOL_NAME_PATTERNS = [
  /\bale\b/i,
  /\bbeer\b/i,
  /\bbourbon\b/i,
  /\bbrandy\b/i,
  /\bchampagne\b/i,
  /\bcider\b/i,
  /\bcognac\b/i,
  /\bgin\b/i,
  /\blique?u?r\b/i,
  /\bliqeuer\b/i,
  /\bliquor\b/i,
  /\bmezcal\b/i,
  /\bprosecco\b/i,
  /\brtd\b/i,
  /\brum\b/i,
  /\bsake\b/i,
  /\bscotch\b/i,
  /\bspirits?\b/i,
  /\bstout\b/i,
  /\btequila\b/i,
  /\bvodka\b/i,
  /\bvermouth\b/i,
  /\bwhisk(?:e)?y\b/i,
  /\bwine\b/i,
];

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

function classifyBarSection(item: Item): ExportSection {
  if (NON_ALCOHOL_CATEGORIES.has(item.category)) {
    return 'Non-Alcohol';
  }
  if (OTHER_INVENTORY_CATEGORIES.has(item.category)) {
    return 'Other Inventory';
  }
  if (ALCOHOL_NAME_PATTERNS.some((pattern) => pattern.test(item.name))) {
    return 'Alcohol';
  }
  if (ALCOHOL_CATEGORIES.has(item.category)) {
    return 'Alcohol';
  }
  return 'Other Inventory';
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
      Section: classifyBarSection(item),
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

function buildSections(rows: RowData[], barMode: BarMode): Array<{ title: ExportSection | 'Inventory'; rows: RowData[] }> {
  if (barMode === 'combined') {
    return [{ title: 'Inventory', rows }];
  }

  return SECTION_ORDER
    .map((title) => ({
      title,
      rows: rows.filter((row) => row.Section === title),
    }))
    .filter((section) => section.rows.length > 0);
}

function buildSheetData(rows: RowData[], label: string) {
  const grouped = groupRows(rows);
  const sheetData: Record<string, string | number | null>[] = [];
  let grandTotal = 0;
  let grandItems = 0;

  for (const [group, groupRowList] of grouped) {
    sheetData.push({ Name: `— ${group} —`, Category: '', [label]: '', Unit: '', 'In Stock': null, 'Unit Price': null, 'Case Price': null, 'Total Value': null });

    let groupTotal = 0;
    let groupItemCount = 0;
    for (const row of groupRowList) {
      const { Group: _, Section: __, ...rest } = row;
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

  return {
    sheetData,
    grandTotal,
    grandItems,
  };
}

function fmt(n: number | null): string {
  if (n == null) return '';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function exportToExcel(opts: ExportOptions) {
  const label = groupByLabel(opts.groupBy);
  const rows = buildRows(opts.items, opts.groupBy, opts.areaLookup, opts.venueLookup, opts.vendorLookup);
  const sections = buildSections(rows, opts.barMode);
  const wb = XLSX.utils.book_new();

  sections.forEach((section, index) => {
    const { sheetData, grandItems, grandTotal } = buildSheetData(section.rows, label);
    sheetData.push({
      Name: section.title === 'Inventory' ? 'GRAND TOTAL' : `${section.title.toUpperCase()} TOTAL`,
      Category: '',
      [label]: '',
      Unit: '',
      'In Stock': grandItems,
      'Unit Price': null,
      'Case Price': null,
      'Total Value': grandTotal > 0 ? Math.round(grandTotal * 100) / 100 : null,
    });

    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [
      { wch: 40 },
      { wch: 18 },
      { wch: 18 },
      { wch: 8 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
    ];

    const sheetName = section.title === 'Inventory'
      ? 'Inventory'
      : section.title.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, index === 0 ? sheetName : sheetName);
  });

  const suffix = opts.barMode === 'split_bar' ? 'inventory-bar-split' : 'inventory';
  XLSX.writeFile(wb, `${suffix}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportToPdf(opts: ExportOptions) {
  const label = groupByLabel(opts.groupBy);
  const rows = buildRows(opts.items, opts.groupBy, opts.areaLookup, opts.venueLookup, opts.vendorLookup);
  const sections = buildSections(rows, opts.barMode);

  let overallGrandTotal = 0;
  let overallGrandItems = 0;

  let html = `<!DOCTYPE html>
<html><head><title>Inventory Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #111; padding: 20px; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  h2 { font-size: 14px; margin: 18px 0 8px; }
  .date { color: #666; margin-bottom: 4px; font-size: 11px; }
  .grouped-by { color: #666; margin-bottom: 12px; font-size: 11px; font-style: italic; }
  .bar-mode { color: #475569; margin-bottom: 12px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f3f4f6; text-align: left; padding: 6px 8px; border-bottom: 2px solid #d1d5db; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
  .text-right { text-align: right; }
  .group-header { background: #eef2ff; font-weight: 600; font-size: 12px; }
  .group-header td { padding: 8px; border-bottom: 2px solid #c7d2fe; }
  .subtotal { background: #f9fafb; font-weight: 600; }
  .subtotal td { border-top: 1px solid #9ca3af; border-bottom: 2px solid #d1d5db; }
  .section-total { background: #e2e8f0; font-weight: 700; }
  .section-total td { padding: 8px; }
  .grand-total { background: #1e1b4b; color: white; font-weight: 700; font-size: 12px; }
  .grand-total td { padding: 8px; }
  .mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
  @media print { body { padding: 0; } }
</style>
</head><body>
<h1>Inventory Report</h1>
<div class="date">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
<div class="grouped-by">Grouped by: ${label}</div>
<div class="bar-mode">${opts.barMode === 'split_bar' ? 'Bar split: Alcohol vs Non-Alcohol' : 'Bar split: Combined'}</div>`;

  for (const section of sections) {
    const grouped = groupRows(section.rows);
    let sectionGrandTotal = 0;
    let sectionGrandItems = 0;

    html += `<h2>${escapeHtml(section.title)}</h2>
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

      html += `<tr class="group-header"><td colspan="7">${escapeHtml(group)}</td></tr>`;

      for (const row of groupRowList) {
        groupTotal += row['Total Value'] ?? 0;
        groupItemCount += row['In Stock'];
        html += `<tr>
          <td>${escapeHtml(row.Name)}</td>
          <td>${escapeHtml(row.Category)}</td>
          <td class="text-right mono">${row['In Stock']}</td>
          <td>${escapeHtml(row.Unit)}</td>
          <td class="text-right mono">${fmt(row['Unit Price'])}</td>
          <td class="text-right mono">${fmt(row['Case Price'])}</td>
          <td class="text-right mono">${fmt(row['Total Value'])}</td>
        </tr>`;
      }

      html += `<tr class="subtotal">
        <td colspan="2">${escapeHtml(group)} — ${groupRowList.length} items</td>
        <td class="text-right mono">${groupItemCount}</td>
        <td></td>
        <td></td>
        <td></td>
        <td class="text-right mono">${fmt(Math.round(groupTotal * 100) / 100)}</td>
      </tr>`;

      sectionGrandTotal += groupTotal;
      sectionGrandItems += groupItemCount;
    }

    html += `<tr class="section-total">
      <td colspan="2">${escapeHtml(section.title)} Total</td>
      <td class="text-right mono">${sectionGrandItems}</td>
      <td></td>
      <td></td>
      <td></td>
      <td class="text-right mono">${fmt(Math.round(sectionGrandTotal * 100) / 100)}</td>
    </tr>
</tbody></table>`;

    overallGrandTotal += sectionGrandTotal;
    overallGrandItems += sectionGrandItems;
  }

  html += `<table><tbody><tr class="grand-total">
    <td colspan="2">GRAND TOTAL — ${opts.items.length} items</td>
    <td class="text-right mono">${overallGrandItems}</td>
    <td></td>
    <td></td>
    <td></td>
    <td class="text-right mono">${fmt(Math.round(overallGrandTotal * 100) / 100)}</td>
  </tr></tbody></table>`;

  html += `</body></html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
  };
}
