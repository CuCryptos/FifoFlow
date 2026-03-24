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
  aliases: string[];
}

export type AllergyDocumentMatchStatus = 'suggested' | 'confirmed' | 'rejected' | 'no_match';
export type AllergyDocumentMatchBasis = 'item_name' | 'explicit_alias' | 'operator';
export type AllergyDocumentMatchSignalTier = 'high' | 'medium' | 'fallback' | 'operator';

export interface AllergyDocumentMatchCandidate {
  item_id: number;
  item_name: string;
  match_status: AllergyDocumentMatchStatus;
  match_score: number;
  match_basis: AllergyDocumentMatchBasis;
  match_signal_tier: AllergyDocumentMatchSignalTier;
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

const STRONG_MATCH_THRESHOLD = 0.28;
const WEAK_MATCH_THRESHOLD = 0.14;
const NOISE_TOKENS = new Set([
  'a',
  'an',
  'and',
  'composed',
  'daily',
  'fresh',
  'freshly',
  'homemade',
  'house',
  'housemade',
  'local',
  'locally',
  'made',
  'of',
  'or',
  'seasonal',
  'served',
  'salad',
  'sauce',
  'special',
  'style',
  'the',
  'platter',
  'white',
  'with',
]);

const OCR_CONFUSABLE_CHAR_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '8': 'b',
};

const KNOWN_NON_LATIN_REPLACEMENTS: Array<[RegExp, string]> = [
  [/プライム/g, ' prime '],
  [/ローストビーフ/g, ' roast beef '],
  [/テンダーロイン/g, ' tenderloin '],
  [/ロブスター/g, ' lobster '],
  [/チキン/g, ' chicken '],
  [/サーモン/g, ' salmon '],
  [/バター/g, ' butter '],
  [/ケーキ/g, ' cake '],
  [/ソルベ/g, ' sorbet '],
  [/ジェラート/g, ' gelato '],
  [/ライス/g, ' rice '],
  [/ポテト/g, ' potato '],
  [/マッシュ/g, ' mashed '],
  [/ビーフ/g, ' beef '],
  [/シュリンプ/g, ' shrimp '],
];

interface MatchingProfile {
  normalized: string;
  tokens: string[];
}

interface ScoredMatchCandidate {
  item_id: number;
  item_name: string;
  score: number;
  match_basis: Exclude<AllergyDocumentMatchBasis, 'operator'>;
  match_signal_tier: Exclude<AllergyDocumentMatchSignalTier, 'operator'>;
  matched_text: string;
}

interface InventoryItemMatchProfile {
  item: InventoryItemRecord;
  profiles: Array<{
    profile: MatchingProfile;
    match_basis: Exclude<AllergyDocumentMatchBasis, 'operator'>;
    matched_text: string;
  }>;
}

