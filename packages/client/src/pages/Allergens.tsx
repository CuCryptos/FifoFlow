import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useVenueContext } from '../contexts/VenueContext';
import { WorkflowEmptyState, WorkflowMetricCard, WorkflowMetricGrid, WorkflowPage, WorkflowPanel, WorkflowStatusPill } from '../components/workflow/WorkflowPrimitives';
import { AllergenReviewQueue } from '../components/allergens/AllergenReviewQueue';
import { GuestSafetyQueryPanel } from '../components/allergens/GuestSafetyQueryPanel';
import { ProductEnrichmentQueue } from '../components/products/ProductEnrichmentQueue';
import { useAllergenItems, useAllergenReference, useAllergenReviewQueue } from '../hooks/useAllergens';

type ItemStatusFilter = '' | 'contains' | 'may_contain' | 'free_of' | 'unknown';
type ConfidenceFilter = '' | 'verified' | 'high' | 'moderate' | 'low' | 'unverified' | 'unknown';

export function Allergens() {
  const { selectedVenueId } = useVenueContext();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ItemStatusFilter>('');
  const [confidence, setConfidence] = useState<ConfidenceFilter>('');
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);

  const referenceQuery = useAllergenReference();
  const reviewQueueQuery = useAllergenReviewQueue();
  const itemsQuery = useAllergenItems({
    search: search.trim() || undefined,
    status: status || undefined,
    confidence: confidence || undefined,
    needs_review: needsReviewOnly ? true : undefined,
    venue_id: selectedVenueId ?? undefined,
  });

  const allergens = referenceQuery.data?.allergens ?? [];
  const items = itemsQuery.data?.items ?? [];
  const queue = reviewQueueQuery.data;

  const queueSummary = useMemo(() => ({
    items: queue?.items.length ?? 0,
    documentProducts: queue?.document_products.length ?? 0,
    recipes: queue?.recipes.length ?? 0,
  }), [queue]);

  return (
    <WorkflowPage
      eyebrow="Allergen workspace"
      title="Allergen review console"
      description="Review structured item profiles, resolve chart-product matches, and run operator queries from one place."
      actions={<WorkflowStatusPill tone="blue">Editable slice</WorkflowStatusPill>}
    >
      <WorkflowMetricGrid>
        <WorkflowMetricCard
          label="Reference allergens"
          value={referenceQuery.data?.allergens.length ?? '—'}
          detail="Master allergen list exposed by the backend."
        />
        <WorkflowMetricCard
          label="Items in scope"
          value={items.length}
          detail={selectedVenueId ? `Filtered to venue #${selectedVenueId}.` : 'All venues currently in scope.'}
        />
        <WorkflowMetricCard
          label="Review queue"
          value={queueSummary.items + queueSummary.documentProducts + queueSummary.recipes}
          detail="Items, document products, and recipes requiring attention."
          tone="amber"
        />
        <WorkflowMetricCard
          label="Needs review"
          value={items.filter((item) => item.needs_review).length}
          detail="Items with unknown or low-confidence allergen rows."
          tone="red"
        />
      </WorkflowMetricGrid>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.15fr_0.95fr]">
        <AllergenReviewQueue queue={queue} />

        <WorkflowPanel
          title="Item list"
          description="Search the current inventory list and open an item to review its allergen profile and evidence."
        >
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Search</label>
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search item name"
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
              <div className="mt-4 space-y-3">
                <ChipRow
                  label="Status"
                  values={['', 'contains', 'may_contain', 'free_of', 'unknown'] as const}
                  active={status}
                  onChange={(value) => setStatus(value)}
                  renderLabel={(value) => (value === '' ? 'All' : value.replaceAll('_', ' '))}
                />
                <ChipRow
                  label="Confidence"
                  values={['', 'verified', 'high', 'moderate', 'low', 'unverified', 'unknown'] as const}
                  active={confidence}
                  onChange={(value) => setConfidence(value)}
                  renderLabel={(value) => (value === '' ? 'All' : value)}
                />
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={needsReviewOnly}
                  onChange={(event) => setNeedsReviewOnly(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-slate-950"
                />
                Needs review only
              </label>
            </div>

            {itemsQuery.isLoading ? (
              <div className="text-sm text-slate-600">Loading allergen items...</div>
            ) : items.length === 0 ? (
              <WorkflowEmptyState
                title="No items found"
                body="The current filters returned no inventory items with allergen data."
              />
            ) : (
              <div className="overflow-hidden rounded-3xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-left">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3">Profile</th>
                      <th className="px-4 py-3">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {items.map((item) => (
                      <tr key={item.id} className="align-top">
                        <td className="px-4 py-4">
                          <div className="text-sm font-semibold text-slate-950">
                            <Link to={`/allergens/items/${item.id}`} className="transition hover:text-slate-600">
                              {item.name}
                            </Link>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.category}
                            {item.vendor_name ? ` • ${item.vendor_name}` : ''}
                            {item.venue_name ? ` • ${item.venue_name}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            <WorkflowStatusPill tone="red">{item.contains_count} contains</WorkflowStatusPill>
                            <WorkflowStatusPill tone="amber">{item.may_contain_count} may</WorkflowStatusPill>
                            <WorkflowStatusPill tone="green">{item.free_of_count} free</WorkflowStatusPill>
                            <WorkflowStatusPill tone="slate">{item.unknown_count} unknown</WorkflowStatusPill>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-2">
                            <WorkflowStatusPill tone={item.needs_review ? 'red' : 'green'}>
                              {item.needs_review ? 'Needs review' : 'Clear'}
                            </WorkflowStatusPill>
                            <div className="text-xs leading-5 text-slate-500">
                              {item.profile_count} profile row{item.profile_count === 1 ? '' : 's'} • {item.low_confidence_count} low confidence
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </WorkflowPanel>

        <GuestSafetyQueryPanel allergens={allergens} venueId={selectedVenueId} />
      </div>

      <ProductEnrichmentQueue venueId={selectedVenueId} allergens={allergens} />
    </WorkflowPage>
  );
}

function ChipRow<T extends string>({
  label,
  values,
  active,
  onChange,
  renderLabel,
}: {
  label: string;
  values: readonly T[];
  active: T;
  onChange: (value: T) => void;
  renderLabel: (value: T) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              active === value
                ? 'border-slate-950 bg-slate-950 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {renderLabel(value)}
          </button>
        ))}
      </div>
    </div>
  );
}
