import { Router } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import type Database from 'better-sqlite3';
import { initializeAllergyAssistantDb } from '../allergy/persistence/sqliteSchema.js';
import { refreshAllergyDocumentProductMatches } from '../allergy/allergenMatchService.js';
import { extractPdfEvidence, type InvoiceDocumentPageEvidence } from './invoiceDocumentExtraction.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, PNG, JPEG, and WebP files are supported'));
    }
  },
});

interface AllergyDocumentSummary {
  id: number;
  venue_id: number | null;
  filename: string;
  mime_type: string;
  page_count: number;
  chunk_count: number;
  product_count: number;
  status: 'ready' | 'failed';
  created_at: string;
  updated_at: string;
}

interface AllergyDocumentChunkRecord {
  id: number;
  document_id: number;
  page_id: number;
  page_number: number;
  chunk_index: number;
  chunk_text: string;
}

interface AllergyDocumentProductRecord {
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

interface PersistedAllergyDocumentProductInput {
  page_number: number;
  product_name: string;
  normalized_product_name: string;
  source_row_text: string;
  allergen_summary: string | null;
  dietary_notes: string | null;
  source_chunk_indexes: number[];
}

interface ExtractedAllergyProductRow {
  page_number: number;
  product_name: string;
  source_row_text: string;
  allergen_summary: string | null;
  dietary_notes: string | null;
}

interface AllergyChatItem {
  product_id: number;
  product_name: string;
  rationale: string;
  evidence_chunk_ids: number[];
}

interface AllergyChatResponsePayload {
  allergen_focus: string | null;
  answer_markdown: string;
  safe_items: AllergyChatItem[];
  avoid_items: AllergyChatItem[];
  caution_items: AllergyChatItem[];
  unknown_items: AllergyChatItem[];
}

interface AllergyAssistantAiClient {
  transcribeImagePage(input: {
    imageBase64: string;
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
    filename: string;
    pageNumber: number;
  }): Promise<string>;
  extractProductsFromPage(input: {
    filename: string;
    pageNumber: number;
    extractedText: string;
    imageBase64: string | null;
    imageMediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  }): Promise<ExtractedAllergyProductRow[]>;
  answerQuestion(input: {
    question: string;
    products: AllergyDocumentProductRecord[];
    chunks: AllergyDocumentChunkRecord[];
  }): Promise<AllergyChatResponsePayload>;
}

class AnthropicAllergyAssistantAiClient implements AllergyAssistantAiClient {
  constructor(private readonly client: Anthropic) {}

