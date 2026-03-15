import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initializeDb } from '../db.js';
import {
  SQLiteIntelligenceRepository,
  SQLiteMemoSignalReadRepository,
  executeWeeklyOperatingMemo,
  type WeeklyOperatingMemoDependencies,
} from '../intelligence/index.js';
import type { DerivedSignal, EvidenceReference } from '@fifoflow/shared';
import type { IntelligenceJobContext } from '../intelligence/types.js';

function createContext(overrides?: Partial<IntelligenceJobContext>): IntelligenceJobContext {
  return {
    scope: {
      organizationId: 1,
      locationId: 2,
      operationUnitId: 3,
      storageAreaId: 7,
    },
    window: {
      start: '2026-04-01T00:00:00.000Z',
      end: '2026-04-30T23:59:59.000Z',
    },
    ruleVersion: 'weekly-operating-memo/v1',
    now: '2026-04-30T12:00:00.000Z',
    ...overrides,
  };
}

function createDb(): {
  db: Database.Database;
  repository: SQLiteIntelligenceRepository;
  source: SQLiteMemoSignalReadRepository;
} {
  const db = new Database(':memory:');
  initializeDb(db);
  return {
    db,
    repository: new SQLiteIntelligenceRepository(db),
    source: new SQLiteMemoSignalReadRepository(db),
  };
}

function createEvidence(source: string, id: string, observedAt: string): EvidenceReference {
  return {
    source_table: source,
    source_primary_key: id,
    source_type: source,
    observed_at: observedAt,
    payload: {},
  };
}

function baseSignal(overrides: Partial<DerivedSignal> & Pick<DerivedSignal, 'id' | 'signal_type' | 'subject_type' | 'subject_id' | 'severity_label' | 'confidence_label' | 'rule_version' | 'observed_at' | 'signal_payload' | 'evidence'>): DerivedSignal {
  return {
    id: overrides.id,
    signal_type: overrides.signal_type,
    subject_type: overrides.subject_type,
    subject_id: overrides.subject_id,
    subject_key: overrides.subject_key ?? `${overrides.subject_type}:${overrides.subject_id}`,
    severity_label: overrides.severity_label,
    confidence_label: overrides.confidence_label,
    confidence_score: overrides.confidence_score ?? 0.8,
    rule_version: overrides.rule_version,
    window_start: overrides.window_start ?? overrides.observed_at,
    window_end: overrides.window_end ?? overrides.observed_at,
    observed_at: overrides.observed_at,
    organization_id: overrides.organization_id ?? 1,
    location_id: overrides.location_id ?? 2,
    operation_unit_id: overrides.operation_unit_id ?? 3,
    storage_area_id: overrides.storage_area_id ?? 7,
    inventory_category_id: overrides.inventory_category_id ?? null,
    inventory_item_id: overrides.inventory_item_id ?? (overrides.subject_type === 'inventory_item' ? overrides.subject_id : null),
    recipe_id: overrides.recipe_id ?? null,
    vendor_id: overrides.vendor_id ?? null,
    vendor_item_id: overrides.vendor_item_id ?? null,
    magnitude_value: overrides.magnitude_value ?? null,
    evidence_count: overrides.evidence_count ?? overrides.evidence.length,
    signal_payload: overrides.signal_payload,
    evidence: overrides.evidence,
    last_confirmed_at: overrides.last_confirmed_at ?? overrides.observed_at,
    created_at: overrides.created_at ?? overrides.observed_at,
    updated_at: overrides.updated_at ?? overrides.observed_at,
  };
}

async function persistSignals(repository: SQLiteIntelligenceRepository, signals: DerivedSignal[]): Promise<void> {
  for (const signal of signals) {
    await repository.upsertSignal(signal);
  }
}

async function runMemo(
  dbParts: ReturnType<typeof createDb>,
  context: IntelligenceJobContext = createContext(),
  overrides?: Partial<WeeklyOperatingMemoDependencies>,
) {
  return executeWeeklyOperatingMemo(context, {
    source: dbParts.source,
    repository: dbParts.repository,
    ...overrides,
  });
}

