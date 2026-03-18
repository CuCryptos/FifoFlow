import type { Item } from '@fifoflow/shared';

export interface InvoiceVendorPriceMatchRecord {
  id: number;
  item_id: number;
  vendor_id: number;
  vendor_item_name: string | null;
}

export interface InvoiceLineMatchResult {
  matched_item_id: number | null;
  matched_item_name: string | null;
  match_confidence: 'exact' | 'high' | 'low' | 'none';
  existing_vendor_price_id: number | null;
  suggested_matches: Array<{
    item_id: number;
    item_name: string;
    match_confidence: 'high' | 'low';
    match_score: number;
    existing_vendor_price_id: number | null;
    matched_via: 'vendor_alias' | 'inventory_name';
  }>;
}

type InvoiceSuggestionConfidence = 'high' | 'low';

interface CandidateMatch {
  itemId: number;
  itemName: string;
  vendorPriceId: number | null;
  score: number;
  exact: boolean;
  matchedVia: 'vendor_alias' | 'inventory_name';
}

const NOISE_TOKENS = new Set([
  'a',
  'an',
  'and',
  'case',
  'cs',
  'ct',
  'count',
  'ea',
  'each',
  'pc',
  'pcs',
  'pk',
  'pack',
  'pkg',
  'bag',
  'box',
  'bottle',
  'bottles',
  'btl',
  'btls',
  'jar',
  'tray',
  'can',
  'tin',
  'lb',
  'lbs',
  'oz',
  'floz',
  'fl',
  'ml',
  'l',
  'ltr',
  'qt',
  'pt',
  'gal',
  'kg',
  'g',
  'doz',
  'dozen',
  'x',
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

function normalizeForSimilarity(input: string): string {
  return input
    .replace(/[0134568]/g, (char) => OCR_CONFUSABLE_CHAR_MAP[char] ?? char)
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeInvoiceItemName(input: string): string {
  return tokenizeInvoiceItemName(input).join(' ');
}

export function tokenizeInvoiceItemName(input: string): string[] {
  const collapsed = input
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  if (!collapsed) {
    return [];
  }

  return collapsed
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !/^\d+[a-z]+$/.test(token))
    .filter((token) => !/^[a-z]+\d+$/.test(token))
    .map(normalizeConfusableToken)
    .map(singularizeToken)
    .filter((token) => token.length > 1)
    .filter((token) => !NOISE_TOKENS.has(token));
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
      max = Math.max(max, diceCoefficient(normalizeForSimilarity(left), normalizeForSimilarity(right)));
    }
  }
  return max;
}

function buildCandidateScore(invoiceName: string, candidateName: string): { score: number; exact: boolean } {
  const invoiceTokens = tokenizeInvoiceItemName(invoiceName);
  const candidateTokens = tokenizeInvoiceItemName(candidateName);
  const invoiceNormalized = invoiceTokens.join(' ');
  const candidateNormalized = candidateTokens.join(' ');

  if (!invoiceTokens.length || !candidateTokens.length) {
    return { score: 0, exact: false };
  }

  const exact = invoiceNormalized === candidateNormalized;
  if (exact) {
    return { score: 1, exact: true };
  }

  const invoiceSet = new Set(invoiceTokens);
  const candidateSet = new Set(candidateTokens);
  const overlapCount = invoiceTokens.filter((token) => candidateSet.has(token)).length;
  const invoiceCoverage = overlapCount / invoiceSet.size;
  const candidateCoverage = overlapCount / candidateSet.size;
  const unmatchedInvoiceTokens = invoiceTokens.filter((token) => !candidateSet.has(token));
  const unmatchedCandidateTokens = candidateTokens.filter((token) => !invoiceSet.has(token));
  const phraseBoost = invoiceNormalized.includes(candidateNormalized) || candidateNormalized.includes(invoiceNormalized) ? 0.15 : 0;
  const firstTokenBoost = invoiceTokens[0] === candidateTokens[0] ? 0.08 : 0;
  const dice = diceCoefficient(
    normalizeForSimilarity(invoiceNormalized),
    normalizeForSimilarity(candidateNormalized),
  );
  const score = (invoiceCoverage * 0.45) + (candidateCoverage * 0.25) + (dice * 0.22) + phraseBoost + firstTokenBoost;

  const minimumOverlap = invoiceTokens.length === 1 || candidateTokens.length === 1 ? 1 : 2;
  if (overlapCount < minimumOverlap && phraseBoost === 0) {
    const strongSingleTokenPartial = overlapCount >= 1
      && firstTokenBoost > 0
      && maxTokenSimilarity(unmatchedInvoiceTokens, unmatchedCandidateTokens) >= 0.5;
    if (!strongSingleTokenPartial) {
      return { score: 0, exact: false };
    }
  }

  return { score, exact: false };
}