  async transcribeImagePage(input: {
    imageBase64: string;
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
    filename: string;
    pageNumber: number;
  }): Promise<string> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: input.mediaType,
                data: input.imageBase64,
              },
            },
            {
              type: 'text',
              text: `Transcribe all visible text from this allergy chart page in plain text reading order.

File: ${input.filename}
Page: ${input.pageNumber}

Rules:
- Preserve product rows and column labels as faithfully as possible.
- Do not summarize.
- Do not infer hidden text.
- If a section is unreadable, omit it rather than guessing.
- Return only the transcription text.`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((content) => content.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Failed to transcribe allergy chart page');
    }
    return textBlock.text.trim();
  }

  async extractProductsFromPage(input: {
    filename: string;
    pageNumber: number;
    extractedText: string;
    imageBase64: string | null;
    imageMediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  }): Promise<ExtractedAllergyProductRow[]> {
    const content: Array<Record<string, unknown>> = [];
    if (input.imageBase64) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: input.imageMediaType,
          data: input.imageBase64,
        },
      });
    }
    content.push({
      type: 'text',
      text: `Extract product rows from this allergy chart page.

File: ${input.filename}
Page: ${input.pageNumber}

Embedded text:
${input.extractedText || '[no embedded text extracted]'}

Return only JSON. Use this exact shape:
{
  "products": [
    {
      "page_number": ${input.pageNumber},
      "product_name": "string",
      "source_row_text": "string",
      "allergen_summary": "string or null",
      "dietary_notes": "string or null"
    }
  ]
}

Rules:
- Extract one object per actual product row or menu-item row.
- product_name must come from the product-identifying part of the chart row, not from your own summary.
- source_row_text must preserve the row evidence as faithfully as possible, including visible allergy or dietary flags.
- allergen_summary should briefly capture only the allergens or restriction result explicitly visible for that row.
- dietary_notes should capture chart notes like may contain, cross-contact, vegan, vegetarian, halal, kosher, gluten free, or similar only if explicitly visible.
- Do not include headers, legends, footers, page titles, or category labels unless they are an actual product row.
- If a row is unreadable, omit it instead of guessing.
- Do not invent products.
- Return JSON only.`,
    });

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: content as any,
        },
      ],
    });

    const textBlock = response.content.find((entry) => entry.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error(`Failed to extract chart products from page ${input.pageNumber}`);
    }

    return parseExtractedProductsResponse(textBlock.text, input.pageNumber);
  }

  async answerQuestion(input: {
    question: string;
    products: AllergyDocumentProductRecord[];
    chunks: AllergyDocumentChunkRecord[];
  }): Promise<AllergyChatResponsePayload> {
    const productContext = input.products.map((product) => ({
      product_id: product.id,
      product_name: product.product_name,
      page_number: product.page_number,
      source_row_text: product.source_row_text,
      allergen_summary: product.allergen_summary,
      dietary_notes: product.dietary_notes,
      evidence_chunk_ids: product.source_chunk_ids,
    }));

    const chunkContext = input.chunks.map((chunk) => ({
      chunk_id: chunk.id,
      document_id: chunk.document_id,
      page_number: chunk.page_number,
      text: chunk.chunk_text,
    }));

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are an allergy chart assistant for chefs. Answer only from the supplied uploaded allergy-chart products and cited chart chunks.

Question:
${input.question}

Parsed chart products:
${JSON.stringify(productContext, null, 2)}

Chart evidence chunks:
${JSON.stringify(chunkContext, null, 2)}

Return JSON with this exact structure:
{
  "allergen_focus": "string or null",
  "answer_markdown": "short chef-facing answer",
  "safe_items": [
    {
      "product_id": 1,
      "product_name": "string",
      "rationale": "string",
      "evidence_chunk_ids": [1, 2]
    }
  ],
  "avoid_items": [],
  "caution_items": [],
  "unknown_items": []
}

Rules:
- Use only product_id values from the supplied parsed chart products.
- evidence_chunk_ids must reference supplied chunk_id values.
- Do not use recipes, menu assumptions, substitutions, or outside food knowledge.
- SAFE requires explicit chart evidence that the product is acceptable for the asked restriction.
- AVOID requires explicit chart evidence that the product contains the allergen, violates the dietary restriction, or is marked unsafe.
- ASK_KITCHEN is for ambiguous, may-contain, cross-contact, shared-fryer, incomplete, or kitchen-confirmation cases.
- UNKNOWN is for products that the uploaded chart does not classify well enough for the asked question.
- If the question names a specific allergen or dietary rule, set allergen_focus to it.
- Prefer omission over guessing.
- Return JSON only.`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((content) => content.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Failed to generate allergy answer');
    }

    return parseAllergyChatResponse(textBlock.text);
  }
}

function parseExtractedProductsResponse(text: string, pageNumber: number): ExtractedAllergyProductRow[] {
  const payload = JSON.parse(extractJsonPayload(text)) as { products?: unknown } | unknown[];
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { products?: unknown }).products)
      ? (payload as { products: unknown[] }).products
      : [];

  return rows
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        page_number: Number.isFinite(Number(row.page_number)) && Number(row.page_number) > 0 ? Number(row.page_number) : pageNumber,
        product_name: String(row.product_name ?? '').trim(),
        source_row_text: String(row.source_row_text ?? row.product_name ?? '').trim(),
        allergen_summary: typeof row.allergen_summary === 'string' && row.allergen_summary.trim().length > 0
          ? row.allergen_summary.trim()
          : null,
        dietary_notes: typeof row.dietary_notes === 'string' && row.dietary_notes.trim().length > 0
          ? row.dietary_notes.trim()
          : null,
      };
    })
    .filter((row) => row.product_name.length > 0 && row.source_row_text.length > 0);
}

function parseAllergyChatResponse(text: string): AllergyChatResponsePayload {
  const payload = JSON.parse(extractJsonPayload(text)) as AllergyChatResponsePayload;
  return {
    allergen_focus: typeof payload.allergen_focus === 'string' ? payload.allergen_focus : null,
    answer_markdown: typeof payload.answer_markdown === 'string' ? payload.answer_markdown : 'No grounded answer could be produced.',
    safe_items: normalizeChatItems(payload.safe_items),
    avoid_items: normalizeChatItems(payload.avoid_items),
    caution_items: normalizeChatItems(payload.caution_items),
    unknown_items: normalizeChatItems(payload.unknown_items),
  };
}

function extractJsonPayload(text: string): string {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (jsonMatch?.[1] ?? text).trim();
}

function normalizeChatItems(input: unknown): AllergyChatItem[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      return {
        product_id: Number(item.product_id),
        product_name: String(item.product_name ?? '').trim(),
        rationale: String(item.rationale ?? '').trim(),
        evidence_chunk_ids: Array.isArray(item.evidence_chunk_ids)
          ? item.evidence_chunk_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
          : [],
      };
    })
    .filter((item) => Number.isFinite(item.product_id) && item.product_id > 0 && item.product_name.length > 0);
}

function getMediaType(mimetype: string): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' {
  if (mimetype === 'image/png') return 'image/png';
  if (mimetype === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

function chunkPageText(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > 1000 && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function normalizeProductName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenizeSearchText(input: string): string[] {
  return normalizeProductName(input)
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function scoreTextOverlap(left: string, right: string): number {
  const leftTokens = tokenizeSearchText(left);
  const rightTokens = new Set(tokenizeSearchText(right));
  if (!leftTokens.length || rightTokens.size === 0) {
    return 0;
  }

  const overlap = leftTokens.filter((token) => rightTokens.has(token)).length;
  const phraseBoost = normalizeProductName(right).includes(normalizeProductName(left)) ? 0.35 : 0;
  return (overlap / leftTokens.length) + phraseBoost;
}

function scoreProductForQuestion(question: string, product: AllergyDocumentProductRecord): number {
  return Math.max(
    scoreTextOverlap(question, product.product_name),
    scoreTextOverlap(question, product.source_row_text),
    scoreTextOverlap(question, product.allergen_summary ?? ''),
    scoreTextOverlap(question, product.dietary_notes ?? ''),
  );
}

function buildProductRowsForPersistence(
  products: ExtractedAllergyProductRow[],
  pageChunks: string[],
): PersistedAllergyDocumentProductInput[] {
  const seen = new Set<string>();
  const outputs: PersistedAllergyDocumentProductInput[] = [];

  for (const product of products) {
    const normalizedProductName = normalizeProductName(product.product_name);
    if (!normalizedProductName) {
      continue;
    }

    const dedupeKey = `${product.page_number}::${normalizedProductName}::${normalizeProductName(product.source_row_text)}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    outputs.push({
      page_number: product.page_number,
      product_name: product.product_name,
      normalized_product_name: normalizedProductName,
      source_row_text: product.source_row_text,
      allergen_summary: product.allergen_summary,
      dietary_notes: product.dietary_notes,
      source_chunk_indexes: resolveChunkIndexesForProductRow(product, pageChunks),
    });
  }

  return outputs;
}

