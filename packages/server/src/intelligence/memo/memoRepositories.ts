import type Database from 'better-sqlite3';
import { initializeIntelligenceDb } from '../persistence/sqliteSchema.js';
import type { MemoSignalReadRepository } from './types.js';
import type { DerivedSignal, EvidenceReference } from '@fifoflow/shared';

export class SQLiteMemoSignalReadRepository implements MemoSignalReadRepository {
  constructor(private readonly db: Database.Database) {
    initializeIntelligenceDb(db);
  }

  async listSignalsForMemo(window: { start: string; end: string }, signalTypes?: string[]): Promise<DerivedSignal[]> {
    const params: Array<string | number | null> = [window.start, window.end];
    let signalTypeClause = '';

    if (signalTypes && signalTypes.length > 0) {
      signalTypeClause = ` AND signal_type IN (${signalTypes.map(() => '?').join(', ')})`;
      params.push(...signalTypes);
    }

    const rows = this.db.prepare(
      `
        SELECT *
        FROM derived_signals
        WHERE observed_at >= ?
          AND observed_at <= ?
          ${signalTypeClause}
        ORDER BY observed_at DESC, id DESC
      `,
    ).all(...params) as SignalRow[];

    return rows.map(signalRowToDomain);
  }
}

type SignalRow = {
  id: number;
  signal_type: DerivedSignal['signal_type'];
  rule_version: string;
  subject_type: DerivedSignal['subject_type'];
  subject_id: number;
  subject_key: string | null;
  organization_id: number | null;
  location_id: number | null;
  operation_unit_id: number | null;
  storage_area_id: number | null;
  inventory_category_id: number | null;
  inventory_item_id: number | null;
  recipe_id: number | null;
  vendor_id: number | null;
  vendor_item_id: number | null;
  severity_label: DerivedSignal['severity_label'];
  confidence_label: DerivedSignal['confidence_label'];
  confidence_score: number | null;
  window_start: string | null;
  window_end: string | null;
  observed_at: string;
  magnitude_value: number | null;
  evidence_count: number;
  signal_payload: string;
  last_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

function signalRowToDomain(row: SignalRow): DerivedSignal {
  const payload = parseJson(row.signal_payload);
  const evidence = Array.isArray(payload.evidence_refs) ? (payload.evidence_refs as EvidenceReference[]) : [];
  delete payload.evidence_refs;

  return {
    id: row.id,
    signal_type: row.signal_type,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    subject_key: row.subject_key,
    severity_label: row.severity_label,
    confidence_label: row.confidence_label,
    confidence_score: row.confidence_score,
    rule_version: row.rule_version,
    window_start: row.window_start,
    window_end: row.window_end,
    observed_at: row.observed_at,
    organization_id: row.organization_id,
    location_id: row.location_id,
    operation_unit_id: row.operation_unit_id,
    storage_area_id: row.storage_area_id,
    inventory_category_id: row.inventory_category_id,
    inventory_item_id: row.inventory_item_id,
    recipe_id: row.recipe_id,
    vendor_id: row.vendor_id,
    vendor_item_id: row.vendor_item_id,
    magnitude_value: row.magnitude_value,
    evidence_count: row.evidence_count,
    signal_payload: payload,
    evidence,
    last_confirmed_at: row.last_confirmed_at ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseJson(input: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(input);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
