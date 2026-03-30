import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Item } from '@fifoflow/shared';
import {
  useMatchProductEnrichmentItem,
  useProductEnrichmentItem,
  useUpdateProductEnrichmentItemIdentifiers,
  useUpdateProductEnrichmentMatchDecision,
} from '../../hooks/useProductEnrichment';
import { useToast } from '../../contexts/ToastContext';

type IdentifierDraft = {
  brand_name: string;
  manufacturer_name: string;
  gtin: string;
  upc: string;
  sysco_supc: string;
  manufacturer_item_code: string;
};

function buildDraft(item: Partial<Item> & Pick<Item, 'id' | 'name'>): IdentifierDraft {
  return {
    brand_name: item.brand_name ?? '',
    manufacturer_name: item.manufacturer_name ?? '',
    gtin: item.gtin ?? '',
    upc: item.upc ?? '',
    sysco_supc: item.sysco_supc ?? '',
    manufacturer_item_code: item.manufacturer_item_code ?? '',
  };
}

export function ItemIdentifierEditor({
  itemId,
  item,
  compact = false,
}: {
  itemId: number;
  item: Partial<Item> & Pick<Item, 'id' | 'name'>;
  compact?: boolean;
}) {
  const enrichmentQuery = useProductEnrichmentItem(itemId);
  const updateIdentifiers = useUpdateProductEnrichmentItemIdentifiers();
  const matchItem = useMatchProductEnrichmentItem();
  const updateMatchDecision = useUpdateProductEnrichmentMatchDecision();
  const { toast } = useToast();
  const [draft, setDraft] = useState<IdentifierDraft>(() => buildDraft(item));

  useEffect(() => {
    setDraft(buildDraft(enrichmentQuery.data?.item ?? item));
  }, [enrichmentQuery.data?.item, item]);

  const currentItem = enrichmentQuery.data?.item ?? item;
  const matches = enrichmentQuery.data?.matches ?? [];
  const identifierCount = useMemo(
    () => [currentItem.gtin, currentItem.upc, currentItem.sysco_supc, currentItem.manufacturer_item_code].filter(Boolean).length,
    [currentItem],
  );
  const isDirty = Object.entries(draft).some(([key, value]) => value !== ((currentItem as any)[key] ?? ''));
  const topMatch = matches[0] ?? null;

  const handleSave = () => {
    updateIdentifiers.mutate(
      {
        itemId,
        data: {
          brand_name: emptyToNull(draft.brand_name),
          manufacturer_name: emptyToNull(draft.manufacturer_name),
          gtin: emptyToNull(draft.gtin),
          upc: emptyToNull(draft.upc),
          sysco_supc: emptyToNull(draft.sysco_supc),
          manufacturer_item_code: emptyToNull(draft.manufacturer_item_code),
        },
      },
      {
        onSuccess: () => toast('Identifiers saved.', 'success'),
        onError: (error) => toast(error instanceof Error ? error.message : 'Unable to save identifiers.', 'error'),
      },
    );
  };

  const handleRunMatch = () => {
    matchItem.mutate(
      { itemId },
      {
        onSuccess: (data) => {
          const matchCount = data.matches.length;
          toast(matchCount > 0 ? `Generated ${matchCount} product suggestion${matchCount === 1 ? '' : 's'}.` : 'No product suggestions found yet.', matchCount > 0 ? 'success' : 'error');
        },
        onError: (error) => toast(error instanceof Error ? error.message : 'Unable to evaluate product matches.', 'error'),
      },
    );
  };

  const gridClassName = compact ? 'grid gap-3 md:grid-cols-2' : 'grid gap-3 lg:grid-cols-2';

  return (
    <section className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Product identity</div>
          <div className="mt-1 text-sm text-slate-600">
            Track brand and distributor identifiers so we can match this item to national product data instead of reviewing allergens one by one.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={identifierCount > 0 ? 'green' : 'slate'}>
            {identifierCount > 0 ? `${identifierCount} identifiers` : 'No identifiers'}
          </StatusBadge>
          <StatusBadge tone={topMatch ? toneForConfidence(topMatch.match_confidence) : 'slate'}>
            {topMatch ? `${topMatch.match_status.replace('_', ' ')} • ${topMatch.match_confidence}` : 'No product match'}
          </StatusBadge>
        </div>
      </div>

      <div className={`mt-4 ${gridClassName}`}>
        <Field
          label="Brand"
          value={draft.brand_name}
          onChange={(value) => setDraft((current) => ({ ...current, brand_name: value }))}
          placeholder="Kikkoman"
        />
        <Field
          label="Manufacturer"
          value={draft.manufacturer_name}
          onChange={(value) => setDraft((current) => ({ ...current, manufacturer_name: value }))}
          placeholder="Kikkoman Foods"
        />
        <Field
          label="GTIN"
          value={draft.gtin}
          onChange={(value) => setDraft((current) => ({ ...current, gtin: value }))}
          placeholder="00041390000123"
        />
        <Field
          label="UPC"
          value={draft.upc}
          onChange={(value) => setDraft((current) => ({ ...current, upc: value }))}
          placeholder="041390000123"
        />
        <Field
          label="Sysco SUPC"
          value={draft.sysco_supc}
          onChange={(value) => setDraft((current) => ({ ...current, sysco_supc: value }))}
          placeholder="1234567"
        />
        <Field
          label="Vendor / Mfr code"
          value={draft.manufacturer_item_code}
          onChange={(value) => setDraft((current) => ({ ...current, manufacturer_item_code: value }))}
          placeholder="ABC-123"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={updateIdentifiers.isPending || !isDirty}
          className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {updateIdentifiers.isPending ? 'Saving...' : isDirty ? 'Save identifiers' : 'Saved'}
        </button>
        <button
          type="button"
          onClick={handleRunMatch}
          disabled={matchItem.isPending}
          className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 disabled:opacity-50"
        >
          {matchItem.isPending ? 'Matching...' : 'Refresh product matches'}
        </button>
      </div>

      {enrichmentQuery.isLoading ? (
        <div className="mt-4 text-sm text-slate-500">Loading product enrichment context...</div>
      ) : null}

      {matches.length > 0 ? (
        <div className="mt-4 space-y-3">
          {matches.slice(0, compact ? 2 : 4).map((match) => (
            <div key={match.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-950">{match.external_product.product_name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {match.external_product.catalog_name} • {match.match_basis} • {match.match_confidence}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={toneForConfidence(match.match_confidence)}>{match.match_status.replace('_', ' ')}</StatusBadge>
                  {match.match_status !== 'confirmed' ? (
                    <button
                      type="button"
                      onClick={() => updateMatchDecision.mutate({ itemId, matchId: match.id, data: { match_status: 'confirmed', matched_by: 'operator' } })}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                    >
                      Confirm
                    </button>
                  ) : null}
                  {match.match_status !== 'rejected' ? (
                    <button
                      type="button"
                      onClick={() => updateMatchDecision.mutate({ itemId, matchId: match.id, data: { match_status: 'rejected', matched_by: 'operator', active: false } })}
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      Reject
                    </button>
                  ) : null}
                </div>
              </div>
              {match.external_product.allergen_statement ? (
                <div className="mt-2 text-sm leading-6 text-slate-600">
                  {match.external_product.allergen_statement}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : enrichmentQuery.data ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
          No product suggestions yet. Save identifiers and run matching to start building the external product crosswalk.
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
      />
    </label>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: 'slate' | 'green' | 'amber' | 'blue';
  children: ReactNode;
}) {
  const className = tone === 'green'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : tone === 'blue'
        ? 'border-sky-200 bg-sky-50 text-sky-700'
        : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

function toneForConfidence(confidence: string): 'slate' | 'green' | 'amber' | 'blue' {
  if (confidence === 'high') return 'green';
  if (confidence === 'medium') return 'blue';
  if (confidence === 'low') return 'amber';
  return 'slate';
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
