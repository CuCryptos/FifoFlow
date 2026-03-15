import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { DerivedSignal, PatternObservation, Recommendation } from '@fifoflow/shared';
import { initializeDb } from '../db.js';
import {
  DEFAULT_PRICE_THRESHOLD_CONFIG,
  SQLiteIntelligenceRepository,
  StaticPriceIntelligenceSource,
  executePriceIntelligence,
  resolveFallbackPriceThresholds,
  type NormalizedVendorPriceRecord,
} from '../intelligence/index.js';
import type { IntelligenceJobContext } from '../intelligence/types.js';
import { SQLitePolicyRepository, type PolicyScopeType } from '../platform/policy/index.js';

function createContext(overrides?: Partial<IntelligenceJobContext>): IntelligenceJobContext {
  return {
    scope: {
      organizationId: 1,
      locationId: 2,
      operationUnitId: 3,
    },
    window: {
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-03-31T00:00:00.000Z',
    },
    ruleVersion: 'price-intelligence/v1',
    now: '2026-03-31T12:00:00.000Z',
    ...overrides,
  };
}

function createPriceRecord(overrides: Partial<NormalizedVendorPriceRecord>): NormalizedVendorPriceRecord {
  const observedAt = overrides.observed_at ?? '2026-03-01T00:00:00.000Z';
  return {
    vendor_price_id: 1,
    vendor_item_key: '7::91::AHI TUNA::case::10::lb',
    vendor_id: 7,
    vendor_name: 'Sysco',
    inventory_item_id: 91,
    inventory_item_name: 'Ahi Tuna',
    category: 'Seafood',
    base_unit: 'lb',
    order_unit: 'case',
    order_unit_price: 100,
    qty_per_unit: 10,
    normalized_unit_cost: 10,
    observed_at: observedAt,
    source_table: 'vendor_prices',
    source_primary_key: String(overrides.vendor_price_id ?? 1),
    source_invoice_line_id: null,
    vendor_item_name: 'AHI TUNA',
    ...overrides,
  };
}

function createSignal(overrides?: Partial<DerivedSignal>): DerivedSignal {
  return {
    id: 'signal-1',
    signal_type: 'PRICE_VOLATILITY',
    subject_type: 'inventory_item',
    subject_id: 91,
    subject_key: '7::91::AHI TUNA::case::10::lb',
    severity_label: 'medium',
    confidence_label: 'Emerging pattern',
    confidence_score: 0.55,
    rule_version: 'price-intelligence/v1',
    window_start: '2026-03-01T00:00:00.000Z',
    window_end: '2026-03-10T00:00:00.000Z',
    observed_at: '2026-03-10T00:00:00.000Z',
    organization_id: 1,
    location_id: 2,
    operation_unit_id: 3,
    storage_area_id: null,
    inventory_category_id: null,
    inventory_item_id: 91,
    recipe_id: null,
    vendor_id: 7,
    vendor_item_id: 1,
    magnitude_value: 0.2,
    evidence_count: 2,
    signal_payload: { volatility_pct_range: 0.2 },
    evidence: [],
    last_confirmed_at: '2026-03-10T00:00:00.000Z',
    created_at: '2026-03-10T00:00:00.000Z',
    updated_at: '2026-03-10T00:00:00.000Z',
    ...overrides,
  };
}

function createPattern(overrides?: Partial<PatternObservation>): PatternObservation {
  return {
    id: 'pattern-1',
    pattern_type: 'UNSTABLE_VENDOR_PRICING',
    rule_version: 'price-intelligence/v1',
    subject_type: 'inventory_item',
    subject_id: 91,
    subject_key: '7::91::AHI TUNA::case::10::lb',
    status: 'Active',
    severity_label: 'high',
    confidence_label: 'Emerging pattern',
    confidence_score: 0.63,
    observation_count: 2,
    first_observed_at: '2026-03-01T00:00:00.000Z',
    last_observed_at: '2026-03-20T00:00:00.000Z',
    organization_id: 1,
    location_id: 2,
    operation_unit_id: 3,
    storage_area_id: null,
    inventory_item_id: 91,
    recipe_id: null,
    vendor_id: 7,
    vendor_item_id: 1,
    evidence_count: 2,
    signal_ids: [1, 2],
    pattern_payload: { recurrence_count: 2 },
    last_confirmed_at: '2026-03-20T00:00:00.000Z',
    created_at: '2026-03-20T00:00:00.000Z',
    updated_at: '2026-03-20T00:00:00.000Z',
    ...overrides,
  };
}

