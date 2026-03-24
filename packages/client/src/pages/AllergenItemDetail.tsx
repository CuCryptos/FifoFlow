import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useAllergenItem } from '../hooks/useAllergens';
import { ItemAllergenEditor } from '../components/allergens/ItemAllergenEditor';
import { AllergenEvidenceTimeline } from '../components/allergens/AllergenEvidenceTimeline';
import { WorkflowMetricCard, WorkflowMetricGrid, WorkflowPage, WorkflowPanel, WorkflowStatusPill } from '../components/workflow/WorkflowPrimitives';

export function AllergenItemDetail() {
  const { itemId } = useParams<{ itemId: string }>();
  const id = Number(itemId);
  const itemQuery = useAllergenItem(id);
  const detail = itemQuery.data;

  return (
    <div className="space-y-6">
      <Link to="/allergens" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900">
        <ArrowLeft size={16} />
        Back to allergens
      </Link>

      <WorkflowPage
        eyebrow="Item detail"
        title={detail ? detail.item.name : 'Loading item...'}
        description="Review the current allergen profile, provenance, and linked chart products for a single inventory item."
        actions={detail ? <WorkflowStatusPill tone="slate">{detail.item.category}</WorkflowStatusPill> : undefined}
      >
        {itemQuery.isLoading ? (
          <div className="text-sm text-slate-600">Loading item detail...</div>
        ) : itemQuery.isError || !detail ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900">
            {itemQuery.error instanceof Error ? itemQuery.error.message : 'Item not found.'}
          </div>
        ) : (
          <>
            <WorkflowMetricGrid>
              <WorkflowMetricCard label="Profile rows" value={detail.allergen_profile.length} detail="All active allergen rows returned by the backend." />
              <WorkflowMetricCard label="Contains" value={detail.allergen_profile.filter((row) => row.status === 'contains').length} detail="Explicitly marked contains." tone="red" />
              <WorkflowMetricCard label="May contain" value={detail.allergen_profile.filter((row) => row.status === 'may_contain').length} detail="Needs kitchen confirmation." tone="amber" />
              <WorkflowMetricCard label="Evidence rows" value={detail.evidence.length} detail="Provenance attached to the profile." tone="blue" />
            </WorkflowMetricGrid>

            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <ItemAllergenEditor detail={detail} />
              <div className="space-y-6">
                <AllergenEvidenceTimeline evidence={detail.evidence} />
                <WorkflowPanel
                  title="Linked chart products"
                  description="Parsed allergy-chart products already matched to this item."
                  actions={<Link to="/allergens" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 transition hover:text-slate-900"><ExternalLink size={15} />Open workspace</Link>}
                >
                  {detail.linked_document_products.length === 0 ? (
                    <div className="text-sm text-slate-600">No linked document products yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {detail.linked_document_products.map((product) => (
                        <Link
                          key={`${product.document_id}-${product.product_id}`}
                          to={`/allergens/documents/${product.document_id}`}
                          className="block rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-slate-300 hover:bg-white"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-slate-950">{product.product_name}</div>
                              <div className="mt-1 text-xs text-slate-500">{product.filename} • page {product.page_number}</div>
                            </div>
                            <WorkflowStatusPill tone={matchTone(product.match_status)}>{product.match_status}</WorkflowStatusPill>
                          </div>
                          <div className="mt-2 text-sm leading-6 text-slate-600">{product.source_row_text}</div>
                        </Link>
                      ))}
                    </div>
                  )}
                </WorkflowPanel>
              </div>
            </div>
          </>
        )}
      </WorkflowPage>
    </div>
  );
}

function matchTone(status: string): 'green' | 'amber' | 'red' | 'slate' {
  if (status === 'confirmed') return 'green';
  if (status === 'suggested') return 'amber';
  if (status === 'rejected' || status === 'no_match') return 'red';
  return 'slate';
}
