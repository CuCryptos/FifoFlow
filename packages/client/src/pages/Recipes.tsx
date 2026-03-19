import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useCreateRecipeDraft,
  useDeleteRecipeDraft,
  usePromoteRecipeDraft,
  useRecipeDraft,
  useRecipeDrafts,
  useUpdateRecipeDraft,
} from '../hooks/useRecipeDrafts';
import { useItems } from '../hooks/useItems';
import { useVendors } from '../hooks/useVendors';
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
import type { Item, Unit } from '@fifoflow/shared';
import type {
  OperationalRecipeIngredientRowPayload,
  OperationalRecipeWorkflowSummaryPayload,
  RecipeDraftPromotionResultPayload,
  RecipeDraftSummaryPayload,
  RecipeTemplateDetailPayload,
  RecipeWorkflowIngredientDiffPayload,
} from '../api';

export function Recipes() {
  const [showDraftComposer, setShowDraftComposer] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);

  return (
    <WorkflowPage
      eyebrow="Recipe Operations"
      title="Promote, validate, and cost operational recipes through the same identity spine the backend trusts."
      description="The recipes surface is now operational-workflow-first. Draft creation starts in the new composer, then promotion, ingredient resolution, and costing stay aligned to the backend workflow."
      actions={(
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            onClick={() => {
              setActiveDraftId(null);
              setShowDraftComposer(true);
            }}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            New Draft Recipe
          </button>
        </div>
      )}
    >
      {showDraftComposer ? (
        <RecipeForm
          draftId={activeDraftId ?? undefined}
          onDone={() => {
            setShowDraftComposer(false);
            setActiveDraftId(null);
          }}
        />
      ) : (
        <OperationalRecipes
          onAddRecipe={() => {
            setActiveDraftId(null);
            setShowDraftComposer(true);
          }}
          onOpenDraft={(draftId) => {
            setActiveDraftId(draftId);
            setShowDraftComposer(true);
          }}
        />
      )}
    </WorkflowPage>
  );
}

export function PromotedRecipeDetailPage() {
  const { recipeVersionId } = useParams();
  const { selectedVenueId } = useVenueContext();
  const { toast } = useToast();
  const parsedRecipeVersionId = Number(recipeVersionId);
  const { data, isLoading, error } = useOperationalRecipeWorkflow(selectedVenueId);

  const summary = (data?.summaries ?? []).find(
    (candidate) => Number(candidate.recipe_version_id) === parsedRecipeVersionId,
  ) ?? null;

  return (
    <WorkflowPage
      eyebrow="Promoted Recipe Detail"
      title="Inspect one promoted operational recipe without relying on the queue context."
      description="This route is dedicated to a promoted recipe version. Operators can review readiness, version history, ingredient resolution, and costability on a stable detail page."
      actions={(
        <Link
          to="/recipes"
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Back to Recipes
        </Link>
      )}
    >
      {isLoading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          Loading promoted recipe detail...
        </div>
      ) : error instanceof Error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
          {error.message}
        </div>
      ) : !Number.isInteger(parsedRecipeVersionId) || parsedRecipeVersionId <= 0 ? (
        <WorkflowEmptyState
          title="Recipe version id is invalid"
          body="The promoted recipe detail route requires a positive recipe version id."
        />
      ) : !summary ? (
        <WorkflowEmptyState
          title="Promoted recipe not visible in this scope"
          body="That promoted recipe version is not available in the current venue scope. Switch venue context or return to the recipes workspace."
        />
      ) : (
        <div className="space-y-4">
          <WorkflowPanel
            title="Operations Handoff IDs"
            description="Use these ids when another operator, reviewer, or standards workflow needs to reference this exact promoted recipe version."
            actions={(
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => copyRecipeOperatorId(String(summary.recipe_id), 'Recipe id', toast)}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Copy recipe id
                </button>
                <button
                  type="button"
                  onClick={() => copyRecipeOperatorId(String(summary.recipe_version_id), 'Recipe version id', toast)}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Copy version id
                </button>
              </div>
            )}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recipe id</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{summary.recipe_id}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recipe version id</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{summary.recipe_version_id}</div>
              </div>
            </div>
          </WorkflowPanel>
          <OperationalRecipeDetail summary={summary} />
        </div>
      )}
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

