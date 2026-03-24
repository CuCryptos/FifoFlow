import { WorkflowStatusPill } from '../workflow/WorkflowPrimitives';
import type { InventoryWorkflowFocus } from '../../hooks/useInventoryWorkflow';

export type InventoryLaneTone = 'slate' | 'amber' | 'red' | 'blue';

export const INVENTORY_FOCUS_COPY: Record<InventoryWorkflowFocus, { title: string; body: string; tone: InventoryLaneTone }> = {
  all: {
    title: 'Full inventory catalog',
    body: 'Use this lane to review the full operating catalog, then narrow into a specific readiness gap when you need action instead of browsing.',
    tone: 'slate',
  },
  needs_attention: {
    title: 'Attention queue',
    body: 'This lane combines reorder pressure and setup gaps so operators can work the highest-friction inventory items first.',
    tone: 'red',
  },
  reorder: {
    title: 'Reorder queue',
    body: 'These items are below their reorder level. Confirm pack setup, vendor ownership, and order quantity before issuing a PO.',
    tone: 'amber',
  },
  missing_vendor: {
    title: 'Vendor setup gap',
    body: 'These items are stocked but not anchored to a purchasing owner yet. Bulk vendor assignment should clear this lane quickly.',
    tone: 'blue',
  },
  missing_venue: {
    title: 'Venue scope gap',
    body: 'These items are not attached to an operating venue, so location-specific workflows and reporting remain incomplete.',
    tone: 'blue',
  },
  missing_storage_area: {
    title: 'Storage mapping gap',
    body: 'These items do not have a clear storage placement. That weakens count discipline and operational retrieval.',
    tone: 'blue',
  },
  ordering_incomplete: {
    title: 'Ordering setup gap',
    body: 'These items are missing reorder or pack/price fields. They are difficult to purchase accurately at scale.',
    tone: 'amber',
  },
};

function laneCardToneClass(tone: InventoryLaneTone, active: boolean) {
  if (active) {
    return {
      slate: 'border-slate-900 bg-slate-950 text-white shadow-lg shadow-slate-950/10',
      amber: 'border-amber-400 bg-amber-50 text-amber-950 shadow-lg shadow-amber-950/5',
      red: 'border-rose-400 bg-rose-50 text-rose-950 shadow-lg shadow-rose-950/5',
      blue: 'border-sky-400 bg-sky-50 text-sky-950 shadow-lg shadow-sky-950/5',
    }[tone];
  }

  return 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50';
}

export function InventoryLaneCard({
  active,
  count,
  focus,
  onClick,
}: {
  active: boolean;
  count: number;
  focus: InventoryWorkflowFocus;
  onClick: () => void;
}) {
  const copy = INVENTORY_FOCUS_COPY[focus];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-4 text-left transition ${laneCardToneClass(copy.tone, active)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${active ? 'text-current/70' : 'text-slate-500'}`}>
            {copy.title}
          </div>
          <div className="mt-2 text-3xl font-semibold leading-none">{count}</div>
        </div>
        <WorkflowStatusPill tone={copy.tone}>
          {active ? 'Active lane' : 'Open lane'}
        </WorkflowStatusPill>
      </div>
      <p className={`mt-3 text-sm leading-6 ${active ? 'text-current/80' : 'text-slate-600'}`}>
        {copy.body}
      </p>
    </button>
  );
}
