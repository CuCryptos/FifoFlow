import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { updateItemSchema, updateVendorPriceSchema } from '@fifoflow/shared';
import { ExternalProductMatchService } from '../products/externalProductMatchService.js';
import { ExternalProductRepository } from '../products/externalProductRepositories.js';

const itemIdentifierSchema = updateItemSchema.pick({
  brand_name: true,
  manufacturer_name: true,
  gtin: true,
  upc: true,
  sysco_supc: true,
  manufacturer_item_code: true,
});

const vendorPriceIdentifierSchema = updateVendorPriceSchema.pick({
  vendor_item_code: true,
  vendor_pack_text: true,
  gtin: true,
  upc: true,
  sysco_supc: true,
  brand_name: true,
  manufacturer_name: true,
  source_catalog: true,
});

const itemMatchRequestSchema = z.object({
  vendor_price_id: z.number().int().positive().nullable().optional(),
  mode: z.enum(['auto']).optional().default('auto'),
});

const itemMatchDecisionSchema = z.object({
  match_status: z.enum(['confirmed', 'rejected'] as const),
  matched_by: z.enum(['system', 'operator'] as const).optional().default('operator'),
  notes: z.string().max(1000).nullable().optional(),
  active: z.boolean().optional(),
});

const itemImportSchema = z.object({
  external_product_match_id: z.number().int().positive(),
  import_mode: z.enum(['draft_claims', 'direct_apply'] as const),
  created_by: z.string().max(200).nullable().optional(),
});

const manualImportAllergenClaimSchema = z.object({
  allergen_code: z.string().min(1).max(100),
  status: z.enum(['contains', 'may_contain', 'free_of', 'unknown'] as const),
  confidence: z.enum(['verified', 'high', 'moderate', 'low', 'unverified', 'unknown'] as const).nullable().optional(),
  source_excerpt: z.string().max(1000).nullable().optional(),
});

const manualImportProductSchema = z.object({
  external_key: z.string().max(200).nullable().optional(),
  gtin: z.string().max(100).nullable().optional(),
  upc: z.string().max(100).nullable().optional(),
  vendor_item_code: z.string().max(100).nullable().optional(),
  sysco_supc: z.string().max(100).nullable().optional(),
  brand_name: z.string().max(200).nullable().optional(),
  manufacturer_name: z.string().max(200).nullable().optional(),
  product_name: z.string().min(1).max(250),
  pack_text: z.string().max(200).nullable().optional(),
  size_text: z.string().max(200).nullable().optional(),
  ingredient_statement: z.string().max(20_000).nullable().optional(),
  allergen_statement: z.string().max(10_000).nullable().optional(),
  source_url: z.string().url().max(1000).nullable().optional(),
  raw_payload_json: z.string().max(100_000).nullable().optional(),
  allergen_claims: z.array(manualImportAllergenClaimSchema).max(50).optional().default([]),
});

const catalogSyncSchema = z.object({
  mode: z.enum(['manual_import'] as const),
  created_by: z.string().max(200).nullable().optional(),
  products: z.array(manualImportProductSchema).min(1).max(2000),
});

