import { Router } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import type Database from 'better-sqlite3';
import {
  createRecipeCaptureSessionSchema,
  createRecipeInferenceRunSchema,
  createRecipeAliasSchema,
  createItemAliasSchema,
  createPrepSheetCaptureSchema,
  recalculateRecipeDraftConfidenceSchema,
  startRecipeConversationDraftSchema,
  type RecipeBuilderDraftRecipe,
  type RecipeBuilderJob,
  type RecipeBuilderSourceIntelligence,
} from '@fifoflow/shared';
import { SQLiteCanonicalIngredientRepository } from '../mapping/ingredients/index.js';
import { runRecipeBuilderJob, SQLiteRecipeBuilderRepository } from '../recipes/builder/index.js';
import { extractPdfEvidence, type InvoiceDocumentPageEvidence } from './invoiceDocumentExtraction.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, PNG, JPEG, and WebP files are supported'));
    }
  },
});

interface RecipeIntelligenceDraftSeed {
  draft_name: string;
  source_text: string;
  draft_notes: string | null;
  yield_quantity: number | null;
  yield_unit: string | null;
  serving_quantity: number | null;
  serving_unit: string | null;
  serving_count: number | null;
  source_recipe_type: 'dish' | 'prep';
  method_notes: string | null;
  assumptions: string[];
  follow_up_questions: string[];
  parsing_issues: string[];
  confidence_score: number;
}

interface RecipeIntelligencePrepSheetItem {
  item_name: string;
  batch_quantity: number | null;
  batch_unit: string | null;
  frequency: string | null;
  likely_used_in: string[];
  source_text: string;
  draft_notes: string | null;
  method_notes: string | null;
  assumptions: string[];
  follow_up_questions: string[];
  parsing_issues: string[];
  confidence_score: number;
}

interface RecipeIntelligencePrepSheetRelationship {
  prep_item: string;
  likely_used_in: string[];
  confidence: number;
}

interface RecipeIntelligencePrepSheetCaptureResult {
  prep_items: RecipeIntelligencePrepSheetItem[];
  inferred_relationships: RecipeIntelligencePrepSheetRelationship[];
}

interface RecipeIntelligenceAiClient {
  createConversationDraftSeeds(input: {
    entries: Array<{ name: string; description: string }>;
  }): Promise<RecipeIntelligenceDraftSeed[]>;
  createPhotoDraftSeeds(input: {
    filename: string;
    mime_type: string;
    pages: InvoiceDocumentPageEvidence[];
  }): Promise<RecipeIntelligenceDraftSeed[]>;
  createPrepSheetCapture(input: {
    filename: string;
    mime_type: string;
    pages: InvoiceDocumentPageEvidence[];
  }): Promise<RecipeIntelligencePrepSheetCaptureResult>;
}

class AnthropicRecipeIntelligenceAiClient implements RecipeIntelligenceAiClient {
  constructor(private readonly client: Anthropic) {}

