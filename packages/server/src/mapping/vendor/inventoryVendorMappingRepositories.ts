import Database from 'better-sqlite3';
import { normalizeIngredientLookup } from '../ingredients/canonicalIngredientResolver.js';
import { initializeInventoryVendorMappingDb } from './persistence/sqliteSchema.js';
import type {
  InventoryVendorMapping,
  InventoryVendorMappingCandidate,
  InventoryVendorMappingReviewEvent,
  InventoryVendorMappingScopeType,
  InventoryVendorRepository,
  VendorCostLineageRecord,
  VendorItemRecord,
} from './types.js';
import type { InventoryItemRecord } from '../inventory/types.js';
import type { SubjectScopeContext } from '../../platform/policy/types.js';

export class SQLiteInventoryVendorRepository implements InventoryVendorRepository {
  constructor(private readonly db: Database.Database) {
    initializeInventoryVendorMappingDb(db);
  }

  async withTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const result = await work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async listInventoryItems(ids?: Array<number | string>): Promise<InventoryItemRecord[]> {
    const rows = (ids && ids.length > 0
      ? this.db.prepare(
          `
            SELECT id, name, category, unit, venue_id
            FROM items
            WHERE id IN (${ids.map(() => '?').join(',')})
            ORDER BY name ASC, id ASC
          `,
        ).all(...ids)
      : this.db.prepare(
          `
            SELECT id, name, category, unit, venue_id
            FROM items
            ORDER BY name ASC, id ASC
          `,
        ).all()) as ItemRow[];

    return rows.map(mapItemRow);
  }

  async listInventoryItemsForScope(
    scopeType: InventoryVendorMappingScopeType,
    scopeRefId: number | string,
    context?: SubjectScopeContext,
  ): Promise<InventoryItemRecord[]> {
    let rows: ItemRow[];
    if (scopeType === 'location') {
      rows = this.db.prepare(
        `
          SELECT id, name, category, unit, venue_id
          FROM items
          WHERE venue_id = ? OR venue_id IS NULL
          ORDER BY name ASC, id ASC
        `,
      ).all(scopeRefId) as ItemRow[];
    } else if (scopeType === 'operation_unit' && context?.location_id != null) {
      rows = this.db.prepare(
        `
          SELECT id, name, category, unit, venue_id
          FROM items
          WHERE venue_id = ? OR venue_id IS NULL
          ORDER BY name ASC, id ASC
        `,
      ).all(context.location_id) as ItemRow[];
    } else {
      rows = this.db.prepare(
        `
          SELECT id, name, category, unit, venue_id
          FROM items
          ORDER BY name ASC, id ASC
        `,
      ).all() as ItemRow[];
    }

    return rows.map(mapItemRow);
  }

  async listVendorItemsForInventoryItem(
    inventoryItemId: number | string,
    _scopeType?: InventoryVendorMappingScopeType,
    _scopeRefId?: number | string,
    _context?: SubjectScopeContext,
  ): Promise<VendorItemRecord[]> {
    const rows = this.db.prepare(
      `
        SELECT
          vp.id,
          vp.item_id AS inventory_item_id,
          i.name AS inventory_item_name,
          vp.vendor_id,
          v.name AS vendor_name,
          COALESCE(vp.vendor_item_name, i.name) AS vendor_item_name,
          vp.order_unit,
          vp.order_unit_price,
          vp.qty_per_unit,
          i.unit AS base_unit,
          i.venue_id,
          vp.is_default,
          vp.created_at,
          vp.updated_at
        FROM vendor_prices vp
        INNER JOIN items i ON i.id = vp.item_id
        LEFT JOIN vendors v ON v.id = vp.vendor_id
        WHERE vp.item_id = ?
        ORDER BY vp.is_default DESC, vp.updated_at DESC, vp.id DESC
      `,
    ).all(inventoryItemId) as VendorPriceRow[];

    return rows.map(mapVendorPriceRow);
  }

