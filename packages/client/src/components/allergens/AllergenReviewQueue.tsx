import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowUpRight, FileText, MessageSquareWarning, ShieldAlert } from 'lucide-react';
import { WorkflowEmptyState, WorkflowPanel, WorkflowStatusPill } from '../workflow/WorkflowPrimitives';
import type { AllergenReviewQueuePayload } from '../../api';

export function AllergenReviewQueue({ queue }: { queue: AllergenReviewQueuePayload | undefined }) {
  const itemCount = queue?.items.length ?? 0;
  const documentProductCount = queue?.document_products.length ?? 0;
  const recipeCount = queue?.recipes.length ?? 0;

  return (
    <WorkflowPanel
      title="Review queue"
      description="Items, document products, and recipes that still need a structured allergen pass."
    >
      {!queue ? (
        <div className="text-sm text-slate-600">Loading review queue...</div>
      ) : itemCount === 0 && documentProductCount === 0 && recipeCount === 0 ? (
        <WorkflowEmptyState
          title="Nothing needs review"
          body="The current queue is clear. When new allergen data lands, flagged items will appear here."
        />
      ) : (
        <div className="space-y-5">
          <QueueSection
            icon={<ShieldAlert className="h-4 w-4" />}
            title="Items"
            count={itemCount}
            rows={queue.items.map((row) => (
              <Link
                key={`item-${row.item_id}`}
                to={`/allergens/items/${row.item_id}`}
                className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-950">{row.item_name}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">{row.reason}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <WorkflowStatusPill tone={row.flagged_profile_count > 0 ? 'amber' : 'slate'}>
                    {row.flagged_profile_count} flagged
                  </WorkflowStatusPill>
                  <ArrowUpRight className="mt-0.5 h-4 w-4 text-slate-400" />
                </div>
              </Link>
            ))}
          />

          <QueueSection
            icon={<FileText className="h-4 w-4" />}
            title="Document products"
            count={documentProductCount}
            rows={queue.document_products.map((row) => (
              <Link
                key={`doc-${row.document_id}-product-${row.product_id}`}
                to={`/allergens/documents/${row.document_id}`}
                className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-950">{row.product_name}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">
                    {row.filename} • page {row.page_number}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{row.reason}</div>
                </div>
                <ArrowUpRight className="mt-0.5 h-4 w-4 text-slate-400" />
              </Link>
            ))}
          />

          <QueueSection
            icon={<MessageSquareWarning className="h-4 w-4" />}
            title="Recipes"
            count={recipeCount}
            rows={queue.recipes.map((row) => (
              <Link
                key={`recipe-${row.recipe_version_id}`}
                to={`/recipes/promoted/${row.recipe_version_id}`}
                className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-950">{row.recipe_name}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">Version {row.version_number}</div>
                </div>
                <WorkflowStatusPill tone={row.flagged_rollup_count > 0 ? 'red' : 'slate'}>
                  {row.flagged_rollup_count} flagged
                </WorkflowStatusPill>
              </Link>
            ))}
          />
        </div>
      )}
    </WorkflowPanel>
  );
}

function QueueSection({
  icon,
  title,
  count,
  rows,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  rows: ReactNode[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">{icon}</div>
          <div>
            <div className="text-sm font-semibold text-slate-950">{title}</div>
            <div className="text-xs text-slate-500">{count} item{count === 1 ? '' : 's'}</div>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {rows.length > 0 ? rows : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600">No {title.toLowerCase()} need attention.</div>}
      </div>
    </section>
  );
}