function createRecommendation(overrides?: Partial<Recommendation>): Recommendation {
  return {
    id: 'recommendation-1',
    recommendation_type: 'REVIEW_VENDOR',
    rule_version: 'price-intelligence/v1',
    subject_type: 'vendor',
    subject_id: 7,
    subject_key: '7::91::AHI TUNA::case::10::lb',
    status: 'OPEN',
    severity_label: 'high',
    confidence_label: 'Stable pattern',
    urgency_label: 'THIS_WEEK',
    confidence_score: 0.82,
    summary: 'Review Sysco pricing for Ahi Tuna.',
    organization_id: 1,
    location_id: 2,
    operation_unit_id: 3,
    storage_area_id: null,
    inventory_item_id: 91,
    recipe_id: null,
    vendor_id: 7,
    vendor_item_id: 1,
    dedupe_key: 'REVIEW_VENDOR|7::91::AHI TUNA::case::10::lb',
    superseded_by_recommendation_id: null,
    evidence_count: 0,
    expected_benefit_payload: { benefit_type: 'cost_stability' },
    operator_action_payload: { assigned_role: 'Purchasing Owner' },
    evidence: [],
    opened_at: '2026-03-20T00:00:00.000Z',
    due_at: null,
    closed_at: null,
    last_confirmed_at: '2026-03-20T00:00:00.000Z',
    created_at: '2026-03-20T00:00:00.000Z',
    updated_at: '2026-03-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('price intelligence persistence', () => {
  let db: Database.Database;
  let repository: SQLiteIntelligenceRepository;
  let policyRepository: SQLitePolicyRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDb(db);
    repository = new SQLiteIntelligenceRepository(db);
    policyRepository = new SQLitePolicyRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('signal upsert does not duplicate identical signals', async () => {
    const signal = createSignal();

    const first = await repository.upsertSignal(signal);
    const second = await repository.upsertSignal(signal);

    expect(first.action).toBe('created');
    expect(second.action).toBe('updated');
    expect(await repository.getLatestPriceSignals()).toHaveLength(1);
  });

  it('pattern aggregation updates recurrence count', async () => {
    await repository.upsertPattern(createPattern({ observation_count: 2, evidence_count: 2 }));
    const second = await repository.upsertPattern(
      createPattern({ id: 'pattern-2', observation_count: 4, evidence_count: 4, last_observed_at: '2026-03-28T00:00:00.000Z' }),
    );

    expect(second.action).toBe('updated');
    expect(second.record.observation_count).toBe(4);
    const patterns = await repository.getUnstableVendorPricingPatterns();
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.observation_count).toBe(4);
  });

  it('recommendation generation produces only one active recommendation', async () => {
    await repository.upsertRecommendation(createRecommendation());
    const second = await repository.upsertRecommendation(createRecommendation({ id: 'recommendation-2' }));

    expect(second.action).toBe('updated');
    const active = await repository.getActiveVendorReviewRecommendations();
    expect(active).toHaveLength(1);
  });

  it('recommendation supersession works', async () => {
    const first = await repository.upsertRecommendation(createRecommendation());
    const second = await repository.upsertRecommendation(
      createRecommendation({
        id: 'recommendation-2',
        urgency_label: 'IMMEDIATE',
        summary: 'Review Sysco pricing for Ahi Tuna immediately due to severe volatility.',
      }),
    );

    expect(second.action).toBe('created');
    expect(second.superseded_recommendation_id).toBe(first.record.id);

    const active = await repository.getActiveVendorReviewRecommendations();
    expect(active).toHaveLength(1);
    expect(active[0]?.urgency_label).toBe('IMMEDIATE');
    const supersededStatus = db.prepare('SELECT status FROM recommendations WHERE id = ?').get(first.record.id) as { status: string };
    expect(supersededStatus.status).toBe('SUPERSEDED');
  });

  it('evidence rows attach correctly', async () => {
    const recommendation = await repository.upsertRecommendation(createRecommendation());
    await repository.attachRecommendationEvidence([
      {
        id: 'e1',
        recommendation_id: recommendation.record.id,
        evidence_type: 'vendor_price_record',
        evidence_ref_table: 'vendor_prices',
        evidence_ref_id: '101',
        explanation_text: 'Vendor price 101 is part of the volatility window.',
        evidence_weight: 0.8,
        created_at: '2026-03-20T00:00:00.000Z',
      },
      {
        id: 'e2',
        recommendation_id: recommendation.record.id,
        evidence_type: 'pattern_summary',
        evidence_ref_table: 'pattern_observations',
        evidence_ref_id: '55',
        explanation_text: 'Pattern 55 confirmed repeated volatility.',
        evidence_weight: 1,
        created_at: '2026-03-20T00:00:00.000Z',
      },
    ]);

    const active = await repository.getActiveVendorReviewRecommendations();
    expect(active[0]?.evidence).toHaveLength(2);
  });

  it('price job writes outputs to repository and uses category override thresholds', async () => {
    const thresholds = resolveFallbackPriceThresholds('Seafood', DEFAULT_PRICE_THRESHOLD_CONFIG);
    expect(thresholds.percent_increase_threshold).toBe(0.04);

    await seedPolicy(policyRepository, {
      policy_key: 'price_drop_pct_threshold',
      scope_type: 'inventory_category',
      scope_ref_key: 'Seafood',
      value: 0.05,
      version_number: 1,
    });
    await seedPolicy(policyRepository, {
      policy_key: 'price_volatility_threshold',
      scope_type: 'inventory_category',
      scope_ref_key: 'Seafood',
      value: 0.1,
      version_number: 1,
    });
    await seedPolicy(policyRepository, {
      policy_key: 'price_min_evidence_count',
      scope_type: 'organization',
      scope_ref_id: 1,
      value: 3,
      version_number: 1,
    });
    await seedPolicy(policyRepository, {
      policy_key: 'price_recurrence_window_days',
      scope_type: 'organization',
      scope_ref_id: 1,
      value: 30,
      version_number: 1,
    });
    await seedPolicy(policyRepository, {
      policy_key: 'price_pattern_signal_threshold',
      scope_type: 'organization',
      scope_ref_id: 1,
      value: 2,
      version_number: 1,
    });
    await seedPolicy(policyRepository, {
      policy_key: 'price_immediate_pct_threshold',
      scope_type: 'organization',
      scope_ref_id: 1,
      value: 0.18,
      version_number: 1,
    });
    await seedPolicy(policyRepository, {
      policy_key: 'price_immediate_abs_threshold',
      scope_type: 'organization',
      scope_ref_id: 1,
      value: 2,
      version_number: 1,
    });
    await seedPolicy(policyRepository, {
      policy_key: 'price_volatility_immediate_pct_threshold',
      scope_type: 'organization',
      scope_ref_id: 1,
      value: 0.28,
      version_number: 1,
    });

    await repository.upsertSignal(
      createSignal({
        id: 'historical-vol-1',
        window_start: '2026-03-05T00:00:00.000Z',
        window_end: '2026-03-10T00:00:00.000Z',
        observed_at: '2026-03-10T00:00:00.000Z',
        created_at: '2026-03-10T00:00:00.000Z',
        updated_at: '2026-03-10T00:00:00.000Z',
        last_confirmed_at: '2026-03-10T00:00:00.000Z',
      }),
    );

    const source = new StaticPriceIntelligenceSource([
      createPriceRecord({ vendor_price_id: 1, observed_at: '2026-03-01T00:00:00.000Z', normalized_unit_cost: 10 }),
      createPriceRecord({ vendor_price_id: 2, observed_at: '2026-03-18T00:00:00.000Z', normalized_unit_cost: 10.5 }),
      createPriceRecord({ vendor_price_id: 3, observed_at: '2026-03-29T00:00:00.000Z', normalized_unit_cost: 9.2 }),
    ]);

    const result = await executePriceIntelligence(createContext(), { source, repository, policyRepository });

    expect(result.run_summary).toMatchObject({
      signals_created: 2,
      patterns_created: 1,
      recommendations_created: 1,
    });
    expect((await repository.getLatestPriceSignals()).map((signal) => signal.signal_type)).toEqual(
      expect.arrayContaining(['PRICE_DROP', 'PRICE_VOLATILITY']),
    );
    const signals = await repository.getLatestPriceSignals();
    const dropSignal = signals.find((signal) => signal.signal_type === 'PRICE_DROP');
    expect(dropSignal?.signal_payload['threshold_used']).toBe(0.05);
    expect((dropSignal?.signal_payload['threshold_explainability'] as { fallback_used: boolean }).fallback_used).toBe(false);
    expect(await repository.getUnstableVendorPricingPatterns()).toHaveLength(1);
    expect(await repository.getActiveVendorReviewRecommendations()).toHaveLength(1);
  });

  it('repeated job run remains idempotent', async () => {
    await repository.upsertSignal(
      createSignal({
        id: 'historical-vol-1',
        window_start: '2026-03-05T00:00:00.000Z',
        window_end: '2026-03-10T00:00:00.000Z',
        observed_at: '2026-03-10T00:00:00.000Z',
        created_at: '2026-03-10T00:00:00.000Z',
        updated_at: '2026-03-10T00:00:00.000Z',
        last_confirmed_at: '2026-03-10T00:00:00.000Z',
      }),
    );

    const source = new StaticPriceIntelligenceSource([
      createPriceRecord({ vendor_price_id: 1, observed_at: '2026-03-01T00:00:00.000Z', normalized_unit_cost: 10 }),
      createPriceRecord({ vendor_price_id: 2, observed_at: '2026-03-18T00:00:00.000Z', normalized_unit_cost: 13.1 }),
      createPriceRecord({ vendor_price_id: 3, observed_at: '2026-03-29T00:00:00.000Z', normalized_unit_cost: 9.4 }),
    ]);

    const first = await executePriceIntelligence(createContext(), { source, repository, policyRepository });
    const second = await executePriceIntelligence(createContext(), { source, repository, policyRepository });

    expect(first.run_summary?.signals_created).toBeGreaterThan(0);
    expect(second.run_summary).toMatchObject({
      signals_created: 0,
      patterns_created: 0,
      recommendations_created: 0,
    });
    expect(second.run_summary?.signals_updated).toBeGreaterThan(0);
    expect(second.run_summary?.patterns_updated).toBeGreaterThan(0);
    expect(second.run_summary?.recommendations_updated).toBeGreaterThan(0);

    expect(await repository.getLatestPriceSignals()).toHaveLength(3);
    expect(await repository.getUnstableVendorPricingPatterns()).toHaveLength(1);
    expect(await repository.getActiveVendorReviewRecommendations()).toHaveLength(1);
  });

  it('falls back to explicit defaults when no policy rows exist and records explainability metadata', async () => {
    await repository.upsertSignal(
      createSignal({
        id: 'historical-vol-1',
        window_start: '2026-03-05T00:00:00.000Z',
        window_end: '2026-03-10T00:00:00.000Z',
        observed_at: '2026-03-10T00:00:00.000Z',
        created_at: '2026-03-10T00:00:00.000Z',
        updated_at: '2026-03-10T00:00:00.000Z',
        last_confirmed_at: '2026-03-10T00:00:00.000Z',
      }),
    );

    const source = new StaticPriceIntelligenceSource([
      createPriceRecord({ vendor_price_id: 1, observed_at: '2026-03-01T00:00:00.000Z', normalized_unit_cost: 10 }),
      createPriceRecord({ vendor_price_id: 2, observed_at: '2026-03-18T00:00:00.000Z', normalized_unit_cost: 10.5 }),
      createPriceRecord({ vendor_price_id: 3, observed_at: '2026-03-29T00:00:00.000Z', normalized_unit_cost: 9.2 }),
    ]);

    await executePriceIntelligence(createContext(), { source, repository });

    const signals = await repository.getLatestPriceSignals();
    const dropSignal = signals.find((signal) => signal.signal_type === 'PRICE_DROP');
    const explainability = dropSignal?.signal_payload['threshold_explainability'] as { fallback_used: boolean; resolved_thresholds: Array<{ source: string }> };

    expect(dropSignal?.signal_payload['threshold_used']).toBe(0.08);
    expect(explainability.fallback_used).toBe(true);
    expect(explainability.resolved_thresholds.every((entry) => entry.source === 'fallback_default' || entry.source === 'policy')).toBe(true);
  });
});

async function seedPolicy(policyRepository: SQLitePolicyRepository, input: {
  policy_key: string;
  scope_type: PolicyScopeType;
  scope_ref_id?: number | null;
  scope_ref_key?: string | null;
  value: number;
  version_number: number;
  effective_start_at?: string;
  effective_end_at?: string | null;
}): Promise<void> {
  const definition = await policyRepository.createPolicyDefinition({
    policy_key: input.policy_key,
    display_name: input.policy_key,
    description: null,
    value_type: 'number',
    active: true,
  });
  const version = await policyRepository.createPolicyVersion({
    policy_definition_id: definition.id,
    version_number: input.version_number,
    effective_start_at: input.effective_start_at ?? '2026-01-01T00:00:00.000Z',
    effective_end_at: input.effective_end_at ?? null,
    active: true,
  });
  const scope = await policyRepository.createPolicyScope({
    policy_version_id: version.id,
    scope_type: input.scope_type,
    scope_ref_id: input.scope_ref_id ?? null,
    scope_ref_key: input.scope_ref_key ?? null,
    active: true,
  });
  await policyRepository.createPolicyValue({
    policy_scope_id: scope.id,
    value_json: JSON.stringify(input.value),
  });
}
