import type { ReactNode } from 'react';

export function WorkflowPage({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,#f4efe1_0%,#fbfaf7_34%,#f5f8fe_72%,#ffffff_100%)] shadow-sm">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end lg:justify-between lg:p-8">
          <div className="max-w-4xl">
            <div className="inline-flex items-center rounded-full border border-slate-300/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
              {eyebrow}
            </div>
            <h1 className="mt-4 text-3xl font-semibold leading-tight text-slate-950 md:text-4xl">{title}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">{description}</p>
          </div>
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
      </section>
      {children}
    </div>
  );
}

export function WorkflowMetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export function WorkflowMetricCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: 'default' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const borderClass = tone === 'green'
    ? 'border-emerald-300/50'
    : tone === 'amber'
      ? 'border-amber-300/50'
      : tone === 'red'
        ? 'border-rose-300/50'
        : tone === 'blue'
          ? 'border-sky-300/50'
          : 'border-slate-200';

  return (
    <div className={`rounded-3xl border ${borderClass} bg-white p-5 shadow-sm`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-slate-950">{value}</div>
      <div className="mt-2 text-sm leading-5 text-slate-600">{detail}</div>
    </div>
  );
}

export function WorkflowPanel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function WorkflowFocusBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export function WorkflowChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? 'rounded-full bg-slate-950 px-3 py-1.5 text-sm font-medium text-white'
        : 'rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-slate-900'}
    >
      {children}
    </button>
  );
}

export function WorkflowStatusPill({
  tone,
  children,
}: {
  tone: 'green' | 'amber' | 'red' | 'blue' | 'slate';
  children: ReactNode;
}) {
  const className = tone === 'green'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : tone === 'amber'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : tone === 'red'
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : tone === 'blue'
          ? 'bg-sky-50 text-sky-700 border-sky-200'
          : 'bg-slate-100 text-slate-700 border-slate-200';

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

export function WorkflowEmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <div className="text-base font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-600">{body}</div>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
