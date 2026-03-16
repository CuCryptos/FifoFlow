import express from 'express';
import type Database from 'better-sqlite3';
import { createLegacySqlitePriceIntelligenceSource } from '../intelligence/priceRepositories.js';
import { runPriceIntelligenceJob } from '../intelligence/priceIntelligenceJob.js';
import { SQLiteIntelligenceRepository } from '../intelligence/persistence/sqliteIntelligenceRepository.js';
import { SQLiteVarianceReadRepository } from '../intelligence/variance/varianceRepositories.js';
import { runVarianceJob } from '../intelligence/variance/varianceJob.js';
import { SQLitePolicyRepository } from '../platform/policy/policyRepositories.js';
import { runRecipeCostJob } from '../intelligence/recipeCost/recipeCostJob.js';
import { SQLiteRecipeCostRepository } from '../intelligence/recipeCost/persistence/sqliteRecipeCostRepository.js';
import { runRecipeCostDriftJob } from '../intelligence/recipeCost/recipeCostDriftJob.js';
import { SQLiteOperationalRecipeCostReadRepository } from '../intelligence/recipeCost/recipeCostRepositories.js';
import { SQLiteRecommendationSignalReadRepository } from '../intelligence/recommendations/recommendationRepositories.js';
import { runRecommendationSynthesisJob } from '../intelligence/recommendations/recommendationSynthesisJob.js';
import { SQLiteMemoSignalReadRepository } from '../intelligence/memo/memoRepositories.js';
import { buildWeeklyOperatingMemoPayload } from '../intelligence/memo/weeklyOperatingMemoEngine.js';
import { rankMemoSignals } from '../intelligence/memo/memoRankingEngine.js';
import { runWeeklyOperatingMemoJob } from '../intelligence/memo/weeklyOperatingMemoJob.js';
import type { Recommendation } from '@fifoflow/shared';
import type { IntelligenceJobContext, IntelligenceJobResult } from '../intelligence/types.js';
import { SQLiteCanonicalInventoryRepository } from '../mapping/inventory/canonicalInventoryMappingRepositories.js';
import { SQLiteInventoryVendorRepository } from '../mapping/vendor/inventoryVendorMappingRepositories.js';
import { SQLiteOperatorSurfaceRepository } from '../intelligence/operatorSurface/operatorSurfaceRepositories.js';
import type { RecommendationStatus } from '@fifoflow/shared';

const RUNNABLE_PACKS = ['price', 'variance', 'recipe_cost', 'recipe_cost_drift', 'recommendations', 'weekly_memo'] as const;
type RunnablePack = (typeof RUNNABLE_PACKS)[number];
const MUTABLE_RECOMMENDATION_STATUSES: RecommendationStatus[] = ['OPEN', 'REVIEWED', 'ACTIVE', 'DISMISSED'];

