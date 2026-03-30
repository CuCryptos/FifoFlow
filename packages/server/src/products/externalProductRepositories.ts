import type Database from 'better-sqlite3';
import type {
  ExternalProduct,
  ExternalProductCatalog,
  ExternalProductMatch,
  ExternalProductMatchBasis,
  ExternalProductMatchConfidence,
  ExternalProductMatchStatus,
  ExternalProductMatchedBy,
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

  listReviewQueue(limit = 25): ProductEnrichmentReviewQueue {
    const missingIdentifiers = this.db.prepare(`
      SELECT *
      FROM items
      WHERE COALESCE(gtin, '') = ''
        AND COALESCE(upc, '') = ''
        AND COALESCE(sysco_supc, '') = ''
        AND COALESCE(manufacturer_item_code, '') = ''
      ORDER BY updated_at DESC, name ASC
      LIMIT ?
    `).all(limit) as Item[];

    const conflictRows = this.db.prepare(`
      SELECT item_id, COUNT(*) AS active_match_count
      FROM external_product_matches
      WHERE active = 1
      GROUP BY item_id
      HAVING COUNT(*) > 1
      ORDER BY active_match_count DESC, item_id ASC
      LIMIT ?
    `).all(limit) as Array<{ item_id: number; active_match_count: number }>;

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
      JOIN external_product_allergen_claims claims ON claims.external_product_id = m.external_product_id
      WHERE m.active = 1
        AND m.match_status IN ('confirmed', 'auto_confirmed')
      GROUP BY m.id, m.item_id
      ORDER BY allergen_claim_count DESC, m.item_id ASC
      LIMIT ?
    `).all(limit) as Array<{ match_id: number; item_id: number; allergen_claim_count: number }>;

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
      AND NOT EXISTS (
        SELECT 1
        FROM external_product_matches m
        WHERE m.item_id = i.id AND m.active = 1
      )
      ORDER BY i.updated_at DESC, i.name ASC
      LIMIT ?
    `).all(limit) as Item[];

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
