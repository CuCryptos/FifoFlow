import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import type { Item } from '@fifoflow/shared';
import { useAllergenItem, useUpdateAllergenItemProfile } from '../../hooks/useAllergens';
import { useProductEnrichmentItem } from '../../hooks/useProductEnrichment';
import { useUpdateItem } from '../../hooks/useItems';

type AllergenStatus = 'contains' | 'may_contain' | 'free_of' | 'unknown';
type AllergenConfidence = 'verified' | 'high' | 'moderate' | 'low' | 'unverified' | 'unknown';

type DraftProfileRow = {
  allergen_code: string;
  allergen_name: string;
  status: AllergenStatus;
  confidence: AllergenConfidence;
  notes: string;
  verified_by: string;
};

const PRIORITY_ALLERGEN_CODES = new Set(['wheat', 'milk', 'egg', 'peanut', 'tree_nut', 'soy', 'fish', 'shellfish', 'sesame', 'gluten']);

export function InventoryItemAllergenSection({ item, compact = false }: { item: Item; compact?: boolean }) {
  const itemAllergenQuery = useAllergenItem(item.id);
  const productQuery = useProductEnrichmentItem(item.id);
  const updateProfile = useUpdateAllergenItemProfile();
  const updateItem = useUpdateItem();
  const [draftRows, setDraftRows] = useState<DraftProfileRow[]>([]);
  const [ingredientStatement, setIngredientStatement] = useState(item.ingredient_statement ?? '');
  const [allergenStatement, setAllergenStatement] = useState(item.allergen_statement ?? '');

  useEffect(() => {
    setIngredientStatement(item.ingredient_statement ?? '');
    setAllergenStatement(item.allergen_statement ?? '');
  }, [item.id, item.ingredient_statement, item.allergen_statement]);

  const profile = useMemo(
    () => (itemAllergenQuery.data?.allergen_profile ?? [])
      .filter((row) => PRIORITY_ALLERGEN_CODES.has(row.allergen_code)),
    [itemAllergenQuery.data?.allergen_profile],
  );

  useEffect(() => {
    setDraftRows(profile.map((row) => ({
      allergen_code: row.allergen_code,
      allergen_name: row.allergen_name,
      status: row.status,
      confidence: row.confidence,
      notes: row.notes ?? '',
      verified_by: row.verified_by ?? '',
    })));
  }, [profile]);

  const matchedProduct = useMemo(() => {
    const matches = productQuery.data?.matches ?? [];
    return matches.find((match) => (
      Boolean(match.active)
      && ['confirmed', 'auto_confirmed'].includes(match.match_status)
      && (match.external_product.ingredient_statement || match.external_product.allergen_statement)
    )) ?? null;
  }, [productQuery.data?.matches]);

  const containsCount = profile.filter((row) => row.status === 'contains').length;
  const mayContainCount = profile.filter((row) => row.status === 'may_contain').length;
  const reviewCount = profile.filter((row) => row.status === 'unknown' || ['low', 'unverified', 'unknown'].includes(row.confidence)).length;
  const profileDirty = draftRows.some((row) => {
    const current = profile.find((entry) => entry.allergen_code === row.allergen_code);
    return current && (
      row.status !== current.status
      || row.confidence !== current.confidence
      || row.notes !== (current.notes ?? '')
      || row.verified_by !== (current.verified_by ?? '')
    );
  });
  const statementDirty = ingredientStatement !== (item.ingredient_statement ?? '') || allergenStatement !== (item.allergen_statement ?? '');

  const saveProfile = () => {
    updateProfile.mutate({
      itemId: item.id,
      profiles: draftRows.map((row) => ({
        allergen_code: row.allergen_code,
        status: row.status,
        confidence: row.confidence,
        notes: emptyToNull(row.notes),
        verified_by: emptyToNull(row.verified_by),
        verified_at: null,
        last_reviewed_at: new Date().toISOString(),
      })),
    });
  };

  const saveStatements = () => {
    updateItem.mutate({
      id: item.id,
      data: {
        ingredient_statement: emptyToNull(ingredientStatement),
        allergen_statement: emptyToNull(allergenStatement),
      },
    });
  };

  const copyMatchedStatements = () => {
    setIngredientStatement(matchedProduct?.external_product.ingredient_statement ?? '');
    setAllergenStatement(matchedProduct?.external_product.allergen_statement ?? '');
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Allergens and ingredients</div>
          <div className="mt-1 text-sm text-slate-600">
            Item-level ingredient statements and allergen flags used by recipe rollups and the allergen chart.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={containsCount > 0 ? 'red' : 'slate'}>{containsCount} contains</StatusPill>
          <StatusPill tone={mayContainCount > 0 ? 'amber' : 'slate'}>{mayContainCount} may</StatusPill>
          <StatusPill tone={reviewCount > 0 ? 'amber' : 'green'}>{reviewCount} review</StatusPill>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-950">Ingredient source</div>
            {matchedProduct ? (
              <button
                type="button"
                onClick={copyMatchedStatements}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white"
              >
                Use matched product text
              </button>
            ) : null}
          </div>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Ingredients</span>
            <textarea
              value={ingredientStatement}
              onChange={(event) => setIngredientStatement(event.target.value)}
              rows={compact ? 3 : 5}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition focus:border-slate-400"
              placeholder="Paste ingredient statement from label, spec sheet, or vendor catalog"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Label allergen statement</span>
            <textarea
              value={allergenStatement}
              onChange={(event) => setAllergenStatement(event.target.value)}
              rows={compact ? 2 : 3}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition focus:border-slate-400"
              placeholder="Contains: milk, wheat. May contain: tree nuts."
            />
          </label>
          {matchedProduct ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3 text-xs leading-5 text-sky-900">
              Matched product: {matchedProduct.external_product.product_name}
              {matchedProduct.external_product.ingredient_statement ? ` • ingredients available` : ''}
              {matchedProduct.external_product.allergen_statement ? ` • allergen statement available` : ''}
            </div>
          ) : null}
          <button
            type="button"
            onClick={saveStatements}
            disabled={!statementDirty || updateItem.isPending}
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateItem.isPending ? 'Saving...' : statementDirty ? 'Save ingredient text' : 'Ingredient text saved'}
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-950">Major allergen profile</div>
            <Link to={`/allergens/items/${item.id}`} className="text-xs font-semibold text-slate-600 transition hover:text-slate-950">
              Open full allergen detail
            </Link>
          </div>
          {itemAllergenQuery.isLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">Loading allergen profile...</div>
          ) : draftRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">No allergen rows returned yet.</div>
          ) : (
            <div className="space-y-2">
              {draftRows.map((row) => (
                <div key={row.allergen_code} className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 md:grid-cols-[minmax(0,1fr)_130px_135px]">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{row.allergen_name}</div>
                    <input
                      value={row.notes}
                      onChange={(event) => updateDraftRow(row.allergen_code, { notes: event.target.value }, setDraftRows)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none"
                      placeholder="Note"
                    />
                  </div>
                  <select
                    value={row.status}
                    onChange={(event) => updateDraftRow(row.allergen_code, { status: event.target.value as AllergenStatus }, setDraftRows)}
                    className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none"
                  >
                    <option value="contains">contains</option>
                    <option value="may_contain">may contain</option>
                    <option value="free_of">free of</option>
                    <option value="unknown">unknown</option>
                  </select>
                  <select
                    value={row.confidence}
                    onChange={(event) => updateDraftRow(row.allergen_code, { confidence: event.target.value as AllergenConfidence }, setDraftRows)}
                    className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none"
                  >
                    <option value="verified">verified</option>
                    <option value="high">high</option>
                    <option value="moderate">moderate</option>
                    <option value="low">low</option>
                    <option value="unverified">unverified</option>
                    <option value="unknown">unknown</option>
                  </select>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={saveProfile}
            disabled={!profileDirty || updateProfile.isPending || draftRows.length === 0}
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateProfile.isPending ? 'Saving...' : profileDirty ? 'Save allergen profile' : 'Allergen profile saved'}
          </button>
          {updateProfile.isError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {updateProfile.error instanceof Error ? updateProfile.error.message : 'Unable to save allergen profile.'}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function updateDraftRow(
  allergenCode: string,
  patch: Partial<DraftProfileRow>,
  setDraftRows: Dispatch<SetStateAction<DraftProfileRow[]>>,
) {
  setDraftRows((current) => current.map((row) => (
    row.allergen_code === allergenCode ? { ...row, ...patch } : row
  )));
}

function StatusPill({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'slate'; children: ReactNode }) {
  const className = tone === 'green'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : tone === 'red'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-slate-200 bg-slate-100 text-slate-700';
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
