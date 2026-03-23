import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ForecastParseResult, SaveForecastInput } from '@fifoflow/shared';
import { api } from '../api';
import { useVenueContext } from '../contexts/VenueContext';
import { useToast } from '../contexts/ToastContext';
import { useVenues } from '../hooks/useVenues';
import {
  WorkflowChip,
  WorkflowEmptyState,
  WorkflowFocusBar,
  WorkflowPage,
  WorkflowPanel,
  WorkflowStatusPill,
} from '../components/workflow/WorkflowPrimitives';

type GroupBy = 'day' | 'week' | 'month';
type UsageMode = 'projected' | 'historical';

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysFromToday(offset: number): string {
  const next = new Date();
  next.setDate(next.getDate() + offset);
  return formatDate(next);
}

function startOfMonth(): string {
  const now = new Date();
  return formatDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
}

function buildPlanningMonths(monthCount: number): string[] {
  const months: string[] = [];
  const cursor = new Date();
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  for (let index = 0; index < monthCount; index += 1) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function formatMonthLabel(monthText: string): string {
  const [yearText, monthValueText] = monthText.split('-');
  const date = new Date(Date.UTC(Number(yearText), Number(monthValueText) - 1, 1));
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function ProteinUsage() {
  const { selectedVenueId, setSelectedVenueId } = useVenueContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const configSignatureRef = useRef<string>('');
  const { data: venues } = useVenues();

  const [start, setStart] = useState(() => daysFromToday(-30));
  const [end, setEnd] = useState(() => daysFromToday(30));
  const [groupBy, setGroupBy] = useState<GroupBy>('week');
  const [productSearch, setProductSearch] = useState('');
  const [queuedFile, setQueuedFile] = useState<File | null>(null);
  const [parsedForecast, setParsedForecast] = useState<ForecastParseResult | null>(null);
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, string>>({});
  const [proteinItemDrafts, setProteinItemDrafts] = useState<Record<number, { case_unit_label: string; portions_per_case: string }>>({});
  const [monthlyForecastDrafts, setMonthlyForecastDrafts] = useState<Record<string, string>>({});
  const planningMonths = useMemo(() => buildPlanningMonths(21), []);

  const configQuery = useQuery({
    queryKey: ['protein-usage', 'config', selectedVenueId],
    queryFn: () => api.proteinUsage.config(selectedVenueId!),
    enabled: selectedVenueId != null,
  });

  const summaryQuery = useQuery({
    queryKey: ['protein-usage', 'summary', selectedVenueId, start, end, groupBy],
    queryFn: () => api.proteinUsage.summary({ venue_id: selectedVenueId!, start, end, group_by: groupBy }),
    enabled: selectedVenueId != null,
  });

  const forecastsQuery = useQuery({
    queryKey: ['forecasts'],
    queryFn: () => api.forecasts.list(),
  });

  useEffect(() => {
    if (!configQuery.data) {
      return;
    }

    const signature = JSON.stringify({
      rule_rows: configQuery.data.rule_rows.map((rule) => [
        rule.forecast_product_name,
        rule.protein_item_id,
        rule.usage_per_pax,
        rule.notes,
      ]),
      protein_items: configQuery.data.protein_items.map((protein) => [
        protein.id,
        protein.case_unit_label,
        protein.portions_per_case,
      ]),
      monthly_forecasts: configQuery.data.monthly_forecasts.map((row) => [
        row.forecast_product_name,
        row.forecast_month,
        row.guest_count,
      ]),
    });
    if (signature === configSignatureRef.current) {
      return;
    }
    configSignatureRef.current = signature;

    const nextDrafts: Record<string, string> = {};
    for (const rule of configQuery.data.rule_rows) {
      nextDrafts[buildRuleKey(rule.forecast_product_name, rule.protein_item_id)] = String(rule.usage_per_pax);
    }
    setRuleDrafts(nextDrafts);

    const nextProteinDrafts: Record<number, { case_unit_label: string; portions_per_case: string }> = {};
    for (const protein of configQuery.data.protein_items) {
      nextProteinDrafts[protein.id] = {
        case_unit_label: protein.case_unit_label ?? 'case',
        portions_per_case: protein.portions_per_case != null ? String(protein.portions_per_case) : '',
      };
    }
    setProteinItemDrafts(nextProteinDrafts);

    const nextMonthlyDrafts: Record<string, string> = {};
    for (const row of configQuery.data.monthly_forecasts) {
      nextMonthlyDrafts[buildMonthlyForecastKey(row.forecast_product_name, row.forecast_month)] = String(row.guest_count);
    }
    setMonthlyForecastDrafts(nextMonthlyDrafts);
  }, [configQuery.data]);

  const parseMutation = useMutation({
    mutationFn: (file: File) => api.forecasts.parse(file),
    onSuccess: (data) => {
      setParsedForecast(data);
      toast(`Parsed ${data.products.length} forecast products across ${data.dates.length} dates.`, 'success');
    },
    onError: (error: Error) => {
      toast(`Forecast parse failed: ${error.message}`, 'error');
    },
  });

  const saveForecastMutation = useMutation({
    mutationFn: (input: SaveForecastInput) => api.forecasts.save(input),
    onSuccess: () => {
      setParsedForecast(null);
      setQueuedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      queryClient.invalidateQueries({ queryKey: ['forecasts'] });
      queryClient.invalidateQueries({ queryKey: ['protein-usage', 'config'] });
      queryClient.invalidateQueries({ queryKey: ['protein-usage', 'summary'] });
      toast('Forecast saved into the protein usage workspace.', 'success');
    },
    onError: (error: Error) => {
      toast(`Forecast save failed: ${error.message}`, 'error');
    },
  });

  const saveRulesMutation = useMutation({
    mutationFn: (input: { venue_id: number; rules: Array<{ forecast_product_name: string; protein_item_id: number; usage_per_pax: number }> }) =>
      api.proteinUsage.saveRules(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protein-usage', 'config'] });
      queryClient.invalidateQueries({ queryKey: ['protein-usage', 'summary'] });
      toast('Per-pax protein usage rules saved.', 'success');
    },
    onError: (error: Error) => {
      toast(`Rule save failed: ${error.message}`, 'error');
    },
  });

  const saveProteinItemsMutation = useMutation({
    mutationFn: (input: { items: Array<{ protein_item_id: number; case_unit_label: string; portions_per_case: number | null }> }) =>
      api.proteinUsage.saveItems(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protein-usage', 'config'] });
      queryClient.invalidateQueries({ queryKey: ['protein-usage', 'summary'] });
      toast('Tracked protein case settings saved.', 'success');
    },
    onError: (error: Error) => {
      toast(`Protein settings save failed: ${error.message}`, 'error');
    },
  });

  const hideProductsMutation = useMutation({
    mutationFn: (productNames: string[]) => api.proteinUsage.hideProducts({ venue_id: selectedVenueId!, product_names: productNames }),
    onSuccess: (_, productNames) => {
      queryClient.invalidateQueries({ queryKey: ['protein-usage', 'config'] });
      queryClient.invalidateQueries({ queryKey: ['protein-usage', 'summary'] });
      toast(`Hidden ${productNames.length} forecast product${productNames.length === 1 ? '' : 's'} from this venue.`, 'success');
    },
    onError: (error: Error) => {
      toast(`Hide failed: ${error.message}`, 'error');
    },
  });

  const restoreProductsMutation = useMutation({
    mutationFn: (productNames: string[]) => api.proteinUsage.restoreProducts({ venue_id: selectedVenueId!, product_names: productNames }),
    onSuccess: (_, productNames) => {
      queryClient.invalidateQueries({ queryKey: ['protein-usage', 'config'] });
      queryClient.invalidateQueries({ queryKey: ['protein-usage', 'summary'] });
      toast(`Restored ${productNames.length} hidden forecast product${productNames.length === 1 ? '' : 's'} to this venue.`, 'success');
    },
    onError: (error: Error) => {
      toast(`Restore failed: ${error.message}`, 'error');
    },
  });

  const saveMonthlyForecastsMutation = useMutation({
    mutationFn: (rows: Array<{ forecast_product_name: string; forecast_month: string; guest_count: number }>) =>
      api.proteinUsage.saveMonthlyForecasts({ venue_id: selectedVenueId!, rows }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protein-usage', 'config'] });
      queryClient.invalidateQueries({ queryKey: ['protein-usage', 'summary'] });
      toast('Monthly forecast plan saved.', 'success');
    },
    onError: (error: Error) => {
      toast(`Monthly forecast save failed: ${error.message}`, 'error');
    },
  });

  const proteinItems = configQuery.data?.protein_items ?? [];
  const forecastProducts = configQuery.data?.forecast_products ?? [];
  const hiddenProducts = configQuery.data?.hidden_products ?? [];
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) {
      return forecastProducts;
    }
    return forecastProducts.filter((product) =>
      product.product_name.toLowerCase().includes(query)
      || (product.product_code ?? '').toLowerCase().includes(query)
    );
  }, [forecastProducts, productSearch]);

  useEffect(() => {
    configSignatureRef.current = '';
    setRuleDrafts({});
    setProteinItemDrafts({});
    setMonthlyForecastDrafts({});
  }, [selectedVenueId]);

  const saveableRuleRows = useMemo(() => {
    if (!selectedVenueId) {
      return [];
    }

    return Object.entries(ruleDrafts).map(([key, value]) => {
      const [forecastProductName, proteinItemIdText] = key.split('::');
      return {
        venue_id: selectedVenueId,
        forecast_product_name: forecastProductName,
        protein_item_id: Number(proteinItemIdText),
        usage_per_pax: Number(value || 0),
      };
    }).filter((row) => Number.isFinite(row.protein_item_id) && row.protein_item_id > 0 && Number.isFinite(row.usage_per_pax));
  }, [ruleDrafts, selectedVenueId]);

  const saveableProteinItems = useMemo(() =>
    proteinItems.map((protein) => ({
      protein_item_id: protein.id,
      case_unit_label: proteinItemDrafts[protein.id]?.case_unit_label?.trim() || 'case',
      portions_per_case: proteinItemDrafts[protein.id]?.portions_per_case?.trim()
        ? Number(proteinItemDrafts[protein.id]?.portions_per_case)
        : null,
    })).filter((row) => row.portions_per_case == null || (Number.isFinite(row.portions_per_case) && row.portions_per_case > 0))
  , [proteinItemDrafts, proteinItems]);

  const saveableMonthlyForecastRows = useMemo(() =>
    Object.entries(monthlyForecastDrafts).map(([key, value]) => {
      const [forecastProductName, forecastMonth] = key.split('::');
      return {
        forecast_product_name: forecastProductName,
        forecast_month: forecastMonth,
        guest_count: Number(value || 0),
      };
    }).filter((row) => planningMonths.includes(row.forecast_month) && Number.isFinite(row.guest_count) && row.guest_count >= 0)
  , [monthlyForecastDrafts, planningMonths]);

  const projectedTotals = summaryQuery.data?.totals.filter((total) => total.projected_usage > 0) ?? [];
  const historicalTotals = summaryQuery.data?.totals.filter((total) => total.historical_usage > 0) ?? [];
  const projectedPeriods = summaryQuery.data?.periods.filter((period) => period.projected_guest_count > 0) ?? [];
  const historicalPeriods = summaryQuery.data?.periods.filter((period) => period.historical_guest_count > 0) ?? [];

  if (!selectedVenueId) {
    return (
      <WorkflowPage
        eyebrow="Protein Usage"
        title="Track forecast-driven meat usage from guest counts."
        description="Choose a venue first. Protein usage rules are venue-specific so the forecast products, per-pax assumptions, and projected usage totals stay operationally grounded."
        actions={<VenuePicker selectedVenueId={selectedVenueId} setSelectedVenueId={setSelectedVenueId} venues={venues ?? []} />}
      >
        <WorkflowEmptyState
          title="Select a venue to continue"
          body="Protein usage rules and summaries are stored by venue. Once a venue is selected, you can upload forecasts, set per-pax usage for each tracked meat, and query historical or projected usage by day, week, month, or custom range."
        />
      </WorkflowPage>
    );
  }

  return (
    <WorkflowPage
      eyebrow="Protein Usage"
      title="Forecast-driven meat usage planning"
      description="Upload historical or future forecasts, set per-pax assumptions for each tracked meat, and query historical versus projected usage by day, week, month, or custom range."
      actions={<VenuePicker selectedVenueId={selectedVenueId} setSelectedVenueId={setSelectedVenueId} venues={venues ?? []} />}
    >
      <WorkflowPanel
        title="Forecast Intake"
        description="Use the existing PDF forecast parser, then save the parsed guest counts directly into the protein usage workspace."
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="sr-only"
              onChange={(event) => setQueuedFile(event.target.files?.[0] ?? null)}
            />
            <div className="text-sm font-semibold text-slate-900">{queuedFile?.name ?? 'No forecast PDF selected'}</div>
            <div className="mt-1 text-sm text-slate-600">
              Upload historical or future forecast PDFs with guest counts per product. If a later upload includes the same product and date, Protein Usage uses the most recent uploaded number instead of stacking the counts.
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
              >
                Choose forecast PDF
              </button>
              <button
                type="button"
                onClick={() => queuedFile && parseMutation.mutate(queuedFile)}
                disabled={!queuedFile || parseMutation.isPending}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {parseMutation.isPending ? 'Parsing forecast...' : 'Parse forecast'}
              </button>
            </div>
          </div>

          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Saved forecasts</div>
            <div className="mt-3 space-y-3">
              {(forecastsQuery.data ?? []).slice(0, 4).map((forecast) => (
                <div key={forecast.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-sm font-semibold text-slate-950">{forecast.filename}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {forecast.date_range_start ?? 'Unknown'} to {forecast.date_range_end ?? 'Unknown'} • {forecast.raw_dates.length} day{forecast.raw_dates.length === 1 ? '' : 's'}
                  </div>
                </div>
              ))}
              {!forecastsQuery.isLoading && (forecastsQuery.data ?? []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  No forecasts saved yet.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {parsedForecast ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-950">{parsedForecast.date_range_label}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {parsedForecast.products.length} product{parsedForecast.products.length === 1 ? '' : 's'} • {parsedForecast.dates.length} operating day{parsedForecast.dates.length === 1 ? '' : 's'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => queuedFile && saveForecastMutation.mutate({
                  filename: queuedFile.name,
                  dates: parsedForecast.dates,
                  products: parsedForecast.products,
                })}
                disabled={!queuedFile || saveForecastMutation.isPending}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saveForecastMutation.isPending ? 'Saving forecast...' : 'Save forecast'}
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-white px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">Review and edit guest counts before save</div>
                <div className="mt-1 text-xs text-slate-500">
                  Adjust any parsed counts directly here. The saved forecast preserves exact printed product labels, optional product codes, and date-level guest counts.
                </div>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Product code</th>
                    <th className="px-4 py-3 font-medium">Forecast product</th>
                    <th className="px-4 py-3 font-medium">Group</th>
                    <th className="px-4 py-3 font-medium">Total guests</th>
                    {parsedForecast.dates.map((date) => (
                      <th key={date} className="px-4 py-3 font-medium">{date}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedForecast.products.map((product, productIndex) => (
                    <tr key={`${product.product_code ?? 'no-code'}-${product.product_name}-${productIndex}`} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-600">{product.product_code ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-900">{product.product_name}</td>
                      <td className="px-4 py-3 text-slate-600">{product.group}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {Object.values(product.counts).reduce((sum, value) => sum + value, 0)}
                      </td>
                      {parsedForecast.dates.map((date) => (
                        <td key={date} className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={product.counts[date] ?? 0}
                            onChange={(event) => {
                              const nextValue = Number(event.target.value);
                              setParsedForecast((current) => {
                                if (!current) {
                                  return current;
                                }
                                const nextProducts = current.products.map((entry, entryIndex) => {
                                  if (entryIndex !== productIndex) {
                                    return entry;
                                  }
                                  return {
                                    ...entry,
                                    counts: {
                                      ...entry.counts,
                                      [date]: Number.isFinite(nextValue) && nextValue >= 0 ? Math.round(nextValue) : 0,
                                    },
                                  };
                                });
                                return {
                                  ...current,
                                  products: nextProducts,
                                };
                              });
                            }}
                            className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        ) : null}
      </WorkflowPanel>

      <WorkflowPanel
        title="Tracked Protein Settings"
        description="Define how many portions are in a case for each tracked protein. The usage summary uses this to show both portion totals and case totals."
        actions={(
          <button
            type="button"
            onClick={() => saveProteinItemsMutation.mutate({ items: saveableProteinItems })}
            disabled={saveProteinItemsMutation.isPending || saveableProteinItems.length === 0}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saveProteinItemsMutation.isPending ? 'Saving protein settings...' : 'Save protein settings'}
          </button>
        )}
      >
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Tracked protein</th>
                <th className="px-4 py-3 font-medium">Usage unit</th>
                <th className="px-4 py-3 font-medium">Case label</th>
                <th className="px-4 py-3 font-medium">Portions per case</th>
              </tr>
            </thead>
            <tbody>
              {proteinItems.map((protein) => (
                <tr key={protein.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{protein.name}</td>
                  <td className="px-4 py-3 text-slate-600">{protein.unit_label}</td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={proteinItemDrafts[protein.id]?.case_unit_label ?? protein.case_unit_label ?? 'case'}
                      onChange={(event) => setProteinItemDrafts((current) => ({
                        ...current,
                        [protein.id]: {
                          case_unit_label: event.target.value,
                          portions_per_case: current[protein.id]?.portions_per_case ?? (protein.portions_per_case != null ? String(protein.portions_per_case) : ''),
                        },
                      }))}
                      className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={proteinItemDrafts[protein.id]?.portions_per_case ?? (protein.portions_per_case != null ? String(protein.portions_per_case) : '')}
                      onChange={(event) => setProteinItemDrafts((current) => ({
                        ...current,
                        [protein.id]: {
                          case_unit_label: current[protein.id]?.case_unit_label ?? protein.case_unit_label ?? 'case',
                          portions_per_case: event.target.value,
                        },
                      }))}
                      placeholder="Set case conversion"
                      className="w-36 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WorkflowPanel>

      {hiddenProducts.length > 0 ? (
        <WorkflowPanel
          title="Hidden Venue Products"
          description="These forecast products are hidden from the selected venue’s protein planning workspace. Restore them if they become relevant again."
        >
          <div className="flex flex-wrap gap-2">
            {hiddenProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => restoreProductsMutation.mutate([product.forecast_product_name])}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
              >
                {product.forecast_product_name} · Restore
              </button>
            ))}
          </div>
        </WorkflowPanel>
      ) : null}

      <WorkflowPanel
        title="Future Monthly Forecast Plan"
        description="Enter long-range monthly guest counts per product. Month view uses these totals directly. Day, week, and custom views prorate monthly totals evenly across the days in each month."
        actions={(
          <button
            type="button"
            onClick={() => saveMonthlyForecastsMutation.mutate(saveableMonthlyForecastRows)}
            disabled={saveMonthlyForecastsMutation.isPending || saveableMonthlyForecastRows.length === 0}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saveMonthlyForecastsMutation.isPending ? 'Saving monthly plan...' : 'Save monthly plan'}
          </button>
        )}
      >
        {forecastProducts.length === 0 ? (
          <WorkflowEmptyState
            title="No products available for monthly planning"
            body="Save at least one parsed forecast first. Monthly plans attach to the forecast product catalog already in this venue."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[1320px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Forecast product</th>
                  {planningMonths.map((month) => (
                    <th key={month} className="px-4 py-3 font-medium">{formatMonthLabel(month)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.slice(0, 20).map((product) => (
                  <tr key={`monthly-${product.product_code ?? 'no-code'}-${product.product_name}`} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-600">{product.product_code ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{product.product_name}</td>
                    {planningMonths.map((month) => {
                      const key = buildMonthlyForecastKey(product.product_name, month);
                      return (
                        <td key={month} className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={monthlyForecastDrafts[key] ?? ''}
                            onChange={(event) => setMonthlyForecastDrafts((current) => ({ ...current, [key]: event.target.value }))}
                            placeholder="0"
                            className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                          />
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

      <WorkflowPanel
        title="Per-Pax Usage Rules"
        description="Set how much of each tracked meat is consumed per guest for each forecast product. Leave a value at 0 to exclude that meat from the product."
        actions={(
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Search forecast products"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            />
            <button
              type="button"
              onClick={() => saveRulesMutation.mutate({ venue_id: selectedVenueId, rules: saveableRuleRows })}
              disabled={saveRulesMutation.isPending || saveableRuleRows.length === 0}
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saveRulesMutation.isPending ? 'Saving rules...' : 'Save rules'}
            </button>
          </div>
        )}
      >
        {configQuery.isLoading ? (
          <div className="text-sm text-slate-500">Loading protein usage configuration...</div>
        ) : filteredProducts.length === 0 ? (
          <WorkflowEmptyState
            title="No forecast products in scope"
            body="Save at least one parsed forecast first. The product rows from saved forecasts become the source list for protein usage assumptions."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Forecast product</th>
                  <th className="px-4 py-3 font-medium">Guests</th>
                  {proteinItems.map((protein) => (
                    <th key={protein.id} className="px-4 py-3 font-medium">
                      <div className="text-slate-700">{protein.name}</div>
                      <div className="text-[11px] font-normal text-slate-400">{protein.unit_label} per pax</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.slice(0, 40).map((product) => (
                  <tr key={`${product.product_code ?? 'no-code'}-${product.product_name}`} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-600">{product.product_code ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{product.product_name}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>{product.first_date} to {product.last_date}</span>
                        {product.configured_rule_count > 0 ? (
                          <WorkflowStatusPill tone="blue">{product.configured_rule_count} rule{product.configured_rule_count === 1 ? '' : 's'}</WorkflowStatusPill>
                        ) : (
                          <WorkflowStatusPill tone="amber">Unconfigured</WorkflowStatusPill>
                        )}
                        <button
                          type="button"
                          onClick={() => hideProductsMutation.mutate([product.product_name])}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                        >
                          Remove from venue
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{product.total_guest_count}</td>
                    {proteinItems.map((protein) => {
                      const key = buildRuleKey(product.product_name, protein.id);
                      return (
                        <td key={protein.id} className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={ruleDrafts[key] ?? ''}
                            onChange={(event) => setRuleDrafts((current) => ({ ...current, [key]: event.target.value }))}
                            className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                            placeholder="0.00"
                          />
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

      <WorkflowPanel
        title="Historical And Projected Usage"
        description="Search by exact date, day, week, month, or any custom range. Historical and forward totals are split automatically against today."
        actions={(
          <WorkflowFocusBar>
            <WorkflowChip active={groupBy === 'day'} onClick={() => setGroupBy('day')}>Day</WorkflowChip>
            <WorkflowChip active={groupBy === 'week'} onClick={() => setGroupBy('week')}>Week</WorkflowChip>
            <WorkflowChip active={groupBy === 'month'} onClick={() => setGroupBy('month')}>Month</WorkflowChip>
          </WorkflowFocusBar>
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setStart(formatDate(new Date())); setEnd(formatDate(new Date())); setGroupBy('day'); }} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-slate-300 hover:text-slate-950">Today</button>
          <button type="button" onClick={() => { setStart(daysFromToday(-7)); setEnd(formatDate(new Date())); setGroupBy('day'); }} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-slate-300 hover:text-slate-950">7 days</button>
          <button type="button" onClick={() => { setStart(startOfMonth()); setEnd(formatDate(new Date())); setGroupBy('day'); }} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-slate-300 hover:text-slate-950">Month to date</button>
          <button type="button" onClick={() => { setStart(daysFromToday(-30)); setEnd(daysFromToday(30)); setGroupBy('week'); }} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-slate-300 hover:text-slate-950">60 day window</button>
          <div className="ml-auto flex items-center gap-2">
            <input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900" />
            <span className="text-sm text-slate-500">to</span>
            <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900" />
          </div>
        </div>

        {summaryQuery.isLoading ? (
          <div className="mt-5 text-sm text-slate-500">Calculating protein usage...</div>
        ) : summaryQuery.data ? (
          <div className="mt-5 space-y-5">
            <UsageSection
              title="Projected Usage"
              subtitle="Forward-looking demand across the selected window."
              mode="projected"
              totals={projectedTotals}
              periods={projectedPeriods}
              proteins={summaryQuery.data.proteins}
            />

            <UsageSection
              title="Historical Usage"
              subtitle="Consumed demand already elapsed in the selected window."
              mode="historical"
              totals={historicalTotals}
              periods={historicalPeriods}
              proteins={summaryQuery.data.proteins}
            />

            {summaryQuery.data.unmapped_forecast_products.length > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-sm font-semibold text-amber-900">Forecast products missing protein rules</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {summaryQuery.data.unmapped_forecast_products.map((product) => (
                    <span key={product.product_name} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-800">
                      {product.product_name} • {product.total_guest_count} guests
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </WorkflowPanel>
    </WorkflowPage>
  );
}

function buildRuleKey(forecastProductName: string, proteinItemId: number): string {
  return `${forecastProductName}::${proteinItemId}`;
}

function buildMonthlyForecastKey(forecastProductName: string, forecastMonth: string): string {
  return `${forecastProductName}::${forecastMonth}`;
}

function formatCaseDisplay(caseValue: number | null, caseUnitLabel: string): string {
  if (caseValue == null) {
    return `Set ${caseUnitLabel}`;
  }
  return `${formatNumber(caseValue)} ${caseUnitLabel}${caseValue === 1 ? '' : 's'}`;
}

function formatPortionDisplay(value: number, unitLabel: string): string {
  return `${formatNumber(value)} ${unitLabel}${value === 1 ? '' : 's'}`;
}

function UsageSection({
  title,
  subtitle,
  mode,
  totals,
  periods,
  proteins,
}: {
  title: string;
  subtitle: string;
  mode: UsageMode;
  totals: Array<{
    protein_item_id: number;
    protein_name: string;
    unit_label: string;
    case_unit_label: string;
    portions_per_case: number | null;
    historical_usage: number;
    projected_usage: number;
    total_usage: number;
    historical_case_usage: number | null;
    projected_case_usage: number | null;
    total_case_usage: number | null;
  }>;
  periods: Array<{
    period: string;
    historical_guest_count: number;
    projected_guest_count: number;
    total_guest_count: number;
    proteins: Array<{
      protein_item_id: number;
      protein_name: string;
      unit_label: string;
      case_unit_label: string;
      portions_per_case: number | null;
      historical_usage: number;
      projected_usage: number;
      total_usage: number;
      historical_case_usage: number | null;
      projected_case_usage: number | null;
      total_case_usage: number | null;
    }>;
  }>;
  proteins: Array<{
    id: number;
    name: string;
    unit_label: string;
    case_unit_label: string;
    portions_per_case: number | null;
  }>;
}) {
  const guestLabel = mode === 'projected' ? 'Projected guests' : 'Historical guests';
  const emptyBody = mode === 'projected'
    ? 'No projected usage in the selected window.'
    : 'No historical usage in the selected window.';

  const totalsByProteinId = new Map(totals.map((row) => [row.protein_item_id, row]));

  return (
    <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
        <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
        <p className="text-sm text-slate-600">{subtitle}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {proteins.map((protein) => {
          const totalRow = totalsByProteinId.get(protein.id);
          const usageValue = mode === 'projected'
            ? totalRow?.projected_usage ?? 0
            : totalRow?.historical_usage ?? 0;
          const caseValue = mode === 'projected'
            ? totalRow?.projected_case_usage ?? null
            : totalRow?.historical_case_usage ?? null;

          return (
            <div key={`${title}-${protein.id}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{protein.name}</div>
              <div className="mt-3 text-3xl font-semibold leading-none text-slate-950">
                {formatCaseDisplay(caseValue, totalRow?.case_unit_label ?? protein.case_unit_label ?? 'case')}
              </div>
              <div className="mt-2 text-sm text-slate-600">
                {formatPortionDisplay(usageValue, totalRow?.unit_label ?? protein.unit_label)}
              </div>
            </div>
          );
        })}
      </div>

      {periods.length === 0 ? (
        <WorkflowEmptyState
          title={`No ${mode} usage`}
          body={emptyBody}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium">{guestLabel}</th>
                {proteins.map((protein) => (
                  <th key={`${title}-header-${protein.id}`} className="px-4 py-3 font-medium">
                    {protein.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => {
                const periodByProteinId = new Map(period.proteins.map((row) => [row.protein_item_id, row]));
                const guestCount = mode === 'projected' ? period.projected_guest_count : period.historical_guest_count;

                return (
                  <tr key={`${title}-${period.period}`} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 font-medium text-slate-900">{period.period}</td>
                    <td className="px-4 py-3 text-slate-700">{formatNumber(guestCount)}</td>
                    {proteins.map((protein) => {
                      const row = periodByProteinId.get(protein.id);
                      const usageValue = mode === 'projected'
                        ? row?.projected_usage ?? 0
                        : row?.historical_usage ?? 0;
                      const caseValue = mode === 'projected'
                        ? row?.projected_case_usage ?? null
                        : row?.historical_case_usage ?? null;

                      return (
                        <td key={`${period.period}-${protein.id}`} className="px-4 py-3">
                          <div className="text-base font-semibold text-slate-950">
                            {formatCaseDisplay(caseValue, row?.case_unit_label ?? protein.case_unit_label ?? 'case')}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {formatPortionDisplay(usageValue, row?.unit_label ?? protein.unit_label)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function VenuePicker({
  selectedVenueId,
  setSelectedVenueId,
  venues,
}: {
  selectedVenueId: number | null;
  setSelectedVenueId: (value: number | null) => void;
  venues: Array<{ id: number; name: string }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-3 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Venue</div>
      <select
        value={selectedVenueId ?? ''}
        onChange={(event) => setSelectedVenueId(event.target.value ? Number(event.target.value) : null)}
        className="mt-2 min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400"
      >
        <option value="">Select venue</option>
        {venues.map((venue) => (
          <option key={venue.id} value={venue.id}>
            {venue.name}
          </option>
        ))}
      </select>
    </div>
  );
}
