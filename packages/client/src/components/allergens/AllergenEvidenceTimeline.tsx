import { useEffect, useMemo, useState } from 'react';
import { WorkflowEmptyState, WorkflowPanel, WorkflowStatusPill } from '../workflow/WorkflowPrimitives';
import type { AllergenItemEvidenceInput, AllergenItemEvidencePayload, AllergenItemProfilePayload } from '../../api';
import { useAddAllergenEvidence } from '../../hooks/useAllergens';

const SOURCE_TYPES: AllergenItemEvidenceInput['source_type'][] = [
  'manufacturer_spec',
  'vendor_declaration',
  'staff_verified',
  'label_scan',
  'uploaded_chart',
  'inferred',
];

export function AllergenEvidenceTimeline({
  itemId,
  evidence,
  allergenProfile,
}: {
  itemId: number;
  evidence: AllergenItemEvidencePayload[] | undefined;
  allergenProfile: AllergenItemProfilePayload[];
}) {
  const addEvidence = useAddAllergenEvidence();
  const allergenOptions = useMemo(
    () => allergenProfile.map((row) => ({ code: row.allergen_code, name: row.allergen_name })),
    [allergenProfile],
  );
  const [draft, setDraft] = useState<AllergenItemEvidenceInput>({
    allergen_code: allergenOptions[0]?.code ?? 'milk',
    source_type: 'staff_verified',
    status_claimed: 'unknown',
    confidence_claimed: 'moderate',
    source_label: '',
    source_excerpt: '',
    captured_by: '',
  });

  useEffect(() => {
    if (allergenOptions.length > 0 && !allergenOptions.some((allergen) => allergen.code === draft.allergen_code)) {
      setDraft((current) => ({ ...current, allergen_code: allergenOptions[0].code }));
    }
  }, [allergenOptions, draft.allergen_code]);

  const submitEvidence = () => {
    addEvidence.mutate(
      {
        itemId,
        evidence: {
          ...draft,
          source_label: draft.source_label?.trim() || null,
          source_excerpt: draft.source_excerpt?.trim() || null,
          captured_by: draft.captured_by?.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setDraft((current) => ({
            ...current,
            source_label: '',
            source_excerpt: '',
            captured_by: '',
          }));
        },
      },
    );
  };

  return (
    <WorkflowPanel
      title="Evidence timeline"
      description="Add supporting claims and review every stored source that backs the item profile."
    >
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Add evidence</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <select
            value={draft.allergen_code}
            onChange={(event) => setDraft((current) => ({ ...current, allergen_code: event.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          >
            {allergenOptions.map((allergen) => (
              <option key={allergen.code} value={allergen.code}>{allergen.name}</option>
            ))}
          </select>
          <select
            value={draft.source_type}
            onChange={(event) => setDraft((current) => ({ ...current, source_type: event.target.value as AllergenItemEvidenceInput['source_type'] }))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          >
            {SOURCE_TYPES.map((sourceType) => (
              <option key={sourceType} value={sourceType}>{sourceType.replaceAll('_', ' ')}</option>
            ))}
          </select>
          <select
            value={draft.status_claimed}
            onChange={(event) => setDraft((current) => ({ ...current, status_claimed: event.target.value as AllergenItemEvidenceInput['status_claimed'] }))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          >
            <option value="contains">contains</option>
            <option value="may_contain">may contain</option>
            <option value="free_of">free of</option>
            <option value="unknown">unknown</option>
          </select>
          <select
            value={draft.confidence_claimed ?? 'unknown'}
            onChange={(event) => setDraft((current) => ({ ...current, confidence_claimed: event.target.value as NonNullable<AllergenItemEvidenceInput['confidence_claimed']> }))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          >
            <option value="verified">verified</option>
            <option value="high">high</option>
            <option value="moderate">moderate</option>
            <option value="low">low</option>
            <option value="unverified">unverified</option>
            <option value="unknown">unknown</option>
          </select>
          <input
            value={draft.source_label ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, source_label: event.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 md:col-span-2"
            placeholder="Source label"
          />
          <textarea
            value={draft.source_excerpt ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, source_excerpt: event.target.value }))}
            rows={3}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 md:col-span-2"
            placeholder="Quoted source excerpt"
          />
          <input
            value={draft.captured_by ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, captured_by: event.target.value }))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 md:col-span-2"
            placeholder="Captured by"
          />
        </div>
        {addEvidence.isError ? (
          <div className="mt-3 text-sm text-amber-900">
            {addEvidence.error instanceof Error ? addEvidence.error.message : 'Evidence save failed.'}
          </div>
        ) : null}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={submitEvidence}
            disabled={addEvidence.isPending || allergenOptions.length === 0}
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {addEvidence.isPending ? 'Saving...' : 'Add evidence'}
          </button>
        </div>
      </div>

      <div className="mt-4">
        {!evidence ? (
          <div className="text-sm text-slate-600">Loading evidence...</div>
        ) : evidence.length === 0 ? (
          <WorkflowEmptyState
            title="No evidence yet"
            body="This item has profile rows, but no source evidence has been attached."
          />
        ) : (
          <div className="space-y-3">
            {evidence.map((row) => (
              <article key={row.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{row.allergen_name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{row.allergen_code}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <WorkflowStatusPill tone={statusTone(row.status_claimed)}>{row.status_claimed.replaceAll('_', ' ')}</WorkflowStatusPill>
                    <WorkflowStatusPill tone={confidenceTone(row.confidence_claimed)}>{row.confidence_claimed ?? 'unknown'}</WorkflowStatusPill>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-700">
                  <div><span className="font-medium text-slate-900">Source</span> {row.source_type.replaceAll('_', ' ')}</div>
                  <div><span className="font-medium text-slate-900">Captured</span> {formatDate(row.captured_at)}{row.captured_by ? ` by ${row.captured_by}` : ''}</div>
                  {row.source_label ? <div><span className="font-medium text-slate-900">Label</span> {row.source_label}</div> : null}
                  {row.source_excerpt ? <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700">{row.source_excerpt}</div> : null}
                  {(row.source_document_id != null || row.source_product_id != null) ? (
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      {row.source_document_id != null ? `Document #${row.source_document_id}` : ''}
                      {row.source_document_id != null && row.source_product_id != null ? ' • ' : ''}
                      {row.source_product_id != null ? `Product #${row.source_product_id}` : ''}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </WorkflowPanel>
  );
}

function statusTone(status: 'contains' | 'may_contain' | 'free_of' | 'unknown'): 'red' | 'amber' | 'green' | 'slate' {
  if (status === 'contains') return 'red';
  if (status === 'may_contain') return 'amber';
  if (status === 'free_of') return 'green';
  return 'slate';
}

function confidenceTone(confidence: string | null): 'red' | 'amber' | 'green' | 'blue' | 'slate' {
  if (confidence === 'verified' || confidence === 'high') return 'green';
  if (confidence === 'moderate') return 'blue';
  if (confidence === 'low' || confidence === 'unverified') return 'amber';
  return 'slate';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
