import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileText, MessageSquare, ShieldAlert, Trash2, UploadCloud } from 'lucide-react';
import { api, type AllergyChatResponsePayload, type AllergyDocumentPayload } from '../api';
import { useVenueContext } from '../contexts/VenueContext';
import { useToast } from '../contexts/ToastContext';

export function AllergyAssistant() {
  const { selectedVenueId } = useVenueContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [question, setQuestion] = useState('A guest has a guava allergy. What can they eat on the menu, what should they avoid, and what needs kitchen confirmation?');
  const [chatResponse, setChatResponse] = useState<AllergyChatResponsePayload | null>(null);

  const documentsQuery = useQuery({
    queryKey: ['allergy-documents', selectedVenueId ?? 'all'],
    queryFn: () => api.allergyAssistant.listDocuments(selectedVenueId),
  });

  const uploadMutation = useMutation({
    mutationFn: (uploadFiles: File[]) => api.allergyAssistant.uploadDocuments(uploadFiles, selectedVenueId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['allergy-documents'] });
      setFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      toast(`Uploaded ${data.documents.length} allergy chart${data.documents.length === 1 ? '' : 's'}.`, 'success');
    },
    onError: (error: Error) => {
      toast(`Upload failed: ${error.message}`, 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: number) => api.allergyAssistant.deleteDocument(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allergy-documents'] });
      toast('Allergy chart removed.', 'success');
    },
    onError: (error: Error) => {
      toast(`Delete failed: ${error.message}`, 'error');
    },
  });

  const askMutation = useMutation({
    mutationFn: (input: { question: string; document_ids?: number[] }) =>
      api.allergyAssistant.ask({
        question: input.question,
        venue_id: selectedVenueId,
        document_ids: input.document_ids,
      }),
    onSuccess: (data) => {
      setChatResponse(data);
    },
    onError: (error: Error) => {
      toast(`Chat failed: ${error.message}`, 'error');
    },
  });

  const documents = documentsQuery.data?.documents ?? [];
  const readyDocumentIds = useMemo(
    () => documents.filter((document) => document.status === 'ready').map((document) => document.id),
    [documents],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Chef Safety Assistant</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Allergy chart upload and menu chat</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Upload vendor or kitchen allergy charts, keep them scoped to the current venue, and ask grounded menu questions like whether a guest with a specific allergy can safely order a promoted dish.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="font-semibold">Current menu source</div>
            <div className="mt-1">Answers are checked against promoted <span className="font-medium">dish</span> recipes, not the deleted legacy menu model.</div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Upload allergy charts</h2>
                <p className="text-sm text-slate-600">PDF, PNG, JPEG, and WebP are supported. PDFs are chunked page by page for grounded retrieval.</p>
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                multiple
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                className="sr-only"
              />
              <input
                type="text"
                readOnly
                value={files.length > 0 ? files.map((file) => file.name).join(', ') : 'No files selected yet'}
                className="block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
              />
              <div className="mt-3 text-xs text-slate-500">
                Use venue-scoped charts whenever possible so the chef chat stays grounded in the right menu context.
              </div>
              {files.length > 0 && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  {files.length} file{files.length === 1 ? '' : 's'} queued: {files.map((file) => file.name).join(', ')}
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (uploadMutation.isPending) {
                      return;
                    }
                    if (files.length === 0) {
                      fileInputRef.current?.click();
                      return;
                    }
                    uploadMutation.mutate(files);
                  }}
                  disabled={uploadMutation.isPending}
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {uploadMutation.isPending ? 'Uploading charts...' : files.length === 0 ? 'Choose allergy charts' : 'Upload charts'}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Stored allergy charts</h2>
                <p className="text-sm text-slate-600">These documents are the evidence base the chef chat uses before it answers.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {documentsQuery.isLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  Loading allergy chart library...
                </div>
              ) : documents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  No allergy charts have been uploaded for this venue context yet.
                </div>
              ) : (
                documents.map((document) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    deleting={deleteMutation.isPending}
                    onDelete={() => deleteMutation.mutate(document.id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Ask the chef chat</h2>
                <p className="text-sm text-slate-600">The answer is grounded in uploaded chart chunks plus promoted dish recipes in the current venue context.</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={5}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                placeholder="A guest has a guava allergy. What can they eat on the menu and what should they avoid?"
              />
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  {readyDocumentIds.length} ready chart{readyDocumentIds.length === 1 ? '' : 's'} in scope
                </div>
                <button
                  type="button"
                  onClick={() => askMutation.mutate({ question, document_ids: readyDocumentIds })}
                  disabled={!question.trim() || askMutation.isPending || readyDocumentIds.length === 0}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {askMutation.isPending ? 'Checking menu...' : 'Ask allergy chat'}
                </button>
              </div>
            </div>
          </div>

          {chatResponse ? (
            <div className="space-y-6">
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Grounded answer</div>
                    <h3 className="mt-2 text-xl font-semibold text-slate-950">
                      {chatResponse.allergen_focus ? `${chatResponse.allergen_focus} review` : 'Allergy review'}
                    </h3>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {chatResponse.cited_chunks.length} cited chunk{chatResponse.cited_chunks.length === 1 ? '' : 's'}
                  </div>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{chatResponse.answer_markdown}</p>
              </div>

              <ClassificationPanel
                title="Safe to serve"
                description="Only items with explicit support from the uploaded charts belong here."
                icon={<ShieldAlert className="h-5 w-5" />}
                tone="emerald"
                items={chatResponse.safe_items}
              />
              <ClassificationPanel
                title="Avoid"
                description="These items are directly implicated by the chart evidence for the asked allergy."
                icon={<AlertTriangle className="h-5 w-5" />}
                tone="rose"
                items={chatResponse.avoid_items}
              />
              <ClassificationPanel
                title="Ask kitchen"
                description="Ambiguous or may-contain items that need explicit kitchen confirmation."
                icon={<AlertTriangle className="h-5 w-5" />}
                tone="amber"
                items={chatResponse.caution_items}
              />
              <ClassificationPanel
                title="Unknown coverage"
                description="The uploaded charts did not support a grounded conclusion for these items."
                icon={<FileText className="h-5 w-5" />}
                tone="slate"
                items={chatResponse.unknown_items}
              />

              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Cited chart evidence</div>
                <div className="mt-4 space-y-3">
                  {chatResponse.cited_chunks.map((chunk) => (
                    <div key={chunk.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs font-medium text-slate-600">
                        Document #{chunk.document_id} • page {chunk.page_number} • chunk {chunk.chunk_index + 1}
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{chunk.chunk_text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
              Upload at least one allergy chart, then ask a chef-style question. The page will return grounded menu guidance with evidence chunks instead of a generic chatbot answer.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DocumentCard({
  document,
  deleting,
  onDelete,
}: {
  document: AllergyDocumentPayload;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="text-sm font-semibold text-slate-950">{document.filename}</div>
        <div className="mt-1 text-xs text-slate-500">
          {document.page_count} page{document.page_count === 1 ? '' : 's'} • {document.chunk_count} chunk{document.chunk_count === 1 ? '' : 's'} • {document.mime_type}
        </div>
        <div className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
          {document.status}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Trash2 className="h-4 w-4" />
        Remove
      </button>
    </div>
  );
}

function ClassificationPanel({
  title,
  description,
  icon,
  tone,
  items,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  tone: 'emerald' | 'rose' | 'amber' | 'slate';
  items: AllergyChatResponsePayload['safe_items'];
}) {
  const toneStyles = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    slate: 'border-slate-200 bg-slate-50 text-slate-800',
  } as const;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${toneStyles[tone]}`}>
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
            No items in this classification for the current answer.
          </div>
        ) : (
          items.map((item) => (
            <div key={`${title}-${item.recipe_version_id}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-950">{item.recipe_name}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">{item.rationale}</div>
                </div>
                <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
                  v{item.recipe_version_id}
                </div>
              </div>
              {item.evidence_chunk_ids.length > 0 && (
                <div className="mt-3 text-xs text-slate-500">
                  Evidence chunks: {item.evidence_chunk_ids.join(', ')}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
