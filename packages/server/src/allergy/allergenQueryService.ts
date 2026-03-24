import {
  type AllergenConfidence,
  type AllergenReference,
  type AllergenStatus,
  SQLiteAllergenRepository,
} from './allergenRepositories.js';

const CONFIDENCE_RANK: Record<AllergenConfidence, number> = {
  verified: 5,
  high: 4,
  moderate: 3,
  low: 2,
  unverified: 1,
  unknown: 0,
};

export interface StructuredAllergenQueryResponse {
  allergen_codes: string[];
  safe: StructuredQueryProductResult[];
  modifiable: StructuredQueryProductResult[];
  unsafe: StructuredQueryProductResult[];
  unknown: StructuredQueryProductResult[];
}

export interface StructuredQueryProductResult {
  product_id: number;
  document_id: number;
  filename: string;
  page_number: number;
  product_name: string;
  matched_item_id: number | null;
  matched_item_name: string | null;
  rationale: string;
  source: 'item_profile' | 'document_evidence';
  relevant_evidence: string[];
}

export class AllergenQueryService {
  constructor(private readonly repository: SQLiteAllergenRepository) {}

  queryChartProducts(input: {
    question: string;
    allergen_codes?: string[];
    venue_id?: number | null;
    document_ids?: number[];
    created_by?: string | null;
  }): StructuredAllergenQueryResponse {
    const allergens = this.repository.listAllergensReference();
    const allergenCodes = resolveAllergenCodes(allergens, input.question, input.allergen_codes ?? []);
    if (allergenCodes.length === 0) {
      throw new Error('No allergen codes could be resolved from the request');
    }

    const allowedDocumentIds = new Set(input.document_ids ?? []);
    const products = this.repository.listStructuredQueryProducts(input.venue_id ?? null)
      .filter((product) => allowedDocumentIds.size === 0 || allowedDocumentIds.has(product.document_id));
    const itemIds = Array.from(new Set(products.flatMap((product) => product.matches.map((match) => match.item_id))));
    const itemAllergenRows = this.repository.getItemAllergenRowsForItems(itemIds);
    const itemAllergenByKey = new Map(itemAllergenRows.map((row) => [`${row.item_id}:${row.allergen_id}`, row]));
    const allergenIdByCode = new Map(allergens.map((allergen) => [allergen.code, allergen.id]));

    const response: StructuredAllergenQueryResponse = {
      allergen_codes: allergenCodes,
      safe: [],
      modifiable: [],
      unsafe: [],
      unknown: [],
    };

    for (const product of products) {
      const result = classifyStructuredProduct({
        product,
        allergenCodes,
        allergenIdByCode,
        itemAllergenByKey,
      });
      switch (result.bucket) {
        case 'safe':
          response.safe.push(result.payload);
          break;
        case 'modifiable':
          response.modifiable.push(result.payload);
          break;
        case 'unsafe':
          response.unsafe.push(result.payload);
          break;
        case 'unknown':
          response.unknown.push(result.payload);
          break;
      }
    }

    for (const bucket of [response.safe, response.modifiable, response.unsafe, response.unknown]) {
      bucket.sort((left, right) => left.product_name.localeCompare(right.product_name, undefined, { sensitivity: 'base' }));
    }

    this.repository.recordQueryAudit({
      venue_id: input.venue_id ?? null,
      query_text: input.question,
      allergen_codes: allergenCodes,
      response_summary: `safe=${response.safe.length}; modifiable=${response.modifiable.length}; unsafe=${response.unsafe.length}; unknown=${response.unknown.length}`,
      created_by: input.created_by ?? null,
    });

    return response;
  }
}