export function createIntelligenceRoutes(db: Database.Database) {
  const router = express.Router();
  const operatorRepository = new SQLiteOperatorSurfaceRepository(db);

  router.get('/operator-brief', async (req, res, next) => {
    try {
      const context = buildIntelligenceContext(req.query, 7);
      const brief = await buildOperatorBrief(db, context);
      res.json(brief);
    } catch (error) {
      next(error);
    }
  });

  router.post('/refresh', async (req, res, next) => {
    try {
      const querySource = typeof req.body === 'object' && req.body !== null ? req.body as Record<string, unknown> : {};
      const signalLookbackDays = positiveNumber(querySource['signal_lookback_days']) ?? 30;
      const memoWindowDays = positiveNumber(querySource['memo_window_days']) ?? 7;
      const signalContext = buildIntelligenceContext(querySource, signalLookbackDays);
      const memoContext = buildIntelligenceContext(querySource, memoWindowDays);
      const intelligenceRepository = new SQLiteIntelligenceRepository(db);
      const policyRepository = new SQLitePolicyRepository(db);

      const jobs = {
        price: await safeRun('price', () => runPriceIntelligenceJob(signalContext, {
          source: createLegacySqlitePriceIntelligenceSource(db),
          repository: intelligenceRepository,
          policyRepository,
        })),
        variance: await safeRun('variance', () => runVarianceJob(signalContext, {
          source: new SQLiteVarianceReadRepository(db),
          repository: intelligenceRepository,
          policyRepository,
        })),
        recipe_cost: await safeRun('recipe_cost', () => runRecipeCostJob(signalContext, {
          repository: new SQLiteRecipeCostRepository(db),
          operationalRepository: new SQLiteOperationalRecipeCostReadRepository(db),
          inventoryRepository: new SQLiteCanonicalInventoryRepository(db),
          vendorRepository: new SQLiteInventoryVendorRepository(db),
        })),
        recipe_cost_drift: await safeRun('recipe_cost_drift', () => runRecipeCostDriftJob(signalContext, {
          recipeCostRepository: new SQLiteRecipeCostRepository(db),
          intelligenceRepository,
          policyRepository,
        })),
        recommendations: await safeRun('recommendations', () => runRecommendationSynthesisJob(signalContext, {
          source: new SQLiteRecommendationSignalReadRepository(db),
          repository: intelligenceRepository,
        })),
        weekly_memo: await safeRun('weekly_memo', () => runWeeklyOperatingMemoJob(memoContext, {
          source: new SQLiteMemoSignalReadRepository(db),
          repository: intelligenceRepository,
        })),
      };

      const operator_brief = await buildOperatorBrief(db, memoContext);
      res.json({
        refreshed_at: memoContext.now,
        jobs,
        operator_brief,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/freshness', async (req, res, next) => {
    try {
      const context = buildIntelligenceContext(req.query, 7);
      res.json({
        generated_at: context.now,
        packs: operatorRepository.listPackFreshness(context.now),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/jobs/:pack/run', async (req, res, next) => {
    try {
      const pack = req.params.pack as RunnablePack;
      if (!RUNNABLE_PACKS.includes(pack)) {
        res.status(404).json({ error: `Unknown intelligence pack '${req.params.pack}'.` });
        return;
      }

      const querySource = typeof req.body === 'object' && req.body !== null ? req.body as Record<string, unknown> : {};
      const signalLookbackDays = positiveNumber(querySource['signal_lookback_days']) ?? 30;
      const memoWindowDays = positiveNumber(querySource['memo_window_days']) ?? 7;
      const signalContext = buildIntelligenceContext(querySource, signalLookbackDays);
      const memoContext = buildIntelligenceContext(querySource, memoWindowDays);

      const pipeline = await runPackPipeline(db, pack, signalContext, memoContext);
      const operator_brief = await buildOperatorBrief(db, memoContext);
      const freshness = operatorRepository.listPackFreshness(memoContext.now);

      res.json({
        refreshed_at: memoContext.now,
        requested_pack: pack,
        pipeline,
        operator_brief,
        freshness,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/signals/:id', async (req, res, next) => {
    try {
      const signalId = positiveNumber(req.params.id);
      if (signalId == null) {
        res.status(400).json({ error: 'Signal id must be a positive number.' });
        return;
      }
      const context = buildIntelligenceContext(req.query, 7);
      const detail = operatorRepository.getSignalDetail(signalId, context.now);
      if (!detail) {
        res.status(404).json({ error: `Signal ${signalId} was not found.` });
        return;
      }
      res.json({
        ...detail,
        related_recommendations: detail.related_recommendations.map(buildRecommendationPayload),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/recommendations', async (req, res, next) => {
    try {
      const limit = positiveNumber(req.query.limit) ?? 50;
      const locationId = positiveNumber(req.query.venue_id);
      const statuses = parseRecommendationStatuses(req.query.statuses);
      const recommendations = operatorRepository.listRecommendations({
        locationId,
        statuses,
        limit,
      });
      res.json({ recommendations: recommendations.map(buildRecommendationPayload) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/recommendations/:id', async (req, res, next) => {
    try {
      const recommendationId = positiveNumber(req.params.id);
      if (recommendationId == null) {
        res.status(400).json({ error: 'Recommendation id must be a positive number.' });
        return;
      }
      const detail = operatorRepository.getRecommendationDetail(recommendationId);
      if (!detail) {
        res.status(404).json({ error: `Recommendation ${recommendationId} was not found.` });
        return;
      }
      res.json({
        ...detail,
        recommendation: buildRecommendationPayload(detail.recommendation),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/recommendations/:id/status', async (req, res, next) => {
    try {
      const recommendationId = positiveNumber(req.params.id);
      if (recommendationId == null) {
        res.status(400).json({ error: 'Recommendation id must be a positive number.' });
        return;
      }
      const targetStatus = typeof req.body?.status === 'string' ? req.body.status as RecommendationStatus : null;
      if (!targetStatus || !MUTABLE_RECOMMENDATION_STATUSES.includes(targetStatus)) {
        res.status(400).json({ error: `Status must be one of: ${MUTABLE_RECOMMENDATION_STATUSES.join(', ')}.` });
        return;
      }

      const detail = operatorRepository.updateRecommendationStatus({
        recommendation_id: recommendationId,
        status: targetStatus,
        actor_name: typeof req.body?.actor_name === 'string' ? req.body.actor_name : null,
        notes: typeof req.body?.notes === 'string' ? req.body.notes : null,
        changed_at: new Date().toISOString(),
      });

      if (!detail) {
        res.status(404).json({ error: `Recommendation ${recommendationId} was not found.` });
        return;
      }

      res.json({
        ...detail,
        recommendation: buildRecommendationPayload(detail.recommendation),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

async function buildOperatorBrief(db: Database.Database, context: IntelligenceJobContext) {
  const memoSource = new SQLiteMemoSignalReadRepository(db);
  const signals = await memoSource.listSignalsForMemo(context.window);
  const rankedItems = rankMemoSignals(signals, context.now);
  const memo = buildWeeklyOperatingMemoPayload(rankedItems, context);
  const activeRecommendations = listActiveRecommendations(db, context, 8);

  return {
    generated_at: context.now,
    memo_window: memo.memo_window,
    scope: {
      venue_id: context.scope.locationId ?? null,
      organization_id: context.scope.organizationId ?? null,
      operation_unit_id: context.scope.operationUnitId ?? null,
    },
    counts: {
      signal_count: rankedItems.length,
      active_recommendation_count: activeRecommendations.length,
      top_priority_count: memo.top_priority_items.length,
      needs_review_count: memo.sections.find((section) => section.key === 'needs_review')?.items.length ?? 0,
    },
    routing_summary: memo.routing_summary,
    top_priority_items: memo.top_priority_items,
    sections: memo.sections,
    active_recommendations: activeRecommendations,
    recent_signal_items: rankedItems.slice(0, 12),
    notes: memo.explanation_metadata.eligibility_notes,
  };
}

function listActiveRecommendations(db: Database.Database, context: IntelligenceJobContext, limit: number) {
  const rows = db.prepare(
    `
      SELECT *
      FROM recommendations
      WHERE status IN ('OPEN', 'REVIEWED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_REVIEW', 'APPROVED')
        AND rule_version LIKE 'recommendation-synthesis/%'
        AND (? IS NULL OR location_id = ?)
      ORDER BY
        CASE urgency_label
          WHEN 'IMMEDIATE' THEN 3
          WHEN 'THIS_WEEK' THEN 2
          ELSE 1
        END DESC,
        CASE severity_label
          WHEN 'critical' THEN 4
          WHEN 'high' THEN 3
          WHEN 'medium' THEN 2
          ELSE 1
        END DESC,
        updated_at DESC,
        id DESC
      LIMIT ?
    `,
  ).all(context.scope.locationId ?? null, context.scope.locationId ?? null, limit) as RecommendationRow[];

  const evidenceByRecommendationId = loadRecommendationEvidence(db, rows.map((row) => row.id));

  return rows.map((row) => {
    const expectedBenefit = parseJson(row.expected_benefit_payload);
    const operatorAction = parseJson(row.operator_action_payload);
    return {
      id: row.id,
      recommendation_type: row.recommendation_type,
      summary: row.summary,
      status: row.status,
      severity_label: row.severity_label,
      confidence_label: row.confidence_label,
      urgency_label: row.urgency_label,
      likely_owner: typeof operatorAction['assigned_role'] === 'string' ? operatorAction['assigned_role'] : 'Unit Manager',
      due_at: row.due_at,
      opened_at: row.opened_at,
      updated_at: row.updated_at,
      scope_summary: buildScopeSummary(row),
      subject_summary: buildRecommendationSubjectSummary(row),
      evidence_count: row.evidence_count,
      expected_benefit_payload: expectedBenefit,
      operator_action_payload: operatorAction,
      evidence: evidenceByRecommendationId.get(row.id) ?? [],
    };
  });
}

function loadRecommendationEvidence(db: Database.Database, recommendationIds: number[]) {
  const grouped = new Map<number, Array<{
    evidence_type: string;
    evidence_ref_table: string;
    evidence_ref_id: string;
    explanation_text: string;
    evidence_weight: number;
  }>>();

  if (recommendationIds.length === 0) {
    return grouped;
  }

  const rows = db.prepare(
    `
      SELECT recommendation_id, evidence_type, evidence_ref_table, evidence_ref_id, explanation_text, evidence_weight
      FROM recommendation_evidence
      WHERE recommendation_id IN (${recommendationIds.map(() => '?').join(', ')})
      ORDER BY recommendation_id ASC, id ASC
    `,
  ).all(...recommendationIds) as Array<{
    recommendation_id: number;
    evidence_type: string;
    evidence_ref_table: string;
    evidence_ref_id: string;
    explanation_text: string;
    evidence_weight: number;
  }>;

  for (const row of rows) {
    const list = grouped.get(row.recommendation_id) ?? [];
    list.push({
      evidence_type: row.evidence_type,
      evidence_ref_table: row.evidence_ref_table,
      evidence_ref_id: row.evidence_ref_id,
      explanation_text: row.explanation_text,
      evidence_weight: row.evidence_weight,
    });
    grouped.set(row.recommendation_id, list);
  }

  return grouped;
}

async function safeRun(name: string, work: () => Promise<IntelligenceJobResult>) {
  try {
    const result = await work();
    return {
      status: 'ok' as const,
      job: name,
      notes: result.notes,
      run_summary: result.run_summary ?? null,
      extra: summarizeJobResult(result),
    };
  } catch (error) {
    return {
      status: 'error' as const,
      job: name,
      notes: [error instanceof Error ? error.message : `Unknown ${name} job failure.`],
      run_summary: null,
      extra: null,
    };
  }
}

function summarizeJobResult(result: IntelligenceJobResult) {
  const extended = result as IntelligenceJobResult & Record<string, unknown>;
  return {
    signal_count: Array.isArray(result.signals) ? result.signals.length : 0,
    recommendation_count: Array.isArray(result.recommendations) ? result.recommendations.length : 0,
    note_count: Array.isArray(result.notes) ? result.notes.length : 0,
    recipe_cost_recipe_results: extended['recipe_cost_recipe_results'] ?? null,
    weekly_operating_memo_summary: extended['weekly_operating_memo_summary'] ?? null,
    recommendation_synthesis_summary: extended['recommendation_synthesis_summary'] ?? null,
    recipe_cost_summary: extended['recipe_cost_summary'] ?? null,
    recipe_cost_drift_summary: extended['recipe_cost_drift_summary'] ?? null,
    variance_summary: extended['variance_summary'] ?? null,
  };
}

async function runPackPipeline(
  db: Database.Database,
  pack: RunnablePack,
  signalContext: IntelligenceJobContext,
  memoContext: IntelligenceJobContext,
) {
  const pipeline = pipelineForPack(pack);
  const results: Record<string, Awaited<ReturnType<typeof safeRun>>> = {};

  for (const step of pipeline) {
    results[step] = await runNamedJob(db, step, step === 'weekly_memo' ? memoContext : signalContext);
  }

  return {
    packs_run: pipeline,
    jobs: results,
  };
}

function pipelineForPack(pack: RunnablePack): RunnablePack[] {
  switch (pack) {
    case 'price':
      return ['price', 'recommendations', 'weekly_memo'];
    case 'variance':
      return ['variance', 'recommendations', 'weekly_memo'];
    case 'recipe_cost':
      return ['recipe_cost', 'recipe_cost_drift', 'recommendations', 'weekly_memo'];
    case 'recipe_cost_drift':
      return ['recipe_cost_drift', 'recommendations', 'weekly_memo'];
    case 'recommendations':
      return ['recommendations', 'weekly_memo'];
    case 'weekly_memo':
    default:
      return ['weekly_memo'];
  }
}

async function runNamedJob(
  db: Database.Database,
  job: RunnablePack,
  context: IntelligenceJobContext,
) {
  const intelligenceRepository = new SQLiteIntelligenceRepository(db);
  const policyRepository = new SQLitePolicyRepository(db);

  switch (job) {
    case 'price':
      return safeRun('price', () => runPriceIntelligenceJob(context, {
        source: createLegacySqlitePriceIntelligenceSource(db),
        repository: intelligenceRepository,
        policyRepository,
      }));
    case 'variance':
      return safeRun('variance', () => runVarianceJob(context, {
        source: new SQLiteVarianceReadRepository(db),
        repository: intelligenceRepository,
        policyRepository,
      }));
    case 'recipe_cost':
      return safeRun('recipe_cost', () => runRecipeCostJob(context, {
        repository: new SQLiteRecipeCostRepository(db),
        operationalRepository: new SQLiteOperationalRecipeCostReadRepository(db),
        inventoryRepository: new SQLiteCanonicalInventoryRepository(db),
        vendorRepository: new SQLiteInventoryVendorRepository(db),
      }));
    case 'recipe_cost_drift':
      return safeRun('recipe_cost_drift', () => runRecipeCostDriftJob(context, {
        recipeCostRepository: new SQLiteRecipeCostRepository(db),
        intelligenceRepository,
        policyRepository,
      }));
    case 'recommendations':
      return safeRun('recommendations', () => runRecommendationSynthesisJob(context, {
        source: new SQLiteRecommendationSignalReadRepository(db),
        repository: intelligenceRepository,
      }));
    case 'weekly_memo':
      return safeRun('weekly_memo', () => runWeeklyOperatingMemoJob(context, {
        source: new SQLiteMemoSignalReadRepository(db),
        repository: intelligenceRepository,
      }));
  }
}

function buildIntelligenceContext(source: Record<string, unknown>, defaultDays: number): IntelligenceJobContext {
  const now = new Date().toISOString();
  const venueId = positiveNumber(source['venue_id']) ?? null;
  const lookbackDays = positiveNumber(source['days']) ?? defaultDays;
  const start = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const scope: IntelligenceJobContext['scope'] = {
    organizationId: 1,
  };
  if (venueId != null) {
    scope.locationId = venueId;
  }

  return {
    scope,
    window: {
      start,
      end: now,
    },
    ruleVersion: 'operator-brief/v1',
    now,
  };
}

function positiveNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function parseRecommendationStatuses(value: unknown): RecommendationStatus[] | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const statuses = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is RecommendationStatus => entry.length > 0);

  return statuses.length > 0 ? statuses : undefined;
}

function parseJson(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function buildScopeSummary(row: RecommendationRow) {
  return {
    organization_id: row.organization_id,
    location_id: row.location_id,
    operation_unit_id: row.operation_unit_id,
    storage_area_id: row.storage_area_id,
    inventory_item_id: row.inventory_item_id,
    recipe_id: row.recipe_id,
    vendor_id: row.vendor_id,
  };
}

function buildRecommendationSubjectSummary(row: RecommendationRow) {
  return {
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    subject_key: row.subject_key,
    inventory_item_id: row.inventory_item_id,
    recipe_id: row.recipe_id,
    vendor_id: row.vendor_id,
  };
}

function buildRecommendationPayload(recommendation: Recommendation) {
  const operatorAction = recommendation.operator_action_payload ?? {};
  return {
    ...recommendation,
    likely_owner: typeof operatorAction['assigned_role'] === 'string' ? operatorAction['assigned_role'] : 'Unit Manager',
    scope_summary: {
      organization_id: recommendation.organization_id,
      location_id: recommendation.location_id,
      operation_unit_id: recommendation.operation_unit_id,
      storage_area_id: recommendation.storage_area_id,
      inventory_item_id: recommendation.inventory_item_id,
      recipe_id: recommendation.recipe_id,
      vendor_id: recommendation.vendor_id,
    },
    subject_summary: {
      subject_type: recommendation.subject_type,
      subject_id: recommendation.subject_id,
      subject_key: recommendation.subject_key,
      inventory_item_id: recommendation.inventory_item_id,
      recipe_id: recommendation.recipe_id,
      vendor_id: recommendation.vendor_id,
    },
  };
}

type RecommendationRow = {
  id: number;
  recommendation_type: Recommendation['recommendation_type'];
  subject_type: Recommendation['subject_type'];
  subject_id: number;
  subject_key: string | null;
  organization_id: number | null;
  location_id: number | null;
  operation_unit_id: number | null;
  storage_area_id: number | null;
  inventory_item_id: number | null;
  recipe_id: number | null;
  vendor_id: number | null;
  status: Recommendation['status'];
  severity_label: Recommendation['severity_label'];
  confidence_label: Recommendation['confidence_label'];
  urgency_label: Recommendation['urgency_label'];
  summary: string;
  evidence_count: number;
  expected_benefit_payload: string;
  operator_action_payload: string;
  opened_at: string;
  due_at: string | null;
  updated_at: string;
};
