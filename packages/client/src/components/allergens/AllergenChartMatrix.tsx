import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Boxes, ChefHat, Search, ShieldCheck } from 'lucide-react';
import type { AllergenChartCellPayload, AllergenChartRowPayload } from '../../api';
import { useAllergenChart } from '../../hooks/useAllergens';
import { WorkflowEmptyState, WorkflowMetricCard, WorkflowMetricGrid, WorkflowPanel, WorkflowStatusPill } from '../workflow/WorkflowPrimitives';

type RowScope = 'all' | 'inventory_item' | 'recipe';
type RiskScope = 'all' | 'contains' | 'may_contain' | 'needs_review';

const DEFAULT_VISIBLE_CODES = new Set(['wheat', 'milk', 'egg', 'peanut', 'tree_nut', 'soy', 'fish', 'shellfish', 'sesame', 'gluten']);

export function AllergenChartMatrix({ venueId }: { venueId?: number | null }) {
  const chartQuery = useAllergenChart(venueId);
  const [search, setSearch] = useState('');
  const [rowScope, setRowScope] = useState<RowScope>('all');
  const [riskScope, setRiskScope] = useState<RiskScope>('all');
  const [showExtended, setShowExtended] = useState(false);

  const chart = chartQuery.data;
  const visibleAllergens = useMemo(() => {
    const allergens = chart?.allergens ?? [];
    return showExtended ? allergens : allergens.filter((allergen) => DEFAULT_VISIBLE_CODES.has(allergen.code));
  }, [chart?.allergens, showExtended]);

  const rows = useMemo(() => {
    const needle = normalize(search);
    return (chart?.rows ?? [])
      .filter((row) => rowScope === 'all' || row.row_type === rowScope)
      .filter((row) => {
        if (riskScope === 'contains') return row.contains_count > 0;
        if (riskScope === 'may_contain') return row.may_contain_count > 0;
        if (riskScope === 'needs_review') return row.needs_review;
        return true;
      })
      .filter((row) => {
        if (!needle) return true;
        return normalize([row.name, row.category_label, row.vendor_name ?? '', row.venue_name ?? ''].join(' ')).includes(needle);
      });
  }, [chart?.rows, riskScope, rowScope, search]);

  return (
    <WorkflowPanel
      title="Operational allergen chart"
      description="One chart for inventory items and active recipes. Inventory profiles feed recipe rollups, and low-confidence or unknown cells stay reviewable."
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <WorkflowStatusPill tone={chart?.summary.needs_review_count ? 'amber' : 'green'}>
            {chart?.summary.needs_review_count ?? 0} need review
          </WorkflowStatusPill>
          <button
            type="button"
            onClick={() => chartQuery.refetch()}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Refresh chart
          </button>
        </div>
      )}
    >
      <WorkflowMetricGrid>
        <WorkflowMetricCard label="Inventory rows" value={chart?.summary.inventory_item_count ?? '—'} detail="Inventory items in the selected venue scope." />
        <WorkflowMetricCard label="Recipe rows" value={chart?.summary.recipe_count ?? '—'} detail="Active dish recipes with allergen rollups." tone="blue" />
        <WorkflowMetricCard label="Contains cells" value={chart?.summary.contains_cell_count ?? '—'} detail="Explicit contains flags across the chart." tone="red" />
        <WorkflowMetricCard label="Unknown cells" value={chart?.summary.unknown_cell_count ?? '—'} detail="Missing or unresolved allergen coverage." tone="amber" />
      </WorkflowMetricGrid>

      <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search items, recipes, vendors, venues"
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
          </label>
          <SegmentedControl
            value={rowScope}
            values={['all', 'inventory_item', 'recipe']}
            labels={{ all: 'All rows', inventory_item: 'Inventory', recipe: 'Recipes' }}
            onChange={setRowScope}
          />
          <SegmentedControl
            value={riskScope}
            values={['all', 'contains', 'may_contain', 'needs_review']}
            labels={{ all: 'All risk', contains: 'Contains', may_contain: 'May contain', needs_review: 'Review' }}
            onChange={setRiskScope}
          />
          <button
            type="button"
            onClick={() => setShowExtended((current) => !current)}
            className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
              showExtended
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {showExtended ? 'All allergens' : 'Major + gluten'}
          </button>
        </div>
      </div>

      {chartQuery.isLoading ? (
        <div className="mt-5 text-sm text-slate-600">Loading allergen chart...</div>
      ) : chartQuery.isError ? (
        <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          {chartQuery.error instanceof Error ? chartQuery.error.message : 'Unable to load allergen chart.'}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-5">
          <WorkflowEmptyState
            title="No chart rows match"
            body="Change the filters or venue scope to see inventory and recipe allergen coverage."
          />
        </div>
      ) : (
        <div className="mt-5 overflow-auto rounded-3xl border border-slate-200">
          <table className="min-w-[980px] divide-y divide-slate-200 text-left">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 min-w-[280px] bg-slate-50 px-4 py-3">Item or recipe</th>
                <th className="px-3 py-3">State</th>
                {visibleAllergens.map((allergen) => (
                  <th key={allergen.id} className="min-w-[92px] px-2 py-3 text-center">{shortAllergenName(allergen.name)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {rows.map((row) => (
                <tr key={row.row_id} className="align-top">
                  <td className="sticky left-0 z-10 bg-white px-4 py-4 shadow-[8px_0_16px_rgba(15,23,42,0.04)]">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-2xl bg-slate-100 p-2 text-slate-700">
                        {row.row_type === 'recipe' ? <ChefHat className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}
                      </div>
                      <div>
                        <Link to={rowLink(row)} className="text-sm font-semibold text-slate-950 transition hover:text-slate-700">
                          {row.name}
                        </Link>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          {row.category_label}
                          {row.version_number ? ` • v${row.version_number}` : ''}
                          {row.vendor_name ? ` • ${row.vendor_name}` : ''}
                          {row.venue_name ? ` • ${row.venue_name}` : ''}
                          {row.ingredient_count != null ? ` • ${row.ingredient_count} ingredients` : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex flex-col gap-1.5">
                      <WorkflowStatusPill tone={row.needs_review ? 'amber' : 'green'}>
                        {row.needs_review ? 'Review' : 'Current'}
                      </WorkflowStatusPill>
                      {row.contains_count > 0 ? <WorkflowStatusPill tone="red">{row.contains_count} contains</WorkflowStatusPill> : null}
                      {row.may_contain_count > 0 ? <WorkflowStatusPill tone="amber">{row.may_contain_count} may</WorkflowStatusPill> : null}
                    </div>
                  </td>
                  {visibleAllergens.map((allergen) => {
                    const cell = row.cells.find((entry) => entry.allergen_id === allergen.id);
                    return (
                      <td key={`${row.row_id}-${allergen.id}`} className="px-2 py-3">
                        {cell ? <AllergenCell cell={cell} /> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WorkflowPanel>
  );
}

function AllergenCell({ cell }: { cell: AllergenChartCellPayload }) {
  const className = cell.status === 'contains'
    ? 'border-rose-200 bg-rose-50 text-rose-950'
    : cell.status === 'may_contain'
      ? 'border-amber-200 bg-amber-50 text-amber-950'
      : cell.status === 'free_of'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
        : 'border-slate-200 bg-slate-50 text-slate-700';
  const Icon = cell.needs_review ? AlertTriangle : ShieldCheck;

  return (
    <div
      title={buildCellTitle(cell)}
      className={`min-h-20 rounded-2xl border px-2.5 py-2 text-center ${className}`}
    >
      <div className="flex justify-center">
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-1 text-xs font-semibold leading-4">{formatStatus(cell.status)}</div>
      <div className="mt-1 text-[11px] leading-4 text-current/65">{cell.confidence}</div>
      {cell.evidence_count > 0 ? (
        <div className="mt-1 text-[11px] font-semibold text-current/70">{cell.evidence_count} ev.</div>
      ) : null}
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  values,
  labels,
  onChange,
}: {
  value: T;
  values: T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((entry) => (
        <button
          key={entry}
          type="button"
          onClick={() => onChange(entry)}
          className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
            value === entry
              ? 'border-slate-950 bg-slate-950 text-white'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          {labels[entry]}
        </button>
      ))}
    </div>
  );
}

function rowLink(row: AllergenChartRowPayload): string {
  if (row.row_type === 'recipe' && row.recipe_version_id) {
    return `/recipes/promoted/${row.recipe_version_id}`;
  }
  return row.item_id ? `/allergens/items/${row.item_id}` : '/allergens';
}

function buildCellTitle(cell: AllergenChartCellPayload): string {
  const parts = [
    `${cell.allergen_name}: ${formatStatus(cell.status)}`,
    `Confidence: ${cell.confidence}`,
    cell.needs_review ? 'Needs review' : 'Current',
    cell.notes ? `Notes: ${cell.notes}` : '',
    cell.source_paths.length > 0 ? `Sources: ${cell.source_paths.slice(0, 4).join(' | ')}` : '',
  ].filter(Boolean);
  return parts.join('\n');
}

function shortAllergenName(name: string): string {
  return name.replace('Milk/Dairy', 'Milk').replace('Tree Nuts', 'Tree nut').replace('Shellfish', 'Shell').replace('Mollusks', 'Mollusk');
}

function formatStatus(status: AllergenChartCellPayload['status']): string {
  return status.replaceAll('_', ' ');
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}
