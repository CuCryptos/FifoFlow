import { Router } from 'express';
import type Database from 'better-sqlite3';
import {
  type AllergenConfidence,
  type AllergenStatus,
  type DocumentMatchBasis,
  type DocumentProductMatchInput,
  type DocumentMatchSignalTier,
  type ItemEvidenceInput,
  type ItemProfileUpdateInput,
  SQLiteAllergenRepository,
} from '../allergy/allergenRepositories.js';
import { AllergenQueryService } from '../allergy/allergenQueryService.js';
import { refreshAllergyDocumentProductMatches } from '../allergy/allergenMatchService.js';

const ALLERGEN_STATUSES = new Set<AllergenStatus>(['contains', 'may_contain', 'free_of', 'unknown']);
const ALLERGEN_CONFIDENCES = new Set<AllergenConfidence>(['verified', 'high', 'moderate', 'low', 'unverified', 'unknown']);
const ALLERGEN_EVIDENCE_SOURCE_TYPES: ItemEvidenceInput['source_type'][] = ['manufacturer_spec', 'vendor_declaration', 'staff_verified', 'label_scan', 'uploaded_chart', 'inferred'];
const DOCUMENT_MATCH_STATUSES: DocumentProductMatchInput['match_status'][] = ['suggested', 'confirmed', 'rejected', 'no_match'];
const DOCUMENT_MATCH_ROLES = new Set<DocumentProductMatchInput['matched_by']>(['system', 'operator']);
const DOCUMENT_MATCH_BASES = new Set<DocumentMatchBasis>(['item_name', 'explicit_alias', 'operator']);
const DOCUMENT_MATCH_SIGNAL_TIERS = new Set<DocumentMatchSignalTier>(['high', 'medium', 'fallback', 'operator']);

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

  router.put('/items/:itemId/profile', (req, res) => {
    const itemId = parseRequiredNumber(req.params.itemId);
    if (itemId == null) {
      res.status(400).json({ error: 'Invalid item id' });
      return;
    }

    const profiles = parseItemProfileUpdates(req.body);
    if (profiles == null || profiles.length === 0) {
      res.status(400).json({ error: 'profiles must be a non-empty array' });
      return;
    }

    try {
      const detail = repository.upsertItemProfile(itemId, profiles);
      if (!detail) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }
      res.json(detail);
    } catch (error: any) {
      res.status(400).json({ error: error.message ?? 'Failed to update item allergen profile' });
    }
  });

  router.post('/items/:itemId/evidence', (req, res) => {
    const itemId = parseRequiredNumber(req.params.itemId);
    if (itemId == null) {
      res.status(400).json({ error: 'Invalid item id' });
      return;
    }

    const input = parseItemEvidenceInput(req.body);
    if (!input) {
      res.status(400).json({ error: 'Invalid evidence payload' });
      return;
    }

    try {
      const detail = repository.addEvidence(itemId, input);
      if (!detail) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }
      res.json(detail);
    } catch (error: any) {
      res.status(400).json({ error: error.message ?? 'Failed to add allergen evidence' });
    }
  });

  router.post('/items/:itemId/match-aliases', (req, res) => {
    const itemId = parseRequiredNumber(req.params.itemId);
    if (itemId == null) {
      res.status(400).json({ error: 'Invalid item id' });
      return;
    }

    const alias = typeof req.body?.alias === 'string' ? req.body.alias.trim() : '';
    if (!alias) {
      res.status(400).json({ error: 'alias is required' });
      return;
    }

    try {
      const detail = repository.addMatchAlias(itemId, alias);
      if (!detail) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }
      refreshDocumentsForVenueScope(db, detail.item.venue_id);
      res.status(201).json(detail);
    } catch (error: any) {
      res.status(400).json({ error: error.message ?? 'Failed to add match alias' });
    }
  });

  router.delete('/items/:itemId/match-aliases/:aliasId', (req, res) => {
    const itemId = parseRequiredNumber(req.params.itemId);
    const aliasId = parseRequiredNumber(req.params.aliasId);
    if (itemId == null || aliasId == null) {
      res.status(400).json({ error: 'Invalid alias route parameters' });
      return;
    }

    try {
      const detail = repository.removeMatchAlias(itemId, aliasId);
      if (!detail) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }
      refreshDocumentsForVenueScope(db, detail.item.venue_id);
      res.json(detail);
    } catch (error: any) {
      res.status(400).json({ error: error.message ?? 'Failed to remove match alias' });
    }
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

  router.patch('/document-products/:productId/match', (req, res) => {
    const productId = parseRequiredNumber(req.params.productId);
    if (productId == null) {
      res.status(400).json({ error: 'Invalid document product id' });
      return;
    }

    const input = parseDocumentProductMatchInput(req.body);
    if (!input) {
      res.status(400).json({ error: 'Invalid match payload' });
      return;
    }

    try {
      const detail = repository.upsertDocumentProductMatch(productId, input);
      if (!detail) {
        res.status(404).json({ error: 'Document product not found' });
        return;
      }
      res.json(detail);
    } catch (error: any) {
      res.status(400).json({ error: error.message ?? 'Failed to update document product match' });
    }
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

function parseOptionalFiniteNumber(value: unknown): number | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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

function parseItemProfileUpdates(value: unknown): ItemProfileUpdateInput[] | null {
  const rawProfiles = Array.isArray(value)
    ? value
    : Array.isArray((value as { profiles?: unknown } | null)?.profiles)
      ? (value as { profiles: unknown[] }).profiles
      : Array.isArray((value as { allergen_profile?: unknown } | null)?.allergen_profile)
        ? (value as { allergen_profile: unknown[] }).allergen_profile
        : null;

  if (!rawProfiles) {
    return null;
  }

  const profiles: ItemProfileUpdateInput[] = [];
  for (const entry of rawProfiles) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const allergen_code = typeof (entry as { allergen_code?: unknown }).allergen_code === 'string'
      ? (entry as { allergen_code: string }).allergen_code.trim().toLowerCase()
      : '';
    const status = typeof (entry as { status?: unknown }).status === 'string' && ALLERGEN_STATUSES.has((entry as { status: AllergenStatus }).status)
      ? (entry as { status: AllergenStatus }).status
      : null;
    const confidence = typeof (entry as { confidence?: unknown }).confidence === 'string' && ALLERGEN_CONFIDENCES.has((entry as { confidence: AllergenConfidence }).confidence)
      ? (entry as { confidence: AllergenConfidence }).confidence
      : null;
    if (!allergen_code || !status || !confidence) {
      return null;
    }
    profiles.push({
      allergen_code,
      status,
      confidence,
      notes: typeof (entry as { notes?: unknown }).notes === 'string' ? (entry as { notes: string }).notes : null,
      verified_by: typeof (entry as { verified_by?: unknown }).verified_by === 'string' ? (entry as { verified_by: string }).verified_by : null,
      verified_at: typeof (entry as { verified_at?: unknown }).verified_at === 'string' ? (entry as { verified_at: string }).verified_at : null,
      last_reviewed_at: typeof (entry as { last_reviewed_at?: unknown }).last_reviewed_at === 'string' ? (entry as { last_reviewed_at: string }).last_reviewed_at : null,
    });
  }
  return profiles;
}

function parseItemEvidenceInput(value: unknown): ItemEvidenceInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const allergen_code = typeof (value as { allergen_code?: unknown }).allergen_code === 'string'
    ? (value as { allergen_code: string }).allergen_code.trim().toLowerCase()
    : '';
  const source_type_raw = typeof (value as { source_type?: unknown }).source_type === 'string'
    ? (value as { source_type: ItemEvidenceInput['source_type'] }).source_type
    : null;
  const source_type = source_type_raw && ALLERGEN_EVIDENCE_SOURCE_TYPES.includes(source_type_raw)
    ? source_type_raw
    : null;
  const status_claimed_raw = typeof (value as { status_claimed?: unknown }).status_claimed === 'string'
    ? (value as { status_claimed: AllergenStatus }).status_claimed
    : null;
  const status_claimed = status_claimed_raw && ALLERGEN_STATUSES.has(status_claimed_raw)
    ? status_claimed_raw
    : null;
  if (!allergen_code || !source_type || !status_claimed) {
    return null;
  }

  const confidence_claimed_raw = typeof (value as { confidence_claimed?: unknown }).confidence_claimed === 'string'
    ? (value as { confidence_claimed: AllergenConfidence }).confidence_claimed
    : null;
  const confidence_claimed = confidence_claimed_raw && ALLERGEN_CONFIDENCES.has(confidence_claimed_raw)
    ? confidence_claimed_raw
    : undefined;

  return {
    allergen_code,
    source_type,
    status_claimed,
    confidence_claimed,
    source_document_id: parseOptionalPositiveNumber((value as { source_document_id?: unknown }).source_document_id),
    source_product_id: parseOptionalPositiveNumber((value as { source_product_id?: unknown }).source_product_id),
    source_label: typeof (value as { source_label?: unknown }).source_label === 'string' ? (value as { source_label: string }).source_label : null,
    source_excerpt: typeof (value as { source_excerpt?: unknown }).source_excerpt === 'string' ? (value as { source_excerpt: string }).source_excerpt : null,
    captured_by: typeof (value as { captured_by?: unknown }).captured_by === 'string' ? (value as { captured_by: string }).captured_by : null,
    expires_at: typeof (value as { expires_at?: unknown }).expires_at === 'string' ? (value as { expires_at: string }).expires_at : null,
  };
}

function parseDocumentProductMatchInput(value: unknown): DocumentProductMatchInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const item_id = parseRequiredNumber((value as { item_id?: unknown }).item_id);
  const match_status_raw = typeof (value as { match_status?: unknown }).match_status === 'string'
    ? (value as { match_status: DocumentProductMatchInput['match_status'] }).match_status
    : null;
  const match_status = match_status_raw && DOCUMENT_MATCH_STATUSES.includes(match_status_raw)
    ? match_status_raw
    : null;
  if (item_id == null || !match_status) {
    return null;
  }

  const matched_by_raw = typeof (value as { matched_by?: unknown }).matched_by === 'string'
    ? (value as { matched_by: DocumentProductMatchInput['matched_by'] }).matched_by
    : null;
  const matched_by = matched_by_raw && DOCUMENT_MATCH_ROLES.has(matched_by_raw)
    ? matched_by_raw
    : undefined;
  const match_basis_raw = typeof (value as { match_basis?: unknown }).match_basis === 'string'
    ? (value as { match_basis: DocumentMatchBasis }).match_basis
    : null;
  const match_basis = match_basis_raw && DOCUMENT_MATCH_BASES.has(match_basis_raw)
    ? match_basis_raw
    : undefined;
  const match_signal_tier_raw = typeof (value as { match_signal_tier?: unknown }).match_signal_tier === 'string'
    ? (value as { match_signal_tier: DocumentMatchSignalTier }).match_signal_tier
    : null;
  const match_signal_tier = match_signal_tier_raw && DOCUMENT_MATCH_SIGNAL_TIERS.has(match_signal_tier_raw)
    ? match_signal_tier_raw
    : undefined;

  return {
    item_id,
    match_status,
    match_score: parseOptionalFiniteNumber((value as { match_score?: unknown }).match_score),
    match_basis,
    match_signal_tier,
    matched_by,
    notes: typeof (value as { notes?: unknown }).notes === 'string' ? (value as { notes: string }).notes : null,
    active: typeof (value as { active?: unknown }).active === 'boolean' ? (value as { active: boolean }).active : undefined,
  };
}

function refreshDocumentsForVenueScope(db: Database.Database, venueId: number | null): void {
  const rows = db.prepare(
    `
      SELECT id
      FROM allergy_documents
      WHERE (? IS NULL AND venue_id IS NULL)
         OR (? IS NOT NULL AND (venue_id = ? OR venue_id IS NULL))
      ORDER BY id ASC
    `,
  ).all(venueId ?? null, venueId ?? null, venueId ?? null) as Array<{ id: number }>;

  for (const row of rows) {
    refreshAllergyDocumentProductMatches(db, row.id);
  }
}

function parseOptionalPositiveNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