export function createProductEnrichmentRoutes(db: Database.Database): Router {
  const repository = new ExternalProductRepository(db);
  const matchService = new ExternalProductMatchService(repository);
  const router = Router();

  router.get('/catalogs', (_req, res) => {
    res.json({ catalogs: repository.listCatalogs() });
  });

  router.post('/catalogs/:catalogCode/sync', (req, res) => {
    const catalog = repository.getCatalogByCode(req.params.catalogCode);
    if (!catalog) {
      res.status(404).json({ error: 'Catalog not found' });
      return;
    }

    const parsed = catalogSyncSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    if (parsed.data.mode !== 'manual_import' || catalog.code !== 'manual_import') {
      res.status(400).json({
        error: 'Only manual_import sync is supported right now, and it must target the manual_import catalog.',
      });
      return;
    }

    const run = repository.createSyncRun(catalog.id);
    try {
      const summary = repository.upsertExternalProducts(catalog.code, parsed.data.products);
      const completedRun = repository.completeSyncRun(run.id, 'completed', {
        created_by: parsed.data.created_by ?? null,
        mode: parsed.data.mode,
        ...summary,
      });
      res.json({
        run: completedRun,
        summary,
      });
    } catch (error: any) {
      const message = error?.message ?? 'Unable to complete catalog sync';
      const failedRun = repository.completeSyncRun(run.id, 'failed', {
        error: message,
      }, message);
      res.status(400).json({
        error: message,
        run: failedRun,
      });
    }
  });

  router.get('/search', (req, res) => {
    res.json({
      products: repository.searchExternalProducts({
        query: queryString(req.query.query),
        catalog: queryString(req.query.catalog),
        gtin: queryString(req.query.gtin),
        upc: queryString(req.query.upc),
        sysco_supc: queryString(req.query.sysco_supc),
        vendor_item_code: queryString(req.query.vendor_item_code),
        limit: parseOptionalNumber(req.query.limit) ?? 12,
      }),
    });
  });

  router.get('/review-queue', (req, res) => {
    res.json(repository.listReviewQueue(
      parseOptionalNumber(req.query.limit) ?? 25,
      parseOptionalNumber(req.query.venue_id),
    ));
  });

  router.get('/items/:itemId', (req, res) => {
    const itemId = parseRequiredNumber(req.params.itemId);
    if (itemId == null) {
      res.status(400).json({ error: 'Invalid item id' });
      return;
    }

    const detail = repository.getItemDetail(itemId);
    if (!detail) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    res.json(detail);
  });

  router.put('/items/:itemId/identifiers', (req, res) => {
    const itemId = parseRequiredNumber(req.params.itemId);
    if (itemId == null) {
      res.status(400).json({ error: 'Invalid item id' });
      return;
    }

    const parsed = itemIdentifierSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const item = repository.updateItemIdentifiers(itemId, parsed.data);
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    res.json({ item });
  });

  router.put('/items/:itemId/vendor-prices/:priceId/identifiers', (req, res) => {
    const itemId = parseRequiredNumber(req.params.itemId);
    const priceId = parseRequiredNumber(req.params.priceId);
    if (itemId == null || priceId == null) {
      res.status(400).json({ error: 'Invalid item or vendor price id' });
      return;
    }

    const parsed = vendorPriceIdentifierSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const vendorPrice = repository.updateVendorPriceIdentifiers(itemId, priceId, parsed.data);
    if (!vendorPrice) {
      res.status(404).json({ error: 'Vendor price not found' });
      return;
    }

    res.json({ vendor_price: vendorPrice });
  });

  router.post('/items/:itemId/match', (req, res) => {
    const itemId = parseRequiredNumber(req.params.itemId);
    if (itemId == null) {
      res.status(400).json({ error: 'Invalid item id' });
      return;
    }

    const parsed = itemMatchRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const matches = matchService.evaluateItem(itemId, parsed.data.vendor_price_id);
      res.json({ matches });
    } catch (error: any) {
      if (String(error?.message ?? '').includes('Item not found')) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }
      res.status(400).json({ error: error?.message ?? 'Unable to evaluate product matches' });
    }
  });

  router.patch('/items/:itemId/matches/:matchId', (req, res) => {
    const itemId = parseRequiredNumber(req.params.itemId);
    const matchId = parseRequiredNumber(req.params.matchId);
    if (itemId == null || matchId == null) {
      res.status(400).json({ error: 'Invalid item or match id' });
      return;
    }

    const parsed = itemMatchDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const match = repository.updateMatchDecision(itemId, matchId, {
      ...parsed.data,
      active: parsed.data.active === undefined ? undefined : parsed.data.active ? 1 : 0,
    });
    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    res.json({ match });
  });

  router.post('/items/:itemId/import-allergens', (req, res) => {
    const itemId = parseRequiredNumber(req.params.itemId);
    if (itemId == null) {
      res.status(400).json({ error: 'Invalid item id' });
      return;
    }

    const parsed = itemImportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    res.status(501).json({
      error: 'Allergen import is not implemented yet.',
      item_id: itemId,
      external_product_match_id: parsed.data.external_product_match_id,
      import_mode: parsed.data.import_mode,
    });
  });

  return router;
}

function parseRequiredNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
