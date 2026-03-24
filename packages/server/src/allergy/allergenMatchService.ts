import type Database from 'better-sqlite3';

export interface AllergyDocumentProductRecord {
  id: number;
  document_id: number;
  page_id: number | null;
  page_number: number;
  product_name: string;
  normalized_product_name: string;
  source_row_text: string;
  allergen_summary: string | null;
  dietary_notes: string | null;
  source_chunk_ids: number[];
}

export interface InventoryItemRecord {
  id: number;
  name: string;
  venue_id: number | null;
}

export type AllergyDocumentMatchStatus = 'suggested' | 'confirmed' | 'rejected' | 'no_match';

export interface AllergyDocumentMatchCandidate {
  item_id: number;
  item_name: string;
  match_status: AllergyDocumentMatchStatus;
  match_score: number;
  notes: string;
}

export interface AllergyDocumentMatchPlan {
  document_product_id: number;
  product_name: string;
  candidates: AllergyDocumentMatchCandidate[];
  locked: boolean;
}

export interface AllergyMatchRefreshSummary {
  document_id: number;
  match_table_available: boolean;
  product_count: number;
  processed_product_count: number;
  locked_product_count: number;
  inserted_match_count: number;
  no_match_count: number;
  skipped_reason: string | null;
}

const STRONG_MATCH_THRESHOLD = 0.45;

