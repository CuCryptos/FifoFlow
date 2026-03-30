import type Database from 'better-sqlite3';
import type {
  Category,
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
  Unit,
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
  import_audits: Array<{
    id: number;
    item_id: number;
    external_product_match_id: number | null;
    import_source: 'external_product' | 'uploaded_chart' | 'operator';
    import_mode: 'draft_claims' | 'direct_apply';
    summary_json: string;
    created_by: string | null;
    created_at: string;
    summary: {
      external_product_id: number | null;
      imported_rows: number;
      evidence_rows: number;
      skipped_rows: number;
      imported_allergen_ids: string[];
      skipped_allergen_ids: string[];
    };
    match: ExternalProductMatchRecord | null;
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
  vendor_item_name?: string | null;
  vendor_name?: string | null;
  vendor_pack_text?: string | null;
  sysco_supc?: string | null;
  brand_name?: string | null;
  manufacturer_name?: string | null;
  product_name: string;
  pack_text?: string | null;
  size_text?: string | null;
  inventory_item_name?: string | null;
  inventory_category?: Category | null;
  inventory_unit?: Unit | null;
  order_unit?: Unit | null;
  order_unit_price?: number | null;
  qty_per_unit?: number | null;
  item_size_value?: number | null;
  item_size_unit?: Unit | null;
  venue_id?: number | null;
  venue_name?: string | null;
  create_item_if_missing?: boolean | null;
  make_default_vendor_price?: boolean | null;
  ingredient_statement?: string | null;
  allergen_statement?: string | null;
  source_url?: string | null;
  raw_payload_json?: string | null;
  allergen_claims?: ManualExternalProductImportAllergenClaimInput[];
}

export interface ExternalProductImportDefaults {
  default_vendor_name?: string | null;
  default_venue_id?: number | null;
  default_inventory_category?: Category | null;
  default_inventory_unit?: Unit | null;
  default_order_unit?: Unit | null;
  map_distributor_rows?: boolean;
}

export interface ExternalProductCatalogSyncSummary {
  products_upserted: number;
  products_created: number;
  products_updated: number;
  allergen_claims_upserted: number;
  allergen_claims_unresolved: number;
  inventory_items_created: number;
  inventory_items_matched: number;
  vendors_created: number;
  vendor_prices_upserted: number;
  products: ExternalProductRecord[];
}

export interface ProductEnrichmentAllergenImportResult {
  item_id: number;
  external_product_match_id: number;
  imported_rows: number;
  evidence_rows: number;
  skipped_rows: number;
  audit_id: number;
}

export interface DeletedManualImportProductResult {
  id: number;
  product_name: string;
  catalog_code: string;
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
    const queryLike = filters.query ? `%${escapeLike(filters.query)}%` : null;

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
      params.push(queryLike, queryLike, queryLike, queryLike, queryLike);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const orderBy = filters.query
      ? `
      ORDER BY
        CASE
          WHEN COALESCE(p.brand_name, '') LIKE ? THEN 0
          WHEN p.product_name LIKE ? THEN 1
          WHEN COALESCE(p.manufacturer_name, '') LIKE ? THEN 2
          ELSE 3
        END,
        COALESCE(p.brand_name, '') COLLATE NOCASE ASC,
        p.product_name COLLATE NOCASE ASC
    `
      : `
      ORDER BY
        COALESCE(p.brand_name, '') COLLATE NOCASE ASC,
        p.product_name COLLATE NOCASE ASC
    `;
    return this.db.prepare(`
      SELECT
        p.*,
        c.code AS catalog_code,
        c.name AS catalog_name
      FROM external_products p
      JOIN external_product_catalogs c ON c.id = p.catalog_id
      ${where}
      ${orderBy}
      LIMIT ?
    `).all(...params, ...(filters.query ? [queryLike, queryLike, queryLike] : []), limit) as ExternalProductRecord[];
  }

  upsertExternalProducts(
    catalogCode: string,
    rows: ManualExternalProductImportRow[],
    defaults: ExternalProductImportDefaults = {},
  ): ExternalProductCatalogSyncSummary {
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
    let inventoryItemsCreated = 0;
    let inventoryItemsMatched = 0;
    let vendorsCreated = 0;
    let vendorPricesUpserted = 0;

    const transaction = this.db.transaction((inputRows: ManualExternalProductImportRow[]) => {
      for (const row of inputRows) {
        const normalizedRow = sanitizeManualImportRow(row, defaults);
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

        if (defaults.map_distributor_rows) {
          const mapping = this.upsertDistributorMapping(catalog.code, externalProductId, normalizedRow);
          inventoryItemsCreated += mapping.item_created ? 1 : 0;
          inventoryItemsMatched += mapping.item_id != null ? 1 : 0;
          vendorsCreated += mapping.vendor_created ? 1 : 0;
          vendorPricesUpserted += mapping.vendor_price_upserted ? 1 : 0;
        }
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
      inventory_items_created: inventoryItemsCreated,
      inventory_items_matched: inventoryItemsMatched,
      vendors_created: vendorsCreated,
      vendor_prices_upserted: vendorPricesUpserted,
      products,
    };
  }

  private upsertDistributorMapping(
    catalogCode: string,
    externalProductId: number,
    row: ManualExternalProductImportRow,
  ): {
    item_id: number | null;
    item_created: boolean;
    vendor_created: boolean;
    vendor_price_upserted: boolean;
  } {
    const vendorResolution = this.resolveVendorForImport(row.vendor_name);
    const venueId = this.resolveVenueForImport(row.venue_id ?? null, row.venue_name ?? null);
    const itemResolution = this.resolveInventoryItemForImport(row, venueId);

    if (!itemResolution.item_id) {
      return {
        item_id: null,
        item_created: false,
        vendor_created: vendorResolution.created,
        vendor_price_upserted: false,
      };
    }

    const vendorPriceId = vendorResolution.vendor_id != null
      ? this.upsertVendorPriceForImportedRow(itemResolution.item_id, vendorResolution.vendor_id, catalogCode, row)
      : null;

    const matchBasis = deriveImportedMatchBasis(row);
    const confidence: ExternalProductMatchConfidence = matchBasis === 'operator' ? 'medium' : 'high';
    const status: ExternalProductMatchStatus = matchBasis === 'operator' ? 'confirmed' : 'auto_confirmed';

    this.upsertMatch({
      item_id: itemResolution.item_id,
      vendor_price_id: vendorPriceId,
      external_product_id: externalProductId,
      match_status: status,
      match_basis: matchBasis,
      match_confidence: confidence,
      match_score: matchBasis === 'operator' ? 0.82 : 1,
      matched_by: 'system',
      notes: vendorPriceId != null
        ? 'Mapped from distributor catalog import'
        : 'Mapped from distributor catalog import without vendor price row',
      active: 1,
    });
    this.updateItemMatchSnapshot(itemResolution.item_id, confidence);

    return {
      item_id: itemResolution.item_id,
      item_created: itemResolution.created,
      vendor_created: vendorResolution.created,
      vendor_price_upserted: vendorPriceId != null,
    };
  }

  private resolveVendorForImport(vendorName: string | null | undefined): { vendor_id: number | null; created: boolean } {
    const normalizedName = normalizeNullableText(vendorName);
    if (!normalizedName) {
      return { vendor_id: null, created: false };
    }

    const existing = this.db.prepare(`
      SELECT id
      FROM vendors
      WHERE LOWER(name) = LOWER(?)
      LIMIT 1
    `).get(normalizedName) as { id: number } | undefined;

    if (existing) {
      return { vendor_id: existing.id, created: false };
    }

    const result = this.db.prepare(`
      INSERT INTO vendors (name)
      VALUES (?)
    `).run(normalizedName);

    return { vendor_id: Number(result.lastInsertRowid), created: true };
  }

  private resolveVenueForImport(venueId: number | null, venueName: string | null): number | null {
    if (venueId != null) {
      return venueId;
    }

    const normalizedName = normalizeNullableText(venueName);
    if (!normalizedName) {
      return null;
    }

    const existing = this.db.prepare(`
      SELECT id
      FROM venues
      WHERE LOWER(name) = LOWER(?)
      LIMIT 1
    `).get(normalizedName) as { id: number } | undefined;

    if (existing) {
      return existing.id;
    }

    const result = this.db.prepare(`
      INSERT INTO venues (name)
      VALUES (?)
    `).run(normalizedName);

    return Number(result.lastInsertRowid);
  }

  private resolveInventoryItemForImport(
    row: ManualExternalProductImportRow,
    venueId: number | null,
  ): { item_id: number | null; created: boolean } {
    const exactByIdentifiers = this.findItemByImportedIdentifiers(row, venueId);
    if (exactByIdentifiers) {
      this.db.prepare(`
        UPDATE items
        SET brand_name = COALESCE(?, brand_name),
            manufacturer_name = COALESCE(?, manufacturer_name),
            gtin = COALESCE(?, gtin),
            upc = COALESCE(?, upc),
            sysco_supc = COALESCE(?, sysco_supc),
            manufacturer_item_code = COALESCE(?, manufacturer_item_code)
        WHERE id = ?
      `).run(
        row.brand_name ?? null,
        row.manufacturer_name ?? null,
        row.gtin ?? null,
        row.upc ?? null,
        row.sysco_supc ?? null,
        row.vendor_item_code ?? null,
        exactByIdentifiers.id,
      );
      return { item_id: exactByIdentifiers.id, created: false };
    }

    const inventoryName = row.inventory_item_name ?? row.product_name;
    const nameMatch = this.db.prepare(`
      SELECT id
      FROM items
      WHERE LOWER(name) = LOWER(?)
        AND (? IS NULL OR venue_id = ?)
      ORDER BY id ASC
      LIMIT 1
    `).get(inventoryName, venueId, venueId) as { id: number } | undefined;
    if (nameMatch) {
      this.db.prepare(`
        UPDATE items
        SET brand_name = COALESCE(?, brand_name),
            manufacturer_name = COALESCE(?, manufacturer_name),
            gtin = COALESCE(?, gtin),
            upc = COALESCE(?, upc),
            sysco_supc = COALESCE(?, sysco_supc),
            manufacturer_item_code = COALESCE(?, manufacturer_item_code)
        WHERE id = ?
      `).run(
        row.brand_name ?? null,
        row.manufacturer_name ?? null,
        row.gtin ?? null,
        row.upc ?? null,
        row.sysco_supc ?? null,
        row.vendor_item_code ?? null,
        nameMatch.id,
      );
      return { item_id: nameMatch.id, created: false };
    }

    if (row.create_item_if_missing === false) {
      return { item_id: null, created: false };
    }

    const inferredUnit = row.inventory_unit ?? inferInventoryUnit(row);
    const inferredCategory = row.inventory_category ?? inferInventoryCategory(row);
    const itemSizeUnit = row.item_size_unit ?? inferItemSizeUnit(row);
    const itemSizeValue = row.item_size_value ?? inferItemSizeValue(row);
    const orderUnit = row.order_unit ?? inferOrderUnit(row);

    const result = this.db.prepare(`
      INSERT INTO items (
        name,
        category,
        unit,
        order_unit,
        order_unit_price,
        qty_per_unit,
        item_size_value,
        item_size_unit,
        item_size,
        venue_id,
        brand_name,
        manufacturer_name,
        gtin,
        upc,
        sysco_supc,
        manufacturer_item_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      inventoryName,
      inferredCategory,
      inferredUnit,
      orderUnit,
      row.order_unit_price ?? null,
      row.qty_per_unit ?? null,
      itemSizeValue,
      itemSizeUnit,
      itemSizeValue != null && itemSizeUnit ? `${itemSizeValue} ${itemSizeUnit}` : normalizeNullableText(row.size_text),
      venueId,
      row.brand_name ?? null,
      row.manufacturer_name ?? null,
      row.gtin ?? null,
      row.upc ?? null,
      row.sysco_supc ?? null,
      row.vendor_item_code ?? null,
    );

    return { item_id: Number(result.lastInsertRowid), created: true };
  }

  private findItemByImportedIdentifiers(
    row: ManualExternalProductImportRow,
    venueId: number | null,
  ): { id: number } | undefined {
    const identifiers: Array<[string, string | null | undefined]> = [
      ['sysco_supc', row.sysco_supc],
      ['gtin', row.gtin],
      ['upc', row.upc],
      ['manufacturer_item_code', row.vendor_item_code],
    ];

    for (const [column, value] of identifiers) {
      const trimmed = normalizeNullableText(value);
      if (!trimmed) continue;
      const match = this.db.prepare(`
        SELECT id
        FROM items
        WHERE ${column} = ?
          AND (? IS NULL OR venue_id = ?)
        ORDER BY id ASC
        LIMIT 1
      `).get(trimmed, venueId, venueId) as { id: number } | undefined;
      if (match) {
        return match;
      }
    }

    return undefined;
  }

  private upsertVendorPriceForImportedRow(
    itemId: number,
    vendorId: number,
    catalogCode: string,
    row: ManualExternalProductImportRow,
  ): number | null {
    const effectiveVendorItemName = row.vendor_item_name ?? row.product_name;
    const effectiveOrderUnit = row.order_unit ?? inferOrderUnit(row);
    const effectivePackText = row.vendor_pack_text ?? row.pack_text ?? null;
    if (row.order_unit_price == null) {
      return null;
    }

    const existing = this.db.prepare(`
      SELECT id
      FROM vendor_prices
      WHERE item_id = ?
        AND vendor_id = ?
        AND (
          (? IS NOT NULL AND COALESCE(sysco_supc, '') = ?)
          OR (? IS NOT NULL AND COALESCE(vendor_item_code, '') = ?)
          OR LOWER(COALESCE(vendor_item_name, '')) = LOWER(?)
        )
      ORDER BY is_default DESC, id ASC
      LIMIT 1
    `).get(
      itemId,
      vendorId,
      row.sysco_supc ?? null,
      row.sysco_supc ?? null,
      row.vendor_item_code ?? null,
      row.vendor_item_code ?? null,
      effectiveVendorItemName,
    ) as { id: number } | undefined;

    if (existing) {
      this.db.prepare(`
        UPDATE vendor_prices
        SET vendor_item_name = ?,
            vendor_item_code = ?,
            vendor_pack_text = ?,
            order_unit = ?,
            order_unit_price = ?,
            qty_per_unit = ?,
            gtin = ?,
            upc = ?,
            sysco_supc = ?,
            brand_name = ?,
            manufacturer_name = ?,
            source_catalog = ?,
            is_default = CASE WHEN ? = 1 THEN 1 ELSE is_default END
        WHERE id = ?
      `).run(
        effectiveVendorItemName,
        row.vendor_item_code ?? null,
        effectivePackText,
        effectiveOrderUnit,
        row.order_unit_price,
        row.qty_per_unit ?? null,
        row.gtin ?? null,
        row.upc ?? null,
        row.sysco_supc ?? null,
        row.brand_name ?? null,
        row.manufacturer_name ?? null,
        catalogCode,
        row.make_default_vendor_price === false ? 0 : 1,
        existing.id,
      );

      if (row.make_default_vendor_price !== false) {
        this.db.prepare(`UPDATE vendor_prices SET is_default = 0 WHERE item_id = ? AND id <> ?`).run(itemId, existing.id);
      }
      return existing.id;
    }

    if (row.make_default_vendor_price !== false) {
      this.db.prepare(`UPDATE vendor_prices SET is_default = 0 WHERE item_id = ?`).run(itemId);
    }

    const result = this.db.prepare(`
      INSERT INTO vendor_prices (
        item_id,
        vendor_id,
        vendor_item_name,
        vendor_item_code,
        vendor_pack_text,
        order_unit,
        order_unit_price,
        qty_per_unit,
        gtin,
        upc,
        sysco_supc,
        brand_name,
        manufacturer_name,
        source_catalog,
        is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      itemId,
      vendorId,
      effectiveVendorItemName,
      row.vendor_item_code ?? null,
      effectivePackText,
      effectiveOrderUnit,
      row.order_unit_price,
      row.qty_per_unit ?? null,
      row.gtin ?? null,
      row.upc ?? null,
      row.sysco_supc ?? null,
      row.brand_name ?? null,
      row.manufacturer_name ?? null,
      catalogCode,
      row.make_default_vendor_price === false ? 0 : 1,
    );

    return Number(result.lastInsertRowid);
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

  deleteManualImportProduct(productId: number): DeletedManualImportProductResult | undefined {
    const product = this.db.prepare(`
      SELECT
        p.id,
        p.product_name,
        c.code AS catalog_code
      FROM external_products p
      JOIN external_product_catalogs c ON c.id = p.catalog_id
      WHERE p.id = ?
      LIMIT 1
    `).get(productId) as DeletedManualImportProductResult | undefined;

    if (!product) {
      return undefined;
    }

    if (product.catalog_code !== 'manual_import') {
      throw new Error('Only manual_import products can be deleted');
    }

    this.db.prepare(`
      DELETE FROM external_products
      WHERE id = ?
    `).run(productId);

    return product;
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
    const importAuditRows = this.db.prepare(`
      SELECT *
      FROM item_allergen_import_audit
      WHERE item_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(itemId) as Array<{
      id: number;
      item_id: number;
      external_product_match_id: number | null;
      import_source: 'external_product' | 'uploaded_chart' | 'operator';
      import_mode: 'draft_claims' | 'direct_apply';
      summary_json: string;
      created_by: string | null;
      created_at: string;
    }>;
    const importAudits = importAuditRows.map((audit) => ({
      ...audit,
      summary: parseAuditSummary(audit.summary_json),
      match: audit.external_product_match_id ? this.getMatchById(audit.external_product_match_id) ?? null : null,
    }));

    return {
      item,
      vendor_prices: vendorPrices,
      matches,
      allergen_claims: allergenClaims,
      import_audits: importAudits,
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
        AND NOT EXISTS (
          SELECT 1
          FROM item_allergen_import_audit audit
          WHERE audit.external_product_match_id = m.id
        )
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

  importAllergenClaimsForMatch(
    itemId: number,
    matchId: number,
    input: {
      import_mode: 'draft_claims' | 'direct_apply';
      created_by?: string | null;
    },
  ): ProductEnrichmentAllergenImportResult {
    const match = this.getMatchById(matchId);
    if (!match || match.item_id !== itemId) {
      throw new Error('Match not found');
    }
    if (match.active !== 1) {
      throw new Error('Match is not active');
    }
    if (!['confirmed', 'auto_confirmed'].includes(match.match_status)) {
      throw new Error('Only confirmed product matches can be imported');
    }

    const claims = this.db.prepare(`
      SELECT *
      FROM external_product_allergen_claims
      WHERE external_product_id = ?
      ORDER BY allergen_id ASC
    `).all(match.external_product_id) as Array<{
      id: number;
      external_product_id: number;
      allergen_id: number;
      status: 'contains' | 'may_contain' | 'free_of' | 'unknown';
      confidence: 'verified' | 'high' | 'moderate' | 'low' | 'unverified' | 'unknown';
      source_excerpt: string | null;
    }>;

    if (claims.length === 0) {
      throw new Error('No external allergen claims were available for that product match');
    }

    const findItemAllergen = this.db.prepare(`
      SELECT *
      FROM item_allergens
      WHERE item_id = ? AND allergen_id = ?
      LIMIT 1
    `);
    const insertItemAllergen = this.db.prepare(`
      INSERT INTO item_allergens (
        item_id,
        allergen_id,
        status,
        confidence,
        notes,
        last_reviewed_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);
    const updateItemAllergen = this.db.prepare(`
      UPDATE item_allergens
      SET status = ?,
          confidence = ?,
          notes = COALESCE(notes, ?),
          last_reviewed_at = datetime('now')
      WHERE id = ?
    `);
    const insertEvidence = this.db.prepare(`
      INSERT INTO allergen_evidence (
        item_allergen_id,
        source_type,
        source_label,
        source_excerpt,
        status_claimed,
        confidence_claimed,
        captured_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAudit = this.db.prepare(`
      INSERT INTO item_allergen_import_audit (
        item_id,
        external_product_match_id,
        import_source,
        import_mode,
        summary_json,
        created_by
      ) VALUES (?, ?, 'external_product', ?, ?, ?)
    `);

    const result = this.db.transaction(() => {
      let importedRows = 0;
      let evidenceRows = 0;
      let skippedRows = 0;
      const importedAllergens: string[] = [];
      const skippedAllergens: string[] = [];

      for (const claim of claims) {
        const existing = findItemAllergen.get(itemId, claim.allergen_id) as {
          id: number;
          status: 'contains' | 'may_contain' | 'free_of' | 'unknown';
          confidence: 'verified' | 'high' | 'moderate' | 'low' | 'unverified' | 'unknown';
        } | undefined;

        const importedConfidence = normalizeImportedConfidence(claim.confidence, input.import_mode);
        const shouldApply = shouldApplyImportedClaim(existing, claim.status, importedConfidence, input.import_mode);

        let itemAllergenId: number;
        if (!existing) {
          const insertResult = insertItemAllergen.run(
            itemId,
            claim.allergen_id,
            claim.status,
            importedConfidence,
            buildImportedNote(match.external_product.catalog_name, match.external_product.product_name),
          );
          itemAllergenId = Number(insertResult.lastInsertRowid);
          importedRows += 1;
          importedAllergens.push(String(claim.allergen_id));
        } else {
          itemAllergenId = existing.id;
          if (shouldApply) {
            updateItemAllergen.run(
              claim.status,
              importedConfidence,
              buildImportedNote(match.external_product.catalog_name, match.external_product.product_name),
              existing.id,
            );
            importedRows += 1;
            importedAllergens.push(String(claim.allergen_id));
          } else {
            skippedRows += 1;
            skippedAllergens.push(String(claim.allergen_id));
          }
        }

        insertEvidence.run(
          itemAllergenId,
          resolveImportedEvidenceSourceType(match.external_product.catalog_code),
          `${match.external_product.catalog_name}: ${match.external_product.product_name}`,
          claim.source_excerpt ?? match.external_product.allergen_statement ?? match.external_product.ingredient_statement ?? null,
          claim.status,
          importedConfidence,
          input.created_by ?? null,
        );
        evidenceRows += 1;
      }

      const auditResult = insertAudit.run(
        itemId,
        matchId,
        input.import_mode,
        JSON.stringify({
          external_product_id: match.external_product_id,
          imported_rows: importedRows,
          evidence_rows: evidenceRows,
          skipped_rows: skippedRows,
          imported_allergen_ids: importedAllergens,
          skipped_allergen_ids: skippedAllergens,
        }),
        input.created_by ?? null,
      );

      return {
        item_id: itemId,
        external_product_match_id: matchId,
        imported_rows: importedRows,
        evidence_rows: evidenceRows,
        skipped_rows: skippedRows,
        audit_id: Number(auditResult.lastInsertRowid),
      };
    });

    return result();
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

function sanitizeManualImportRow(
  row: ManualExternalProductImportRow,
  defaults: ExternalProductImportDefaults = {},
): ManualExternalProductImportRow {
  return {
    external_key: normalizeNullableText(row.external_key),
    gtin: normalizeNullableText(row.gtin),
    upc: normalizeNullableText(row.upc),
    vendor_item_code: normalizeNullableText(row.vendor_item_code),
    vendor_item_name: normalizeNullableText(row.vendor_item_name),
    vendor_name: normalizeNullableText(row.vendor_name ?? defaults.default_vendor_name),
    vendor_pack_text: normalizeNullableText(row.vendor_pack_text),
    sysco_supc: normalizeNullableText(row.sysco_supc),
    brand_name: normalizeNullableText(row.brand_name),
    manufacturer_name: normalizeNullableText(row.manufacturer_name),
    product_name: row.product_name.trim(),
    pack_text: normalizeNullableText(row.pack_text),
    size_text: normalizeNullableText(row.size_text),
    inventory_item_name: normalizeNullableText(row.inventory_item_name),
    inventory_category: row.inventory_category ?? defaults.default_inventory_category ?? null,
    inventory_unit: row.inventory_unit ?? defaults.default_inventory_unit ?? null,
    order_unit: row.order_unit ?? defaults.default_order_unit ?? null,
    order_unit_price: row.order_unit_price ?? null,
    qty_per_unit: row.qty_per_unit ?? null,
    item_size_value: row.item_size_value ?? null,
    item_size_unit: row.item_size_unit ?? null,
    venue_id: row.venue_id ?? defaults.default_venue_id ?? null,
    venue_name: normalizeNullableText(row.venue_name),
    create_item_if_missing: row.create_item_if_missing ?? true,
    make_default_vendor_price: row.make_default_vendor_price ?? true,
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
    row.vendor_item_name,
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

function deriveImportedMatchBasis(row: ManualExternalProductImportRow): ExternalProductMatchBasis {
  if (row.sysco_supc) return 'sysco_supc';
  if (row.gtin) return 'gtin';
  if (row.upc) return 'upc';
  if (row.vendor_item_code) return 'vendor_item_code';
  return 'operator';
}

function inferInventoryCategory(row: ManualExternalProductImportRow): Category {
  const haystack = [
    row.inventory_category,
    row.brand_name,
    row.product_name,
    row.pack_text,
    row.vendor_item_name,
  ].filter(Boolean).join(' ').toLowerCase();

  if (/(vodka|gin|rum|tequila|whiskey|whisky|bourbon|liqueur|mezcal|cordial|amaro|cognac|brandy)/.test(haystack)) {
    return 'Spirits';
  }
  if (/(beer|ipa|lager|ale|stout|porter|pilsner|seltzer)/.test(haystack)) {
    return 'Beer';
  }
  if (/(wine|cabernet|pinot|sauvignon|chardonnay|merlot|prosecco|champagne|rose)/.test(haystack)) {
    return 'Wine';
  }
  if (/(mixer|tonic|soda|cola|ginger beer|ginger ale|juice|syrup|bitters|mix)/.test(haystack)) {
    return 'Mixers';
  }
  return 'Bar';
}

function inferInventoryUnit(row: ManualExternalProductImportRow): Unit {
  const haystack = [row.product_name, row.pack_text, row.size_text, row.vendor_item_name].filter(Boolean).join(' ').toLowerCase();
  if (/\bcan\b|\bcans\b/.test(haystack)) return 'can';
  if (/\bbottle\b|\bbtls?\b/.test(haystack)) return 'bottle';
  if (/\bcase\b|\bcs\b|\d+\s*\/\s*\d+/.test(haystack)) return 'bottle';
  return 'each';
}

function inferOrderUnit(row: ManualExternalProductImportRow): Unit | null {
  const haystack = [row.pack_text, row.vendor_pack_text, row.product_name].filter(Boolean).join(' ').toLowerCase();
  if (/\bcase\b|\bcs\b|\d+\s*\/\s*\d+/.test(haystack)) return 'case';
  if (/\bpack\b/.test(haystack)) return 'pack';
  if (/\bbox\b/.test(haystack)) return 'box';
  return null;
}

function inferItemSizeValue(row: ManualExternalProductImportRow): number | null {
  const parsed = parseSizeText(row.size_text ?? row.product_name);
  return parsed?.value ?? null;
}

function inferItemSizeUnit(row: ManualExternalProductImportRow): Unit | null {
  const parsed = parseSizeText(row.size_text ?? row.product_name);
  return parsed?.unit ?? null;
}

function parseSizeText(input: string | null | undefined): { value: number; unit: Unit } | null {
  const value = normalizeNullableText(input);
  if (!value) return null;
  const match = value.match(/(\d+(?:\.\d+)?)\s*(ml|l|fl\s?oz|oz)\b/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const rawUnit = match[2].toLowerCase().replace(/\s+/g, ' ');
  if (!Number.isFinite(amount)) return null;

  if (rawUnit === 'ml') return { value: amount, unit: 'ml' };
  if (rawUnit === 'l') return { value: amount, unit: 'L' };
  if (rawUnit === 'fl oz') return { value: amount, unit: 'fl oz' };
  return { value: amount, unit: 'oz' };
}

function normalizeAllergenKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveImportedEvidenceSourceType(catalogCode: string): 'manufacturer_spec' | 'vendor_declaration' {
  return catalogCode === 'sysco' ? 'vendor_declaration' : 'manufacturer_spec';
}

function normalizeImportedConfidence(
  confidence: 'verified' | 'high' | 'moderate' | 'low' | 'unverified' | 'unknown',
  importMode: 'draft_claims' | 'direct_apply',
): 'verified' | 'high' | 'moderate' | 'low' | 'unverified' | 'unknown' {
  if (importMode === 'direct_apply') {
    return confidence;
  }
  if (confidence === 'verified' || confidence === 'high') {
    return 'moderate';
  }
  return confidence;
}

function shouldApplyImportedClaim(
  existing: { status: string; confidence: string } | undefined,
  importedStatus: string,
  importedConfidence: string,
  importMode: 'draft_claims' | 'direct_apply',
): boolean {
  if (!existing) {
    return true;
  }

  if (existing.confidence === 'verified' && existing.status !== importedStatus) {
    return false;
  }

  if (existing.status === 'unknown') {
    return true;
  }

  if (existing.status === importedStatus && confidenceRank(importedConfidence) > confidenceRank(existing.confidence)) {
    return true;
  }

  if (importMode === 'direct_apply' && confidenceRank(importedConfidence) >= confidenceRank(existing.confidence)) {
    return true;
  }

  return confidenceRank(existing.confidence) <= confidenceRank('unverified');
}

function confidenceRank(confidence: string): number {
  switch (confidence) {
    case 'verified':
      return 5;
    case 'high':
      return 4;
    case 'moderate':
      return 3;
    case 'low':
      return 2;
    case 'unverified':
      return 1;
    default:
      return 0;
  }
}

function buildImportedNote(catalogName: string, productName: string): string {
  return `Imported from ${catalogName} product data for ${productName}`;
}

function parseAuditSummary(summaryJson: string): {
  external_product_id: number | null;
  imported_rows: number;
  evidence_rows: number;
  skipped_rows: number;
  imported_allergen_ids: string[];
  skipped_allergen_ids: string[];
} {
  try {
    const parsed = JSON.parse(summaryJson) as Record<string, unknown>;
    return {
      external_product_id: typeof parsed.external_product_id === 'number' ? parsed.external_product_id : null,
      imported_rows: typeof parsed.imported_rows === 'number' ? parsed.imported_rows : 0,
      evidence_rows: typeof parsed.evidence_rows === 'number' ? parsed.evidence_rows : 0,
      skipped_rows: typeof parsed.skipped_rows === 'number' ? parsed.skipped_rows : 0,
      imported_allergen_ids: Array.isArray(parsed.imported_allergen_ids) ? parsed.imported_allergen_ids.map(String) : [],
      skipped_allergen_ids: Array.isArray(parsed.skipped_allergen_ids) ? parsed.skipped_allergen_ids.map(String) : [],
    };
  } catch {
    return {
      external_product_id: null,
      imported_rows: 0,
      evidence_rows: 0,
      skipped_rows: 0,
      imported_allergen_ids: [],
      skipped_allergen_ids: [],
    };
  }
}
