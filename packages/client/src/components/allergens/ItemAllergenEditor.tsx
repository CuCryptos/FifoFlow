import { useEffect, useMemo, useState } from 'react';
import { WorkflowEmptyState, WorkflowPanel, WorkflowStatusPill } from '../workflow/WorkflowPrimitives';
import type { AllergenItemDetailPayload } from '../../api';
import { useUpdateAllergenItemProfile } from '../../hooks/useAllergens';

type EditableProfileRow = {
  allergen_id: number;
  allergen_code: string;
  allergen_name: string;
  status: 'contains' | 'may_contain' | 'free_of' | 'unknown';
  confidence: 'verified' | 'high' | 'moderate' | 'low' | 'unverified' | 'unknown';
  notes: string;
  verified_by: string;
  verified_at: string;
  last_reviewed_at: string;
};

export function ItemAllergenEditor({ detail }: { detail: AllergenItemDetailPayload | undefined }) {
  const updateProfile = useUpdateAllergenItemProfile();
  const [draftRows, setDraftRows] = useState<EditableProfileRow[]>([]);

  useEffect(() => {
    setDraftRows(
      (detail?.allergen_profile ?? []).map((row) => ({
        allergen_id: row.allergen_id,
        allergen_code: row.allergen_code,
        allergen_name: row.allergen_name,
        status: row.status,
        confidence: row.confidence,
        notes: row.notes ?? '',
        verified_by: row.verified_by ?? '',
        verified_at: row.verified_at ?? '',
        last_reviewed_at: row.last_reviewed_at ?? '',
      })),
    );
  }, [detail]);

  const profileRows = detail?.allergen_profile ?? [];
  const containsCount = profileRows.filter((row) => row.status === 'contains').length;
  const mayContainCount = profileRows.filter((row) => row.status === 'may_contain').length;
  const freeOfCount = profileRows.filter((row) => row.status === 'free_of').length;
  const unknownCount = profileRows.filter((row) => row.status === 'unknown').length;

  const isDirty = useMemo(() => {
    if (!detail || draftRows.length !== detail.allergen_profile.length) {
      return false;
    }

    return draftRows.some((row, index) => {
      const current = detail.allergen_profile[index];
      return (
        row.status !== current.status
        || row.confidence !== current.confidence
        || row.notes !== (current.notes ?? '')
        || row.verified_by !== (current.verified_by ?? '')
      );
    });
  }, [detail, draftRows]);

  if (!detail) {
    return (
      <WorkflowPanel title="Item profile review" description="Structured allergen rows for the selected item.">
        <div className="text-sm text-slate-600">Loading item profile...</div>
      </WorkflowPanel>
    );
  }

  const saveProfile = () => {
    const reviewedAt = new Date().toISOString();
    updateProfile.mutate({
      itemId: detail.item.id,
      profiles: draftRows.map((row) => ({
        allergen_code: row.allergen_code,
        status: row.status,
        confidence: row.confidence,
        notes: row.notes.trim() || null,
        verified_by: row.verified_by.trim() || null,
        verified_at: row.verified_at || null,
        last_reviewed_at: reviewedAt,
      })),
    });
  };

  return (
    <WorkflowPanel
      title="Item profile review"
      description="Update structured allergen statuses, confidence, and operator notes directly from this item workspace."
      actions={(
        <div className="flex items-center gap-2">
          {updateProfile.isSuccess ? <WorkflowStatusPill tone="green">Saved</WorkflowStatusPill> : null}
          <button
            type="button"
            onClick={saveProfile}
            disabled={!isDirty || updateProfile.isPending}
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {updateProfile.isPending ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      )}
    >
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryStat label="Contains" value={containsCount} tone="red" />
        <SummaryStat label="May contain" value={mayContainCount} tone="amber" />
        <SummaryStat label="Free of" value={freeOfCount} tone="green" />
        <SummaryStat label="Unknown" value={unknownCount} tone="slate" />
      </div>

      {updateProfile.isError ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {updateProfile.error instanceof Error ? updateProfile.error.message : 'Profile save failed.'}
        </div>
      ) : null}

      {draftRows.length === 0 ? (
        <div className="mt-4">
          <WorkflowEmptyState
            title="No allergen profile rows"
            body="The backend did not return any allergen records for this item."
          />
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Allergen</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {draftRows.map((row) => (
                <tr key={row.allergen_id} className="align-top">
                  <td className="px-4 py-4">
                    <div className="text-sm font-semibold text-slate-950">{row.allergen_name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{row.allergen_code}</div>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={row.status}
                      onChange={(event) => setDraftRows((current) => current.map((entry) => (
                        entry.allergen_id === row.allergen_id
                          ? { ...entry, status: event.target.value as EditableProfileRow['status'] }
                          : entry
                      )))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    >
                      <option value="contains">contains</option>
                      <option value="may_contain">may contain</option>
                      <option value="free_of">free of</option>
                      <option value="unknown">unknown</option>
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      value={row.confidence}
                      onChange={(event) => setDraftRows((current) => current.map((entry) => (
                        entry.allergen_id === row.allergen_id
                          ? { ...entry, confidence: event.target.value as EditableProfileRow['confidence'] }
                          : entry
                      )))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    >
                      <option value="verified">verified</option>
                      <option value="high">high</option>
                      <option value="moderate">moderate</option>
                      <option value="low">low</option>
                      <option value="unverified">unverified</option>
                      <option value="unknown">unknown</option>
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <textarea
                      value={row.notes}
                      onChange={(event) => setDraftRows((current) => current.map((entry) => (
                        entry.allergen_id === row.allergen_id
                          ? { ...entry, notes: event.target.value }
                          : entry
                      )))}
                      rows={3}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition focus:border-slate-400"
                      placeholder="Operator note or prep caveat"
                    />
                    <input
                      value={row.verified_by}
                      onChange={(event) => setDraftRows((current) => current.map((entry) => (
                        entry.allergen_id === row.allergen_id
                          ? { ...entry, verified_by: event.target.value }
                          : entry
                      )))}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-slate-400"
                      placeholder="Verified by"
                    />
                    {(row.verified_at || row.last_reviewed_at) ? (
                      <div className="mt-2 text-xs text-slate-500">
                        {row.verified_at ? `Verified ${formatDate(row.verified_at)}` : ''}
                        {row.verified_at && row.last_reviewed_at ? ' • ' : ''}
                        {row.last_reviewed_at ? `Reviewed ${formatDate(row.last_reviewed_at)}` : ''}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WorkflowPanel>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: 'red' | 'amber' | 'green' | 'slate' }) {
  const toneClass = tone === 'red'
    ? 'border-rose-200 bg-rose-50 text-rose-950'
    : tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-950'
      : tone === 'green'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
        : 'border-slate-200 bg-slate-50 text-slate-950';

  return (
    <div className={`rounded-3xl border p-4 ${toneClass}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-current/60">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
