import * as XLSX from 'xlsx';
import type { ProteinUsageSummaryPayload } from '../api';

interface ExportProteinUsageOptions {
  summary: ProteinUsageSummaryPayload;
  venueName?: string | null;
}

function ceilToOneDecimal(value: number): number {
  return Math.ceil(value * 10) / 10;
}

function roundGuestCount(value: number): number {
  return Math.ceil(value);
}

function formatRoundedUsage(value: number): string {
  const rounded = ceilToOneDecimal(value);
  return rounded.toFixed(1).replace(/\.0$/, '');
}

function formatCaseDisplay(caseValue: number | null, caseUnitLabel: string): string {
  if (caseValue == null) {
    return `Set ${caseUnitLabel}`;
  }
  const roundedValue = ceilToOneDecimal(caseValue);
  return `${formatRoundedUsage(caseValue)} ${caseUnitLabel}${roundedValue === 1 ? '' : 's'}`;
}

function formatPortionDisplay(value: number, unitLabel: string): string {
  const roundedValue = ceilToOneDecimal(value);
  return `${formatRoundedUsage(value)} ${unitLabel}${roundedValue === 1 ? '' : 's'}`;
}

function buildTotalSheetRows(summary: ProteinUsageSummaryPayload): Record<string, string | number | null>[] {
  return summary.proteins.map((protein) => {
    const totalRow = summary.totals.find((row) => row.protein_item_id === protein.id);
    return {
      Protein: protein.name,
      'Projected Cases': totalRow?.projected_case_usage != null ? ceilToOneDecimal(totalRow.projected_case_usage) : null,
      'Projected Portions': ceilToOneDecimal(totalRow?.projected_usage ?? 0),
      'Historical Cases': totalRow?.historical_case_usage != null ? ceilToOneDecimal(totalRow.historical_case_usage) : null,
      'Historical Portions': ceilToOneDecimal(totalRow?.historical_usage ?? 0),
      'Case Unit': totalRow?.case_unit_label ?? protein.case_unit_label,
      'Portion Unit': totalRow?.unit_label ?? protein.unit_label,
    };
  });
}

function buildPeriodSheetRows(summary: ProteinUsageSummaryPayload, mode: 'projected' | 'historical'): Record<string, string | number | null>[] {
  const rows = summary.periods.map((period) => {
    const row: Record<string, string | number | null> = {
      Period: period.period,
      Guests: roundGuestCount(mode === 'projected' ? period.projected_guest_count : period.historical_guest_count),
    };

    for (const protein of summary.proteins) {
      const proteinRow = period.proteins.find((entry) => entry.protein_item_id === protein.id);
      const caseValue = mode === 'projected' ? proteinRow?.projected_case_usage ?? null : proteinRow?.historical_case_usage ?? null;
      const portionValue = mode === 'projected' ? proteinRow?.projected_usage ?? 0 : proteinRow?.historical_usage ?? 0;

      row[`${protein.name} Cases`] = caseValue != null ? ceilToOneDecimal(caseValue) : null;
      row[`${protein.name} Portions`] = ceilToOneDecimal(portionValue);
    }

    return row;
  });

  const totalRow: Record<string, string | number | null> = {
    Period: 'TOTAL',
    Guests: roundGuestCount(
      summary.periods.reduce(
        (sum, period) => sum + (mode === 'projected' ? period.projected_guest_count : period.historical_guest_count),
        0,
      ),
    ),
  };

  for (const protein of summary.proteins) {
    const total = summary.totals.find((row) => row.protein_item_id === protein.id);
    totalRow[`${protein.name} Cases`] = mode === 'projected'
      ? (total?.projected_case_usage != null ? ceilToOneDecimal(total.projected_case_usage) : null)
      : (total?.historical_case_usage != null ? ceilToOneDecimal(total.historical_case_usage) : null);
    totalRow[`${protein.name} Portions`] = mode === 'projected'
      ? ceilToOneDecimal(total?.projected_usage ?? 0)
      : ceilToOneDecimal(total?.historical_usage ?? 0);
  }

  rows.push(totalRow);
  return rows;
}

