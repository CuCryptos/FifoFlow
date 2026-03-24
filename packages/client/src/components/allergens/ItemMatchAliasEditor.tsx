import { useState } from 'react';
import type { AllergenItemDetailPayload } from '../../api';
import { useAddAllergenMatchAlias, useRemoveAllergenMatchAlias } from '../../hooks/useAllergens';
import { WorkflowEmptyState, WorkflowPanel, WorkflowStatusPill } from '../workflow/WorkflowPrimitives';

export function ItemMatchAliasEditor({ detail }: { detail: AllergenItemDetailPayload | undefined }) {
  const [aliasDraft, setAliasDraft] = useState('');
  const addAlias = useAddAllergenMatchAlias();
  const removeAlias = useRemoveAllergenMatchAlias();

  if (!detail) {
    return (
      <WorkflowPanel title="Match aliases" description="Intentional alternate names that should resolve chart rows to this item.">
        <div className="text-sm text-slate-600">Loading item aliases...</div>
      </WorkflowPanel>
    );
  }

  const submitAlias = () => {
    const alias = aliasDraft.trim();
    if (!alias) {
      return;
    }
    addAlias.mutate(
      { itemId: detail.item.id, alias },
      {
        onSuccess: () => {
          setAliasDraft('');
        },
      },
    );
  };

  return (
    <WorkflowPanel
      title="Match aliases"
      description="Add explicit alias names for component rows and vendor phrasing that should resolve to this item during allergen matching."
      actions={detail.match_aliases.length > 0 ? <WorkflowStatusPill tone="blue">{detail.match_aliases.length} active</WorkflowStatusPill> : undefined}
    >
      <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center">
        <input
          value={aliasDraft}
          onChange={(event) => setAliasDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submitAlias();
            }
          }}
          placeholder="Beurre Blanc, Au Jus, Local Macaroni Salad"
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        />
        <button
          type="button"
          onClick={submitAlias}
          disabled={addAlias.isPending || aliasDraft.trim().length === 0}
          className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {addAlias.isPending ? 'Adding...' : 'Add alias'}
        </button>
      </div>

      {addAlias.isError ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {addAlias.error instanceof Error ? addAlias.error.message : 'Failed to add alias.'}
        </div>
      ) : null}
      {removeAlias.isError ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {removeAlias.error instanceof Error ? removeAlias.error.message : 'Failed to remove alias.'}
        </div>
      ) : null}

      {detail.match_aliases.length === 0 ? (
        <div className="mt-5">
          <WorkflowEmptyState
            title="No aliases yet"
            body="Add explicit aliases when chart rows use component names or shorthand that should resolve to this item."
          />
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {detail.match_aliases.map((alias) => (
            <div key={alias.id} className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-950">{alias.alias}</div>
                <div className="mt-1 text-xs text-slate-500">
                  normalized as {alias.normalized_alias}
                  {alias.created_at ? ` • added ${formatDate(alias.created_at)}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeAlias.mutate({ itemId: detail.item.id, aliasId: alias.id })}
                disabled={removeAlias.isPending}
                className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remove alias
              </button>
            </div>
          ))}
        </div>
      )}
    </WorkflowPanel>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
