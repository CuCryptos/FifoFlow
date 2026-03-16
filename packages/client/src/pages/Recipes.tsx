import { useState, useRef, useEffect, Fragment } from 'react';
import { useRecipes, useRecipe, useCreateRecipe, useUpdateRecipe, useDeleteRecipe } from '../hooks/useRecipes';
import { useProductRecipes, useSetProductRecipe, useDeleteProductRecipe, useCalculateOrder } from '../hooks/useProductRecipes';
import { useParseForecast, useSaveForecast, useForecasts, useForecast, useForecastMappings, useSaveForecastMappings, useUpdateForecastEntry } from '../hooks/useForecasts';
import { useItems, useSetItemCount } from '../hooks/useItems';
import { useVenues, useUpdateVenue, useReorderVenues } from '../hooks/useVenues';
import { useVendors } from '../hooks/useVendors';
import { useCreateOrder } from '../hooks/useOrders';
import { useOperationalRecipeWorkflow, useOperationalRecipeWorkflowDetail } from '../hooks/useRecipeWorkflow';
import { useVenueContext } from '../contexts/VenueContext';
import { useToast } from '../contexts/ToastContext';
import { UNITS } from '@fifoflow/shared';
import type { CalculatedIngredient, OrderCalculationResult, RecipeWithCost, ForecastParseResult } from '@fifoflow/shared';
import type { OperationalRecipeIngredientRowPayload, OperationalRecipeWorkflowSummaryPayload } from '../api';

type RecipeTab = 'operational' | 'recipes' | 'menus' | 'calculate' | 'weekly';

