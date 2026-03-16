import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, ShieldAlert } from 'lucide-react';
import type { RecommendationCardPayload, SignalDetailPayload } from '../../api';

interface SignalDetailContentProps {
  detail: SignalDetailPayload;
  compact?: boolean;
  recommendationLinkBase?: string;
}

export function SignalDetailContent({
  detail,
  compact = false,
  recommendationLinkBase = '/intelligence/recommendations',
}: SignalDetailContentProps) {
  const { signal, memo_item: memoItem } = detail;
  const payloadHighlights = buildPayloadHighlights(signal.signal_payload);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={severityTone(memoItem.severity)} label={memoItem.severity} />
          <Badge tone="slate" label={memoItem.signal_type.replaceAll('_', ' ')} />
          <Badge tone="slate" label={`Urgency: ${formatUrgency(memoItem.urgency)}`} />
          <Badge tone="slate" label={`Confidence: ${memoItem.confidence}`} />
          {memoItem.policy_fallback_used ? <Badge tone="amber" label="Policy fallback used" /> : null}
        </div>

        <h3 className="mt-4 text-2xl font-semibold text-slate-900">{memoItem.title}</h3>
        <p className="mt-2 text-sm font-medium text-slate-700">{memoItem.subject_label}</p>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">{memoItem.short_explanation}</p>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <StatCard label="Observed" value={formatDateTime(signal.observed_at)} />
          <StatCard label="Rank score" value={String(Math.round(memoItem.ranking_explanation.total_score))} />
          <StatCard label="Evidence" value={String(signal.evidence_count ?? memoItem.evidence_references.length)} />
          <StatCard label="Owner" value={memoItem.likely_owner} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <Panel title="Variance And Threshold Context" subtitle="The exact payload and threshold reasoning behind this signal.">
            {payloadHighlights.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {payloadHighlights.map((entry) => (
                  <div key={entry.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{entry.label}</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{entry.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyNote body="This signal does not currently expose structured numeric highlights beyond the summary payload." />
            )}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-xs text-slate-200">
              <div className="mb-2 font-semibold uppercase tracking-[0.14em] text-slate-400">Raw signal payload</div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(signal.signal_payload, null, 2)}</pre>
            </div>
          </Panel>

          <Panel title="Evidence References" subtitle="What source records this signal is anchored to.">
            {memoItem.evidence_references.length > 0 ? (
              <div className="space-y-3">
                {memoItem.evidence_references.map((reference, index) => (
                  <div key={`${reference.source_table}:${reference.source_primary_key}:${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge tone="slate" label={reference.source_table} />
                      <span>{reference.source_primary_key}</span>
                      {reference.observed_at ? <span>{formatDateTime(reference.observed_at)}</span> : null}
                    </div>
                    {reference.payload ? (
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-700">
                        {JSON.stringify(reference.payload, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyNote body="No structured evidence references were attached to this signal." />
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Ranking Explanation" subtitle="Why this item surfaced where it did in the weekly memo.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {Object.entries(memoItem.ranking_explanation.components).map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label.replaceAll('_', ' ')}</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              {memoItem.ranking_explanation.factors.map((factor) => (
                <div key={factor} className="rounded-2xl bg-slate-50 px-3 py-2">{factor}</div>
              ))}
            </div>
          </Panel>

          <Panel title="Subject History" subtitle="Recent signals on the same subject so operators can judge whether this is isolated or repeating.">
            {detail.subject_signal_history.length > 0 ? (
              <div className="space-y-3">
                {detail.subject_signal_history.map((historySignal) => (
                  <Link
                    key={String(historySignal.id)}
                    to={`/intelligence/signals/${historySignal.id}`}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-slate-300 hover:bg-white"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{historySignal.signal_type.replaceAll('_', ' ')}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatDateTime(historySignal.observed_at)}</div>
                    </div>
                    <ArrowRight size={16} className="mt-1 text-slate-400" />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyNote body="No additional signal history exists for this subject in the current runtime store." />
            )}
          </Panel>

          <Panel title="Related Recommendations" subtitle="Actions already synthesized from this signal or subject.">
            {detail.related_recommendations.length > 0 ? (
              <div className="space-y-3">
                {detail.related_recommendations.map((recommendation) => (
                  <RecommendationSummaryCard
                    key={String(recommendation.id)}
                    recommendation={recommendation}
                    recommendationLinkBase={recommendationLinkBase}
                  />
                ))}
              </div>
            ) : (
              <EmptyNote body="No durable recommendation has been synthesized from this signal yet." />
            )}
          </Panel>

          {!compact ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldAlert size={16} />
                Scope and threshold reasoning stay explicit.
              </div>
              <p className="mt-2 leading-6">
                This drilldown is built from the persisted signal, its memo ranking explanation, and any downstream recommendations. No extra heuristics are introduced in the page layer.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function RecommendationSummaryCard({
  recommendation,
  recommendationLinkBase,
}: {
  recommendation: RecommendationCardPayload;
  recommendationLinkBase: string;
}) {
  return (
    <Link
      to={`${recommendationLinkBase}/${recommendation.id}`}
      className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-slate-300 hover:bg-white"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={severityTone(recommendation.severity_label)} label={recommendation.severity_label} />
        <Badge tone="slate" label={recommendation.recommendation_type.replaceAll('_', ' ')} />
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{recommendation.summary}</div>
          <div className="mt-1 text-xs text-slate-500">{recommendation.likely_owner}</div>
        </div>
        <ExternalLink size={15} className="mt-1 text-slate-400" />
      </div>
    </Link>
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-slate-900">{value}</div>
    </div>
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

function buildPayloadHighlights(payload: Record<string, unknown>) {
  const fields: Array<{ key: string; label: string; formatter?: (value: number) => string }> = [
    { key: 'normalized_price_change_abs', label: 'Price delta', formatter: currency },
    { key: 'normalized_price_change_pct', label: 'Price delta %', formatter: pct },
    { key: 'volatility_pct_range', label: 'Volatility %', formatter: pct },
    { key: 'delta_cost', label: 'Cost delta', formatter: currency },
    { key: 'delta_pct', label: 'Cost delta %', formatter: pct },
    { key: 'ingredient_delta_cost', label: 'Ingredient delta', formatter: currency },
    { key: 'ingredient_delta_pct_of_total', label: 'Driver share %', formatter: pct },
    { key: 'variance_qty_abs', label: 'Variance qty' },
    { key: 'variance_pct', label: 'Variance %', formatter: pct },
    { key: 'variance_cost_abs', label: 'Variance cost', formatter: currency },
    { key: 'recurrence_count', label: 'Recurrence' },
  ];

  return fields
    .map((field) => {
      const value = payload[field.key];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
      }
      return {
        label: field.label,
        value: field.formatter ? field.formatter(value) : String(value),
      };
    })
    .filter((entry): entry is { label: string; value: string } => entry !== null);
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

function currency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatUrgency(value: string) {
  return value.replaceAll('_', ' ').toLowerCase();
}
