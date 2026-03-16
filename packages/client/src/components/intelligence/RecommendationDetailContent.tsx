import { useMemo, useState } from 'react';
import { Clock3, ExternalLink, Sparkles, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RecommendationDetailPayload } from '../../api';

interface RecommendationDetailContentProps {
  detail: RecommendationDetailPayload;
  onStatusChange?: (status: string, notes?: string) => void;
  statusPending?: boolean;
}

const ACTIONS = [
  { status: 'REVIEWED', label: 'Mark Reviewed' },
  { status: 'ACTIVE', label: 'Mark Active' },
  { status: 'DISMISSED', label: 'Dismiss' },
  { status: 'OPEN', label: 'Reopen' },
] as const;

export function RecommendationDetailContent({ detail, onStatusChange, statusPending = false }: RecommendationDetailContentProps) {
  const [notes, setNotes] = useState('');
  const recommendation = detail.recommendation;
  const suggestedSteps = useMemo(() => {
    const raw = recommendation.operator_action_payload['suggested_steps'];
    return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : [];
  }, [recommendation.operator_action_payload]);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={severityTone(recommendation.severity_label)} label={recommendation.severity_label} />
          <Badge tone="slate" label={recommendation.status} />
          <Badge tone="slate" label={recommendation.recommendation_type.replaceAll('_', ' ')} />
          <Badge tone="slate" label={`Urgency: ${recommendation.urgency_label.replaceAll('_', ' ').toLowerCase()}`} />
        </div>
        <h3 className="mt-4 text-2xl font-semibold text-slate-900">{recommendation.summary}</h3>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
            <UserRound size={14} />
            {recommendation.likely_owner}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
            <Clock3 size={14} />
            Opened {formatDateTime(recommendation.opened_at)}
          </span>
          {recommendation.due_at ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-900">
              Due {formatDateTime(recommendation.due_at)}
            </span>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <Panel title="Suggested Operator Action" subtitle="Deterministic action guidance synthesized from the underlying signals.">
            {suggestedSteps.length > 0 ? (
              <div className="space-y-3">
                {suggestedSteps.map((step) => (
                  <div key={step} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <Sparkles size={16} className="mt-0.5 text-slate-500" />
                    <span className="text-sm leading-6 text-slate-700">{step}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyNote body="This recommendation does not yet have structured suggested steps in its operator action payload." />
            )}
          </Panel>

          <Panel title="Evidence Signals" subtitle="Signals that caused or confirmed this recommendation.">
            {detail.evidence_signals.length > 0 ? (
              <div className="space-y-3">
                {detail.evidence_signals.map((signal) => (
                  <Link
                    key={String(signal.id)}
                    to={`/intelligence/signals/${signal.id}`}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-slate-300 hover:bg-white"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{signal.signal_type.replaceAll('_', ' ')}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatDateTime(signal.observed_at)}</div>
                    </div>
                    <ExternalLink size={15} className="mt-1 text-slate-400" />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyNote body="No evidence signals were attached to this recommendation yet." />
            )}
          </Panel>

          <Panel title="Subject Signal History" subtitle="Recent intelligence activity for the same subject.">
            {detail.subject_signal_history.length > 0 ? (
              <div className="space-y-3">
                {detail.subject_signal_history.map((signal) => (
                  <Link
                    key={String(signal.id)}
                    to={`/intelligence/signals/${signal.id}`}
                    className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-slate-300 hover:bg-white"
                  >
                    <div className="text-sm font-semibold text-slate-900">{signal.signal_type.replaceAll('_', ' ')}</div>
                    <div className="mt-1 text-xs text-slate-500">{formatDateTime(signal.observed_at)}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyNote body="No additional signal history exists for this recommendation subject." />
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Review Actions" subtitle="Explicit lifecycle controls. Recommendation state stays separate from memo inclusion.">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {ACTIONS.map((action) => (
                <button
                  key={action.status}
                  type="button"
                  onClick={() => onStatusChange?.(action.status, notes)}
                  disabled={statusPending || recommendation.status === action.status || !onStatusChange}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {action.label}
                </button>
              ))}
            </div>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="Optional review note for the status change..."
              className="mt-4 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-500 focus:bg-white"
            />
          </Panel>

          <Panel title="Review History" subtitle="Durable recommendation review events in this runtime.">
            {detail.review_events.length > 0 ? (
              <div className="space-y-3">
                {detail.review_events.map((event) => (
                  <div key={String(event.id)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge tone="slate" label={`${event.from_status ?? 'unknown'} -> ${event.to_status ?? 'unknown'}`} />
                      <span>{formatDateTime(event.created_at)}</span>
                      {event.actor_name ? <span>{event.actor_name}</span> : null}
                    </div>
                    {event.notes ? <p className="mt-2 text-sm leading-6 text-slate-700">{event.notes}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyNote body="No review events have been recorded for this recommendation yet." />
            )}
          </Panel>
        </div>
      </section>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h4 className="text-base font-semibold text-slate-900">{title}</h4>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Badge({ label, tone }: { label: string; tone: 'slate' | 'amber' | 'rose' | 'sky' }) {
  const classes = {
    slate: 'border-slate-200 bg-slate-100 text-slate-700',
    amber: 'border-amber-200 bg-amber-100 text-amber-800',
    rose: 'border-rose-200 bg-rose-100 text-rose-800',
    sky: 'border-sky-200 bg-sky-100 text-sky-800',
  } as const;

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${classes[tone]}`}>{label}</span>;
}

function EmptyNote({ body }: { body: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">{body}</div>;
}

function severityTone(severity: string): 'rose' | 'amber' | 'sky' | 'slate' {
  switch (severity) {
    case 'critical':
      return 'rose';
    case 'high':
      return 'amber';
    case 'medium':
      return 'sky';
    default:
      return 'slate';
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}