function resolveChunkIndexesForProductRow(product: ExtractedAllergyProductRow, pageChunks: string[]): number[] {
  const scored = pageChunks
    .map((chunkText, chunkIndex) => ({
      chunkIndex,
      score: Math.max(
        scoreTextOverlap(product.product_name, chunkText),
        scoreTextOverlap(product.source_row_text, chunkText),
      ),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.chunkIndex - right.chunkIndex)
    .slice(0, 2)
    .map((candidate) => candidate.chunkIndex);

  return scored;
}

async function buildDocumentPages(
  ai: AllergyAssistantAiClient,
  file: Express.Multer.File,
): Promise<InvoiceDocumentPageEvidence[]> {
  const pages = file.mimetype === 'application/pdf'
    ? await extractPdfEvidence(file.buffer)
    : [{
        pageNumber: 1,
        extractedText: '',
        imageBase64: file.buffer.toString('base64'),
        imageMediaType: getMediaType(file.mimetype),
      }];

  const hydratedPages: InvoiceDocumentPageEvidence[] = [];
  for (const page of pages) {
    let extractedText = page.extractedText.trim();
    if (!extractedText && page.imageBase64) {
      extractedText = await ai.transcribeImagePage({
        imageBase64: page.imageBase64,
        mediaType: page.imageMediaType,
        filename: file.originalname,
        pageNumber: page.pageNumber,
      });
    }

    hydratedPages.push({
      ...page,
      extractedText,
    });
  }

  return hydratedPages;
}

async function extractDocumentProducts(
  ai: AllergyAssistantAiClient,
  file: Express.Multer.File,
  pages: InvoiceDocumentPageEvidence[],
): Promise<Map<number, PersistedAllergyDocumentProductInput[]>> {
  const productsByPage = new Map<number, PersistedAllergyDocumentProductInput[]>();

  for (const page of pages) {
    const pageChunks = chunkPageText(page.extractedText);
    if (!page.extractedText.trim() && !page.imageBase64) {
      productsByPage.set(page.pageNumber, []);
      continue;
    }

    const extractedProducts = await ai.extractProductsFromPage({
      filename: file.originalname,
      pageNumber: page.pageNumber,
      extractedText: page.extractedText,
      imageBase64: page.imageBase64,
      imageMediaType: page.imageMediaType,
    });

    productsByPage.set(page.pageNumber, buildProductRowsForPersistence(extractedProducts, pageChunks));
  }

  return productsByPage;
}

function listDocumentSummaries(db: Database.Database, venueId?: number | null): AllergyDocumentSummary[] {
  return db.prepare(
    `
      SELECT
        id,
        venue_id,
        filename,
        mime_type,
        page_count,
        chunk_count,
        product_count,
        status,
        created_at,
        updated_at
      FROM allergy_documents
      WHERE (? IS NULL OR venue_id = ? OR venue_id IS NULL)
      ORDER BY created_at DESC, id DESC
    `,
  ).all(venueId ?? null, venueId ?? null) as AllergyDocumentSummary[];
}

function listScopedProducts(
  db: Database.Database,
  venueId?: number | null,
  documentIds?: number[],
): AllergyDocumentProductRecord[] {
  const rows = db.prepare(
    `
      SELECT
        p.id,
        p.document_id,
        p.page_id,
        p.page_number,
        p.product_name,
        p.normalized_product_name,
        p.source_row_text,
        p.allergen_summary,
        p.dietary_notes,
        p.source_chunk_ids
      FROM allergy_document_products p
      INNER JOIN allergy_documents d ON d.id = p.document_id
      WHERE (? IS NULL OR d.venue_id = ? OR d.venue_id IS NULL)
      ORDER BY d.created_at DESC, p.page_number ASC, p.id ASC
    `,
  ).all(venueId ?? null, venueId ?? null) as Array<Omit<AllergyDocumentProductRecord, 'source_chunk_ids'> & { source_chunk_ids: string }>;

  const filteredRows = Array.isArray(documentIds) && documentIds.length > 0
    ? rows.filter((row) => documentIds.includes(row.document_id))
    : rows;

  return filteredRows.map((row) => ({
    ...row,
    source_chunk_ids: parseChunkIdList(row.source_chunk_ids),
  }));
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

function listRelevantProducts(
  db: Database.Database,
  question: string,
  venueId?: number | null,
  documentIds?: number[],
): AllergyDocumentProductRecord[] {
  const scopedProducts = listScopedProducts(db, venueId, documentIds);
  if (scopedProducts.length === 0) {
    return [];
  }

  const scored = scopedProducts
    .map((product) => ({ product, score: scoreProductForQuestion(question, product) }))
    .sort((left, right) => right.score - left.score || left.product.product_name.localeCompare(right.product.product_name, undefined, { sensitivity: 'base' }));

  const relevant = scored.filter((entry) => entry.score > 0).map((entry) => entry.product);
  if (relevant.length === 0) {
    return scored.slice(0, 80).map((entry) => entry.product);
  }

  const fallback = scored
    .filter((entry) => entry.score === 0)
    .slice(0, Math.max(0, 60 - relevant.length))
    .map((entry) => entry.product);

  return [...relevant.slice(0, 160), ...fallback];
}

function listChunksByIds(db: Database.Database, chunkIds: number[]): AllergyDocumentChunkRecord[] {
  if (chunkIds.length === 0) {
    return [];
  }

  const placeholders = chunkIds.map(() => '?').join(', ');
  return db.prepare(
    `
      SELECT
        id,
        document_id,
        page_id,
        page_number,
        chunk_index,
        chunk_text
      FROM allergy_document_chunks
      WHERE id IN (${placeholders})
      ORDER BY page_number ASC, chunk_index ASC, id ASC
    `,
  ).all(...chunkIds) as AllergyDocumentChunkRecord[];
}

function listRelevantChunksFromProducts(
  db: Database.Database,
  products: AllergyDocumentProductRecord[],
  question: string,
  venueId?: number | null,
  documentIds?: number[],
): AllergyDocumentChunkRecord[] {
  const directChunkIds = Array.from(new Set(products.flatMap((product) => product.source_chunk_ids))).filter((chunkId) => chunkId > 0);
  if (directChunkIds.length > 0) {
    return listChunksByIds(db, directChunkIds);
  }

  const scopedRows = db.prepare(
    `
      SELECT
        c.id,
        c.document_id,
        c.page_id,
        c.page_number,
        c.chunk_index,
        c.chunk_text
      FROM allergy_document_chunks c
      INNER JOIN allergy_documents d ON d.id = c.document_id
      WHERE (? IS NULL OR d.venue_id = ? OR d.venue_id IS NULL)
      ORDER BY d.created_at DESC, c.page_number ASC, c.chunk_index ASC
    `,
  ).all(venueId ?? null, venueId ?? null) as AllergyDocumentChunkRecord[];

  const filteredRows = Array.isArray(documentIds) && documentIds.length > 0
    ? scopedRows.filter((row) => documentIds.includes(row.document_id))
    : scopedRows;

  return filteredRows
    .map((row) => ({ row, score: scoreTextOverlap(question, row.chunk_text) }))
    .sort((left, right) => right.score - left.score || left.row.id - right.row.id)
    .slice(0, 20)
    .map(({ row }) => row);
}

function persistAllergyDocument(
  db: Database.Database,
  input: {
    venueId?: number | null;
    file: Express.Multer.File;
    pages: InvoiceDocumentPageEvidence[];
    productsByPage: Map<number, PersistedAllergyDocumentProductInput[]>;
  },
): AllergyDocumentSummary {
  const pageData = input.pages
    .map((page) => ({
      pageNumber: page.pageNumber,
      extractedText: page.extractedText.trim(),
      chunks: chunkPageText(page.extractedText),
      products: input.productsByPage.get(page.pageNumber) ?? [],
    }))
    .filter((page) => page.extractedText.length > 0 || page.products.length > 0);

  const insertDocument = db.prepare(
    `
      INSERT INTO allergy_documents (
        venue_id,
        filename,
        mime_type,
        page_count,
        chunk_count,
        product_count,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, 'ready')
    `,
  );
  const insertPage = db.prepare(
    `
      INSERT INTO allergy_document_pages (
        document_id,
        page_number,
        extracted_text
      ) VALUES (?, ?, ?)
    `,
  );
  const insertChunk = db.prepare(
    `
      INSERT INTO allergy_document_chunks (
        document_id,
        page_id,
        page_number,
        chunk_index,
        chunk_text
      ) VALUES (?, ?, ?, ?, ?)
    `,
  );
  const insertProduct = db.prepare(
    `
      INSERT INTO allergy_document_products (
        document_id,
        page_id,
        page_number,
        product_name,
        normalized_product_name,
        source_row_text,
        allergen_summary,
        dietary_notes,
        source_chunk_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );

  const transaction = db.transaction(() => {
    const totalChunkCount = pageData.reduce((sum, page) => sum + page.chunks.length, 0);
    const totalProductCount = pageData.reduce((sum, page) => sum + page.products.length, 0);
    const result = insertDocument.run(
      input.venueId ?? null,
      input.file.originalname,
      input.file.mimetype,
      pageData.length,
      totalChunkCount,
      totalProductCount,
    );
    const documentId = Number(result.lastInsertRowid);

    for (const page of pageData) {
      const pageResult = insertPage.run(documentId, page.pageNumber, page.extractedText);
      const pageId = Number(pageResult.lastInsertRowid);
      const chunkIdByIndex = new Map<number, number>();
      page.chunks.forEach((chunk, index) => {
        const chunkResult = insertChunk.run(documentId, pageId, page.pageNumber, index, chunk);
        chunkIdByIndex.set(index, Number(chunkResult.lastInsertRowid));
      });

      page.products.forEach((product) => {
        const sourceChunkIds = product.source_chunk_indexes
          .map((chunkIndex) => chunkIdByIndex.get(chunkIndex))
          .filter((chunkId): chunkId is number => typeof chunkId === 'number' && Number.isFinite(chunkId) && chunkId > 0);

        insertProduct.run(
          documentId,
          pageId,
          page.pageNumber,
          product.product_name,
          product.normalized_product_name,
          product.source_row_text,
          product.allergen_summary,
          product.dietary_notes,
          JSON.stringify(sourceChunkIds),
        );
      });
    }

    return db.prepare(
      `
        SELECT
          id,
          venue_id,
          filename,
          mime_type,
          page_count,
          chunk_count,
          product_count,
          status,
          created_at,
          updated_at
        FROM allergy_documents
        WHERE id = ?
        LIMIT 1
      `,
    ).get(documentId) as AllergyDocumentSummary;
  });

  return transaction();
}

export function createAllergyAssistantRoutes(
  db: Database.Database,
  options?: { ai?: AllergyAssistantAiClient },
): Router {
  initializeAllergyAssistantDb(db);
  const router = Router();

  const resolveAiClient = (): AllergyAssistantAiClient => {
    if (options?.ai) {
      return options.ai;
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    return new AnthropicAllergyAssistantAiClient(new Anthropic({ apiKey }));
  };

  router.get('/documents', (req, res) => {
    const venueId = typeof req.query.venue_id === 'string' ? Number(req.query.venue_id) : null;
    res.json({ documents: listDocumentSummaries(db, Number.isFinite(venueId) ? venueId : null) });
  });

  router.post('/documents/upload', upload.array('files', 20), async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const venueId = req.body.venue_id ? Number(req.body.venue_id) : null;
    const ai = resolveAiClient();

    try {
      const documents: AllergyDocumentSummary[] = [];
      for (const file of files) {
        const pages = await buildDocumentPages(ai, file);
        const productsByPage = await extractDocumentProducts(ai, file, pages);
        const persisted = persistAllergyDocument(db, { venueId, file, pages, productsByPage });
        try {
          refreshAllergyDocumentProductMatches(db, persisted.id);
        } catch {
          // Match persistence is best-effort groundwork until the review surface lands.
        }
        documents.push(persisted);
      }

      res.status(201).json({ documents });
    } catch (error: any) {
      res.status(500).json({ error: error.message ?? 'Failed to upload allergy documents' });
    }
  });

  router.delete('/documents/:id', (req, res) => {
    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId) || documentId <= 0) {
      res.status(400).json({ error: 'Invalid document id' });
      return;
    }

    const exists = db.prepare('SELECT id FROM allergy_documents WHERE id = ? LIMIT 1').get(documentId) as { id: number } | undefined;
    if (!exists) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    db.prepare('DELETE FROM allergy_documents WHERE id = ?').run(documentId);
    res.status(204).send();
  });

  router.post('/documents/:id/reprocess', (req, res) => {
    const documentId = Number(req.params.id);
    if (!Number.isFinite(documentId) || documentId <= 0) {
      res.status(400).json({ error: 'Invalid document id' });
      return;
    }

    const exists = db.prepare('SELECT id FROM allergy_documents WHERE id = ? LIMIT 1').get(documentId) as { id: number } | undefined;
    if (!exists) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    try {
      const summary = refreshAllergyDocumentProductMatches(db, documentId);
      res.json({
        ...summary,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message ?? 'Failed to reprocess allergy document matches' });
    }
  });

  router.post('/chat', async (req, res) => {
    const question = typeof req.body.question === 'string' ? req.body.question.trim() : '';
    const venueId = req.body.venue_id != null ? Number(req.body.venue_id) : null;
    const documentIds = Array.isArray(req.body.document_ids)
      ? req.body.document_ids.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0)
      : undefined;

    if (!question) {
      res.status(400).json({ error: 'question is required' });
      return;
    }

    const products = listRelevantProducts(db, question, Number.isFinite(venueId) ? venueId : null, documentIds);
    if (products.length === 0) {
      res.status(400).json({ error: 'No parsed chart products were found for that question.' });
      return;
    }

    const chunks = listRelevantChunksFromProducts(db, products, question, Number.isFinite(venueId) ? venueId : null, documentIds);
    if (chunks.length === 0) {
      res.status(400).json({ error: 'No chart evidence chunks were available for those parsed products.' });
      return;
    }

    const ai = resolveAiClient();
    try {
      const answer = await ai.answerQuestion({ question, products, chunks });
      const chunkLookup = new Map(chunks.map((chunk) => [chunk.id, chunk]));

      res.json({
        ...answer,
        cited_chunks: Array.from(
          new Set([
            ...answer.safe_items.flatMap((item) => item.evidence_chunk_ids),
            ...answer.avoid_items.flatMap((item) => item.evidence_chunk_ids),
            ...answer.caution_items.flatMap((item) => item.evidence_chunk_ids),
            ...answer.unknown_items.flatMap((item) => item.evidence_chunk_ids),
          ]),
        )
          .map((chunkId) => chunkLookup.get(chunkId))
          .filter((chunk): chunk is AllergyDocumentChunkRecord => chunk != null),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message ?? 'Failed to answer allergy question' });
    }
  });

  return router;
}
