import type Database from 'better-sqlite3';
import type {
  ExternalProduct,
  ExternalProductAllergenClaim,
  ExternalProductCatalog,
  ExternalProductMatch,
  ExternalProductMatchBasis,
  ExternalProductMatchConfidence,
  ExternalProductMatchStatus,
  ExternalProductMatchedBy,
  ExternalProductSyncRun,
  Item,
  VendorPrice,
} from '@fifoflow/shared';

export interface ExternalProductSearchFilters {
  query?: string;
  catalog?: string;
  gtin?: string;
  upc?: string;
  sysco_supc?: string;
  vendor_item_code?: string;
  limit?: number;
}

export interface ExternalProductRecord extends ExternalProduct {
  catalog_code: string;
  catalog_name: string;
}

export interface ExternalProductMatchRecord extends ExternalProductMatch {
  external_product: ExternalProductRecord;
}

export interface ProductEnrichmentItemDetail {
  item: Item;
  vendor_prices: VendorPrice[];
  matches: ExternalProductMatchRecord[];
  allergen_claims: Array<{
    id: number;
    external_product_id: number;
    allergen_id: number;
    allergen_code: string | null;
    allergen_name: string | null;
    status: string;
    confidence: string;
    source_excerpt: string | null;
    created_at: string;
    updated_at: string;
  }>;
}

export interface ProductEnrichmentReviewQueue {
  missing_identifiers: Item[];
  candidate_conflicts: Array<{
    item: Item;
    active_match_count: number;
    active_matches: ExternalProductMatchRecord[];
  }>;
  ready_to_import: Array<{
    item: Item;
    active_match: ExternalProductMatchRecord;
    allergen_claim_count: number;
  }>;
  unmatched_items: Item[];
}

export interface ExternalProductMatchUpsertInput {
  item_id: number;
  vendor_price_id: number | null;
  external_product_id: number;
  match_status: ExternalProductMatchStatus;
  match_basis: ExternalProductMatchBasis;
  match_confidence: ExternalProductMatchConfidence;
  match_score: number | null;
  matched_by: ExternalProductMatchedBy;
  notes: string | null;
  active: number;
}

export interface ManualExternalProductImportAllergenClaimInput {
  allergen_code: string;
  status: ExternalProductAllergenClaim['status'];
  confidence?: ExternalProductAllergenClaim['confidence'] | null;
  source_excerpt?: string | null;
}

export interface ManualExternalProductImportRow {
  external_key?: string | null;
  gtin?: string | null;
  upc?: string | null;
  vendor_item_code?: string | null;
  sysco_supc?: string | null;
  brand_name?: string | null;
  manufacturer_name?: string | null;
  product_name: string;
  pack_text?: string | null;
  size_text?: string | null;
  ingredient_statement?: string | null;
  allergen_statement?: string | null;
  source_url?: string | null;
  raw_payload_json?: string | null;
  allergen_claims?: ManualExternalProductImportAllergenClaimInput[];
}

export interface ExternalProductCatalogSyncSummary {
  products_upserted: number;
  products_created: number;
  products_updated: number;
  allergen_claims_upserted: number;
  allergen_claims_unresolved: number;
  products: ExternalProductRecord[];
}

const ITEM_IDENTIFIER_FIELDS = [
  'brand_name',
  'manufacturer_name',
  'gtin',
  'upc',
  'sysco_supc',
  'manufacturer_item_code',
] as const;

const VENDOR_PRICE_IDENTIFIER_FIELDS = [
  'vendor_item_code',
  'vendor_pack_text',
  'gtin',
  'upc',
  'sysco_supc',
  'brand_name',
  'manufacturer_name',
  'source_catalog',
] as const;

type ItemIdentifierField = (typeof ITEM_IDENTIFIER_FIELDS)[number];
type VendorPriceIdentifierField = (typeof VENDOR_PRICE_IDENTIFIER_FIELDS)[number];

export class ExternalProductRepository {
  constructor(private readonly db: Database.Database) {}

