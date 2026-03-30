import type {
  ExternalProductMatchBasis,
  ExternalProductMatchConfidence,
  ExternalProductMatchStatus,
  Item,
  VendorPrice,
} from '@fifoflow/shared';
import { tokenizeInvoiceItemName } from '../routes/invoiceMatching.js';
import {
  ExternalProductRepository,
  type ExternalProductMatchRecord,
  type ExternalProductRecord,
} from './externalProductRepositories.js';

interface MatchCandidate {
  product: ExternalProductRecord;
  vendor_price_id: number | null;
  match_basis: ExternalProductMatchBasis;
  match_confidence: ExternalProductMatchConfidence;
  match_status: ExternalProductMatchStatus;
  match_score: number | null;
  notes: string | null;
}

export class ExternalProductMatchService {
  constructor(private readonly repository: ExternalProductRepository) {}

  evaluateItem(itemId: number, vendorPriceId?: number | null): ExternalProductMatchRecord[] {
    const item = this.repository.getItem(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    const vendorPrices = this.repository.listVendorPricesForItem(itemId);
    const scopedVendorPrices = vendorPriceId != null
      ? vendorPrices.filter((vendorPrice) => vendorPrice.id === vendorPriceId)
      : vendorPrices;

    const candidateMap = new Map<number, MatchCandidate>();

    this.collectIdentifierCandidates(item, scopedVendorPrices, candidateMap);
    if (candidateMap.size === 0) {
      this.collectNamePackCandidates(item, scopedVendorPrices, candidateMap);
    }

    const orderedCandidates = [...candidateMap.values()].sort(compareCandidates);
    const persistedMatches = orderedCandidates.slice(0, 8).map((candidate) => this.repository.upsertMatch({
      item_id: item.id,
      vendor_price_id: candidate.vendor_price_id,
      external_product_id: candidate.product.id,
      match_status: candidate.match_status,
      match_basis: candidate.match_basis,
      match_confidence: candidate.match_confidence,
      match_score: candidate.match_score,
      matched_by: 'system',
      notes: candidate.notes,
      active: 1,
    }));

    this.repository.updateItemMatchSnapshot(item.id, persistedMatches[0]?.match_confidence ?? null);
    return persistedMatches;
  }

  private collectIdentifierCandidates(
    item: Item,
    vendorPrices: VendorPrice[],
    candidateMap: Map<number, MatchCandidate>,
  ): void {
    const identifierSearches: Array<{
      basis: ExternalProductMatchBasis;
      value: string | null | undefined;
      vendor_price_id: number | null;
    }> = [];

    const prioritizedVendorPrice = vendorPrices[0] ?? null;
    const primaryVendorPriceIds = vendorPrices.length > 0 ? vendorPrices : [null];

    for (const vendorPrice of primaryVendorPriceIds) {
      identifierSearches.push(
        { basis: 'sysco_supc', value: vendorPrice?.sysco_supc ?? item.sysco_supc, vendor_price_id: vendorPrice?.id ?? null },
        { basis: 'gtin', value: vendorPrice?.gtin ?? item.gtin, vendor_price_id: vendorPrice?.id ?? null },
        { basis: 'upc', value: vendorPrice?.upc ?? item.upc, vendor_price_id: vendorPrice?.id ?? null },
        { basis: 'vendor_item_code', value: vendorPrice?.vendor_item_code ?? item.manufacturer_item_code, vendor_price_id: vendorPrice?.id ?? prioritizedVendorPrice?.id ?? null },
      );
    }

    for (const search of identifierSearches) {
      const trimmed = search.value?.trim();
      if (!trimmed) continue;
      const products = this.repository.searchExternalProducts({
        limit: 10,
        [search.basis]: trimmed,
      });
      if (products.length === 0) continue;

      const autoConfirm = products.length === 1;
      for (const product of products) {
        registerCandidate(candidateMap, {
          product,
          vendor_price_id: search.vendor_price_id,
          match_basis: search.basis,
          match_confidence: 'high',
          match_status: autoConfirm ? 'auto_confirmed' : 'suggested',
          match_score: 1,
          notes: autoConfirm
            ? `Exact ${search.basis} match`
            : `Multiple products share ${search.basis}`,
        });
      }
    }
  }

  private collectNamePackCandidates(
    item: Item,
    vendorPrices: VendorPrice[],
    candidateMap: Map<number, MatchCandidate>,
  ): void {
    const searchInputs = buildSearchInputs(item, vendorPrices);
    for (const input of searchInputs) {
      const products = this.repository.searchExternalProducts({
        query: input.text,
        limit: 12,
      });

      for (const product of products) {
        const score = buildNamePackScore(input.text, product.product_name, input.pack_text, product.pack_text);
        if (score < 0.35) continue;

        const confidence: ExternalProductMatchConfidence = score >= 0.8
          ? 'high'
          : score >= 0.58
            ? 'medium'
            : 'low';

        registerCandidate(candidateMap, {
          product,
          vendor_price_id: input.vendor_price_id,
          match_basis: 'name_pack',
          match_confidence: confidence,
          match_status: 'suggested',
          match_score: Number(score.toFixed(4)),
          notes: input.pack_text
            ? `Ranked by name and pack similarity from ${input.source_label}`
            : `Ranked by normalized name similarity from ${input.source_label}`,
        });
      }
    }
  }
}

function buildSearchInputs(item: Item, vendorPrices: VendorPrice[]): Array<{
  text: string;
  pack_text: string | null;
  vendor_price_id: number | null;
  source_label: string;
}> {
  const seen = new Set<string>();
  const inputs: Array<{
    text: string;
    pack_text: string | null;
    vendor_price_id: number | null;
    source_label: string;
  }> = [];

  const register = (text: string | null | undefined, packText: string | null | undefined, vendorPriceId: number | null, sourceLabel: string) => {
    const normalized = text?.trim();
    if (!normalized) return;
    const key = `${vendorPriceId ?? 'item'}::${normalized.toLowerCase()}::${packText?.toLowerCase() ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    inputs.push({
      text: normalized,
      pack_text: packText?.trim() || null,
      vendor_price_id: vendorPriceId,
      source_label: sourceLabel,
    });
  };

  register(item.name, null, null, 'inventory name');
  for (const vendorPrice of vendorPrices) {
    register(vendorPrice.vendor_item_name, vendorPrice.vendor_pack_text, vendorPrice.id, vendorPrice.vendor_name ?? 'vendor price');
  }

  return inputs;
}

function buildNamePackScore(
  sourceName: string,
  candidateName: string,
  sourcePack: string | null,
  candidatePack: string | null,
): number {
  const leftTokens = tokenizeInvoiceItemName(sourceName);
  const rightTokens = tokenizeInvoiceItemName(candidateName);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const overlap = leftTokens.filter((token) => rightSet.has(token)).length;
  const coverageLeft = overlap / leftSet.size;
  const coverageRight = overlap / rightSet.size;
  const phraseBonus = normalizeName(sourceName) === normalizeName(candidateName) ? 0.2 : 0;

  let packBonus = 0;
  if (sourcePack && candidatePack) {
    const sourcePackNormalized = normalizeName(sourcePack);
    const candidatePackNormalized = normalizeName(candidatePack);
    if (sourcePackNormalized === candidatePackNormalized) {
      packBonus = 0.18;
    } else if (
      sourcePackNormalized.includes(candidatePackNormalized)
      || candidatePackNormalized.includes(sourcePackNormalized)
    ) {
      packBonus = 0.08;
    }
  }

  return Math.min(1, (coverageLeft * 0.5) + (coverageRight * 0.3) + phraseBonus + packBonus);
}

function normalizeName(input: string): string {
  return tokenizeInvoiceItemName(input).join(' ');
}

function registerCandidate(
  candidateMap: Map<number, MatchCandidate>,
  candidate: MatchCandidate,
): void {
  const existing = candidateMap.get(candidate.product.id);
  if (!existing || compareCandidates(candidate, existing) < 0) {
    candidateMap.set(candidate.product.id, candidate);
  }
}

function compareCandidates(left: MatchCandidate, right: MatchCandidate): number {
  const statusRank = (status: ExternalProductMatchStatus) => {
    switch (status) {
      case 'auto_confirmed':
        return 0;
      case 'confirmed':
        return 1;
      case 'suggested':
        return 2;
      case 'rejected':
        return 3;
      default:
        return 4;
    }
  };
  const confidenceRank = (confidence: ExternalProductMatchConfidence) => {
    switch (confidence) {
      case 'high':
        return 0;
      case 'medium':
        return 1;
      default:
        return 2;
    }
  };

  return (
    statusRank(left.match_status) - statusRank(right.match_status)
    || confidenceRank(left.match_confidence) - confidenceRank(right.match_confidence)
    || (right.match_score ?? 0) - (left.match_score ?? 0)
    || left.product.product_name.localeCompare(right.product.product_name)
  );
}
