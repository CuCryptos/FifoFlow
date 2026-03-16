import { Activity, ArrowRight, Clock3, RefreshCw } from 'lucide-react';
import type { PackFreshnessEntryPayload } from '../../api';

interface PackFreshnessGridProps {
  packs: PackFreshnessEntryPayload[];
  onRunPack?: (pack: string) => void;
  runningPack?: string | null;
}

export function PackFreshnessGrid({ packs, onRunPack, runningPack = null }: PackFreshnessGridProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Intelligence Freshness</h2>
          <p className="mt-1 text-sm text-slate-600">
            See which packs are current, which ones are aging, and rerun only the path you need.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {packs.map((pack) => {
          const lastCompleted = pack.last_run?.run_completed_at ?? pack.last_run?.run_started_at ?? null;
          return (
            <div key={pack.pack_key} className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={pack.freshness_label} />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{pack.pack_key.replaceAll('_', ' ')}</span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-slate-900">{pack.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{pack.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRunPack?.(pack.pack_key)}
                  disabled={!onRunPack || runningPack === pack.pack_key}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw size={15} className={runningPack === pack.pack_key ? 'animate-spin' : ''} />
                  {runningPack === pack.pack_key ? 'Running...' : 'Run pack'}
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MetricCard label="Last completion" value={lastCompleted ? formatDateTime(lastCompleted) : 'Never'} icon={<Clock3 size={16} />} />
                <MetricCard label="Last status" value={pack.last_run?.status ?? 'missing'} icon={<Activity size={16} />} />
              </div>

              {pack.age_hours != null ? (
                <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Last completed {pack.age_hours.toFixed(1)} hours ago.
                </div>
              ) : null}

              {Object.keys(pack.metrics).length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                  {Object.entries(pack.metrics).map(([key, value]) => (
                    <span key={key} className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                      {key.replaceAll('_', ' ')}: {String(value)}
                    </span>
                  ))}
                </div>
              ) : null}

              {pack.downstream_packs.length > 0 ? (
                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                  <span>Downstream refresh</span>
                  <ArrowRight size={14} />
                  <span>{pack.downstream_packs.join(' -> ')}</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: PackFreshnessEntryPayload['freshness_label'] }) {
  const styles = {
    fresh: 'border-emerald-200 bg-emerald-100 text-emerald-800',
    aging: 'border-amber-200 bg-amber-100 text-amber-800',
    stale: 'border-rose-200 bg-rose-100 text-rose-800',
    missing: 'border-slate-200 bg-slate-100 text-slate-700',
  } as const;

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${styles[status]}`}>{status}</span>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}
