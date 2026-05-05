import { useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, FileText, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { api, type AllergyDocumentPayload, type AllergyDocumentReprocessPayload } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import { WorkflowEmptyState, WorkflowPanel, WorkflowStatusPill } from '../workflow/WorkflowPrimitives';

export function AllergenDocumentLibrary({ venueId }: { venueId?: number | null }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [lastReprocess, setLastReprocess] = useState<AllergyDocumentReprocessPayload | null>(null);

  const documentsQuery = useQuery({
    queryKey: ['allergy-documents', venueId ?? 'all'],
    queryFn: () => api.allergyAssistant.listDocuments(venueId),
  });

  const invalidateAllergenWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['allergy-documents'] }),
      queryClient.invalidateQueries({ queryKey: ['allergens', 'review-queue'] }),
      queryClient.invalidateQueries({ queryKey: ['allergens', 'documents'] }),
      queryClient.invalidateQueries({ queryKey: ['allergens', 'items'] }),
    ]);
  };

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => api.allergyAssistant.uploadDocuments(files, venueId),
    onSuccess: async (data) => {
      setSelectedFiles([]);
      setLastReprocess(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await invalidateAllergenWorkspace();
      toast(`Uploaded ${data.documents.length} allergy chart${data.documents.length === 1 ? '' : 's'}.`, 'success');
    },
    onError: (error: Error) => {
      toast(`Upload failed: ${error.message}`, 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: number) => api.allergyAssistant.deleteDocument(documentId),
    onSuccess: async () => {
      setLastReprocess(null);
      await invalidateAllergenWorkspace();
      toast('Allergy chart removed.', 'success');
    },
    onError: (error: Error) => {
      toast(`Delete failed: ${error.message}`, 'error');
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: (documentId: number) => api.allergyAssistant.reprocessDocument(documentId),
    onSuccess: async (summary) => {
      setLastReprocess(summary);
      await invalidateAllergenWorkspace();
      toast(`Reprocessed ${summary.processed_product_count} chart product${summary.processed_product_count === 1 ? '' : 's'}.`, 'success');
    },
    onError: (error: Error) => {
      toast(`Reprocess failed: ${error.message}`, 'error');
    },
  });

  const documents = documentsQuery.data?.documents ?? [];
  const readyCount = documents.filter((document) => document.status === 'ready').length;
  const productCount = documents.reduce((sum, document) => sum + document.product_count, 0);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(Array.from(event.target.files ?? []));
  };

  const handleUploadClick = () => {
    if (uploadMutation.isPending) {
      return;
    }
    if (selectedFiles.length === 0) {
      fileInputRef.current?.click();
      return;
    }
    uploadMutation.mutate(selectedFiles);
  };

  return (
    <WorkflowPanel
      title="Uploaded allergy chart library"
      description="Bring vendor and kitchen allergy charts directly into the active allergen workspace, then re-run product matching when inventory aliases improve."
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <WorkflowStatusPill tone={readyCount > 0 ? 'green' : 'amber'}>
            {readyCount} ready chart{readyCount === 1 ? '' : 's'}
          </WorkflowStatusPill>
          <button
            type="button"
            onClick={() => documentsQuery.refetch()}
            disabled={documentsQuery.isFetching}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${documentsQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={uploadMutation.isPending}
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <UploadCloud className="h-4 w-4" />
            {uploadMutation.isPending ? 'Uploading...' : selectedFiles.length === 0 ? 'Choose charts' : `Upload ${selectedFiles.length}`}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}
    >
      <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white p-2 text-slate-700 shadow-sm">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-950">Chart intake</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Upload PDFs or images. Parsed products land in the document-product review queue and can be matched back to inventory items.
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {selectedFiles.length > 0
              ? `${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} selected: ${selectedFiles.map((file) => file.name).join(', ')}`
              : 'No chart files selected yet.'}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MiniMetric label="Stored charts" value={documents.length} />
            <MiniMetric label="Parsed products" value={productCount} tone="blue" />
          </div>
          {lastReprocess ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Last reprocess: {lastReprocess.inserted_match_count} match{lastReprocess.inserted_match_count === 1 ? '' : 'es'} inserted, {lastReprocess.locked_product_count} locked product{lastReprocess.locked_product_count === 1 ? '' : 's'} skipped.
              {lastReprocess.skipped_reason ? ` ${lastReprocess.skipped_reason}.` : ''}
            </div>
          ) : null}
        </div>

        {documentsQuery.isLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-600">Loading allergy charts...</div>
        ) : documentsQuery.isError ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900">
            {documentsQuery.error instanceof Error ? documentsQuery.error.message : 'Unable to load allergy charts.'}
          </div>
        ) : documents.length === 0 ? (
          <WorkflowEmptyState
            title="No allergy charts uploaded"
            body="Upload the first vendor or kitchen chart to start matching chart products against inventory."
          />
        ) : (
          <div className="space-y-3">
            {documents.map((document) => (
              <DocumentCard
                key={document.id}
                document={document}
                deleting={deleteMutation.isPending}
                reprocessing={reprocessMutation.isPending}
                onDelete={() => deleteMutation.mutate(document.id)}
                onReprocess={() => reprocessMutation.mutate(document.id)}
              />
            ))}
          </div>
        )}
      </div>
    </WorkflowPanel>
  );
}

function DocumentCard({
  document,
  deleting,
  reprocessing,
  onDelete,
  onReprocess,
}: {
  document: AllergyDocumentPayload;
  deleting: boolean;
  reprocessing: boolean;
  onDelete: () => void;
  onReprocess: () => void;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-950">{document.filename}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">
            {document.page_count} page{document.page_count === 1 ? '' : 's'} • {document.product_count} product{document.product_count === 1 ? '' : 's'} • {document.chunk_count} chunk{document.chunk_count === 1 ? '' : 's'} • {formatDate(document.created_at)}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <WorkflowStatusPill tone={document.status === 'ready' ? 'green' : 'red'}>{document.status}</WorkflowStatusPill>
            {document.venue_id ? <WorkflowStatusPill tone="blue">venue #{document.venue_id}</WorkflowStatusPill> : <WorkflowStatusPill tone="slate">global</WorkflowStatusPill>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/allergens/documents/${document.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <ArrowUpRight className="h-4 w-4" />
            Review
          </Link>
          <button
            type="button"
            onClick={onReprocess}
            disabled={reprocessing}
            className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${reprocessing ? 'animate-spin' : ''}`} />
            Reprocess
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function MiniMetric({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'blue' }) {
  const toneClass = tone === 'blue'
    ? 'border-sky-200 bg-sky-50 text-sky-950'
    : 'border-slate-200 bg-white text-slate-950';

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-current/60">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}
