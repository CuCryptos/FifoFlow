import { Router } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import type Database from 'better-sqlite3';
import { initializeAllergyAssistantDb } from '../allergy/persistence/sqliteSchema.js';
import { extractPdfEvidence, type InvoiceDocumentPageEvidence } from './invoiceDocumentExtraction.js';
import { SQLiteOperationalRecipeCostReadRepository } from '../intelligence/recipeCost/recipeCostRepositories.js';
import type { IntelligenceJobContext } from '../intelligence/types.js';

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

type AllergyItemClassification = 'SAFE' | 'AVOID' | 'ASK_KITCHEN' | 'UNKNOWN';

interface AllergyDocumentSummary {
  id: number;
  venue_id: number | null;
  filename: string;
  mime_type: string;
  page_count: number;
  chunk_count: number;
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

interface MenuRecipeSummary {
  recipe_id: number;
  recipe_version_id: number;
  recipe_name: string;
  ingredients: string[];
}

interface AllergyChatItem {
  recipe_version_id: number;
  recipe_name: string;
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
  answerQuestion(input: {
    question: string;
    chunks: AllergyDocumentChunkRecord[];
    menuRecipes: MenuRecipeSummary[];
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

  async answerQuestion(input: {
    question: string;
    chunks: AllergyDocumentChunkRecord[];
    menuRecipes: MenuRecipeSummary[];
  }): Promise<AllergyChatResponsePayload> {
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
              text: `You are an allergy assistant for chefs. Answer only from the supplied allergy-chart evidence and menu recipes.

Question:
${input.question}

Menu recipes:
${JSON.stringify(input.menuRecipes, null, 2)}

Allergy chart evidence chunks:
${JSON.stringify(chunkContext, null, 2)}

Return JSON with this exact structure:
{
  "allergen_focus": "string or null",
  "answer_markdown": "short chef-facing answer",
  "safe_items": [
    {
      "recipe_version_id": 1,
      "recipe_name": "string",
      "rationale": "string",
      "evidence_chunk_ids": [1, 2]
    }
  ],
  "avoid_items": [],
  "caution_items": [],
  "unknown_items": []
}

Rules:
- Use only recipe_version_id values that exist in the supplied menu recipes.
- evidence_chunk_ids must reference supplied chunk_id values.
- SAFE requires explicit evidence that the menu item is acceptable for the asked allergy or clearly not implicated by the chart.
- AVOID requires evidence that the item contains the allergen or is explicitly marked unsafe.
- ASK_KITCHEN is for ambiguous, may-contain, cross-contact, or incomplete chart guidance.
- UNKNOWN is for menu items not covered well enough by the uploaded evidence.
- If the question names a specific allergen, set allergen_focus to it.
- Do not invent menu items, allergens, substitutions, or evidence.
- Return only JSON.`,
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

function parseAllergyChatResponse(text: string): AllergyChatResponsePayload {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const payload = JSON.parse(jsonMatch[1]!.trim()) as AllergyChatResponsePayload;
  return {
    allergen_focus: typeof payload.allergen_focus === 'string' ? payload.allergen_focus : null,
    answer_markdown: typeof payload.answer_markdown === 'string' ? payload.answer_markdown : 'No grounded answer could be produced.',
    safe_items: normalizeChatItems(payload.safe_items),
    avoid_items: normalizeChatItems(payload.avoid_items),
    caution_items: normalizeChatItems(payload.caution_items),
    unknown_items: normalizeChatItems(payload.unknown_items),
  };
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
        recipe_version_id: Number(item.recipe_version_id),
        recipe_name: String(item.recipe_name ?? ''),
        rationale: String(item.rationale ?? ''),
        evidence_chunk_ids: Array.isArray(item.evidence_chunk_ids)
          ? item.evidence_chunk_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
          : [],
      };
    })
    .filter((item) => Number.isFinite(item.recipe_version_id) && item.recipe_version_id > 0 && item.recipe_name.trim().length > 0);
}

function getMediaType(mimetype: string): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' {
  if (mimetype === 'image/png') return 'image/png';
  if (mimetype === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

function buildAllergyContext(venueId?: number | null): IntelligenceJobContext {
  const now = new Date().toISOString();
  return {
    scope: {
      organizationId: 1,
      locationId: venueId ?? undefined,
    },
    window: { start: now, end: now },
    ruleVersion: 'allergy-assistant/v1',
    now,
  };
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

function tokenizeSearchText(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function scoreChunkForQuestion(question: string, chunkText: string): number {
  const queryTokens = tokenizeSearchText(question);
  const chunkTokens = new Set(tokenizeSearchText(chunkText));
  if (!queryTokens.length || !chunkTokens.size) {
    return 0;
  }

  const overlap = queryTokens.filter((token) => chunkTokens.has(token)).length;
  const normalizedQuestion = question.toLowerCase();
  const normalizedChunk = chunkText.toLowerCase();
  const phraseBoost = queryTokens.some((token) => normalizedChunk.includes(token)) ? 0.2 : 0;

  return (overlap / queryTokens.length) + phraseBoost;
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

async function listMenuRecipes(db: Database.Database, venueId?: number | null): Promise<MenuRecipeSummary[]> {
  const repository = new SQLiteOperationalRecipeCostReadRepository(db);
  const recipes = await repository.listPromotedRecipes(buildAllergyContext(venueId));
  const dishes = recipes.filter((recipe) => recipe.recipe_type === 'dish');
  const results: MenuRecipeSummary[] = [];

  for (const recipe of dishes) {
    const rows = await repository.listPromotedRecipeIngredients(recipe.recipe_version_id);
    const ingredientNames: string[] = [];
    for (const row of rows) {
      const canonicalName = row.canonical_ingredient_id != null
        ? await repository.getCanonicalIngredientName(row.canonical_ingredient_id)
        : null;
      ingredientNames.push((canonicalName ?? row.raw_ingredient_text).trim());
    }

    results.push({
      recipe_id: Number(recipe.recipe_id),
      recipe_version_id: Number(recipe.recipe_version_id),
      recipe_name: recipe.recipe_name,
      ingredients: Array.from(new Set(ingredientNames.filter((name) => name.length > 0))).slice(0, 18),
    });
  }

  return results.sort((left, right) => left.recipe_name.localeCompare(right.recipe_name, undefined, { sensitivity: 'base' }));
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
        status,
        created_at,
        updated_at
      FROM allergy_documents
      WHERE (? IS NULL OR venue_id = ? OR venue_id IS NULL)
      ORDER BY created_at DESC, id DESC
    `,
  ).all(venueId ?? null, venueId ?? null) as AllergyDocumentSummary[];
}

function listRelevantChunks(
  db: Database.Database,
  question: string,
  venueId?: number | null,
  documentIds?: number[],
): AllergyDocumentChunkRecord[] {
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
    .map((row) => ({ row, score: scoreChunkForQuestion(question, row.chunk_text) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.row.id - right.row.id)
    .slice(0, 10)
    .map(({ row }) => row);
}

function persistAllergyDocument(
  db: Database.Database,
  input: {
    venueId?: number | null;
    file: Express.Multer.File;
    pages: InvoiceDocumentPageEvidence[];
  },
): AllergyDocumentSummary {
  const pageTexts = input.pages
    .map((page) => ({
      pageNumber: page.pageNumber,
      extractedText: page.extractedText.trim(),
      chunks: chunkPageText(page.extractedText),
    }))
    .filter((page) => page.extractedText.length > 0);

  const insertDocument = db.prepare(
    `
      INSERT INTO allergy_documents (
        venue_id,
        filename,
        mime_type,
        page_count,
        chunk_count,
        status
      ) VALUES (?, ?, ?, ?, ?, 'ready')
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

  const transaction = db.transaction(() => {
    const totalChunkCount = pageTexts.reduce((sum, page) => sum + page.chunks.length, 0);
    const result = insertDocument.run(
      input.venueId ?? null,
      input.file.originalname,
      input.file.mimetype,
      pageTexts.length,
      totalChunkCount,
    );
    const documentId = Number(result.lastInsertRowid);

    for (const page of pageTexts) {
      const pageResult = insertPage.run(documentId, page.pageNumber, page.extractedText);
      const pageId = Number(pageResult.lastInsertRowid);
      page.chunks.forEach((chunk, index) => {
        insertChunk.run(documentId, pageId, page.pageNumber, index, chunk);
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
        const persisted = persistAllergyDocument(db, { venueId, file, pages });
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

    const chunks = listRelevantChunks(db, question, Number.isFinite(venueId) ? venueId : null, documentIds);
    if (chunks.length === 0) {
      res.status(400).json({ error: 'No relevant allergy chart evidence was found for that question.' });
      return;
    }

    const menuRecipes = await listMenuRecipes(db, Number.isFinite(venueId) ? venueId : null);
    if (menuRecipes.length === 0) {
      res.status(400).json({ error: 'No promoted dish recipes are available for menu review yet.' });
      return;
    }

    const ai = resolveAiClient();
    try {
      const answer = await ai.answerQuestion({ question, chunks, menuRecipes });
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
