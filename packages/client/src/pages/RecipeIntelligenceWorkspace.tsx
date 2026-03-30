import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useVenueContext } from '../contexts/VenueContext';
import { useToast } from '../contexts/ToastContext';
import {
  useCreateConversationDrafts,
  useDeleteRecipeIntelligenceCaptureInput,
  useDeleteRecipeIntelligencePrepSheetCapture,
  useDeleteRecipeIntelligenceSession,
  useRecipeDraftSourceIntelligence,
  useRecipeIntelligenceSession,
  useRecipeIntelligenceSessions,
  useUploadPhotoDrafts,
  useUploadPrepSheetCapture,
} from '../hooks/useRecipeIntelligence';
import {
  WorkflowEmptyState,
  WorkflowPage,
  WorkflowPanel,
  WorkflowStatusPill,
} from '../components/workflow/WorkflowPrimitives';

export function RecipeIntelligenceWorkspace() {
  const { selectedVenueId } = useVenueContext();
  const { toast } = useToast();
  const [conversationSessionName, setConversationSessionName] = useState('');
  const [conversationEntries, setConversationEntries] = useState<Array<{ id: number; name: string; description: string }>>([
    { id: 1, name: '', description: '' },
  ]);
  const [operatorName, setOperatorName] = useState('');
  const [photoSessionName, setPhotoSessionName] = useState('');
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [prepSessionName, setPrepSessionName] = useState('');
  const [prepCaptureDate, setPrepCaptureDate] = useState(new Date().toISOString().slice(0, 10));
  const [prepFile, setPrepFile] = useState<File | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);

  const sessionsQuery = useRecipeIntelligenceSessions({
    venue_id: selectedVenueId ?? undefined,
  });
  const selectedSessionQuery = useRecipeIntelligenceSession(selectedSessionId ?? 0);
  const selectedDraftSourceQuery = useRecipeDraftSourceIntelligence(selectedDraftId ?? 0);
  const createConversationDrafts = useCreateConversationDrafts();
  const uploadPhotoDrafts = useUploadPhotoDrafts();
  const uploadPrepSheetCapture = useUploadPrepSheetCapture();
  const deleteSession = useDeleteRecipeIntelligenceSession();
  const deleteCaptureInput = useDeleteRecipeIntelligenceCaptureInput();
  const deletePrepSheetCapture = useDeleteRecipeIntelligencePrepSheetCapture();

  const sessions = sessionsQuery.data ?? [];
  const selectedSession = selectedSessionQuery.data ?? null;
  const selectedSource = selectedDraftSourceQuery.data ?? null;

  useEffect(() => {
    if (selectedSessionId != null) {
      return;
    }
    if (sessions.length > 0) {
      setSelectedSessionId(Number(sessions[0].id));
    }
  }, [sessions, selectedSessionId]);

  useEffect(() => {
    if (selectedDraftId == null || !selectedSession) {
      return;
    }
    const draftStillExists = selectedSession.drafts.some((draft) => Number(draft.id) === selectedDraftId);
    if (!draftStillExists) {
      setSelectedDraftId(null);
    }
  }, [selectedDraftId, selectedSession]);

  const sortedDrafts = useMemo(
    () => (selectedSession?.drafts ?? []).slice().sort((a, b) => Number(b.id) - Number(a.id)),
    [selectedSession?.drafts],
  );

  async function handleConversationSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVenueId) {
      toast('Select a venue before creating conversation drafts.');
      return;
    }
    const entries = conversationEntries
      .map((entry) => ({
        name: entry.name.trim(),
        description: entry.description.trim(),
      }))
      .filter((entry) => entry.name.length > 0 && entry.description.length > 0);
    if (entries.length === 0) {
      toast('At least one recipe name and description pair is required.');
      return;
    }

    try {
      const result = await createConversationDrafts.mutateAsync({
        venue_id: selectedVenueId,
        session_name: conversationSessionName.trim() || null,
        created_by: operatorName.trim() || null,
        entries,
      });
      setSelectedSessionId(Number(result.session.id));
      setSelectedDraftId(Number(result.drafts[0]?.draft_id ?? 0) || null);
      setConversationEntries([{ id: 1, name: '', description: '' }]);
      setConversationSessionName('');
      toast(`Created ${result.drafts.length} draft${result.drafts.length === 1 ? '' : 's'} from conversation input.`);
    } catch (error: any) {
      toast(error.message ?? 'Failed to create conversation draft.');
    }
  }

  async function handlePhotoSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVenueId) {
      toast('Select a venue before uploading recipe photos.');
      return;
    }
    if (photoFiles.length === 0) {
      toast('Choose at least one recipe image or PDF.');
      return;
    }

    try {
      const result = await uploadPhotoDrafts.mutateAsync({
        files: photoFiles,
        venue_id: selectedVenueId,
        session_name: photoSessionName.trim() || null,
        created_by: operatorName.trim() || null,
      });
      setSelectedSessionId(Number(result.session.id));
      setSelectedDraftId(Number(result.drafts[0]?.draft_id ?? 0) || null);
      setPhotoFiles([]);
      setPhotoSessionName('');
      const input = document.getElementById('recipe-intelligence-photo-input') as HTMLInputElement | null;
      if (input) {
        input.value = '';
      }
      toast(`Created ${result.drafts.length} draft${result.drafts.length === 1 ? '' : 's'} from uploaded photo evidence.`);
    } catch (error: any) {
      toast(error.message ?? 'Failed to create photo drafts.');
    }
  }

  async function handlePrepSheetSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVenueId) {
      toast('Select a venue before uploading a prep sheet.');
      return;
    }
    if (!prepFile) {
      toast('Choose a prep sheet PDF or image.');
      return;
    }

    try {
      const result = await uploadPrepSheetCapture.mutateAsync({
        file: prepFile,
        venue_id: selectedVenueId,
        capture_date: prepCaptureDate,
        session_name: prepSessionName.trim() || null,
        created_by: operatorName.trim() || null,
      });
      setSelectedSessionId(Number(result.session.id));
      setSelectedDraftId(Number(result.drafts[0]?.draft_id ?? 0) || null);
      setPrepFile(null);
      setPrepSessionName('');
      const input = document.getElementById('recipe-intelligence-prep-input') as HTMLInputElement | null;
      if (input) {
        input.value = '';
      }
      toast(`Created ${result.drafts.length} prep draft${result.drafts.length === 1 ? '' : 's'} from prep sheet capture.`);
    } catch (error: any) {
      toast(error.message ?? 'Failed to create prep sheet capture.');
    }
  }

  async function handleDeleteSession(sessionId: number) {
    try {
      await deleteSession.mutateAsync(sessionId);
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
        setSelectedDraftId(null);
      }
      toast('Capture session deleted. Drafts were left intact.');
    } catch (error: any) {
      toast(error.message ?? 'Failed to delete capture session.');
    }
  }

  async function handleDeleteCaptureInput(inputId: number) {
    try {
      await deleteCaptureInput.mutateAsync(inputId);
      toast('Capture input deleted.');
    } catch (error: any) {
      toast(error.message ?? 'Failed to delete capture input.');
    }
  }

  async function handleDeletePrepCapture(captureId: number) {
    try {
      await deletePrepSheetCapture.mutateAsync(captureId);
      toast('Prep sheet capture deleted.');
    } catch (error: any) {
      toast(error.message ?? 'Failed to delete prep sheet capture.');
    }
  }

  return (
    <WorkflowPage
      eyebrow="Recipe Intelligence"
      title="Capture draft recipes from chef descriptions and recipe cards without leaving the builder workflow."
      description="This surface launches intelligence-assisted draft creation, tracks capture sessions, and exposes the stored source-confidence record behind each generated draft."
      actions={(
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/recipes"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Back to Recipes
          </Link>
        </div>
      )}
    >
      {!selectedVenueId ? (
        <WorkflowEmptyState
          title="Select a venue to start recipe intelligence capture"
          body="Conversation capture and photo draft creation are venue-scoped. Pick the target venue from the workspace selector, then return here."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-3">
            <WorkflowPanel
              title="Describe Recipe"
              description="Capture multiple chef-described dishes in one conversation session, then let the existing recipe builder parse and resolve each draft."
            >
              <form className="space-y-4" onSubmit={handleConversationSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Session Name
                    <input
                      value={conversationSessionName}
                      onChange={(event) => setConversationSessionName(event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                      placeholder="Dinner blitz"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Operator Name
                    <input
                      value={operatorName}
                      onChange={(event) => setOperatorName(event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                      placeholder="Chef, sous, or operator"
                    />
                  </label>
                </div>
                <div className="space-y-3">
                  {conversationEntries.map((entry, index) => (
                    <div key={entry.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recipe Entry {index + 1}</div>
                        {conversationEntries.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setConversationEntries((current) => current.filter((candidate) => candidate.id !== entry.id))}
                            className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 transition hover:border-slate-400 hover:bg-slate-100"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-3 grid gap-3">
                        <label className="text-sm font-medium text-slate-700">
                          Recipe Name
                          <input
                            value={entry.name}
                            onChange={(event) => setConversationEntries((current) => current.map((candidate) => (
                              candidate.id === entry.id ? { ...candidate, name: event.target.value } : candidate
                            )))}
                            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                            placeholder="Miso Butterfish"
                          />
                        </label>
                        <label className="text-sm font-medium text-slate-700">
                          Chef Description
                          <textarea
                            value={entry.description}
                            onChange={(event) => setConversationEntries((current) => current.map((candidate) => (
                              candidate.id === entry.id ? { ...candidate, description: event.target.value } : candidate
                            )))}
                            rows={4}
                            className="mt-1 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
                            placeholder="Butterfish with miso glaze, white rice, bok choy, and sesame oil finish."
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setConversationEntries((current) => [
                      ...current,
                      {
                        id: Math.max(...current.map((entry) => entry.id)) + 1,
                        name: '',
                        description: '',
                      },
                    ])}
                    className="rounded-full border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-50"
                  >
                    Add Another Recipe
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
                  <p className="text-sm text-slate-500">
                    The AI creates draft seeds only. Builder parsing, canonical resolution, and review still happen in FIFOFlow.
                  </p>
                  <button
                    type="submit"
                    disabled={createConversationDrafts.isPending}
                    className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  >
                    {createConversationDrafts.isPending ? 'Creating Drafts...' : 'Create Drafts From Conversation'}
                  </button>
                </div>
              </form>
            </WorkflowPanel>

            <WorkflowPanel
              title="Upload Recipe Photo"
              description="Upload recipe cards, prep sheets, or chef snapshots and convert visible recipe evidence into builder drafts."
            >
              <form className="space-y-4" onSubmit={handlePhotoSubmit}>
                <label className="block text-sm font-medium text-slate-700">
                  Session Name
                  <input
                    value={photoSessionName}
                    onChange={(event) => setPhotoSessionName(event.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-amber-400"
                    placeholder="Recipe card upload"
                  />
                </label>
                <label className="block rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-medium text-slate-700">
                  Recipe Images or PDFs
                  <input
                    id="recipe-intelligence-photo-input"
                    type="file"
                    accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                    multiple
                    onChange={(event) => setPhotoFiles(Array.from(event.target.files ?? []))}
                    className="mt-3 block w-full text-sm text-slate-600"
                  />
                  <div className="mt-3 space-y-2 text-xs text-slate-500">
                    {photoFiles.length === 0 ? (
                      <div>No files selected.</div>
                    ) : photoFiles.map((file) => (
                      <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                        <span className="truncate text-slate-700">{file.name}</span>
                        <span>{Math.max(1, Math.round(file.size / 1024))} KB</span>
                      </div>
                    ))}
                  </div>
                </label>
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
                  <p className="text-sm text-slate-500">
                    Uploaded photos become capture inputs, session records, and draft source evidence tied to each generated job.
                  </p>
                  <button
                    type="submit"
                    disabled={uploadPhotoDrafts.isPending}
                    className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-200"
                  >
                    {uploadPhotoDrafts.isPending ? 'Extracting Drafts...' : 'Create Drafts From Files'}
                  </button>
                </div>
              </form>
            </WorkflowPanel>

            <WorkflowPanel
              title="Upload Prep Sheet"
              description="Parse a prep sheet into reusable prep-component drafts and keep the capture linked to the same intelligence session model."
            >
              <form className="space-y-4" onSubmit={handlePrepSheetSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Session Name
                    <input
                      value={prepSessionName}
                      onChange={(event) => setPrepSessionName(event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400"
                      placeholder="Dinner prep sheet"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Capture Date
                    <input
                      type="date"
                      value={prepCaptureDate}
                      onChange={(event) => setPrepCaptureDate(event.target.value)}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400"
                    />
                  </label>
                </div>
                <label className="block rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-medium text-slate-700">
                  Prep Sheet File
                  <input
                    id="recipe-intelligence-prep-input"
                    type="file"
                    accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                    onChange={(event) => setPrepFile(event.target.files?.[0] ?? null)}
                    className="mt-3 block w-full text-sm text-slate-600"
                  />
                  <div className="mt-3 text-xs text-slate-500">
                    {prepFile ? `${prepFile.name} • ${Math.max(1, Math.round(prepFile.size / 1024))} KB` : 'No prep sheet selected.'}
                  </div>
                </label>
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
                  <p className="text-sm text-slate-500">
                    Prep sheets create prep-component drafts, inferred usage hints, and a persisted prep capture record under the session.
                  </p>
                  <button
                    type="submit"
                    disabled={uploadPrepSheetCapture.isPending}
                    className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  >
                    {uploadPrepSheetCapture.isPending ? 'Parsing Prep Sheet...' : 'Create Prep Drafts'}
                  </button>
                </div>
              </form>
            </WorkflowPanel>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
            <WorkflowPanel
              title="Recent Capture Sessions"
              description="Sessions are the operator-facing record of recipe intelligence work for the selected venue."
            >
              {sessionsQuery.isLoading ? (
                <div className="text-sm text-slate-500">Loading sessions...</div>
              ) : sessions.length === 0 ? (
                <WorkflowEmptyState
                  title="No recipe intelligence sessions yet"
                  body="Start with a chef description or upload a recipe photo to create the first captured session for this venue."
                />
              ) : (
                <div className="space-y-3">
                  {sessions.map((session) => {
                    const isSelected = Number(session.id) === selectedSessionId;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => setSelectedSessionId(Number(session.id))}
                        className={`w-full rounded-3xl border px-4 py-4 text-left transition ${
                          isSelected
                            ? 'border-emerald-300 bg-emerald-50'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{session.capture_mode.replace('_', ' ')}</div>
                            <div className="mt-1 text-base font-semibold text-slate-950">{session.name || `Session ${session.id}`}</div>
                            <div className="mt-1 text-sm text-slate-500">Started {new Date(session.started_at).toLocaleString()}</div>
                          </div>
                          <WorkflowStatusPill tone={session.completed_at ? 'slate' : 'blue'}>
                            {session.completed_at ? 'Completed' : 'Open'}
                          </WorkflowStatusPill>
                        </div>
                        <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
                          <div>Inputs: <span className="font-semibold text-slate-900">{session.total_inputs}</span></div>
                          <div>Drafts: <span className="font-semibold text-slate-900">{session.total_drafts_created}</span></div>
                          <div>Ready: <span className="font-semibold text-slate-900">{session.total_needs_review}</span></div>
                          <div>Approved: <span className="font-semibold text-slate-900">{session.total_approved}</span></div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </WorkflowPanel>

            <WorkflowPanel
              title="Session Detail"
              description="Inspect the generated drafts and the intelligence metadata behind the currently selected capture session."
            >
              {selectedSessionId == null ? (
                <WorkflowEmptyState
                  title="Choose a capture session"
                  body="Select any session from the left-hand list to inspect the generated drafts and stored source evidence."
                />
              ) : selectedSessionQuery.isLoading ? (
                <div className="text-sm text-slate-500">Loading session detail...</div>
              ) : !selectedSession ? (
                <WorkflowEmptyState
                  title="Session detail is unavailable"
                  body="The selected session could not be loaded. Refresh the page and try again."
                />
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Selected Session</div>
                      <div className="mt-1 text-lg font-semibold text-slate-950">
                        {selectedSession.session.name || `Session #${selectedSession.session.id}`}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {selectedSession.session.capture_mode.replace(/_/g, ' ')} • led by {selectedSession.session.led_by || 'unknown operator'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteSession(Number(selectedSession.session.id))}
                      disabled={deleteSession.isPending}
                      className="rounded-full border border-rose-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deleteSession.isPending ? 'Deleting…' : 'Delete Session'}
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Metric label="Inputs" value={selectedSession.session.total_inputs} />
                    <Metric label="Drafts" value={selectedSession.session.total_drafts_created} />
                    <Metric label="Ready" value={selectedSession.session.total_needs_review} />
                    <Metric label="Time Saved" value={`${selectedSession.session.estimated_time_saved_minutes} min`} />
                  </div>
                  {selectedSession.inputs.length > 0 ? (
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Capture Inputs</div>
                      <div className="mt-3 space-y-2">
                        {selectedSession.inputs.map((input) => (
                          <div key={input.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                            <div>
                              <div className="font-semibold text-slate-950">
                                {input.source_file_name || input.source_text?.split(':')[0] || `Capture input #${input.id}`}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {input.input_type.replace(/_/g, ' ')} • {input.parse_status.toLowerCase()} • input #{input.id}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteCaptureInput(Number(input.id))}
                              disabled={deleteCaptureInput.isPending}
                              className="rounded-full border border-rose-300 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deleteCaptureInput.isPending ? 'Deleting…' : 'Delete Capture'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {selectedSession.prep_sheet_captures.length > 0 ? (
                    <div className="rounded-3xl border border-blue-200 bg-blue-50 px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Prep Sheet Captures</div>
                      <div className="mt-3 space-y-2">
                        {selectedSession.prep_sheet_captures.map((capture) => (
                          <div key={capture.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-blue-200 bg-white px-3 py-3 text-sm text-slate-700">
                            <div>
                              <div className="font-semibold text-slate-950">{capture.source_file_name}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {capture.capture_date} • {capture.processed ? 'processed' : 'pending'} • session #{capture.recipe_capture_session_id}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeletePrepCapture(Number(capture.id))}
                              disabled={deletePrepSheetCapture.isPending}
                              className="rounded-full border border-rose-300 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletePrepSheetCapture.isPending ? 'Deleting…' : 'Delete Capture'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-3">
                    {sortedDrafts.length === 0 ? (
                      <WorkflowEmptyState
                        title="No drafts in this session yet"
                        body="This session exists, but no recipe builder drafts have been attached to it yet."
                      />
                    ) : sortedDrafts.map((draft) => (
                      <div key={draft.id} className="rounded-3xl border border-slate-200 bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold text-slate-950">{draft.draft_name}</div>
                            <div className="mt-1 text-sm text-slate-500">
                              {draft.source_recipe_type ?? 'draft'} • {draft.ingredient_row_count} ingredient rows • {draft.costability_status.toLowerCase().replace('_', ' ')}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <WorkflowStatusPill tone={draft.completeness_status === 'READY' ? 'green' : draft.completeness_status === 'BLOCKED' ? 'red' : 'amber'}>
                              {draft.completeness_status}
                            </WorkflowStatusPill>
                            <button
                              type="button"
                              onClick={() => setSelectedDraftId(Number(draft.id))}
                              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                            >
                              Inspect Source
                            </button>
                            <Link
                              to={`/recipes/drafts/${draft.id}`}
                              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-slate-700"
                            >
                              Open Draft
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </WorkflowPanel>
          </div>

          <WorkflowPanel
            title="Draft Source Intelligence"
            description="Every generated draft keeps its capture origin, confidence record, assumptions, and follow-up questions in structured form."
          >
            {selectedDraftId == null ? (
              <WorkflowEmptyState
                title="Select a generated draft"
                body="Choose Inspect Source on any draft in the selected session to see the stored intelligence record."
              />
            ) : selectedDraftSourceQuery.isLoading ? (
              <div className="text-sm text-slate-500">Loading draft source intelligence...</div>
            ) : !selectedSource ? (
              <WorkflowEmptyState
                title="Draft source detail is unavailable"
                body="The selected draft source record could not be loaded."
              />
            ) : (
              <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
                <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Origin</div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">{selectedSource.source_intelligence.origin.replace('_', ' ')}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Confidence</div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">{selectedSource.source_intelligence.confidence_level} • {selectedSource.source_intelligence.confidence_score}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Raw Source</div>
                    <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                      {selectedSource.source_intelligence.raw_source || 'No raw source stored.'}
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ListBlock title="Assumptions" items={selectedSource.source_intelligence.assumptions} emptyLabel="No assumptions recorded." />
                  <ListBlock title="Follow-up Questions" items={selectedSource.source_intelligence.follow_up_questions} emptyLabel="No follow-up questions recorded." />
                  <ListBlock title="Parsing Issues" items={selectedSource.source_intelligence.parsing_issues} emptyLabel="No parsing issues recorded." />
                  <ListBlock title="Confidence Details" items={selectedSource.source_intelligence.confidence_details} emptyLabel="No confidence details recorded." />
                </div>
              </div>
            )}
          </WorkflowPanel>
        </div>
      )}
    </WorkflowPage>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function ListBlock({ title, items, emptyLabel }: { title: string; items: string[]; emptyLabel: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-slate-500">{emptyLabel}</div>
        ) : items.map((item) => (
          <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
