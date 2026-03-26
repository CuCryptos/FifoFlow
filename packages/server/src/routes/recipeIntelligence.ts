import { Router } from 'express';
import type Database from 'better-sqlite3';
import {
  createRecipeCaptureSessionSchema,
  createRecipeInferenceRunSchema,
  createRecipeAliasSchema,
  createItemAliasSchema,
  createPrepSheetCaptureSchema,
  recalculateRecipeDraftConfidenceSchema,
  startRecipeConversationDraftSchema,
} from '@fifoflow/shared';
import { SQLiteRecipeBuilderRepository } from '../recipes/builder/index.js';

export function createRecipeIntelligenceRoutes(db: Database.Database) {
  const router = Router();
  const repository = new SQLiteRecipeBuilderRepository(db);

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

    const [inputs, drafts] = await Promise.all([
      repository.listCaptureInputs(sessionId),
      repository.listDraftRecipesByCaptureSession(sessionId),
    ]);

    res.json({
      session,
      inputs,
      drafts,
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

  router.post('/photo-drafts', (_req, res) => {
    res.status(501).json({ error: 'Photo draft ingestion is not implemented yet' });
  });

  router.post('/conversation-drafts', (req, res) => {
    const parsed = startRecipeConversationDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid conversation draft payload' });
      return;
    }
    res.status(501).json({ error: 'Conversation draft creation is not implemented yet' });
  });

  router.post('/prep-sheet-captures', (req, res) => {
    const parsed = createPrepSheetCaptureSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid prep sheet capture payload' });
      return;
    }
    res.status(501).json({ error: 'Prep sheet capture is not implemented yet' });
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

function parseRequiredPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalPositiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