export function buildDocumentProductMatchPlans(input: {
  products: AllergyDocumentProductRecord[];
  items: InventoryItemRecord[];
}): AllergyDocumentMatchPlan[] {
  return input.products.map((product) => {
    const scoredCandidates = input.items
      .map((item) => ({
        item_id: item.id,
        item_name: item.name,
        score: Number(scoreProductToItem(product, item).toFixed(4)),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.item_name.localeCompare(right.item_name, undefined, { sensitivity: 'base' }));

    const strongCandidates = scoredCandidates
      .filter((candidate) => candidate.score >= STRONG_MATCH_THRESHOLD)
      .slice(0, 3)
      .map((candidate) => ({
        item_id: candidate.item_id,
        item_name: candidate.item_name,
        match_status: 'suggested' as const,
        match_score: candidate.score,
        notes: buildSuggestedMatchNote(product, candidate.item_name, candidate.score),
      }));

    if (strongCandidates.length > 0) {
      return {
        document_product_id: product.id,
        product_name: product.product_name,
        candidates: strongCandidates,
        locked: false,
      };
    }

    const weakCandidate = scoredCandidates[0];
    if (weakCandidate) {
      return {
        document_product_id: product.id,
        product_name: product.product_name,
        candidates: [{
          item_id: weakCandidate.item_id,
          item_name: weakCandidate.item_name,
          match_status: 'no_match',
          match_score: weakCandidate.score,
          notes: 'Automated scoring found only a weak overlap. Manual review is needed.',
        }],
        locked: false,
      };
    }

    return {
      document_product_id: product.id,
      product_name: product.product_name,
      candidates: [],
      locked: false,
    };
  });
}

export function refreshAllergyDocumentProductMatches(
  db: Database.Database,
  documentId: number,
): AllergyMatchRefreshSummary {
  const matchTable = getAllergyDocumentProductMatchTable(db);
  if (!matchTable) {
    return {
      document_id: documentId,
      match_table_available: false,
      product_count: 0,
      processed_product_count: 0,
      locked_product_count: 0,
      inserted_match_count: 0,
      no_match_count: 0,
      skipped_reason: 'Match table is not available yet',
    };
  }

  const document = db.prepare(
    `
      SELECT id, venue_id
      FROM allergy_documents
      WHERE id = ?
      LIMIT 1
    `,
  ).get(documentId) as { id: number; venue_id: number | null } | undefined;

  if (!document) {
    return {
      document_id: documentId,
      match_table_available: true,
      product_count: 0,
      processed_product_count: 0,
      locked_product_count: 0,
      inserted_match_count: 0,
      no_match_count: 0,
      skipped_reason: 'Document not found',
    };
  }

  const products = loadAllergyDocumentProducts(db, documentId);
  if (products.length === 0) {
    return {
      document_id: documentId,
      match_table_available: true,
      product_count: 0,
      processed_product_count: 0,
      locked_product_count: 0,
      inserted_match_count: 0,
      no_match_count: 0,
      skipped_reason: 'No parsed products were found for this document',
    };
  }

  const items = loadInventoryItemsForMatching(db, document.venue_id);
  if (items.length === 0) {
    return {
      document_id: documentId,
      match_table_available: true,
      product_count: products.length,
      processed_product_count: 0,
      locked_product_count: 0,
      inserted_match_count: 0,
      no_match_count: 0,
      skipped_reason: 'No inventory items were available for matching',
    };
  }

  const lockedProductIds = loadLockedDocumentProductIds(db, matchTable, products.map((product) => product.id));
  const matchableProducts = products.filter((product) => !lockedProductIds.has(product.id));
  if (matchableProducts.length === 0) {
    return {
      document_id: documentId,
      match_table_available: true,
      product_count: products.length,
      processed_product_count: 0,
      locked_product_count: lockedProductIds.size,
      inserted_match_count: 0,
      no_match_count: 0,
      skipped_reason: 'All products already have confirmed or rejected matches',
    };
  }

  const plans = buildDocumentProductMatchPlans({
    products: matchableProducts,
    items,
  });

  let insertedMatchCount = 0;
  let noMatchCount = 0;

  const transaction = db.transaction(() => {
    const matchingProductIds = plans.map((plan) => plan.document_product_id);
    if (matchingProductIds.length > 0) {
      deleteRegeneratableMatches(db, matchTable, matchingProductIds);
    }

    for (const plan of plans) {
      for (const candidate of plan.candidates) {
        insertDocumentProductMatch(db, matchTable, {
          documentProductId: plan.document_product_id,
          itemId: candidate.item_id,
          matchStatus: candidate.match_status,
          matchScore: candidate.match_score,
          notes: candidate.notes,
        });
        insertedMatchCount += 1;
        if (candidate.match_status === 'no_match') {
          noMatchCount += 1;
        }
      }
    }
  });

  transaction();

  return {
    document_id: documentId,
    match_table_available: true,
    product_count: products.length,
    processed_product_count: matchableProducts.length,
    locked_product_count: lockedProductIds.size,
    inserted_match_count: insertedMatchCount,
    no_match_count: noMatchCount,
    skipped_reason: null,
  };
}

function loadAllergyDocumentProducts(db: Database.Database, documentId: number): AllergyDocumentProductRecord[] {
  const rows = db.prepare(
    `
      SELECT
        id,
        document_id,
        page_id,
        page_number,
        product_name,
        normalized_product_name,
        source_row_text,
        allergen_summary,
        dietary_notes,
        source_chunk_ids
      FROM allergy_document_products
      WHERE document_id = ?
      ORDER BY page_number ASC, id ASC
    `,
  ).all(documentId) as Array<Omit<AllergyDocumentProductRecord, 'source_chunk_ids'> & { source_chunk_ids: string }>;

  return rows.map((row) => ({
    ...row,
    source_chunk_ids: parseChunkIdList(row.source_chunk_ids),
  }));
}

function loadInventoryItemsForMatching(db: Database.Database, venueId: number | null): InventoryItemRecord[] {
  const rows = db.prepare(
    `
      SELECT
        id,
        name,
        venue_id
      FROM items
      WHERE (? IS NULL OR venue_id = ? OR venue_id IS NULL)
      ORDER BY name COLLATE NOCASE ASC, id ASC
    `,
  ).all(venueId ?? null, venueId ?? null) as InventoryItemRecord[];

  return rows;
}

function loadLockedDocumentProductIds(
  db: Database.Database,
  matchTable: MatchTableDefinition,
  documentProductIds: number[],
): Set<number> {
  if (documentProductIds.length === 0) {
    return new Set<number>();
  }

  const placeholders = documentProductIds.map(() => '?').join(', ');
  const rows = db.prepare(
    `
      SELECT DISTINCT ${matchTable.productIdColumn} AS document_product_id
      FROM ${matchTable.tableName}
      WHERE ${matchTable.productIdColumn} IN (${placeholders})
        AND ${matchTable.statusColumn} IN ('confirmed', 'rejected')
    `,
  ).all(...documentProductIds) as Array<{ document_product_id: number }>;

  return new Set(rows.map((row) => row.document_product_id));
}

function deleteRegeneratableMatches(
  db: Database.Database,
  matchTable: MatchTableDefinition,
  documentProductIds: number[],
): void {
  if (documentProductIds.length === 0) {
    return;
  }

  const placeholders = documentProductIds.map(() => '?').join(', ');
  db.prepare(
    `
      DELETE FROM ${matchTable.tableName}
      WHERE ${matchTable.productIdColumn} IN (${placeholders})
        AND ${matchTable.statusColumn} IN ('suggested', 'no_match')
    `,
  ).run(...documentProductIds);
}

function insertDocumentProductMatch(
  db: Database.Database,
  matchTable: MatchTableDefinition,
  input: {
    documentProductId: number;
    itemId: number;
    matchStatus: AllergyDocumentMatchStatus;
    matchScore: number;
    notes: string;
  },
): void {
  const values: Record<string, unknown> = {};
  values[matchTable.productIdColumn] = input.documentProductId;
  values[matchTable.itemIdColumn] = input.itemId;
  values[matchTable.statusColumn] = input.matchStatus;

  if (matchTable.scoreColumn) {
    values[matchTable.scoreColumn] = input.matchScore;
  }
  if (matchTable.notesColumn) {
    values[matchTable.notesColumn] = input.notes;
  }
  if (matchTable.matchedByColumn) {
    values[matchTable.matchedByColumn] = 'system';
  }
  if (matchTable.activeColumn) {
    values[matchTable.activeColumn] = 1;
  }

  const columns = Object.keys(values);
  const placeholders = columns.map(() => '?').join(', ');
  db.prepare(
    `INSERT INTO ${matchTable.tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
  ).run(...columns.map((column) => values[column]));
}

interface MatchTableDefinition {
  tableName: string;
  productIdColumn: string;
  itemIdColumn: string;
  statusColumn: string;
  scoreColumn: string | null;
  notesColumn: string | null;
  matchedByColumn: string | null;
  activeColumn: string | null;
}

function getAllergyDocumentProductMatchTable(db: Database.Database): MatchTableDefinition | null {
  if (!tableExists(db, 'allergy_document_product_matches')) {
    return null;
  }

  const columns = getTableColumns(db, 'allergy_document_product_matches');
  const productIdColumn = pickFirstExistingColumn(columns, ['document_product_id', 'allergy_document_product_id', 'product_id']);
  const itemIdColumn = pickFirstExistingColumn(columns, ['item_id']);
  const statusColumn = pickFirstExistingColumn(columns, ['match_status', 'status']);

  if (!productIdColumn || !itemIdColumn || !statusColumn) {
    return null;
  }

  return {
    tableName: 'allergy_document_product_matches',
    productIdColumn,
    itemIdColumn,
    statusColumn,
    scoreColumn: pickFirstExistingColumn(columns, ['match_score', 'score', 'confidence_score']),
    notesColumn: pickFirstExistingColumn(columns, ['notes', 'reason', 'match_reason']),
    matchedByColumn: pickFirstExistingColumn(columns, ['matched_by']),
    activeColumn: pickFirstExistingColumn(columns, ['active']),
  };
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(
    `
      SELECT 1
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
      LIMIT 1
    `,
  ).get(tableName) as { 1: number } | undefined;

  return Boolean(row);
}

function getTableColumns(db: Database.Database, tableName: string): string[] {
  return (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map((column) => column.name);
}

function pickFirstExistingColumn(columns: string[], candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (columns.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}

function parseChunkIdList(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry) && entry > 0);
  } catch {
    return [];
  }
}

function normalizeSearchText(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenizeSearchText(input: string): string[] {
  return normalizeSearchText(input)
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function scoreProductToItem(product: AllergyDocumentProductRecord, item: InventoryItemRecord): number {
  return Math.max(
    scoreTextOverlap(product.product_name, item.name),
    scoreTextOverlap(product.normalized_product_name, item.name),
    scoreTextOverlap(product.source_row_text, item.name),
    scoreTextOverlap(product.allergen_summary ?? '', item.name),
    scoreTextOverlap(product.dietary_notes ?? '', item.name),
  );
}

function scoreTextOverlap(left: string, right: string): number {
  const normalizedLeft = normalizeSearchText(left);
  const normalizedRight = normalizeSearchText(right);
  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const leftTokens = new Set(tokenizeSearchText(normalizedLeft));
  const rightTokens = new Set(tokenizeSearchText(normalizedRight));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const sharedTokens = Array.from(leftTokens).filter((token) => rightTokens.has(token));
  if (sharedTokens.length === 0) {
    return 0;
  }

  const unionSize = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = sharedTokens.length / unionSize;
  const phraseBoost = normalizedRight.includes(normalizedLeft) || normalizedLeft.includes(normalizedRight) ? 0.25 : 0;
  return Math.min(1, jaccard + phraseBoost);
}

function buildSuggestedMatchNote(
  product: AllergyDocumentProductRecord,
  itemName: string,
  score: number,
): string {
  const sharedTokens = findSharedTokens(product, itemName);
  if (sharedTokens.length > 0) {
    return `Automated match on ${sharedTokens.join(', ')} (${Math.round(score * 100)}% confidence).`;
  }

  return `Automated name overlap suggests a likely match (${Math.round(score * 100)}% confidence).`;
}

function findSharedTokens(product: AllergyDocumentProductRecord, itemName: string): string[] {
  const productTokens = new Set([
    ...tokenizeSearchText(product.product_name),
    ...tokenizeSearchText(product.normalized_product_name),
    ...tokenizeSearchText(product.source_row_text),
  ]);
  const itemTokens = new Set(tokenizeSearchText(itemName));
  return Array.from(productTokens).filter((token) => itemTokens.has(token));
}