export function exportProteinUsageToExcel({ summary, venueName }: ExportProteinUsageOptions) {
  const workbook = XLSX.utils.book_new();

  const overviewRows = [
    { Field: 'Venue', Value: venueName ?? 'Unknown venue' },
    { Field: 'Window Start', Value: summary.filters.start },
    { Field: 'Window End', Value: summary.filters.end },
    { Field: 'Grouped By', Value: summary.filters.group_by },
    { Field: 'Generated On', Value: new Date().toISOString() },
  ];

  const overviewSheet = XLSX.utils.json_to_sheet(overviewRows);
  overviewSheet['!cols'] = [{ wch: 18 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');

  const totalsSheet = XLSX.utils.json_to_sheet(buildTotalSheetRows(summary));
  totalsSheet['!cols'] = [
    { wch: 24 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 12 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(workbook, totalsSheet, 'Totals');

  const projectedSheet = XLSX.utils.json_to_sheet(buildPeriodSheetRows(summary, 'projected'));
  projectedSheet['!cols'] = [
    { wch: 16 },
    { wch: 10 },
    ...summary.proteins.flatMap(() => [{ wch: 16 }, { wch: 18 }]),
  ];
  XLSX.utils.book_append_sheet(workbook, projectedSheet, 'Projected');

  const historicalSheet = XLSX.utils.json_to_sheet(buildPeriodSheetRows(summary, 'historical'));
  historicalSheet['!cols'] = [
    { wch: 16 },
    { wch: 10 },
    ...summary.proteins.flatMap(() => [{ wch: 16 }, { wch: 18 }]),
  ];
  XLSX.utils.book_append_sheet(workbook, historicalSheet, 'Historical');

  if (summary.unmapped_forecast_products.length > 0) {
    const unmappedSheet = XLSX.utils.json_to_sheet(
      summary.unmapped_forecast_products.map((row) => ({
        Product: row.product_name,
        Guests: row.total_guest_count,
        'Entry Count': row.entry_count,
        'First Date': row.first_date,
        'Last Date': row.last_date,
      })),
    );
    unmappedSheet['!cols'] = [{ wch: 32 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(workbook, unmappedSheet, 'Unmapped Products');
  }

  XLSX.writeFile(workbook, `protein-usage-${summary.filters.start}-to-${summary.filters.end}.xlsx`);
}

function buildSectionHtml(
  title: string,
  subtitle: string,
  mode: 'projected' | 'historical',
  summary: ProteinUsageSummaryPayload,
): string {
  const guestLabel = mode === 'projected' ? 'Projected guests' : 'Historical guests';
  const totals = summary.proteins.map((protein) => {
    const totalRow = summary.totals.find((row) => row.protein_item_id === protein.id);
    const caseValue = mode === 'projected' ? totalRow?.projected_case_usage ?? null : totalRow?.historical_case_usage ?? null;
    const portionValue = mode === 'projected' ? totalRow?.projected_usage ?? 0 : totalRow?.historical_usage ?? 0;

    return `<div class="metric-card">
      <div class="metric-label">${protein.name}</div>
      <div class="metric-value">${formatCaseDisplay(caseValue, totalRow?.case_unit_label ?? protein.case_unit_label)}</div>
      <div class="metric-detail">${formatPortionDisplay(portionValue, totalRow?.unit_label ?? protein.unit_label)}</div>
    </div>`;
  }).join('');

  const rows = summary.periods.map((period) => {
    const guestCount = mode === 'projected' ? period.projected_guest_count : period.historical_guest_count;
    const cells = summary.proteins.map((protein) => {
      const proteinRow = period.proteins.find((entry) => entry.protein_item_id === protein.id);
      const caseValue = mode === 'projected' ? proteinRow?.projected_case_usage ?? null : proteinRow?.historical_case_usage ?? null;
      const portionValue = mode === 'projected' ? proteinRow?.projected_usage ?? 0 : proteinRow?.historical_usage ?? 0;
      return `<td>
        <div class="cell-primary">${formatCaseDisplay(caseValue, proteinRow?.case_unit_label ?? protein.case_unit_label)}</div>
        <div class="cell-secondary">${formatPortionDisplay(portionValue, proteinRow?.unit_label ?? protein.unit_label)}</div>
      </td>`;
    }).join('');

    return `<tr>
      <td>${period.period}</td>
      <td class="text-right mono">${roundGuestCount(guestCount)}</td>
      ${cells}
    </tr>`;
  }).join('');

  const totalRowCells = summary.proteins.map((protein) => {
    const total = summary.totals.find((row) => row.protein_item_id === protein.id);
    const caseValue = mode === 'projected' ? total?.projected_case_usage ?? null : total?.historical_case_usage ?? null;
    const portionValue = mode === 'projected' ? total?.projected_usage ?? 0 : total?.historical_usage ?? 0;

    return `<td>
      <div class="cell-primary">${formatCaseDisplay(caseValue, total?.case_unit_label ?? protein.case_unit_label)}</div>
      <div class="cell-secondary">${formatPortionDisplay(portionValue, total?.unit_label ?? protein.unit_label)}</div>
    </td>`;
  }).join('');

  const totalGuests = roundGuestCount(
    summary.periods.reduce(
      (sum, period) => sum + (mode === 'projected' ? period.projected_guest_count : period.historical_guest_count),
      0,
    ),
  );

  return `<section class="usage-section">
    <div class="section-eyebrow">${title}</div>
    <h2>${title}</h2>
    <div class="section-subtitle">${subtitle}</div>
    <div class="metric-grid">${totals}</div>
    <table>
      <thead>
        <tr>
          <th>Period</th>
          <th class="text-right">${guestLabel}</th>
          ${summary.proteins.map((protein) => `<th>${protein.name}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="${2 + summary.proteins.length}" class="empty">No ${mode} usage in the selected window.</td></tr>`}
        <tr class="total-row">
          <td>TOTAL</td>
          <td class="text-right mono">${totalGuests}</td>
          ${totalRowCells}
        </tr>
      </tbody>
    </table>
  </section>`;
}

export function exportProteinUsageToPdf({ summary, venueName }: ExportProteinUsageOptions) {
  const html = `<!DOCTYPE html>
<html>
  <head>
    <title>Protein Usage Report</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; background: #ffffff; }
      h1 { margin: 0; font-size: 24px; }
      h2 { margin: 4px 0 0; font-size: 20px; }
      .meta { margin-top: 8px; color: #475569; font-size: 12px; }
      .report-header { margin-bottom: 20px; }
      .usage-section { margin-top: 24px; page-break-inside: avoid; }
      .section-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; color: #64748b; font-weight: 700; }
      .section-subtitle { margin-top: 6px; color: #475569; font-size: 13px; }
      .metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
      .metric-card { border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 16px; padding: 14px; }
      .metric-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: #64748b; font-weight: 700; }
      .metric-value { margin-top: 10px; font-size: 26px; font-weight: 700; color: #0f172a; }
      .metric-detail { margin-top: 6px; font-size: 13px; color: #475569; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th { background: #f8fafc; color: #475569; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; padding: 10px 12px; border-bottom: 2px solid #e2e8f0; }
      td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      .total-row td { background: #e2e8f0; border-top: 2px solid #94a3b8; font-weight: 700; }
      .text-right { text-align: right; }
      .mono { font-variant-numeric: tabular-nums; }
      .cell-primary { font-size: 14px; font-weight: 700; color: #0f172a; }
      .cell-secondary { margin-top: 4px; font-size: 11px; color: #64748b; }
      .empty { text-align: center; color: #64748b; padding: 18px; }
      .warning-box { margin-top: 20px; border: 1px solid #fcd34d; background: #fffbeb; border-radius: 16px; padding: 14px; }
      .warning-title { font-size: 13px; font-weight: 700; color: #92400e; }
      .warning-list { margin-top: 8px; font-size: 12px; color: #92400e; }
      @media print {
        body { padding: 0; }
      }
    </style>
  </head>
  <body>
    <div class="report-header">
      <h1>Protein Usage Report</h1>
      <div class="meta">Venue: ${venueName ?? 'Unknown venue'}</div>
      <div class="meta">Window: ${summary.filters.start} to ${summary.filters.end}</div>
      <div class="meta">Grouped by: ${summary.filters.group_by}</div>
      <div class="meta">Generated: ${new Date().toLocaleString('en-US')}</div>
    </div>
    ${buildSectionHtml('Projected Usage', 'Forward-looking demand across the selected window.', 'projected', summary)}
    ${buildSectionHtml('Historical Usage', 'Consumed demand already elapsed in the selected window.', 'historical', summary)}
    ${summary.unmapped_forecast_products.length > 0 ? `
      <div class="warning-box">
        <div class="warning-title">Forecast products missing protein rules</div>
        <div class="warning-list">
          ${summary.unmapped_forecast_products.map((row) => `${row.product_name} (${row.total_guest_count} guests)`).join('<br/>')}
        </div>
      </div>
    ` : ''}
  </body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
  };
}