  listCatalogs(): ExternalProductCatalog[] {
    return this.db.prepare(`
      SELECT *
      FROM external_product_catalogs
      ORDER BY name ASC
    `).all() as ExternalProductCatalog[];
  }

  getCatalogByCode(code: string): ExternalProductCatalog | undefined {
    return this.db.prepare(`
      SELECT *
      FROM external_product_catalogs
      WHERE code = ?
      LIMIT 1
    `).get(code) as ExternalProductCatalog | undefined;
  }

  createSyncRun(catalogId: number): ExternalProductSyncRun {
    const result = this.db.prepare(`
      INSERT INTO external_product_sync_runs (catalog_id, status)
      VALUES (?, 'running')
    `).run(catalogId);
    return this.getSyncRun(Number(result.lastInsertRowid)) as ExternalProductSyncRun;
  }

  getSyncRun(runId: number): ExternalProductSyncRun | undefined {
    return this.db.prepare(`
      SELECT *
      FROM external_product_sync_runs
      WHERE id = ?
      LIMIT 1
    `).get(runId) as ExternalProductSyncRun | undefined;
  }

  completeSyncRun(runId: number, status: ExternalProductSyncRun['status'], summary: Record<string, unknown>, notes?: string | null): ExternalProductSyncRun | undefined {
    this.db.prepare(`
      UPDATE external_product_sync_runs
      SET status = ?,
          completed_at = datetime('now'),
          summary_json = ?,
          notes = ?
      WHERE id = ?
    `).run(status, JSON.stringify(summary), notes ?? null, runId);
    return this.getSyncRun(runId);
  }

