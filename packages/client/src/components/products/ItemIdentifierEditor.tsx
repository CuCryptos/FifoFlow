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

type AuditFilter = 'recent' | 'with_skips' | 'all';

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
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('recent');

  useEffect(() => {
    setDraft(buildDraft(enrichmentQuery.data?.item ?? item));
  }, [enrichmentQuery.data?.item, item]);

  const currentItem = enrichmentQuery.data?.item ?? item;
  const matches = enrichmentQuery.data?.matches ?? [];
  const importAudits = enrichmentQuery.data?.import_audits ?? [];
  const identifierCount = useMemo(
    () => [currentItem.gtin, currentItem.upc, currentItem.sysco_supc, currentItem.manufacturer_item_code].filter(Boolean).length,
    [currentItem],
  );
  const isDirty = Object.entries(draft).some(([key, value]) => value !== ((currentItem as any)[key] ?? ''));
  const topMatch = matches[0] ?? null;
  const visibleImportAudits = useMemo(() => {
    if (auditFilter === 'with_skips') {
      return importAudits.filter((audit) => audit.summary.skipped_rows > 0);
    }
    if (auditFilter === 'recent') {
      return importAudits.slice(0, 3);
    }
    return importAudits;
  }, [auditFilter, importAudits]);

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

      {importAudits.length ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">Imported claim history</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                Review when external product claims were imported, what was applied, and what was skipped.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="blue">{importAudits.length} import{importAudits.length === 1 ? '' : 's'}</StatusBadge>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  active={auditFilter === 'recent'}
                  onClick={() => setAuditFilter('recent')}
                >
                  Recent
                </FilterChip>
                <FilterChip
                  active={auditFilter === 'with_skips'}
                  onClick={() => setAuditFilter('with_skips')}
                >
                  With skips
                </FilterChip>
                <FilterChip
                  active={auditFilter === 'all'}
                  onClick={() => setAuditFilter('all')}
                >
                  All history
                </FilterChip>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {visibleImportAudits.map((audit) => (
              <div key={audit.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">
                      {audit.match?.external_product.product_name ?? 'Imported external product claims'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatAuditTimestamp(audit.created_at)}
                      {audit.created_by ? ` • ${audit.created_by}` : ''}
                      {audit.match?.external_product.catalog_name ? ` • ${audit.match.external_product.catalog_name}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone="green">{audit.summary.imported_rows} applied</StatusBadge>
                    <StatusBadge tone="blue">{audit.summary.evidence_rows} evidence</StatusBadge>
                    {audit.summary.skipped_rows > 0 ? <StatusBadge tone="amber">{audit.summary.skipped_rows} skipped</StatusBadge> : null}
                  </div>
                </div>
                <div className="mt-3 text-xs leading-5 text-slate-600">
                  Mode: {audit.import_mode.replace('_', ' ')}
                  {audit.summary.imported_allergen_ids.length > 0 ? ` • Imported: ${audit.summary.imported_allergen_ids.join(', ')}` : ''}
                  {audit.summary.skipped_allergen_ids.length > 0 ? ` • Skipped: ${audit.summary.skipped_allergen_ids.join(', ')}` : ''}
                </div>
              </div>
            ))}
          </div>
          {visibleImportAudits.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
              No imports match the current filter.
            </div>
          ) : null}
          {auditFilter === 'recent' && importAudits.length > visibleImportAudits.length ? (
            <div className="mt-3 text-xs text-slate-500">
              Showing the 3 most recent imports. Switch to <span className="font-semibold text-slate-700">All history</span> to expand older records.
            </div>
          ) : null}
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

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? 'rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-xs font-semibold text-white'
        : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100'}
    >
      {children}
    </button>
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

function formatAuditTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
