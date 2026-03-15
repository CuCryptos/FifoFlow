import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { DerivedSignal } from '@fifoflow/shared';
import { initializeDb } from '../db.js';
import {
  SQLiteIntelligenceRepository,
  SQLiteRecommendationSignalReadRepository,
  runRecommendationSynthesisJob,
} from '../intelligence/index.js';
import type { IntelligenceJobContext } from '../intelligence/types.js';

function createContext(overrides?: Partial<IntelligenceJobContext>): IntelligenceJobContext {
  return {
    scope: {
      organizationId: 1,
      locationId: 2,
      operationUnitId: 3,
    },
    window: {
      start: '2026-03-01T00:00:00.000Z',
      end: '2026-03-31T23:59:59.000Z',
    },
    ruleVersion: 'recommendation-synthesis/v1',
    now: '2026-03-31T12:00:00.000Z',
    ...overrides,
  };
}

function createSignal(overrides?: Partial<DerivedSignal>): DerivedSignal {
  const signalType = overrides?.signal_type ?? 'PRICE_VOLATILITY';
  const observedAt = overrides?.observed_at ?? '2026-03-20T00:00:00.000Z';

  return {
    id: `signal:${signalType}:${observedAt}`,
    signal_type: signalType,
    subject_type: overrides?.subject_type ?? 'inventory_item',
    subject_id: overrides?.subject_id ?? 91,
    subject_key: overrides?.subject_key ?? 'vendor-item:7:91',
    severity_label: overrides?.severity_label ?? 'high',
    confidence_label: overrides?.confidence_label ?? 'Stable pattern',
    confidence_score: overrides?.confidence_score ?? 0.81,
    rule_version: overrides?.rule_version ?? 'test-rule/v1',
    window_start: overrides?.window_start ?? '2026-03-01T00:00:00.000Z',
    window_end: overrides?.window_end ?? observedAt,
    observed_at: observedAt,
    organization_id: overrides?.organization_id ?? 1,
    location_id: overrides?.location_id ?? 2,
    operation_unit_id: overrides?.operation_unit_id ?? 3,
    storage_area_id: overrides?.storage_area_id ?? null,
    inventory_category_id: overrides?.inventory_category_id ?? null,
    inventory_item_id: overrides?.inventory_item_id ?? 91,
    recipe_id: overrides?.recipe_id ?? null,
    vendor_id: overrides?.vendor_id ?? 7,
    vendor_item_id: overrides?.vendor_item_id ?? 11,
    magnitude_value: overrides?.magnitude_value ?? 0.22,
    evidence_count: overrides?.evidence_count ?? 1,
    signal_payload: overrides?.signal_payload ?? {
      vendor_name: 'Sysco',
      inventory_item_name: 'Ahi Tuna',
      observation_count: 4,
      volatility_pct_range: 0.22,
      normalized_price_change_abs: 8.4,
      threshold_explainability: { fallback_used: false },
    },
    evidence: overrides?.evidence ?? [
      {
        source_table: 'derived_signals',
        source_primary_key: 'seed-evidence',
        source_type: 'seed',
        observed_at: observedAt,
      },
    ],
    last_confirmed_at: overrides?.last_confirmed_at ?? observedAt,
    created_at: overrides?.created_at ?? observedAt,
    updated_at: overrides?.updated_at ?? observedAt,
  };
}

