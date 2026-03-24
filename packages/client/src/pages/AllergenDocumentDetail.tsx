import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAllergenDocument } from '../hooks/useAllergens';
import { DocumentProductMatchTable } from '../components/allergens/DocumentProductMatchTable';
import { WorkflowMetricCard, WorkflowMetricGrid, WorkflowPage, WorkflowPanel, WorkflowStatusPill } from '../components/workflow/WorkflowPrimitives';

export function AllergenDocumentDetail() {
  const { documentId } = useParams<{ documentId: string }>();
  const id = Number(documentId);
  const documentQuery = useAllergenDocument(id);
  const detail = documentQuery.data;

  return (
    <div className="space-y-6">
      <Link to="/allergens" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900">
        <ArrowLeft size={16} />
        Back to allergens
      </Link>

      <WorkflowPage
        eyebrow="Document detail"
        title={detail ? detail.document.filename : 'Loading document...'}
        description="Inspect parsed chart products, match states, and the extracted page/chunk evidence for one uploaded allergy chart."
        actions={detail ? <WorkflowStatusPill tone={detail.document.status === 'ready' ? 'green' : 'red'}>{detail.document.status}</WorkflowStatusPill> : undefined}
      >
        {documentQuery.isLoading ? (
          <div className="text-sm text-slate-600">Loading document detail...</div>
        ) : documentQuery.isError || !detail ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900">
            {documentQuery.error instanceof Error ? documentQuery.error.message : 'Document not found.'}
          </div>
        ) : (
          <>
            <WorkflowMetricGrid>
              <WorkflowMetricCard label="Pages" value={detail.document.page_count} detail="Extracted pages from the uploaded chart." />
              <WorkflowMetricCard label="Chunks" value={detail.document.chunk_count} detail="Chunked text units available to the assistant." />
              <WorkflowMetricCard label="Products" value={detail.document.product_count} detail="Parsed chart products for review." tone="blue" />
              <WorkflowMetricCard label="Matches" value={detail.products.reduce((total, product) => total + product.matches.length, 0)} detail="Attached item matches across all products." tone="amber" />
            </WorkflowMetricGrid>

            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <DocumentProductMatchTable products={detail.products} />

              <WorkflowPanel
                title="Page and chunk evidence"
                description="Raw document text shown for operator review. The backend currently exposes this as read-only evidence."
                actions={<WorkflowStatusPill tone="slate">Read only</WorkflowStatusPill>}
              >
                <div className="space-y-5">
                  {detail.pages.length === 0 ? (
                    <div className="text-sm text-slate-600">No page text returned.</div>
                  ) : (
                    detail.pages.map((page) => (
                      <details key={page.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4" open={page.page_number === 1}>
                        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-950">
                          Page {page.page_number}
                        </summary>
                        <div className="mt-3 text-sm leading-6 text-slate-700">{page.extracted_text}</div>
                      </details>
                    ))
                  )}

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Chunks</div>
                    <div className="mt-3 space-y-2">
                      {detail.chunks.length === 0 ? (
                        <div className="text-sm text-slate-600">No chunk text returned.</div>
                      ) : (
                        detail.chunks.map((chunk) => (
                          <div key={chunk.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                            <div className="text-xs text-slate-500">Page {chunk.page_number} • chunk {chunk.chunk_index + 1}</div>
                            <div className="mt-2 text-sm leading-6 text-slate-700">{chunk.chunk_text}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </WorkflowPanel>
            </div>
          </>
        )}
      </WorkflowPage>
    </div>
  );
}