  async getVendorItemsByIds(ids: Array<number | string>): Promise<VendorItemRecord[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = this.db.prepare(
      `
        SELECT
          vp.id,
          vp.item_id AS inventory_item_id,
          i.name AS inventory_item_name,
          vp.vendor_id,
          v.name AS vendor_name,
          COALESCE(vp.vendor_item_name, i.name) AS vendor_item_name,
          vp.order_unit,
          vp.order_unit_price,
          vp.qty_per_unit,
          i.unit AS base_unit,
          i.venue_id,
          vp.is_default,
          vp.created_at,
          vp.updated_at
        FROM vendor_prices vp
        INNER JOIN items i ON i.id = vp.item_id
        LEFT JOIN vendors v ON v.id = vp.vendor_id
        WHERE vp.id IN (${ids.map(() => '?').join(',')})
        ORDER BY vp.id ASC
      `,
    ).all(...ids) as VendorPriceRow[];

    return rows.map(mapVendorPriceRow);
  }

  async listCostLineageRecords(
    vendorItemId: number | string,
    effectiveAt?: string | null,
  ): Promise<VendorCostLineageRecord[]> {
    const rows = (effectiveAt
      ? this.db.prepare(
          `
            SELECT *
            FROM vendor_cost_lineage_records
            WHERE vendor_item_id = ?
              AND (effective_at IS NULL OR effective_at <= ?)
            ORDER BY
              CASE WHEN effective_at IS NULL THEN 1 ELSE 0 END ASC,
              effective_at DESC,
              id DESC
          `,
        ).all(vendorItemId, effectiveAt)
      : this.db.prepare(
          `
            SELECT *
            FROM vendor_cost_lineage_records
            WHERE vendor_item_id = ?
            ORDER BY
              CASE WHEN effective_at IS NULL THEN 1 ELSE 0 END ASC,
              effective_at DESC,
              id DESC
          `,
        ).all(vendorItemId)) as CostLineageRow[];

    return rows.map(mapCostLineageRow);
  }

  async listMappingsForInventoryItem(inventoryItemId: number | string): Promise<InventoryVendorMapping[]> {
    const rows = this.db.prepare(
      `
        SELECT *
        FROM inventory_vendor_mappings
        WHERE inventory_item_id = ?
          AND active = 1
        ORDER BY preferred_flag DESC, id ASC
      `,
    ).all(inventoryItemId) as MappingRow[];
    return rows.map(mapMappingRow);
  }

  async getPreferredMapping(
    inventoryItemId: number | string,
    scopeType: InventoryVendorMappingScopeType,
    scopeRefId: number | string,
  ): Promise<InventoryVendorMapping | null> {
    const row = this.db.prepare(
      `
        SELECT *
        FROM inventory_vendor_mappings
        WHERE inventory_item_id = ?
          AND scope_type = ?
          AND scope_ref_id = ?
          AND preferred_flag = 1
        ORDER BY active DESC, id DESC
        LIMIT 1
      `,
    ).get(inventoryItemId, scopeType, String(scopeRefId)) as MappingRow | undefined;
    return row ? mapMappingRow(row) : null;
  }