function formatDraftTimestamp(value: string | undefined): string {
  if (!value) {
    return 'Updated just now';
  }
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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

function DraftStatusBadge({ draft }: { draft: RecipeDraftSummaryPayload }) {
  if (draft.completeness_status === 'READY') {
    return <WorkflowStatusPill tone="green">Ready draft</WorkflowStatusPill>;
  }
  if (draft.completeness_status === 'BLOCKED') {
    return <WorkflowStatusPill tone="red">Blocked draft</WorkflowStatusPill>;
  }
  if (draft.completeness_status === 'INCOMPLETE') {
    return <WorkflowStatusPill tone="amber">Incomplete draft</WorkflowStatusPill>;
  }
  return <WorkflowStatusPill tone="slate">Needs review</WorkflowStatusPill>;
}

type DraftQueueFilter = 'all' | 'READY' | 'NEEDS_REVIEW' | 'BLOCKED' | 'PROMOTED';
type DraftQueueFocusFilter = 'all' | 'TEMPLATE_DRAFTS' | 'TEMPLATE_UNMAPPED';
type DraftQueueSort = 'updated_at' | 'unmapped_count' | 'promotion_readiness';
type ComposerIngredientFilter = 'all' | 'UNRESOLVED_TEMPLATE' | 'MAPPED_TEMPLATE' | 'MANUAL';

const DEFAULT_DRAFT_PAGE_SIZE = 12;
const DRAFT_PAGE_SIZE_STORAGE_KEY = 'fifoflow.recipeDraftQueue.pageSize';

function readDraftQueuePageSize(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_DRAFT_PAGE_SIZE;
  }

  const raw = window.sessionStorage.getItem(DRAFT_PAGE_SIZE_STORAGE_KEY);
  const parsed = Number(raw);
  return [12, 24, 48].includes(parsed) ? parsed : DEFAULT_DRAFT_PAGE_SIZE;
}

function resolveDraftQueueFilter(draft: RecipeDraftSummaryPayload): Exclude<DraftQueueFilter, 'all'> {
  if (draft.promotion_link) {
    return 'PROMOTED';
  }
  if (draft.completeness_status === 'READY') {
    return 'READY';
  }
  if (draft.completeness_status === 'BLOCKED') {
    return 'BLOCKED';
  }
  return 'NEEDS_REVIEW';
}

function resolveDraftPromotionReadinessScore(draft: RecipeDraftSummaryPayload): number {
  if (draft.completeness_status === 'READY' && !draft.promotion_link) {
    return 4;
  }
  if (draft.completeness_status === 'READY' && draft.promotion_link) {
    return 3;
  }
  if (draft.completeness_status === 'NEEDS_REVIEW' || draft.completeness_status === 'INCOMPLETE') {
    return 2;
  }
  if (draft.completeness_status === 'BLOCKED') {
    return 1;
  }
  return 0;
}

function resolveDraftFocusFilter(draft: RecipeDraftSummaryPayload): Exclude<DraftQueueFocusFilter, 'all'> | null {
  if (draft.source_type === 'template' && draft.unresolved_inventory_count > 0) {
    return 'TEMPLATE_UNMAPPED';
  }
  if (draft.source_type === 'template') {
    return 'TEMPLATE_DRAFTS';
  }
  return null;
}

function formatPromotionOutcomeLabel(outcome: {
  promotion_link: { recipe_id: number | string; recipe_version_id: number | string | null } | null;
  costability_status?: string | null;
} | null | undefined): string | null {
  if (!outcome?.promotion_link) {
    return null;
  }

  const base = `Live as recipe #${outcome.promotion_link.recipe_id}`;
  const version = outcome.promotion_link.recipe_version_id != null
    ? ` • version #${outcome.promotion_link.recipe_version_id}`
    : '';
  const costability = outcome.costability_status ? ` • ${outcome.costability_status}` : '';
  return `${base}${version}${costability}`;
}

async function copyRecipeOperatorId(
  value: string,
  label: string,
  toast: (message: string, tone?: 'success' | 'error' | 'info') => void,
) {
  try {
    await navigator.clipboard.writeText(value);
    toast(`${label} copied`, 'success');
  } catch {
    toast(`Could not copy ${label.toLowerCase()}`, 'error');
  }
}

