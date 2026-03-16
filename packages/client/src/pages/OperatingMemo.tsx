import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  FileWarning,
  Gauge,
  NotebookText,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { MemoItemPayload, RecommendationCardPayload } from '../api';
import { PackFreshnessGrid } from '../components/intelligence/PackFreshnessGrid';
import { SignalDetailContent } from '../components/intelligence/SignalDetailContent';
import { SlideOver } from '../components/intelligence/SlideOver';
import { useVenueContext } from '../contexts/VenueContext';
import {
  useIntelligenceFreshness,
  useOperatorBrief,
  useRefreshIntelligence,
  useRunIntelligencePack,
  useSignalDetail,
} from '../hooks/useIntelligence';

export function OperatingMemo() {
  const { selectedVenueId } = useVenueContext();
  const briefQuery = useOperatorBrief(selectedVenueId, 7);
  const refreshMutation = useRefreshIntelligence(selectedVenueId, 30, 7);
  const freshnessQuery = useIntelligenceFreshness(selectedVenueId, 7);
  const runPackMutation = useRunIntelligencePack(selectedVenueId, 30, 7);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSignalId = Number(searchParams.get('signal'));
  const signalQuery = useSignalDetail(Number.isFinite(selectedSignalId) ? selectedSignalId : null, selectedVenueId, 7);

  const topNotes = useMemo(() => {
    const refreshNotes = refreshMutation.data
      ? Object.values(refreshMutation.data.jobs)
          .flatMap((job) => job.notes.slice(0, 1).map((note) => `${job.job}: ${note}`))
      : [];
    const packNotes = runPackMutation.data
      ? Object.values(runPackMutation.data.pipeline.jobs)
          .flatMap((job) => job.notes.slice(0, 1).map((note) => `${job.job}: ${note}`))
      : [];

    return [...packNotes, ...refreshNotes].slice(0, 4);
  }, [refreshMutation.data, runPackMutation.data]);

  if (briefQuery.isLoading) {
    return <div className="text-text-secondary">Loading operating memo...</div>;
  }

  if (briefQuery.error || !briefQuery.data) {
    return (
      <div className="rounded-3xl border border-border bg-bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3 text-accent-red">
          <ShieldAlert size={20} />
          <h1 className="text-xl font-semibold text-text-primary">Operating memo unavailable</h1>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-text-secondary">
          FIFOFlow could not load the operator brief. Refresh the intelligence stack and try again.
        </p>
        <button
          type="button"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent-indigo px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-indigo-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={refreshMutation.isPending ? 'animate-spin' : ''} />
          Refresh Intelligence
        </button>
      </div>
    );
  }

  const brief = briefQuery.data;
  const topPriority = brief.top_priority_items;
  const needsReview = brief.sections.find((section) => section.key === 'needs_review')?.items ?? [];

  const openSignal = (signalId: number | string) => {
    const next = new URLSearchParams(searchParams);
    next.set('signal', String(signalId));
    setSearchParams(next, { replace: false });
  };

  const closeSignalDrawer = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('signal');
    setSearchParams(next, { replace: false });
  };

  return (
    <>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#f7f4ea_0%,#ffffff_45%,#ecf4ff_100%)] shadow-sm">
          <div className="grid gap-8 p-6 lg:grid-cols-[1.5fr_0.9fr] lg:p-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                <NotebookText size={14} />
                Weekly Operating Memo
              </div>
              <h1 className="mt-4 max-w-3xl font-sans text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
                What changed, what matters, and who likely needs to move this week.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                This memo is built from live price, recipe cost, and inventory variance signals. It is now wired into drilldowns, recommendation review, and pack-level reruns so you can test the intelligence stack as an operator surface instead of a backend-only foundation.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
                <span className="rounded-full border border-slate-300 bg-white/80 px-3 py-1.5">
                  Window: {formatDate(brief.memo_window.start)} to {formatDate(brief.memo_window.end)}
                </span>
                <span className="rounded-full border border-slate-300 bg-white/80 px-3 py-1.5">
                  Generated: {formatDateTime(brief.generated_at)}
                </span>
                <span className="rounded-full border border-slate-300 bg-white/80 px-3 py-1.5">
                  Venue scope: {brief.scope.venue_id ?? 'All venues'}
                </span>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => refreshMutation.mutate()}
                  disabled={refreshMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw size={16} className={refreshMutation.isPending ? 'animate-spin' : ''} />
                  {refreshMutation.isPending ? 'Refreshing Intelligence...' : 'Refresh All Intelligence'}
                </button>
                <a
                  href="#recommendations"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/80 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                >
                  Jump to Recommendations
                  <ArrowRight size={16} />
                </a>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <HeroStat icon={<AlertTriangle size={18} />} label="Top priority items" value={brief.counts.top_priority_count} accent="amber" />
              <HeroStat icon={<ClipboardList size={18} />} label="Active recommendations" value={brief.counts.active_recommendation_count} accent="blue" />
              <HeroStat icon={<Gauge size={18} />} label="Signals in memo window" value={brief.counts.signal_count} accent="green" />
              <HeroStat icon={<FileWarning size={18} />} label="Needs review" value={brief.counts.needs_review_count} accent="red" />
            </div>
          </div>
        </section>

        <PackFreshnessGrid
          packs={freshnessQuery.data?.packs ?? []}
          runningPack={runPackMutation.isPending ? runPackMutation.variables ?? null : null}
          onRunPack={(pack) => runPackMutation.mutate(pack)}
        />

        {topNotes.length > 0 && (
          <section className="rounded-3xl border border-border bg-bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <RefreshCw size={16} />
              Latest intelligence notes
            </div>
            <div className="mt-3 space-y-2 text-sm text-text-secondary">
              {topNotes.map((note) => (
                <div key={note} className="rounded-2xl bg-slate-50 px-4 py-3">{note}</div>
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-border bg-bg-card p-5 shadow-sm">
            <SectionHeading
              title="Top Priority Items"
              subtitle="Highest-ranked operating items across all live intelligence packs. Open any item to inspect the exact evidence and thresholds behind it."
            />
            <div className="mt-4 space-y-3">
              {topPriority.length > 0 ? topPriority.map((item) => (
                <PriorityCard key={`${item.signal_type}:${item.source_signal_id}`} item={item} onOpen={() => openSignal(item.source_signal_id)} />
              )) : (
                <EmptyState
                  title="No urgent memo items yet"
                  body="Run intelligence to generate signals and ranked memo items for the current operating window."
                />
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-bg-card p-5 shadow-sm">
            <SectionHeading
              title="Routing Summary"
              subtitle="Who should likely care first if you act on the memo now."
            />
            <div className="mt-4 space-y-3">
              {brief.routing_summary.length > 0 ? brief.routing_summary.map((route) => (
                <div key={route.owner} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{route.owner}</div>
                      <div className="mt-1 text-xs text-slate-600">{route.signal_types.join(' • ')}</div>
                    </div>
                    <div className="text-2xl font-semibold text-slate-900">{route.item_count}</div>
                  </div>
                </div>
              )) : (
                <EmptyState
                  title="No routing pressure"
                  body="When live signals are present, FIFOFlow will summarize provisional owners here."
                />
              )}
            </div>
          </div>
        </section>

        <section id="recommendations" className="rounded-3xl border border-border bg-bg-card p-5 shadow-sm">
          <SectionHeading
            title="Active Recommendations"
            subtitle="Durable operator actions synthesized from trusted signals. Open the review page to change status and inspect evidence history."
          />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {brief.active_recommendations.length > 0 ? brief.active_recommendations.map((recommendation) => (
              <RecommendationCard key={String(recommendation.id)} recommendation={recommendation} />
            )) : (
              <div className="lg:col-span-2">
                <EmptyState
                  title="No synthesized actions yet"
                  body="Signals may exist without crossing the current recommendation rules. Refresh intelligence after more count, vendor, or recipe cost activity lands."
                />
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          {brief.sections
            .filter((section) => section.key !== 'top_priority' && section.key !== 'standards_review')
            .map((section) => (
              <div key={section.key} className="rounded-3xl border border-border bg-bg-card p-5 shadow-sm">
                <SectionHeading title={section.title} subtitle={`${section.items.length} ranked item${section.items.length === 1 ? '' : 's'} in this section.`} />
                <div className="mt-4 space-y-3">
                  {section.items.length > 0 ? section.items.map((item) => (
                    <CompactMemoRow key={`${section.key}:${item.source_signal_id}`} item={item} onOpen={() => openSignal(item.source_signal_id)} />
                  )) : (
                    <EmptyState
                      title={`No ${section.title.toLowerCase()} items`}
                      body="This section is currently quiet for the selected memo window."
                    />
                  )}
                </div>
              </div>
            ))}
        </section>

        <section className="rounded-3xl border border-border bg-bg-card p-5 shadow-sm">
          <SectionHeading
            title="Recent Signal Feed"
            subtitle="A compact ranked feed of the live signal evidence behind the memo."
          />
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {brief.recent_signal_items.length > 0 ? brief.recent_signal_items.map((item) => (
              <CompactMemoRow key={`recent:${item.source_signal_id}`} item={item} onOpen={() => openSignal(item.source_signal_id)} />
            )) : (
              <div className="lg:col-span-2">
                <EmptyState
                  title="No persisted live signals"
                  body="The intelligence tables are still quiet for the current memo window."
                />
              </div>
            )}
          </div>
        </section>

        {needsReview.length > 0 && (
          <section className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5 shadow-sm">
            <SectionHeading
              title="Needs Review / Incomplete Intelligence"
              subtitle="These items are visible, but confidence or threshold provenance still needs care."
            />
            <div className="mt-4 space-y-3">
              {needsReview.map((item) => (
                <CompactMemoRow key={`review:${item.source_signal_id}`} item={item} emphasizeFallback onOpen={() => openSignal(item.source_signal_id)} />
              ))}
            </div>
          </section>
        )}
      </div>

      {Number.isFinite(selectedSignalId) ? (
        <SlideOver
          title={signalQuery.data?.memo_item.title ?? 'Signal detail'}
          subtitle={signalQuery.data?.memo_item.subject_label ?? 'Loading signal detail'}
          onClose={closeSignalDrawer}
        >
          {signalQuery.isLoading ? (
            <div className="text-sm text-slate-600">Loading signal drilldown...</div>
          ) : signalQuery.error || !signalQuery.data ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              Signal detail could not be loaded.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Link
                  to={`/intelligence/signals/${selectedSignalId}`}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                >
                  Open full page
                  <ArrowRight size={15} />
                </Link>
              </div>
              <SignalDetailContent detail={signalQuery.data} compact />
            </div>
          )}
        </SlideOver>
      ) : null}
    </>
  );
}

function HeroStat({ icon, label, value, accent }: { icon: ReactNode; label: string; value: number; accent: 'amber' | 'blue' | 'green' | 'red' }) {
  const accentClasses = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    blue: 'border-sky-200 bg-sky-50 text-sky-900',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    red: 'border-rose-200 bg-rose-50 text-rose-900',
  };

  return (
    <div className={`rounded-2xl border px-4 py-4 ${accentClasses[accent]}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">{label}</div>
        <div>{icon}</div>
      </div>
      <div className="mt-3 text-3xl font-semibold">{value}</div>
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
    </div>
  );
}

function PriorityCard({ item, onOpen }: { item: MemoItemPayload; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={item.severity} />
            <OwnerBadge owner={item.likely_owner} />
            {item.policy_fallback_used && <FlagBadge label="Policy fallback" tone="amber" />}
          </div>
          <h3 className="mt-3 text-base font-semibold text-slate-900">{item.title}</h3>
          <div className="mt-1 text-sm font-medium text-slate-700">{item.subject_label}</div>
        </div>
        <div className="rounded-2xl bg-slate-900 px-3 py-2 text-right text-white">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-300">Rank</div>
          <div className="text-xl font-semibold">{Math.round(item.ranking_explanation.total_score)}</div>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">{item.short_explanation}</p>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
        <FlagBadge label={item.signal_type.replaceAll('_', ' ')} tone="slate" />
        <FlagBadge label={`Urgency: ${formatUrgency(item.urgency)}`} tone="slate" />
        <FlagBadge label={`Confidence: ${item.confidence}`} tone="slate" />
        <FlagBadge label={`Evidence: ${item.evidence_references.length}`} tone="slate" />
      </div>
    </button>
  );
}

function RecommendationCard({ recommendation }: { recommendation: RecommendationCardPayload }) {
  const suggestedSteps = Array.isArray(recommendation.operator_action_payload['suggested_steps'])
    ? recommendation.operator_action_payload['suggested_steps'] as string[]
    : [];

  return (
    <Link to={`/intelligence/recommendations/${recommendation.id}`} className="block rounded-3xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-slate-300 hover:bg-white">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={recommendation.severity_label} />
        <OwnerBadge owner={recommendation.likely_owner} />
        <FlagBadge label={recommendation.recommendation_type.replaceAll('_', ' ')} tone="slate" />
      </div>
      <h3 className="mt-3 text-base font-semibold text-slate-900">{recommendation.summary}</h3>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
        <FlagBadge label={`Status: ${recommendation.status}`} tone="slate" />
        <FlagBadge label={`Urgency: ${formatUrgency(recommendation.urgency_label)}`} tone="slate" />
        <FlagBadge label={`Evidence: ${recommendation.evidence_count}`} tone="slate" />
        {recommendation.due_at && <FlagBadge label={`Due ${formatDate(recommendation.due_at)}`} tone="amber" />}
      </div>
      {suggestedSteps.length > 0 && (
        <div className="mt-4 space-y-2 text-sm text-slate-700">
          {suggestedSteps.slice(0, 3).map((step) => (
            <div key={step} className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
              <span>{step}</span>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}

function CompactMemoRow({ item, emphasizeFallback = false, onOpen }: { item: MemoItemPayload; emphasizeFallback?: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-2xl border p-4 text-left transition hover:border-slate-300 hover:bg-white ${emphasizeFallback ? 'border-amber-200 bg-white/80' : 'border-slate-200 bg-slate-50/60'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={item.severity} compact />
            <OwnerBadge owner={item.likely_owner} compact />
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-900">{item.title}</div>
          <div className="mt-1 text-sm text-slate-600">{item.subject_label}</div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>{formatDate(item.observed_at)}</div>
          <div className="mt-1 font-medium text-slate-700">{Math.round(item.ranking_explanation.total_score)} pts</div>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{item.short_explanation}</p>
    </button>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
      <div className="font-semibold text-slate-800">{title}</div>
      <p className="mt-2 leading-6">{body}</p>
    </div>
  );
}

function SeverityBadge({ severity, compact = false }: { severity: string; compact?: boolean }) {
  const styles = {
    critical: 'bg-rose-100 text-rose-700 border-rose-200',
    high: 'bg-amber-100 text-amber-700 border-amber-200',
    medium: 'bg-sky-100 text-sky-700 border-sky-200',
    low: 'bg-slate-100 text-slate-700 border-slate-200',
  } as const;

  return <span className={`rounded-full border px-2.5 py-1 font-medium ${compact ? 'text-[11px]' : 'text-xs'} ${styles[(severity as keyof typeof styles) ?? 'low']}`}>{severity}</span>;
}

function OwnerBadge({ owner, compact = false }: { owner: string; compact?: boolean }) {
  return <span className={`rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 ${compact ? 'text-[11px]' : 'text-xs'}`}>{owner}</span>;
}

function FlagBadge({ label, tone }: { label: string; tone: 'slate' | 'amber' }) {
  const classes = tone === 'amber'
    ? 'border-amber-200 bg-amber-100 text-amber-800'
    : 'border-slate-200 bg-white text-slate-700';

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${classes}`}>{label}</span>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatUrgency(value: string) {
  return value.replaceAll('_', ' ').toLowerCase();
}
