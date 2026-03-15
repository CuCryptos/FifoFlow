import Database from 'better-sqlite3';
import type { RecipeIngredientRecord } from '../../recipes/promotion/types.js';
import type { SubjectScopeContext } from '../../platform/policy/types.js';
import { normalizeIngredientLookup } from '../ingredients/canonicalIngredientResolver.js';
import { initializeCanonicalIngredientDb } from '../ingredients/persistence/sqliteSchema.js';
import { initializeRecipePromotionDb } from '../../recipes/promotion/persistence/sqliteSchema.js';
import { initializeCanonicalInventoryMappingDb } from './persistence/sqliteSchema.js';
import type {
  CanonicalIngredientWithAliases,
  CanonicalInventoryMapping,
  CanonicalInventoryMappingCandidate,
  CanonicalInventoryMappingReviewEvent,
  CanonicalInventoryMappingScopeType,
  CanonicalInventoryRepository,
  InventoryItemRecord,
} from './types.js';

export class SQLiteCanonicalInventoryRepository implements CanonicalInventoryRepository {
  constructor(private readonly db: Database.Database) {
    initializeCanonicalIngredientDb(db);
    initializeRecipePromotionDb(db);
    initializeCanonicalInventoryMappingDb(db);
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

  async listCanonicalIngredients(ids?: Array<number | string>): Promise<CanonicalIngredientWithAliases[]> {
    const ingredientRows = (ids && ids.length > 0
      ? this.db.prepare(
          `
            SELECT *
            FROM canonical_ingredients
            WHERE active = 1
              AND id IN (${ids.map(() => '?').join(',')})
            ORDER BY canonical_name ASC
          `,
        ).all(...ids)
      : this.db.prepare(
          `
            SELECT *
            FROM canonical_ingredients
            WHERE active = 1
            ORDER BY canonical_name ASC
          `,
        ).all()) as CanonicalIngredientRow[];

    const aliases = this.db.prepare(
      `
        SELECT *
        FROM ingredient_aliases
        WHERE active = 1
        ORDER BY canonical_ingredient_id ASC, alias ASC
      `,
    ).all() as IngredientAliasRow[];
    const aliasMap = new Map<number, IngredientAliasRow[]>();
    for (const alias of aliases) {
      const key = Number(alias.canonical_ingredient_id);
      const existing = aliasMap.get(key) ?? [];
      existing.push(alias);
      aliasMap.set(key, existing);
    }

    return ingredientRows.map((row) => {
      const ingredientAliases = aliasMap.get(row.id) ?? [];
      return {
        id: row.id,
        canonical_name: row.canonical_name,
        normalized_canonical_name: row.normalized_canonical_name,
        category: row.category,
        base_unit: row.base_unit,
        perishable_flag: row.perishable_flag === 1,
        active: row.active === 1,
        source_hash: row.source_hash,
        created_at: row.created_at,
        updated_at: row.updated_at,
        aliases: ingredientAliases.map((alias) => alias.alias),
        normalized_aliases: ingredientAliases.map((alias) => alias.normalized_alias),
      } satisfies CanonicalIngredientWithAliases;
    });
  }

  async listInventoryItemsForScope(
    scopeType: CanonicalInventoryMappingScopeType,
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

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      normalized_name: normalizeIngredientLookup(row.name),
      category: row.category,
      unit: row.unit,
      venue_id: row.venue_id,
    }));
  }

  async getInventoryItemsByIds(ids: Array<number | string>): Promise<InventoryItemRecord[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = this.db.prepare(
      `
        SELECT id, name, category, unit, venue_id
        FROM items
        WHERE id IN (${ids.map(() => '?').join(',')})
        ORDER BY id ASC
      `,
    ).all(...ids) as ItemRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      normalized_name: normalizeIngredientLookup(row.name),
      category: row.category,
      unit: row.unit,
      venue_id: row.venue_id,
    }));
  }

  async listMappingsForCanonical(canonicalIngredientId: number | string): Promise<CanonicalInventoryMapping[]> {
    const rows = this.db.prepare(
      `
        SELECT *
        FROM canonical_inventory_mappings
        WHERE canonical_ingredient_id = ?
          AND active = 1
        ORDER BY preferred_flag DESC, id ASC
      `,
    ).all(canonicalIngredientId) as MappingRow[];
    return rows.map(mapMappingRow);
  }

  async listRecipeIngredients(recipeVersionId: number | string): Promise<RecipeIngredientRecord[]> {
    const rows = this.db.prepare(
      `
        SELECT *
        FROM recipe_ingredients
        WHERE recipe_version_id = ?
        ORDER BY line_index ASC
      `,
    ).all(recipeVersionId) as RecipeIngredientRow[];
    return rows.map(mapRecipeIngredientRow);
  }

  async getPreferredMapping(
    canonicalIngredientId: number | string,
    scopeType: CanonicalInventoryMappingScopeType,
    scopeRefId: number | string,
  ): Promise<CanonicalInventoryMapping | null> {
    const row = this.db.prepare(
      `
        SELECT *
        FROM canonical_inventory_mappings
        WHERE canonical_ingredient_id = ?
          AND scope_type = ?
          AND scope_ref_id = ?
          AND preferred_flag = 1
        ORDER BY active DESC, id DESC
        LIMIT 1
      `,
    ).get(canonicalIngredientId, scopeType, scopeRefId) as MappingRow | undefined;
    return row ? mapMappingRow(row) : null;
  }

  async upsertPreferredMapping(
    mapping: Omit<CanonicalInventoryMapping, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<{ action: 'created' | 'updated' | 'reused'; record: CanonicalInventoryMapping }> {
    const existing = this.db.prepare(
      `
        SELECT *
        FROM canonical_inventory_mappings
        WHERE canonical_ingredient_id = ?
          AND scope_type = ?
          AND scope_ref_id = ?
          AND preferred_flag = 1
        ORDER BY active DESC, id DESC
        LIMIT 1
      `,
    ).get(mapping.canonical_ingredient_id, mapping.scope_type, mapping.scope_ref_id) as MappingRow | undefined;

    if (!existing) {
      const result = this.db.prepare(
        `
          INSERT INTO canonical_inventory_mappings (
            canonical_ingredient_id,
            inventory_item_id,
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
        mapping.canonical_ingredient_id,
        mapping.inventory_item_id,
        mapping.scope_type,
        mapping.scope_ref_id,
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

    const unchanged = nullableEqual(existing.inventory_item_id, mapping.inventory_item_id)
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
        UPDATE canonical_inventory_mappings
        SET inventory_item_id = ?,
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
      mapping.inventory_item_id,
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
    candidates: Array<Omit<CanonicalInventoryMappingCandidate, 'id' | 'canonical_inventory_mapping_id' | 'created_at' | 'updated_at'>>,
  ): Promise<{ records: CanonicalInventoryMappingCandidate[]; created: number; updated: number; retired: number }> {
    const current = this.db.prepare(
      `
        SELECT *
        FROM canonical_inventory_mapping_candidates
        WHERE canonical_inventory_mapping_id = ?
      `,
    ).all(mappingId) as CandidateRow[];

    const currentByKey = new Map(current.map((row) => [candidateKey(row.candidate_inventory_item_id, row.match_reason), row]));
    const nextKeys = new Set<string>();
    const persisted: CanonicalInventoryMappingCandidate[] = [];
    let created = 0;
    let updated = 0;

    for (const candidate of candidates) {
      const key = candidateKey(candidate.candidate_inventory_item_id, candidate.match_reason);
      nextKeys.add(key);
      const existing = currentByKey.get(key);

      if (!existing) {
        const result = this.db.prepare(
          `
            INSERT INTO canonical_inventory_mapping_candidates (
              canonical_inventory_mapping_id,
              candidate_inventory_item_id,
              candidate_inventory_name,
              confidence_label,
              match_reason,
              explanation_text,
              candidate_rank,
              active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
        ).run(
          mappingId,
          candidate.candidate_inventory_item_id,
          candidate.candidate_inventory_name,
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

      const same = existing.candidate_inventory_name === candidate.candidate_inventory_name
        && existing.confidence_label === candidate.confidence_label
        && existing.match_reason === candidate.match_reason
        && existing.explanation_text === candidate.explanation_text
        && existing.candidate_rank === candidate.candidate_rank
        && existing.active === (candidate.active ? 1 : 0);

      if (!same) {
        this.db.prepare(
          `
            UPDATE canonical_inventory_mapping_candidates
            SET candidate_inventory_name = ?,
                confidence_label = ?,
                match_reason = ?,
                explanation_text = ?,
                candidate_rank = ?,
                active = ?,
                updated_at = datetime('now')
            WHERE id = ?
          `,
        ).run(
          candidate.candidate_inventory_name,
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
      const key = candidateKey(row.candidate_inventory_item_id, row.match_reason);
      if (row.active === 1 && !nextKeys.has(key)) {
        this.db.prepare(
          `
            UPDATE canonical_inventory_mapping_candidates
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
    scopeType: CanonicalInventoryMappingScopeType,
    scopeRefId: number | string,
    activeCanonicalIngredientIds: Set<string>,
  ): Promise<number> {
    const rows = this.db.prepare(
      `
        SELECT id, canonical_ingredient_id, mapping_status
        FROM canonical_inventory_mappings
        WHERE scope_type = ?
          AND scope_ref_id = ?
          AND preferred_flag = 1
          AND active = 1
      `,
    ).all(scopeType, scopeRefId) as Array<{ id: number; canonical_ingredient_id: number; mapping_status: string }>;

    let retired = 0;
    for (const row of rows) {
      if (row.mapping_status === 'MANUALLY_MAPPED' || row.mapping_status === 'REJECTED') {
        continue;
      }
      if (activeCanonicalIngredientIds.has(String(row.canonical_ingredient_id))) {
        continue;
      }
      this.db.prepare(
        `
          UPDATE canonical_inventory_mappings
          SET active = 0,
              updated_at = datetime('now')
          WHERE id = ?
        `,
      ).run(row.id);
      this.db.prepare(
        `
          UPDATE canonical_inventory_mapping_candidates
          SET active = 0,
              updated_at = datetime('now')
          WHERE canonical_inventory_mapping_id = ?
            AND active = 1
        `,
      ).run(row.id);
      retired += 1;
    }
    return retired;
  }

  async recordReviewEvent(
    event: Omit<CanonicalInventoryMappingReviewEvent, 'id' | 'created_at'>,
  ): Promise<CanonicalInventoryMappingReviewEvent> {
    const result = this.db.prepare(
      `
        INSERT INTO canonical_inventory_mapping_review_events (
          canonical_inventory_mapping_id,
          action_type,
          actor_name,
          notes
        ) VALUES (?, ?, ?, ?)
      `,
    ).run(event.canonical_inventory_mapping_id, event.action_type, event.actor_name, event.notes);

    const row = this.db.prepare(
      'SELECT * FROM canonical_inventory_mapping_review_events WHERE id = ? LIMIT 1',
    ).get(Number(result.lastInsertRowid)) as ReviewEventRow;
    return mapReviewEventRow(row);
  }

  private async getMappingById(id: number): Promise<CanonicalInventoryMapping> {
    const row = this.db.prepare('SELECT * FROM canonical_inventory_mappings WHERE id = ? LIMIT 1').get(id) as MappingRow | undefined;
    if (!row) {
      throw new Error(`Canonical inventory mapping ${id} not found.`);
    }
    return mapMappingRow(row);
  }

  private async getCandidateById(id: number): Promise<CanonicalInventoryMappingCandidate> {
    const row = this.db.prepare('SELECT * FROM canonical_inventory_mapping_candidates WHERE id = ? LIMIT 1').get(id) as CandidateRow | undefined;
    if (!row) {
      throw new Error(`Canonical inventory mapping candidate ${id} not found.`);
    }
    return mapCandidateRow(row);
  }
}

type CanonicalIngredientRow = {
  id: number;
  canonical_name: string;
  normalized_canonical_name: string;
  category: string;
  base_unit: string;
  perishable_flag: number;
  active: number;
  source_hash: string;
  created_at: string;
  updated_at: string;
};

type IngredientAliasRow = {
  id: number;
  canonical_ingredient_id: number;
  alias: string;
  normalized_alias: string;
};

type ItemRow = {
  id: number;
  name: string;
  category: string;
  unit: string;
  venue_id: number | null;
};

type MappingRow = {
  id: number;
  canonical_ingredient_id: number;
  inventory_item_id: number | null;
  scope_type: CanonicalInventoryMappingScopeType;
  scope_ref_id: number | null;
  active: number;
  preferred_flag: number;
  mapping_status: CanonicalInventoryMapping['mapping_status'];
  confidence_label: CanonicalInventoryMapping['confidence_label'];
  match_reason: CanonicalInventoryMapping['match_reason'];
  explanation_text: string | null;
  source_hash: string | null;
  created_at: string;
  updated_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
};

type CandidateRow = {
  id: number;
  canonical_inventory_mapping_id: number;
  candidate_inventory_item_id: number;
  candidate_inventory_name: string;
  confidence_label: CanonicalInventoryMappingCandidate['confidence_label'];
  match_reason: CanonicalInventoryMappingCandidate['match_reason'];
  explanation_text: string;
  candidate_rank: number;
  active: number;
  created_at: string;
  updated_at: string;
};

type ReviewEventRow = {
  id: number;
  canonical_inventory_mapping_id: number;
  action_type: string;
  actor_name: string | null;
  notes: string | null;
  created_at: string;
};

type RecipeIngredientRow = RecipeIngredientRecord;

function mapMappingRow(row: MappingRow): CanonicalInventoryMapping {
  return {
    id: row.id,
    canonical_ingredient_id: row.canonical_ingredient_id,
    inventory_item_id: row.inventory_item_id,
    scope_type: row.scope_type,
    scope_ref_id: row.scope_ref_id,
    active: row.active === 1,
    preferred_flag: row.preferred_flag === 1,
    mapping_status: row.mapping_status,
    confidence_label: row.confidence_label,
    match_reason: row.match_reason,
    explanation_text: row.explanation_text,
    source_hash: row.source_hash,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_by: row.resolved_by,
    resolved_at: row.resolved_at,
  };
}

function mapCandidateRow(row: CandidateRow): CanonicalInventoryMappingCandidate {
  return {
    id: row.id,
    canonical_inventory_mapping_id: row.canonical_inventory_mapping_id,
    candidate_inventory_item_id: row.candidate_inventory_item_id,
    candidate_inventory_name: row.candidate_inventory_name,
    confidence_label: row.confidence_label,
    match_reason: row.match_reason,
    explanation_text: row.explanation_text,
    candidate_rank: row.candidate_rank,
    active: row.active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapReviewEventRow(row: ReviewEventRow): CanonicalInventoryMappingReviewEvent {
  return {
    id: row.id,
    canonical_inventory_mapping_id: row.canonical_inventory_mapping_id,
    action_type: row.action_type,
    actor_name: row.actor_name,
    notes: row.notes,
    created_at: row.created_at,
  };
}

function mapRecipeIngredientRow(row: RecipeIngredientRow): RecipeIngredientRecord {
  return row;
}

function candidateKey(candidateInventoryItemId: number | string, matchReason: string): string {
  return `${candidateInventoryItemId}:${matchReason}`;
}

function nullableEqual(left: unknown, right: unknown): boolean {
  return left === right || (left == null && right == null);
}