  async createConversationDraftSeeds(input: {
    entries: Array<{ name: string; description: string }>;
  }): Promise<RecipeIntelligenceDraftSeed[]> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Convert these chef-described dishes into recipe draft seeds.

Entries:
${JSON.stringify(input.entries, null, 2)}

Return only JSON with this exact shape:
{
  "drafts": [
    {
      "draft_name": "string",
      "source_text": "ingredient lines only, one line per ingredient",
      "draft_notes": "string or null",
      "yield_quantity": 1,
      "yield_unit": "string or null",
      "serving_quantity": 6,
      "serving_unit": "string or null",
      "serving_count": 4,
      "source_recipe_type": "dish or prep",
      "method_notes": "string or null",
      "assumptions": ["string"],
      "follow_up_questions": ["string"],
      "parsing_issues": ["string"],
      "confidence_score": 0
    }
  ]
}

Rules:
- source_text must be ingredient lines only, not prose.
- Infer quantities only when they are operationally reasonable; list that choice in assumptions.
- Use null when yield or serving math cannot be grounded.
- source_recipe_type must be either dish or prep.
- Keep method_notes brief and operational.
- If an entry is too vague to convert responsibly, omit it instead of guessing.
- Return JSON only.`,
            },
          ],
        },
      ],
    });

    return normalizeDraftSeeds(extractDraftSeedPayload(extractTextBlock(response.content)));
  }

  async createPhotoDraftSeeds(input: {
    filename: string;
    mime_type: string;
    pages: InvoiceDocumentPageEvidence[];
  }): Promise<RecipeIntelligenceDraftSeed[]> {
    const content: Anthropic.ContentBlockParam[] = [
      {
        type: 'text',
        text: `Extract recipe draft seeds from this uploaded recipe photo or document.

File: ${input.filename}
Mime type: ${input.mime_type}

Return only JSON with this exact shape:
{
  "drafts": [
    {
      "draft_name": "string",
      "source_text": "ingredient lines only, one line per ingredient",
      "draft_notes": "string or null",
      "yield_quantity": 1,
      "yield_unit": "string or null",
      "serving_quantity": 6,
      "serving_unit": "string or null",
      "serving_count": 4,
      "source_recipe_type": "dish or prep",
      "method_notes": "string or null",
      "assumptions": ["string"],
      "follow_up_questions": ["string"],
      "parsing_issues": ["string"],
      "confidence_score": 0
    }
  ]
}

Rules:
- Use the visible recipe evidence only.
- source_text must be ingredient lines only, not prose.
- Preserve recipe names faithfully.
- If quantities or units are unreadable, use null fields and record the issue in parsing_issues.
- If multiple recipes are visible, return multiple drafts.
- Omit anything that is too unreadable to support.
- Return JSON only.`,
      },
    ];

    for (const page of input.pages) {
      content.push({
        type: 'text',
        text: `PAGE ${page.pageNumber} TRANSCRIPT:\n${page.extractedText || '[no embedded text extracted]'}`,
      });
      if (page.imageBase64) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: page.imageMediaType,
            data: page.imageBase64,
          },
        });
      }
    }

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    });

    return normalizeDraftSeeds(extractDraftSeedPayload(extractTextBlock(response.content)));
  }

  async createPrepSheetCapture(input: {
    filename: string;
    mime_type: string;
    pages: InvoiceDocumentPageEvidence[];
  }): Promise<RecipeIntelligencePrepSheetCaptureResult> {
    const content: Anthropic.ContentBlockParam[] = [
      {
        type: 'text',
        text: `Extract prep components from this uploaded prep sheet.

File: ${input.filename}
Mime type: ${input.mime_type}

Return only JSON with this exact shape:
{
  "prep_items": [
    {
      "item_name": "string",
      "batch_quantity": 1,
      "batch_unit": "string or null",
      "frequency": "string or null",
      "likely_used_in": ["string"],
      "source_text": "ingredient lines only, one line per ingredient",
      "draft_notes": "string or null",
      "method_notes": "string or null",
      "assumptions": ["string"],
      "follow_up_questions": ["string"],
      "parsing_issues": ["string"],
      "confidence_score": 0
    }
  ],
  "inferred_relationships": [
    {
      "prep_item": "string",
      "likely_used_in": ["string"],
      "confidence": 0
    }
  ]
}

Rules:
- Only return prep components that look like reusable batches, sauces, dressings, mixes, or sub-recipes.
- source_text must be ingredient lines only, not prose.
- likely_used_in should list dish names only when the prep sheet actually implies them.
- If batch quantity or unit is unreadable, use null and record that in parsing_issues.
- Omit rows that are too unreadable to support responsibly.
- Return JSON only.`,
      },
    ];

    for (const page of input.pages) {
      content.push({
        type: 'text',
        text: `PAGE ${page.pageNumber} TRANSCRIPT:\n${page.extractedText || '[no embedded text extracted]'}`,
      });
      if (page.imageBase64) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: page.imageMediaType,
            data: page.imageBase64,
          },
        });
      }
    }

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    });

    return normalizePrepSheetCapture(extractPrepSheetPayload(extractTextBlock(response.content)));
  }
}

export function createRecipeIntelligenceRoutes(
  db: Database.Database,
  options?: { ai?: RecipeIntelligenceAiClient },
) {
  const router = Router();
  const repository = new SQLiteRecipeBuilderRepository(db);
  const canonicalIngredientRepository = new SQLiteCanonicalIngredientRepository(db);

  const resolveAiClient = (): RecipeIntelligenceAiClient => {
    if (options?.ai) {
      return options.ai;
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    return new AnthropicRecipeIntelligenceAiClient(new Anthropic({ apiKey }));
  };

  router.post('/sessions', (req, res) => {
    const parsed = createRecipeCaptureSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid session payload' });
      return;
    }

    repository.createCaptureSession(parsed.data)
      .then((session) => res.status(201).json({ session }))
      .catch((error: any) => res.status(400).json({ error: error.message ?? 'Failed to create capture session' }));
  });

  router.post('/blitz-sessions', (req, res) => {
    const parsed = createRecipeCaptureSessionSchema.safeParse({
      venue_id: req.body?.venue_id ?? null,
      name: req.body?.name ?? null,
      led_by: req.body?.led_by ?? null,
      notes: req.body?.notes ?? null,
      capture_mode: 'blitz',
    });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid blitz session payload' });
      return;
    }

    repository.createCaptureSession(parsed.data)
      .then((session) => res.status(201).json({ session }))
      .catch((error: any) => res.status(400).json({ error: error.message ?? 'Failed to create blitz session' }));
  });

  router.get('/sessions', async (req, res) => {
    const venueId = parseOptionalPositiveInteger(req.query.venue_id);
    const status = typeof req.query.status === 'string' && (req.query.status === 'open' || req.query.status === 'completed')
      ? req.query.status
      : undefined;

    const sessions = await repository.listCaptureSessions({
      venue_id: venueId,
      status,
    });

    res.json({ sessions });
  });

  router.get('/sessions/:sessionId', async (req, res) => {
    const sessionId = parseRequiredPositiveInteger(req.params.sessionId);
    if (sessionId == null) {
      res.status(400).json({ error: 'Invalid session id' });
      return;
    }

    const session = await repository.getCaptureSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const [inputs, drafts, prepSheetCaptures] = await Promise.all([
      repository.listCaptureInputs(sessionId),
      repository.listDraftRecipesByCaptureSession(sessionId),
      repository.listPrepSheetCaptures(sessionId),
    ]);

    res.json({
      session,
      inputs,
      drafts,
      prep_sheet_captures: prepSheetCaptures,
    });
  });

  router.get('/drafts/:draftId/source', async (req, res) => {
    const draftId = parseRequiredPositiveInteger(req.params.draftId);
    if (draftId == null) {
      res.status(400).json({ error: 'Invalid draft id' });
      return;
    }

    const detail = await repository.getDraftSourceIntelligenceByDraftId(draftId);
    if (!detail) {
      res.status(404).json({ error: 'Draft not found' });
      return;
    }

    res.json({
      draft_id: draftId,
      recipe_builder_job_id: detail.recipe_builder_job_id,
      draft: detail.draft,
      source_intelligence: detail.source_intelligence,
    });
  });

  router.post('/drafts/:draftId/recalculate-confidence', async (req, res) => {
    const draftId = parseRequiredPositiveInteger(req.params.draftId);
    if (draftId == null) {
      res.status(400).json({ error: 'Invalid draft id' });
      return;
    }

    const parsed = recalculateRecipeDraftConfidenceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid confidence recalculation payload' });
      return;
    }

    const result = await repository.recalculateDraftConfidence(draftId, parsed.data);
    if (!result) {
      res.status(404).json({ error: 'Draft not found' });
      return;
    }

    res.json(result);
  });

  router.post('/photo-drafts', upload.array('files', 20), async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const venueId = req.body?.venue_id != null ? Number(req.body.venue_id) : null;
    const session = await repository.createCaptureSession({
      venue_id: Number.isFinite(venueId) ? venueId : null,
      name: typeof req.body?.session_name === 'string' && req.body.session_name.trim().length > 0
        ? req.body.session_name.trim()
        : `Photo Capture ${new Date().toISOString().slice(0, 10)}`,
      capture_mode: files.length > 1 ? 'photo_batch' : 'single_photo',
      led_by: typeof req.body?.created_by === 'string' ? req.body.created_by : null,
      notes: null,
    });

    try {
      const ai = resolveAiClient();
      const drafts: Array<Awaited<ReturnType<typeof createDraftFromSeed>>> = [];

      for (const file of files) {
        const pages = await buildPhotoEvidence(file);
        const seeds = await ai.createPhotoDraftSeeds({
          filename: file.originalname,
          mime_type: file.mimetype,
          pages,
        });
        if (seeds.length === 0) {
          throw new Error(`No usable recipe drafts could be extracted from ${file.originalname}`);
        }

        for (const seed of seeds) {
          const created = await createDraftFromSeed({
            repository,
            canonicalIngredientRepository,
            sessionId: Number(session.id),
            seed,
            origin: 'photo_ingestion',
            rawSource: buildPageTranscript(pages) || file.originalname,
            inputRecord: {
              input_type: 'photo',
              source_text: buildPageTranscript(pages) || null,
              source_file_name: file.originalname,
              source_mime_type: file.mimetype,
              processing_notes: `Created from uploaded file ${file.originalname}`,
            },
            sourceContext: {
              created_by: typeof req.body?.created_by === 'string' ? req.body.created_by : null,
              file_name: file.originalname,
              mime_type: file.mimetype,
              page_count: pages.length,
            },
            sourceImages: [file.originalname],
          });
          drafts.push(created);
        }
      }

      const refreshedSession = await repository.refreshCaptureSessionStats(session.id);
      res.status(201).json({ session: refreshedSession, drafts });
    } catch (error: any) {
      res.status(500).json({ error: error.message ?? 'Failed to create photo drafts' });
    }
  });

  router.post('/conversation-drafts', async (req, res) => {
    const parsed = startRecipeConversationDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid conversation draft payload' });
      return;
    }

    const ai = resolveAiClient();
    const session = await repository.createCaptureSession({
      venue_id: parsed.data.venue_id,
      name: parsed.data.session_name ?? `Conversation Capture ${new Date().toISOString().slice(0, 10)}`,
      capture_mode: 'conversation_batch',
      led_by: parsed.data.created_by ?? null,
      notes: null,
    });

    try {
      const seeds = await ai.createConversationDraftSeeds({ entries: parsed.data.entries });
      if (seeds.length === 0) {
        res.status(400).json({ error: 'No usable draft seeds could be created from that conversation input' });
        return;
      }
      const drafts: Array<Awaited<ReturnType<typeof createDraftFromSeed>>> = [];

      for (const [index, seed] of seeds.entries()) {
        const sourceEntry = parsed.data.entries[index] ?? parsed.data.entries.find((entry) => entry.name === seed.draft_name) ?? null;
        const created = await createDraftFromSeed({
          repository,
          canonicalIngredientRepository,
          sessionId: Number(session.id),
          seed,
          origin: 'conversational',
          rawSource: sourceEntry ? `${sourceEntry.name}: ${sourceEntry.description}` : seed.draft_name,
          inputRecord: {
            input_type: 'text',
            source_text: sourceEntry ? `${sourceEntry.name}: ${sourceEntry.description}` : seed.draft_name,
            processing_notes: 'Created from conversation entry',
          },
          sourceContext: {
            created_by: parsed.data.created_by ?? null,
            entry_name: sourceEntry?.name ?? seed.draft_name,
          },
          sourceImages: [],
        });
        drafts.push(created);
      }

      const refreshedSession = await repository.refreshCaptureSessionStats(session.id);
      res.status(201).json({ session: refreshedSession, drafts });
    } catch (error: any) {
      res.status(500).json({ error: error.message ?? 'Failed to create conversation drafts' });
    }
  });

  router.post('/prep-sheet-captures', upload.single('file'), async (req, res) => {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No prep sheet file uploaded' });
      return;
    }

    const parsedVenueId = Number(req.body?.venue_id);
    if (!Number.isInteger(parsedVenueId) || parsedVenueId <= 0) {
      res.status(400).json({ error: 'A positive venue_id is required' });
      return;
    }

    const captureDate = typeof req.body?.capture_date === 'string' && req.body.capture_date.trim().length > 0
      ? req.body.capture_date.trim()
      : new Date().toISOString().slice(0, 10);

    const session = await repository.createCaptureSession({
      venue_id: parsedVenueId,
      name: typeof req.body?.session_name === 'string' && req.body.session_name.trim().length > 0
        ? req.body.session_name.trim()
        : `Prep Sheet ${captureDate}`,
      capture_mode: 'prep_sheet_batch',
      led_by: typeof req.body?.created_by === 'string' ? req.body.created_by : null,
      notes: typeof req.body?.processing_notes === 'string' ? req.body.processing_notes : null,
    });

    try {
      const ai = resolveAiClient();
      const pages = await buildPhotoEvidence(file);
      const transcript = buildPageTranscript(pages);
      const captureResult = await ai.createPrepSheetCapture({
        filename: file.originalname,
        mime_type: file.mimetype,
        pages,
      });

      const parsed = createPrepSheetCaptureSchema.safeParse({
        venue_id: parsedVenueId,
        capture_date: captureDate,
        source_file_name: file.originalname,
        source_mime_type: file.mimetype,
        source_storage_path: null,
        extracted_text: transcript || null,
        parsed_items_json: JSON.stringify(captureResult.prep_items),
        inferred_relationships_json: JSON.stringify(captureResult.inferred_relationships),
        created_by: typeof req.body?.created_by === 'string' ? req.body.created_by : null,
        recipe_capture_session_id: Number(session.id),
        processing_notes: typeof req.body?.processing_notes === 'string'
          ? req.body.processing_notes
          : `Prep sheet capture created from ${file.originalname}`,
      });
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid prep sheet capture payload' });
        return;
      }

      const capture = await repository.createPrepSheetCapture(parsed.data);
      const drafts: Array<Awaited<ReturnType<typeof createDraftFromSeed>>> = [];

      for (const prepItem of captureResult.prep_items) {
        const created = await createDraftFromSeed({
          repository,
          canonicalIngredientRepository,
          sessionId: Number(session.id),
          seed: {
            draft_name: prepItem.item_name,
            source_text: prepItem.source_text,
            draft_notes: prepItem.draft_notes,
            yield_quantity: prepItem.batch_quantity,
            yield_unit: prepItem.batch_unit,
            serving_quantity: null,
            serving_unit: null,
            serving_count: null,
            source_recipe_type: 'prep',
            method_notes: prepItem.method_notes,
            assumptions: prepItem.assumptions,
            follow_up_questions: prepItem.follow_up_questions,
            parsing_issues: prepItem.parsing_issues,
            confidence_score: prepItem.confidence_score,
          },
          origin: 'prep_sheet',
          rawSource: transcript || file.originalname,
          inputRecord: {
            input_type: 'prep_sheet',
            source_text: transcript || null,
            source_file_name: file.originalname,
            source_mime_type: file.mimetype,
            processing_notes: `Created from prep sheet ${file.originalname}`,
          },
          sourceContext: {
            created_by: typeof req.body?.created_by === 'string' ? req.body.created_by : null,
            file_name: file.originalname,
            mime_type: file.mimetype,
            capture_date: captureDate,
            likely_used_in: prepItem.likely_used_in,
            inferred_relationships: captureResult.inferred_relationships.filter(
              (relationship) => relationship.prep_item === prepItem.item_name,
            ),
          },
          sourceImages: [file.originalname],
        });
        drafts.push(created);
      }

      const refreshedSession = await repository.refreshCaptureSessionStats(session.id);
      res.status(201).json({
        session: refreshedSession,
        capture,
        drafts,
        prep_items: captureResult.prep_items,
        inferred_relationships: captureResult.inferred_relationships,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message ?? 'Failed to create prep sheet capture' });
    }
  });

  router.post('/inference-runs', (req, res) => {
    const parsed = createRecipeInferenceRunSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid inference run payload' });
      return;
    }
    res.status(501).json({ error: 'Recipe inference runs are not implemented yet' });
  });

  router.post('/items/:itemId/aliases', (req, res) => {
    const itemId = parseRequiredPositiveInteger(req.params.itemId);
    if (itemId == null) {
      res.status(400).json({ error: 'Invalid item id' });
      return;
    }
    const parsed = createItemAliasSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid item alias payload' });
      return;
    }
    res.status(501).json({ error: `Item alias CRUD for item ${itemId} is not implemented yet` });
  });

  router.post('/recipes/:recipeId/aliases', (req, res) => {
    const recipeId = parseRequiredPositiveInteger(req.params.recipeId);
    if (recipeId == null) {
      res.status(400).json({ error: 'Invalid recipe id' });
      return;
    }
    const parsed = createRecipeAliasSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid recipe alias payload' });
      return;
    }
    res.status(501).json({ error: `Recipe alias CRUD for recipe ${recipeId} is not implemented yet` });
  });

  return router;
}

async function createDraftFromSeed(input: {
  repository: SQLiteRecipeBuilderRepository;
  canonicalIngredientRepository: SQLiteCanonicalIngredientRepository;
  sessionId: number;
  seed: RecipeIntelligenceDraftSeed;
  origin: RecipeBuilderJob['origin'];
  rawSource: string;
  inputRecord: {
    input_type: 'photo' | 'text' | 'prep_sheet';
    source_text?: string | null;
    source_file_name?: string | null;
    source_mime_type?: string | null;
    processing_notes?: string | null;
  };
  sourceContext: Record<string, unknown>;
  sourceImages: string[];
}) {
  const result = await runRecipeBuilderJob(
    {
      source_type: 'freeform',
      draft_name: input.seed.draft_name,
      draft_notes: input.seed.draft_notes,
      source_text: input.seed.source_text,
      yield_quantity: input.seed.yield_quantity,
      yield_unit: input.seed.yield_unit,
      serving_quantity: input.seed.serving_quantity,
      serving_unit: input.seed.serving_unit,
      serving_count: input.seed.serving_count,
      source_recipe_type: input.seed.source_recipe_type,
    },
    {
      source: input.repository,
      repository: input.repository,
      canonicalIngredientRepository: input.canonicalIngredientRepository,
    },
  );

  const reviewPriority: RecipeBuilderDraftRecipe['review_priority'] = input.seed.parsing_issues.length > 0
    ? 'high'
    : 'normal';

  const upsertedDraft = await input.repository.upsertDraftRecipe({
    recipe_builder_job_id: result.draft_recipe.recipe_builder_job_id,
    draft_name: result.draft_recipe.draft_name,
    draft_notes: result.draft_recipe.draft_notes,
    yield_quantity: result.draft_recipe.yield_quantity,
    yield_unit: result.draft_recipe.yield_unit,
    serving_quantity: result.draft_recipe.serving_quantity,
    serving_unit: result.draft_recipe.serving_unit,
    serving_count: result.draft_recipe.serving_count,
    completeness_status: result.draft_recipe.completeness_status,
    costability_status: result.draft_recipe.costability_status,
    ingredient_row_count: result.draft_recipe.ingredient_row_count,
    ready_row_count: result.draft_recipe.ready_row_count,
    review_row_count: result.draft_recipe.review_row_count,
    blocked_row_count: result.draft_recipe.blocked_row_count,
    unresolved_canonical_count: result.draft_recipe.unresolved_canonical_count,
    unresolved_inventory_count: result.draft_recipe.unresolved_inventory_count,
    source_recipe_type: result.draft_recipe.source_recipe_type,
    method_notes: input.seed.method_notes,
    review_priority: reviewPriority,
    ready_for_review_flag: result.draft_recipe.completeness_status === 'BLOCKED' ? 0 : 1,
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
  });

  const updatedJob = await input.repository.updateJobIntelligence(result.job.id, {
    origin: input.origin,
    confidence_level: deriveConfidenceLevel(input.seed.confidence_score),
    confidence_score: input.seed.confidence_score,
    confidence_details: buildConfidenceDetails(input.seed, result),
    source_images: input.sourceImages,
    parsing_issues: input.seed.parsing_issues,
    assumptions: input.seed.assumptions,
    follow_up_questions: input.seed.follow_up_questions,
    source_context: {
      ...input.sourceContext,
      raw_source: input.rawSource,
      generated_source_text: input.seed.source_text,
    },
    capture_session_id: input.sessionId,
    inference_variance_pct: null,
  });

  await input.repository.createCaptureInput({
    recipe_capture_session_id: input.sessionId,
    input_type: input.inputRecord.input_type,
    source_text: input.inputRecord.source_text ?? null,
    source_file_name: input.inputRecord.source_file_name ?? null,
    source_mime_type: input.inputRecord.source_mime_type ?? null,
    recipe_builder_job_id: result.job.id,
    processing_notes: input.inputRecord.processing_notes ?? null,
    parse_status: 'PROCESSED',
  });

  const sourceDetail = await input.repository.getDraftSourceIntelligenceByDraftId(Number(upsertedDraft.record.id));

  return {
    draft_id: upsertedDraft.record.id,
    recipe_builder_job_id: updatedJob.id,
    draft: upsertedDraft.record,
    job: updatedJob,
    source_intelligence: sourceDetail?.source_intelligence ?? extractSourceIntelligence(updatedJob),
    run_summary: result.run_summary,
    notes: result.notes,
  };
}

function deriveConfidenceLevel(score: number): RecipeBuilderJob['confidence_level'] {
  if (score >= 90) return 'verified';
  if (score >= 75) return 'reviewed';
  if (score >= 50) return 'estimated';
  return 'draft';
}

function buildConfidenceDetails(
  seed: RecipeIntelligenceDraftSeed,
  result: Awaited<ReturnType<typeof runRecipeBuilderJob>>,
): string[] {
  return [
    `${result.run_summary.parsed_rows_total} ingredient rows were created`,
    `${result.run_summary.ready_rows} rows are review-ready`,
    `${result.run_summary.review_rows} rows still need review`,
    ...(seed.assumptions.length > 0 ? [`${seed.assumptions.length} assumptions were recorded`] : []),
    ...(seed.parsing_issues.length > 0 ? [`${seed.parsing_issues.length} parsing issues were recorded`] : []),
  ];
}

function extractSourceIntelligence(job: RecipeBuilderJob): RecipeBuilderSourceIntelligence {
  return {
    origin: job.origin,
    confidence_level: job.confidence_level,
    confidence_score: job.confidence_score,
    confidence_details: job.confidence_details,
    source_images: job.source_images,
    parsing_issues: job.parsing_issues,
    assumptions: job.assumptions,
    follow_up_questions: job.follow_up_questions,
    source_context: job.source_context,
    raw_source: job.raw_source,
    capture_session_id: job.capture_session_id,
    last_confidence_recalculated_at: job.last_confidence_recalculated_at,
    inference_variance_pct: job.inference_variance_pct,
  };
}

async function buildPhotoEvidence(file: Express.Multer.File): Promise<InvoiceDocumentPageEvidence[]> {
  if (file.mimetype === 'application/pdf') {
    return extractPdfEvidence(file.buffer);
  }

  return [{
    pageNumber: 1,
    extractedText: '',
    imageBase64: file.buffer.toString('base64'),
    imageMediaType: getMediaType(file.mimetype),
  }];
}

function buildPageTranscript(pages: InvoiceDocumentPageEvidence[]): string {
  return pages
    .map((page) => page.extractedText.trim())
    .filter((page) => page.length > 0)
    .join('\n\n');
}

function getMediaType(mimetype: string): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' {
  if (mimetype === 'image/png') return 'image/png';
  if (mimetype === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

function extractTextBlock(content: Anthropic.Messages.Message['content']): string {
  const textBlock = content.find((entry) => entry.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Recipe intelligence AI response did not include text output');
  }
  return textBlock.text.trim();
}

function extractDraftSeedPayload(text: string): unknown[] {
  const payload = JSON.parse(extractJsonPayload(text)) as { drafts?: unknown } | unknown[];
  if (Array.isArray(payload)) {
    return payload;
  }
  return Array.isArray(payload.drafts) ? payload.drafts : [];
}

function extractPrepSheetPayload(text: string): {
  prep_items?: unknown;
  inferred_relationships?: unknown;
} {
  const payload = JSON.parse(extractJsonPayload(text)) as {
    prep_items?: unknown;
    inferred_relationships?: unknown;
  };
  return payload;
}

function extractJsonPayload(text: string): string {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (jsonMatch?.[1] ?? text).trim();
}

function normalizeDraftSeeds(input: unknown[]): RecipeIntelligenceDraftSeed[] {
  return input
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        draft_name: String(row.draft_name ?? '').trim(),
        source_text: String(row.source_text ?? '').trim(),
        draft_notes: typeof row.draft_notes === 'string' && row.draft_notes.trim().length > 0 ? row.draft_notes.trim() : null,
        yield_quantity: parseNullableNumber(row.yield_quantity),
        yield_unit: normalizeNullableString(row.yield_unit),
        serving_quantity: parseNullableNumber(row.serving_quantity),
        serving_unit: normalizeNullableString(row.serving_unit),
        serving_count: parseNullableNumber(row.serving_count),
        source_recipe_type: row.source_recipe_type === 'prep' ? 'prep' : 'dish',
        method_notes: normalizeNullableString(row.method_notes),
        assumptions: normalizeStringArray(row.assumptions),
        follow_up_questions: normalizeStringArray(row.follow_up_questions),
        parsing_issues: normalizeStringArray(row.parsing_issues),
        confidence_score: clampConfidenceScore(row.confidence_score),
      } satisfies RecipeIntelligenceDraftSeed;
    })
    .filter((seed) => seed.draft_name.length > 0 && seed.source_text.length > 0);
}

function normalizePrepSheetCapture(input: {
  prep_items?: unknown;
  inferred_relationships?: unknown;
}): RecipeIntelligencePrepSheetCaptureResult {
  const prepItems = Array.isArray(input.prep_items) ? input.prep_items : [];
  const inferredRelationships = Array.isArray(input.inferred_relationships) ? input.inferred_relationships : [];

  return {
    prep_items: prepItems
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => {
        const row = entry as Record<string, unknown>;
        return {
          item_name: String(row.item_name ?? '').trim(),
          batch_quantity: parseNullableNumber(row.batch_quantity),
          batch_unit: normalizeNullableString(row.batch_unit),
          frequency: normalizeNullableString(row.frequency),
          likely_used_in: normalizeStringArray(row.likely_used_in),
          source_text: String(row.source_text ?? '').trim(),
          draft_notes: normalizeNullableString(row.draft_notes),
          method_notes: normalizeNullableString(row.method_notes),
          assumptions: normalizeStringArray(row.assumptions),
          follow_up_questions: normalizeStringArray(row.follow_up_questions),
          parsing_issues: normalizeStringArray(row.parsing_issues),
          confidence_score: clampConfidenceScore(row.confidence_score),
        } satisfies RecipeIntelligencePrepSheetItem;
      })
      .filter((item) => item.item_name.length > 0 && item.source_text.length > 0),
    inferred_relationships: inferredRelationships
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => {
        const row = entry as Record<string, unknown>;
        return {
          prep_item: String(row.prep_item ?? '').trim(),
          likely_used_in: normalizeStringArray(row.likely_used_in),
          confidence: clampConfidenceRatio(row.confidence),
        } satisfies RecipeIntelligencePrepSheetRelationship;
      })
      .filter((relationship) => relationship.prep_item.length > 0),
  };
}

function clampConfidenceScore(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 50;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function clampConfidenceRatio(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, Number(parsed.toFixed(2))));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseRequiredPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalPositiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
