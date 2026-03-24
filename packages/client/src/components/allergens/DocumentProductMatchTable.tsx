import { Link } from 'react-router-dom';
import { WorkflowEmptyState, WorkflowPanel, WorkflowStatusPill } from '../workflow/WorkflowPrimitives';
import type { AllergenDocumentProductPayload } from '../../api';

export function DocumentProductMatchTable({ products }: { products: AllergenDocumentProductPayload[] | undefined }) {
  return (
    <WorkflowPanel
      title="Parsed products and match states"
      description="The backend exposes parsed chart products and the item matches already attached to them."
    >
      {!products ? (
        <div className="text-sm text-slate-600">Loading document products...</div>
      ) : products.length === 0 ? (
        <WorkflowEmptyState
          title="No products parsed"
          body="The document exists, but the backend did not return any parsed product rows."
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Matches</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {products.map((product) => (
                <tr key={product.id} className="align-top">
                  <td className="px-4 py-4">
                    <div className="text-sm font-semibold text-slate-950">{product.product_name}</div>
                    <div className="mt-1 text-xs text-slate-500">Page {product.page_number}</div>
                    {product.source_chunk_ids.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {product.source_chunk_ids.map((chunkId) => (
                          <span key={chunkId} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                            chunk {chunkId}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-sm leading-6 text-slate-600">
                    <div>{product.allergen_summary ?? 'No allergen summary'}</div>
                    {product.dietary_notes ? <div className="mt-2 text-xs text-slate-500">{product.dietary_notes}</div> : null}
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {product.source_row_text}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {product.matches.length === 0 ? (
                      <WorkflowStatusPill tone="slate">No active matches</WorkflowStatusPill>
                    ) : (
                      <div className="space-y-2">
                        {product.matches.map((match) => (
                          <div key={match.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link to={`/allergens/items/${match.item_id}`} className="text-sm font-semibold text-slate-950 transition hover:text-slate-700">
                                {match.item_name}
                              </Link>
                              <WorkflowStatusPill tone={matchTone(match.match_status)}>{match.match_status}</WorkflowStatusPill>
                              <WorkflowStatusPill tone={match.active ? 'green' : 'slate'}>{match.active ? 'active' : 'inactive'}</WorkflowStatusPill>
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              {match.match_score != null ? `score ${match.match_score.toFixed(2)}` : 'no score'}
                              {match.matched_by ? ` • ${match.matched_by}` : ''}
                            </div>
                            {match.notes ? <div className="mt-2 text-sm leading-6 text-slate-600">{match.notes}</div> : null}
                          </div>
                        ))}
                      </div>
                    )}
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

function matchTone(status: 'suggested' | 'confirmed' | 'rejected' | 'no_match'): 'green' | 'amber' | 'red' | 'slate' {
  if (status === 'confirmed') return 'green';
  if (status === 'suggested') return 'amber';
  if (status === 'rejected' || status === 'no_match') return 'red';
  return 'slate';
}