function collapseBestCandidate(candidates: CandidateMatch[]): CandidateMatch | null {
  if (!candidates.length) {
    return null;
  }

  const byItem = new Map<number, CandidateMatch>();
  for (const candidate of candidates) {
    const existing = byItem.get(candidate.itemId);
    if (!existing || candidate.score > existing.score || (candidate.score === existing.score && candidate.vendorPriceId != null && existing.vendorPriceId == null)) {
      byItem.set(candidate.itemId, candidate);
    }
  }

  return [...byItem.values()]
    .sort((left, right) => right.score - left.score || left.itemName.localeCompare(right.itemName))[0] ?? null;
}

function collapseTopCandidates(candidates: CandidateMatch[]): CandidateMatch[] {
  const byItem = new Map<number, CandidateMatch>();
  for (const candidate of candidates) {
    const existing = byItem.get(candidate.itemId);
    if (!existing || candidate.score > existing.score || (candidate.score === existing.score && candidate.vendorPriceId != null && existing.vendorPriceId == null)) {
      byItem.set(candidate.itemId, candidate);
    }
  }

  return [...byItem.values()]
    .filter((candidate) => candidate.exact || candidate.score >= 0.42)
    .sort((left, right) => right.score - left.score || left.itemName.localeCompare(right.itemName))
    .slice(0, 3);
}

export function matchInvoiceLineToInventory(
  vendorItemName: string,
  items: Item[],
  vendorPrices: InvoiceVendorPriceMatchRecord[],
): InvoiceLineMatchResult {
  const candidates: CandidateMatch[] = [];

  for (const vendorPrice of vendorPrices) {
    if (!vendorPrice.vendor_item_name) {
      continue;
    }
    const item = items.find((entry) => entry.id === vendorPrice.item_id);
    if (!item) {
      continue;
    }
    const score = buildCandidateScore(vendorItemName, vendorPrice.vendor_item_name);
    if (score.score <= 0) {
      continue;
    }
    candidates.push({
      itemId: item.id,
      itemName: item.name,
      vendorPriceId: vendorPrice.id,
      score: Math.min(1, score.score + 0.08),
      exact: score.exact,
      matchedVia: 'vendor_alias',
    });
  }

  for (const item of items) {
    const score = buildCandidateScore(vendorItemName, item.name);
    if (score.score <= 0) {
      continue;
    }
    candidates.push({
      itemId: item.id,
      itemName: item.name,
      vendorPriceId: null,
      score: score.score,
      exact: score.exact,
      matchedVia: 'inventory_name',
    });
  }

  const best = collapseBestCandidate(candidates);
  const suggestions = collapseTopCandidates(candidates)
    .map((candidate) => {
      const confidence: InvoiceSuggestionConfidence = candidate.exact || candidate.score >= 0.8 ? 'high' : 'low';
      return {
        item_id: candidate.itemId,
        item_name: candidate.itemName,
        match_confidence: confidence,
        match_score: Math.round(candidate.score * 100) / 100,
        existing_vendor_price_id: candidate.vendorPriceId,
        matched_via: candidate.matchedVia,
      };
    });

  if (!best) {
    return {
      matched_item_id: null,
      matched_item_name: null,
      match_confidence: 'none',
      existing_vendor_price_id: null,
      suggested_matches: [],
    };
  }

  const matchConfidence = best.exact || best.score >= 0.97
    ? 'exact'
    : best.score >= 0.86
      ? 'high'
    : best.score >= 0.62
      ? 'low'
      : 'none';

  if (matchConfidence === 'low') {
    return {
      matched_item_id: null,
      matched_item_name: null,
      match_confidence: 'low',
      existing_vendor_price_id: null,
      suggested_matches: suggestions,
    };
  }

  if (matchConfidence === 'none') {
    return {
      matched_item_id: null,
      matched_item_name: null,
      match_confidence: 'none',
      existing_vendor_price_id: null,
      suggested_matches: suggestions,
    };
  }

  return {
    matched_item_id: best.itemId,
    matched_item_name: best.itemName,
    match_confidence: matchConfidence,
    existing_vendor_price_id: best.vendorPriceId,
    suggested_matches: suggestions,
  };
}