  searchExternalProducts(filters: ExternalProductSearchFilters): ExternalProductRecord[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const limit = Math.max(1, Math.min(filters.limit ?? 12, 50));

    if (filters.catalog) {
      clauses.push('c.code = ?');
      params.push(filters.catalog);
    }
    if (filters.gtin) {
      clauses.push('p.gtin = ?');
      params.push(filters.gtin);
    }
    if (filters.upc) {
      clauses.push('p.upc = ?');
      params.push(filters.upc);
    }
    if (filters.sysco_supc) {
      clauses.push('p.sysco_supc = ?');
      params.push(filters.sysco_supc);
    }
    if (filters.vendor_item_code) {
      clauses.push('p.vendor_item_code = ?');
      params.push(filters.vendor_item_code);
    }
    if (filters.query) {
      clauses.push(`(
        p.product_name LIKE ?
        OR COALESCE(p.brand_name, '') LIKE ?
        OR COALESCE(p.manufacturer_name, '') LIKE ?
        OR COALESCE(p.pack_text, '') LIKE ?
        OR COALESCE(p.size_text, '') LIKE ?
      )`);
      const like = `%${escapeLike(filters.query)}%`;
      params.push(like, like, like, like, like);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.db.prepare(`
      SELECT
        p.*,
        c.code AS catalog_code,
        c.name AS catalog_name
      FROM external_products p
      JOIN external_product_catalogs c ON c.id = p.catalog_id
      ${where}
      ORDER BY p.product_name COLLATE NOCASE ASC
      LIMIT ?
    `).all(...params, limit) as ExternalProductRecord[];
  }

  upsertExternalProducts(catalogCode: string, rows: ManualExternalProductImportRow[]): ExternalProductCatalogSyncSummary {
    const catalog = this.getCatalogByCode(catalogCode);
    if (!catalog) {
      throw new Error(`Catalog not found: ${catalogCode}`);
    }

    const insertedIds: number[] = [];
    const allergenLookup = this.buildAllergenLookup();
    let productsCreated = 0;
    let productsUpdated = 0;
    let claimsUpserted = 0;
    let claimsUnresolved = 0;

    const transaction = this.db.transaction((inputRows: ManualExternalProductImportRow[]) => {
      for (const row of inputRows) {
        const normalizedRow = sanitizeManualImportRow(row);
        const externalKey = normalizedRow.external_key || buildExternalKey(normalizedRow);
        const rawPayload = normalizedRow.raw_payload_json ?? JSON.stringify(normalizedRow);
        const existing = this.db.prepare(`
          SELECT id
          FROM external_products
          WHERE catalog_id = ? AND external_key = ?
          LIMIT 1
        `).get(catalog.id, externalKey) as { id: number } | undefined;

        let externalProductId: number;
        if (existing) {
          this.db.prepare(`
            UPDATE external_products
            SET gtin = ?,
                upc = ?,
                vendor_item_code = ?,
                sysco_supc = ?,
                brand_name = ?,
                manufacturer_name = ?,
                product_name = ?,
                pack_text = ?,
                size_text = ?,
                ingredient_statement = ?,
                allergen_statement = ?,
                raw_payload_json = ?,
                source_url = ?,
                last_seen_at = datetime('now')
            WHERE id = ?
          `).run(
            normalizedRow.gtin,
            normalizedRow.upc,
            normalizedRow.vendor_item_code,
            normalizedRow.sysco_supc,
            normalizedRow.brand_name,
            normalizedRow.manufacturer_name,
            normalizedRow.product_name,
            normalizedRow.pack_text,
            normalizedRow.size_text,
            normalizedRow.ingredient_statement,
            normalizedRow.allergen_statement,
            rawPayload,
            normalizedRow.source_url,
            existing.id,
          );
          externalProductId = existing.id;
          productsUpdated += 1;
        } else {
          const result = this.db.prepare(`
            INSERT INTO external_products (
              catalog_id,
              external_key,
              gtin,
              upc,
              vendor_item_code,
              sysco_supc,
              brand_name,
              manufacturer_name,
              product_name,
              pack_text,
              size_text,
              ingredient_statement,
              allergen_statement,
              raw_payload_json,
              source_url,
              last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `).run(
            catalog.id,
            externalKey,
            normalizedRow.gtin,
            normalizedRow.upc,
            normalizedRow.vendor_item_code,
            normalizedRow.sysco_supc,
            normalizedRow.brand_name,
            normalizedRow.manufacturer_name,
            normalizedRow.product_name,
            normalizedRow.pack_text,
            normalizedRow.size_text,
            normalizedRow.ingredient_statement,
            normalizedRow.allergen_statement,
            rawPayload,
            normalizedRow.source_url,
          );
          externalProductId = Number(result.lastInsertRowid);
          productsCreated += 1;
        }

        insertedIds.push(externalProductId);
        const claimResult = this.replaceExternalProductAllergenClaims(
          externalProductId,
          normalizedRow.allergen_claims ?? [],
          allergenLookup,
        );
        claimsUpserted += claimResult.claims_upserted;
        claimsUnresolved += claimResult.claims_unresolved;
      }
    });

    transaction(rows);
    const products = this.listExternalProductsByIds(insertedIds);

    return {
      products_upserted: productsCreated + productsUpdated,
      products_created: productsCreated,
      products_updated: productsUpdated,
      allergen_claims_upserted: claimsUpserted,
      allergen_claims_unresolved: claimsUnresolved,
      products,
    };
  }

  getItem(itemId: number): Item | undefined {
    return this.db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as Item | undefined;
  }

  listVendorPricesForItem(itemId: number): VendorPrice[] {
    return this.db.prepare(`
      SELECT vp.*, v.name AS vendor_name
      FROM vendor_prices vp
      JOIN vendors v ON v.id = vp.vendor_id
      WHERE vp.item_id = ?
      ORDER BY vp.is_default DESC, v.name ASC
    `).all(itemId).map((row: any) => ({
      ...row,
      is_default: row.is_default === 1,
    })) as VendorPrice[];
  }

  getVendorPrice(itemId: number, priceId: number): VendorPrice | undefined {
    const row = this.db.prepare(`
      SELECT vp.*, v.name AS vendor_name
      FROM vendor_prices vp
      JOIN vendors v ON v.id = vp.vendor_id
      WHERE vp.item_id = ? AND vp.id = ?
    `).get(itemId, priceId) as any | undefined;
    return row ? { ...row, is_default: row.is_default === 1 } as VendorPrice : undefined;
  }

  updateItemIdentifiers(itemId: number, updates: Partial<Record<ItemIdentifierField, string | null>>): Item | undefined {
    const fields = ITEM_IDENTIFIER_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(updates, field))
      .map((field) => [field, updates[field]] as const);

    if (fields.length === 0) {
      return this.getItem(itemId);
    }

    const setClauses = fields.map(([field]) => `${field} = ?`).join(', ');
    this.db.prepare(`UPDATE items SET ${setClauses} WHERE id = ?`).run(...fields.map(([, value]) => value ?? null), itemId);
    return this.getItem(itemId);
  }

