import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useVenueContext } from '../contexts/VenueContext';
import { useToast } from '../contexts/ToastContext';
import type { LunchMenuDayNutrition, LunchMenuParsedDay, LunchMenuParseResult } from '@fifoflow/shared';
import {
  useCreateLunchMenu,
  useDeleteLunchMenu,
  useGenerateLunchMenu,
  useImportLunchMenu,
  useLunchMenu,
  useLunchMenuCalendar,
  useLunchMenus,
  useUpdateLunchMenu,
  useUpdateLunchMenuDays,
  useUploadLunchMenuPdf,
} from '../hooks/useLunchMenus';
import {
  WorkflowEmptyState,
  WorkflowPage,
  WorkflowPanel,
  WorkflowStatusPill,
} from '../components/workflow/WorkflowPrimitives';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function LunchMenus() {
  const { selectedVenueId } = useVenueContext();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const generatePanelRef = useRef<HTMLDivElement | null>(null);
  const today = useMemo(() => new Date(), []);
  const [createYear, setCreateYear] = useState(today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear());
  const [createMonth, setCreateMonth] = useState(today.getMonth() === 11 ? 1 : today.getMonth() + 2);
  const [draftName, setDraftName] = useState('');
  const [historySourceIds, setHistorySourceIds] = useState<number[]>([]);
  const [historySelectionTouched, setHistorySelectionTouched] = useState(false);
  const [selectedMenuId, setSelectedMenuId] = useState<number | null>(null);
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);
  const [mainText, setMainText] = useState('');
  const [sideText, setSideText] = useState('');
  const [caloriesText, setCaloriesText] = useState('');
  const [proteinText, setProteinText] = useState('');
  const [fatText, setFatText] = useState('');
  const [sugarText, setSugarText] = useState('');
  const [parsedUpload, setParsedUpload] = useState<LunchMenuParseResult | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const menusQuery = useLunchMenus({ venue_id: selectedVenueId ?? undefined });
  const createMenu = useCreateLunchMenu();
  const generateMenu = useGenerateLunchMenu();
  const updateMenu = useUpdateLunchMenu();
  const updateDays = useUpdateLunchMenuDays();
  const deleteMenu = useDeleteLunchMenu();
  const uploadPdf = useUploadLunchMenuPdf();
  const importLunchMenu = useImportLunchMenu();

  const menus = menusQuery.data ?? [];
  const selectedMenuQuery = useLunchMenu(selectedMenuId ?? 0);
  const selectedCalendarQuery = useLunchMenuCalendar(selectedMenuId ?? 0);
  const selectedMenu = selectedMenuQuery.data ?? null;
  const selectedCalendar = selectedCalendarQuery.data ?? null;
  const selectedDay = useMemo(
    () => selectedCalendar?.weeks
      .flatMap((week) => week.days)
      .find((day) => !day.is_placeholder && day.date === selectedDayDate) ?? null,
    [selectedCalendar, selectedDayDate],
  );

  useEffect(() => {
    if (selectedMenuId != null && menus.some((menu) => menu.id === selectedMenuId)) {
      return;
    }
    setSelectedMenuId(menus[0]?.id ?? null);
  }, [menus, selectedMenuId]);

  useEffect(() => {
    setHistorySourceIds((current) => {
      const available = menus.map((menu) => menu.id);
      const filtered = current.filter((menuId) => available.includes(menuId));
      if (!historySelectionTouched) {
        return available;
      }
      return filtered;
    });
  }, [historySelectionTouched, menus]);

  useEffect(() => {
    const firstDay = selectedCalendar?.weeks
      .flatMap((week) => week.days)
      .find((day) => !day.is_placeholder)?.date ?? null;
    if (!selectedCalendar) {
      setSelectedDayDate(null);
      return;
    }
    if (!selectedDayDate || !selectedCalendar.weeks.some((week) => week.days.some((day) => !day.is_placeholder && day.date === selectedDayDate))) {
      setSelectedDayDate(firstDay);
    }
  }, [selectedCalendar, selectedDayDate]);

  useEffect(() => {
    if (!selectedDay) {
      setMainText('');
      setSideText('');
      setCaloriesText('');
      setProteinText('');
      setFatText('');
      setSugarText('');
      return;
    }
    setMainText(selectedDay.main_dishes.join('\n'));
    setSideText(selectedDay.sides.join('\n'));
    setCaloriesText(selectedDay.nutrition?.calories ? String(selectedDay.nutrition.calories) : '');
    setProteinText(selectedDay.nutrition?.protein_g ? String(selectedDay.nutrition.protein_g) : '');
    setFatText(selectedDay.nutrition?.fat_g ? String(selectedDay.nutrition.fat_g) : '');
    setSugarText(selectedDay.nutrition?.sugar_g ? String(selectedDay.nutrition.sugar_g) : '');
  }, [selectedDay]);

  async function handleCreateMenu(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVenueId) {
      toast('Select a venue before creating a lunch menu.', 'error');
      return;
    }

    try {
      const menu = await createMenu.mutateAsync({
        venue_id: selectedVenueId,
        year: createYear,
        month: createMonth,
        name: draftName.trim() || null,
      });
      setSelectedMenuId(menu.id);
      setDraftName('');
      toast('Lunch menu created.', 'success');
    } catch (error: any) {
      toast(error.message ?? 'Failed to create lunch menu.', 'error');
    }
  }

  async function handleGenerateFromHistory() {
    if (!selectedVenueId) {
      toast('Select a venue before generating a lunch menu.', 'error');
      return;
    }
    if (historySourceIds.length === 0) {
      toast('Choose at least one historical lunch menu as a source.', 'error');
      return;
    }

    try {
      const result = await generateMenu.mutateAsync({
        venue_id: selectedVenueId,
        year: createYear,
        month: createMonth,
        source_menu_ids: historySourceIds,
        name: draftName.trim() || null,
        notes: null,
      });
      setSelectedMenuId(result.menu.id);
      toast(`Generated ${result.patterns_info.generated_days} weekdays from ${result.patterns_info.source_menu_count} historical menu${result.patterns_info.source_menu_count === 1 ? '' : 's'}.`, 'success');
    } catch (error: any) {
      toast(error.message ?? 'Failed to generate lunch menu from history.', 'error');
    }
  }

  async function handleStatusUpdate(status: 'published' | 'archived') {
    if (!selectedMenu) {
      return;
    }
    try {
      await updateMenu.mutateAsync({ menuId: selectedMenu.id, data: { status } });
      toast(status === 'published' ? 'Lunch menu published.' : 'Lunch menu archived.', 'success');
    } catch (error: any) {
      toast(error.message ?? 'Failed to update lunch menu status.', 'error');
    }
  }

  async function handleDeleteMenu() {
    if (!selectedMenu) {
      return;
    }
    try {
      await deleteMenu.mutateAsync(selectedMenu.id);
      setSelectedMenuId(null);
      toast('Lunch menu deleted.', 'success');
    } catch (error: any) {
      toast(error.message ?? 'Failed to delete lunch menu.', 'error');
    }
  }

  async function handlePickedFile(file: File) {
    try {
      const parsed = await uploadPdf.mutateAsync(file);
      setParsedUpload(parsed);
      setUploadedFileName(file.name);
      toast(`Parsed ${parsed.days.length} lunch-menu day${parsed.days.length === 1 ? '' : 's'} from ${file.name}.`, 'success');
    } catch (error: any) {
      toast(error.message ?? 'Failed to parse lunch menu PDF.', 'error');
    }
  }

  async function handleImportParsedUpload() {
    if (!selectedVenueId || !parsedUpload) {
      return;
    }

    try {
      const result = await importLunchMenu.mutateAsync({
        menu_id: selectedMenu && selectedMenu.year === parsedUpload.year && selectedMenu.month === parsedUpload.month
          ? selectedMenu.id
          : undefined,
        venue_id: selectedVenueId,
        year: parsedUpload.year,
        month: parsedUpload.month,
        name: selectedMenu?.year === parsedUpload.year && selectedMenu.month === parsedUpload.month
          ? selectedMenu.name
          : `${MONTH_NAMES[parsedUpload.month - 1]} ${parsedUpload.year} Lunch Menu`,
        notes: selectedMenu?.notes ?? null,
        replace_existing: true,
        parsed_days: parsedUpload.days,
      });
      setSelectedMenuId(result.menu.id);
      setParsedUpload(null);
      setUploadedFileName(null);
      toast('Lunch menu imported into FIFOFlow.', 'success');
    } catch (error: any) {
      toast(error.message ?? 'Failed to import parsed lunch menu.', 'error');
    }
  }

  function updateParsedDay(date: string, updater: (day: LunchMenuParsedDay) => LunchMenuParsedDay) {
    setParsedUpload((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        days: current.days.map((day) => (day.date === date ? updater(day) : day)),
      };
    });
  }

  async function handleSaveDayEdits(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMenu || !selectedDayDate) {
      return;
    }

    try {
      await updateDays.mutateAsync({
        menuId: selectedMenu.id,
        data: {
          days: [{
            date: selectedDayDate,
            mains: parseEditorLines(mainText).map((dish_name) => ({ dish_name })),
            sides: parseEditorLines(sideText).map((dish_name) => ({ dish_name })),
            nutrition: buildNutritionPayload(caloriesText, proteinText, fatText, sugarText),
          }],
        },
      });
      toast('Day updated.', 'success');
    } catch (error: any) {
      toast(error.message ?? 'Failed to save day edits.', 'error');
    }
  }

  function handleExportPdf() {
    if (!selectedMenu) {
      return;
    }
    window.open(api.lunchMenus.exportPdfUrl(selectedMenu.id), '_blank', 'noopener,noreferrer');
  }

  if (!selectedVenueId) {
    return (
      <WorkflowPage
        eyebrow="Lunch Menus"
        title="Monthly lunch menus are venue-scoped so each operation keeps its own calendar and export history."
        description="Choose a venue first. Once a venue is in scope, this workspace can hold the imported, generated, and manually edited lunch menu for that month."
        actions={(
          <Link
            to="/recipes"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Back to Recipes
          </Link>
        )}
      >
        <WorkflowEmptyState
          title="Select a venue to begin"
          body="Lunch menus should stay tied to the operation they belong to. Pick a venue in the global selector, then come back here to create the first monthly menu."
        />
      </WorkflowPage>
    );
  }

  return (
    <WorkflowPage
      eyebrow="Lunch Menus"
      title="Bring SOH-style monthly lunch menu planning into FIFOFlow without creating a second recipe system."
      description="This workspace now supports PDF parsing, venue-scoped month imports, day-level editing, and branded PDF export from the same FIFOFlow menu record."
      actions={(
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handlePickedFile(file);
              }
              event.currentTarget.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadPdf.isPending}
            className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-emerald-200 disabled:text-emerald-300"
          >
            {uploadPdf.isPending ? 'Parsing PDF...' : 'Upload PDF'}
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!selectedMenu}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => generatePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
          >
            Generate from history
          </button>
          <Link
            to="/recipes"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Back to Recipes
          </Link>
        </div>
      )}
    >
      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-6">
          <WorkflowPanel
            title="Create Month"
            description="Start the monthly shell now. PDF import and manual editing will plug into this same menu record."
          >
            <form className="space-y-4" onSubmit={handleCreateMenu}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Month</span>
                  <select
                    value={createMonth}
                    onChange={(event) => setCreateMonth(Number(event.target.value))}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {MONTH_NAMES.map((month, index) => (
                      <option key={month} value={index + 1}>{month}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Year</span>
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={createYear}
                    onChange={(event) => setCreateYear(Number(event.target.value))}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              </div>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Optional menu name</span>
                <input
                  type="text"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  placeholder={`${MONTH_NAMES[createMonth - 1]} ${createYear} Lunch Menu`}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <button
                type="submit"
                disabled={createMenu.isPending}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {createMenu.isPending ? 'Creating menu...' : 'Create lunch menu'}
              </button>
            </form>
          </WorkflowPanel>

          <div ref={generatePanelRef}>
            <WorkflowPanel
              title="Generate From History"
              description="Use older monthly menus from this venue as the pattern source for a new month. The generated month still lands in the normal FIFOFlow editor for cleanup."
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Target month: <span className="font-semibold text-slate-950">{MONTH_NAMES[createMonth - 1]} {createYear}</span>
                </div>
                {menus.length > 0 ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setHistorySelectionTouched(true);
                          setHistorySourceIds(menus.map((menu) => menu.id));
                        }}
                        className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHistorySelectionTouched(true);
                          setHistorySourceIds([]);
                        }}
                        className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="space-y-3">
                      {menus.map((menu) => (
                        <label key={menu.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={historySourceIds.includes(menu.id)}
                            onChange={(event) => {
                              setHistorySelectionTouched(true);
                              setHistorySourceIds((current) => event.target.checked
                                ? [...current, menu.id]
                                : current.filter((value) => value !== menu.id));
                            }}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div>
                            <div className="font-semibold text-slate-950">{menu.name}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {MONTH_NAMES[menu.month - 1]} {menu.year} • {menu.item_count} saved dish row{menu.item_count === 1 ? '' : 's'}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleGenerateFromHistory()}
                      disabled={generateMenu.isPending || historySourceIds.length === 0}
                      className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
                    >
                      {generateMenu.isPending ? 'Generating...' : 'Generate lunch menu from history'}
                    </button>
                  </>
                ) : (
                  <WorkflowEmptyState
                    title="No historical menus yet"
                    body="Import or create at least one monthly menu for this venue first. Those become the source months for generated menus."
                  />
                )}
              </div>
            </WorkflowPanel>
          </div>

          <WorkflowPanel
            title="Monthly Menus"
            description="Pick an existing menu to inspect and edit its weekday payload."
          >
            <div className="space-y-3">
              {menus.map((menu) => (
                <button
                  key={menu.id}
                  type="button"
                  onClick={() => setSelectedMenuId(menu.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    menu.id === selectedMenuId
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">{menu.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {menu.item_count} saved dish row{menu.item_count === 1 ? '' : 's'}
                      </div>
                    </div>
                    <WorkflowStatusPill tone={menu.status === 'published' ? 'green' : menu.status === 'archived' ? 'slate' : 'amber'}>
                      {menu.status}
                    </WorkflowStatusPill>
                  </div>
                </button>
              ))}
              {menus.length === 0 ? (
                <WorkflowEmptyState
                  title="No lunch menus yet"
                  body="Create the first monthly menu for this venue, or upload a PDF and import it straight into a new month."
                />
              ) : null}
            </div>
          </WorkflowPanel>

          <WorkflowPanel
            title="Parsed Upload"
            description="Upload the legacy PDF, review the extracted weekday rows, then import them into the matching month."
          >
            {parsedUpload ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <div className="font-semibold text-slate-950">{uploadedFileName ?? parsedUpload.source_file_name}</div>
                  <div className="mt-1">
                    {MONTH_NAMES[parsedUpload.month - 1]} {parsedUpload.year} • {parsedUpload.days.length} parsed day{parsedUpload.days.length === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                  {parsedUpload.days.map((day) => (
                    <div key={day.date} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{day.date}</div>
                        {day.needs_review ? (
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                            Needs review
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                            Clean
                          </span>
                        )}
                      </div>
                      {day.review_notes.length > 0 ? (
                        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          {day.review_notes.join(' • ')}
                        </div>
                      ) : null}
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        <label className="space-y-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                          <span>Main dishes</span>
                          <textarea
                            value={day.main_dishes.join('\n')}
                            onChange={(event) => updateParsedDay(day.date, (current) => ({
                              ...current,
                              main_dishes: parseEditorLines(event.target.value),
                              needs_review: false,
                              review_notes: [],
                            }))}
                            rows={3}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-900"
                          />
                        </label>
                        <label className="space-y-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                          <span>Sides</span>
                          <textarea
                            value={day.sides.join('\n')}
                            onChange={(event) => updateParsedDay(day.date, (current) => ({
                              ...current,
                              sides: parseEditorLines(event.target.value),
                              needs_review: false,
                              review_notes: [],
                            }))}
                            rows={3}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"
                          />
                        </label>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <LabeledNumberInput
                          label="Calories"
                          value={day.nutrition?.calories ? String(day.nutrition.calories) : ''}
                            onChange={(value) => updateParsedDay(day.date, (current) => ({
                              ...current,
                              nutrition: buildParsedNutritionPayload(
                                value,
                                current.nutrition?.protein_g ? String(current.nutrition.protein_g) : '',
                                current.nutrition?.fat_g ? String(current.nutrition.fat_g) : '',
                                current.nutrition?.sugar_g ? String(current.nutrition.sugar_g) : '',
                              ),
                            needs_review: false,
                            review_notes: [],
                          }))}
                        />
                        <LabeledNumberInput
                          label="Protein (g)"
                          value={day.nutrition?.protein_g ? String(day.nutrition.protein_g) : ''}
                            onChange={(value) => updateParsedDay(day.date, (current) => ({
                              ...current,
                              nutrition: buildParsedNutritionPayload(
                                current.nutrition?.calories ? String(current.nutrition.calories) : '',
                                value,
                                current.nutrition?.fat_g ? String(current.nutrition.fat_g) : '',
                                current.nutrition?.sugar_g ? String(current.nutrition.sugar_g) : '',
                              ),
                            needs_review: false,
                            review_notes: [],
                          }))}
                        />
                        <LabeledNumberInput
                          label="Fat (g)"
                          value={day.nutrition?.fat_g ? String(day.nutrition.fat_g) : ''}
                            onChange={(value) => updateParsedDay(day.date, (current) => ({
                              ...current,
                              nutrition: buildParsedNutritionPayload(
                                current.nutrition?.calories ? String(current.nutrition.calories) : '',
                                current.nutrition?.protein_g ? String(current.nutrition.protein_g) : '',
                                value,
                                current.nutrition?.sugar_g ? String(current.nutrition.sugar_g) : '',
                              ),
                            needs_review: false,
                            review_notes: [],
                          }))}
                        />
                        <LabeledNumberInput
                          label="Sugar (g)"
                          value={day.nutrition?.sugar_g ? String(day.nutrition.sugar_g) : ''}
                            onChange={(value) => updateParsedDay(day.date, (current) => ({
                              ...current,
                              nutrition: buildParsedNutritionPayload(
                                current.nutrition?.calories ? String(current.nutrition.calories) : '',
                                current.nutrition?.protein_g ? String(current.nutrition.protein_g) : '',
                                current.nutrition?.fat_g ? String(current.nutrition.fat_g) : '',
                                value,
                            ),
                            needs_review: false,
                            review_notes: [],
                          }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {parsedUpload.errors.length > 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {parsedUpload.errors.join(' • ')}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleImportParsedUpload()}
                    disabled={importLunchMenu.isPending}
                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  >
                    {importLunchMenu.isPending ? 'Importing...' : 'Import into lunch menu'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setParsedUpload(null);
                      setUploadedFileName(null);
                    }}
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <WorkflowEmptyState
                title="No parsed PDF yet"
                body="Use Upload PDF to parse the monthly lunch menu. The preview lands here before you import it into a FIFOFlow month."
              />
            )}
          </WorkflowPanel>
        </div>

        <div className="space-y-6">
          <WorkflowPanel
            title="Menu Detail"
            description="The selected FIFOFlow menu is now the source of truth for publish/archive state, calendar editing, and PDF export."
          >
            {selectedMenu ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div>
                    <div className="text-lg font-semibold text-slate-950">{selectedMenu.name}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {MONTH_NAMES[selectedMenu.month - 1]} {selectedMenu.year} • {selectedMenu.items.length} menu row{selectedMenu.items.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedMenu.status === 'draft' ? (
                      <button
                        type="button"
                        onClick={() => void handleStatusUpdate('published')}
                        className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                      >
                        Publish
                      </button>
                    ) : null}
                    {selectedMenu.status === 'published' ? (
                      <button
                        type="button"
                        onClick={() => void handleStatusUpdate('archived')}
                        className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Archive
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleDeleteMenu()}
                      className="rounded-full border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</div>
                    <div className="mt-2 text-sm text-slate-900">{selectedMenu.status}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Notes</div>
                    <div className="mt-2 text-sm text-slate-900">{selectedMenu.notes?.trim() || 'No notes yet.'}</div>
                  </div>
                </div>
              </div>
            ) : (
              <WorkflowEmptyState
                title="Pick a menu"
                body="Select a monthly menu from the left rail, or import a parsed PDF to create the month automatically."
              />
            )}
          </WorkflowPanel>

          <WorkflowPanel
            title="Calendar Payload"
            description="Select a weekday card, then edit mains, sides, and nutrition in the panel below."
          >
            {selectedCalendar ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((label) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
                    >
                      {label}
                    </div>
                  ))}
                </div>
                {selectedCalendar.weeks.map((week) => (
                  <div key={week.week_number} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Week {week.week_number}</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      {week.days.map((day) => (
                        day.is_placeholder ? (
                          <div
                            key={`placeholder-${week.week_number}-${day.weekday_index}`}
                            aria-hidden="true"
                            className="min-h-[216px] rounded-2xl border border-dashed border-slate-200 bg-slate-50/60"
                          />
                        ) : (
                          <button
                            key={day.date}
                            type="button"
                            onClick={() => setSelectedDayDate(day.date)}
                            className={`rounded-2xl border p-3 text-left transition ${
                              day.date === selectedDayDate
                                ? 'border-emerald-400 bg-emerald-50'
                                : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                            }`}
                          >
                            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{day.day_name}</div>
                            <div className="mt-1 text-sm font-semibold text-slate-950">{day.date}</div>
                            <div className="mt-3 space-y-2 text-sm text-slate-700">
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Main dishes</div>
                                <div className="mt-1">{day.main_dishes.length > 0 ? day.main_dishes.join(', ') : 'No mains yet'}</div>
                              </div>
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Sides</div>
                                <div className="mt-1">{day.sides.length > 0 ? day.sides.join(', ') : 'No sides yet'}</div>
                              </div>
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Nutrition</div>
                                <div className="mt-1 text-xs text-slate-600">
                                  {day.nutrition
                                    ? `${day.nutrition.calories} cal • ${day.nutrition.protein_g.toFixed(0)}g P • ${day.nutrition.fat_g.toFixed(0)}g F • ${day.nutrition.sugar_g.toFixed(0)}g S`
                                    : 'No nutrition yet'}
                                </div>
                              </div>
                            </div>
                          </button>
                        )
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : selectedMenuId ? (
              <div className="text-sm text-slate-500">Loading calendar payload...</div>
            ) : (
              <WorkflowEmptyState
                title="No menu selected"
                body="Choose a menu from the list to inspect the calendar response shape."
              />
            )}
          </WorkflowPanel>

          <WorkflowPanel
            title="Day Editor"
            description="Each line becomes a separate lunch-menu row for that day. Nutrition is stored once per day and rolls up in the export."
          >
            {selectedMenu && selectedDayDate ? (
              <form className="space-y-4" onSubmit={handleSaveDayEdits}>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Editing <span className="font-semibold text-slate-950">{selectedDayDate}</span> in <span className="font-semibold text-slate-950">{selectedMenu.name}</span>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <span>Main dishes</span>
                    <textarea
                      value={mainText}
                      onChange={(event) => setMainText(event.target.value)}
                      rows={6}
                      placeholder="One main dish per line"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <span>Sides</span>
                    <textarea
                      value={sideText}
                      onChange={(event) => setSideText(event.target.value)}
                      rows={6}
                      placeholder="One side per line"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900"
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <LabeledNumberInput label="Calories" value={caloriesText} onChange={setCaloriesText} />
                  <LabeledNumberInput label="Protein (g)" value={proteinText} onChange={setProteinText} />
                  <LabeledNumberInput label="Fat (g)" value={fatText} onChange={setFatText} />
                  <LabeledNumberInput label="Sugar (g)" value={sugarText} onChange={setSugarText} />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={updateDays.isPending}
                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  >
                    {updateDays.isPending ? 'Saving day...' : 'Save day'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMainText('');
                      setSideText('');
                      setCaloriesText('');
                      setProteinText('');
                      setFatText('');
                      setSugarText('');
                    }}
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Clear day
                  </button>
                </div>
              </form>
            ) : (
              <WorkflowEmptyState
                title="Select a day to edit"
                body="Pick any weekday card from the calendar above. That day becomes editable here."
              />
            )}
          </WorkflowPanel>
        </div>
      </div>
    </WorkflowPage>
  );
}

function parseEditorLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildNutritionPayload(calories: string, protein: string, fat: string, sugar: string) {
  const payload = {
    calories: parseNullableNumber(calories),
    protein_g: parseNullableNumber(protein),
    fat_g: parseNullableNumber(fat),
    sugar_g: parseNullableNumber(sugar),
  };

  if (
    payload.calories == null
    && payload.protein_g == null
    && payload.fat_g == null
    && payload.sugar_g == null
  ) {
    return null;
  }

  return payload;
}

function buildParsedNutritionPayload(calories: string, protein: string, fat: string, sugar: string): LunchMenuDayNutrition | null {
  const payload = buildNutritionPayload(calories, protein, fat, sugar);
  if (!payload) {
    return null;
  }

  return {
    calories: payload.calories ?? 0,
    protein_g: payload.protein_g ?? 0,
    fat_g: payload.fat_g ?? 0,
    sugar_g: payload.sugar_g ?? 0,
  };
}

function parseNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function LabeledNumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        step="0.1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
      />
    </label>
  );
}