describe('weekly operating memo', () => {
  it('pulls signals from multiple packs and groups them into sections', async () => {
    const parts = createDb();
    try {
      await persistSignals(parts.repository, [
        baseSignal({
          id: 'price-1',
          signal_type: 'PRICE_INCREASE',
          subject_type: 'inventory_item',
          subject_id: 91,
          severity_label: 'high',
          confidence_label: 'Stable pattern',
          rule_version: 'price-intelligence/v1',
          observed_at: '2026-04-28T12:00:00.000Z',
          signal_payload: {
            inventory_item_name: 'Ahi Tuna',
            normalized_price_change_abs: 12,
            threshold_explainability: { fallback_used: false },
          },
          evidence: [createEvidence('vendor_prices', '501', '2026-04-28T12:00:00.000Z')],
          vendor_id: 7,
        }),
        baseSignal({
          id: 'recipe-1',
          signal_type: 'RECIPE_COST_DRIFT',
          subject_type: 'recipe',
          subject_id: 10,
          severity_label: 'critical',
          confidence_label: 'Stable pattern',
          rule_version: 'recipe-cost-drift/v1',
          observed_at: '2026-04-29T12:00:00.000Z',
          signal_payload: {
            recipe_name: 'Seared Ahi Plate',
            delta_cost: 18,
            threshold_explainability: { fallback_used: false },
          },
          evidence: [createEvidence('recipe_cost_snapshots', '9001', '2026-04-29T12:00:00.000Z')],
          recipe_id: 10,
        }),
        baseSignal({
          id: 'variance-1',
          signal_type: 'COUNT_VARIANCE',
          subject_type: 'inventory_item',
          subject_id: 44,
          severity_label: 'medium',
          confidence_label: 'Emerging pattern',
          rule_version: 'variance-intelligence/v1',
          observed_at: '2026-04-27T12:00:00.000Z',
          signal_payload: {
            inventory_item_name: 'Sesame Oil',
            variance_qty_abs: 2,
            threshold_explainability: { fallback_used: false },
          },
          evidence: [createEvidence('count_entries', '3001', '2026-04-27T12:00:00.000Z')],
        }),
      ]);

      const result = await runMemo(parts);
      const sectionKeys = result.weekly_operating_memo.sections.map((section) => section.key);

      expect(result.weekly_operating_memo.total_candidate_signals).toBe(3);
      expect(sectionKeys).toEqual([
        'top_priority',
        'price_watch',
        'recipe_cost_watch',
        'inventory_discipline',
        'needs_review',
        'standards_review',
      ]);
      expect(result.weekly_operating_memo.sections.find((section) => section.key === 'price_watch')?.items).toHaveLength(1);
      expect(result.weekly_operating_memo.sections.find((section) => section.key === 'recipe_cost_watch')?.items).toHaveLength(1);
      expect(result.weekly_operating_memo.sections.find((section) => section.key === 'inventory_discipline')?.items).toHaveLength(1);
    } finally {
      parts.db.close();
    }
  });

  it('ranks higher-severity and higher-urgency items first across packs', async () => {
    const parts = createDb();
    try {
      await persistSignals(parts.repository, [
        baseSignal({
          id: 'variance-1',
          signal_type: 'COUNT_VARIANCE',
          subject_type: 'inventory_item',
          subject_id: 44,
          severity_label: 'medium',
          confidence_label: 'Stable pattern',
          rule_version: 'variance-intelligence/v1',
          observed_at: '2026-04-29T12:00:00.000Z',
          signal_payload: { inventory_item_name: 'Sesame Oil', variance_qty_abs: 3, threshold_explainability: { fallback_used: false } },
          evidence: [createEvidence('count_entries', '3001', '2026-04-29T12:00:00.000Z')],
        }),
        baseSignal({
          id: 'recipe-1',
          signal_type: 'RECIPE_COST_DRIFT',
          subject_type: 'recipe',
          subject_id: 10,
          severity_label: 'critical',
          confidence_label: 'Stable pattern',
          rule_version: 'recipe-cost-drift/v1',
          observed_at: '2026-04-28T12:00:00.000Z',
          signal_payload: { recipe_name: 'Seared Ahi Plate', delta_cost: 22, threshold_explainability: { fallback_used: false } },
          evidence: [createEvidence('recipe_cost_snapshots', '9001', '2026-04-28T12:00:00.000Z')],
          recipe_id: 10,
        }),
      ]);

      const result = await runMemo(parts);
      expect(result.weekly_operating_memo.top_priority_items[0]?.signal_type).toBe('RECIPE_COST_DRIFT');
      expect(result.weekly_operating_memo.top_priority_items[0]?.urgency).toBe('IMMEDIATE');
    } finally {
      parts.db.close();
    }
  });

  it('boosts repeated volatility and inconsistency with recurrence in ranking', async () => {
    const parts = createDb();
    try {
      await persistSignals(parts.repository, [
        baseSignal({
          id: 'price-volatility',
          signal_type: 'PRICE_VOLATILITY',
          subject_type: 'inventory_item',
          subject_id: 91,
          severity_label: 'medium',
          confidence_label: 'Stable pattern',
          rule_version: 'price-intelligence/v1',
          observed_at: '2026-04-29T12:00:00.000Z',
          signal_payload: {
            inventory_item_name: 'Ahi Tuna',
            observation_count: 5,
            threshold_explainability: { fallback_used: false },
          },
          evidence: [createEvidence('vendor_prices', '501', '2026-04-29T12:00:00.000Z'), createEvidence('vendor_prices', '502', '2026-04-28T12:00:00.000Z')],
        }),
        baseSignal({
          id: 'variance-single',
          signal_type: 'COUNT_VARIANCE',
          subject_type: 'inventory_item',
          subject_id: 44,
          severity_label: 'medium',
          confidence_label: 'Stable pattern',
          rule_version: 'variance-intelligence/v1',
          observed_at: '2026-04-29T12:00:00.000Z',
          signal_payload: {
            inventory_item_name: 'Sesame Oil',
            variance_qty_abs: 2,
            threshold_explainability: { fallback_used: false },
          },
          evidence: [createEvidence('count_entries', '3001', '2026-04-29T12:00:00.000Z')],
        }),
      ]);

      const result = await runMemo(parts);
      expect(result.weekly_operating_memo.top_priority_items[0]?.signal_type).toBe('PRICE_VOLATILITY');
    } finally {
      parts.db.close();
    }
  });

  it('routes memo items by signal family', async () => {
    const parts = createDb();
    try {
      await persistSignals(parts.repository, [
        baseSignal({
          id: 'price-1',
          signal_type: 'PRICE_INCREASE',
          subject_type: 'inventory_item',
          subject_id: 91,
          severity_label: 'high',
          confidence_label: 'Stable pattern',
          rule_version: 'price-intelligence/v1',
          observed_at: '2026-04-28T12:00:00.000Z',
          signal_payload: { inventory_item_name: 'Ahi Tuna', normalized_price_change_abs: 9, threshold_explainability: { fallback_used: false } },
          evidence: [createEvidence('vendor_prices', '501', '2026-04-28T12:00:00.000Z')],
        }),
        baseSignal({
          id: 'recipe-1',
          signal_type: 'RECIPE_COST_DRIFT',
          subject_type: 'recipe',
          subject_id: 10,
          severity_label: 'high',
          confidence_label: 'Stable pattern',
          rule_version: 'recipe-cost-drift/v1',
          observed_at: '2026-04-29T12:00:00.000Z',
          signal_payload: { recipe_name: 'Seared Ahi Plate', delta_cost: 18, threshold_explainability: { fallback_used: false } },
          evidence: [createEvidence('recipe_cost_snapshots', '9001', '2026-04-29T12:00:00.000Z')],
          recipe_id: 10,
        }),
        baseSignal({
          id: 'variance-1',
          signal_type: 'COUNT_INCONSISTENCY',
          subject_type: 'inventory_item',
          subject_id: 44,
          severity_label: 'medium',
          confidence_label: 'Emerging pattern',
          rule_version: 'variance-intelligence/v1',
          observed_at: '2026-04-27T12:00:00.000Z',
          signal_payload: { inventory_item_name: 'Sesame Oil', recurrence_count: 3, threshold_explainability: { fallback_used: false } },
          evidence: [createEvidence('derived_signals', '3001', '2026-04-27T12:00:00.000Z')],
        }),
      ]);

      const result = await runMemo(parts);
      const owners = result.weekly_operating_memo.top_priority_items.map((item) => ({ type: item.signal_type, owner: item.likely_owner }));

      expect(owners).toEqual(expect.arrayContaining([
        { type: 'PRICE_INCREASE', owner: 'Purchasing Owner' },
        { type: 'RECIPE_COST_DRIFT', owner: 'Executive Approver' },
        { type: 'COUNT_INCONSISTENCY', owner: 'Unit Manager' },
      ]));
    } finally {
      parts.db.close();
    }
  });

  it('puts low-trust or fallback items into Needs Review', async () => {
    const parts = createDb();
    try {
      await persistSignals(parts.repository, [
        baseSignal({
          id: 'price-1',
          signal_type: 'PRICE_DROP',
          subject_type: 'inventory_item',
          subject_id: 91,
          severity_label: 'medium',
          confidence_label: 'Early signal',
          rule_version: 'price-intelligence/v1',
          observed_at: '2026-04-28T12:00:00.000Z',
          signal_payload: {
            inventory_item_name: 'Ahi Tuna',
            normalized_price_change_abs: 3,
            threshold_explainability: { fallback_used: true },
          },
          evidence: [createEvidence('vendor_prices', '501', '2026-04-28T12:00:00.000Z')],
        }),
      ]);

      const result = await runMemo(parts);
      const needsReview = result.weekly_operating_memo.sections.find((section) => section.key === 'needs_review');

      expect(needsReview?.items).toHaveLength(1);
      expect(needsReview?.items[0]?.policy_fallback_used).toBe(true);
    } finally {
      parts.db.close();
    }
  });

  it('returns an empty but valid memo payload for an empty window', async () => {
    const parts = createDb();
    try {
      const result = await runMemo(parts);

      expect(result.weekly_operating_memo.total_candidate_signals).toBe(0);
      expect(result.weekly_operating_memo.top_priority_items).toHaveLength(0);
      expect(result.weekly_operating_memo.sections).toHaveLength(6);
      expect(result.notes.some((note) => note.includes('No eligible live intelligence signals'))).toBe(true);
    } finally {
      parts.db.close();
    }
  });

  it('preserves ranking and evidence explanation metadata', async () => {
    const parts = createDb();
    try {
      await persistSignals(parts.repository, [
        baseSignal({
          id: 'variance-1',
          signal_type: 'COUNT_VARIANCE',
          subject_type: 'inventory_item',
          subject_id: 44,
          severity_label: 'high',
          confidence_label: 'Stable pattern',
          rule_version: 'variance-intelligence/v1',
          observed_at: '2026-04-29T12:00:00.000Z',
          signal_payload: {
            inventory_item_name: 'Sesame Oil',
            variance_cost_abs: 32,
            threshold_explainability: { fallback_used: false },
          },
          evidence: [
            createEvidence('count_entries', '3001', '2026-04-29T12:00:00.000Z'),
            createEvidence('vendor_prices', '502', '2026-04-29T12:00:00.000Z'),
          ],
        }),
      ]);

      const result = await runMemo(parts);
      const item = result.weekly_operating_memo.top_priority_items[0];

      expect(item.ranking_explanation.total_score).toBeGreaterThan(0);
      expect(item.ranking_explanation.components.impact).toBeGreaterThan(0);
      expect(item.evidence_references).toHaveLength(2);
      expect(item.short_explanation).toContain('counted away from expected quantity');
    } finally {
      parts.db.close();
    }
  });
});
