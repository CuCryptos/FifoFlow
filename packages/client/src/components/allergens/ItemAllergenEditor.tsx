import { WorkflowEmptyState, WorkflowPanel, WorkflowStatusPill } from '../workflow/WorkflowPrimitives';
import type { AllergenItemDetailPayload } from '../../api';

export function ItemAllergenEditor({ detail }: { detail: AllergenItemDetailPayload | undefined }) {
  if (!detail) {
    return (
      <WorkflowPanel title="Item profile review" description="Structured allergen rows for the selected item.">
        <div className="text-sm text-slate-600">Loading item profile...</div>
      </WorkflowPanel>
    );
  }

  const profileRows = detail.allergen_profile;
  const containsCount = profileRows.filter((row) => row.status === 'contains').length;
  const mayContainCount = profileRows.filter((row) => row.status === 'may_contain').length;
  const freeOfCount = profileRows.filter((row) => row.status === 'free_of').length;
  const unknownCount = profileRows.filter((row) => row.status === 'unknown').length;

  return (
    <WorkflowPanel
      title="Item profile review"
      description="Current allergen rows are read-only in this slice. The panel shows what the backend already knows."
    >
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryStat label="Contains" value={containsCount} tone="red" />
        <SummaryStat label="May contain" value={mayContainCount} tone="amber" />
        <SummaryStat label="Free of" value={freeOfCount} tone="green" />
        <SummaryStat label="Unknown" value={unknownCount} tone="slate" />
      </div>

      {profileRows.length === 0 ? (
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
              {profileRows.map((row) => (
                <tr key={row.allergen_id} className="align-top">
                  <td className="px-4 py-4">
                    <div className="text-sm font-semibold text-slate-950">{row.allergen_name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{row.allergen_code}</div>
                  </td>
                  <td className="px-4 py-4">
                    <WorkflowStatusPill tone={statusTone(row.status)}>{row.status.replaceAll('_', ' ')}</WorkflowStatusPill>
                  </td>
                  <td className="px-4 py-4">
                    <WorkflowStatusPill tone={confidenceTone(row.confidence)}>{row.confidence}</WorkflowStatusPill>
                  </td>
                  <td className="px-4 py-4 text-sm leading-6 text-slate-600">
                    {row.notes ?? 'No operator note'}
                    {row.verified_by || row.verified_at || row.last_reviewed_at ? (
                      <div className="mt-2 text-xs text-slate-500">
                        {row.verified_by ? `Verified by ${row.verified_by}` : 'Verified'}{row.verified_at ? ` • ${formatDate(row.verified_at)}` : ''}{row.last_reviewed_at ? ` • reviewed ${formatDate(row.last_reviewed_at)}` : ''}
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

function statusTone(status: 'contains' | 'may_contain' | 'free_of' | 'unknown'): 'red' | 'amber' | 'green' | 'slate' {
  if (status === 'contains') return 'red';
  if (status === 'may_contain') return 'amber';
  if (status === 'free_of') return 'green';
  return 'slate';
}

function confidenceTone(confidence: string): 'red' | 'amber' | 'green' | 'blue' | 'slate' {
  if (confidence === 'verified' || confidence === 'high') return 'green';
  if (confidence === 'moderate') return 'blue';
  if (confidence === 'low' || confidence === 'unverified') return 'amber';
  return 'slate';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
