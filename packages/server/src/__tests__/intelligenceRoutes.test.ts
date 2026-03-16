import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import type { DerivedSignal, Recommendation } from '@fifoflow/shared';
import { initializeDb } from '../db.js';
import { SQLiteIntelligenceRepository } from '../intelligence/persistence/sqliteIntelligenceRepository.js';
import { SQLiteRecipeCostRepository } from '../intelligence/recipeCost/persistence/sqliteRecipeCostRepository.js';
import { createIntelligenceRoutes } from '../routes/intelligence.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const app = express();
  app.use(express.json());
  app.use('/api/intelligence', createIntelligenceRoutes(db));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  return { app, db };
}

function createSignal(overrides?: Partial<DerivedSignal>): DerivedSignal {
  return {
    id: overrides?.id ?? 'signal-1',
    signal_type: overrides?.signal_type ?? 'PRICE_INCREASE',
    subject_type: overrides?.subject_type ?? 'inventory_item',
    subject_id: overrides?.subject_id ?? 91,
    subject_key: overrides?.subject_key ?? 'vendor-item:7:91',
    severity_label: overrides?.severity_label ?? 'high',
    confidence_label: overrides?.confidence_label ?? 'Stable pattern',
    confidence_score: overrides?.confidence_score ?? 0.82,
    rule_version: overrides?.rule_version ?? 'price-intelligence/v1',
    window_start: overrides?.window_start ?? '2026-03-01T00:00:00.000Z',
    window_end: overrides?.window_end ?? '2026-03-10T00:00:00.000Z',
    observed_at: overrides?.observed_at ?? '2026-03-10T00:00:00.000Z',
    organization_id: overrides?.organization_id ?? 1,
    location_id: overrides?.location_id ?? 2,
    operation_unit_id: overrides?.operation_unit_id ?? null,
    storage_area_id: overrides?.storage_area_id ?? null,
    inventory_category_id: overrides?.inventory_category_id ?? null,
    inventory_item_id: overrides?.inventory_item_id ?? 91,
    recipe_id: overrides?.recipe_id ?? null,
    vendor_id: overrides?.vendor_id ?? 7,
    vendor_item_id: overrides?.vendor_item_id ?? 11,
    magnitude_value: overrides?.magnitude_value ?? 0.24,
    evidence_count: overrides?.evidence_count ?? 1,
    signal_payload: overrides?.signal_payload ?? {
      vendor_name: 'Sysco',
      inventory_item_name: 'Ahi Tuna',
      normalized_price_change_abs: 6.2,
      threshold_explainability: { fallback_used: false },
    },
    evidence: overrides?.evidence ?? [],
    last_confirmed_at: overrides?.last_confirmed_at ?? '2026-03-10T00:00:00.000Z',
    created_at: overrides?.created_at ?? '2026-03-10T00:00:00.000Z',
    updated_at: overrides?.updated_at ?? '2026-03-10T00:00:00.000Z',
  };
}

function createRecommendation(overrides?: Partial<Recommendation>): Recommendation {
  return {
    id: overrides?.id ?? 'recommendation-1',
    recommendation_type: overrides?.recommendation_type ?? 'REVIEW_VENDOR',
    rule_version: overrides?.rule_version ?? 'recommendation-synthesis/v1',
    subject_type: overrides?.subject_type ?? 'vendor',
    subject_id: overrides?.subject_id ?? 7,
    subject_key: overrides?.subject_key ?? 'REVIEW_VENDOR:vendor-item:7:91',
    status: overrides?.status ?? 'OPEN',
    severity_label: overrides?.severity_label ?? 'high',
    confidence_label: overrides?.confidence_label ?? 'Stable pattern',
    urgency_label: overrides?.urgency_label ?? 'THIS_WEEK',
    confidence_score: overrides?.confidence_score ?? 0.81,
    summary: overrides?.summary ?? 'Review Sysco pricing for Ahi Tuna.',
    organization_id: overrides?.organization_id ?? 1,
    location_id: overrides?.location_id ?? 2,
    operation_unit_id: overrides?.operation_unit_id ?? null,
    storage_area_id: overrides?.storage_area_id ?? null,
    inventory_item_id: overrides?.inventory_item_id ?? 91,
    recipe_id: overrides?.recipe_id ?? null,
    vendor_id: overrides?.vendor_id ?? 7,
    vendor_item_id: overrides?.vendor_item_id ?? 11,
    dedupe_key: overrides?.dedupe_key ?? 'REVIEW_VENDOR:vendor-item:7:91',
    superseded_by_recommendation_id: overrides?.superseded_by_recommendation_id ?? null,
    evidence_count: overrides?.evidence_count ?? 0,
    expected_benefit_payload: overrides?.expected_benefit_payload ?? { benefit_type: 'cost_stability' },
    operator_action_payload: overrides?.operator_action_payload ?? {
      assigned_role: 'Purchasing Owner',
      suggested_steps: ['Review the vendor path.'],
    },
    evidence: overrides?.evidence ?? [],
    opened_at: overrides?.opened_at ?? '2026-03-10T00:00:00.000Z',
    due_at: overrides?.due_at ?? null,
    closed_at: overrides?.closed_at ?? null,
    last_confirmed_at: overrides?.last_confirmed_at ?? '2026-03-10T00:00:00.000Z',
    created_at: overrides?.created_at ?? '2026-03-10T00:00:00.000Z',
    updated_at: overrides?.updated_at ?? '2026-03-10T00:00:00.000Z',
  };
}

