import { Router } from 'express';
import type Database from 'better-sqlite3';
import {
  type AllergenConfidence,
  type AllergenStatus,
  SQLiteAllergenRepository,
} from '../allergy/allergenRepositories.js';
import { AllergenQueryService } from '../allergy/allergenQueryService.js';

const ALLERGEN_STATUSES = new Set<AllergenStatus>(['contains', 'may_contain', 'free_of', 'unknown']);
const ALLERGEN_CONFIDENCES = new Set<AllergenConfidence>(['verified', 'high', 'moderate', 'low', 'unverified', 'unknown']);

export function createAllergenRoutes(db: Database.Database): Router {
  const repository = new SQLiteAllergenRepository(db);
  const queryService = new AllergenQueryService(repository);
  const router = Router();

  router.get('/reference', (_req, res) => {
    res.json({ allergens: repository.listAllergensReference() });
  });

  router.get('/items', (req, res) => {
    const status = typeof req.query.status === 'string' && ALLERGEN_STATUSES.has(req.query.status as AllergenStatus)
      ? req.query.status as AllergenStatus
      : undefined;
    const confidence = typeof req.query.confidence === 'string' && ALLERGEN_CONFIDENCES.has(req.query.confidence as AllergenConfidence)
      ? req.query.confidence as AllergenConfidence
      : undefined;

    res.json({
      items: repository.listItemProfiles({
        search: typeof req.query.search === 'string' ? req.query.search.trim() : undefined,
        status,
        confidence,
        vendor_id: parseOptionalNumber(req.query.vendor_id),
        venue_id: parseOptionalNumber(req.query.venue_id),
        needs_review: parseOptionalBoolean(req.query.needs_review),
      }),
    });
  });

  router.get('/items/:itemId', (req, res) => {
    const itemId = parseRequiredNumber(req.params.itemId);
    if (itemId == null) {
      res.status(400).json({ error: 'Invalid item id' });
      return;
    }

    const detail = repository.getItemProfile(itemId);
    if (!detail) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    res.json(detail);
  });

  router.get('/review-queue', (_req, res) => {
    res.json(repository.getReviewQueue());
  });

  router.get('/documents/:documentId', (req, res) => {
    const documentId = parseRequiredNumber(req.params.documentId);
    if (documentId == null) {
      res.status(400).json({ error: 'Invalid document id' });
      return;
    }

    const detail = repository.getDocumentDetail(documentId);
    if (!detail) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(detail);
  });

  router.post('/query', (req, res) => {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const allergenCodes = Array.isArray(req.body?.allergen_codes)
      ? req.body.allergen_codes.map((value: unknown) => String(value).trim().toLowerCase()).filter((value: string) => value.length > 0)
      : [];

    if (!question && allergenCodes.length === 0) {
      res.status(400).json({ error: 'question or allergen_codes is required' });
      return;
    }

    try {
      const result = queryService.queryChartProducts({
        question,
        allergen_codes: allergenCodes,
        venue_id: parseOptionalNumber(req.body?.venue_id),
        document_ids: parseOptionalIdList(req.body?.document_ids),
        created_by: typeof req.body?.created_by === 'string' ? req.body.created_by : null,
      });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message ?? 'Failed to query allergens' });
    }
  });

  return router;
}

function parseRequiredNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
}

function parseOptionalIdList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => parseOptionalNumber(entry))
        .filter((entry): entry is number => entry != null),
    ),
  );
}
