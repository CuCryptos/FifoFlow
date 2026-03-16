import { useState, useRef, useEffect, useMemo, Fragment } from 'react';
import { useRecipes, useRecipe, useCreateRecipe, useUpdateRecipe, useDeleteRecipe } from '../hooks/useRecipes';
import { useProductRecipes, useSetProductRecipe, useDeleteProductRecipe, useCalculateOrder } from '../hooks/useProductRecipes';
import { useParseForecast, useSaveForecast, useForecasts, useForecast, useForecastMappings, useSaveForecastMappings, useUpdateForecastEntry } from '../hooks/useForecasts';
import { useItems, useSetItemCount } from '../hooks/useItems';
import { useVenues, useUpdateVenue, useReorderVenues } from '../hooks/useVenues';
import { useVendors } from '../hooks/useVendors';
import { useCreateOrder } from '../hooks/useOrders';
import { useOperationalRecipeWorkflow, useOperationalRecipeWorkflowDetail } from '../hooks/useRecipeWorkflow';
import { useRecipeTemplate, useRecipeTemplates } from '../hooks/useRecipeTemplates';
import { useVenueContext } from '../contexts/VenueContext';
import { useToast } from '../contexts/ToastContext';
import {
  WorkflowChip,
  WorkflowEmptyState,
  WorkflowFocusBar,
  WorkflowMetricCard,
  WorkflowMetricGrid,
  WorkflowPage,
  WorkflowPanel,
  WorkflowStatusPill,
} from '../components/workflow/WorkflowPrimitives';
import { UNITS, tryConvertQuantity } from '@fifoflow/shared';
import type { CalculatedIngredient, Item, OrderCalculationResult, RecipeWithCost, ForecastParseResult, Unit } from '@fifoflow/shared';
import type {
  OperationalRecipeIngredientRowPayload,
  OperationalRecipeWorkflowSummaryPayload,
  RecipeTemplateDetailPayload,
  RecipeWorkflowIngredientDiffPayload,
} from '../api';

type RecipeTab = 'operational' | 'recipes' | 'menus' | 'calculate' | 'weekly';