describe('Intelligence routes', () => {
  let app: express.Express;
  let db: Database.Database;
  let repository: SQLiteIntelligenceRepository;
  let recipeCostRepository: SQLiteRecipeCostRepository;

  beforeEach(() => {
    ({ app, db } = createTestApp());
    repository = new SQLiteIntelligenceRepository(db);
    recipeCostRepository = new SQLiteRecipeCostRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns an operator brief with memo items and synthesized recommendations', async () => {
    await repository.upsertSignal(createSignal());
    const recommendation = await repository.upsertRecommendation(createRecommendation());
    await repository.attachRecommendationEvidence([
      {
        id: 'evidence-1',
        recommendation_id: recommendation.record.id,
        evidence_type: 'price_signal',
        evidence_ref_table: 'derived_signals',
        evidence_ref_id: '1',
        explanation_text: 'Qualifying price signal.',
        evidence_weight: 1,
        created_at: '2026-03-10T00:00:00.000Z',
      },
    ]);

    const res = await request(app).get('/api/intelligence/operator-brief?venue_id=2&days=14');

    expect(res.status).toBe(200);
    expect(res.body.counts.signal_count).toBe(1);
    expect(res.body.counts.active_recommendation_count).toBe(1);
    expect(res.body.top_priority_items).toHaveLength(1);
    expect(res.body.active_recommendations[0].recommendation_type).toBe('REVIEW_VENDOR');
  });

  it('refresh endpoint returns bounded job results even when the live datasets are sparse', async () => {
    const res = await request(app)
      .post('/api/intelligence/refresh')
      .send({ venue_id: 2, signal_lookback_days: 14, memo_window_days: 7 });

    expect(res.status).toBe(200);
    expect(res.body.jobs).toBeDefined();
    expect(Object.keys(res.body.jobs)).toEqual(
      expect.arrayContaining(['price', 'variance', 'recipe_cost', 'recipe_cost_drift', 'recommendations', 'weekly_memo']),
    );
    expect(res.body.operator_brief).toBeDefined();
  });

  it('returns signal detail with memo metadata and related recommendations', async () => {
    const signalResult = await repository.upsertSignal(createSignal());
    const recommendation = await repository.upsertRecommendation(createRecommendation());
    await repository.attachRecommendationEvidence([
      {
        id: 'evidence-2',
        recommendation_id: recommendation.record.id,
        evidence_type: 'price_signal',
        evidence_ref_table: 'derived_signals',
        evidence_ref_id: String(signalResult.record.id),
        explanation_text: 'Signal supports recommendation.',
        evidence_weight: 1,
        created_at: '2026-03-10T00:00:00.000Z',
      },
    ]);

    const res = await request(app).get(`/api/intelligence/signals/${signalResult.record.id}`);

    expect(res.status).toBe(200);
    expect(res.body.signal.id).toBe(signalResult.record.id);
    expect(res.body.memo_item.title).toBe('Price increase detected');
    expect(res.body.related_recommendations).toHaveLength(1);
    expect(res.body.related_recommendations[0].likely_owner).toBe('Purchasing Owner');
  });

  it('updates recommendation status and records a review event', async () => {
    const recommendation = await repository.upsertRecommendation(createRecommendation());

    const res = await request(app)
      .patch(`/api/intelligence/recommendations/${recommendation.record.id}/status`)
      .send({ status: 'REVIEWED', actor_name: 'Operator UI', notes: 'Checked vendor history.' });

    expect(res.status).toBe(200);
    expect(res.body.recommendation.status).toBe('REVIEWED');
    expect(res.body.review_events).toHaveLength(1);
    expect(res.body.review_events[0].from_status).toBe('OPEN');
    expect(res.body.review_events[0].to_status).toBe('REVIEWED');
  });

  it('returns freshness data across intelligence packs and recipe cost runs', async () => {
    const priceRun = await repository.startRun('price-intelligence-job', '2026-03-10T00:00:00.000Z');
    await repository.completeRun(priceRun.id, 'completed', {
      signals_created: 2,
      signals_updated: 1,
      patterns_created: 0,
      patterns_updated: 0,
      recommendations_created: 0,
      recommendations_updated: 0,
      recommendations_superseded: 0,
    }, '2026-03-10T00:10:00.000Z');

    const recipeRun = await recipeCostRepository.startRun('2026-03-10T01:00:00.000Z');
    await recipeCostRepository.completeRun(recipeRun.id, 'completed', {
      recipe_count: 2,
      snapshots_created: 2,
      snapshots_updated: 0,
      complete_snapshots: 1,
      partial_snapshots: 1,
      incomplete_snapshots: 0,
      missing_cost_resolutions: 0,
      stale_cost_resolutions: 0,
      ambiguous_cost_resolutions: 0,
      unit_mismatch_resolutions: 0,
    }, '2026-03-10T01:05:00.000Z');

    const res = await request(app).get('/api/intelligence/freshness');

    expect(res.status).toBe(200);
    expect(res.body.packs).toEqual(expect.arrayContaining([
      expect.objectContaining({ pack_key: 'price', last_run: expect.objectContaining({ job_type: 'price-intelligence-job' }) }),
      expect.objectContaining({ pack_key: 'recipe_cost', last_run: expect.objectContaining({ job_type: 'recipe-cost-job' }) }),
    ]));
  });

  it('runs a pack pipeline and returns a refreshed operator brief', async () => {
    const res = await request(app)
      .post('/api/intelligence/jobs/weekly_memo/run')
      .send({ venue_id: 2, signal_lookback_days: 14, memo_window_days: 7 });

    expect(res.status).toBe(200);
    expect(res.body.requested_pack).toBe('weekly_memo');
    expect(res.body.pipeline.packs_run).toEqual(['weekly_memo']);
    expect(res.body.operator_brief).toBeDefined();
    expect(Array.isArray(res.body.freshness)).toBe(true);
  });
});