  updateVendorPriceIdentifiers(
    itemId: number,
    priceId: number,
    updates: Partial<Record<VendorPriceIdentifierField, string | null>>,
  ): VendorPrice | undefined {
    const fields = VENDOR_PRICE_IDENTIFIER_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(updates, field))
      .map((field) => [field, updates[field]] as const);

    if (fields.length === 0) {
      return this.getVendorPrice(itemId, priceId);
    }

    const setClauses = fields.map(([field]) => `${field} = ?`).join(', ');
    this.db.prepare(`UPDATE vendor_prices SET ${setClauses} WHERE item_id = ? AND id = ?`)
      .run(...fields.map(([, value]) => value ?? null), itemId, priceId);
    return this.getVendorPrice(itemId, priceId);
  }

  upsertMatch(input: ExternalProductMatchUpsertInput): ExternalProductMatchRecord {
    const existing = this.db.prepare(`
      SELECT id
      FROM external_product_matches
      WHERE item_id = ? AND external_product_id = ?
      LIMIT 1
    `).get(input.item_id, input.external_product_id) as { id: number } | undefined;

    if (existing) {
      this.db.prepare(`
        UPDATE external_product_matches
        SET vendor_price_id = ?,
            match_status = ?,
            match_basis = ?,
            match_confidence = ?,
            match_score = ?,
            matched_by = ?,
            notes = ?,
            active = ?
        WHERE id = ?
      `).run(
        input.vendor_price_id,
        input.match_status,
        input.match_basis,
        input.match_confidence,
        input.match_score,
        input.matched_by,
        input.notes,
        input.active,
        existing.id,
      );
      return this.getMatchById(existing.id) as ExternalProductMatchRecord;
    }

    const result = this.db.prepare(`
      INSERT INTO external_product_matches (
        item_id,
        vendor_price_id,
        external_product_id,
        match_status,
        match_basis,
        match_confidence,
        match_score,
        matched_by,
        notes,
        active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.item_id,
      input.vendor_price_id,
      input.external_product_id,
      input.match_status,
      input.match_basis,
      input.match_confidence,
      input.match_score,
      input.matched_by,
      input.notes,
      input.active,
    );

    return this.getMatchById(Number(result.lastInsertRowid)) as ExternalProductMatchRecord;
  }

  getMatchById(matchId: number): ExternalProductMatchRecord | undefined {
    const row = this.db.prepare(matchSelectSql('WHERE m.id = ?')).get(matchId) as any | undefined;
    return row ? hydrateMatchRecord(row) : undefined;
  }

  updateMatchDecision(
    itemId: number,
    matchId: number,
    updates: {
      match_status: ExternalProductMatchStatus;
      matched_by: ExternalProductMatchedBy;
      notes?: string | null;
      active?: number;
    },
  ): ExternalProductMatchRecord | undefined {
    this.db.prepare(`
      UPDATE external_product_matches
      SET match_status = ?,
          matched_by = ?,
          notes = ?,
          active = ?
      WHERE id = ? AND item_id = ?
    `).run(
      updates.match_status,
      updates.matched_by,
      updates.notes ?? null,
      updates.active ?? 1,
      matchId,
      itemId,
    );
    return this.getMatchById(matchId);
  }

  listMatchesForItem(itemId: number): ExternalProductMatchRecord[] {
    return this.db.prepare(matchSelectSql('WHERE m.item_id = ?')).all(itemId).map(hydrateMatchRecord);
  }

  updateItemMatchSnapshot(itemId: number, confidence: ExternalProductMatchConfidence | null): void {
    this.db.prepare(`
      UPDATE items
      SET external_product_confidence = ?,
          external_product_last_matched_at = datetime('now')
      WHERE id = ?
    `).run(confidence, itemId);
  }

  getItemDetail(itemId: number): ProductEnrichmentItemDetail | undefined {
    const item = this.getItem(itemId);
    if (!item) {
      return undefined;
    }

    const vendorPrices = this.listVendorPricesForItem(itemId);
    const matches = this.listMatchesForItem(itemId);
    const matchProductIds = [...new Set(matches.map((match) => match.external_product_id))];
    const allergenClaims = matchProductIds.length > 0 && this.hasAllergenTables()
      ? this.db.prepare(`
          SELECT
            claims.*,
            allergens.code AS allergen_code,
            allergens.name AS allergen_name
          FROM external_product_allergen_claims claims
          LEFT JOIN allergens ON allergens.id = claims.allergen_id
          WHERE claims.external_product_id IN (${matchProductIds.map(() => '?').join(', ')})
          ORDER BY claims.external_product_id ASC, allergen_name ASC
        `).all(...matchProductIds) as ProductEnrichmentItemDetail['allergen_claims']
      : [];

    return {
      item,
      vendor_prices: vendorPrices,
      matches,
      allergen_claims: allergenClaims,
    };
  }

  listReviewQueue(limit = 25, venueId?: number): ProductEnrichmentReviewQueue {
    const venueFilter = venueId != null ? 'AND venue_id = ?' : '';
    const venueParams = venueId != null ? [venueId] : [];
    const missingIdentifiers = this.db.prepare(`
      SELECT *
      FROM items
      WHERE COALESCE(gtin, '') = ''
        AND COALESCE(upc, '') = ''
        AND COALESCE(sysco_supc, '') = ''
        AND COALESCE(manufacturer_item_code, '') = ''
        ${venueFilter}
      ORDER BY updated_at DESC, name ASC
      LIMIT ?
    `).all(...venueParams, limit) as Item[];

    const conflictRows = this.db.prepare(`
      SELECT m.item_id, COUNT(*) AS active_match_count
      FROM external_product_matches m
      JOIN items i ON i.id = m.item_id
      WHERE m.active = 1
        ${venueId != null ? 'AND i.venue_id = ?' : ''}
      GROUP BY m.item_id
      HAVING COUNT(*) > 1
      ORDER BY active_match_count DESC, m.item_id ASC
      LIMIT ?
    `).all(...venueParams, limit) as Array<{ item_id: number; active_match_count: number }>;

    const candidateConflicts = conflictRows
      .map((row) => {
        const item = this.getItem(row.item_id);
        if (!item) return null;
        return {
          item,
          active_match_count: row.active_match_count,
          active_matches: this.listMatchesForItem(row.item_id).filter((match) => match.active === 1),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const readyRows = this.db.prepare(`
      SELECT
        m.id AS match_id,
        m.item_id,
        COUNT(claims.id) AS allergen_claim_count
      FROM external_product_matches m
      JOIN items i ON i.id = m.item_id
      JOIN external_product_allergen_claims claims ON claims.external_product_id = m.external_product_id
      WHERE m.active = 1
        AND m.match_status IN ('confirmed', 'auto_confirmed')
        ${venueId != null ? 'AND i.venue_id = ?' : ''}
      GROUP BY m.id, m.item_id
      ORDER BY allergen_claim_count DESC, m.item_id ASC
      LIMIT ?
    `).all(...venueParams, limit) as Array<{ match_id: number; item_id: number; allergen_claim_count: number }>;

    const readyToImport = readyRows
      .map((row) => {
        const item = this.getItem(row.item_id);
        const match = this.getMatchById(row.match_id);
        if (!item || !match) return null;
        return {
          item,
          active_match: match,
          allergen_claim_count: row.allergen_claim_count,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const unmatchedItems = this.db.prepare(`
      SELECT *
      FROM items i
      WHERE (
        COALESCE(i.gtin, '') <> ''
        OR COALESCE(i.upc, '') <> ''
        OR COALESCE(i.sysco_supc, '') <> ''
        OR COALESCE(i.manufacturer_item_code, '') <> ''
      )
      ${venueId != null ? 'AND i.venue_id = ?' : ''}
      AND NOT EXISTS (
        SELECT 1
        FROM external_product_matches m
        WHERE m.item_id = i.id AND m.active = 1
      )
      ORDER BY i.updated_at DESC, i.name ASC
      LIMIT ?
    `).all(...venueParams, limit) as Item[];

    return {
      missing_identifiers: missingIdentifiers,
      candidate_conflicts: candidateConflicts,
      ready_to_import: readyToImport,
      unmatched_items: unmatchedItems,
    };
  }

  private hasAllergenTables(): boolean {
    const row = this.db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'allergens'
      LIMIT 1
    `).get() as { name: string } | undefined;
    return Boolean(row);
  }

  private listExternalProductsByIds(productIds: number[]): ExternalProductRecord[] {
    const uniqueIds = [...new Set(productIds)].filter((id) => Number.isInteger(id) && id > 0);
    if (uniqueIds.length === 0) {
      return [];
    }

    return this.db.prepare(`
      SELECT
        p.*,
        c.code AS catalog_code,
        c.name AS catalog_name
      FROM external_products p
      JOIN external_product_catalogs c ON c.id = p.catalog_id
      WHERE p.id IN (${uniqueIds.map(() => '?').join(', ')})
      ORDER BY p.product_name COLLATE NOCASE ASC
    `).all(...uniqueIds) as ExternalProductRecord[];
  }

  private buildAllergenLookup(): Map<string, number> {
    const lookup = new Map<string, number>();
    if (!this.hasAllergenTables()) {
      return lookup;
    }

    const rows = this.db.prepare(`
      SELECT id, code, name
      FROM allergens
    `).all() as Array<{ id: number; code: string; name: string }>;

    for (const row of rows) {
      lookup.set(normalizeAllergenKey(row.code), row.id);
      lookup.set(normalizeAllergenKey(row.name), row.id);
    }

    return lookup;
  }

  private replaceExternalProductAllergenClaims(
    externalProductId: number,
    claims: ManualExternalProductImportAllergenClaimInput[],
    allergenLookup: Map<string, number>,
  ): { claims_upserted: number; claims_unresolved: number } {
    this.db.prepare(`
      DELETE FROM external_product_allergen_claims
      WHERE external_product_id = ?
    `).run(externalProductId);

    let claimsUpserted = 0;
    let claimsUnresolved = 0;
    const seenAllergens = new Set<number>();
    for (const claim of claims) {
      const allergenId = allergenLookup.get(normalizeAllergenKey(claim.allergen_code));
      if (!allergenId) {
        claimsUnresolved += 1;
        continue;
      }
      if (seenAllergens.has(allergenId)) {
        continue;
      }
      seenAllergens.add(allergenId);
      this.db.prepare(`
        INSERT INTO external_product_allergen_claims (
          external_product_id,
          allergen_id,
          status,
          confidence,
          source_excerpt
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        externalProductId,
        allergenId,
        claim.status,
        claim.confidence ?? 'unverified',
        claim.source_excerpt ?? null,
      );
      claimsUpserted += 1;
    }

    return {
      claims_upserted: claimsUpserted,
      claims_unresolved: claimsUnresolved,
    };
  }
}

function matchSelectSql(whereClause: string): string {
  return `
    SELECT
      m.*,
      p.catalog_id AS p_catalog_id,
      p.external_key AS p_external_key,
      p.gtin AS p_gtin,
      p.upc AS p_upc,
      p.vendor_item_code AS p_vendor_item_code,
      p.sysco_supc AS p_sysco_supc,
      p.brand_name AS p_brand_name,
      p.manufacturer_name AS p_manufacturer_name,
      p.product_name AS p_product_name,
      p.pack_text AS p_pack_text,
      p.size_text AS p_size_text,
      p.ingredient_statement AS p_ingredient_statement,
      p.allergen_statement AS p_allergen_statement,
      p.nutrition_json AS p_nutrition_json,
      p.raw_payload_json AS p_raw_payload_json,
      p.source_url AS p_source_url,
      p.last_seen_at AS p_last_seen_at,
      p.created_at AS p_created_at,
      p.updated_at AS p_updated_at,
      c.code AS catalog_code,
      c.name AS catalog_name
    FROM external_product_matches m
    JOIN external_products p ON p.id = m.external_product_id
    JOIN external_product_catalogs c ON c.id = p.catalog_id
    ${whereClause}
    ORDER BY
      CASE m.match_status
        WHEN 'auto_confirmed' THEN 0
        WHEN 'confirmed' THEN 1
        WHEN 'suggested' THEN 2
        ELSE 3
      END,
      CASE m.match_confidence
        WHEN 'high' THEN 0
        WHEN 'medium' THEN 1
        ELSE 2
      END,
      COALESCE(m.match_score, 0) DESC,
      p.product_name COLLATE NOCASE ASC
  `;
}

function hydrateMatchRecord(row: any): ExternalProductMatchRecord {
  return {
    id: row.id,
    item_id: row.item_id,
    vendor_price_id: row.vendor_price_id,
    external_product_id: row.external_product_id,
    match_status: row.match_status,
    match_basis: row.match_basis,
    match_confidence: row.match_confidence,
    match_score: row.match_score,
    matched_by: row.matched_by,
    notes: row.notes,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    external_product: {
      id: row.external_product_id,
      catalog_id: row.p_catalog_id,
      external_key: row.p_external_key,
      gtin: row.p_gtin,
      upc: row.p_upc,
      vendor_item_code: row.p_vendor_item_code,
      sysco_supc: row.p_sysco_supc,
      brand_name: row.p_brand_name,
      manufacturer_name: row.p_manufacturer_name,
      product_name: row.p_product_name,
      pack_text: row.p_pack_text,
      size_text: row.p_size_text,
      ingredient_statement: row.p_ingredient_statement,
      allergen_statement: row.p_allergen_statement,
      nutrition_json: row.p_nutrition_json,
      raw_payload_json: row.p_raw_payload_json,
      source_url: row.p_source_url,
      last_seen_at: row.p_last_seen_at,
      created_at: row.p_created_at,
      updated_at: row.p_updated_at,
      catalog_code: row.catalog_code,
      catalog_name: row.catalog_name,
    },
  };
}

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, (char) => `\\${char}`);
}

function sanitizeManualImportRow(row: ManualExternalProductImportRow): ManualExternalProductImportRow {
  return {
    external_key: normalizeNullableText(row.external_key),
    gtin: normalizeNullableText(row.gtin),
    upc: normalizeNullableText(row.upc),
    vendor_item_code: normalizeNullableText(row.vendor_item_code),
    sysco_supc: normalizeNullableText(row.sysco_supc),
    brand_name: normalizeNullableText(row.brand_name),
    manufacturer_name: normalizeNullableText(row.manufacturer_name),
    product_name: row.product_name.trim(),
    pack_text: normalizeNullableText(row.pack_text),
    size_text: normalizeNullableText(row.size_text),
    ingredient_statement: normalizeNullableText(row.ingredient_statement),
    allergen_statement: normalizeNullableText(row.allergen_statement),
    source_url: normalizeNullableText(row.source_url),
    raw_payload_json: normalizeNullableText(row.raw_payload_json),
    allergen_claims: row.allergen_claims?.map((claim) => ({
      allergen_code: claim.allergen_code.trim(),
      status: claim.status,
      confidence: claim.confidence ?? 'unverified',
      source_excerpt: normalizeNullableText(claim.source_excerpt),
    })).filter((claim) => claim.allergen_code.length > 0) ?? [],
  };
}

function buildExternalKey(row: ManualExternalProductImportRow): string {
  return [
    row.sysco_supc,
    row.gtin,
    row.upc,
    row.vendor_item_code,
    `${row.product_name}:${row.pack_text ?? ''}:${row.size_text ?? ''}`,
  ]
    .map((value) => normalizeNullableText(value))
    .find((value) => value != null && value.length > 0)
    ?.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9:_-]/g, '') ?? `manual-${Date.now()}`;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeAllergenKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