  async upsertPreferredMapping(
    mapping: Omit<InventoryVendorMapping, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<{ action: 'created' | 'updated' | 'reused'; record: InventoryVendorMapping }> {
    const existing = this.db.prepare(
      `
        SELECT *
        FROM inventory_vendor_mappings
        WHERE inventory_item_id = ?
          AND scope_type = ?
          AND scope_ref_id = ?
          AND preferred_flag = 1
        ORDER BY active DESC, id DESC
        LIMIT 1
      `,
    ).get(mapping.inventory_item_id, mapping.scope_type, String(mapping.scope_ref_id)) as MappingRow | undefined;

    if (!existing) {
      const result = this.db.prepare(
        `
          INSERT INTO inventory_vendor_mappings (
            inventory_item_id,
            vendor_item_id,
            scope_type,
            scope_ref_id,
            active,
            preferred_flag,
            mapping_status,
            confidence_label,
            match_reason,
            explanation_text,
            source_hash,
            resolved_by,
            resolved_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        mapping.inventory_item_id,
        mapping.vendor_item_id,
        mapping.scope_type,
        String(mapping.scope_ref_id),
        mapping.active ? 1 : 0,
        mapping.preferred_flag ? 1 : 0,
        mapping.mapping_status,
        mapping.confidence_label,
        mapping.match_reason,
        mapping.explanation_text,
        mapping.source_hash,
        mapping.resolved_by,
        mapping.resolved_at,
      );
      return { action: 'created', record: await this.getMappingById(Number(result.lastInsertRowid)) };
    }

    const unchanged = nullableEqual(existing.vendor_item_id, mapping.vendor_item_id)
      && existing.active === (mapping.active ? 1 : 0)
      && existing.preferred_flag === (mapping.preferred_flag ? 1 : 0)
      && existing.mapping_status === mapping.mapping_status
      && nullableEqual(existing.confidence_label, mapping.confidence_label)
      && nullableEqual(existing.match_reason, mapping.match_reason)
      && nullableEqual(existing.explanation_text, mapping.explanation_text)
      && nullableEqual(existing.source_hash, mapping.source_hash)
      && nullableEqual(existing.resolved_by, mapping.resolved_by)
      && nullableEqual(existing.resolved_at, mapping.resolved_at);

    if (unchanged) {
      return { action: 'reused', record: mapMappingRow(existing) };
    }

    this.db.prepare(
      `
        UPDATE inventory_vendor_mappings
        SET vendor_item_id = ?,
            active = ?,
            preferred_flag = ?,
            mapping_status = ?,
            confidence_label = ?,
            match_reason = ?,
            explanation_text = ?,
            source_hash = ?,
            resolved_by = ?,
            resolved_at = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `,
    ).run(
      mapping.vendor_item_id,
      mapping.active ? 1 : 0,
      mapping.preferred_flag ? 1 : 0,
      mapping.mapping_status,
      mapping.confidence_label,
      mapping.match_reason,
      mapping.explanation_text,
      mapping.source_hash,
      mapping.resolved_by,
      mapping.resolved_at,
      existing.id,
    );

    return { action: 'updated', record: await this.getMappingById(existing.id) };
  }

  async replaceCandidates(
    mappingId: number | string,
    candidates: Array<Omit<InventoryVendorMappingCandidate, 'id' | 'inventory_vendor_mapping_id' | 'created_at' | 'updated_at'>>,
  ): Promise<{ records: InventoryVendorMappingCandidate[]; created: number; updated: number; retired: number }> {
    const current = this.db.prepare(
      `
        SELECT *
        FROM inventory_vendor_mapping_candidates
        WHERE inventory_vendor_mapping_id = ?
      `,
    ).all(mappingId) as CandidateRow[];

    const currentByKey = new Map(current.map((row) => [candidateKey(row.candidate_vendor_item_id, row.match_reason), row]));
    const nextKeys = new Set<string>();
    const persisted: InventoryVendorMappingCandidate[] = [];
    let created = 0;
    let updated = 0;

    for (const candidate of candidates) {
      const key = candidateKey(candidate.candidate_vendor_item_id, candidate.match_reason);
      nextKeys.add(key);
      const existing = currentByKey.get(key);

      if (!existing) {
        const result = this.db.prepare(
          `
            INSERT INTO inventory_vendor_mapping_candidates (
              inventory_vendor_mapping_id,
              candidate_vendor_item_id,
              candidate_vendor_name,
              candidate_vendor_item_name,
              confidence_label,
              match_reason,
              explanation_text,
              candidate_rank,
              active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        ).run(
          mappingId,
          candidate.candidate_vendor_item_id,
          candidate.candidate_vendor_name,
          candidate.candidate_vendor_item_name,
          candidate.confidence_label,
          candidate.match_reason,
          candidate.explanation_text,
          candidate.candidate_rank,
          candidate.active ? 1 : 0,
        );
        created += 1;
        persisted.push(await this.getCandidateById(Number(result.lastInsertRowid)));
        continue;
      }

      const same = existing.candidate_vendor_name === candidate.candidate_vendor_name
        && existing.candidate_vendor_item_name === candidate.candidate_vendor_item_name
        && existing.confidence_label === candidate.confidence_label
        && existing.match_reason === candidate.match_reason
        && existing.explanation_text === candidate.explanation_text
        && existing.candidate_rank === candidate.candidate_rank
        && existing.active === (candidate.active ? 1 : 0);

      if (!same) {
        this.db.prepare(
          `
            UPDATE inventory_vendor_mapping_candidates
            SET candidate_vendor_name = ?,
                candidate_vendor_item_name = ?,
                confidence_label = ?,
                match_reason = ?,
                explanation_text = ?,
                candidate_rank = ?,
                active = ?,
                updated_at = datetime('now')
            WHERE id = ?
          `,
        ).run(
          candidate.candidate_vendor_name,
          candidate.candidate_vendor_item_name,
          candidate.confidence_label,
          candidate.match_reason,
          candidate.explanation_text,
          candidate.candidate_rank,
          candidate.active ? 1 : 0,
          existing.id,
        );
        updated += 1;
      }

      persisted.push(await this.getCandidateById(existing.id));
    }

    let retired = 0;
    for (const row of current) {
      const key = candidateKey(row.candidate_vendor_item_id, row.match_reason);
      if (row.active === 1 && !nextKeys.has(key)) {
        this.db.prepare(
          `
            UPDATE inventory_vendor_mapping_candidates
            SET active = 0,
                updated_at = datetime('now')
            WHERE id = ?
          `,
        ).run(row.id);
        retired += 1;
      }
    }

    return { records: persisted, created, updated, retired };
  }

  async retireScopeMappings(
    scopeType: InventoryVendorMappingScopeType,
    scopeRefId: number | string,
    activeInventoryItemIds: Set<string>,
  ): Promise<number> {
    const rows = this.db.prepare(
      `
        SELECT id, inventory_item_id, mapping_status
        FROM inventory_vendor_mappings
        WHERE scope_type = ?
          AND scope_ref_id = ?
          AND active = 1
      `,
    ).all(scopeType, String(scopeRefId)) as Array<{ id: number; inventory_item_id: number; mapping_status: string }>;

    let retired = 0;
    for (const row of rows) {
      if (activeInventoryItemIds.has(String(row.inventory_item_id))) {
        continue;
      }
      if (row.mapping_status === 'MANUALLY_MAPPED' || row.mapping_status === 'REJECTED') {
        continue;
      }
      this.db.prepare(
        `
          UPDATE inventory_vendor_mappings
          SET active = 0,
              updated_at = datetime('now')
          WHERE id = ?
        `,
      ).run(row.id);
      retired += 1;
    }

    return retired;
  }

  async recordReviewEvent(
    event: Omit<InventoryVendorMappingReviewEvent, 'id' | 'created_at'>,
  ): Promise<InventoryVendorMappingReviewEvent> {
    const result = this.db.prepare(
      `
        INSERT INTO inventory_vendor_mapping_review_events (
          inventory_vendor_mapping_id,
          action_type,
          actor_name,
          notes
        ) VALUES (?, ?, ?, ?)
      `,
    ).run(event.inventory_vendor_mapping_id, event.action_type, event.actor_name, event.notes);
    return this.getReviewEventById(Number(result.lastInsertRowid));
  }

  private async getMappingById(id: number): Promise<InventoryVendorMapping> {
    const row = this.db.prepare('SELECT * FROM inventory_vendor_mappings WHERE id = ? LIMIT 1').get(id) as MappingRow | undefined;
    if (!row) {
      throw new Error(`Inventory vendor mapping ${id} not found.`);
    }
    return mapMappingRow(row);
  }

  private async getCandidateById(id: number): Promise<InventoryVendorMappingCandidate> {
    const row = this.db.prepare('SELECT * FROM inventory_vendor_mapping_candidates WHERE id = ? LIMIT 1').get(id) as CandidateRow | undefined;
    if (!row) {
      throw new Error(`Inventory vendor mapping candidate ${id} not found.`);
    }
    return mapCandidateRow(row);
  }

  private getReviewEventById(id: number): InventoryVendorMappingReviewEvent {
    const row = this.db.prepare('SELECT * FROM inventory_vendor_mapping_review_events WHERE id = ? LIMIT 1').get(id) as ReviewEventRow | undefined;
    if (!row) {
      throw new Error(`Inventory vendor mapping review event ${id} not found.`);
    }
    return mapReviewEventRow(row);
  }
}

interface ItemRow {
  id: number;
  name: string;
  category: string;
  unit: string;
  venue_id: number | null;
}

interface VendorPriceRow {
  id: number;
  inventory_item_id: number;
  inventory_item_name: string;
  vendor_id: number | null;
  vendor_name: string | null;
  vendor_item_name: string;
  order_unit: string | null;
  order_unit_price: number;
  qty_per_unit: number | null;
  base_unit: string;
  venue_id: number | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

interface MappingRow {
  id: number;
  inventory_item_id: number;
  vendor_item_id: number | null;
  scope_type: InventoryVendorMappingScopeType;
  scope_ref_id: string | null;
  active: number;
  preferred_flag: number;
  mapping_status: InventoryVendorMapping['mapping_status'];
  confidence_label: InventoryVendorMapping['confidence_label'];
  match_reason: InventoryVendorMapping['match_reason'];
  explanation_text: string | null;
  source_hash: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CandidateRow {
  id: number;
  inventory_vendor_mapping_id: number;
  candidate_vendor_item_id: number;
  candidate_vendor_name: string | null;
  candidate_vendor_item_name: string;
  confidence_label: InventoryVendorMappingCandidate['confidence_label'];
  match_reason: InventoryVendorMappingCandidate['match_reason'];
  explanation_text: string;
  candidate_rank: number;
  active: number;
  created_at: string;
  updated_at: string;
}

interface ReviewEventRow {
  id: number;
  inventory_vendor_mapping_id: number;
  action_type: string;
  actor_name: string | null;
  notes: string | null;
  created_at: string;
}

interface CostLineageRow {
  id: number;
  vendor_item_id: number;
  normalized_unit_cost: number | null;
  base_unit: string | null;
  source_type: VendorCostLineageRecord['source_type'];
  source_ref_table: string | null;
  source_ref_id: string | null;
  effective_at: string | null;
  stale_at: string | null;
  confidence_label: VendorCostLineageRecord['confidence_label'];
  created_at: string;
}

function mapItemRow(row: ItemRow): InventoryItemRecord {
  return {
    id: row.id,
    name: row.name,
    normalized_name: normalizeIngredientLookup(row.name),
    category: row.category,
    unit: row.unit,
    venue_id: row.venue_id,
  };
}

function mapVendorPriceRow(row: VendorPriceRow): VendorItemRecord {
  return {
    id: row.id,
    inventory_item_id: row.inventory_item_id,
    inventory_item_name: row.inventory_item_name,
    vendor_id: row.vendor_id,
    vendor_name: row.vendor_name,
    vendor_item_name: row.vendor_item_name,
    normalized_vendor_item_name: normalizeIngredientLookup(row.vendor_item_name),
    order_unit: row.order_unit,
    order_unit_price: row.order_unit_price,
    qty_per_unit: row.qty_per_unit,
    base_unit: row.base_unit,
    venue_id: row.venue_id,
    is_default: row.is_default === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapMappingRow(row: MappingRow): InventoryVendorMapping {
  return {
    id: row.id,
    inventory_item_id: row.inventory_item_id,
    vendor_item_id: row.vendor_item_id,
    scope_type: row.scope_type,
    scope_ref_id: row.scope_ref_id,
    active: row.active === 1,
    preferred_flag: row.preferred_flag === 1,
    mapping_status: row.mapping_status,
    confidence_label: row.confidence_label,
    match_reason: row.match_reason,
    explanation_text: row.explanation_text,
    source_hash: row.source_hash,
    resolved_by: row.resolved_by,
    resolved_at: row.resolved_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapCandidateRow(row: CandidateRow): InventoryVendorMappingCandidate {
  return {
    id: row.id,
    inventory_vendor_mapping_id: row.inventory_vendor_mapping_id,
    candidate_vendor_item_id: row.candidate_vendor_item_id,
    candidate_vendor_name: row.candidate_vendor_name,
    candidate_vendor_item_name: row.candidate_vendor_item_name,
    confidence_label: row.confidence_label,
    match_reason: row.match_reason,
    explanation_text: row.explanation_text,
    candidate_rank: row.candidate_rank,
    active: row.active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapReviewEventRow(row: ReviewEventRow): InventoryVendorMappingReviewEvent {
  return {
    id: row.id,
    inventory_vendor_mapping_id: row.inventory_vendor_mapping_id,
    action_type: row.action_type,
    actor_name: row.actor_name,
    notes: row.notes,
    created_at: row.created_at,
  };
}

function mapCostLineageRow(row: CostLineageRow): VendorCostLineageRecord {
  return {
    id: row.id,
    vendor_item_id: row.vendor_item_id,
    normalized_unit_cost: row.normalized_unit_cost,
    base_unit: row.base_unit,
    source_type: row.source_type,
    source_ref_table: row.source_ref_table,
    source_ref_id: row.source_ref_id,
    effective_at: row.effective_at,
    stale_at: row.stale_at,
    confidence_label: row.confidence_label,
    created_at: row.created_at,
  };
}

function candidateKey(candidateVendorItemId: number | string, matchReason: string): string {
  return `${candidateVendorItemId}:${matchReason}`;
}

function nullableEqual(a: unknown, b: unknown): boolean {
  return String(a ?? '') === String(b ?? '');
}
