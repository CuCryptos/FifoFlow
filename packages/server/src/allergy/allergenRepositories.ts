import type Database from 'better-sqlite3';
import { initializeAllergyAssistantDb } from './persistence/sqliteSchema.js';

export type AllergenStatus = 'contains' | 'may_contain' | 'free_of' | 'unknown';
export type AllergenConfidence = 'verified' | 'high' | 'moderate' | 'low' | 'unverified' | 'unknown';

export interface AllergenReference {
  id: number;
  code: string;
  name: string;
  category: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ItemAllergenProfileRow {
  allergen_id: number;
  allergen_code: string;
  allergen_name: string;
  category: string;
  status: AllergenStatus;
  confidence: AllergenConfidence;
  notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  last_reviewed_at: string | null;
}

export interface ItemListEntry {
  id: number;
  name: string;
  category: string;
  vendor_id: number | null;
  vendor_name: string | null;
  venue_id: number | null;
  venue_name: string | null;
  profile_count: number;
  contains_count: number;
  may_contain_count: number;
  free_of_count: number;
  unknown_count: number;
  low_confidence_count: number;
  needs_review: boolean;
}

export interface ItemEvidenceRecord {
  id: number;
  item_allergen_id: number;
  allergen_code: string;
  allergen_name: string;
  source_type: string;
  source_document_id: number | null;
  source_product_id: number | null;
  source_label: string | null;
  source_excerpt: string | null;
  status_claimed: AllergenStatus;
  confidence_claimed: AllergenConfidence | null;
  captured_by: string | null;
  captured_at: string;
  expires_at: string | null;
}

export interface LinkedDocumentProductRecord {
  product_id: number;
  document_id: number;
  filename: string;
  page_number: number;
  product_name: string;
  source_row_text: string;
  match_status: string;
  match_score: number | null;
  matched_by: string | null;
  notes: string | null;
}

export interface ItemProfileDetail {
  item: {
    id: number;
    name: string;
    category: string;
    vendor_id: number | null;
    vendor_name: string | null;
    venue_id: number | null;
    venue_name: string | null;
  };
  allergen_profile: ItemAllergenProfileRow[];
  evidence: ItemEvidenceRecord[];
  linked_document_products: LinkedDocumentProductRecord[];
}

export interface DocumentMatchRecord {
  id: number;
  item_id: number;
  item_name: string;
  match_status: string;
  match_score: number | null;
  matched_by: string;
  notes: string | null;
  active: boolean;
}

interface DocumentMatchRow {
  id: number;
  document_product_id: number;
  item_id: number;
  item_name: string;
  match_status: string;
  match_score: number | null;
  matched_by: string;
  notes: string | null;
  active: number;
}

export interface DocumentProductDetail {
  id: number;
  page_id: number | null;
  page_number: number;
  product_name: string;
  normalized_product_name: string;
  source_row_text: string;
  allergen_summary: string | null;
  dietary_notes: string | null;
  source_chunk_ids: number[];
  matches: DocumentMatchRecord[];
}

export interface DocumentDetail {
  document: {
    id: number;
    venue_id: number | null;
    filename: string;
    mime_type: string;
    page_count: number;
    chunk_count: number;
    product_count: number;
    status: string;
    created_at: string;
    updated_at: string;
  };
  pages: Array<{
    id: number;
    page_number: number;
    extracted_text: string;
  }>;
  chunks: Array<{
    id: number;
    page_id: number;
    page_number: number;
    chunk_index: number;
    chunk_text: string;
  }>;
  products: DocumentProductDetail[];
}

export interface AllergyDocumentSummaryRecord {
  id: number;
  venue_id: number | null;
  filename: string;
  mime_type: string;
  page_count: number;
  chunk_count: number;
  product_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface StructuredQueryProductRecord {
  product_id: number;
  document_id: number;
  venue_id: number | null;
  filename: string;
  page_number: number;
  product_name: string;
  source_row_text: string;
  allergen_summary: string | null;
  dietary_notes: string | null;
  source_chunk_ids: number[];
  chunk_texts: string[];
  matches: Array<{
    item_id: number;
    item_name: string;
    match_status: string;
    match_score: number | null;
  }>;
}

export interface ReviewQueueSnapshot {
  items: Array<{
    item_id: number;
    item_name: string;
    reason: string;
    flagged_profile_count: number;
  }>;
  document_products: Array<{
    product_id: number;
    document_id: number;
    filename: string;
    product_name: string;
    page_number: number;
    reason: string;
  }>;
  recipes: Array<{
    recipe_version_id: number;
    recipe_id: number;
    recipe_name: string;
    version_number: number;
    flagged_rollup_count: number;
  }>;
}

export interface RecipeIngredientSourceRecord {
  ingredient_id: number;
  recipe_version_id: number;
  line_index: number;
  raw_ingredient_text: string;
  canonical_ingredient_id: number;
  canonical_ingredient_name: string | null;
  inventory_item_id: number | null;
  resolved_item_id: number | null;
  resolved_item_name: string | null;
  quantity_normalized: number;
  unit_normalized: string;
  preparation_note: string | null;
  resolved_via: 'direct_item' | 'canonical_mapping' | 'unmapped';
}

export interface RecipeOverrideRecord {
  allergen_id: number;
  allergen_code: string;
  allergen_name: string;
  status: AllergenStatus;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export interface RecipeRollupRecord {
  allergen_id: number;
  allergen_code: string;
  allergen_name: string;
  category: string;
  worst_status: AllergenStatus;
  min_confidence: AllergenConfidence;
  source_item_ids: number[];
  source_paths: string[];
  needs_review: boolean;
  computed_at: string;
}

export interface RecipeSummaryRecord {
  recipe_version_id: number;
  recipe_id: number;
  recipe_name: string;
  recipe_type: string;
  version_number: number;
  status: string;
  yield_quantity: number | null;
  yield_unit: string | null;
  contains_count: number;
  may_contain_count: number;
  free_of_count: number;
  unknown_count: number;
  needs_review_count: number;
}

export interface RecipeDetailRecord {
  recipe: RecipeSummaryRecord;
  ingredients: RecipeIngredientSourceRecord[];
  overrides: RecipeOverrideRecord[];
  rollups: RecipeRollupRecord[];
}

export interface ItemProfileUpdateInput {
  allergen_code: string;
  status: AllergenStatus;
  confidence: AllergenConfidence;
  notes?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  last_reviewed_at?: string | null;
}

export interface ItemEvidenceInput {
  allergen_code: string;
  source_type: 'manufacturer_spec' | 'vendor_declaration' | 'staff_verified' | 'label_scan' | 'uploaded_chart' | 'inferred';
  status_claimed: AllergenStatus;
  confidence_claimed?: AllergenConfidence | null;
  source_document_id?: number | null;
  source_product_id?: number | null;
  source_label?: string | null;
  source_excerpt?: string | null;
  captured_by?: string | null;
  expires_at?: string | null;
}

export interface RecipeOverrideInput {
  allergen_code: string;
  status: AllergenStatus;
  reason: string;
  created_by?: string | null;
}

export interface ItemProfileFilters {
  search?: string;
  status?: AllergenStatus;
  confidence?: AllergenConfidence;
  vendor_id?: number;
  venue_id?: number;
  needs_review?: boolean;
}

export interface RecipeFilters {
  status?: string;
  needs_review?: boolean;
}

export class SQLiteAllergenRepository {
  constructor(private readonly db: Database.Database) {
    initializeAllergyAssistantDb(db);
  }

