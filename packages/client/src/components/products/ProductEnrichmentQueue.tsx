import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Database, FileUp, RefreshCw, ShieldAlert, Tag, Trash2 } from 'lucide-react';
import type {
  ProductEnrichmentCatalogSyncInput,
  ProductEnrichmentAllergenImportPayload,
  ProductEnrichmentManualImportAllergenClaimInput,
  ProductEnrichmentManualImportProductInput,
  ProductEnrichmentReviewQueuePayload,
} from '../../api';
import {
  useImportProductEnrichmentAllergens,
  useProductEnrichmentCatalogs,
  useDeleteProductEnrichmentProduct,
  useProductEnrichmentReviewQueue,
  useSyncProductEnrichmentCatalog,
} from '../../hooks/useProductEnrichment';
import { WorkflowEmptyState, WorkflowPanel, WorkflowStatusPill } from '../workflow/WorkflowPrimitives';
import { useToast } from '../../contexts/ToastContext';

interface AllergenReferenceEntry {
  code: string;
  name: string;
}

export function ProductEnrichmentQueue({
  venueId,
  allergens,
}: {
  venueId?: number | null;
  allergens: AllergenReferenceEntry[];
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [lastImportResult, setLastImportResult] = useState<ProductEnrichmentAllergenImportPayload | null>(null);
  const [selectedMatchIds, setSelectedMatchIds] = useState<number[]>([]);
  const queueQuery = useProductEnrichmentReviewQueue(venueId ?? undefined);
  const catalogsQuery = useProductEnrichmentCatalogs();
  const syncCatalogMutation = useSyncProductEnrichmentCatalog();
  const importAllergensMutation = useImportProductEnrichmentAllergens();
  const deleteProductMutation = useDeleteProductEnrichmentProduct();
  const { toast } = useToast();

  const allergenLookup = useMemo(() => buildAllergenLookup(allergens), [allergens]);
  const queue = queueQuery.data;
  const manualImportCatalog = catalogsQuery.data?.catalogs.find((catalog) => catalog.code === 'manual_import') ?? null;

  const counts = {
    missing: queue?.missing_identifiers.length ?? 0,
    conflicts: queue?.candidate_conflicts.length ?? 0,
    ready: queue?.ready_to_import.length ?? 0,
    unmatched: queue?.unmatched_items.length ?? 0,
  };

  const syncSummary = syncCatalogMutation.data?.summary ?? null;
  const readyEntries = queue?.ready_to_import ?? [];
  const selectedReadyEntries = readyEntries.filter((entry) => selectedMatchIds.includes(entry.active_match.id));
  const isBulkImporting = importAllergensMutation.isPending;

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setImportNote(`Parsing ${file.name}...`);
      const parsed = await parseImportFile(file, allergenLookup);
      if (parsed.products.length === 0) {
        setImportNote('No importable product rows were found. Make sure the file has a product_name or name column.');
        return;
      }

      const payload: ProductEnrichmentCatalogSyncInput = {
        mode: 'manual_import',
        created_by: 'operator',
        products: parsed.products,
      };

      await syncCatalogMutation.mutateAsync({
        catalogCode: 'manual_import',
        data: payload,
      });

      const unresolvedSuffix = parsed.unresolvedAllergens.length > 0
        ? ` ${parsed.unresolvedAllergens.length} allergen token${parsed.unresolvedAllergens.length === 1 ? '' : 's'} could not be mapped and were skipped.`
        : '';
      setImportNote(`Imported ${parsed.products.length} product row${parsed.products.length === 1 ? '' : 's'} from ${file.name}.${unresolvedSuffix}`);
      toast(`Imported ${parsed.products.length} product row${parsed.products.length === 1 ? '' : 's'} into manual catalog.`, 'success');
    } catch (error) {
      setImportNote(error instanceof Error ? error.message : 'Unable to import that file.');
      toast(error instanceof Error ? error.message : 'Unable to import that file.', 'error');
    }
  };

  const handleImportClaims = async (itemId: number, matchId: number) => {
    try {
      const result = await importAllergensMutation.mutateAsync({
        itemId,
        data: {
          external_product_match_id: matchId,
          import_mode: 'draft_claims',
          created_by: 'operator',
        },
      });
      setLastImportResult(result);
      setImportNote(
        `Imported ${result.imported_rows} allergen row${result.imported_rows === 1 ? '' : 's'} and captured ${result.evidence_rows} evidence row${result.evidence_rows === 1 ? '' : 's'}.`,
      );
      setSelectedMatchIds((current) => current.filter((id) => id !== matchId));
      toast(`Imported claims for item #${itemId}.`, 'success');
    } catch (error) {
      setImportNote(error instanceof Error ? error.message : 'Unable to import allergen claims.');
      toast(error instanceof Error ? error.message : 'Unable to import allergen claims.', 'error');
    }
  };

  const toggleReadySelection = (matchId: number) => {
    setSelectedMatchIds((current) => (
      current.includes(matchId)
        ? current.filter((id) => id !== matchId)
        : [...current, matchId]
    ));
  };

  const handleSelectAllReady = () => {
    const allMatchIds = readyEntries.map((entry) => entry.active_match.id);
    setSelectedMatchIds((current) => current.length === allMatchIds.length ? [] : allMatchIds);
  };

  const handleBulkImport = async () => {
    if (selectedReadyEntries.length === 0) return;
    let importedCount = 0;
    let skippedCount = 0;
    let lastResult: ProductEnrichmentAllergenImportPayload | null = null;

    for (const entry of selectedReadyEntries) {
      try {
        const result = await importAllergensMutation.mutateAsync({
          itemId: entry.item.id,
          data: {
            external_product_match_id: entry.active_match.id,
            import_mode: 'draft_claims',
            created_by: 'operator',
          },
        });
        importedCount += result.imported_rows;
        skippedCount += result.skipped_rows;
        lastResult = result;
      } catch (error) {
        toast(error instanceof Error ? error.message : `Unable to import claims for ${entry.item.name}.`, 'error');
        return;
      }
    }

    setSelectedMatchIds([]);
    if (lastResult) {
      setLastImportResult(lastResult);
    }
    setImportNote(
      `Bulk import finished for ${selectedReadyEntries.length} item${selectedReadyEntries.length === 1 ? '' : 's'}: ${importedCount} rows applied, ${skippedCount} skipped.`,
    );
    toast(`Bulk imported ${selectedReadyEntries.length} ready item${selectedReadyEntries.length === 1 ? '' : 's'}.`, 'success');
  };

  const handleDeleteManualProduct = async (productId: number, productName: string, matchId?: number) => {
    try {
      await deleteProductMutation.mutateAsync(productId);
      setImportNote(`Deleted manual-import product "${productName}".`);
      if (matchId != null) {
        setSelectedMatchIds((current) => current.filter((id) => id !== matchId));
      }
      toast(`Deleted ${productName}.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete that manual-import product.';
      setImportNote(message);
      toast(message, 'error');
    }
  };

  return (
    <WorkflowPanel
      title="Product enrichment queue"
      description="Import structured vendor product data, resolve missing identifiers, and review items that are ready for allergen claim import."
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <WorkflowStatusPill tone={manualImportCatalog ? 'blue' : 'amber'}>
            {manualImportCatalog ? 'Manual import ready' : 'Catalog missing'}
          </WorkflowStatusPill>
          <button
            type="button"
            onClick={() => queueQuery.refetch()}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={queueQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${queueQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh queue
          </button>
          {readyEntries.length > 0 ? (
            <>
              <button
                type="button"
                onClick={handleSelectAllReady}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {selectedMatchIds.length === readyEntries.length ? 'Clear ready selection' : 'Select all ready'}
              </button>
              <button
                type="button"
                onClick={() => void handleBulkImport()}
                disabled={selectedReadyEntries.length === 0 || isBulkImporting}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkImporting ? 'Importing selected...' : `Import selected${selectedReadyEntries.length > 0 ? ` (${selectedReadyEntries.length})` : ''}`}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!manualImportCatalog || syncCatalogMutation.isPending}
          >
            <FileUp className="h-4 w-4" />
            {syncCatalogMutation.isPending ? 'Importing...' : 'Import catalog file'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls,.json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}
    >
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white p-2 text-slate-700 shadow-sm">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-950">Manual external product import</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Upload CSV, TSV, XLSX, or JSON with columns like <code>product_name</code>, <code>gtin</code>, <code>sysco_supc</code>,
                <code> vendor_item_code</code>, <code>ingredient_statement</code>, and allergen columns such as <code>contains_allergens</code>.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <WorkflowStatusPill tone="slate">product_name</WorkflowStatusPill>
            <WorkflowStatusPill tone="slate">gtin / upc / sysco_supc</WorkflowStatusPill>
            <WorkflowStatusPill tone="slate">brand_name</WorkflowStatusPill>
            <WorkflowStatusPill tone="slate">contains_allergens</WorkflowStatusPill>
            <WorkflowStatusPill tone="slate">may_contain_allergens</WorkflowStatusPill>
          </div>
          {importNote ? <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{importNote}</div> : null}
          {syncSummary ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MiniMetric label="Upserted" value={syncSummary.products_upserted} />
              <MiniMetric label="Created" value={syncSummary.products_created} />
              <MiniMetric label="Updated" value={syncSummary.products_updated} />
              <MiniMetric label="Claims" value={syncSummary.allergen_claims_upserted} />
            </div>
          ) : null}
          {lastImportResult ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Last claim import: item #{lastImportResult.item_id}, {lastImportResult.imported_rows} applied, {lastImportResult.skipped_rows} skipped, audit #{lastImportResult.audit_id}.
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Missing identifiers" value={counts.missing} tone="amber" />
          <MiniMetric label="Conflicts" value={counts.conflicts} tone="red" />
          <MiniMetric label="Ready to import" value={counts.ready} tone="green" />
          <MiniMetric label="Unmatched" value={counts.unmatched} tone="blue" />
        </div>
      </div>

      {queueQuery.isLoading ? (
        <div className="mt-6 text-sm text-slate-600">Loading product enrichment queue...</div>
      ) : queueQuery.isError || !queue ? (
        <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          {queueQuery.error instanceof Error ? queueQuery.error.message : 'Unable to load the product enrichment queue.'}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <QueueSection
            title="Missing identifiers"
            description="Inventory items with no GTIN, UPC, SUPC, or manufacturer item code yet."
            emptyTitle="No missing identifiers"
            emptyBody="Everything in the current scope has at least one identifier to work from."
            items={queue.missing_identifiers.map((item) => (
              <ItemCard
                key={`missing-${item.id}`}
                title={item.name}
                subtitle={buildItemSubtitle(item)}
                href={`/allergens/items/${item.id}`}
                pills={[<WorkflowStatusPill key="missing" tone="amber">Identifier needed</WorkflowStatusPill>]}
              />
            ))}
          />

          <QueueSection
            title="Candidate conflicts"
            description="Items that currently have multiple active external product matches and need an operator decision."
            emptyTitle="No active conflicts"
            emptyBody="The system is not currently holding multiple live matches for the same item."
            items={queue.candidate_conflicts.map((entry) => (
              <ItemCard
                key={`conflict-${entry.item.id}`}
                title={entry.item.name}
                subtitle={`${buildItemSubtitle(entry.item)} • ${entry.active_match_count} active matches`}
                href={`/allergens/items/${entry.item.id}`}
                pills={entry.active_matches.slice(0, 3).map((match) => (
                  <WorkflowStatusPill key={match.id} tone={match.match_confidence === 'high' ? 'red' : 'amber'}>
                    {match.external_product.product_name}
                  </WorkflowStatusPill>
                ))}
              />
            ))}
          />

          <QueueSection
            title="Ready to import"
            description="Items with a confirmed external product and parsed allergen claims ready for the next import step."
            emptyTitle="Nothing ready yet"
            emptyBody="Import a catalog file or confirm more product matches to populate this lane."
            items={queue.ready_to_import.map((entry) => (
              <ReadyImportCard
                key={`ready-${entry.item.id}`}
                entry={entry}
                onImport={handleImportClaims}
                loading={isBulkImporting}
                selected={selectedMatchIds.includes(entry.active_match.id)}
                onToggleSelected={toggleReadySelection}
                onDeleteManualProduct={handleDeleteManualProduct}
                deleteLoadingProductId={deleteProductMutation.isPending ? deleteProductMutation.variables ?? null : null}
              />
            ))}
          />
        </div>
      )}

      {queue && queue.unmatched_items.length > 0 ? (
        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-slate-500" />
            <div>
              <div className="text-sm font-semibold text-slate-950">Unmatched items with identifiers</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                These items already have identifiers, but no external product match is active yet. Open them from the allergen detail page and run matching again after import.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {queue.unmatched_items.slice(0, 10).map((item) => (
                  <Link
                    key={`unmatched-${item.id}`}
                    to={`/allergens/items/${item.id}`}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                  >
                    <Tag className="h-3.5 w-3.5" />
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </WorkflowPanel>
  );
}

function ReadyImportCard({
  entry,
  onImport,
  loading,
  selected,
  onToggleSelected,
  onDeleteManualProduct,
  deleteLoadingProductId,
}: {
  entry: ProductEnrichmentReviewQueuePayload['ready_to_import'][number];
  onImport: (itemId: number, matchId: number) => void | Promise<void>;
  loading: boolean;
  selected: boolean;
  onToggleSelected: (matchId: number) => void;
  onDeleteManualProduct: (productId: number, productName: string, matchId?: number) => void | Promise<void>;
  deleteLoadingProductId: number | null;
}) {
  const product = entry.active_match.external_product;
  const canDeleteManualImport = product.catalog_code === 'manual_import';
  const isDeleting = deleteLoadingProductId === product.id;

  return (
    <div className={`rounded-3xl border px-4 py-4 ${selected ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
      <label className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelected(entry.active_match.id)}
          className="h-4 w-4 rounded border-slate-300 text-slate-950"
        />
        Select for bulk import
      </label>
      <Link to={`/allergens/items/${entry.item.id}`} className="block transition hover:text-slate-700">
        <div className="text-sm font-semibold text-slate-950">{entry.item.name}</div>
        <div className="mt-1 text-xs leading-5 text-slate-500">
          {entry.active_match.external_product.product_name} • {entry.allergen_claim_count} allergen claim{entry.allergen_claim_count === 1 ? '' : 's'}
        </div>
      </Link>
      <div className="mt-3 flex flex-wrap gap-2">
        <WorkflowStatusPill tone="green">{entry.active_match.match_status}</WorkflowStatusPill>
        <WorkflowStatusPill tone="blue">{entry.active_match.match_basis}</WorkflowStatusPill>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onImport(entry.item.id, entry.active_match.id)}
          disabled={loading || isDeleting}
          className="inline-flex items-center rounded-full bg-slate-950 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Importing…' : 'Import claims'}
        </button>
        <Link
          to={`/allergens/items/${entry.item.id}`}
          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
        >
          Review item
        </Link>
        {canDeleteManualImport ? (
          <button
            type="button"
            onClick={() => void onDeleteManualProduct(product.id, product.product_name, entry.active_match.id)}
            disabled={loading || isDeleting}
            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isDeleting ? 'Deleting…' : 'Delete manual product'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function QueueSection({
  title,
  description,
  emptyTitle,
  emptyBody,
  items,
}: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyBody: string;
  items: ReactNode[];
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <div className="text-base font-semibold text-slate-950">{title}</div>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? <WorkflowEmptyState title={emptyTitle} body={emptyBody} /> : items}
      </div>
    </div>
  );
}

function ItemCard({
  title,
  subtitle,
  href,
  pills,
}: {
  title: string;
  subtitle: string;
  href: string;
  pills: ReactNode[];
}) {
  return (
    <Link
      to={href}
      className="block rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-slate-300 hover:bg-white"
    >
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</div>
      <div className="mt-3 flex flex-wrap gap-2">{pills}</div>
    </Link>
  );
}

function MiniMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const borderClass = tone === 'green'
    ? 'border-emerald-300/60'
    : tone === 'amber'
      ? 'border-amber-300/60'
      : tone === 'red'
        ? 'border-rose-300/60'
        : tone === 'blue'
          ? 'border-sky-300/60'
          : 'border-slate-200';

  return (
    <div className={`rounded-3xl border ${borderClass} bg-white p-4 shadow-sm`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function buildItemSubtitle(item: ProductEnrichmentReviewQueuePayload['missing_identifiers'][number]): string {
  return [item.category, item.brand_name, item.manufacturer_name].filter(Boolean).join(' • ');
}

function buildAllergenLookup(allergens: AllergenReferenceEntry[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const allergen of allergens) {
    lookup.set(normalizeKey(allergen.code), allergen.code);
    lookup.set(normalizeKey(allergen.name), allergen.code);
  }
  return lookup;
}

async function parseImportFile(file: File, allergenLookup: Map<string, string>): Promise<{
  products: ProductEnrichmentManualImportProductInput[];
  unresolvedAllergens: string[];
}> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  let rows: Array<Record<string, unknown>>;

  if (extension === 'json') {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) {
      throw new Error('JSON imports must contain an array of product rows.');
    }
    rows = parsed as Array<Record<string, unknown>>;
  } else {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      throw new Error('The uploaded file did not contain any sheets.');
    }
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: '' });
  }

  const unresolved = new Set<string>();
  const products = rows
    .map((row) => mapImportRow(row, allergenLookup, unresolved))
    .filter((row): row is ProductEnrichmentManualImportProductInput => row !== null);

  return {
    products,
    unresolvedAllergens: [...unresolved].sort(),
  };
}