export function Recipes() {
  const [activeTab, setActiveTab] = useState<RecipeTab>('operational');
  const [openCreateRecipe, setOpenCreateRecipe] = useState(false);

  const launchRecipeCreate = () => {
    setActiveTab('recipes');
    setOpenCreateRecipe(true);
  };

  return (
    <WorkflowPage
      eyebrow="Recipe Operations"
      title="Promote, validate, and cost operational recipes through the same identity spine the backend trusts."
      description="The recipes surface now starts from promoted operational versions, scoped ingredient fulfillment, vendor lineage, and cost snapshot trust. Legacy maintenance tools still exist, but they are secondary to the operational workflow."
      actions={(
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            onClick={launchRecipeCreate}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Add Recipe
          </button>
          <div className="rounded-full border border-slate-300 bg-white/80 p-1">
            <div className="flex flex-wrap gap-1">
              {([
                ['operational', 'Operational Workflow'],
                ['recipes', 'Legacy Recipes'],
                ['menus', 'Product Menus'],
                ['calculate', 'Calculate Order'],
                ['weekly', 'Weekly Order'],
              ] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={activeTab === tab
                    ? 'rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white'
                    : 'rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-950'}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    >
      {activeTab === 'operational' && <OperationalRecipes onAddRecipe={launchRecipeCreate} />}
      {activeTab === 'recipes' && (
        <RecipeList
          forceCreate={openCreateRecipe}
          onCreateHandled={() => setOpenCreateRecipe(false)}
        />
      )}
      {activeTab === 'menus' && <ProductMenus />}
      {activeTab === 'calculate' && <CalculateOrder />}
      {activeTab === 'weekly' && <WeeklyOrder />}
    </WorkflowPage>
  );
}

function formatRecipeCurrency(value: number | null): string {
  if (value == null) {
    return '—';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatYield(summary: OperationalRecipeWorkflowSummaryPayload): string {
  if (summary.yield_qty == null || !summary.yield_unit) {
    return 'Yield not set';
  }
  return `${summary.yield_qty} ${summary.yield_unit}`;
}

function formatLegacyRecipeYield(recipe: {
  yield_quantity: number | null;
  yield_unit: string | null;
}): string {
  if (recipe.yield_quantity == null || !recipe.yield_unit) {
    return 'Batch yield not set';
  }
  return `${trimRecipeNumber(recipe.yield_quantity)} ${recipe.yield_unit} per batch`;
}

function formatLegacyRecipeServing(recipe: {
  serving_quantity: number | null;
  serving_unit: string | null;
  serving_count: number | null;
}): string {
  if (recipe.serving_quantity != null && recipe.serving_unit) {
    const servingSize = `${trimRecipeNumber(recipe.serving_quantity)} ${recipe.serving_unit}`;
    if (recipe.serving_count != null) {
      return `${servingSize} • ${trimRecipeNumber(recipe.serving_count)} servings`;
    }
    return servingSize;
  }
  if (recipe.serving_count != null) {
    return `${trimRecipeNumber(recipe.serving_count)} servings per batch`;
  }
  return 'Serving size not set';
}

function trimRecipeNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(2)).toString();
}

function deriveServingCount(input: {
  yieldQuantity: string;
  yieldUnit: string;
  servingQuantity: string;
  servingUnit: string;
}): number | null {
  const yieldQuantity = Number(input.yieldQuantity);
  const servingQuantity = Number(input.servingQuantity);
  if (!(yieldQuantity > 0) || !(servingQuantity > 0) || !input.yieldUnit || !input.servingUnit) {
    return null;
  }

  const convertedYield = tryConvertQuantity(
    yieldQuantity,
    input.yieldUnit as Unit,
    input.servingUnit as Unit,
  );

  if (convertedYield == null || !(convertedYield > 0)) {
    return null;
  }

  return Number((convertedYield / servingQuantity).toFixed(2));
}

function inferRecipeTypeFromTemplateCategory(category: string): 'dish' | 'prep' {
  const normalized = category.trim().toLowerCase();
  const prepCategories = ['sauce', 'dressing', 'marinade', 'stock', 'syrup', 'mix', 'mixer', 'prep', 'batch', 'cocktail'];
  return prepCategories.some((token) => normalized.includes(token)) ? 'prep' : 'dish';
}

function coerceRecipeUnit(value: string | null | undefined, fallback: Unit = 'each'): Unit {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  const exact = UNITS.find((unit) => unit.toLowerCase() === normalized);
  if (exact) {
    return exact;
  }

  if (normalized === 'l') {
    return 'L';
  }

  return fallback;
}

function tokenizeRecipeSearch(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function scoreInventoryMatch(templateIngredientName: string, item: Item): number {
  const ingredientTokens = tokenizeRecipeSearch(templateIngredientName);
  const itemTokens = tokenizeRecipeSearch(item.name);

  if (!ingredientTokens.length || !itemTokens.length) {
    return 0;
  }

  const ingredientSet = new Set(ingredientTokens);
  const itemSet = new Set(itemTokens);
  const overlap = ingredientTokens.filter((token) => itemSet.has(token)).length;
  const overlapRatio = overlap / ingredientSet.size;
  const exactPhrase = item.name.toLowerCase().includes(templateIngredientName.toLowerCase()) ? 0.45 : 0;
  const prefixHit = ingredientTokens.some((token) => item.name.toLowerCase().startsWith(token)) ? 0.15 : 0;

  return overlapRatio + exactPhrase + prefixHit;
}

function getLikelyInventoryMatches(templateIngredientName: string | null | undefined, items: Item[]): Item[] {
  if (!templateIngredientName?.trim()) {
    return [];
  }

  return items
    .map((item) => ({ item, score: scoreInventoryMatch(templateIngredientName, item) }))
    .filter((entry) => entry.score >= 0.45)
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))
    .slice(0, 4)
    .map((entry) => entry.item);
}

function getItemUnitCandidates(item: Item): Unit[] {
  return [
    item.unit,
    item.order_unit,
    item.inner_unit,
    item.item_size_unit,
  ].filter((unit): unit is Unit => Boolean(unit));
}

function templateUnitMatchesInventoryUnit(templateUnit: string | null | undefined, item: Item): boolean {
  if (!templateUnit) {
    return true;
  }

  const normalizedTemplateUnit = coerceRecipeUnit(templateUnit);

  return getItemUnitCandidates(item).some((candidateUnit) => {
    if (candidateUnit === normalizedTemplateUnit) {
      return true;
    }

    return tryConvertQuantity(1, normalizedTemplateUnit, candidateUnit, {
      baseUnit: item.unit,
      orderUnit: item.order_unit,
      innerUnit: item.inner_unit,
      qtyPerUnit: item.qty_per_unit,
      itemSizeValue: item.item_size_value,
      itemSizeUnit: item.item_size_unit,
    }) != null;
  });
}

function formatInventoryMappingContext(item: Item | undefined, vendorName: string | null): string {
  if (!item) {
    return 'No mapped inventory context yet';
  }

  const countedUnit = `Counted as ${item.unit}`;
  const orderPack = item.order_unit
    ? `Orders in ${item.order_unit}${item.qty_per_unit ? ` × ${trimRecipeNumber(item.qty_per_unit)}` : ''}`
    : 'No order pack configured';
  const measurable = item.item_size_value && item.item_size_unit
    ? `Measures ${trimRecipeNumber(item.item_size_value)} ${item.item_size_unit}`
    : null;
  const price = item.order_unit_price != null
    ? `${formatRecipeCurrency(item.order_unit_price)} per ${item.order_unit ?? item.unit}`
    : 'No current order price';

  return [countedUnit, orderPack, measurable, price, vendorName ? `Vendor ${vendorName}` : 'No default vendor']
    .filter(Boolean)
    .join(' • ');
}

function OperationalRecipes({ onAddRecipe }: { onAddRecipe: () => void }) {
  const { selectedVenueId } = useVenueContext();
  const { data, isLoading, error } = useOperationalRecipeWorkflow(selectedVenueId);
  const [selectedRecipeVersionId, setSelectedRecipeVersionId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'COSTABLE_NOW' | 'OPERATIONAL_ONLY' | 'BLOCKED_FOR_COSTING'>('all');

  const summaries = data?.summaries ?? [];
  const filteredSummaries = summaries.filter((summary) => statusFilter === 'all' || summary.costability_classification === statusFilter);
  const selectedSummary = filteredSummaries.find((summary) => summary.recipe_version_id === selectedRecipeVersionId)
    ?? filteredSummaries[0]
    ?? null;

  useEffect(() => {
    if (!selectedSummary) {
      setSelectedRecipeVersionId(null);
      return;
    }
    if (selectedRecipeVersionId == null || !filteredSummaries.some((summary) => summary.recipe_version_id === selectedRecipeVersionId)) {
      setSelectedRecipeVersionId(selectedSummary.recipe_version_id);
    }
  }, [filteredSummaries, selectedRecipeVersionId, selectedSummary]);

  if (isLoading) {
    return <div className="text-text-secondary text-sm">Loading operational recipes...</div>;
  }

  if (error instanceof Error) {
    return <div className="text-accent-red text-sm">{error.message}</div>;
  }

  return (
    <div className="space-y-6">
      <WorkflowMetricGrid>
        <WorkflowMetricCard
          label="Promoted Recipes"
          value={data?.counts.total_promoted_recipes ?? 0}
          detail="Active operational versions in the current venue scope."
        />
        <WorkflowMetricCard
          label="Costable Now"
          value={data?.counts.costable_now_count ?? 0}
          detail="Ready for trusted recipe cost snapshots."
          tone="green"
        />
        <WorkflowMetricCard
          label="Operational Only"
          value={data?.counts.operational_only_count ?? 0}
          detail="Promoted, but still blocked by mapping or supplier lineage."
          tone="amber"
        />
        <WorkflowMetricCard
          label="Blocked"
          value={data?.counts.blocked_for_costing_count ?? 0}
          detail="Canonical ingredient identity is incomplete."
          tone="red"
        />
      </WorkflowMetricGrid>

      <WorkflowPanel
        title="Operational Recipe Workspace"
        description="Review promoted recipe readiness, inspect ingredient-level resolution, and see whether the current live data path is trustworthy enough for costing."
        actions={(
          <WorkflowFocusBar>
            {([
              ['all', 'All'],
              ['COSTABLE_NOW', 'Costable Now'],
              ['OPERATIONAL_ONLY', 'Operational Only'],
              ['BLOCKED_FOR_COSTING', 'Blocked'],
            ] as const).map(([value, label]) => (
              <WorkflowChip key={value} active={statusFilter === value} onClick={() => setStatusFilter(value)}>
                {label}
              </WorkflowChip>
            ))}
          </WorkflowFocusBar>
        )}
      >
        {!filteredSummaries.length ? (
          <WorkflowEmptyState
            title="No promoted recipes matched this lane"
            body="Either no promoted operational versions exist yet for this scope, or the current filter is excluding them."
            action={(
              <button
                onClick={onAddRecipe}
                className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Add Recipe
              </button>
            )}
          />
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/70">
              <table className="w-full text-sm">
                <thead className="bg-white/90">
                  <tr className="text-left text-slate-500">
                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide">Recipe</th>
                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide">Status</th>
                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-right">Coverage</th>
                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-right">Latest Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSummaries.map((summary) => {
                    const selected = summary.recipe_version_id === selectedSummary?.recipe_version_id;
                    return (
                      <tr
                        key={summary.recipe_version_id}
                        onClick={() => setSelectedRecipeVersionId(summary.recipe_version_id)}
                        className={selected
                          ? 'cursor-pointer border-b border-slate-200 bg-white'
                          : 'cursor-pointer border-b border-slate-200 hover:bg-white/80'}
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium text-slate-950">{summary.recipe_name}</div>
                          <div className="text-xs text-slate-500">
                            v{summary.version_number} • {summary.recipe_type} • {formatYield(summary)}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <WorkflowStatusBadge classification={summary.costability_classification} />
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          <div className="font-mono text-slate-950">{summary.costable_percent.toFixed(0)}%</div>
                          <div className="text-xs text-slate-500">
                            {summary.resolved_row_count}/{summary.ingredient_row_count} rows
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          <div className="font-mono text-slate-950">{formatRecipeCurrency(summary.latest_snapshot?.total_cost ?? null)}</div>
                          <div className="text-xs text-slate-500">
                            {summary.latest_snapshot ? `${summary.latest_snapshot.completeness_status} snapshot` : 'No snapshot yet'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedSummary && <OperationalRecipeDetail summary={selectedSummary} />}
          </div>
        )}
      </WorkflowPanel>
    </div>
  );
}

function WorkflowStatusBadge({
  classification,
}: {
  classification: OperationalRecipeWorkflowSummaryPayload['costability_classification'];
}) {
  if (classification === 'COSTABLE_NOW') {
    return <WorkflowStatusPill tone="green">Costable Now</WorkflowStatusPill>;
  }
  if (classification === 'BLOCKED_FOR_COSTING') {
    return <WorkflowStatusPill tone="red">Blocked</WorkflowStatusPill>;
  }
  return <WorkflowStatusPill tone="amber">Operational Only</WorkflowStatusPill>;
}

function OperationalRecipeDetail({ summary }: { summary: OperationalRecipeWorkflowSummaryPayload }) {
  const { selectedVenueId } = useVenueContext();
  const [comparisonRecipeVersionId, setComparisonRecipeVersionId] = useState<number | null>(null);
  const [diffFilter, setDiffFilter] = useState<'changed' | 'all'>('changed');
  const [diffTypeFilter, setDiffTypeFilter] = useState<'all' | 'QUANTITY_CHANGED' | 'RESOLUTION_CHANGED' | 'RESOLUTION_BLOCKED' | 'ADDED' | 'REMOVED'>('all');
  const { data: detail, isLoading } = useOperationalRecipeWorkflowDetail(summary.recipe_version_id, selectedVenueId, comparisonRecipeVersionId);
  const blockers = summary.blocker_messages.length > 0 ? summary.blocker_messages : ['No active blockers. This recipe is ready to cost in the current scope.'];

  useEffect(() => {
    setComparisonRecipeVersionId(null);
    setDiffFilter('changed');
    setDiffTypeFilter('all');
  }, [summary.recipe_version_id]);

  const comparisonOptions = detail?.version_history.filter((version) => version.recipe_version_id !== summary.recipe_version_id) ?? [];
  const activeComparisonVersionNumber = detail?.comparison_version?.version_number ?? comparisonOptions[0]?.version_number ?? null;
  const diffCounts = {
    all: detail?.ingredient_diffs.length ?? 0,
    changed: detail?.ingredient_diffs.filter((diff) => diff.change_type !== 'UNCHANGED').length ?? 0,
    QUANTITY_CHANGED: detail?.ingredient_diffs.filter((diff) => diff.change_type === 'QUANTITY_CHANGED').length ?? 0,
    RESOLUTION_CHANGED: detail?.ingredient_diffs.filter((diff) => diff.change_type === 'RESOLUTION_CHANGED').length ?? 0,
    RESOLUTION_BLOCKED: detail?.ingredient_diffs.filter((diff) => isResolutionBlockedDiff(diff)).length ?? 0,
    ADDED: detail?.ingredient_diffs.filter((diff) => diff.change_type === 'ADDED').length ?? 0,
    REMOVED: detail?.ingredient_diffs.filter((diff) => diff.change_type === 'REMOVED').length ?? 0,
  };
  const filteredDiffs = detail?.ingredient_diffs.filter((diff) => {
    const matchesVisibility = diffFilter === 'all' || diff.change_type !== 'UNCHANGED';
    const matchesType = diffTypeFilter === 'all'
      || (diffTypeFilter === 'RESOLUTION_BLOCKED' ? isResolutionBlockedDiff(diff) : diff.change_type === diffTypeFilter);
    return matchesVisibility && matchesType;
  }) ?? [];

  return (
    <div className="bg-bg-page rounded-xl border border-border p-4 space-y-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">{summary.recipe_name}</h3>
            <p className="text-sm text-text-secondary">
              Version {summary.version_number} • {summary.recipe_type} • {formatYield(summary)}
            </p>
          </div>
          <WorkflowStatusBadge classification={summary.costability_classification} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DetailMetric label="Ingredient Rows" value={`${summary.ingredient_row_count}`} />
        <DetailMetric label="Resolved Rows" value={`${summary.resolved_row_count}`} />
        <DetailMetric label="Inventory Linked" value={`${summary.inventory_linked_row_count}`} />
        <DetailMetric label="Vendor Linked" value={`${summary.vendor_linked_row_count}`} />
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-text-primary">Costability blockers</h4>
        <ul className="space-y-2 text-sm text-text-secondary">
          {blockers.map((message, index) => (
            <li key={`${summary.recipe_version_id}-${index}`} className="rounded-lg bg-white px-3 py-2 border border-border">
              {message}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-text-primary">Latest snapshot</h4>
        {summary.latest_snapshot ? (
          <div className="rounded-lg bg-white px-3 py-3 border border-border space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-text-secondary">Snapshot total</span>
              <span className="font-mono text-text-primary">{formatRecipeCurrency(summary.latest_snapshot.total_cost)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-text-secondary">Cost per serving</span>
              <span className="font-mono text-text-primary">{formatRecipeCurrency(summary.latest_snapshot.cost_per_serving)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-text-secondary">Completeness</span>
              <span className="text-text-primary">{summary.latest_snapshot.completeness_status} • {summary.latest_snapshot.confidence_label} confidence</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary">
              <div>Resolved {summary.latest_snapshot.resolved_ingredient_count}/{summary.latest_snapshot.ingredient_count}</div>
              <div>Missing {summary.latest_snapshot.missing_cost_count}</div>
              <div>Stale {summary.latest_snapshot.stale_cost_count}</div>
              <div>Ambiguous {summary.latest_snapshot.ambiguous_cost_count}</div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-white px-3 py-3 border border-border text-sm text-text-secondary">
            No recipe cost snapshot has been persisted for this promoted version yet.
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-text-primary">Ingredient resolution drilldown</h4>
        {isLoading ? (
          <div className="rounded-lg bg-white px-3 py-3 border border-border text-sm text-text-secondary">
            Loading ingredient resolution...
          </div>
        ) : !detail?.ingredient_rows.length ? (
          <div className="rounded-lg bg-white px-3 py-3 border border-border text-sm text-text-secondary">
            No promoted ingredient rows were returned for this version.
          </div>
        ) : (
          <div className="space-y-3">
            {detail.ingredient_rows.map((row) => (
              <IngredientResolutionCard key={String(row.recipe_item_id)} row={row} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-text-primary">Version comparison</h4>
        {comparisonOptions.length > 0 && (
          <div className="rounded-lg bg-white px-3 py-3 border border-border">
            <label className="flex flex-col gap-2 text-sm text-text-secondary">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">Compare against</span>
              <select
                value={comparisonRecipeVersionId ?? ''}
                onChange={(event) => setComparisonRecipeVersionId(event.target.value ? Number(event.target.value) : null)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              >
                <option value="">Nearest prior promoted version</option>
                {comparisonOptions.map((version) => (
                  <option key={version.recipe_version_id} value={version.recipe_version_id}>
                    Version {version.version_number} • {version.status}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {!detail?.version_history.length ? (
          <div className="rounded-lg bg-white px-3 py-3 border border-border text-sm text-text-secondary">
            No additional version history is available for this recipe yet.
          </div>
        ) : (
          <div className="space-y-2">
            {detail.version_history.map((version) => (
              <div
                key={version.recipe_version_id}
                className={`rounded-xl border px-3 py-3 ${version.recipe_version_id === summary.recipe_version_id ? 'border-slate-900 bg-slate-50' : 'border-border bg-white'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-text-primary">Version {version.version_number}</div>
                    <div className="text-xs text-text-secondary">
                      {version.status} • {version.resolved_row_count}/{version.ingredient_row_count} resolved • {version.costable_percent.toFixed(0)}% costable
                    </div>
                  </div>
                  <WorkflowStatusBadge classification={version.costability_classification} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-text-primary">Ingredient diff vs prior promoted version</h4>
        {!detail?.comparison_version ? (
          <div className="rounded-lg bg-white px-3 py-3 border border-border text-sm text-text-secondary">
            No prior promoted version is available for row-level comparison yet.
          </div>
        ) : !detail.ingredient_diffs.length ? (
          <div className="rounded-lg bg-white px-3 py-3 border border-border text-sm text-text-secondary">
            No ingredient diff rows were produced for this comparison.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-white px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-text-secondary">
                  Comparing current version {summary.version_number} against version {activeComparisonVersionNumber}.
                </div>
                <div className="flex items-center gap-2">
                  <WorkflowChip active={diffFilter === 'changed'} onClick={() => setDiffFilter('changed')}>
                    Changed only ({diffCounts.changed})
                  </WorkflowChip>
                  <WorkflowChip active={diffFilter === 'all'} onClick={() => setDiffFilter('all')}>
                    All rows ({diffCounts.all})
                  </WorkflowChip>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {([
                  ['all', `All change types (${diffCounts.changed})`],
                  ['QUANTITY_CHANGED', `Quantity (${diffCounts.QUANTITY_CHANGED})`],
                  ['RESOLUTION_CHANGED', `Resolution (${diffCounts.RESOLUTION_CHANGED})`],
                  ['RESOLUTION_BLOCKED', `Resolution blocked (${diffCounts.RESOLUTION_BLOCKED})`],
                  ['ADDED', `Added (${diffCounts.ADDED})`],
                  ['REMOVED', `Removed (${diffCounts.REMOVED})`],
                ] as const).map(([value, label]) => (
                  <WorkflowChip key={value} active={diffTypeFilter === value} onClick={() => setDiffTypeFilter(value)}>
                    {label}
                  </WorkflowChip>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                <div className="font-semibold uppercase tracking-[0.18em] text-slate-500">Costability legend</div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <span className="font-medium text-slate-900">Resolved for costing</span>
                    {' '}means the ingredient row has trusted inventory, vendor, and cost lineage in scope.
                  </div>
                  <div>
                    <span className="font-medium text-slate-900">Resolution blocked</span>
                    {' '}means one side of the diff still has missing scoped inventory mapping, vendor mapping, or vendor cost lineage.
                  </div>
                </div>
              </div>
            </div>
            {!filteredDiffs.length ? (
              <div className="rounded-lg border border-border bg-white px-3 py-3 text-sm text-text-secondary">
                {diffTypeFilter === 'all'
                  ? 'All compared ingredient rows are unchanged for this version pair.'
                  : 'No ingredient rows matched the selected change-type filter for this version pair.'}
              </div>
            ) : (
              filteredDiffs.map((diff) => (
                <IngredientDiffCard key={`${diff.comparison_key}-${diff.current_row?.recipe_item_id ?? 'none'}-${diff.previous_row?.recipe_item_id ?? 'none'}`} diff={diff} />
              ))
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-text-primary">Snapshot history</h4>
        {!detail?.snapshot_history.length ? (
          <div className="rounded-lg bg-white px-3 py-3 border border-border text-sm text-text-secondary">
            No recipe cost snapshots have been persisted for this recipe yet.
          </div>
        ) : (
          <div className="space-y-2">
            {detail.snapshot_history.map((snapshot) => (
              <div key={snapshot.id} className="rounded-xl border border-border bg-white px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-text-primary">
                      {snapshot.version_number != null ? `Version ${snapshot.version_number}` : 'Legacy snapshot'} • {new Date(snapshot.snapshot_at).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-text-secondary">
                      {snapshot.resolved_ingredient_count}/{snapshot.ingredient_count} resolved • {snapshot.completeness_status} • {snapshot.confidence_label} confidence
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-text-primary">{formatRecipeCurrency(snapshot.total_cost)}</div>
                    <div className="text-xs text-text-secondary">{formatRecipeCurrency(snapshot.cost_per_serving)} / serving</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IngredientDiffCard({ diff }: { diff: RecipeWorkflowIngredientDiffPayload }) {
  const rowLabel = diff.current_row?.raw_ingredient_text ?? diff.previous_row?.raw_ingredient_text ?? diff.comparison_key;
  const resolutionBlocked = isResolutionBlockedDiff(diff);
  const changeTone = resolutionBlocked
    ? 'red'
    : diff.change_type === 'ADDED'
    ? 'blue'
    : diff.change_type === 'REMOVED'
      ? 'red'
      : diff.change_type === 'QUANTITY_CHANGED'
        ? 'amber'
        : diff.change_type === 'RESOLUTION_CHANGED'
          ? 'blue'
          : 'slate';

  return (
    <div className="rounded-xl border border-border bg-white p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-text-primary">{rowLabel}</div>
          <div className="text-xs text-text-secondary">{diff.summary}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {resolutionBlocked && (
            <WorkflowStatusPill tone="red">
              Resolution blocked
            </WorkflowStatusPill>
          )}
          <WorkflowStatusPill tone={changeTone}>
            {diff.change_type.replaceAll('_', ' ')}
          </WorkflowStatusPill>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-bg-page px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">Current version</div>
          {diff.current_row && <DiffRowLegend row={diff.current_row} />}
          {diff.current_row ? (
            <DiffRowDetail row={diff.current_row} />
          ) : (
            <div className="mt-2 text-sm text-text-secondary">Not present in the current promoted version.</div>
          )}
        </div>
        <div className="rounded-lg bg-bg-page px-3 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">Compared version</div>
          {diff.previous_row && <DiffRowLegend row={diff.previous_row} />}
          {diff.previous_row ? (
            <DiffRowDetail row={diff.previous_row} />
          ) : (
            <div className="mt-2 text-sm text-text-secondary">Not present in the comparison version.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function isResolutionBlockedDiff(diff: RecipeWorkflowIngredientDiffPayload): boolean {
  return [diff.current_row?.costability_status, diff.previous_row?.costability_status]
    .some((status) => status != null && status !== 'RESOLVED_FOR_COSTING');
}

function DiffRowLegend({ row }: { row: OperationalRecipeIngredientRowPayload }) {
  const blocked = row.costability_status !== 'RESOLVED_FOR_COSTING';
  return (
    <div className="mt-2 space-y-1 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <WorkflowStatusPill tone={blocked ? 'red' : 'green'}>
          {blocked ? 'Resolution blocked' : 'Resolved for costing'}
        </WorkflowStatusPill>
        <span className="text-text-secondary">{row.costability_status.replaceAll('_', ' ')}</span>
      </div>
      {blocked && (
        <div className="text-text-secondary">
          {getCostabilityBlockerReason(row.costability_status)}
        </div>
      )}
    </div>
  );
}

function getCostabilityBlockerReason(status: OperationalRecipeIngredientRowPayload['costability_status']): string {
  switch (status) {
    case 'MISSING_CANONICAL_INGREDIENT':
      return 'Semantic ingredient identity is still missing for this row.';
    case 'MISSING_SCOPED_INVENTORY_MAPPING':
      return 'Scoped inventory mapping is missing, so the recipe row cannot reach stocked item fulfillment.';
    case 'MISSING_SCOPED_VENDOR_MAPPING':
      return 'Scoped vendor mapping is missing, so the stocked item cannot reach a trusted supplier item.';
    case 'MISSING_VENDOR_COST_LINEAGE':
      return 'Vendor cost lineage is missing, so FIFOFlow cannot attach a trusted normalized supplier cost.';
    default:
      return 'This row is not fully resolved for costing in the current scope.';
  }
}

function DiffRowDetail({ row }: { row: OperationalRecipeIngredientRowPayload }) {
  const vendorLineage = row.vendor_cost_lineage as {
    vendor_item_name?: string | null;
    vendor_name?: string | null;
    normalized_unit_cost?: number | null;
    base_unit?: string | null;
  } | null;

  return (
    <div className="mt-2 space-y-1.5 text-sm">
      <div className="text-text-primary">{row.quantity} {row.unit}</div>
      <div className="text-text-secondary">
        {row.inventory_item_id != null ? row.inventory_item_name : 'No trusted inventory item'}
      </div>
      <div className="text-text-secondary">
        {vendorLineage?.vendor_item_name
          ? `${vendorLineage.vendor_name ?? 'Vendor'} • ${vendorLineage.vendor_item_name}`
          : 'No trusted vendor lineage'}
      </div>
      {vendorLineage?.normalized_unit_cost != null && (
        <div className="font-mono text-text-primary">
          {formatRecipeCurrency(vendorLineage.normalized_unit_cost)} / {vendorLineage.base_unit ?? row.base_unit}
        </div>
      )}
      <div className="text-xs text-text-secondary">{row.costability_status.replaceAll('_', ' ')}</div>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white border border-border px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-text-secondary">{label}</div>
      <div className="mt-1 text-base font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function IngredientResolutionCard({ row }: { row: OperationalRecipeIngredientRowPayload }) {
  const statusTone = row.costability_status === 'RESOLVED_FOR_COSTING'
    ? 'text-accent-green bg-accent-green/10'
    : row.costability_status === 'MISSING_CANONICAL_INGREDIENT'
      ? 'text-accent-red bg-accent-red/10'
      : 'text-accent-amber bg-accent-amber/15';

  const vendorLineage = row.vendor_cost_lineage as {
    vendor_item_name?: string | null;
    vendor_name?: string | null;
    normalized_unit_cost?: number | null;
    base_unit?: string | null;
    source_type?: string | null;
    stale?: boolean;
  } | null;

  return (
    <div className="rounded-xl border border-border bg-white p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-text-primary">{row.raw_ingredient_text}</div>
          <div className="text-xs text-text-secondary">
            Line {row.line_index ?? '—'} • {row.quantity} {row.unit}
            {row.preparation_note ? ` • ${row.preparation_note}` : ''}
          </div>
        </div>
        <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusTone}`}>
          {row.costability_status.replaceAll('_', ' ')}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-3 text-xs">
        <div className="rounded-lg bg-bg-page px-3 py-2">
          <div className="uppercase tracking-wide text-text-secondary">Canonical</div>
          <div className="mt-1 text-text-primary">{row.canonical_ingredient_name ?? 'Missing canonical identity'}</div>
        </div>
        <div className="rounded-lg bg-bg-page px-3 py-2">
          <div className="uppercase tracking-wide text-text-secondary">Inventory Fulfillment</div>
          <div className="mt-1 text-text-primary">{row.inventory_item_id != null ? row.inventory_item_name : 'No trusted inventory item'}</div>
        </div>
        <div className="rounded-lg bg-bg-page px-3 py-2">
          <div className="uppercase tracking-wide text-text-secondary">Vendor Cost Lineage</div>
          <div className="mt-1 text-text-primary">
            {vendorLineage?.vendor_item_name
              ? `${vendorLineage.vendor_name ?? 'Vendor'} • ${vendorLineage.vendor_item_name}`
              : 'No trusted vendor lineage'}
          </div>
          {vendorLineage?.normalized_unit_cost != null && (
            <div className="mt-1 text-text-secondary">
              {formatRecipeCurrency(vendorLineage.normalized_unit_cost)} / {vendorLineage.base_unit ?? row.base_unit}
              {vendorLineage.stale ? ' • stale' : ''}
            </div>
          )}
        </div>
      </div>

      <div className="text-sm text-text-secondary">{row.resolution_explanation}</div>
    </div>
  );
}

// ── Item Search Combobox ──────────────────────────────────────

function ItemSearchInput({
  items,
  selectedId,
  placeholder = 'Search items...',
  onSelect,
}: {
  items: { id: number; name: string; unit: string }[];
  selectedId: number;
  placeholder?: string;
  onSelect: (id: number, unit: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedItem = items.find((i) => i.id === selectedId);
  const displayValue = open ? query : (selectedItem?.name ?? '');

  const filtered = query.trim()
    ? items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())).slice(0, 20)
    : items.slice(0, 20);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="flex-1 relative">
      <input
        type="text"
        value={displayValue}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery(selectedItem?.name ?? '');
        }}
        className="w-full bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-border rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-secondary">No items found</div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item.id, item.unit);
                  setQuery(item.name);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover transition-colors ${
                  item.id === selectedId ? 'bg-accent-indigo/10 text-accent-indigo font-medium' : 'text-text-primary'
                }`}
              >
                {item.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Recipe List Tab ───────────────────────────────────────────

function RecipeList({
  forceCreate = false,
  onCreateHandled,
}: {
  forceCreate?: boolean;
  onCreateHandled?: () => void;
}) {
  const { data: recipes, isLoading } = useRecipes();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!forceCreate) {
      return;
    }
    setEditingId(null);
    setShowForm(true);
    onCreateHandled?.();
  }, [forceCreate, onCreateHandled]);

  const filteredRecipes = useMemo(() => {
    const rows = recipes ?? [];
    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }
    return rows.filter((recipe) => `${recipe.name} ${recipe.type} ${recipe.notes ?? ''}`.toLowerCase().includes(query));
  }, [recipes, search]);

  if (isLoading) return <div className="text-text-secondary text-sm">Loading...</div>;

  if (editingId) {
    return <RecipeForm recipeId={editingId} onDone={() => setEditingId(null)} />;
  }

  if (showForm) {
    return <RecipeForm onDone={() => setShowForm(false)} />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Recipe Catalog</h2>
            <p className="mt-1 text-sm text-slate-600">
              Build recipes as batch definitions with yield, serving size, and ingredient usage that can feed real order and inventory math.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search recipes, notes, or type"
              className="min-w-[280px] rounded-full border border-slate-300 bg-slate-50 px-4 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <button
              onClick={() => setShowForm(true)}
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Add Recipe
            </button>
          </div>
        </div>
      </div>

      {!recipes?.length ? (
        <WorkflowEmptyState
          title="No recipes yet"
          body="Create the first recipe with batch yield and serving math so FIFOFlow can turn ingredient quantities into usable inventory demand."
          action={(
            <button
              onClick={() => setShowForm(true)}
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Create first recipe
            </button>
          )}
        />
      ) : !filteredRecipes.length ? (
        <WorkflowEmptyState
          title="No recipes matched that search"
          body="Try a broader name, note, or recipe-type search."
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide">Recipe</th>
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide">Batch / Serving</th>
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-right">Ingredients</th>
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-right">Batch Cost</th>
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-right">Cost / Serving</th>
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecipes.map((recipe) => (
                <RecipeRow key={recipe.id} recipe={recipe} onEdit={() => setEditingId(recipe.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecipeRow({ recipe, onEdit }: { recipe: RecipeWithCost; onEdit: () => void }) {
  const deleteRecipe = useDeleteRecipe();
  const { toast } = useToast();

  return (
    <tr className="border-b border-slate-200 hover:bg-slate-50/80">
      <td className="px-4 py-3 align-top">
        <div className="font-medium text-slate-950">{recipe.name}</div>
        <div className="mt-1 text-xs text-slate-500">{recipe.notes || 'No operational note yet.'}</div>
      </td>
      <td className="px-4 py-3 align-top">
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
          recipe.type === 'dish'
            ? 'bg-accent-green/20 text-accent-green'
            : 'bg-accent-amber/20 text-accent-amber'
        }`}>
          {recipe.type}
        </span>
        <div className="mt-2 text-xs text-slate-600">{formatLegacyRecipeYield(recipe)}</div>
        <div className="mt-1 text-xs text-slate-500">{formatLegacyRecipeServing(recipe)}</div>
      </td>
      <td className="px-4 py-3 text-right font-mono text-slate-700">{recipe.item_count}</td>
      <td className="px-4 py-3 text-right font-mono text-slate-700">
        {recipe.total_cost != null ? `$${recipe.total_cost.toFixed(2)}` : '\u2014'}
      </td>
      <td className="px-4 py-3 text-right font-mono text-slate-700">
        {recipe.cost_per_serving != null ? `$${recipe.cost_per_serving.toFixed(2)}` : '\u2014'}
      </td>
      <td className="px-4 py-3 text-right">
        <button onClick={onEdit} className="mr-3 text-xs text-accent-indigo hover:underline">Edit</button>
        <button
          onClick={() => deleteRecipe.mutate(recipe.id, {
            onSuccess: () => toast('Recipe deleted', 'success'),
            onError: (err) => toast(err.message, 'error'),
          })}
          className="text-xs text-accent-red hover:underline"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

// ── Recipe Form ───────────────────────────────────────────────

interface IngredientRow {
  item_id: number;
  quantity: string;
  unit: string;
  template_ingredient_name: string | null;
  template_quantity: number | null;
  template_unit: string | null;
  template_sort_order: number | null;
}

function RecipeForm({ recipeId, onDone }: { recipeId?: number; onDone: () => void }) {
  const { data: existing } = useRecipe(recipeId ?? 0);
  const { data: items } = useItems();
  const { data: vendors } = useVendors();
  const { data: templates, isLoading: templatesLoading } = useRecipeTemplates();
  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();
  const { toast } = useToast();

  const [creationMode, setCreationMode] = useState<'template' | 'blank' | null>(recipeId ? 'blank' : null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'dish' | 'prep'>('dish');
  const [notes, setNotes] = useState('');
  const [yieldQuantity, setYieldQuantity] = useState('');
  const [yieldUnit, setYieldUnit] = useState<string>('each');
  const [servingQuantity, setServingQuantity] = useState('');
  const [servingUnit, setServingUnit] = useState<string>('each');
  const [servingCountOverride, setServingCountOverride] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([{
    item_id: 0,
    quantity: '',
    unit: 'each',
    template_ingredient_name: null,
    template_quantity: null,
    template_unit: null,
    template_sort_order: null,
  }]);
  const [initialized, setInitialized] = useState(false);
  const [appliedTemplateVersionId, setAppliedTemplateVersionId] = useState<number | null>(null);

  const { data: selectedTemplate, isLoading: templateDetailLoading } = useRecipeTemplate(selectedTemplateId);

  useEffect(() => {
    if (initialized) {
      return;
    }

    if (recipeId && !existing) {
      return;
    }

    if (existing) {
      setCreationMode('blank');
      setName(existing.name);
      setType(existing.type);
      setNotes(existing.notes ?? '');
      setYieldQuantity(existing.yield_quantity != null ? String(existing.yield_quantity) : '');
      setYieldUnit(existing.yield_unit ?? 'each');
      setServingQuantity(existing.serving_quantity != null ? String(existing.serving_quantity) : '');
      setServingUnit(existing.serving_unit ?? 'each');
      setServingCountOverride(existing.serving_count != null ? String(existing.serving_count) : '');
      setIngredients(existing.items.length > 0
        ? existing.items.map((ingredient) => ({
            item_id: ingredient.item_id,
            quantity: String(ingredient.quantity),
            unit: ingredient.unit,
            template_ingredient_name: null,
            template_quantity: null,
            template_unit: null,
            template_sort_order: null,
          }))
        : [{
            item_id: 0,
            quantity: '',
            unit: 'each',
            template_ingredient_name: null,
            template_quantity: null,
            template_unit: null,
            template_sort_order: null,
          }]);
      setAppliedTemplateVersionId(null);
    }

    setInitialized(true);
  }, [existing, initialized, recipeId]);

  useEffect(() => {
    if (creationMode !== 'template' || !templates?.length || selectedTemplateId != null) {
      return;
    }
    setSelectedTemplateId(templates[0].template_id);
  }, [creationMode, selectedTemplateId, templates]);

  const filteredTemplates = useMemo(() => {
    const rows = templates ?? [];
    const query = templateSearch.trim().toLowerCase();
    if (!query) {
      return rows;
    }
    return rows.filter((template) => `${template.name} ${template.category}`.toLowerCase().includes(query));
  }, [templateSearch, templates]);

  const createBlankIngredientRow = (): IngredientRow => ({
    item_id: 0,
    quantity: '',
    unit: 'each',
    template_ingredient_name: null,
    template_quantity: null,
    template_unit: null,
    template_sort_order: null,
  });

  const addIngredient = () => {
    setIngredients((prev) => [...prev, createBlankIngredientRow()]);
  };

  const removeIngredient = (idx: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateIngredient = (idx: number, field: keyof IngredientRow, value: string | number) => {
    setIngredients((prev) => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const derivedServingCount = useMemo(() => deriveServingCount({
    yieldQuantity,
    yieldUnit,
    servingQuantity,
    servingUnit,
  }), [yieldQuantity, yieldUnit, servingQuantity, servingUnit]);

  const effectiveServingCount = useMemo(() => {
    const manual = Number(servingCountOverride);
    if (manual > 0) {
      return manual;
    }
    return derivedServingCount;
  }, [derivedServingCount, servingCountOverride]);

  const validIngredientCount = ingredients.filter((ingredient) => ingredient.item_id > 0 && Number(ingredient.quantity) > 0).length;
  const itemMap = useMemo(() => new Map((items ?? []).map((item) => [item.id, item])), [items]);
  const vendorNameById = useMemo(() => new Map((vendors ?? []).map((vendor) => [vendor.id, vendor.name])), [vendors]);
  const unmatchedTemplateRowCount = ingredients.filter((ingredient) => ingredient.template_ingredient_name && ingredient.item_id <= 0).length;
  const allTemplateRowsMapped = ingredients.every((ingredient) => !ingredient.template_ingredient_name || ingredient.item_id > 0);
  const readinessIssues = useMemo(() => {
    const issues: string[] = [];
    if (!name.trim()) {
      issues.push('Recipe name is still missing.');
    }
    if (!yieldQuantity || !yieldUnit) {
      issues.push('Batch yield is not complete yet.');
    }
    if (type === 'dish' && !servingQuantity) {
      issues.push('Serving size is required before this recipe can drive downstream usage.');
    }
    if (type === 'dish' && (effectiveServingCount == null || effectiveServingCount <= 0)) {
      issues.push('Servings per batch are not derivable yet.');
    }
    if (validIngredientCount === 0) {
      issues.push('No inventory-backed ingredient rows are mapped yet.');
    }
    if (unmatchedTemplateRowCount > 0) {
      issues.push(`${unmatchedTemplateRowCount} template row${unmatchedTemplateRowCount === 1 ? ' is' : 's are'} still unmapped to live inventory.`);
    }
    return issues;
  }, [effectiveServingCount, name, servingQuantity, type, unmatchedTemplateRowCount, validIngredientCount, yieldQuantity, yieldUnit]);
  const usageReady = readinessIssues.length === 0 && allTemplateRowsMapped;
  const saveBlockingReason = creationMode === 'template' && appliedTemplateVersionId != null && unmatchedTemplateRowCount > 0
    ? 'Map or remove every template row before saving this draft. Unmapped template rows cannot be persisted safely yet.'
    : null;

  const applyTemplate = (template: RecipeTemplateDetailPayload) => {
    setCreationMode('template');
    setSelectedTemplateId(template.template_id);
    setAppliedTemplateVersionId(template.active_version_id);
    setName(template.name);
    setType(inferRecipeTypeFromTemplateCategory(template.category));
    setNotes((existingNotes) => {
      const templateNote = `Seeded from template: ${template.name} v${template.active_version_number}.`;
      if (!existingNotes.trim()) {
        return templateNote;
      }
      return existingNotes.includes(templateNote) ? existingNotes : `${templateNote}\n${existingNotes}`;
    });
    setYieldQuantity(String(template.yield_quantity));
    setYieldUnit(coerceRecipeUnit(template.yield_unit));
    setServingQuantity('');
    setServingUnit(coerceRecipeUnit(template.yield_unit));
    setServingCountOverride('');
    setIngredients(template.ingredients.map((ingredient) => ({
      item_id: 0,
      quantity: String(ingredient.qty),
      unit: coerceRecipeUnit(ingredient.unit),
      template_ingredient_name: ingredient.ingredient_name,
      template_quantity: ingredient.qty,
      template_unit: coerceRecipeUnit(ingredient.unit),
      template_sort_order: ingredient.sort_order,
    })));
  };

  const resetDraftForMode = (mode: 'template' | 'blank') => {
    if (recipeId) {
      return;
    }

    setCreationMode(mode);
    setSelectedTemplateId(mode === 'template' ? (templates?.[0]?.template_id ?? null) : null);
    setAppliedTemplateVersionId(null);
    setName('');
    setType('dish');
    setNotes('');
    setYieldQuantity('');
    setYieldUnit('each');
    setServingQuantity('');
    setServingUnit('each');
    setServingCountOverride('');
    setIngredients([createBlankIngredientRow()]);
    setTemplateSearch('');
  };

  const handleSubmit = () => {
    const data = {
      name,
      type,
      notes: notes || null,
      yield_quantity: yieldQuantity ? Number(yieldQuantity) : null,
      yield_unit: yieldQuantity && yieldUnit ? yieldUnit as Unit : null,
      serving_quantity: servingQuantity ? Number(servingQuantity) : null,
      serving_unit: servingQuantity && servingUnit ? servingUnit as Unit : null,
      serving_count: effectiveServingCount && effectiveServingCount > 0 ? effectiveServingCount : null,
      items: ingredients
        .filter((ingredient) => ingredient.item_id > 0 && Number(ingredient.quantity) > 0)
        .map((ingredient) => ({ item_id: ingredient.item_id, quantity: Number(ingredient.quantity), unit: ingredient.unit })),
    };

    if (recipeId) {
      updateRecipe.mutate({ id: recipeId, data }, {
        onSuccess: () => { toast('Recipe updated', 'success'); onDone(); },
        onError: (err) => toast(err.message, 'error'),
      });
      return;
    }

    createRecipe.mutate(data, {
      onSuccess: () => { toast('Recipe created', 'success'); onDone(); },
      onError: (err) => toast(err.message, 'error'),
    });
  };

  const isPending = createRecipe.isPending || updateRecipe.isPending;

  if (!recipeId && creationMode == null) {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Choose how to start this recipe</h2>
              <p className="mt-1 text-sm text-slate-600">
                Template mode is faster for seeded recipes and keeps source ingredient identity attached during inventory mapping. Blank mode is for one-off recipes you want to enter from scratch.
              </p>
            </div>
            <button onClick={onDone} className="text-sm text-slate-500 transition hover:text-slate-900">Cancel</button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <button
            type="button"
            onClick={() => resetDraftForMode('template')}
            className="rounded-3xl border border-slate-900 bg-slate-950 p-6 text-left text-white transition hover:bg-slate-900"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">Start from template</div>
            <div className="mt-3 text-2xl font-semibold">Use the seeded recipe library</div>
            <div className="mt-2 text-sm leading-6 text-slate-200">
              Search the 198 seeded templates, apply one into the draft, and map each source ingredient to live inventory with explicit identity carried through.
            </div>
          </button>

          <button
            type="button"
            onClick={() => resetDraftForMode('blank')}
            className="rounded-3xl border border-slate-200 bg-white p-6 text-left text-slate-950 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Start blank</div>
            <div className="mt-3 text-2xl font-semibold">Build a manual draft</div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              Use this when the recipe is not in the seeded library and you want to define the batch, portion math, and inventory rows manually.
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              {recipeId ? 'Edit Recipe' : 'New Recipe'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {creationMode === 'template'
                ? 'Start from the seeded template, verify the carried ingredient identity, then map each source row to live inventory.'
                : 'Define the batch yield first, then the serving size, then the ingredient quantities for the full batch.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!recipeId && (
              <button
                type="button"
                onClick={() => resetDraftForMode(creationMode === 'template' ? 'blank' : 'template')}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-slate-400 hover:text-slate-950"
              >
                {creationMode === 'template' ? 'Start blank instead' : 'Use template library'}
              </button>
            )}
            <button onClick={onDone} className="text-sm text-slate-500 transition hover:text-slate-900">Cancel</button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Recipe name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="e.g. House Pinot Pour"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Recipe type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as 'dish' | 'prep')}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="dish">Dish</option>
                  <option value="prep">Prep</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Ingredient rows</label>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {validIngredientCount} active row{validIngredientCount === 1 ? '' : 's'}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Operator note</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  rows={3}
                  placeholder="Prep notes, plating constraints, or station guidance"
                />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Batch yield</div>
                <p className="mt-1 text-sm text-slate-600">How much finished product one full recipe batch produces.</p>
                <div className="mt-3 grid gap-3 grid-cols-[minmax(0,1fr)_140px]">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={yieldQuantity}
                    onChange={(e) => setYieldQuantity(e.target.value)}
                    placeholder="e.g. 6"
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                  <select
                    value={yieldUnit}
                    onChange={(e) => setYieldUnit(e.target.value)}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  >
                    {UNITS.map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Serving size</div>
                <p className="mt-1 text-sm text-slate-600">What one usable portion represents for demand and cost math.</p>
                <div className="mt-3 grid gap-3 grid-cols-[minmax(0,1fr)_140px]">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={servingQuantity}
                    onChange={(e) => setServingQuantity(e.target.value)}
                    placeholder="e.g. 150"
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                  <select
                    value={servingUnit}
                    onChange={(e) => setServingUnit(e.target.value)}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  >
                    {UNITS.map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Derived servings per batch</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">
                  {derivedServingCount != null ? trimRecipeNumber(derivedServingCount) : 'Not yet derivable'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  FIFOFlow derives this when batch yield and serving size can convert into the same measurable unit.
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Manual servings override</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={servingCountOverride}
                  onChange={(e) => setServingCountOverride(e.target.value)}
                  placeholder={derivedServingCount != null ? trimRecipeNumber(derivedServingCount) : 'Optional'}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Use this when plating or trim loss means the theoretical yield does not equal real servings.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-950">Batch ingredients</div>
                <p className="mt-1 text-sm text-slate-600">
                  Enter quantities for the full batch. FIFOFlow will derive per-serving usage from the serving math above.
                </p>
              </div>
              <button
                onClick={addIngredient}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Add Ingredient
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {ingredients.map((ingredient, idx) => {
                const mappedItem = ingredient.item_id > 0 ? itemMap.get(ingredient.item_id) : undefined;
                const vendorName = mappedItem?.vendor_id ? vendorNameById.get(mappedItem.vendor_id) ?? null : null;
                const quantityNumber = Number(ingredient.quantity);
                const perServingUsage = effectiveServingCount && effectiveServingCount > 0 && quantityNumber > 0
                  ? trimRecipeNumber(quantityNumber / effectiveServingCount)
                  : null;
                const likelyMatches = getLikelyInventoryMatches(ingredient.template_ingredient_name, items ?? []);
                const hasLikelyMatches = likelyMatches.length > 0;
                const unitCompatible = mappedItem ? templateUnitMatchesInventoryUnit(ingredient.template_unit ?? ingredient.unit, mappedItem) : true;
                const templateLabel = ingredient.template_ingredient_name ?? `Manual row ${idx + 1}`;
                const templateQtyLabel = ingredient.template_quantity != null && ingredient.template_unit
                  ? `${trimRecipeNumber(ingredient.template_quantity)} ${ingredient.template_unit}`
                  : ingredient.quantity && ingredient.unit
                    ? `${trimRecipeNumber(Number(ingredient.quantity))} ${ingredient.unit}`
                    : 'Quantity not set yet';
                const mappingContext = formatInventoryMappingContext(mappedItem, vendorName);
                const mappedUnitLabel = mappedItem
                  ? `${mappedItem.unit}${mappedItem.order_unit ? ` • orders in ${mappedItem.order_unit}` : ''}`
                  : 'No inventory mapping';

                return (
                  <div key={idx} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                          {ingredient.template_ingredient_name ? `Template row ${ingredient.template_sort_order ?? idx + 1}` : `Manual row ${idx + 1}`}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-950">{templateLabel}</div>
                        <div className="mt-1 text-xs text-slate-500">Source quantity {templateQtyLabel}</div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${mappedItem ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {mappedItem ? 'Mapped to inventory' : 'Needs inventory mapping'}
                        </span>
                        {mappedItem && !unitCompatible && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                            Unit mismatch warning
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_120px_120px_minmax(0,0.95fr)_80px] lg:items-start">
                      <div className="space-y-2">
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Mapped inventory item</label>
                        <ItemSearchInput
                          items={items ?? []}
                          selectedId={ingredient.item_id}
                          placeholder={ingredient.template_ingredient_name ? `Map ${ingredient.template_ingredient_name}` : 'Search items...'}
                          onSelect={(id, unit) => {
                            updateIngredient(idx, 'item_id', id);
                            updateIngredient(idx, 'unit', unit);
                          }}
                        />
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                          <div className="font-medium text-slate-900">{mappedItem ? mappedItem.name : 'No mapped inventory item yet'}</div>
                          <div className="mt-1">{mappedUnitLabel}</div>
                          <div className="mt-1">{mappingContext}</div>
                        </div>
                        {ingredient.template_ingredient_name && (
                          <div className="rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Likely inventory matches</div>
                            {hasLikelyMatches ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {likelyMatches.map((match) => (
                                  <button
                                    key={`${ingredient.template_ingredient_name}-${match.id}`}
                                    type="button"
                                    onClick={() => {
                                      updateIngredient(idx, 'item_id', match.id);
                                      updateIngredient(idx, 'unit', match.unit);
                                    }}
                                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                      ingredient.item_id === match.id
                                        ? 'border-slate-900 bg-slate-900 text-white'
                                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-950'
                                    }`}
                                  >
                                    {match.name}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-2 text-xs text-amber-700">
                                No sensible match was found from current inventory names. Keep this row unmapped until the right stocked item exists.
                              </div>
                            )}
                          </div>
                        )}
                        {mappedItem && !unitCompatible && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            The template expects {ingredient.template_unit ?? ingredient.unit}, but {mappedItem.name} is configured as {mappedItem.unit}
                            {mappedItem.order_unit ? ` and orders in ${mappedItem.order_unit}` : ''}. Check the stocked item or adjust the recipe row before saving this draft.
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Batch qty</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="Qty"
                          value={ingredient.quantity}
                          onChange={(e) => updateIngredient(idx, 'quantity', e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-right text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Unit</label>
                        <select
                          value={ingredient.unit}
                          onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        >
                          {UNITS.map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Per serving usage</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {perServingUsage ? `${perServingUsage} ${ingredient.unit}` : 'Set serving math'}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {mappedItem?.order_unit_price != null
                            ? `${formatRecipeCurrency(mappedItem.order_unit_price)} per ${mappedItem.order_unit ?? mappedItem.unit}`
                            : 'No cost context yet'}
                        </div>
                      </div>
                      <div className="flex lg:justify-end">
                        <button
                          onClick={() => removeIngredient(idx)}
                          className="mt-5 text-xs font-medium text-rose-600 transition hover:text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            {creationMode === 'template' ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Seeded template library</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Pick a seeded recipe first, then map every source ingredient row to a live inventory item without losing the original template identity.
                    </div>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {templates?.length ?? 0} templates
                  </div>
                </div>

                <div className="mt-4">
                  <input
                    value={templateSearch}
                    onChange={(event) => setTemplateSearch(event.target.value)}
                    placeholder="Search template name or category"
                    className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                  <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                    {templatesLoading ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                        Loading template library...
                      </div>
                    ) : !filteredTemplates.length ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                        No templates matched that search.
                      </div>
                    ) : (
                      filteredTemplates.map((template) => {
                        const selected = template.template_id === selectedTemplateId;
                        return (
                          <button
                            key={template.template_id}
                            type="button"
                            onClick={() => setSelectedTemplateId(template.template_id)}
                            className={selected
                              ? 'w-full rounded-2xl border border-slate-900 bg-slate-950 px-4 py-3 text-left text-white'
                              : 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-slate-900 transition hover:border-slate-300 hover:bg-white'}
                          >
                            <div className="font-medium">{template.name}</div>
                            <div className={selected ? 'mt-1 text-xs text-slate-200' : 'mt-1 text-xs text-slate-500'}>
                              {template.category} • {trimRecipeNumber(template.yield_quantity)} {template.yield_unit} • {template.ingredient_count} rows
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    {templateDetailLoading && selectedTemplateId != null ? (
                      <div className="text-sm text-slate-500">Loading template detail...</div>
                    ) : selectedTemplate ? (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-slate-950">{selectedTemplate.name}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {selectedTemplate.category} • Active v{selectedTemplate.active_version_number}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => applyTemplate(selectedTemplate)}
                            className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                          >
                            Apply Template
                          </button>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Template yield</div>
                            <div className="mt-1 text-sm font-semibold text-slate-950">
                              {trimRecipeNumber(selectedTemplate.yield_quantity)} {selectedTemplate.yield_unit}
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Ingredient rows</div>
                            <div className="mt-1 text-sm font-semibold text-slate-950">{selectedTemplate.ingredient_count}</div>
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Template ingredients</div>
                          <div className="mt-2 max-h-[180px] space-y-2 overflow-y-auto pr-1">
                            {selectedTemplate.ingredients.map((ingredient) => (
                              <div key={`${selectedTemplate.template_id}-${ingredient.sort_order}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                                <div className="font-medium text-slate-950">{ingredient.ingredient_name}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {trimRecipeNumber(ingredient.qty)} {ingredient.unit}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {appliedTemplateVersionId === selectedTemplate.active_version_id ? (
                          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                            This template is currently applied to the draft form.
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="text-sm text-slate-500">Select a template to preview and apply it to the recipe form.</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                Blank mode is active. This draft is manual-first, so there is no seeded ingredient identity to carry through mapping. If this recipe belongs in the library, switch back to template mode before entering the rows.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Recipe math summary</div>
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                usageReady ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                {usageReady ? 'Usage ready' : 'Draft only'}
              </span>
            </div>
            <dl className="mt-4 space-y-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Batch yield</dt>
                <dd className="font-semibold text-slate-950">
                  {yieldQuantity && yieldUnit ? `${trimRecipeNumber(Number(yieldQuantity))} ${yieldUnit}` : 'Not set'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Serving size</dt>
                <dd className="font-semibold text-slate-950">
                  {servingQuantity && servingUnit ? `${trimRecipeNumber(Number(servingQuantity))} ${servingUnit}` : 'Not set'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Effective servings / batch</dt>
                <dd className="font-semibold text-slate-950">
                  {effectiveServingCount != null ? trimRecipeNumber(effectiveServingCount) : 'Not set'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Batch ingredients</dt>
                <dd className="font-semibold text-slate-950">{validIngredientCount}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Estimated batch cost</dt>
                <dd className="font-semibold text-slate-950">
                  {existing?.total_cost != null ? `$${existing.total_cost.toFixed(2)}` : 'Preview after save'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Estimated cost / serving</dt>
                <dd className="font-semibold text-slate-950">
                  {existing?.cost_per_serving != null ? `$${existing.cost_per_serving.toFixed(2)}` : 'Preview after save'}
                </dd>
              </div>
            </dl>
            <div className={`mt-5 rounded-2xl border px-4 py-3 text-xs leading-5 ${
              usageReady ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              {usageReady
                ? 'This draft has the minimum serving math and inventory mapping needed to feed downstream usage cleanly once it is promoted.'
                : 'This draft is not operationally ready yet. FIFOFlow will keep it as a draft until the missing usage math or inventory mapping is completed.'}
            </div>
            {!usageReady && readinessIssues.length > 0 && (
              <ul className="mt-3 space-y-2 text-xs text-slate-600">
                {readinessIssues.map((issue) => (
                  <li key={issue} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    {issue}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
              Ingredient quantities should always represent the full batch. Portion demand and menu usage now flow from servings-per-batch instead of assuming every quantity is already per guest.
            </div>
          </div>

          {createRecipe.error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {createRecipe.error.message}
            </div>
          )}
          {updateRecipe.error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {updateRecipe.error.message}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {saveBlockingReason && (
          <div className="mr-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            {saveBlockingReason}
          </div>
        )}
        <button
          onClick={onDone}
          className="border border-border text-text-secondary px-4 py-2 rounded-lg text-sm hover:bg-bg-hover transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={isPending || !name.trim() || saveBlockingReason != null}
          className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
        >
          {recipeId ? 'Save Draft Changes' : 'Create Draft Recipe'}
        </button>
      </div>
    </div>
  );
}

// ── Product Menus Tab ─────────────────────────────────────────

function ProductMenus() {
  const { data: venues, isLoading: venuesLoading } = useVenues();
  const { data: recipes } = useRecipes();
  const { data: productRecipes, isLoading: prLoading } = useProductRecipes();
  const setProductRecipe = useSetProductRecipe();
  const deleteProductRecipe = useDeleteProductRecipe();
  const updateVenue = useUpdateVenue();
  const reorderVenues = useReorderVenues();
  const { toast } = useToast();

  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState(0);
  const [portionsPerGuest, setPortionsPerGuest] = useState('1');
  const [showHidden, setShowHidden] = useState(false);

  if (venuesLoading || prLoading) return <div className="text-text-secondary text-sm">Loading...</div>;
  if (!venues?.length) return <div className="text-text-secondary text-sm">No venues configured. Add venues first.</div>;

  const visibleVenues = venues.filter((v) => v.show_in_menus);
  const hiddenVenues = venues.filter((v) => !v.show_in_menus);

  const toggleVenueVisibility = (venueId: number, name: string, show: number) => {
    updateVenue.mutate(
      { id: venueId, data: { name, show_in_menus: show } },
      {
        onSuccess: () => toast(show ? 'Venue shown in menus' : 'Venue hidden from menus', 'success'),
        onError: (err) => toast(err.message, 'error'),
      },
    );
  };

  const recipesByVenue = new Map<number, typeof productRecipes>();
  for (const pr of productRecipes ?? []) {
    const arr = recipesByVenue.get(pr.venue_id) ?? [];
    arr.push(pr);
    recipesByVenue.set(pr.venue_id, arr);
  }

  const handleAdd = (venueId: number) => {
    if (!selectedRecipeId) return;
    setProductRecipe.mutate(
      { venueId, data: { recipe_id: selectedRecipeId, portions_per_guest: Number(portionsPerGuest) || 1 } },
      {
        onSuccess: () => { toast('Recipe assigned', 'success'); setAddingFor(null); setSelectedRecipeId(0); setPortionsPerGuest('1'); },
        onError: (err) => toast(err.message, 'error'),
      },
    );
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const ids = visibleVenues.map((v) => v.id);
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= ids.length) return;
    [ids[index], ids[swapIdx]] = [ids[swapIdx], ids[index]];
    // Append hidden venue IDs at the end to preserve full ordering
    const hiddenIds = hiddenVenues.map((v) => v.id);
    reorderVenues.mutate([...ids, ...hiddenIds]);
  };

  return (
    <div className="space-y-4">
      {visibleVenues.map((venue, venueIndex) => {
        const assigned = recipesByVenue.get(venue.id) ?? [];
        return (
          <div key={venue.id} className="bg-bg-card rounded-xl shadow-sm">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button
                    onClick={() => handleMove(venueIndex, 'up')}
                    disabled={venueIndex === 0 || reorderVenues.isPending}
                    className="text-text-secondary hover:text-text-primary disabled:opacity-20 text-xs leading-none"
                    title="Move up"
                  >
                    &#9650;
                  </button>
                  <button
                    onClick={() => handleMove(venueIndex, 'down')}
                    disabled={venueIndex === visibleVenues.length - 1 || reorderVenues.isPending}
                    className="text-text-secondary hover:text-text-primary disabled:opacity-20 text-xs leading-none"
                    title="Move down"
                  >
                    &#9660;
                  </button>
                </div>
                <h3 className="text-base font-semibold text-text-primary">{venue.name}</h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleVenueVisibility(venue.id, venue.name, 0)}
                  className="text-text-muted text-xs hover:text-accent-red"
                  title="Hide from menus"
                >
                  Hide
                </button>
                <button
                  onClick={() => setAddingFor(addingFor === venue.id ? null : venue.id)}
                  className="text-accent-indigo text-xs hover:underline"
                >
                  {addingFor === venue.id ? 'Cancel' : '+ Add Recipe'}
                </button>
              </div>
            </div>

            {addingFor === venue.id && (
              <div className="px-4 py-3 border-b border-border bg-bg-hover flex items-center gap-2">
                <select
                  value={selectedRecipeId}
                  onChange={(e) => setSelectedRecipeId(Number(e.target.value))}
                  className="flex-1 bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
                >
                  <option value={0}>Select recipe...</option>
                  {(recipes ?? []).map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={portionsPerGuest}
                  onChange={(e) => setPortionsPerGuest(e.target.value)}
                  className="w-24 bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-right text-text-primary"
                  placeholder="Portions/guest"
                />
                <span className="text-text-secondary text-xs whitespace-nowrap">per guest</span>
                <button
                  onClick={() => handleAdd(venue.id)}
                  disabled={!selectedRecipeId || setProductRecipe.isPending}
                  className="bg-accent-indigo text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
              </div>
            )}

            {assigned.length === 0 ? (
              <div className="px-4 py-3 text-text-secondary text-xs">No recipes assigned.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-bg-table-header text-text-secondary text-left">
                    <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide">Recipe</th>
                    <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide">Type</th>
                    <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Portions/Guest</th>
                    <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assigned.map((pr) => (
                    <tr key={pr.id} className="border-b border-border hover:bg-bg-hover">
                      <td className="px-4 py-2 text-text-primary">{pr.recipe_name}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          pr.recipe_type === 'dish'
                            ? 'bg-accent-green/20 text-accent-green'
                            : 'bg-accent-amber/20 text-accent-amber'
                        }`}>
                          {pr.recipe_type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-text-secondary">{pr.portions_per_guest}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => deleteProductRecipe.mutate(pr.id, {
                            onSuccess: () => toast('Recipe removed', 'success'),
                            onError: (err) => toast(err.message, 'error'),
                          })}
                          className="text-accent-red text-xs hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {/* Hidden venues */}
      {hiddenVenues.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="text-text-secondary text-xs hover:text-text-primary"
          >
            {showHidden ? 'Hide' : 'Show'} {hiddenVenues.length} hidden venue{hiddenVenues.length > 1 ? 's' : ''}
          </button>
          {showHidden && (
            <div className="mt-2 space-y-2">
              {hiddenVenues.map((venue) => (
                <div key={venue.id} className="bg-bg-card rounded-xl shadow-sm opacity-60">
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-text-secondary">{venue.name}</span>
                    <button
                      onClick={() => toggleVenueVisibility(venue.id, venue.name, 1)}
                      className="text-accent-indigo text-xs hover:underline"
                    >
                      Show in Menus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Calculate Order Tab ───────────────────────────────────────

type ForecastStep = 'idle' | 'parsing' | 'mapping';

function CalculateOrder() {
  const { data: allVenues } = useVenues();
  const venues = allVenues?.filter((v) => v.show_in_menus);
  const { data: vendors } = useVendors();
  const { data: allItems } = useItems();
  const calculateOrder = useCalculateOrder();
  const createOrder = useCreateOrder();
  const { toast } = useToast();

  const setItemCount = useSetItemCount();
  const [guestCounts, setGuestCounts] = useState<Record<number, string>>({});
  const [vendorFilter, setVendorFilter] = useState<number | undefined>(undefined);
  const [result, setResult] = useState<OrderCalculationResult | null>(null);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [stockOverrides, setStockOverrides] = useState<Record<number, string>>({});
  const [orderOverrides, setOrderOverrides] = useState<Record<number, string>>({});
  const [savingCounts, setSavingCounts] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [manualItems, setManualItems] = useState<Array<{
    item_id: number; item_name: string; quantity: string;
    vendor_id: number | null; vendor_name: string | null;
    order_unit: string | null; order_unit_price: number | null; item_unit: string;
  }>>([]);
  const [showAddItem, setShowAddItem] = useState(false);

  // Forecast state
  const [forecastStep, setForecastStep] = useState<ForecastStep>('idle');
  const [forecastParseResult, setForecastParseResult] = useState<ForecastParseResult | null>(null);
  const [productMappings, setProductMappings] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parseForecast = useParseForecast();
  const saveForecastMut = useSaveForecast();
  const { data: forecasts } = useForecasts();
  const { data: existingMappings } = useForecastMappings();
  const saveMappings = useSaveForecastMappings();
  const updateForecastEntry = useUpdateForecastEntry();

  // Load the latest saved forecast with entries
  const latestForecastId = forecasts && forecasts.length > 0 ? forecasts[0].id : 0;
  const { data: savedForecast } = useForecast(latestForecastId);

  // Compute guest counts per venue per date from saved forecast + mappings
  const forecastByDate = (() => {
    if (!savedForecast?.entries || !existingMappings) return null;
    const mappingMap = new Map(existingMappings.map((m) => [m.product_name, m.venue_id]));
    const byDate: Record<string, Record<number, number>> = {};
    for (const entry of savedForecast.entries) {
      const venueId = mappingMap.get(entry.product_name);
      if (!venueId) continue;
      if (!byDate[entry.forecast_date]) byDate[entry.forecast_date] = {};
      byDate[entry.forecast_date][venueId] = (byDate[entry.forecast_date][venueId] || 0) + entry.guest_count;
    }
    return byDate;
  })();

  // Lookup: "date|venueId" → array of forecast_entries rows for that cell
  const forecastEntryLookup = (() => {
    if (!savedForecast?.entries || !existingMappings) return new Map<string, Array<{ id: number; guest_count: number }>>();
    const mappingMap = new Map(existingMappings.map((m) => [m.product_name, m.venue_id]));
    const lookup = new Map<string, Array<{ id: number; guest_count: number }>>();
    for (const entry of savedForecast.entries) {
      const venueId = mappingMap.get(entry.product_name);
      if (!venueId) continue;
      const key = `${entry.forecast_date}|${venueId}`;
      const arr = lookup.get(key) ?? [];
      arr.push({ id: entry.id, guest_count: entry.guest_count });
      lookup.set(key, arr);
    }
    return lookup;
  })();

  const today = new Date().toISOString().slice(0, 10);
  const forecastDates = (savedForecast?.raw_dates ?? []).filter(d => d >= today);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setForecastStep('parsing');
    parseForecast.mutate(file, {
      onSuccess: (data) => {
        setForecastParseResult(data);
        const prefilled: Record<string, number> = {};
        for (const product of data.products) {
          const existing = existingMappings?.find((m) => m.product_name === product.product_name);
          if (existing) {
            prefilled[product.product_name] = existing.venue_id;
          }
        }
        setProductMappings(prefilled);
        setForecastStep('mapping');
      },
      onError: (err) => {
        toast(err.message, 'error');
        setForecastStep('idle');
      },
    });
    e.target.value = '';
  };

  const handleSaveMappingsAndForecast = () => {
    const mappingsToSave = Object.entries(productMappings)
      .filter(([, venueId]) => venueId > 0)
      .map(([product_name, venue_id]) => ({ product_name, venue_id }));

    if (mappingsToSave.length === 0) {
      toast('Map at least one product to a venue', 'error');
      return;
    }

    // Save mappings, then save the forecast to DB
    saveMappings.mutate(mappingsToSave, {
      onSuccess: () => {
        if (!forecastParseResult) return;
        saveForecastMut.mutate(
          {
            filename: 'forecast.pdf',
            dates: forecastParseResult.dates,
            products: forecastParseResult.products.map((p) => ({
              product_name: p.product_name,
              group: p.group,
              counts: p.counts,
            })),
          },
          {
            onSuccess: () => {
              setForecastStep('idle');
              setForecastParseResult(null);
              toast('Forecast saved', 'success');
            },
            onError: (err) => toast(err.message, 'error'),
          },
        );
      },
      onError: (err) => toast(err.message, 'error'),
    });
  };

  const handleDateSelect = (date: string) => {
    if (!forecastByDate) return;
    const countsForDate = forecastByDate[date] ?? {};
    const newCounts: Record<number, string> = {};
    for (const [venueId, count] of Object.entries(countsForDate)) {
      newCounts[Number(venueId)] = String(count);
    }
    setGuestCounts(newCounts);
    setSelectedDate(date);
    setResult(null);

    // Auto-calculate
    const guest_counts = Object.entries(newCounts)
      .filter(([, v]) => Number(v) > 0)
      .map(([venue_id, guest_count]) => ({ venue_id: Number(venue_id), guest_count: Number(guest_count) }));

    if (guest_counts.length > 0) {
      setStockOverrides({});
      setOrderOverrides({});
      setManualItems([]);
      setShowAddItem(false);
      calculateOrder.mutate(
        { guest_counts, vendor_id: vendorFilter },
        {
          onSuccess: (data) => setResult(data),
          onError: (err) => toast(err.message, 'error'),
        },
      );
    }

    const d = new Date(date + 'T12:00:00');
    toast(`Loaded forecast for ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`, 'success');
  };

  // Compute effective ingredient values with stock overrides applied
  const getEffectiveIngredient = (ing: CalculatedIngredient) => {
    const overrideStr = stockOverrides[ing.item_id];
    if (overrideStr === undefined) return ing;

    const newQty = Number(overrideStr) || 0;
    // Derive conversion factor from original data
    let newConvertedStock: number | null = null;
    if (ing.converted_stock != null && ing.current_qty > 0) {
      const factor = ing.converted_stock / ing.current_qty;
      newConvertedStock = newQty * factor;
    }
    const stockInRecipeUnit = newConvertedStock ?? newQty;
    const newShortage = Math.max(0, Math.round((ing.total_needed - stockInRecipeUnit) * 100) / 100);

    // Recalculate shortage_order and estimated_cost
    let newShortageOrder = ing.shortage_order;
    let newEstimatedCost = ing.estimated_cost;
    if (ing.shortage > 0 && ing.shortage_order != null) {
      const orderFactor = ing.shortage_order / ing.shortage;
      newShortageOrder = Math.round(newShortage * orderFactor * 100) / 100;
      if (ing.estimated_cost != null && ing.shortage_order > 0) {
        const costPerOrderUnit = ing.estimated_cost / Math.ceil(ing.shortage_order);
        newEstimatedCost = Math.round(Math.ceil(newShortageOrder) * costPerOrderUnit * 100) / 100;
      }
    } else if (newShortage === 0) {
      newShortageOrder = 0;
      newEstimatedCost = 0;
    }

    return {
      ...ing,
      current_qty: newQty,
      converted_stock: newConvertedStock,
      shortage: newShortage,
      shortage_order: newShortageOrder,
      estimated_cost: newEstimatedCost,
    };
  };

  const hasStockOverrides = Object.keys(stockOverrides).length > 0;

  const handleSaveCountsAndRecalculate = async () => {
    if (!hasStockOverrides) return;
    setSavingCounts(true);

    try {
      // Save each stock override as a count adjustment
      for (const [itemIdStr, qtyStr] of Object.entries(stockOverrides)) {
        const itemId = Number(itemIdStr);
        const qty = Number(qtyStr) || 0;
        await setItemCount.mutateAsync({
          id: itemId,
          data: { counted_qty: qty, notes: 'Adjusted from order calculator' },
        });
      }
      setStockOverrides({});
      setOrderOverrides({});
      toast('Stock counts saved', 'success');

      // Re-run calculation with updated stock
      const guest_counts = (venues ?? [])
        .filter((v) => Number(guestCounts[v.id] || 0) > 0)
        .map((v) => ({ venue_id: v.id, guest_count: Number(guestCounts[v.id]) }));

      if (guest_counts.length > 0) {
        calculateOrder.mutate(
          { guest_counts, vendor_id: vendorFilter },
          {
            onSuccess: (data) => setResult(data),
            onError: (err) => toast(err.message, 'error'),
          },
        );
      }
    } catch (err: any) {
      toast(`Failed to save counts: ${err.message}`, 'error');
    } finally {
      setSavingCounts(false);
    }
  };

  const handleCalculate = () => {
    const guest_counts = (venues ?? [])
      .filter((v) => Number(guestCounts[v.id] || 0) > 0)
      .map((v) => ({ venue_id: v.id, guest_count: Number(guestCounts[v.id]) }));

    if (guest_counts.length === 0) {
      toast('Enter guest counts for at least one venue', 'error');
      return;
    }

    setStockOverrides({});
    setManualItems([]);
    setShowAddItem(false);
    calculateOrder.mutate(
      { guest_counts, vendor_id: vendorFilter },
      {
        onSuccess: (data) => setResult(data),
        onError: (err) => toast(err.message, 'error'),
      },
    );
  };

  // Round up to nearest 0.5
  const ceilHalf = (n: number) => Math.ceil(n * 2) / 2;

  // Get the order quantity for an ingredient (from override or default shortage)
  const getOrderQty = (ing: CalculatedIngredient) => {
    const override = orderOverrides[ing.item_id];
    if (override !== undefined) return Number(override) || 0;
    // Default: shortage rounded up to nearest 0.5
    const raw = ing.shortage_order ?? ing.shortage;
    return raw > 0 ? ceilHalf(raw) : 0;
  };

  const handleCreateDraftOrder = () => {
    if (!result) return;

    const effective = result.ingredients.map(getEffectiveIngredient);
    const byVendor = new Map<number, { ing: CalculatedIngredient; orderQty: number }[]>();
    for (const ing of effective) {
      const orderQty = getOrderQty(ing);
      if (orderQty <= 0 || !ing.vendor_id) continue;
      const arr = byVendor.get(ing.vendor_id) ?? [];
      arr.push({ ing, orderQty });
      byVendor.set(ing.vendor_id, arr);
    }

    // Include manually added items
    for (const mi of manualItems) {
      const qty = Number(mi.quantity) || 0;
      if (qty <= 0 || !mi.vendor_id) continue;
      const arr = byVendor.get(mi.vendor_id) ?? [];
      arr.push({
        ing: { item_id: mi.item_id, item_name: mi.item_name, order_unit: mi.order_unit, recipe_unit: mi.item_unit, order_unit_price: mi.order_unit_price, vendor_id: mi.vendor_id } as CalculatedIngredient,
        orderQty: qty,
      });
      byVendor.set(mi.vendor_id, arr);
    }

    if (byVendor.size === 0) {
      toast('Nothing to order', 'error');
      return;
    }

    let created = 0;
    for (const [vid, entries] of byVendor) {
      const items = entries.map(({ ing, orderQty }) => ({
        item_id: ing.item_id,
        quantity: orderQty,
        unit: ing.order_unit ?? ing.recipe_unit,
        unit_price: ing.order_unit_price ?? 0,
      }));

      createOrder.mutate(
        { vendor_id: vid, notes: 'Auto-generated from recipe calculation', items },
        {
          onSuccess: () => {
            created++;
            if (created === byVendor.size) {
              toast(`${created} draft order(s) created`, 'success');
            }
          },
          onError: (err) => toast(`Failed: ${err.message}`, 'error'),
        },
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Forecast upload / parsing */}
      {forecastStep === 'parsing' && (
        <div className="bg-bg-card rounded-xl shadow-sm p-4 flex items-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-accent-indigo border-t-transparent rounded-full" />
          <span className="text-sm text-text-secondary">Parsing forecast PDF...</span>
        </div>
      )}

      {forecastStep === 'mapping' && forecastParseResult && (
        <div className="bg-bg-card rounded-xl shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Map Forecast Products to Venues</h3>
            <button onClick={() => setForecastStep('idle')} className="text-text-secondary text-xs hover:text-text-primary">Cancel</button>
          </div>
          <p className="text-xs text-text-secondary">
            Assign each forecast product to a venue. Mappings are saved for future uploads.
          </p>
          <div className="space-y-2">
            {forecastParseResult.products.map((product) => (
              <div key={product.product_name} className="flex items-center gap-3">
                <span className="text-xs text-text-muted w-10 shrink-0">{product.group}</span>
                <span className="text-xs text-text-primary w-56 truncate font-medium" title={product.product_name}>
                  {product.product_name}
                </span>
                <select
                  value={productMappings[product.product_name] ?? ''}
                  onChange={(e) => setProductMappings((prev) => ({
                    ...prev,
                    [product.product_name]: Number(e.target.value),
                  }))}
                  className="flex-1 bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
                >
                  <option value="">-- Skip --</option>
                  {(venues ?? []).map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleSaveMappingsAndForecast}
              disabled={saveMappings.isPending || saveForecastMut.isPending}
              className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
            >
              {saveMappings.isPending || saveForecastMut.isPending ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </div>
      )}

      {/* Persistent forecast date grid */}
      {forecastStep === 'idle' && forecastDates.length > 0 && forecastByDate && (
        <div className="bg-bg-card rounded-xl shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Forecast — Select a Date to Calculate</h3>
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={parseForecast.isPending}
                className="text-text-secondary text-xs hover:text-text-primary"
              >
                Upload New
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-secondary">
                  <th className="text-left py-1 pr-3 font-medium">Date</th>
                  {(venues ?? []).map((v) => (
                    <th key={v.id} className="text-right py-1 px-2 font-medium whitespace-nowrap">{v.name}</th>
                  ))}
                  <th className="text-right py-1 pl-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {forecastDates.map((date) => {
                  const d = new Date(date + 'T12:00:00');
                  const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  const dateCounts = forecastByDate[date] ?? {};
                  const total = Object.values(dateCounts).reduce((s, c) => s + c, 0);
                  const isSelected = selectedDate === date;
                  return (
                    <tr
                      key={date}
                      onClick={() => handleDateSelect(date)}
                      className={`cursor-pointer border-t border-border transition-colors ${
                        isSelected
                          ? 'bg-accent-indigo/10 font-semibold'
                          : 'hover:bg-bg-hover'
                      }`}
                    >
                      <td className="py-1.5 pr-3 text-text-primary whitespace-nowrap">{label}</td>
                      {(venues ?? []).map((v) => {
                        const cellVal = dateCounts[v.id] || 0;
                        const entries = forecastEntryLookup.get(`${date}|${v.id}`) ?? [];
                        return (
                          <td key={v.id} className="text-right py-1.5 px-1">
                            <input
                              type="number"
                              min="0"
                              defaultValue={cellVal}
                              key={`${date}-${v.id}-${cellVal}`}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => {
                                const newVal = Number(e.target.value) || 0;
                                if (newVal === cellVal) return;
                                if (entries.length === 1) {
                                  updateForecastEntry.mutate({ entryId: entries[0].id, guest_count: newVal });
                                } else if (entries.length > 1) {
                                  const ratio = cellVal > 0 ? newVal / cellVal : 0;
                                  for (const entry of entries) {
                                    updateForecastEntry.mutate({ entryId: entry.id, guest_count: Math.round(entry.guest_count * ratio) });
                                  }
                                }
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              className="w-14 text-right font-mono text-xs px-1 py-0.5 rounded border border-transparent hover:border-border focus:border-accent-indigo bg-transparent text-text-secondary focus:bg-white focus:text-text-primary focus:outline-none"
                            />
                          </td>
                        );
                      })}
                      <td className="text-right py-1.5 pl-2 font-mono text-text-primary font-semibold">
                        {total || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No forecast — show upload button */}
      {forecastStep === 'idle' && forecastDates.length === 0 && (
        <div className="flex items-center gap-3">
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={parseForecast.isPending}
            className="bg-accent-amber text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-amber/80 disabled:opacity-40 transition-colors"
          >
            Upload Forecast PDF
          </button>
          <span className="text-xs text-text-secondary">or enter guest counts manually below</span>
        </div>
      )}

      {/* Guest count inputs + calculate */}
      <div className="bg-bg-card rounded-xl shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">
          Guest Counts
          {selectedDate && (() => {
            const d = new Date(selectedDate + 'T12:00:00');
            return <span className="text-text-secondary font-normal ml-2">— {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>;
          })()}
        </h3>
        <div className="space-y-2">
          {(venues ?? []).map((v) => (
            <div key={v.id} className="flex items-center gap-3">
              <label className="text-xs text-text-secondary w-48 truncate" title={v.name}>{v.name}</label>
              <input
                type="number"
                min="0"
                value={guestCounts[v.id] ?? ''}
                onChange={(e) => setGuestCounts((prev) => ({ ...prev, [v.id]: e.target.value }))}
                placeholder="0"
                className="w-24 bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-right text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
              />
              <span className="text-xs text-text-muted">guests</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary">Vendor filter</label>
            <select
              value={vendorFilter ?? ''}
              onChange={(e) => setVendorFilter(e.target.value ? Number(e.target.value) : undefined)}
              className="bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
            >
              <option value="">All vendors</option>
              {(vendors ?? []).map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleCalculate}
            disabled={calculateOrder.isPending}
            className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
          >
            {calculateOrder.isPending ? 'Calculating...' : 'Calculate'}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (() => {
        const effectiveIngredients = result.ingredients.map(getEffectiveIngredient);
        const effectiveTotal = effectiveIngredients.reduce((sum, i) => {
          const qty = getOrderQty(i);
          if (qty > 0 && i.order_unit_price) {
            return sum + Math.round(Math.ceil(qty) * i.order_unit_price * 100) / 100;
          }
          return sum;
        }, 0);

        return (
        <div className="bg-bg-card rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">
              Ingredient Requirements
            </h3>
            <span className="text-sm text-text-secondary font-mono">
              Est. Total: ${(Math.round(effectiveTotal * 100) / 100).toFixed(2)}
            </span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-table-header text-text-secondary text-left">
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide">Item</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Needed</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">In Stock</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Order</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">End. Inv.</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {effectiveIngredients.map((ing) => {
                const isStockOverridden = stockOverrides[ing.item_id] !== undefined;
                const isOrderOverridden = orderOverrides[ing.item_id] !== undefined;
                const orderQty = getOrderQty(ing);
                const rawShortage = ing.shortage_order ?? ing.shortage;
                const defaultOrderQty = rawShortage > 0 ? ceilHalf(rawShortage) : 0;
                const orderUnit = ing.order_unit ?? ing.recipe_unit;

                // Round needed up to nearest 0.5
                const neededOrder = ing.total_needed_order != null ? ceilHalf(ing.total_needed_order) : null;
                const neededRecipe = ceilHalf(ing.total_needed);

                // Compute ending inventory in order units: (stock + order) - needed
                const hasOrderUnit = neededOrder != null && ing.order_unit;
                let endingInventory: number;
                let endUnit: string;
                if (hasOrderUnit) {
                  const stockInRecipeUnit = ing.converted_stock ?? ing.current_qty;
                  const ratio = ing.total_needed > 0 && ing.total_needed_order! > 0 ? ing.total_needed / ing.total_needed_order! : 1;
                  const stockInOrderUnits = ratio > 0 ? stockInRecipeUnit / ratio : ing.current_qty;
                  endingInventory = Math.round((stockInOrderUnits + orderQty - neededOrder!) * 100) / 100;
                  endUnit = ing.order_unit!;
                } else {
                  const stockInRecipeUnit = ing.converted_stock ?? ing.current_qty;
                  endingInventory = Math.round((stockInRecipeUnit + orderQty - neededRecipe) * 100) / 100;
                  endUnit = ing.recipe_unit;
                }

                return (
                <>
                  <tr
                    key={ing.item_id}
                    className="border-b border-border hover:bg-bg-hover"
                  >
                    <td className="px-4 py-2 text-text-primary cursor-pointer" onClick={() => setExpandedItem(expandedItem === ing.item_id ? null : ing.item_id)}>
                      <span className="font-medium">{ing.item_name}</span>
                      {ing.vendor_name && (
                        <span className="text-text-secondary text-xs ml-2">({ing.vendor_name})</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-text-secondary">
                      {neededOrder != null && ing.order_unit
                        ? <>{neededOrder} {ing.order_unit}<span className="text-text-muted text-[10px] block">{neededRecipe} {ing.recipe_unit}</span></>
                        : <>{neededRecipe} {ing.recipe_unit}</>
                      }
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={stockOverrides[ing.item_id] ?? ing.current_qty}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === String(result.ingredients.find((i) => i.item_id === ing.item_id)?.current_qty ?? '')) {
                              setStockOverrides((prev) => {
                                const next = { ...prev };
                                delete next[ing.item_id];
                                return next;
                              });
                            } else {
                              setStockOverrides((prev) => ({ ...prev, [ing.item_id]: val }));
                            }
                          }}
                          className={`w-16 text-right font-mono text-xs px-1.5 py-1 rounded border focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 ${
                            isStockOverridden
                              ? 'border-accent-amber bg-accent-amber/10 text-text-primary'
                              : 'border-border bg-white text-text-secondary'
                          }`}
                        />
                        <span className="text-xs text-text-muted">{ing.item_unit}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={orderOverrides[ing.item_id] ?? (defaultOrderQty > 0 ? defaultOrderQty : 0)}
                          onChange={(e) => {
                            const val = e.target.value;
                            const def = defaultOrderQty > 0 ? defaultOrderQty : 0;
                            if (val === String(def)) {
                              setOrderOverrides((prev) => {
                                const next = { ...prev };
                                delete next[ing.item_id];
                                return next;
                              });
                            } else {
                              setOrderOverrides((prev) => ({ ...prev, [ing.item_id]: val }));
                            }
                          }}
                          className={`w-16 text-right font-mono text-xs px-1.5 py-1 rounded border focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 ${
                            isOrderOverridden
                              ? 'border-accent-amber bg-accent-amber/10 text-text-primary'
                              : 'border-border bg-white text-text-secondary'
                          }`}
                        />
                        <span className="text-xs text-text-muted">{orderUnit}</span>
                      </div>
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${
                      endingInventory < 0 ? 'text-accent-red font-semibold' : 'text-accent-green'
                    }`}>
                      {endingInventory} {endUnit}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-text-secondary">
                      {orderQty > 0 && ing.order_unit_price
                        ? `$${(Math.round(Math.ceil(orderQty) * ing.order_unit_price * 100) / 100).toFixed(2)}`
                        : '\u2014'}
                    </td>
                  </tr>
                  {expandedItem === ing.item_id && (
                    <tr key={`${ing.item_id}-sources`} className="bg-bg-hover">
                      <td colSpan={6} className="px-8 py-2">
                        <div className="text-xs text-text-secondary space-y-1">
                          {ing.sources.map((s, i) => (
                            <div key={i} className="flex justify-between">
                              <span>{s.recipe_name}</span>
                              <span className="font-mono">
                                {s.quantity_per_guest}/guest x {s.guest_count} = {s.subtotal.toFixed(2)} {ing.recipe_unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
                );
              })}
              {/* Manually added items */}
              {manualItems.map((mi) => {
                const miQty = Number(mi.quantity) || 0;
                const miCost = miQty > 0 && mi.order_unit_price ? Math.round(Math.ceil(miQty) * mi.order_unit_price * 100) / 100 : null;
                return (
                  <tr key={`manual-${mi.item_id}`} className="border-b border-border hover:bg-bg-hover bg-accent-indigo/5">
                    <td className="px-4 py-2 text-text-primary">
                      <span className="font-medium">{mi.item_name}</span>
                      {mi.vendor_name && <span className="text-text-muted text-[10px] ml-1">({mi.vendor_name})</span>}
                      <span className="text-accent-indigo text-[10px] ml-1">(manual)</span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-text-muted">—</td>
                    <td className="px-4 py-2 text-right font-mono text-text-muted">—</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={mi.quantity}
                          onChange={(e) => setManualItems((prev) => prev.map((item) =>
                            item.item_id === mi.item_id ? { ...item, quantity: e.target.value } : item
                          ))}
                          className="w-16 text-right font-mono text-xs px-1.5 py-1 rounded border border-accent-indigo/30 bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
                        />
                        <span className="text-xs text-text-muted">{mi.order_unit ?? mi.item_unit}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-text-muted">—</td>
                    <td className="px-4 py-2 text-right flex items-center justify-end gap-2">
                      {miCost != null ? <span className="text-text-secondary font-mono text-xs">${miCost.toFixed(2)}</span> : <span className="text-text-muted">—</span>}
                      <button
                        onClick={() => setManualItems((prev) => prev.filter((item) => item.item_id !== mi.item_id))}
                        className="text-accent-red text-xs hover:underline"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Add Item row */}
            <tfoot>
              <tr className="border-t border-border">
                <td colSpan={6} className="px-4 py-2">
                  {!showAddItem ? (
                    <button
                      onClick={() => setShowAddItem(true)}
                      className="text-accent-indigo text-xs hover:underline"
                    >
                      + Add Item
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <ItemSearchInput
                        items={(allItems ?? []).filter((i) => !effectiveIngredients.some((e) => e.item_id === i.id) && !manualItems.some((m) => m.item_id === i.id))}
                        selectedId={0}
                        onSelect={(id) => {
                          const item = (allItems ?? []).find((i) => i.id === id);
                          if (!item) return;
                          const vendorName = item.vendor_id ? vendors?.find((v) => v.id === item.vendor_id)?.name ?? null : null;
                          setManualItems((prev) => [...prev, {
                            item_id: item.id, item_name: item.name, quantity: '1',
                            vendor_id: item.vendor_id, vendor_name: vendorName,
                            order_unit: item.order_unit, order_unit_price: item.order_unit_price, item_unit: item.unit,
                          }]);
                          setShowAddItem(false);
                        }}
                      />
                      <button onClick={() => setShowAddItem(false)} className="text-text-secondary text-xs hover:text-text-primary">
                        Cancel
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <div>
              {hasStockOverrides && (
                <button
                  onClick={handleSaveCountsAndRecalculate}
                  disabled={savingCounts}
                  className="bg-accent-amber text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-amber/80 disabled:opacity-40 transition-colors"
                >
                  {savingCounts ? 'Saving...' : 'Save Counts & Recalculate'}
                </button>
              )}
            </div>
            <button
              onClick={handleCreateDraftOrder}
              disabled={createOrder.isPending || !(effectiveIngredients.some((i) => getOrderQty(i) > 0 && i.vendor_id) || manualItems.some((m) => Number(m.quantity) > 0 && m.vendor_id))}
              className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
            >
              Create Draft Order
            </button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

// ── Weekly Order Tab ──────────────────────────────────────────

interface WeeklyIngredientRow {
  item_id: number;
  item_name: string;
  vendor_id: number | null;
  vendor_name: string | null;
  order_unit: string | null;
  recipe_unit: string;
  order_unit_price: number | null;
  item_unit: string;
  dailyNeeded: Record<string, number>;
  totalNeeded: number;
  currentStock: number;
  shortage: number;
}

const ceilHalfW = (n: number) => Math.ceil(n * 2) / 2;

function WeeklyOrder() {
  const calculateOrder = useCalculateOrder();
  const createOrder = useCreateOrder();
  const { toast } = useToast();

  const { data: forecasts } = useForecasts();
  const { data: existingMappings } = useForecastMappings();
  const latestForecastId = forecasts && forecasts.length > 0 ? forecasts[0].id : 0;
  const { data: savedForecast } = useForecast(latestForecastId);

  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [weeklyResults, setWeeklyResults] = useState<Map<string, OrderCalculationResult>>(new Map());
  const [isCalculating, setIsCalculating] = useState(false);
  const [orderOverrides, setOrderOverrides] = useState<Record<number, string>>({});

  // Recompute forecastByDate (same logic as CalculateOrder)
  const forecastByDate = (() => {
    if (!savedForecast?.entries || !existingMappings) return null;
    const mappingMap = new Map(existingMappings.map((m) => [m.product_name, m.venue_id]));
    const byDate: Record<string, Record<number, number>> = {};
    for (const entry of savedForecast.entries) {
      const venueId = mappingMap.get(entry.product_name);
      if (!venueId) continue;
      if (!byDate[entry.forecast_date]) byDate[entry.forecast_date] = {};
      byDate[entry.forecast_date][venueId] = (byDate[entry.forecast_date][venueId] || 0) + entry.guest_count;
    }
    return byDate;
  })();

  const today = new Date().toISOString().slice(0, 10);
  const forecastDates = (savedForecast?.raw_dates ?? []).filter((d) => d >= today);

  const toggleDate = (date: string) => {
    if (selectedDates.includes(date)) {
      setSelectedDates((prev) => prev.filter((d) => d !== date));
    } else if (selectedDates.length < 7) {
      setSelectedDates((prev) => [...prev, date].sort());
    }
  };

  const handleCalculateWeek = async () => {
    if (selectedDates.length === 0) {
      toast('Select at least one date', 'error');
      return;
    }
    setIsCalculating(true);
    setOrderOverrides({});
    const results = new Map<string, OrderCalculationResult>();

    const promises = selectedDates.map(async (date) => {
      const countsForDate = forecastByDate?.[date] ?? {};
      const guest_counts = Object.entries(countsForDate)
        .filter(([, count]) => count > 0)
        .map(([venue_id, guest_count]) => ({
          venue_id: Number(venue_id),
          guest_count: Number(guest_count),
        }));
      if (guest_counts.length > 0) {
        try {
          const data = await calculateOrder.mutateAsync({ guest_counts });
          results.set(date, data);
        } catch (err: unknown) {
          toast(`Failed for ${date}: ${(err as Error).message}`, 'error');
        }
      }
    });

    await Promise.all(promises);
    setWeeklyResults(results);
    setIsCalculating(false);
  };

  // Aggregate results across all dates
  const aggregated = (() => {
    if (weeklyResults.size === 0) return [];
    const map = new Map<number, WeeklyIngredientRow>();
    for (const [date, result] of weeklyResults) {
      for (const ing of result.ingredients) {
        const needed = ing.total_needed_order ?? ing.total_needed;
        const existing = map.get(ing.item_id);
        if (existing) {
          existing.dailyNeeded[date] = (existing.dailyNeeded[date] || 0) + needed;
          existing.totalNeeded += needed;
        } else {
          map.set(ing.item_id, {
            item_id: ing.item_id,
            item_name: ing.item_name,
            vendor_id: ing.vendor_id,
            vendor_name: ing.vendor_name,
            order_unit: ing.order_unit,
            recipe_unit: ing.recipe_unit,
            order_unit_price: ing.order_unit_price,
            item_unit: ing.item_unit,
            dailyNeeded: { [date]: needed },
            totalNeeded: needed,
            currentStock: ing.current_qty,
            shortage: 0,
          });
        }
      }
    }
    // Convert stock to order units
    for (const row of map.values()) {
      let convStock = row.currentStock;
      for (const result of weeklyResults.values()) {
        const ing = result.ingredients.find((i) => i.item_id === row.item_id);
        if (ing && ing.total_needed > 0 && ing.total_needed_order != null && ing.total_needed_order > 0) {
          const ratio = ing.total_needed / ing.total_needed_order;
          const stockInRecipeUnit = ing.converted_stock ?? ing.current_qty;
          convStock = ratio > 0 ? stockInRecipeUnit / ratio : ing.current_qty;
          break;
        }
      }
      row.shortage = Math.max(0, row.totalNeeded - convStock);
      row.currentStock = Math.round(convStock * 100) / 100;
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.vendor_name && b.vendor_name) return a.vendor_name.localeCompare(b.vendor_name) || a.item_name.localeCompare(b.item_name);
      if (a.vendor_name) return -1;
      if (b.vendor_name) return 1;
      return a.item_name.localeCompare(b.item_name);
    });
  })();

  const getWeeklyOrderQty = (row: WeeklyIngredientRow) => {
    const override = orderOverrides[row.item_id];
    if (override !== undefined) return Number(override) || 0;
    return row.shortage > 0 ? ceilHalfW(row.shortage) : 0;
  };

  const handleCreateWeeklyOrders = () => {
    const byVendor = new Map<number, { item_id: number; quantity: number; unit: string; unit_price: number }[]>();
    for (const row of aggregated) {
      const orderQty = getWeeklyOrderQty(row);
      if (orderQty <= 0 || !row.vendor_id) continue;
      const arr = byVendor.get(row.vendor_id) ?? [];
      arr.push({
        item_id: row.item_id,
        quantity: orderQty,
        unit: row.order_unit ?? row.recipe_unit,
        unit_price: row.order_unit_price ?? 0,
      });
      byVendor.set(row.vendor_id, arr);
    }

    if (byVendor.size === 0) {
      toast('Nothing to order', 'error');
      return;
    }

    let created = 0;
    const dateRange = `${selectedDates[0]} to ${selectedDates[selectedDates.length - 1]}`;
    for (const [vid, items] of byVendor) {
      createOrder.mutate(
        { vendor_id: vid, notes: `Weekly order for ${dateRange}`, items },
        {
          onSuccess: () => {
            created++;
            if (created === byVendor.size) {
              toast(`${created} weekly draft order(s) created`, 'success');
            }
          },
          onError: (err) => toast(`Failed: ${err.message}`, 'error'),
        },
      );
    }
  };

  // Group aggregated rows by vendor for display
  const vendorGroups = (() => {
    const groups = new Map<string, WeeklyIngredientRow[]>();
    for (const row of aggregated) {
      const key = row.vendor_name ?? 'No Vendor';
      const arr = groups.get(key) ?? [];
      arr.push(row);
      groups.set(key, arr);
    }
    return groups;
  })();

  return (
    <div className="space-y-4">
      {/* Date selection */}
      <div className="bg-bg-card rounded-xl shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">Select Dates (up to 7)</h3>
        {forecastDates.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {forecastDates.map((date) => {
              const d = new Date(date + 'T12:00:00');
              const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              const isSelected = selectedDates.includes(date);
              const counts = forecastByDate?.[date] ?? {};
              const total = Object.values(counts).reduce((s, c) => s + c, 0);
              return (
                <button
                  key={date}
                  onClick={() => toggleDate(date)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-accent-indigo text-white'
                      : 'bg-bg-hover text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {label} {total > 0 && <span className="opacity-70">({total})</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-text-muted">No forecast uploaded. Upload one in Calculate Order first.</p>
        )}
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">{selectedDates.length}/7 dates selected</span>
          <button
            onClick={handleCalculateWeek}
            disabled={isCalculating || selectedDates.length === 0}
            className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
          >
            {isCalculating ? 'Calculating...' : 'Calculate Weekly Order'}
          </button>
          {selectedDates.length > 0 && (
            <button
              onClick={() => { setSelectedDates([]); setWeeklyResults(new Map()); setOrderOverrides({}); }}
              className="text-text-secondary text-xs hover:text-text-primary"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {aggregated.length > 0 && (
        <div className="bg-bg-card rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">
              Weekly Ingredient Requirements
            </h3>
            <span className="text-xs text-text-secondary font-mono">
              {selectedDates.length} day(s), {aggregated.length} items
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-bg-hover text-text-secondary">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Item</th>
                  {selectedDates.map((date) => {
                    const d = new Date(date + 'T12:00:00');
                    return (
                      <th key={date} className="text-right px-2 py-2 font-medium whitespace-nowrap">
                        {d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })}
                      </th>
                    );
                  })}
                  <th className="text-right px-3 py-2 font-medium">Total</th>
                  <th className="text-right px-3 py-2 font-medium">In Stock</th>
                  <th className="text-right px-3 py-2 font-medium">Order</th>
                  <th className="text-right px-3 py-2 font-medium">Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(vendorGroups.entries()).map(([vendorName, rows]) => (
                  <Fragment key={`vg-${vendorName}`}>
                    <tr className="bg-bg-hover/50">
                      <td colSpan={selectedDates.length + 5} className="px-4 py-1.5 text-text-secondary font-semibold text-xs">
                        {vendorName}
                      </td>
                    </tr>
                    {rows.map((row) => {
                      const orderQty = getWeeklyOrderQty(row);
                      const isOverridden = orderOverrides[row.item_id] !== undefined;
                      const unit = row.order_unit ?? row.recipe_unit;
                      const cost = orderQty > 0 && row.order_unit_price
                        ? Math.round(Math.ceil(orderQty) * row.order_unit_price * 100) / 100
                        : null;
                      return (
                        <tr key={row.item_id} className="border-b border-border hover:bg-bg-hover">
                          <td className="px-4 py-2 text-text-primary font-medium whitespace-nowrap">{row.item_name}</td>
                          {selectedDates.map((date) => (
                            <td key={date} className="text-right px-2 py-2 font-mono text-text-secondary">
                              {row.dailyNeeded[date] != null ? ceilHalfW(row.dailyNeeded[date]).toFixed(1) : '—'}
                            </td>
                          ))}
                          <td className="text-right px-3 py-2 font-mono text-text-primary font-semibold">
                            {ceilHalfW(row.totalNeeded).toFixed(1)} <span className="text-text-muted">{unit}</span>
                          </td>
                          <td className="text-right px-3 py-2 font-mono text-text-secondary">
                            {row.currentStock.toFixed(1)} <span className="text-text-muted">{unit}</span>
                          </td>
                          <td className="text-right px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={orderOverrides[row.item_id] ?? (orderQty > 0 ? orderQty : 0)}
                              onChange={(e) => {
                                const val = e.target.value;
                                const def = row.shortage > 0 ? ceilHalfW(row.shortage) : 0;
                                if (val === String(def)) {
                                  setOrderOverrides((prev) => { const next = { ...prev }; delete next[row.item_id]; return next; });
                                } else {
                                  setOrderOverrides((prev) => ({ ...prev, [row.item_id]: val }));
                                }
                              }}
                              className={`w-16 text-right font-mono text-xs px-1.5 py-1 rounded border focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 ${
                                isOverridden
                                  ? 'border-accent-amber bg-accent-amber/10 text-text-primary'
                                  : 'border-border bg-white text-text-secondary'
                              }`}
                            />
                          </td>
                          <td className="text-right px-3 py-2 font-mono text-text-secondary">
                            {cost != null ? `$${cost.toFixed(2)}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border flex justify-end">
            <button
              onClick={handleCreateWeeklyOrders}
              disabled={createOrder.isPending || !aggregated.some((r) => getWeeklyOrderQty(r) > 0 && r.vendor_id)}
              className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
            >
              Create Draft Orders
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