  listAllergensReference(): AllergenReference[] {
    return this.db.prepare(
      `
        SELECT id, code, name, category, icon, sort_order, is_active
        FROM allergens
        WHERE is_active = 1
        ORDER BY sort_order ASC, name COLLATE NOCASE ASC
      `,
    ).all().map((row: any) => ({
      ...row,
      is_active: Boolean(row.is_active),
    })) as AllergenReference[];
  }

  listItemProfiles(filters: ItemProfileFilters): ItemListEntry[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (filters.search) {
      conditions.push('i.name LIKE ?');
      params.push(`%${filters.search}%`);
    }
    if (filters.vendor_id != null) {
      conditions.push('i.vendor_id = ?');
      params.push(filters.vendor_id);
    }
    if (filters.venue_id != null) {
      conditions.push('i.venue_id = ?');
      params.push(filters.venue_id);
    }
    if (filters.status) {
      conditions.push('EXISTS (SELECT 1 FROM item_allergens iaf WHERE iaf.item_id = i.id AND iaf.status = ?)');
      params.push(filters.status);
    }
    if (filters.confidence) {
      conditions.push('EXISTS (SELECT 1 FROM item_allergens iac WHERE iac.item_id = i.id AND iac.confidence = ?)');
      params.push(filters.confidence);
    }
    if (filters.needs_review === true) {
      conditions.push(`
        (
          NOT EXISTS (SELECT 1 FROM item_allergens iar0 WHERE iar0.item_id = i.id)
          OR EXISTS (
            SELECT 1
            FROM item_allergens iar1
            WHERE iar1.item_id = i.id
              AND (iar1.status = 'unknown' OR iar1.confidence IN ('low', 'unverified', 'unknown'))
          )
          OR (
            EXISTS (
              SELECT 1
              FROM allergy_document_product_matches adm
              WHERE adm.item_id = i.id
                AND adm.active = 1
                AND adm.match_status IN ('suggested', 'confirmed')
            )
            AND NOT EXISTS (SELECT 1 FROM item_allergens iar2 WHERE iar2.item_id = i.id)
          )
        )
      `);
    }
    if (filters.needs_review === false) {
      conditions.push(`
        EXISTS (SELECT 1 FROM item_allergens iar3 WHERE iar3.item_id = i.id)
        AND NOT EXISTS (
          SELECT 1
          FROM item_allergens iar4
          WHERE iar4.item_id = i.id
            AND (iar4.status = 'unknown' OR iar4.confidence IN ('low', 'unverified', 'unknown'))
        )
      `);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.db.prepare(
      `
        SELECT
          i.id,
          i.name,
          i.category,
          i.vendor_id,
          v.name AS vendor_name,
          i.venue_id,
          ven.name AS venue_name,
          COUNT(ia.id) AS profile_count,
          SUM(CASE WHEN ia.status = 'contains' THEN 1 ELSE 0 END) AS contains_count,
          SUM(CASE WHEN ia.status = 'may_contain' THEN 1 ELSE 0 END) AS may_contain_count,
          SUM(CASE WHEN ia.status = 'free_of' THEN 1 ELSE 0 END) AS free_of_count,
          SUM(CASE WHEN ia.status = 'unknown' OR ia.id IS NULL THEN 1 ELSE 0 END) AS unknown_count,
          SUM(CASE WHEN ia.confidence IN ('low', 'unverified', 'unknown') THEN 1 ELSE 0 END) AS low_confidence_count
        FROM items i
        LEFT JOIN vendors v ON v.id = i.vendor_id
        LEFT JOIN venues ven ON ven.id = i.venue_id
        LEFT JOIN item_allergens ia ON ia.item_id = i.id
        ${whereClause}
        GROUP BY i.id, i.name, i.category, i.vendor_id, v.name, i.venue_id, ven.name
        ORDER BY i.name COLLATE NOCASE ASC, i.id ASC
      `,
    ).all(...params).map((row: any) => ({
      ...row,
      profile_count: Number(row.profile_count ?? 0),
      contains_count: Number(row.contains_count ?? 0),
      may_contain_count: Number(row.may_contain_count ?? 0),
      free_of_count: Number(row.free_of_count ?? 0),
      unknown_count: Number(row.unknown_count ?? 0),
      low_confidence_count: Number(row.low_confidence_count ?? 0),
      needs_review:
        Number(row.profile_count ?? 0) === 0
        || Number(row.unknown_count ?? 0) > 0
        || Number(row.low_confidence_count ?? 0) > 0,
    })) as ItemListEntry[];
  }

  getItemProfile(itemId: number): ItemProfileDetail | null {
    const item = this.db.prepare(
      `
        SELECT
          i.id,
          i.name,
          i.category,
          i.vendor_id,
          v.name AS vendor_name,
          i.venue_id,
          ven.name AS venue_name
        FROM items i
        LEFT JOIN vendors v ON v.id = i.vendor_id
        LEFT JOIN venues ven ON ven.id = i.venue_id
        WHERE i.id = ?
        LIMIT 1
      `,
    ).get(itemId) as ItemProfileDetail['item'] | undefined;

    if (!item) {
      return null;
    }

    const allergenProfile = this.db.prepare(
      `
        SELECT
          a.id AS allergen_id,
          a.code AS allergen_code,
          a.name AS allergen_name,
          a.category,
          COALESCE(ia.status, 'unknown') AS status,
          COALESCE(ia.confidence, 'unknown') AS confidence,
          ia.notes,
          ia.verified_by,
          ia.verified_at,
          ia.last_reviewed_at
        FROM allergens a
        LEFT JOIN item_allergens ia
          ON ia.allergen_id = a.id
         AND ia.item_id = ?
        WHERE a.is_active = 1
        ORDER BY a.sort_order ASC, a.name COLLATE NOCASE ASC
      `,
    ).all(itemId) as ItemAllergenProfileRow[];

    const evidence = this.db.prepare(
      `
        SELECT
          ae.id,
          ae.item_allergen_id,
          a.code AS allergen_code,
          a.name AS allergen_name,
          ae.source_type,
          ae.source_document_id,
          ae.source_product_id,
          ae.source_label,
          ae.source_excerpt,
          ae.status_claimed,
          ae.confidence_claimed,
          ae.captured_by,
          ae.captured_at,
          ae.expires_at
        FROM allergen_evidence ae
        INNER JOIN item_allergens ia ON ia.id = ae.item_allergen_id
        INNER JOIN allergens a ON a.id = ia.allergen_id
        WHERE ia.item_id = ?
        ORDER BY ae.captured_at DESC, ae.id DESC
      `,
    ).all(itemId) as ItemEvidenceRecord[];

    const linkedDocumentProducts = this.db.prepare(
      `
        SELECT
          p.id AS product_id,
          p.document_id,
          d.filename,
          p.page_number,
          p.product_name,
          p.source_row_text,
          m.match_status,
          m.match_score,
          m.matched_by,
          m.notes
        FROM allergy_document_product_matches m
        INNER JOIN allergy_document_products p ON p.id = m.document_product_id
        INNER JOIN allergy_documents d ON d.id = p.document_id
        WHERE m.item_id = ?
          AND m.active = 1
        ORDER BY d.created_at DESC, p.page_number ASC, p.id ASC, m.id ASC
      `,
    ).all(itemId) as LinkedDocumentProductRecord[];

    return {
      item,
      allergen_profile: allergenProfile,
      evidence,
      linked_document_products: linkedDocumentProducts,
    };
  }

  upsertItemProfile(itemId: number, profiles: ItemProfileUpdateInput[]): ItemProfileDetail | null {
    const allergenIdsByCode = new Map(this.listAllergensReference().map((row) => [row.code, row.id]));
    const insert = this.db.prepare(
      `
        INSERT INTO item_allergens (
          item_id,
          allergen_id,
          status,
          confidence,
          notes,
          verified_by,
          verified_at,
          last_reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(item_id, allergen_id) DO UPDATE SET
          status = excluded.status,
          confidence = excluded.confidence,
          notes = excluded.notes,
          verified_by = excluded.verified_by,
          verified_at = excluded.verified_at,
          last_reviewed_at = excluded.last_reviewed_at
      `,
    );

    const transaction = this.db.transaction(() => {
      for (const profile of profiles) {
        const allergenId = allergenIdsByCode.get(profile.allergen_code);
        if (!allergenId) {
          throw new Error(`Unknown allergen code: ${profile.allergen_code}`);
        }
        insert.run(
          itemId,
          allergenId,
          profile.status,
          profile.confidence,
          profile.notes ?? null,
          profile.verified_by ?? null,
          profile.verified_at ?? null,
          profile.last_reviewed_at ?? null,
        );
      }
    });
    transaction();

    return this.getItemProfile(itemId);
  }

  addEvidence(itemId: number, input: ItemEvidenceInput): ItemProfileDetail | null {
    const allergen = this.db.prepare(
      'SELECT id FROM allergens WHERE code = ? LIMIT 1',
    ).get(input.allergen_code) as { id: number } | undefined;

    if (!allergen) {
      throw new Error(`Unknown allergen code: ${input.allergen_code}`);
    }

    const itemExists = this.db.prepare('SELECT id FROM items WHERE id = ? LIMIT 1').get(itemId) as { id: number } | undefined;
    if (!itemExists) {
      return null;
    }

    const upsertItemAllergen = this.db.prepare(
      `
        INSERT INTO item_allergens (item_id, allergen_id, status, confidence, last_reviewed_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(item_id, allergen_id) DO UPDATE SET
          status = excluded.status,
          confidence = excluded.confidence,
          last_reviewed_at = excluded.last_reviewed_at
      `,
    );
    const findItemAllergen = this.db.prepare(
      'SELECT id FROM item_allergens WHERE item_id = ? AND allergen_id = ? LIMIT 1',
    );
    const insertEvidence = this.db.prepare(
      `
        INSERT INTO allergen_evidence (
          item_allergen_id,
          source_type,
          source_document_id,
          source_product_id,
          source_label,
          source_excerpt,
          status_claimed,
          confidence_claimed,
          captured_by,
          expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    const transaction = this.db.transaction(() => {
      upsertItemAllergen.run(
        itemId,
        allergen.id,
        input.status_claimed,
        input.confidence_claimed ?? 'unknown',
      );
      const itemAllergen = findItemAllergen.get(itemId, allergen.id) as { id: number } | undefined;
      if (!itemAllergen) {
        throw new Error('Failed to locate item allergen profile after upsert');
      }
      insertEvidence.run(
        itemAllergen.id,
        input.source_type,
        input.source_document_id ?? null,
        input.source_product_id ?? null,
        input.source_label ?? null,
        input.source_excerpt ?? null,
        input.status_claimed,
        input.confidence_claimed ?? null,
        input.captured_by ?? null,
        input.expires_at ?? null,
      );
    });
    transaction();

    return this.getItemProfile(itemId);
  }

  getDocumentDetail(documentId: number): DocumentDetail | null {
    const document = this.db.prepare(
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
    ).get(documentId) as DocumentDetail['document'] | undefined;

    if (!document) {
      return null;
    }

    const pages = this.db.prepare(
      `
        SELECT id, page_number, extracted_text
        FROM allergy_document_pages
        WHERE document_id = ?
        ORDER BY page_number ASC, id ASC
      `,
    ).all(documentId) as DocumentDetail['pages'];

    const chunks = this.db.prepare(
      `
        SELECT id, page_id, page_number, chunk_index, chunk_text
        FROM allergy_document_chunks
        WHERE document_id = ?
        ORDER BY page_number ASC, chunk_index ASC, id ASC
      `,
    ).all(documentId) as DocumentDetail['chunks'];

    const products = this.db.prepare(
      `
        SELECT
          id,
          page_id,
          page_number,
          product_name,
          normalized_product_name,
          source_row_text,
          allergen_summary,
          dietary_notes,
          source_chunk_ids
        FROM allergy_document_products
        WHERE document_id = ?
        ORDER BY page_number ASC, id ASC
      `,
    ).all(documentId).map((row: any) => ({
      ...row,
      source_chunk_ids: parseNumberList(row.source_chunk_ids),
    })) as DocumentProductDetail[];

    const matchesByProductId = new Map<number, DocumentMatchRecord[]>();
    const matchRows = this.db.prepare(
      `
        SELECT
          m.id,
          m.document_product_id,
          m.item_id,
          i.name AS item_name,
          m.match_status,
          m.match_score,
          m.matched_by,
          m.notes,
          m.active
        FROM allergy_document_product_matches m
        INNER JOIN items i ON i.id = m.item_id
        INNER JOIN allergy_document_products p ON p.id = m.document_product_id
        WHERE p.document_id = ?
        ORDER BY p.page_number ASC, p.id ASC, m.active DESC, m.match_score DESC, m.id ASC
      `,
    ).all(documentId) as DocumentMatchRow[];

    for (const row of matchRows) {
      const bucket = matchesByProductId.get(row.document_product_id) ?? [];
      bucket.push({
        id: row.id,
        item_id: row.item_id,
        item_name: row.item_name,
        match_status: row.match_status,
        match_score: row.match_score,
        matched_by: row.matched_by,
        notes: row.notes,
        active: Boolean(row.active),
      });
      matchesByProductId.set(row.document_product_id, bucket);
    }

    return {
      document,
      pages,
      chunks,
      products: products.map((product) => ({
        ...product,
        matches: matchesByProductId.get(product.id) ?? [],
      })),
    };
  }

  listDocumentSummaries(venueId?: number | null): AllergyDocumentSummaryRecord[] {
    return this.db.prepare(
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
    ).all(venueId ?? null, venueId ?? null) as AllergyDocumentSummaryRecord[];
  }

  listStructuredQueryProducts(venueId?: number | null): StructuredQueryProductRecord[] {
    const productRows = this.db.prepare(
      `
        SELECT
          p.id AS product_id,
          p.document_id,
          d.venue_id,
          d.filename,
          p.page_number,
          p.product_name,
          p.source_row_text,
          p.allergen_summary,
          p.dietary_notes,
          p.source_chunk_ids
        FROM allergy_document_products p
        INNER JOIN allergy_documents d ON d.id = p.document_id
        WHERE (? IS NULL OR d.venue_id = ? OR d.venue_id IS NULL)
        ORDER BY d.created_at DESC, p.page_number ASC, p.id ASC
      `,
    ).all(venueId ?? null, venueId ?? null).map((row: any) => ({
      ...row,
      source_chunk_ids: parseNumberList(row.source_chunk_ids),
    })) as Array<Omit<StructuredQueryProductRecord, 'chunk_texts' | 'matches'>>;

    const productIds = productRows.map((row) => row.product_id);
    const chunkIds = Array.from(new Set(productRows.flatMap((row) => row.source_chunk_ids)));
    const matchesByProductId = new Map<number, StructuredQueryProductRecord['matches']>();
    const chunkTextById = new Map<number, string>();

    if (productIds.length > 0) {
      const productPlaceholders = productIds.map(() => '?').join(', ');
      const matchRows = this.db.prepare(
        `
          SELECT
            m.document_product_id,
            m.item_id,
            i.name AS item_name,
            m.match_status,
            m.match_score
          FROM allergy_document_product_matches m
          INNER JOIN items i ON i.id = m.item_id
          WHERE m.active = 1
            AND m.document_product_id IN (${productPlaceholders})
          ORDER BY
            CASE m.match_status
              WHEN 'confirmed' THEN 1
              WHEN 'suggested' THEN 2
              WHEN 'rejected' THEN 3
              ELSE 4
            END,
            m.match_score DESC,
            m.id ASC
        `,
      ).all(...productIds) as Array<{
        document_product_id: number;
        item_id: number;
        item_name: string;
        match_status: string;
        match_score: number | null;
      }>;

      for (const row of matchRows) {
        const bucket = matchesByProductId.get(row.document_product_id) ?? [];
        bucket.push({
          item_id: row.item_id,
          item_name: row.item_name,
          match_status: row.match_status,
          match_score: row.match_score,
        });
        matchesByProductId.set(row.document_product_id, bucket);
      }
    }

    if (chunkIds.length > 0) {
      const chunkPlaceholders = chunkIds.map(() => '?').join(', ');
      const chunkRows = this.db.prepare(
        `
          SELECT id, chunk_text
          FROM allergy_document_chunks
          WHERE id IN (${chunkPlaceholders})
        `,
      ).all(...chunkIds) as Array<{ id: number; chunk_text: string }>;
      for (const row of chunkRows) {
        chunkTextById.set(row.id, row.chunk_text);
      }
    }

    return productRows.map((row) => ({
      ...row,
      chunk_texts: row.source_chunk_ids.map((chunkId) => chunkTextById.get(chunkId)).filter((value): value is string => Boolean(value)),
      matches: matchesByProductId.get(row.product_id) ?? [],
    }));
  }

  getReviewQueue(): ReviewQueueSnapshot {
    const items = this.db.prepare(
      `
        SELECT
          i.id AS item_id,
          i.name AS item_name,
          CASE
            WHEN NOT EXISTS (SELECT 1 FROM item_allergens ia0 WHERE ia0.item_id = i.id)
              THEN 'Matched document products need a structured allergen profile'
            ELSE 'One or more allergen rows are unknown or low confidence'
          END AS reason,
          SUM(CASE WHEN ia.status = 'unknown' OR ia.confidence IN ('low', 'unverified', 'unknown') THEN 1 ELSE 0 END) AS flagged_profile_count
        FROM items i
        LEFT JOIN item_allergens ia ON ia.item_id = i.id
        WHERE
          EXISTS (
            SELECT 1
            FROM allergy_document_product_matches adm
            WHERE adm.item_id = i.id
              AND adm.active = 1
              AND adm.match_status IN ('suggested', 'confirmed')
          )
          OR EXISTS (
            SELECT 1
            FROM item_allergens iaf
            WHERE iaf.item_id = i.id
              AND (iaf.status = 'unknown' OR iaf.confidence IN ('low', 'unverified', 'unknown'))
          )
        GROUP BY i.id, i.name
        ORDER BY flagged_profile_count DESC, i.name COLLATE NOCASE ASC
        LIMIT 50
      `,
    ).all() as ReviewQueueSnapshot['items'];

    const documentProducts = this.db.prepare(
      `
        SELECT
          p.id AS product_id,
          p.document_id,
          d.filename,
          p.product_name,
          p.page_number,
          CASE
            WHEN NOT EXISTS (
              SELECT 1
              FROM allergy_document_product_matches m0
              WHERE m0.document_product_id = p.id
                AND m0.active = 1
            ) THEN 'No match candidates yet'
            WHEN EXISTS (
              SELECT 1
              FROM allergy_document_product_matches m1
              WHERE m1.document_product_id = p.id
                AND m1.active = 1
                AND m1.match_status = 'no_match'
            ) THEN 'Only weak no-match candidates are available'
            ELSE 'Needs operator review'
          END AS reason
        FROM allergy_document_products p
        INNER JOIN allergy_documents d ON d.id = p.document_id
        WHERE NOT EXISTS (
          SELECT 1
          FROM allergy_document_product_matches m
          WHERE m.document_product_id = p.id
            AND m.active = 1
            AND m.match_status IN ('suggested', 'confirmed')
        )
        ORDER BY d.created_at DESC, p.page_number ASC, p.id ASC
        LIMIT 50
      `,
    ).all() as ReviewQueueSnapshot['document_products'];

    const recipes = this.db.prepare(
      `
        SELECT
          rv.id AS recipe_version_id,
          r.id AS recipe_id,
          r.name AS recipe_name,
          rv.version_number,
          SUM(CASE WHEN rar.needs_review = 1 THEN 1 ELSE 0 END) AS flagged_rollup_count
        FROM recipe_versions rv
        INNER JOIN recipes r ON r.id = rv.recipe_id
        LEFT JOIN recipe_allergen_rollups rar ON rar.recipe_version_id = rv.id
        WHERE r.type = 'dish'
          AND rv.status = 'active'
        GROUP BY rv.id, r.id, r.name, rv.version_number
        HAVING flagged_rollup_count > 0 OR COUNT(rar.id) = 0
        ORDER BY flagged_rollup_count DESC, r.name COLLATE NOCASE ASC
        LIMIT 50
      `,
    ).all().map((row: any) => ({
      ...row,
      flagged_rollup_count: Number(row.flagged_rollup_count ?? 0),
    })) as ReviewQueueSnapshot['recipes'];

    return {
      items,
      document_products: documentProducts,
      recipes,
    };
  }

  listRecipeSummaries(filters: RecipeFilters): RecipeSummaryRecord[] {
    const conditions = ["r.type = 'dish'"];
    const params: Array<string | number> = [];
    if (filters.status) {
      conditions.push('rv.status = ?');
      params.push(filters.status);
    } else {
      conditions.push("rv.status = 'active'");
    }
    if (filters.needs_review === true) {
      conditions.push('EXISTS (SELECT 1 FROM recipe_allergen_rollups rr WHERE rr.recipe_version_id = rv.id AND rr.needs_review = 1)');
    }
    if (filters.needs_review === false) {
      conditions.push('NOT EXISTS (SELECT 1 FROM recipe_allergen_rollups rr WHERE rr.recipe_version_id = rv.id AND rr.needs_review = 1)');
    }

    return this.db.prepare(
      `
        SELECT
          rv.id AS recipe_version_id,
          r.id AS recipe_id,
          r.name AS recipe_name,
          r.type AS recipe_type,
          rv.version_number,
          rv.status,
          rv.yield_quantity,
          rv.yield_unit,
          SUM(CASE WHEN rr.worst_status = 'contains' THEN 1 ELSE 0 END) AS contains_count,
          SUM(CASE WHEN rr.worst_status = 'may_contain' THEN 1 ELSE 0 END) AS may_contain_count,
          SUM(CASE WHEN rr.worst_status = 'free_of' THEN 1 ELSE 0 END) AS free_of_count,
          SUM(CASE WHEN rr.worst_status = 'unknown' OR rr.id IS NULL THEN 1 ELSE 0 END) AS unknown_count,
          SUM(CASE WHEN rr.needs_review = 1 THEN 1 ELSE 0 END) AS needs_review_count
        FROM recipe_versions rv
        INNER JOIN recipes r ON r.id = rv.recipe_id
        LEFT JOIN recipe_allergen_rollups rr ON rr.recipe_version_id = rv.id
        WHERE ${conditions.join(' AND ')}
        GROUP BY rv.id, r.id, r.name, r.type, rv.version_number, rv.status, rv.yield_quantity, rv.yield_unit
        ORDER BY r.name COLLATE NOCASE ASC, rv.version_number DESC
      `,
    ).all(...params).map((row: any) => normalizeRecipeSummaryRow(row)) as RecipeSummaryRecord[];
  }

  getRecipeDetail(recipeVersionId: number): RecipeDetailRecord | null {
    const recipe = this.db.prepare(
      `
        SELECT
          rv.id AS recipe_version_id,
          r.id AS recipe_id,
          r.name AS recipe_name,
          r.type AS recipe_type,
          rv.version_number,
          rv.status,
          rv.yield_quantity,
          rv.yield_unit,
          SUM(CASE WHEN rr.worst_status = 'contains' THEN 1 ELSE 0 END) AS contains_count,
          SUM(CASE WHEN rr.worst_status = 'may_contain' THEN 1 ELSE 0 END) AS may_contain_count,
          SUM(CASE WHEN rr.worst_status = 'free_of' THEN 1 ELSE 0 END) AS free_of_count,
          SUM(CASE WHEN rr.worst_status = 'unknown' OR rr.id IS NULL THEN 1 ELSE 0 END) AS unknown_count,
          SUM(CASE WHEN rr.needs_review = 1 THEN 1 ELSE 0 END) AS needs_review_count
        FROM recipe_versions rv
        INNER JOIN recipes r ON r.id = rv.recipe_id
        LEFT JOIN recipe_allergen_rollups rr ON rr.recipe_version_id = rv.id
        WHERE rv.id = ?
        GROUP BY rv.id, r.id, r.name, r.type, rv.version_number, rv.status, rv.yield_quantity, rv.yield_unit
        LIMIT 1
      `,
    ).get(recipeVersionId) as Record<string, unknown> | undefined;

    if (!recipe) {
      return null;
    }

    return {
      recipe: normalizeRecipeSummaryRow(recipe),
      ingredients: this.getRecipeIngredientSources(recipeVersionId),
      overrides: this.getRecipeOverrides(recipeVersionId),
      rollups: this.listRecipeRollups(recipeVersionId),
    };
  }

  getRecipeIngredientSources(recipeVersionId: number): RecipeIngredientSourceRecord[] {
    return this.db.prepare(
      `
        SELECT
          ri.id AS ingredient_id,
          ri.recipe_version_id,
          ri.line_index,
          ri.raw_ingredient_text,
          ri.canonical_ingredient_id,
          ci.canonical_name AS canonical_ingredient_name,
          ri.inventory_item_id,
          COALESCE(ri.inventory_item_id, cim.inventory_item_id) AS resolved_item_id,
          COALESCE(direct_item.name, mapped_item.name) AS resolved_item_name,
          ri.quantity_normalized,
          ri.unit_normalized,
          ri.preparation_note,
          CASE
            WHEN ri.inventory_item_id IS NOT NULL THEN 'direct_item'
            WHEN cim.inventory_item_id IS NOT NULL THEN 'canonical_mapping'
            ELSE 'unmapped'
          END AS resolved_via
        FROM recipe_ingredients ri
        LEFT JOIN canonical_ingredients ci ON ci.id = ri.canonical_ingredient_id
        LEFT JOIN canonical_inventory_mappings cim ON cim.id = (
          SELECT m.id
          FROM canonical_inventory_mappings m
          WHERE m.canonical_ingredient_id = ri.canonical_ingredient_id
            AND m.active = 1
            AND m.preferred_flag = 1
            AND m.inventory_item_id IS NOT NULL
          ORDER BY
            CASE m.scope_type
              WHEN 'operation_unit' THEN 1
              WHEN 'location' THEN 2
              ELSE 3
            END,
            m.id ASC
          LIMIT 1
        )
        LEFT JOIN items direct_item ON direct_item.id = ri.inventory_item_id
        LEFT JOIN items mapped_item ON mapped_item.id = cim.inventory_item_id
        WHERE ri.recipe_version_id = ?
        ORDER BY ri.line_index ASC, ri.id ASC
      `,
    ).all(recipeVersionId) as RecipeIngredientSourceRecord[];
  }

  getRecipeOverrides(recipeVersionId: number): RecipeOverrideRecord[] {
    return this.db.prepare(
      `
        SELECT
          rao.allergen_id,
          a.code AS allergen_code,
          a.name AS allergen_name,
          rao.status,
          rao.reason,
          rao.created_by,
          rao.created_at
        FROM recipe_allergen_overrides rao
        INNER JOIN allergens a ON a.id = rao.allergen_id
        WHERE rao.recipe_version_id = ?
        ORDER BY a.sort_order ASC, a.name COLLATE NOCASE ASC
      `,
    ).all(recipeVersionId) as RecipeOverrideRecord[];
  }

  replaceRecipeOverrides(recipeVersionId: number, overrides: RecipeOverrideInput[]): RecipeDetailRecord | null {
    const allergenIdsByCode = new Map(this.listAllergensReference().map((row) => [row.code, row.id]));
    const deleteStatement = this.db.prepare('DELETE FROM recipe_allergen_overrides WHERE recipe_version_id = ?');
    const insertStatement = this.db.prepare(
      `
        INSERT INTO recipe_allergen_overrides (
          recipe_version_id,
          allergen_id,
          status,
          reason,
          created_by
        ) VALUES (?, ?, ?, ?, ?)
      `,
    );

    const transaction = this.db.transaction(() => {
      deleteStatement.run(recipeVersionId);
      for (const override of overrides) {
        const allergenId = allergenIdsByCode.get(override.allergen_code);
        if (!allergenId) {
          throw new Error(`Unknown allergen code: ${override.allergen_code}`);
        }
        insertStatement.run(
          recipeVersionId,
          allergenId,
          override.status,
          override.reason,
          override.created_by ?? null,
        );
      }
    });
    transaction();

    return this.getRecipeDetail(recipeVersionId);
  }

  deleteRecipeRollups(recipeVersionId: number): void {
    this.db.prepare('DELETE FROM recipe_allergen_rollups WHERE recipe_version_id = ?').run(recipeVersionId);
  }

  upsertRecipeRollups(recipeVersionId: number, rows: Array<{
    allergen_id: number;
    worst_status: AllergenStatus;
    min_confidence: AllergenConfidence;
    source_item_ids: number[];
    source_paths: string[];
    needs_review: boolean;
  }>): void {
    const insert = this.db.prepare(
      `
        INSERT INTO recipe_allergen_rollups (
          recipe_version_id,
          allergen_id,
          worst_status,
          min_confidence,
          source_item_ids,
          source_paths,
          needs_review
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(recipe_version_id, allergen_id) DO UPDATE SET
          worst_status = excluded.worst_status,
          min_confidence = excluded.min_confidence,
          source_item_ids = excluded.source_item_ids,
          source_paths = excluded.source_paths,
          needs_review = excluded.needs_review,
          computed_at = datetime('now')
      `,
    );

    const transaction = this.db.transaction(() => {
      this.deleteRecipeRollups(recipeVersionId);
      for (const row of rows) {
        insert.run(
          recipeVersionId,
          row.allergen_id,
          row.worst_status,
          row.min_confidence,
          JSON.stringify(row.source_item_ids),
          JSON.stringify(row.source_paths),
          row.needs_review ? 1 : 0,
        );
      }
    });
    transaction();
  }

  listRecipeRollups(recipeVersionId: number): RecipeRollupRecord[] {
    return this.db.prepare(
      `
        SELECT
          rr.allergen_id,
          a.code AS allergen_code,
          a.name AS allergen_name,
          a.category,
          rr.worst_status,
          rr.min_confidence,
          rr.source_item_ids,
          rr.source_paths,
          rr.needs_review,
          rr.computed_at
        FROM recipe_allergen_rollups rr
        INNER JOIN allergens a ON a.id = rr.allergen_id
        WHERE rr.recipe_version_id = ?
        ORDER BY a.sort_order ASC, a.name COLLATE NOCASE ASC
      `,
    ).all(recipeVersionId).map((row: any) => ({
      ...row,
      source_item_ids: parseNumberList(row.source_item_ids),
      source_paths: parseStringList(row.source_paths),
      needs_review: Boolean(row.needs_review),
    })) as RecipeRollupRecord[];
  }

  listActiveDishRecipeVersionIds(): number[] {
    return this.db.prepare(
      `
        SELECT rv.id
        FROM recipe_versions rv
        INNER JOIN recipes r ON r.id = rv.recipe_id
        WHERE r.type = 'dish'
          AND rv.status = 'active'
        ORDER BY rv.id ASC
      `,
    ).all().map((row: any) => Number(row.id));
  }

  getItemAllergenRowsForItems(itemIds: number[]): Array<{
    item_id: number;
    allergen_id: number;
    status: AllergenStatus;
    confidence: AllergenConfidence;
    notes: string | null;
  }> {
    if (itemIds.length === 0) {
      return [];
    }
    const placeholders = itemIds.map(() => '?').join(', ');
    return this.db.prepare(
      `
        SELECT item_id, allergen_id, status, confidence, notes
        FROM item_allergens
        WHERE item_id IN (${placeholders})
      `,
    ).all(...itemIds) as Array<{
      item_id: number;
      allergen_id: number;
      status: AllergenStatus;
      confidence: AllergenConfidence;
      notes: string | null;
    }>;
  }

  recordQueryAudit(input: {
    venue_id?: number | null;
    query_text: string;
    allergen_codes: string[];
    response_summary: string;
    created_by?: string | null;
  }): void {
    this.db.prepare(
      `
        INSERT INTO allergen_query_audit (
          venue_id,
          query_text,
          allergen_codes,
          response_summary,
          created_by
        ) VALUES (?, ?, ?, ?, ?)
      `,
    ).run(
      input.venue_id ?? null,
      input.query_text,
      JSON.stringify(input.allergen_codes),
      input.response_summary,
      input.created_by ?? null,
    );
  }
}

function normalizeRecipeSummaryRow(row: Record<string, unknown>): RecipeSummaryRecord {
  return {
    recipe_version_id: Number(row.recipe_version_id),
    recipe_id: Number(row.recipe_id),
    recipe_name: String(row.recipe_name ?? ''),
    recipe_type: String(row.recipe_type ?? ''),
    version_number: Number(row.version_number ?? 0),
    status: String(row.status ?? ''),
    yield_quantity: row.yield_quantity == null ? null : Number(row.yield_quantity),
    yield_unit: row.yield_unit == null ? null : String(row.yield_unit),
    contains_count: Number(row.contains_count ?? 0),
    may_contain_count: Number(row.may_contain_count ?? 0),
    free_of_count: Number(row.free_of_count ?? 0),
    unknown_count: Number(row.unknown_count ?? 0),
    needs_review_count: Number(row.needs_review_count ?? 0),
  };
}

function parseNumberList(input: string): number[] {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  } catch {
    return [];
  }
}

function parseStringList(input: string): string[] {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((value) => String(value)).filter((value) => value.length > 0);
  } catch {
    return [];
  }
}