export function buildDocumentProductMatchPlans(input: {
  products: AllergyDocumentProductRecord[];
  items: InventoryItemRecord[];
}): AllergyDocumentMatchPlan[] {
  const itemProfiles = input.items.map((item) => ({
    item,
    profiles: [
      {
        profile: buildMatchingProfile(item.name),
        match_basis: 'item_name' as const,
        matched_text: item.name,
      },
      ...item.aliases.map((alias) => ({
        profile: buildMatchingProfile(alias),
        match_basis: 'explicit_alias' as const,
        matched_text: alias,
      })),
    ].filter((entry) => entry.profile.tokens.length > 0),
  }));
  const tokenDocumentFrequency = buildTokenDocumentFrequency(
    itemProfiles.flatMap((entry) => entry.profiles.map((profile) => profile.profile.tokens)),
  );

  return input.products.map((product) => {
    const scoredCandidates = itemProfiles
      .map(({ item, profiles }) => scoreProductToItem(product, { item, profiles }, tokenDocumentFrequency))
      .filter((candidate): candidate is ScoredMatchCandidate => candidate != null)
      .map((candidate) => ({
        ...candidate,
        score: Number(candidate.score.toFixed(4)),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) =>
        signalTierRank(left.match_signal_tier) - signalTierRank(right.match_signal_tier)
        || right.score - left.score
        || left.item_name.localeCompare(right.item_name, undefined, { sensitivity: 'base' }));

    const strongCandidates = scoredCandidates
      .filter((candidate) => candidate.score >= STRONG_MATCH_THRESHOLD)
      .slice(0, 3)
      .map((candidate) => ({
        item_id: candidate.item_id,
        item_name: candidate.item_name,
        match_status: 'suggested' as const,
        match_score: candidate.score,
        match_basis: candidate.match_basis,
        match_signal_tier: candidate.match_signal_tier,
        notes: buildSuggestedMatchNote(product, candidate.item_name, candidate.score, candidate.match_basis, candidate.matched_text),
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
    if (weakCandidate && weakCandidate.score >= WEAK_MATCH_THRESHOLD) {
      return {
        document_product_id: product.id,
        product_name: product.product_name,
        candidates: [{
          item_id: weakCandidate.item_id,
          item_name: weakCandidate.item_name,
          match_status: 'no_match',
          match_score: weakCandidate.score,
          match_basis: weakCandidate.match_basis,
          match_signal_tier: 'fallback',
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
          matchBasis: candidate.match_basis,
          matchSignalTier: candidate.match_signal_tier,
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
  ).all(venueId ?? null, venueId ?? null) as Array<Omit<InventoryItemRecord, 'aliases'>>;

  const aliasesByItemId = new Map<number, string[]>();
  const itemIds = rows.map((row) => row.id);
  if (itemIds.length > 0 && tableExists(db, 'allergen_match_aliases')) {
    const placeholders = itemIds.map(() => '?').join(', ');
    const aliasRows = db.prepare(
      `
        SELECT item_id, alias
        FROM allergen_match_aliases
        WHERE active = 1
          AND item_id IN (${placeholders})
        ORDER BY alias COLLATE NOCASE ASC, id ASC
      `,
    ).all(...itemIds) as Array<{ item_id: number; alias: string }>;

    for (const row of aliasRows) {
      const existing = aliasesByItemId.get(row.item_id) ?? [];
      existing.push(row.alias);
      aliasesByItemId.set(row.item_id, existing);
    }
  }

  return rows.map((row) => ({
    ...row,
    aliases: aliasesByItemId.get(row.id) ?? [],
  }));
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
    matchBasis: AllergyDocumentMatchBasis;
    matchSignalTier: AllergyDocumentMatchSignalTier;
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
  if (matchTable.basisColumn) {
    values[matchTable.basisColumn] = input.matchBasis;
  }
  if (matchTable.signalTierColumn) {
    values[matchTable.signalTierColumn] = input.matchSignalTier;
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
  basisColumn: string | null;
  signalTierColumn: string | null;
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
    basisColumn: pickFirstExistingColumn(columns, ['match_basis']),
    signalTierColumn: pickFirstExistingColumn(columns, ['match_signal_tier']),
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

export function normalizeAllergenMatchText(input: string): string {
  let normalized = input;
  for (const [pattern, replacement] of KNOWN_NON_LATIN_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalized.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  for (const [pattern, replacement] of KNOWN_NON_LATIN_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSearchText(input: string): string[] {
  return normalizeAllergenMatchText(input)
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .filter((token) => !/^\d+$/.test(token))
    .map(normalizeConfusableToken)
    .map(singularizeToken)
    .filter((token) => token.length >= 3)
    .filter((token) => !NOISE_TOKENS.has(token));
}

function singularizeToken(token: string): string {
  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith('oes') && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith('es') && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith('s') && token.length > 3) {
    return token.slice(0, -1);
  }
  return token;
}

function normalizeConfusableToken(token: string): string {
  if (!/[a-z]/.test(token) || !/\d/.test(token)) {
    return token;
  }

  return token.replace(/[0134568]/g, (char) => OCR_CONFUSABLE_CHAR_MAP[char] ?? char);
}

function buildMatchingProfile(input: string): MatchingProfile {
  const tokens = tokenizeSearchText(input);
  return {
    normalized: tokens.join(' '),
    tokens,
  };
}

function buildTokenDocumentFrequency(tokenLists: string[][]): Map<string, number> {
  const frequency = new Map<string, number>();

  for (const tokenList of tokenLists) {
    for (const token of new Set(tokenList)) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
  }

  return frequency;
}

function tokenWeight(token: string, frequency: Map<string, number>): number {
  const documentFrequency = frequency.get(token) ?? 1;
  return 1 / Math.sqrt(documentFrequency);
}

function diceCoefficient(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  if (left.length < 2 || right.length < 2) {
    return 0;
  }

  const leftBigrams = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index += 1) {
    const bigram = left.slice(index, index + 2);
    leftBigrams.set(bigram, (leftBigrams.get(bigram) ?? 0) + 1);
  }

  let overlap = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const bigram = right.slice(index, index + 2);
    const count = leftBigrams.get(bigram) ?? 0;
    if (count > 0) {
      overlap += 1;
      leftBigrams.set(bigram, count - 1);
    }
  }

  return (2 * overlap) / ((left.length - 1) + (right.length - 1));
}

function maxTokenSimilarity(leftTokens: string[], rightTokens: string[]): number {
  let max = 0;
  for (const left of leftTokens) {
    for (const right of rightTokens) {
      max = Math.max(max, diceCoefficient(left, right));
    }
  }
  return max;
}

function scoreProductToItem(
  product: AllergyDocumentProductRecord,
  itemProfile: InventoryItemMatchProfile,
  tokenDocumentFrequency: Map<string, number>,
): ScoredMatchCandidate | null {
  const productNameProfile = buildMatchingProfile(product.product_name);
  const normalizedProductProfile = buildMatchingProfile(product.normalized_product_name);
  let bestCandidate: ScoredMatchCandidate | null = null;

  for (const target of itemProfile.profiles) {
    const primaryScore = Math.max(
      scoreTextOverlap(productNameProfile, target.profile, tokenDocumentFrequency),
      scoreTextOverlap(normalizedProductProfile, target.profile, tokenDocumentFrequency),
    );
    if (primaryScore <= 0) {
      continue;
    }

    const corroborationScore = Math.max(
      scoreTextOverlap(buildMatchingProfile(product.source_row_text), target.profile, tokenDocumentFrequency),
      scoreTextOverlap(buildMatchingProfile(product.allergen_summary ?? ''), target.profile, tokenDocumentFrequency),
      scoreTextOverlap(buildMatchingProfile(product.dietary_notes ?? ''), target.profile, tokenDocumentFrequency),
    );

    const boostedScore = Math.min(
      1,
      primaryScore + (corroborationScore * 0.08) + (target.match_basis === 'explicit_alias' ? 0.08 : 0),
    );
    const candidate: ScoredMatchCandidate = {
      item_id: itemProfile.item.id,
      item_name: itemProfile.item.name,
      score: boostedScore,
      match_basis: target.match_basis,
      match_signal_tier: deriveSignalTier(boostedScore, target.match_basis),
      matched_text: target.matched_text,
    };

    if (!bestCandidate
      || signalTierRank(candidate.match_signal_tier) < signalTierRank(bestCandidate.match_signal_tier)
      || (candidate.match_signal_tier === bestCandidate.match_signal_tier && candidate.score > bestCandidate.score)) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function deriveSignalTier(
  score: number,
  matchBasis: Exclude<AllergyDocumentMatchBasis, 'operator'>,
): Exclude<AllergyDocumentMatchSignalTier, 'operator'> {
  if ((matchBasis === 'explicit_alias' && score >= 0.52) || score >= 0.62) {
    return 'high';
  }
  if ((matchBasis === 'explicit_alias' && score >= STRONG_MATCH_THRESHOLD) || score >= 0.36) {
    return 'medium';
  }
  return 'fallback';
}

function signalTierRank(signalTier: AllergyDocumentMatchSignalTier): number {
  switch (signalTier) {
    case 'high':
      return 0;
    case 'medium':
      return 1;
    case 'fallback':
      return 2;
    case 'operator':
      return 3;
    default:
      return 4;
  }
}

function scoreTextOverlap(
  leftProfile: MatchingProfile,
  rightProfile: MatchingProfile,
  tokenDocumentFrequency: Map<string, number>,
): number {
  if (!leftProfile.normalized || !rightProfile.normalized) {
    return 0;
  }

  if (leftProfile.normalized === rightProfile.normalized) {
    return 1;
  }

  const leftSet = new Set(leftProfile.tokens);
  const rightSet = new Set(rightProfile.tokens);
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  const sharedTokens = Array.from(leftSet).filter((token) => rightSet.has(token));
  const fuzzyTokenScore = maxTokenSimilarity(leftProfile.tokens, rightProfile.tokens);
  if (sharedTokens.length === 0 && fuzzyTokenScore < 0.88) {
    return 0;
  }

  const weightedShared = sharedTokens.reduce((total, token) => total + tokenWeight(token, tokenDocumentFrequency), 0);
  const weightedLeft = Array.from(leftSet).reduce((total, token) => total + tokenWeight(token, tokenDocumentFrequency), 0);
  const weightedRight = Array.from(rightSet).reduce((total, token) => total + tokenWeight(token, tokenDocumentFrequency), 0);
  const leftCoverage = weightedLeft > 0 ? weightedShared / weightedLeft : 0;
  const rightCoverage = weightedRight > 0 ? weightedShared / weightedRight : 0;
  const phraseBoost = leftProfile.normalized.includes(rightProfile.normalized) || rightProfile.normalized.includes(leftProfile.normalized) ? 0.16 : 0;
  const firstTokenBoost = leftProfile.tokens[0] === rightProfile.tokens[0] ? 0.08 : 0;
  const anchorBoost = sharedTokens.some((token) => token.length >= 6 || tokenWeight(token, tokenDocumentFrequency) >= 0.75) ? 0.08 : 0;
  const fuzzyBoost = fuzzyTokenScore >= 0.9 ? 0.1 : fuzzyTokenScore >= 0.82 ? 0.05 : 0;
  const dice = diceCoefficient(leftProfile.normalized, rightProfile.normalized);

  let score = (leftCoverage * 0.4)
    + (rightCoverage * 0.22)
    + (dice * 0.16)
    + phraseBoost
    + firstTokenBoost
    + anchorBoost
    + fuzzyBoost;

  const unmatchedLeftTokens = leftProfile.tokens.filter((token) => !rightSet.has(token));
  const unmatchedRightTokens = rightProfile.tokens.filter((token) => !leftSet.has(token));
  const unmatchedSimilarity = maxTokenSimilarity(unmatchedLeftTokens, unmatchedRightTokens);
  if (sharedTokens.length === 1 && phraseBoost === 0 && unmatchedSimilarity < 0.75 && leftSet.size > 1 && rightSet.size > 1) {
    score = Math.min(score, 0.31);
  }

  if (sharedTokens.length === 0) {
    score = Math.min(score, 0.2);
  }

  return Math.min(1, score);
}

function buildSuggestedMatchNote(
  product: AllergyDocumentProductRecord,
  _itemName: string,
  score: number,
  matchBasis: AllergyDocumentMatchBasis,
  matchedText: string,
): string {
  const sharedTokens = findSharedTokens(product, matchedText);
  const basisLabel = matchBasis === 'explicit_alias' ? 'alias' : 'name';
  if (sharedTokens.length > 0) {
    return `Automated ${basisLabel} match on ${sharedTokens.join(', ')} (${Math.round(score * 100)}% confidence).`;
  }

  return `Automated ${basisLabel} overlap suggests a likely match (${Math.round(score * 100)}% confidence).`;
}

function findSharedTokens(product: AllergyDocumentProductRecord, candidateText: string): string[] {
  const productTokens = new Set([
    ...tokenizeSearchText(product.product_name),
    ...tokenizeSearchText(product.normalized_product_name),
    ...tokenizeSearchText(product.source_row_text),
  ]);
  const candidateTokens = new Set(tokenizeSearchText(candidateText));
  return Array.from(productTokens).filter((token) => candidateTokens.has(token));
}