describe('recommendation synthesis', () => {
  let db: Database.Database;
  let repository: SQLiteIntelligenceRepository;
  let signalRepository: SQLiteRecommendationSignalReadRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDb(db);
    repository = new SQLiteIntelligenceRepository(db);
    signalRepository = new SQLiteRecommendationSignalReadRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates REVIEW_VENDOR from qualifying price signals', async () => {
    await repository.upsertSignal(createSignal());

    const result = await runRecommendationSynthesisJob(createContext(), {
      repository,
      source: signalRepository,
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations?.[0]?.recommendation_type).toBe('REVIEW_VENDOR');
    expect(result.recommendations?.[0]?.operator_action_payload['assigned_role']).toBe('Purchasing Owner');
    expect(result.recommendations?.[0]?.evidence).toHaveLength(1);
    expect(result.recommendation_synthesis_summary?.recommendations_created).toBe(1);
  });

  it('creates REVIEW_RECIPE_MARGIN from recipe cost drift', async () => {
    await repository.upsertSignal(createSignal({
      signal_type: 'RECIPE_COST_DRIFT',
      subject_type: 'recipe',
      subject_id: 501,
      subject_key: 'recipe:501:version:3',
      inventory_item_id: null,
      recipe_id: 501,
      vendor_id: null,
      vendor_item_id: null,
      magnitude_value: 0.19,
      signal_payload: {
        recipe_id: 501,
        recipe_name: 'Seared Ahi Plate',
        recipe_type: 'dish',
        delta_cost: 5.75,
        delta_pct: 0.19,
        threshold_explainability: { fallback_used: false },
      },
    }));

    const result = await runRecommendationSynthesisJob(createContext(), {
      repository,
      source: signalRepository,
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations?.[0]?.recommendation_type).toBe('REVIEW_RECIPE_MARGIN');
    expect(result.recommendations?.[0]?.subject_type).toBe('recipe');
    expect(result.recommendations?.[0]?.operator_action_payload['assigned_role']).toBe('Unit Manager');
  });

  it('creates ENFORCE_CYCLE_COUNT from repeated inconsistency', async () => {
    await repository.upsertSignal(createSignal({
      signal_type: 'COUNT_INCONSISTENCY',
      subject_type: 'inventory_item',
      subject_id: 77,
      subject_key: 'inventory_item:77:location:2:operation_unit:3:storage_area:5',
      inventory_item_id: 77,
      vendor_id: null,
      vendor_item_id: null,
      severity_label: 'medium',
      magnitude_value: 3,
      signal_payload: {
        inventory_item_name: 'Sesame Oil',
        recurrence_count: 3,
        threshold_explainability: { fallback_used: false },
      },
    }));

    const result = await runRecommendationSynthesisJob(createContext(), {
      repository,
      source: signalRepository,
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations?.[0]?.recommendation_type).toBe('ENFORCE_CYCLE_COUNT');
    expect(result.recommendations?.[0]?.operator_action_payload['assigned_role']).toBe('Unit Manager');
  });

  it('creates INVESTIGATE_VARIANCE from a major single variance event', async () => {
    await repository.upsertSignal(createSignal({
      signal_type: 'COUNT_VARIANCE',
      subject_type: 'inventory_item',
      subject_id: 77,
      subject_key: 'inventory_item:77:location:2:operation_unit:3:storage_area:5',
      inventory_item_id: 77,
      vendor_id: null,
      vendor_item_id: null,
      severity_label: 'high',
      magnitude_value: 0.34,
      signal_payload: {
        inventory_item_name: 'Sesame Oil',
        variance_qty_abs: 4,
        variance_pct: 0.34,
        variance_cost_abs: 28,
        threshold_explainability: { fallback_used: false },
      },
    }));

    const result = await runRecommendationSynthesisJob(createContext(), {
      repository,
      source: signalRepository,
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations?.[0]?.recommendation_type).toBe('INVESTIGATE_VARIANCE');
    expect(result.recommendations?.[0]?.urgency_label).toBe('THIS_WEEK');
  });

  it('updates an existing recommendation instead of duplicating it on repeat synthesis', async () => {
    await repository.upsertSignal(createSignal());

    const first = await runRecommendationSynthesisJob(createContext(), {
      repository,
      source: signalRepository,
    });
    const second = await runRecommendationSynthesisJob(createContext({ now: '2026-03-31T18:00:00.000Z' }), {
      repository,
      source: signalRepository,
    });

    const active = await repository.fetchActiveRecommendationsBySubject({
      subject_type: 'vendor',
      subject_key: 'REVIEW_VENDOR:vendor-item:7:91',
      recommendation_type: 'REVIEW_VENDOR',
    });

    expect(first.recommendation_synthesis_summary?.recommendations_created).toBe(1);
    expect(second.recommendation_synthesis_summary?.recommendations_updated).toBe(1);
    expect(active).toHaveLength(1);
    expect(active[0]?.evidence).toHaveLength(1);
  });

  it('supersedes an existing recommendation when the case changes materially', async () => {
    await repository.upsertSignal(createSignal({
      signal_type: 'PRICE_VOLATILITY',
      severity_label: 'medium',
      confidence_label: 'Emerging pattern',
      confidence_score: 0.62,
      observed_at: '2026-03-15T00:00:00.000Z',
      signal_payload: {
        vendor_name: 'Sysco',
        inventory_item_name: 'Ahi Tuna',
        observation_count: 3,
        volatility_pct_range: 0.14,
        threshold_explainability: { fallback_used: false },
      },
    }));

    await runRecommendationSynthesisJob(createContext({
      window: { start: '2026-03-01T00:00:00.000Z', end: '2026-03-20T00:00:00.000Z' },
      now: '2026-03-20T00:00:00.000Z',
    }), {
      repository,
      source: signalRepository,
    });

    await repository.upsertSignal(createSignal({
      signal_type: 'PRICE_INCREASE',
      severity_label: 'critical',
      confidence_label: 'Stable pattern',
      confidence_score: 0.91,
      observed_at: '2026-03-28T00:00:00.000Z',
      magnitude_value: 0.31,
      signal_payload: {
        vendor_name: 'Sysco',
        inventory_item_name: 'Ahi Tuna',
        normalized_price_change_abs: 15.2,
        normalized_price_change_pct: 0.31,
        threshold_explainability: { fallback_used: false },
      },
    }));

    const second = await runRecommendationSynthesisJob(createContext({
      window: { start: '2026-03-21T00:00:00.000Z', end: '2026-03-31T23:59:59.000Z' },
      now: '2026-03-31T12:00:00.000Z',
    }), {
      repository,
      source: signalRepository,
    });

    const rows = db.prepare(`
      SELECT status, urgency_label
      FROM recommendations
      WHERE recommendation_type = 'REVIEW_VENDOR'
      ORDER BY id ASC
    `).all() as Array<{ status: string; urgency_label: string }>;

    expect(second.recommendation_synthesis_summary?.recommendations_superseded).toBe(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.status).toBe('SUPERSEDED');
    expect(rows[1]?.urgency_label).toBe('IMMEDIATE');
  });

  it('collapses ingredient driver and recipe drift evidence into one active recipe recommendation', async () => {
    await repository.upsertSignal(createSignal({
      signal_type: 'RECIPE_COST_DRIFT',
      subject_type: 'recipe',
      subject_id: 501,
      subject_key: 'recipe:501:version:3',
      inventory_item_id: null,
      recipe_id: 501,
      vendor_id: null,
      vendor_item_id: null,
      observed_at: '2026-03-18T00:00:00.000Z',
      signal_payload: {
        recipe_id: 501,
        recipe_name: 'Seared Ahi Plate',
        delta_cost: 3.2,
        threshold_explainability: { fallback_used: false },
      },
    }));
    await repository.upsertSignal(createSignal({
      signal_type: 'INGREDIENT_COST_DRIVER',
      subject_type: 'recipe',
      subject_id: 501,
      subject_key: 'recipe:501:version:3:ingredient:91',
      inventory_item_id: 91,
      recipe_id: 501,
      vendor_id: null,
      vendor_item_id: null,
      observed_at: '2026-03-19T00:00:00.000Z',
      signal_payload: {
        recipe_id: 501,
        recipe_name: 'Seared Ahi Plate',
        ingredient_name: 'Ahi Tuna',
        ingredient_delta_cost: 2.4,
        threshold_explainability: { fallback_used: false },
      },
    }));

    const result = await runRecommendationSynthesisJob(createContext(), {
      repository,
      source: signalRepository,
    });

    expect(result.recommendations?.filter((entry) => entry.recommendation_type === 'REVIEW_RECIPE_MARGIN')).toHaveLength(1);
    const active = await repository.fetchActiveRecommendationsBySubject({
      subject_type: 'recipe',
      subject_key: 'REVIEW_RECIPE_MARGIN:recipe:501:location:2:operation_unit:3',
      recommendation_type: 'REVIEW_RECIPE_MARGIN',
    });
    expect(active).toHaveLength(1);
    expect(active[0]?.evidence.length).toBe(2);
  });

  it('creates REVIEW_COUNT_DISCIPLINE for severe repeated inconsistency', async () => {
    await repository.upsertSignal(createSignal({
      signal_type: 'COUNT_INCONSISTENCY',
      subject_type: 'inventory_item',
      subject_id: 77,
      subject_key: 'inventory_item:77:location:2:operation_unit:3:storage_area:5',
      inventory_item_id: 77,
      vendor_id: null,
      vendor_item_id: null,
      severity_label: 'high',
      magnitude_value: 5,
      signal_payload: {
        inventory_item_name: 'Sesame Oil',
        recurrence_count: 5,
        threshold_explainability: { fallback_used: false },
      },
    }));

    const result = await runRecommendationSynthesisJob(createContext(), {
      repository,
      source: signalRepository,
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations?.[0]?.recommendation_type).toBe('REVIEW_COUNT_DISCIPLINE');
  });

  it('does not create recommendations when signal conditions are insufficient', async () => {
    await repository.upsertSignal(createSignal({
      signal_type: 'PRICE_INCREASE',
      severity_label: 'medium',
      magnitude_value: 0.06,
      signal_payload: {
        vendor_name: 'Sysco',
        inventory_item_name: 'Ahi Tuna',
        normalized_price_change_abs: 2.4,
        normalized_price_change_pct: 0.06,
        threshold_explainability: { fallback_used: false },
      },
    }));

    const result = await runRecommendationSynthesisJob(createContext(), {
      repository,
      source: signalRepository,
    });

    expect(result.recommendations).toHaveLength(0);
    expect(result.recommendation_synthesis_summary?.candidates_skipped).toBe(1);
    expect(result.notes).toContain('No persisted live signals met the current recommendation synthesis rules.');
  });
});