function classifyStructuredProduct(input: {
  product: ReturnType<SQLiteAllergenRepository['listStructuredQueryProducts']>[number];
  allergenCodes: string[];
  allergenIdByCode: Map<string, number>;
  itemAllergenByKey: Map<string, { status: AllergenStatus; confidence: AllergenConfidence; notes: string | null }>;
}): { bucket: keyof StructuredAllergenQueryResponse; payload: StructuredQueryProductResult } {
  const preferredMatch = input.product.matches.find((match) => match.match_status === 'confirmed')
    ?? input.product.matches.find((match) => match.match_status === 'suggested');

  if (preferredMatch) {
    const relevantRows = input.allergenCodes.map((allergenCode) => {
      const allergenId = input.allergenIdByCode.get(allergenCode);
      return allergenId == null ? null : input.itemAllergenByKey.get(`${preferredMatch.item_id}:${allergenId}`) ?? null;
    });

    if (relevantRows.some((row) => row?.status === 'contains')) {
      return {
        bucket: 'unsafe',
        payload: {
          product_id: input.product.product_id,
          document_id: input.product.document_id,
          filename: input.product.filename,
          page_number: input.product.page_number,
          product_name: input.product.product_name,
          matched_item_id: preferredMatch.item_id,
          matched_item_name: preferredMatch.item_name,
          rationale: `${preferredMatch.item_name} is marked contains for at least one requested allergen.`,
          source: 'item_profile',
          relevant_evidence: input.allergenCodes.map((allergenCode) => `item:${preferredMatch.item_name}:${allergenCode}`),
        },
      };
    }

    if (relevantRows.some((row) => row?.status === 'may_contain')) {
      return {
        bucket: 'modifiable',
        payload: {
          product_id: input.product.product_id,
          document_id: input.product.document_id,
          filename: input.product.filename,
          page_number: input.product.page_number,
          product_name: input.product.product_name,
          matched_item_id: preferredMatch.item_id,
          matched_item_name: preferredMatch.item_name,
          rationale: `${preferredMatch.item_name} is marked may_contain and still needs kitchen confirmation.`,
          source: 'item_profile',
          relevant_evidence: input.allergenCodes.map((allergenCode) => `item:${preferredMatch.item_name}:${allergenCode}`),
        },
      };
    }

    const allExplicitlyFree = relevantRows.length > 0
      && relevantRows.every((row) => row != null && row.status === 'free_of' && CONFIDENCE_RANK[row.confidence] >= CONFIDENCE_RANK.moderate);
    if (allExplicitlyFree) {
      return {
        bucket: 'safe',
        payload: {
          product_id: input.product.product_id,
          document_id: input.product.document_id,
          filename: input.product.filename,
          page_number: input.product.page_number,
          product_name: input.product.product_name,
          matched_item_id: preferredMatch.item_id,
          matched_item_name: preferredMatch.item_name,
          rationale: `${preferredMatch.item_name} is explicitly free_of for the requested allergen set.`,
          source: 'item_profile',
          relevant_evidence: input.allergenCodes.map((allergenCode) => `item:${preferredMatch.item_name}:${allergenCode}`),
        },
      };
    }
  }

  return classifyFromDocumentEvidence(input.product, input.allergenCodes);
}

function classifyFromDocumentEvidence(
  product: ReturnType<SQLiteAllergenRepository['listStructuredQueryProducts']>[number],
  allergenCodes: string[],
): { bucket: keyof StructuredAllergenQueryResponse; payload: StructuredQueryProductResult } {
  const evidenceText = normalizeSearchText([
    product.product_name,
    product.source_row_text,
    product.allergen_summary ?? '',
    product.dietary_notes ?? '',
    ...product.chunk_texts,
  ].join(' '));

  let bucket: keyof StructuredAllergenQueryResponse = 'unknown';
  let rationale = 'No structured item profile or clear chart signal could classify this product yet.';
  const allergenTerms = allergenCodes.flatMap((code) => buildSearchTokens({
    id: 0,
    code,
    name: code,
    category: '',
    icon: null,
    sort_order: 0,
    is_active: true,
  }));
  const hasContains = allergenTerms.some((term) => evidenceText.includes(`contains ${term}`) || evidenceText.includes(`${term} contains`));
  const hasMayContain = evidenceText.includes('may contain') || evidenceText.includes('cross contact') || evidenceText.includes('shared fryer');
  const hasFreeSignal = allergenTerms.some((term) => evidenceText.includes(`${term} free`) || evidenceText.includes(`free of ${term}`));

  if (hasFreeSignal && !hasMayContain) {
    bucket = 'safe';
    rationale = 'Document evidence explicitly marks this product free of the requested allergen.';
  } else if (hasMayContain) {
    bucket = 'modifiable';
    rationale = 'Document evidence indicates may-contain or cross-contact risk.';
  } else if (hasContains) {
    bucket = 'unsafe';
    rationale = 'Document evidence indicates the requested allergen is present.';
  }

  return {
    bucket,
    payload: {
      product_id: product.product_id,
      document_id: product.document_id,
      filename: product.filename,
      page_number: product.page_number,
      product_name: product.product_name,
      matched_item_id: null,
      matched_item_name: null,
      rationale,
      source: 'document_evidence',
      relevant_evidence: [product.source_row_text, ...product.chunk_texts].filter((value) => value.length > 0).slice(0, 3),
    },
  };
}

function resolveAllergenCodes(allergens: AllergenReference[], question: string, explicitCodes: string[]): string[] {
  const cleanedExplicit = explicitCodes.map((code) => code.trim().toLowerCase()).filter((code) => code.length > 0);
  if (cleanedExplicit.length > 0) {
    return Array.from(new Set(cleanedExplicit));
  }

  const normalizedQuestion = normalizeSearchText(question);
  const resolved: string[] = [];
  for (const allergen of allergens) {
    for (const token of buildSearchTokens(allergen)) {
      if (normalizedQuestion.includes(token)) {
        resolved.push(allergen.code);
        break;
      }
    }
  }
  return Array.from(new Set(resolved));
}

function buildSearchTokens(allergen: AllergenReference): string[] {
  const tokens = new Set<string>([
    normalizeSearchText(allergen.code.replace(/_/g, ' ')),
    normalizeSearchText(allergen.name),
  ]);
  if (allergen.code === 'milk') tokens.add('dairy');
  if (allergen.code === 'tree_nut') {
    tokens.add('tree nut');
    tokens.add('tree nuts');
  }
  if (allergen.code === 'shellfish') tokens.add('shellfish');
  return Array.from(tokens);
}

function normalizeSearchText(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
