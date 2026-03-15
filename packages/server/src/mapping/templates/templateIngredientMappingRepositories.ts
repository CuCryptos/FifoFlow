import Database from 'better-sqlite3';
import { normalizeIngredientLookup } from '../ingredients/canonicalIngredientResolver.js';
import { initializeTemplateIngredientMappingDb } from './persistence/sqliteSchema.js';
import type {
  TemplateIngredientMapping,
  TemplateIngredientMappingCandidate,
  TemplateIngredientMappingRepository,
  TemplateIngredientMappingReviewEvent,
  TemplateIngredientMappingSource,
  TemplateIngredientMappingStatus,
  TemplateIngredientSourceRow,
} from './types.js';

export class SQLiteTemplateIngredientMappingRepository implements TemplateIngredientMappingSource, TemplateIngredientMappingRepository {
  constructor(private readonly db: Database.Database) {
    initializeTemplateIngredientMappingDb(db);
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

  async listActiveTemplateIngredientRows(): Promise<TemplateIngredientSourceRow[]> {
    const rows = this.db.prepare(
      `
        SELECT
          t.id AS template_id,
          t.name AS template_name,
          t.category AS template_category,
          v.id AS template_version_id,
          v.version_number AS template_version_number,
          v.source_hash AS template_version_source_hash,
          i.ingredient_name AS ingredient_name,
          i.qty AS qty,
          i.unit AS unit,
          i.sort_order AS sort_order
        FROM recipe_template_ingredients i
        INNER JOIN recipe_template_versions v ON v.id = i.recipe_template_version_id
        INNER JOIN recipe_templates t ON t.id = v.recipe_template_id
        WHERE v.is_active = 1
        ORDER BY t.id ASC, v.id ASC, i.sort_order ASC
      `,
    ).all() as TemplateIngredientRow[];

    return rows.map((row) => ({
      template_id: row.template_id,
      template_name: row.template_name,
      template_category: row.template_category,
      template_version_id: row.template_version_id,
      template_version_number: row.template_version_number,
      template_version_source_hash: row.template_version_source_hash,
      ingredient_name: row.ingredient_name,
      normalized_ingredient_name: normalizeIngredientLookup(row.ingredient_name),
      qty: Number(row.qty),
      unit: row.unit,
      sort_order: row.sort_order,
    }));
  }

  async getMappingByRowKey(rowKey: string): Promise<TemplateIngredientMapping | null> {
    const row = this.db.prepare(
      'SELECT * FROM template_ingredient_mappings WHERE template_ingredient_row_key = ? LIMIT 1',
    ).get(rowKey) as TemplateIngredientMappingRow | undefined;
    return row ? mapMappingRow(row) : null;
  }

  async upsertMapping(
    mapping: Omit<TemplateIngredientMapping, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<{ action: 'created' | 'updated' | 'reused'; record: TemplateIngredientMapping }> {
    const existing = this.db.prepare(
      'SELECT * FROM template_ingredient_mappings WHERE template_ingredient_row_key = ? LIMIT 1',
    ).get(mapping.template_ingredient_row_key) as TemplateIngredientMappingRow | undefined;

    if (!existing) {
      const result = this.db.prepare(
        `
          INSERT INTO template_ingredient_mappings (
            template_id,
            template_version_id,
            template_ingredient_row_key,
            ingredient_name,
            normalized_ingredient_name,
            mapped_canonical_ingredient_id,
            mapping_status,
            confidence_label,
            match_reason,
            chosen_candidate_id,
            explanation_text,
            source_hash,
            active,
            resolved_by,
            resolved_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        mapping.template_id,
        mapping.template_version_id,
        mapping.template_ingredient_row_key,
        mapping.ingredient_name,
        mapping.normalized_ingredient_name,
        mapping.mapped_canonical_ingredient_id,
        mapping.mapping_status,
        mapping.confidence_label,
        mapping.match_reason,
        mapping.chosen_candidate_id,
        mapping.explanation_text,
        mapping.source_hash,
        mapping.active ? 1 : 0,
        mapping.resolved_by,
        mapping.resolved_at,
      );

      return { action: 'created', record: await this.getMappingById(Number(result.lastInsertRowid)) };
    }

    const unchanged = existing.template_id === mapping.template_id
      && existing.template_version_id === mapping.template_version_id
      && existing.ingredient_name === mapping.ingredient_name
      && existing.normalized_ingredient_name === mapping.normalized_ingredient_name
      && nullableEqual(existing.mapped_canonical_ingredient_id, mapping.mapped_canonical_ingredient_id)
      && existing.mapping_status === mapping.mapping_status
      && nullableEqual(existing.confidence_label, mapping.confidence_label)
      && nullableEqual(existing.match_reason, mapping.match_reason)
      && nullableEqual(existing.chosen_candidate_id, mapping.chosen_candidate_id)
      && existing.explanation_text === mapping.explanation_text
      && existing.source_hash === mapping.source_hash
      && existing.active === (mapping.active ? 1 : 0)
      && nullableEqual(existing.resolved_by, mapping.resolved_by)
      && nullableEqual(existing.resolved_at, mapping.resolved_at);

    if (unchanged) {
      return { action: 'reused', record: mapMappingRow(existing) };
    }

    this.db.prepare(
      `
        UPDATE template_ingredient_mappings
        SET template_id = ?,
            template_version_id = ?,
            ingredient_name = ?,
            normalized_ingredient_name = ?,
            mapped_canonical_ingredient_id = ?,
            mapping_status = ?,
            confidence_label = ?,
            match_reason = ?,
            chosen_candidate_id = ?,
            explanation_text = ?,
            source_hash = ?,
            active = ?,
            resolved_by = ?,
            resolved_at = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `,
    ).run(
      mapping.template_id,
      mapping.template_version_id,
      mapping.ingredient_name,
      mapping.normalized_ingredient_name,
      mapping.mapped_canonical_ingredient_id,
      mapping.mapping_status,
      mapping.confidence_label,
      mapping.match_reason,
      mapping.chosen_candidate_id,
      mapping.explanation_text,
      mapping.source_hash,
      mapping.active ? 1 : 0,
      mapping.resolved_by,
      mapping.resolved_at,
      existing.id,
    );

    return { action: 'updated', record: await this.getMappingById(existing.id) };
  }

  async replaceCandidates(
    mappingId: number | string,
    candidates: Array<Omit<TemplateIngredientMappingCandidate, 'id' | 'template_ingredient_mapping_id' | 'created_at' | 'updated_at'>>,
  ): Promise<{ records: TemplateIngredientMappingCandidate[]; created: number; updated: number; retired: number }> {
    const current = this.db.prepare(
      `
        SELECT *
        FROM template_ingredient_mapping_candidates
        WHERE template_ingredient_mapping_id = ?
      `,
    ).all(mappingId) as TemplateIngredientMappingCandidateRow[];

    const currentByKey = new Map(current.map((row) => [candidateKey(row.candidate_canonical_ingredient_id, row.match_reason), row]));
    const nextKeys = new Set<string>();
    const persisted: TemplateIngredientMappingCandidate[] = [];
    let created = 0;
    let updated = 0;

    for (const candidate of candidates) {
      const key = candidateKey(candidate.candidate_canonical_ingredient_id, candidate.match_reason);
      nextKeys.add(key);
      const existing = currentByKey.get(key);

      if (!existing) {
        const result = this.db.prepare(
          `
            INSERT INTO template_ingredient_mapping_candidates (
              template_ingredient_mapping_id,
              candidate_canonical_ingredient_id,
              candidate_canonical_name,
              confidence_label,
              match_reason,
              explanation_text,
              candidate_rank,
              active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
        ).run(
          mappingId,
          candidate.candidate_canonical_ingredient_id,
          candidate.candidate_canonical_name,
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

      const same = existing.candidate_canonical_name === candidate.candidate_canonical_name
        && existing.confidence_label === candidate.confidence_label
        && existing.match_reason === candidate.match_reason
        && existing.explanation_text === candidate.explanation_text
        && existing.candidate_rank === candidate.candidate_rank
        && existing.active === (candidate.active ? 1 : 0);

      if (!same) {
        this.db.prepare(
          `
            UPDATE template_ingredient_mapping_candidates
            SET candidate_canonical_name = ?,
                confidence_label = ?,
                match_reason = ?,
                explanation_text = ?,
                candidate_rank = ?,
                active = ?,
                updated_at = datetime('now')
            WHERE id = ?
          `,
        ).run(
          candidate.candidate_canonical_name,
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
      const key = candidateKey(row.candidate_canonical_ingredient_id, row.match_reason);
      if (row.active === 1 && !nextKeys.has(key)) {
        this.db.prepare(
          `
            UPDATE template_ingredient_mapping_candidates
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

  async retireMissingMappings(activeRowKeys: Set<string>): Promise<number> {
    const rows = this.db.prepare(
      'SELECT id, template_ingredient_row_key FROM template_ingredient_mappings WHERE active = 1',
    ).all() as Array<{ id: number; template_ingredient_row_key: string }>;

    let retired = 0;
    for (const row of rows) {
      if (activeRowKeys.has(row.template_ingredient_row_key)) {
        continue;
      }
      this.db.prepare(
        `
          UPDATE template_ingredient_mappings
          SET active = 0,
              updated_at = datetime('now')
          WHERE id = ?
        `,
      ).run(row.id);
      this.db.prepare(
        `
          UPDATE template_ingredient_mapping_candidates
          SET active = 0,
              updated_at = datetime('now')
          WHERE template_ingredient_mapping_id = ?
            AND active = 1
        `,
      ).run(row.id);
      retired += 1;
    }

    return retired;
  }

  async recordReviewEvent(
    event: Omit<TemplateIngredientMappingReviewEvent, 'id' | 'created_at'>,
  ): Promise<TemplateIngredientMappingReviewEvent> {
    const result = this.db.prepare(
      `
        INSERT INTO template_ingredient_mapping_review_events (
          template_ingredient_mapping_id,
          action_type,
          actor_name,
          notes
        ) VALUES (?, ?, ?, ?)
      `,
    ).run(event.template_ingredient_mapping_id, event.action_type, event.actor_name, event.notes);

    const row = this.db.prepare(
      'SELECT * FROM template_ingredient_mapping_review_events WHERE id = ? LIMIT 1',
    ).get(Number(result.lastInsertRowid)) as TemplateIngredientMappingReviewEventRow;
    return mapReviewEventRow(row);
  }

  async listActiveMappingsByStatus(status: TemplateIngredientMappingStatus): Promise<TemplateIngredientMapping[]> {
    const rows = this.db.prepare(
      `
        SELECT *
        FROM template_ingredient_mappings
        WHERE mapping_status = ?
          AND active = 1
        ORDER BY template_id ASC, template_version_id ASC, ingredient_name ASC
      `,
    ).all(status) as TemplateIngredientMappingRow[];
    return rows.map(mapMappingRow);
  }

  async listCandidatesForMapping(mappingId: number | string): Promise<TemplateIngredientMappingCandidate[]> {
    const rows = this.db.prepare(
      `
        SELECT *
        FROM template_ingredient_mapping_candidates
        WHERE template_ingredient_mapping_id = ?
        ORDER BY candidate_rank ASC, candidate_canonical_name ASC
      `,
    ).all(mappingId) as TemplateIngredientMappingCandidateRow[];
    return rows.map(mapCandidateRow);
  }

  listMappings(): TemplateIngredientMapping[] {
    const rows = this.db.prepare(
      'SELECT * FROM template_ingredient_mappings ORDER BY template_id ASC, template_version_id ASC, ingredient_name ASC',
    ).all() as TemplateIngredientMappingRow[];
    return rows.map(mapMappingRow);
  }

  listCandidates(): TemplateIngredientMappingCandidate[] {
    const rows = this.db.prepare(
      'SELECT * FROM template_ingredient_mapping_candidates ORDER BY template_ingredient_mapping_id ASC, candidate_rank ASC',
    ).all() as TemplateIngredientMappingCandidateRow[];
    return rows.map(mapCandidateRow);
  }

  private async getMappingById(id: number): Promise<TemplateIngredientMapping> {
    const row = this.db.prepare('SELECT * FROM template_ingredient_mappings WHERE id = ? LIMIT 1').get(id) as TemplateIngredientMappingRow;
    return mapMappingRow(row);
  }

  private async getCandidateById(id: number): Promise<TemplateIngredientMappingCandidate> {
    const row = this.db.prepare('SELECT * FROM template_ingredient_mapping_candidates WHERE id = ? LIMIT 1').get(id) as TemplateIngredientMappingCandidateRow;
    return mapCandidateRow(row);
  }
}

interface TemplateIngredientRow {
  template_id: number;
  template_name: string;
  template_category: string;
  template_version_id: number;
  template_version_number: number;
  template_version_source_hash: string;
  ingredient_name: string;
  qty: number;
  unit: string;
  sort_order: number;
}

interface TemplateIngredientMappingRow {
  id: number;
  template_id: number;
  template_version_id: number;
  template_ingredient_row_key: string;
  ingredient_name: string;
  normalized_ingredient_name: string;
  mapped_canonical_ingredient_id: number | null;
  mapping_status: TemplateIngredientMappingStatus;
  confidence_label: TemplateIngredientMapping['confidence_label'];
  match_reason: TemplateIngredientMapping['match_reason'];
  chosen_candidate_id: number | null;
  explanation_text: string;
  source_hash: string;
  active: number;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TemplateIngredientMappingCandidateRow {
  id: number;
  template_ingredient_mapping_id: number;
  candidate_canonical_ingredient_id: number;
  candidate_canonical_name: string;
  confidence_label: TemplateIngredientMappingCandidate['confidence_label'];
  match_reason: TemplateIngredientMappingCandidate['match_reason'];
  explanation_text: string;
  candidate_rank: number;
  active: number;
  created_at: string;
  updated_at: string;
}

interface TemplateIngredientMappingReviewEventRow {
  id: number;
  template_ingredient_mapping_id: number;
  action_type: string;
  actor_name: string | null;
  notes: string | null;
  created_at: string;
}

function mapMappingRow(row: TemplateIngredientMappingRow): TemplateIngredientMapping {
  return {
    id: row.id,
    template_id: row.template_id,
    template_version_id: row.template_version_id,
    template_ingredient_row_key: row.template_ingredient_row_key,
    ingredient_name: row.ingredient_name,
    normalized_ingredient_name: row.normalized_ingredient_name,
    mapped_canonical_ingredient_id: row.mapped_canonical_ingredient_id,
    mapping_status: row.mapping_status,
    confidence_label: row.confidence_label,
    match_reason: row.match_reason,
    chosen_candidate_id: row.chosen_candidate_id,
    explanation_text: row.explanation_text,
    source_hash: row.source_hash,
    active: row.active === 1,
    resolved_by: row.resolved_by,
    resolved_at: row.resolved_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapCandidateRow(row: TemplateIngredientMappingCandidateRow): TemplateIngredientMappingCandidate {
  return {
    id: row.id,
    template_ingredient_mapping_id: row.template_ingredient_mapping_id,
    candidate_canonical_ingredient_id: row.candidate_canonical_ingredient_id,
    candidate_canonical_name: row.candidate_canonical_name,
    confidence_label: row.confidence_label,
    match_reason: row.match_reason,
    explanation_text: row.explanation_text,
    candidate_rank: row.candidate_rank,
    active: row.active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapReviewEventRow(row: TemplateIngredientMappingReviewEventRow): TemplateIngredientMappingReviewEvent {
  return {
    id: row.id,
    template_ingredient_mapping_id: row.template_ingredient_mapping_id,
    action_type: row.action_type,
    actor_name: row.actor_name,
    notes: row.notes,
    created_at: row.created_at,
  };
}

function nullableEqual<T>(left: T | null, right: T | null): boolean {
  return left === right;
}

function candidateKey(candidateCanonicalIngredientId: number | string, matchReason: string): string {
  return `${candidateCanonicalIngredientId}:${matchReason}`;
}