function mapImportRow(
  rawRow: Record<string, unknown>,
  allergenLookup: Map<string, string>,
  unresolved: Set<string>,
): ProductEnrichmentManualImportProductInput | null {
  const row = normalizeRow(rawRow);
  const productName = firstText(row, ['product_name', 'name', 'vendor_item_name', 'item_name']);
  if (!productName) {
    return null;
  }

  const allergenClaims = [
    ...buildClaimsFromColumn(row, ['contains_allergens', 'contains', 'allergens_contains'], 'contains', allergenLookup, unresolved),
    ...buildClaimsFromColumn(row, ['may_contain_allergens', 'may_contain', 'allergens_may_contain'], 'may_contain', allergenLookup, unresolved),
    ...buildClaimsFromColumn(row, ['free_of_allergens', 'free_of', 'allergens_free_of'], 'free_of', allergenLookup, unresolved),
    ...buildClaimsFromColumn(row, ['unknown_allergens', 'unknown', 'allergens_unknown'], 'unknown', allergenLookup, unresolved),
  ];

  return {
    external_key: firstText(row, ['external_key', 'external_id', 'sku']),
    gtin: firstText(row, ['gtin']),
    upc: firstText(row, ['upc']),
    vendor_item_code: firstText(row, ['vendor_item_code', 'item_code']),
    sysco_supc: firstText(row, ['sysco_supc', 'supc']),
    brand_name: firstText(row, ['brand_name', 'brand']),
    manufacturer_name: firstText(row, ['manufacturer_name', 'manufacturer']),
    product_name: productName,
    pack_text: firstText(row, ['pack_text', 'pack', 'vendor_pack_text']),
    size_text: firstText(row, ['size_text', 'size']),
    ingredient_statement: firstText(row, ['ingredient_statement', 'ingredients']),
    allergen_statement: firstText(row, ['allergen_statement']),
    source_url: firstText(row, ['source_url', 'product_url']),
    raw_payload_json: JSON.stringify(rawRow),
    allergen_claims: allergenClaims,
  };
}

function normalizeRow(rawRow: Record<string, unknown>): Record<string, string> {
  return Object.entries(rawRow).reduce<Record<string, string>>((accumulator, [key, value]) => {
    accumulator[normalizeKey(key)] = value == null ? '' : String(value).trim();
    return accumulator;
  }, {});
}

function firstText(row: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[normalizeKey(key)];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function buildClaimsFromColumn(
  row: Record<string, string>,
  keys: string[],
  status: ProductEnrichmentManualImportAllergenClaimInput['status'],
  allergenLookup: Map<string, string>,
  unresolved: Set<string>,
): ProductEnrichmentManualImportAllergenClaimInput[] {
  const source = firstText(row, keys);
  if (!source) {
    return [];
  }

  const claims: ProductEnrichmentManualImportAllergenClaimInput[] = [];
  for (const token of splitList(source)) {
    const code = allergenLookup.get(normalizeKey(token));
    if (!code) {
      unresolved.add(token);
      continue;
    }
    claims.push({
      allergen_code: code,
      status,
      confidence: 'unverified',
      source_excerpt: source,
    });
  }
  return claims;
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,;|]/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
