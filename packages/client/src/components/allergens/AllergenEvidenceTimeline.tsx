import { WorkflowEmptyState, WorkflowPanel, WorkflowStatusPill } from '../workflow/WorkflowPrimitives';
import type { AllergenItemEvidencePayload } from '../../api';

export function AllergenEvidenceTimeline({ evidence }: { evidence: AllergenItemEvidencePayload[] | undefined }) {
  return (
    <WorkflowPanel
      title="Evidence timeline"
      description="Every stored claim that backs the item profile."
    >
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