export function Recipes() {
  const [activeTab, setActiveTab] = useState<RecipeTab>('operational');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-text-primary">Recipes</h1>

      <div className="flex gap-1 bg-bg-card rounded-lg p-1 w-fit">
        {([
          ['operational', 'Operational Workflow'],
          ['recipes', 'Recipes'],
          ['menus', 'Product Menus'],
          ['calculate', 'Calculate Order'],
          ['weekly', 'Weekly Order'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-accent-indigo text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'operational' && <OperationalRecipes />}
      {activeTab === 'recipes' && <RecipeList />}
      {activeTab === 'menus' && <ProductMenus />}
      {activeTab === 'calculate' && <CalculateOrder />}
      {activeTab === 'weekly' && <WeeklyOrder />}
    </div>
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

function OperationalRecipes() {
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
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <WorkflowMetricCard
          label="Promoted Recipes"
          value={data?.counts.total_promoted_recipes ?? 0}
          note="Active operational recipe versions in scope"
        />
        <WorkflowMetricCard
          label="Costable Now"
          value={data?.counts.costable_now_count ?? 0}
          note="Ready for recipe cost snapshots"
          tone="green"
        />
        <WorkflowMetricCard
          label="Operational Only"
          value={data?.counts.operational_only_count ?? 0}
          note="Promoted but still blocked by mapping or cost lineage"
          tone="amber"
        />
        <WorkflowMetricCard
          label="Blocked For Costing"
          value={data?.counts.blocked_for_costing_count ?? 0}
          note="Canonical ingredient identity is incomplete"
          tone="red"
        />
      </div>

      <div className="bg-bg-card rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Operational Recipe Workflow</h2>
            <p className="text-sm text-text-secondary">
              Promoted recipe versions are evaluated through canonical ingredient, inventory item, vendor item, and live cost lineage before they can be trusted for costing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ['all', 'All'],
              ['COSTABLE_NOW', 'Costable Now'],
              ['OPERATIONAL_ONLY', 'Operational Only'],
              ['BLOCKED_FOR_COSTING', 'Blocked'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={statusFilter === value
                  ? 'rounded-full bg-accent-indigo text-white px-3 py-1.5 text-sm font-medium'
                  : 'rounded-full border border-border text-text-secondary px-3 py-1.5 text-sm hover:text-text-primary transition-colors'}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {!filteredSummaries.length ? (
          <div className="text-sm text-text-secondary">No promoted recipes matched the current filter.</div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-bg-table-header text-left text-text-secondary">
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
                          ? 'cursor-pointer border-b border-border bg-accent-indigo/5'
                          : 'cursor-pointer border-b border-border hover:bg-bg-hover'}
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium text-text-primary">{summary.recipe_name}</div>
                          <div className="text-xs text-text-secondary">
                            v{summary.version_number} • {summary.recipe_type} • {formatYield(summary)}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <WorkflowStatusBadge classification={summary.costability_classification} />
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          <div className="font-mono text-text-primary">{summary.costable_percent.toFixed(0)}%</div>
                          <div className="text-xs text-text-secondary">
                            {summary.resolved_row_count}/{summary.ingredient_row_count} rows
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          <div className="font-mono text-text-primary">{formatRecipeCurrency(summary.latest_snapshot?.total_cost ?? null)}</div>
                          <div className="text-xs text-text-secondary">
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
      </div>
    </div>
  );
}

function WorkflowMetricCard({
  label,
  value,
  note,
  tone = 'default',
}: {
  label: string;
  value: number;
  note: string;
  tone?: 'default' | 'green' | 'amber' | 'red';
}) {
  const toneClass = tone === 'green'
    ? 'border-accent-green/30'
    : tone === 'amber'
      ? 'border-accent-amber/30'
      : tone === 'red'
        ? 'border-accent-red/30'
        : 'border-border';

  return (
    <div className={`bg-bg-card rounded-xl border ${toneClass} shadow-sm p-4`}>
      <div className="text-xs uppercase tracking-wide text-text-secondary">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-text-primary">{value}</div>
      <div className="mt-2 text-sm text-text-secondary">{note}</div>
    </div>
  );
}

function WorkflowStatusBadge({
  classification,
}: {
  classification: OperationalRecipeWorkflowSummaryPayload['costability_classification'];
}) {
  if (classification === 'COSTABLE_NOW') {
    return <span className="rounded-full bg-accent-green/15 px-2 py-1 text-xs font-medium text-accent-green">Costable Now</span>;
  }
  if (classification === 'BLOCKED_FOR_COSTING') {
    return <span className="rounded-full bg-accent-red/10 px-2 py-1 text-xs font-medium text-accent-red">Blocked</span>;
  }
  return <span className="rounded-full bg-accent-amber/15 px-2 py-1 text-xs font-medium text-accent-amber">Operational Only</span>;
}

function OperationalRecipeDetail({ summary }: { summary: OperationalRecipeWorkflowSummaryPayload }) {
  const { selectedVenueId } = useVenueContext();
  const { data: detail, isLoading } = useOperationalRecipeWorkflowDetail(summary.recipe_version_id, selectedVenueId);
  const blockers = summary.blocker_messages.length > 0 ? summary.blocker_messages : ['No active blockers. This recipe is ready to cost in the current scope.'];

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
  onSelect,
}: {
  items: { id: number; name: string; unit: string }[];
  selectedId: number;
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
        placeholder="Search items..."
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

function RecipeList() {
  const { data: recipes, isLoading } = useRecipes();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  if (isLoading) return <div className="text-text-secondary text-sm">Loading...</div>;

  if (editingId) {
    return <RecipeForm recipeId={editingId} onDone={() => setEditingId(null)} />;
  }

  if (showForm) {
    return <RecipeForm onDone={() => setShowForm(false)} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(true)}
          className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover transition-colors"
        >
          Add Recipe
        </button>
      </div>

      {!recipes?.length ? (
        <div className="text-text-secondary text-sm">No recipes yet. Create one to get started.</div>
      ) : (
        <div className="bg-bg-card rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-table-header text-text-secondary text-left">
                <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide">Name</th>
                <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide">Type</th>
                <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Ingredients</th>
                <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Cost/Portion</th>
                <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recipes.map((r) => (
                <RecipeRow key={r.id} recipe={r} onEdit={() => setEditingId(r.id)} onView={() => setEditingId(r.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecipeRow({ recipe, onEdit }: { recipe: RecipeWithCost; onEdit: () => void; onView: () => void }) {
  const deleteRecipe = useDeleteRecipe();
  const { toast } = useToast();

  return (
    <tr className="border-b border-border hover:bg-bg-hover">
      <td className="px-4 py-2 text-text-primary font-medium">{recipe.name}</td>
      <td className="px-4 py-2">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          recipe.type === 'dish'
            ? 'bg-accent-green/20 text-accent-green'
            : 'bg-accent-amber/20 text-accent-amber'
        }`}>
          {recipe.type}
        </span>
      </td>
      <td className="px-4 py-2 text-right font-mono text-text-secondary">{recipe.item_count}</td>
      <td className="px-4 py-2 text-right font-mono text-text-secondary">
        {recipe.total_cost != null ? `$${recipe.total_cost.toFixed(2)}` : '\u2014'}
      </td>
      <td className="px-4 py-2 text-right">
        <button onClick={onEdit} className="text-accent-indigo hover:underline text-xs mr-3">Edit</button>
        <button
          onClick={() => deleteRecipe.mutate(recipe.id, {
            onSuccess: () => toast('Recipe deleted', 'success'),
            onError: (err) => toast(err.message, 'error'),
          })}
          className="text-accent-red hover:underline text-xs"
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
}

function RecipeForm({ recipeId, onDone }: { recipeId?: number; onDone: () => void }) {
  const { data: existing } = useRecipe(recipeId ?? 0);
  const { data: items } = useItems();
  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [type, setType] = useState<'dish' | 'prep'>('dish');
  const [notes, setNotes] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Populate form when editing
  if (existing && !initialized) {
    setName(existing.name);
    setType(existing.type);
    setNotes(existing.notes ?? '');
    setIngredients(existing.items.map((i) => ({
      item_id: i.item_id,
      quantity: String(i.quantity),
      unit: i.unit,
    })));
    setInitialized(true);
  }
  if (!recipeId && !initialized) {
    setInitialized(true);
  }

  const addIngredient = () => {
    setIngredients((prev) => [...prev, { item_id: 0, quantity: '', unit: 'each' }]);
  };

  const removeIngredient = (idx: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateIngredient = (idx: number, field: keyof IngredientRow, value: string | number) => {
    setIngredients((prev) => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const handleSubmit = () => {
    const data = {
      name,
      type,
      notes: notes || null,
      items: ingredients
        .filter((i) => i.item_id > 0 && Number(i.quantity) > 0)
        .map((i) => ({ item_id: i.item_id, quantity: Number(i.quantity), unit: i.unit })),
    };

    if (recipeId) {
      updateRecipe.mutate({ id: recipeId, data }, {
        onSuccess: () => { toast('Recipe updated', 'success'); onDone(); },
        onError: (err) => toast(err.message, 'error'),
      });
    } else {
      createRecipe.mutate(data, {
        onSuccess: () => { toast('Recipe created', 'success'); onDone(); },
        onError: (err) => toast(err.message, 'error'),
      });
    }
  };

  const isPending = createRecipe.isPending || updateRecipe.isPending;

  return (
    <div className="bg-bg-card rounded-xl shadow-sm p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">
          {recipeId ? 'Edit Recipe' : 'New Recipe'}
        </h2>
        <button onClick={onDone} className="text-text-secondary hover:text-text-primary text-sm">Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
            placeholder="e.g. Grilled Mahi"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'dish' | 'prep')}
            className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
          >
            <option value="dish">Dish</option>
            <option value="prep">Prep</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
          rows={2}
        />
      </div>

      {/* Ingredients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-text-secondary">Ingredients</label>
          <button
            onClick={addIngredient}
            className="text-accent-indigo text-xs hover:underline"
          >
            + Add Ingredient
          </button>
        </div>

        {ingredients.length === 0 ? (
          <div className="text-text-secondary text-xs">No ingredients added yet.</div>
        ) : (
          <div className="space-y-2">
            {ingredients.map((ing, idx) => {
              // Find matching existing item for cost display
              const existingItem = existing?.items.find((ei) => ei.item_id === ing.item_id);
              return (
                <div key={idx} className="flex items-center gap-2">
                  <ItemSearchInput
                    items={items ?? []}
                    selectedId={ing.item_id}
                    onSelect={(id, unit) => {
                      updateIngredient(idx, 'item_id', id);
                      updateIngredient(idx, 'unit', unit);
                    }}
                  />
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Qty"
                    value={ing.quantity}
                    onChange={(e) => updateIngredient(idx, 'quantity', e.target.value)}
                    className="w-20 bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-right text-text-primary"
                  />
                  <select
                    value={ing.unit}
                    onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
                    className="w-20 bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  <span className="w-20 text-right text-xs font-mono text-text-secondary">
                    {existingItem?.line_cost != null ? `$${existingItem.line_cost.toFixed(2)}` : ''}
                  </span>
                  <button
                    onClick={() => removeIngredient(idx)}
                    className="text-accent-red text-xs hover:underline"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
            {/* Total cost */}
            {existing && existing.items.some((i) => i.line_cost != null) && (
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-border">
                <span className="text-xs font-medium text-text-secondary">Total Cost/Portion:</span>
                <span className="text-xs font-mono font-semibold text-text-primary">
                  ${existing.items.reduce((sum, i) => sum + (i.line_cost ?? 0), 0).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onDone}
          className="border border-border text-text-secondary px-4 py-2 rounded-lg text-sm hover:bg-bg-hover transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={isPending || !name.trim()}
          className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
        >
          {recipeId ? 'Save Changes' : 'Create Recipe'}
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