function OperationalRecipes({ onAddRecipe, onOpenDraft }: { onAddRecipe: () => void; onOpenDraft: (draftId: number) => void }) {
  const { selectedVenueId } = useVenueContext();
  const { data, isLoading, error } = useOperationalRecipeWorkflow(selectedVenueId);
  const { data: drafts, isLoading: draftsLoading, error: draftsError } = useRecipeDrafts();
  const promoteDraft = usePromoteRecipeDraft();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [selectedRecipeVersionId, setSelectedRecipeVersionId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'COSTABLE_NOW' | 'OPERATIONAL_ONLY' | 'BLOCKED_FOR_COSTING'>('all');
  const [draftFilter, setDraftFilter] = useState<DraftQueueFilter>('all');
  const [draftFocusFilter, setDraftFocusFilter] = useState<DraftQueueFocusFilter>('all');
  const [draftSort, setDraftSort] = useState<DraftQueueSort>('updated_at');
  const [draftPageSize, setDraftPageSize] = useState(readDraftQueuePageSize);
  const [visibleDraftCount, setVisibleDraftCount] = useState(readDraftQueuePageSize);
  const [queuePromotionDraftId, setQueuePromotionDraftId] = useState<number | null>(null);
  const [queuePromotionOutcomes, setQueuePromotionOutcomes] = useState<Record<number, RecipeDraftPromotionResultPayload>>({});

  const summaries = data?.summaries ?? [];
  const draftRows = drafts ?? [];
  const draftFilterCounts = {
    all: draftRows.length,
    READY: draftRows.filter((draft) => resolveDraftQueueFilter(draft) === 'READY').length,
    NEEDS_REVIEW: draftRows.filter((draft) => resolveDraftQueueFilter(draft) === 'NEEDS_REVIEW').length,
    BLOCKED: draftRows.filter((draft) => resolveDraftQueueFilter(draft) === 'BLOCKED').length,
    PROMOTED: draftRows.filter((draft) => resolveDraftQueueFilter(draft) === 'PROMOTED').length,
  };
  const draftFocusCounts = {
    all: draftRows.length,
    TEMPLATE_DRAFTS: draftRows.filter((draft) => draft.source_type === 'template').length,
    TEMPLATE_UNMAPPED: draftRows.filter((draft) => draft.source_type === 'template' && draft.unresolved_inventory_count > 0).length,
  };
  const filteredDrafts = useMemo(() => {
    const rows = draftRows
      .filter((draft) => draftFilter === 'all' || resolveDraftQueueFilter(draft) === draftFilter)
      .filter((draft) => {
        if (draftFocusFilter === 'all') {
          return true;
        }
        return resolveDraftFocusFilter(draft) === draftFocusFilter;
      });

    return [...rows].sort((left, right) => {
      if (draftSort === 'unmapped_count') {
        return right.unresolved_inventory_count - left.unresolved_inventory_count
          || right.review_row_count - left.review_row_count
          || right.ready_row_count - left.ready_row_count;
      }

      if (draftSort === 'promotion_readiness') {
        return resolveDraftPromotionReadinessScore(right) - resolveDraftPromotionReadinessScore(left)
          || right.unresolved_inventory_count - left.unresolved_inventory_count
          || new Date(right.updated_at ?? 0).getTime() - new Date(left.updated_at ?? 0).getTime();
      }

      return new Date(right.updated_at ?? 0).getTime() - new Date(left.updated_at ?? 0).getTime();
    });
  }, [draftFilter, draftFocusFilter, draftRows, draftSort]);
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

  useEffect(() => {
    setVisibleDraftCount(draftPageSize);
  }, [draftFilter, draftFocusFilter, draftPageSize, draftSort]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.sessionStorage.setItem(DRAFT_PAGE_SIZE_STORAGE_KEY, String(draftPageSize));
  }, [draftPageSize]);

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
        title="Draft Queue"
        description="Persisted recipe drafts now live on the promotion-native builder path. Reopen them here, finish serving math and mapping, then promote when they are trustworthy."
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-3">
            <WorkflowFocusBar>
              {([
                ['all', 'All drafts'],
                ['READY', 'Ready'],
                ['NEEDS_REVIEW', 'Needs review'],
                ['BLOCKED', 'Blocked'],
                ['PROMOTED', 'Promoted'],
              ] as const).map(([value, label]) => (
                <WorkflowChip key={value} active={draftFilter === value} onClick={() => setDraftFilter(value)}>
                  {label} {draftFilterCounts[value]}
                </WorkflowChip>
              ))}
            </WorkflowFocusBar>
            <WorkflowFocusBar>
              {([
                ['all', 'All sources'],
                ['TEMPLATE_DRAFTS', 'Template drafts'],
                ['TEMPLATE_UNMAPPED', 'Template unmapped'],
              ] as const).map(([value, label]) => (
                <WorkflowChip key={value} active={draftFocusFilter === value} onClick={() => setDraftFocusFilter(value)}>
                  {label} {draftFocusCounts[value]}
                </WorkflowChip>
              ))}
            </WorkflowFocusBar>
            <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Sort
              <select
                value={draftSort}
                onChange={(event) => setDraftSort(event.target.value as DraftQueueSort)}
                className="bg-transparent text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-900 outline-none"
              >
                <option value="updated_at">Updated</option>
                <option value="unmapped_count">Unmapped</option>
                <option value="promotion_readiness">Promotion readiness</option>
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Page size
              <select
                value={draftPageSize}
                onChange={(event) => setDraftPageSize(Number(event.target.value))}
                className="bg-transparent text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-900 outline-none"
              >
                <option value={12}>12</option>
                <option value={24}>24</option>
                <option value={48}>48</option>
              </select>
            </label>
            <button
              onClick={onAddRecipe}
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              New Draft Recipe
            </button>
          </div>
        )}
      >
        {draftsLoading ? (
          <div className="text-sm text-slate-500">Loading draft queue...</div>
        ) : draftsError instanceof Error ? (
          <div className="text-sm text-rose-600">{draftsError.message}</div>
        ) : !draftRows.length ? (
          <WorkflowEmptyState
            title="No persisted drafts yet"
            body="Start a draft from a template or from scratch. FIFOFlow will keep it on the builder path until it is ready for operational promotion."
            action={(
              <button
                onClick={onAddRecipe}
                className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Start a draft
              </button>
            )}
          />
        ) : !filteredDrafts.length ? (
          <WorkflowEmptyState
            title="No drafts matched this lane"
            body="The current queue and source filters have no matching drafts. Switch filters or create a new draft."
          />
        ) : (
          <div className="space-y-3">
            {filteredDrafts.slice(0, visibleDraftCount).map((draft) => {
              const promotionOutcome = queuePromotionOutcomes[Number(draft.id)] ?? {
                promotion_link: draft.promotion_link,
                costability_status: null,
              };
              const promotionOutcomeLabel = formatPromotionOutcomeLabel(promotionOutcome);

              return (
                <div
                  key={String(draft.id)}
                  className="grid gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50 lg:grid-cols-[minmax(0,1.15fr)_auto_minmax(210px,auto)]"
                >
                  <button
                    type="button"
                    onClick={() => onOpenDraft(Number(draft.id))}
                    className="min-w-0 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-950">{draft.draft_name}</span>
                      <DraftStatusBadge draft={draft} />
                      {draft.promotion_link ? <WorkflowStatusPill tone="slate">Promoted</WorkflowStatusPill> : null}
                      {draft.source_type === 'template' ? <WorkflowStatusPill tone="slate">Template</WorkflowStatusPill> : null}
                      {draft.source_type === 'template' && draft.unresolved_inventory_count > 0 ? (
                        <WorkflowStatusPill tone="amber">Template mapping cleanup</WorkflowStatusPill>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {draft.source_recipe_type ?? 'prep'} • {draft.source_type === 'template' ? 'Template draft' : 'Manual draft'} • {draft.ingredient_row_count} rows
                    </div>
                    {promotionOutcomeLabel ? (
                      <div className="mt-2 text-[11px] font-medium text-emerald-700">
                        {promotionOutcomeLabel}
                      </div>
                    ) : null}
                  </button>
                  <div className="text-xs text-slate-500 lg:text-right">
                    <div>{draft.ready_row_count}/{draft.ingredient_row_count} rows ready</div>
                    <div>{draft.unresolved_inventory_count} unmapped</div>
                    {draft.source_type === 'template' ? (
                      <div>{draft.unresolved_inventory_count} template rows unmapped</div>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2 lg:items-end">
                    <div className="text-xs text-slate-500 lg:text-right">
                      <div>{formatDraftTimestamp(draft.updated_at)}</div>
                      <div>{draft.promotion_link ? 'Revision-ready' : 'Not yet promoted'}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      {draft.promotion_link?.recipe_version_id != null ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/recipes/promoted/${draft.promotion_link?.recipe_version_id}`)}
                          className="rounded-full border border-emerald-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-50"
                        >
                          Open promoted recipe
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onOpenDraft(Number(draft.id))}
                        className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 transition hover:border-slate-400 hover:text-slate-950"
                      >
                        Open draft
                      </button>
                      <button
                        type="button"
                        disabled={promoteDraft.isPending || queuePromotionDraftId != null || draft.completeness_status !== 'READY'}
                        onClick={() => {
                          setQueuePromotionDraftId(Number(draft.id));
                          promoteDraft.mutate(
                            { id: Number(draft.id) },
                            {
                              onSuccess: (result) => {
                                setQueuePromotionOutcomes((current) => ({
                                  ...current,
                                  [Number(draft.id)]: result.promotion,
                                }));
                                toast(draft.promotion_link ? 'Revision promoted' : 'Recipe promoted', 'success');
                              },
                              onError: (mutationError) => {
                                toast(mutationError.message, 'error');
                              },
                              onSettled: () => {
                                setQueuePromotionDraftId((current) => (current === Number(draft.id) ? null : current));
                              },
                            },
                          );
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                          draft.completeness_status === 'READY'
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-200'
                            : 'bg-slate-200 text-slate-500 disabled:cursor-not-allowed'
                        }`}
                      >
                        {queuePromotionDraftId === Number(draft.id)
                          ? 'Promoting...'
                          : draft.promotion_link
                            ? 'Promote revision'
                            : 'Promote draft'}
                      </button>
                    </div>
                    {draft.completeness_status !== 'READY' ? (
                      <div className="text-[11px] text-amber-700 lg:text-right">
                        Finish this draft inside the composer before promoting it.
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {filteredDrafts.length > visibleDraftCount ? (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleDraftCount((current) => current + draftPageSize)}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Show more drafts
                </button>
              </div>
            ) : null}
          </div>
        )}
      </WorkflowPanel>

      <div>
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

// ── Recipe Form ───────────────────────────────────────────────

interface IngredientRow {
  item_id: number;
  quantity: string;
  unit: string;
  template_ingredient_name: string | null;
  template_quantity: number | null;
  template_unit: string | null;
  template_sort_order: number | null;
  template_canonical_ingredient_id: number | null;
}

function RecipeForm({ draftId: initialDraftId, onDone }: { draftId?: number; onDone: () => void }) {
  const [draftId, setDraftId] = useState<number | null>(initialDraftId ?? null);
  const { data: existing } = useRecipeDraft(draftId ?? 0);
  const { data: items } = useItems();
  const { data: vendors } = useVendors();
  const { data: templates, isLoading: templatesLoading } = useRecipeTemplates();
  const createDraft = useCreateRecipeDraft();
  const updateDraft = useUpdateRecipeDraft();
  const deleteDraft = useDeleteRecipeDraft();
  const promoteDraft = usePromoteRecipeDraft();
  const { toast } = useToast();

  const [creationMode, setCreationMode] = useState<'template' | 'blank' | null>(draftId ? 'blank' : null);
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
  const [composerIngredientFilter, setComposerIngredientFilter] = useState<ComposerIngredientFilter>('all');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([{
    item_id: 0,
    quantity: '',
    unit: 'each',
    template_ingredient_name: null,
    template_quantity: null,
    template_unit: null,
    template_sort_order: null,
    template_canonical_ingredient_id: null,
  }]);
  const [initialized, setInitialized] = useState(false);
  const [appliedTemplateVersionId, setAppliedTemplateVersionId] = useState<number | null>(null);

  const { data: selectedTemplate, isLoading: templateDetailLoading } = useRecipeTemplate(selectedTemplateId);

  useEffect(() => {
    if (initialized) {
      return;
    }

    if (draftId && !existing) {
      return;
    }

    if (existing) {
      setCreationMode(existing.source_type === 'template' ? 'template' : 'blank');
      setSelectedTemplateId(existing.source_template_id);
      setName(existing.draft_name);
      setType(existing.source_recipe_type ?? 'prep');
      setNotes(existing.draft_notes ?? '');
      setYieldQuantity(existing.yield_quantity != null ? String(existing.yield_quantity) : '');
      setYieldUnit(existing.yield_unit ?? 'each');
      setServingQuantity(existing.serving_quantity != null ? String(existing.serving_quantity) : '');
      setServingUnit(existing.serving_unit ?? 'each');
      setServingCountOverride(existing.serving_count != null ? String(existing.serving_count) : '');
      setIngredients(existing.ingredient_rows.length > 0
        ? existing.ingredient_rows.map((ingredient) => ({
            item_id: ingredient.item_id ?? 0,
            quantity: ingredient.quantity != null ? String(ingredient.quantity) : '',
            unit: ingredient.unit ?? 'each',
            template_ingredient_name: ingredient.template_ingredient_name,
            template_quantity: ingredient.template_quantity,
            template_unit: ingredient.template_unit,
            template_sort_order: ingredient.template_sort_order,
            template_canonical_ingredient_id: ingredient.template_ingredient_name ? Number(ingredient.canonical_ingredient_id ?? 0) || null : null,
          }))
        : [{
            item_id: 0,
            quantity: '',
            unit: 'each',
            template_ingredient_name: null,
            template_quantity: null,
            template_unit: null,
            template_sort_order: null,
            template_canonical_ingredient_id: null,
          }]);
      setAppliedTemplateVersionId(existing.source_template_version_id);
    }

    setInitialized(true);
  }, [draftId, existing, initialized]);

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
    template_canonical_ingredient_id: null,
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
  const ingredientFilterCounts = {
    all: ingredients.length,
    UNRESOLVED_TEMPLATE: ingredients.filter((ingredient) => ingredient.template_ingredient_name && ingredient.item_id <= 0).length,
    MAPPED_TEMPLATE: ingredients.filter((ingredient) => ingredient.template_ingredient_name && ingredient.item_id > 0).length,
    MANUAL: ingredients.filter((ingredient) => !ingredient.template_ingredient_name).length,
  };
  const visibleIngredientRows = useMemo(() => (
    ingredients
      .map((ingredient, index) => ({ ingredient, index }))
      .filter(({ ingredient }) => {
        if (composerIngredientFilter === 'UNRESOLVED_TEMPLATE') {
          return Boolean(ingredient.template_ingredient_name) && ingredient.item_id <= 0;
        }
        if (composerIngredientFilter === 'MAPPED_TEMPLATE') {
          return Boolean(ingredient.template_ingredient_name) && ingredient.item_id > 0;
        }
        if (composerIngredientFilter === 'MANUAL') {
          return !ingredient.template_ingredient_name;
        }
        return true;
      })
  ), [composerIngredientFilter, ingredients]);
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
      template_canonical_ingredient_id: ingredient.template_canonical_ingredient_id,
    })));
  };

  const resetDraftForMode = (mode: 'template' | 'blank') => {
    if (draftId) {
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
    const data: Parameters<typeof createDraft.mutate>[0] = {
      draft_name: name,
      draft_notes: notes || null,
      source_recipe_type: type,
      creation_mode: creationMode === 'template' ? 'template' : 'blank',
      source_template_id: creationMode === 'template' ? selectedTemplateId : null,
      source_template_version_id: creationMode === 'template' ? appliedTemplateVersionId : null,
      yield_quantity: yieldQuantity ? Number(yieldQuantity) : null,
      yield_unit: yieldQuantity && yieldUnit ? yieldUnit as Unit : null,
      serving_quantity: servingQuantity ? Number(servingQuantity) : null,
      serving_unit: servingQuantity && servingUnit ? servingUnit as Unit : null,
      serving_count: effectiveServingCount && effectiveServingCount > 0 ? effectiveServingCount : null,
      ingredients: ingredients
        .filter((ingredient) =>
          ingredient.item_id > 0
          || Number(ingredient.quantity) > 0
          || Boolean(ingredient.template_ingredient_name),
        )
        .map((ingredient) => ({
          item_id: ingredient.item_id > 0 ? ingredient.item_id : null,
          quantity: Number(ingredient.quantity) > 0 ? Number(ingredient.quantity) : null,
          unit: ingredient.unit || null,
          template_ingredient_name: ingredient.template_ingredient_name,
          template_quantity: ingredient.template_quantity,
          template_unit: ingredient.template_unit,
          template_sort_order: ingredient.template_sort_order,
          template_canonical_ingredient_id: ingredient.template_canonical_ingredient_id,
        })),
    };

    if (draftId) {
      updateDraft.mutate({ id: draftId, data }, {
        onSuccess: () => { toast('Draft saved', 'success'); },
        onError: (err) => toast(err.message, 'error'),
      });
      return;
    }

    createDraft.mutate(data, {
      onSuccess: (draft) => {
        setDraftId(Number(draft.id));
        toast('Draft saved', 'success');
      },
      onError: (err) => toast(err.message, 'error'),
    });
  };

  const handleDeleteDraft = () => {
    if (!draftId) {
      return;
    }
    deleteDraft.mutate(draftId, {
      onSuccess: () => {
        toast('Draft deleted', 'success');
        onDone();
      },
      onError: (err) => toast(err.message, 'error'),
    });
  };

  const handlePromoteDraft = () => {
    if (!draftId) {
      return;
    }
    promoteDraft.mutate({ id: draftId }, {
      onSuccess: () => {
        toast(existing?.promotion_link ? 'Revision promoted' : 'Recipe promoted', 'success');
        onDone();
      },
      onError: (err) => toast(err.message, 'error'),
    });
  };

  const isPending = createDraft.isPending || updateDraft.isPending || deleteDraft.isPending || promoteDraft.isPending;

  if (draftId && !initialized) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm text-sm text-slate-500">
        Loading saved draft...
      </div>
    );
  }

  if (!draftId && creationMode == null) {
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
              {draftId ? 'Edit Draft Recipe' : 'New Draft Recipe'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {creationMode === 'template'
                ? 'Start from the seeded template, verify the carried ingredient identity, then map each source row to live inventory.'
                : 'Define the batch yield first, then the serving size, then the ingredient quantities for the full batch.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!draftId && (
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
              <div className="flex flex-wrap items-center justify-end gap-3">
                <WorkflowFocusBar>
                  {([
                    ['all', 'All rows'],
                    ['UNRESOLVED_TEMPLATE', 'Template unmapped'],
                    ['MAPPED_TEMPLATE', 'Template mapped'],
                    ['MANUAL', 'Manual rows'],
                  ] as const).map(([value, label]) => (
                    <WorkflowChip
                      key={value}
                      active={composerIngredientFilter === value}
                      onClick={() => setComposerIngredientFilter(value)}
                    >
                      {label} {ingredientFilterCounts[value]}
                    </WorkflowChip>
                  ))}
                </WorkflowFocusBar>
                <button
                  onClick={addIngredient}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Add Ingredient
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {!visibleIngredientRows.length ? (
                <WorkflowEmptyState
                  title="No ingredient rows matched this filter"
                  body="Switch the composer filter or add another ingredient row to continue recipe mapping work."
                />
              ) : visibleIngredientRows.map(({ ingredient, index: idx }) => {
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
                  {existing?.promotion_link ? 'See operational cost snapshots' : 'Preview after promotion'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Estimated cost / serving</dt>
                <dd className="font-semibold text-slate-950">
                  {existing?.promotion_link ? 'See operational cost snapshots' : 'Preview after promotion'}
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

          {createDraft.error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {createDraft.error.message}
            </div>
          )}
          {updateDraft.error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {updateDraft.error.message}
            </div>
          )}
          {promoteDraft.error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {promoteDraft.error.message}
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
          Return to workspace
        </button>
        {draftId ? (
          <button
            onClick={handleDeleteDraft}
            disabled={isPending}
            className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-40"
          >
            Delete Draft
          </button>
        ) : null}
        <button
          onClick={handleSubmit}
          disabled={isPending || !name.trim() || saveBlockingReason != null}
          className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
        >
          {draftId ? 'Save Draft Changes' : 'Create Draft Recipe'}
        </button>
        {draftId ? (
          <button
            onClick={handlePromoteDraft}
            disabled={isPending || !usageReady}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
          >
            {existing?.promotion_link ? 'Promote Revision' : 'Promote to Operations'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
