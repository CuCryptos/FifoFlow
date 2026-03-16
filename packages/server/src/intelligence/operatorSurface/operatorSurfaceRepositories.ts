import Database from 'better-sqlite3';
import type {
  DerivedSignal,
  EvidenceReference,
  IntelligenceRun,
  Recommendation,
  RecommendationEvidence,
  RecommendationStatus,
} from '@fifoflow/shared';
import { initializeIntelligenceDb } from '../persistence/sqliteSchema.js';
import { initializeRecipeCostDb } from '../recipeCost/persistence/sqliteSchema.js';
import { buildMemoCandidate } from '../memo/memoRankingEngine.js';
import type {
  PackFreshnessRecord,
  RecommendationDetailRecord,
  RecommendationReviewEvent,
  RecommendationStatusUpdateInput,
  SignalDetailRecord,
} from './types.js';

const ACTIVE_RECOMMENDATION_STATUSES = ['OPEN', 'REVIEWED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_REVIEW', 'APPROVED'] as const;

const PACK_DEFINITIONS = {
  price: {
    label: 'Price Intelligence',
    description: 'Vendor price movement and volatility detection.',
    downstream_packs: ['recommendations', 'weekly_memo'],
    freshnessHours: { fresh: 24, aging: 72 },
    runJobType: 'price-intelligence-job',
  },
  variance: {
    label: 'Variance Intelligence',
    description: 'Count variance and inconsistency detection.',
    downstream_packs: ['recommendations', 'weekly_memo'],
    freshnessHours: { fresh: 24, aging: 72 },
    runJobType: 'variance-intelligence-job',
  },
  recipe_cost: {
    label: 'Recipe Cost',
    description: 'Promoted recipe snapshot generation through scoped inventory and vendor lineage.',
    downstream_packs: ['recipe_cost_drift', 'recommendations', 'weekly_memo'],
    freshnessHours: { fresh: 48, aging: 120 },
    runJobType: null,
  },
  recipe_cost_drift: {
    label: 'Recipe Cost Drift',
    description: 'Trusted recipe snapshot comparison and drift signal generation.',
    downstream_packs: ['recommendations', 'weekly_memo'],
    freshnessHours: { fresh: 48, aging: 120 },
    runJobType: 'recipe-cost-drift-job',
  },
  recommendations: {
    label: 'Recommendations',
    description: 'Cross-pack recommendation synthesis from persisted signals.',
    downstream_packs: ['weekly_memo'],
    freshnessHours: { fresh: 24, aging: 72 },
    runJobType: 'recommendation-synthesis-job',
  },
  weekly_memo: {
    label: 'Weekly Memo',
    description: 'Memo aggregation, ranking, and routing for operator review.',
    downstream_packs: [],
    freshnessHours: { fresh: 24, aging: 72 },
    runJobType: 'weekly-operating-memo-job',
  },
} as const;

type PackKey = keyof typeof PACK_DEFINITIONS;

export class SQLiteOperatorSurfaceRepository {
  constructor(private readonly db: Database.Database) {
    initializeIntelligenceDb(db);
    initializeRecipeCostDb(db);
  }

  getSignalDetail(signalId: number, now: string): SignalDetailRecord | null {
    const signal = this.getSignalById(signalId);
    if (!signal) {
      return null;
    }

    return {
      signal,
      memo_item: buildMemoCandidate(signal, now),
      subject_signal_history: this.listSignalsBySubject(signal.subject_type, signal.subject_key ?? null, 8, signal.id),
      related_recommendations: this.listRecommendationsForSignal(signal, 8),
    };
  }

  listRecommendations(options?: {
    locationId?: number | null;
    statuses?: RecommendationStatus[];
    limit?: number;
  }): Recommendation[] {
    const statuses = options?.statuses?.length ? options.statuses : [...ACTIVE_RECOMMENDATION_STATUSES];
    const limit = options?.limit ?? 50;
    const rows = this.db.prepare(
      `
        SELECT *
        FROM recommendations
        WHERE status IN (${statuses.map(() => '?').join(', ')})
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
    ).all(...statuses, options?.locationId ?? null, options?.locationId ?? null, limit) as RecommendationRow[];

    return rows.map((row) => this.attachEvidence(recommendationRowToDomain(row)));
  }

  getRecommendationDetail(recommendationId: number): RecommendationDetailRecord | null {
    const recommendation = this.getRecommendationById(recommendationId);
    if (!recommendation) {
      return null;
    }

    return {
      recommendation,
      evidence_signals: this.listEvidenceSignalsForRecommendation(recommendationId),
      subject_signal_history: this.listSignalsBySubject(recommendation.subject_type, recommendation.subject_key ?? null, 8),
      review_events: this.listRecommendationReviewEvents(recommendationId),
    };
  }

  updateRecommendationStatus(input: RecommendationStatusUpdateInput): RecommendationDetailRecord | null {
    const existing = this.getRecommendationById(input.recommendation_id);
    if (!existing) {
      return null;
    }

    const nextClosedAt = input.status === 'DISMISSED' ? input.changed_at : null;
    this.db.prepare(
      `
        UPDATE recommendations
        SET status = ?,
            closed_at = ?,
            last_confirmed_at = ?,
            updated_at = ?
        WHERE id = ?
      `,
    ).run(
      input.status,
      nextClosedAt,
      input.changed_at,
      input.changed_at,
      input.recommendation_id,
    );

    this.db.prepare(
      `
        INSERT INTO recommendation_review_events (
          recommendation_id,
          action_type,
          from_status,
          to_status,
          actor_name,
          notes,
          created_at
        ) VALUES (?, 'STATUS_CHANGED', ?, ?, ?, ?, ?)
      `,
    ).run(
      input.recommendation_id,
      existing.status,
      input.status,
      input.actor_name ?? null,
      input.notes ?? null,
      input.changed_at,
    );

    return this.getRecommendationDetail(input.recommendation_id);
  }

  listPackFreshness(now: string): PackFreshnessRecord[] {
    const latestRuns = this.getLatestIntelligenceRuns();
    const latestRecipeCostRun = this.getLatestRecipeCostRun();

    return (Object.keys(PACK_DEFINITIONS) as PackKey[]).map((packKey) => {
      const definition = PACK_DEFINITIONS[packKey];
      const lastRun = definition.runJobType
        ? latestRuns.get(definition.runJobType) ?? null
        : latestRecipeCostRun;
      const ageHours = lastRun
        ? Math.max(0, (Date.parse(now) - Date.parse(lastRun.run_completed_at ?? lastRun.run_started_at)) / (1000 * 60 * 60))
        : null;
      const freshness_label = deriveFreshnessLabel(ageHours, definition.freshnessHours);

      return {
        pack_key: packKey,
        label: definition.label,
        description: definition.description,
        downstream_packs: [...definition.downstream_packs],
        last_run: lastRun,
        freshness_label,
        age_hours: ageHours == null ? null : Number(ageHours.toFixed(2)),
        metrics: this.buildRunMetrics(packKey, lastRun),
      };
    });
  }

  private buildRunMetrics(packKey: PackKey, run: IntelligenceRun | null): Record<string, number | string | null> {
    if (!run) {
      return {};
    }

    if (packKey === 'recipe_cost') {
      const recipeRun = run as IntelligenceRun & Record<string, number | string | null>;
      return {
        status: recipeRun.status as string,
        snapshots_created: numberOrNull(recipeRun.signals_created),
        snapshots_updated: numberOrNull(recipeRun.signals_updated),
      };
    }

    return {
      status: run.status,
      signals_created: run.signals_created,
      signals_updated: run.signals_updated,
      patterns_created: run.patterns_created,
      patterns_updated: run.patterns_updated,
      recommendations_created: run.recommendations_created,
      recommendations_updated: run.recommendations_updated,
      recommendations_superseded: run.recommendations_superseded,
    };
  }

  private getSignalById(id: number): DerivedSignal | null {
    const row = this.db.prepare('SELECT * FROM derived_signals WHERE id = ? LIMIT 1').get(id) as SignalRow | undefined;
    return row ? signalRowToDomain(row) : null;
  }

  private listSignalsBySubject(subjectType: string, subjectKey: string | null, limit: number, excludeId?: number | string): DerivedSignal[] {
    if (!subjectKey) {
      return [];
    }

    const rows = this.db.prepare(
      `
        SELECT *
        FROM derived_signals
        WHERE subject_type = ?
          AND subject_key = ?
          AND (? IS NULL OR id != ?)
        ORDER BY observed_at DESC, id DESC
        LIMIT ?
      `,
    ).all(subjectType, subjectKey, excludeId ?? null, excludeId ?? null, limit) as SignalRow[];

    return rows.map(signalRowToDomain);
  }

  private listRecommendationsForSignal(signal: DerivedSignal, limit: number): Recommendation[] {
    const byEvidence = this.db.prepare(
      `
        SELECT DISTINCT r.*
        FROM recommendations r
        JOIN recommendation_evidence e ON e.recommendation_id = r.id
        WHERE e.evidence_ref_table = 'derived_signals'
          AND e.evidence_ref_id = ?
        ORDER BY r.updated_at DESC, r.id DESC
        LIMIT ?
      `,
    ).all(String(signal.id), limit) as RecommendationRow[];

    const rows = [...byEvidence];
    if (signal.subject_key) {
      const bySubject = this.db.prepare(
        `
          SELECT *
          FROM recommendations
          WHERE subject_key = ?
            AND status IN (${ACTIVE_RECOMMENDATION_STATUSES.map(() => '?').join(', ')})
          ORDER BY updated_at DESC, id DESC
          LIMIT ?
        `,
      ).all(signal.subject_key, ...ACTIVE_RECOMMENDATION_STATUSES, limit) as RecommendationRow[];

      const seen = new Set(rows.map((row) => row.id));
      for (const row of bySubject) {
        if (!seen.has(row.id)) {
          rows.push(row);
          seen.add(row.id);
        }
      }
    }

    return rows.slice(0, limit).map((row) => this.attachEvidence(recommendationRowToDomain(row)));
  }

  private getRecommendationById(id: number): Recommendation | null {
    const row = this.db.prepare('SELECT * FROM recommendations WHERE id = ? LIMIT 1').get(id) as RecommendationRow | undefined;
    return row ? this.attachEvidence(recommendationRowToDomain(row)) : null;
  }

  private listEvidenceSignalsForRecommendation(recommendationId: number): DerivedSignal[] {
    const rows = this.db.prepare(
      `
        SELECT s.*
        FROM recommendation_evidence e
        JOIN derived_signals s
          ON e.evidence_ref_table = 'derived_signals'
         AND e.evidence_ref_id = CAST(s.id AS TEXT)
        WHERE e.recommendation_id = ?
        ORDER BY s.observed_at DESC, s.id DESC
      `,
    ).all(recommendationId) as SignalRow[];

    return rows.map(signalRowToDomain);
  }

  private listRecommendationReviewEvents(recommendationId: number): RecommendationReviewEvent[] {
    const rows = this.db.prepare(
      `
        SELECT *
        FROM recommendation_review_events
        WHERE recommendation_id = ?
        ORDER BY created_at DESC, id DESC
      `,
    ).all(recommendationId) as ReviewEventRow[];

    return rows.map((row) => ({
      id: row.id,
      recommendation_id: row.recommendation_id,
      action_type: 'STATUS_CHANGED',
      from_status: row.from_status,
      to_status: row.to_status,
      actor_name: row.actor_name,
      notes: row.notes,
      created_at: row.created_at,
    }));
  }

  private attachEvidence(recommendation: Recommendation): Recommendation {
    const rows = this.db.prepare(
      'SELECT * FROM recommendation_evidence WHERE recommendation_id = ? ORDER BY id ASC',
    ).all(recommendation.id) as RecommendationEvidenceRow[];

    return {
      ...recommendation,
      evidence: rows.map(recommendationEvidenceRowToDomain),
      evidence_count: Math.max(recommendation.evidence_count ?? 0, rows.length),
    };
  }

  private getLatestIntelligenceRuns(): Map<string, IntelligenceRun> {
    const rows = this.db.prepare(
      `
        SELECT *
        FROM intelligence_runs
        ORDER BY run_started_at DESC, id DESC
      `,
    ).all() as IntelligenceRunRow[];

    const grouped = new Map<string, IntelligenceRun>();
    for (const row of rows) {
      if (!grouped.has(row.job_type)) {
        grouped.set(row.job_type, intelligenceRunRowToDomain(row));
      }
    }
    return grouped;
  }

  private getLatestRecipeCostRun(): IntelligenceRun | null {
    const row = this.db.prepare(
      `
        SELECT *
        FROM recipe_cost_runs
        ORDER BY started_at DESC, id DESC
        LIMIT 1
      `,
    ).get() as RecipeCostRunRow | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      job_type: 'recipe-cost-job',
      run_started_at: row.started_at,
      run_completed_at: row.completed_at,
      signals_created: row.snapshots_created,
      signals_updated: row.snapshots_updated,
      patterns_created: 0,
      patterns_updated: 0,
      recommendations_created: 0,
      recommendations_updated: 0,
      recommendations_superseded: 0,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

function deriveFreshnessLabel(
  ageHours: number | null,
  thresholds: { fresh: number; aging: number },
): PackFreshnessRecord['freshness_label'] {
  if (ageHours == null) {
    return 'missing';
  }
  if (ageHours <= thresholds.fresh) {
    return 'fresh';
  }
  if (ageHours <= thresholds.aging) {
    return 'aging';
  }
  return 'stale';
}

function signalRowToDomain(row: SignalRow): DerivedSignal {
  const payload = parseJson(row.signal_payload);
  const evidence = Array.isArray(payload.evidence_refs) ? payload.evidence_refs as EvidenceReference[] : [];
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

function recommendationRowToDomain(row: RecommendationRow): Recommendation {
  return {
    id: row.id,
    recommendation_type: row.recommendation_type,
    rule_version: row.rule_version,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    subject_key: row.subject_key,
    status: row.status,
    severity_label: row.severity_label,
    confidence_label: row.confidence_label,
    urgency_label: row.urgency_label,
    confidence_score: row.confidence_score,
    summary: row.summary,
    organization_id: row.organization_id,
    location_id: row.location_id,
    operation_unit_id: row.operation_unit_id,
    storage_area_id: row.storage_area_id,
    inventory_item_id: row.inventory_item_id,
    recipe_id: row.recipe_id,
    vendor_id: row.vendor_id,
    vendor_item_id: row.vendor_item_id,
    dedupe_key: row.dedupe_key,
    superseded_by_recommendation_id: row.superseded_by_recommendation_id,
    evidence_count: row.evidence_count,
    expected_benefit_payload: parseJson(row.expected_benefit_payload),
    operator_action_payload: parseJson(row.operator_action_payload),
    evidence: [],
    opened_at: row.opened_at,
    due_at: row.due_at,
    closed_at: row.closed_at,
    last_confirmed_at: row.last_confirmed_at ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function recommendationEvidenceRowToDomain(row: RecommendationEvidenceRow): RecommendationEvidence {
  return {
    id: row.id,
    recommendation_id: row.recommendation_id,
    evidence_type: row.evidence_type,
    evidence_ref_table: row.evidence_ref_table,
    evidence_ref_id: row.evidence_ref_id,
    explanation_text: row.explanation_text,
    evidence_weight: row.evidence_weight,
    created_at: row.created_at,
  };
}

function intelligenceRunRowToDomain(row: IntelligenceRunRow): IntelligenceRun {
  return {
    id: row.id,
    job_type: row.job_type,
    run_started_at: row.run_started_at,
    run_completed_at: row.run_completed_at,
    signals_created: row.signals_created,
    signals_updated: row.signals_updated,
    patterns_created: row.patterns_created,
    patterns_updated: row.patterns_updated,
    recommendations_created: row.recommendations_created,
    recommendations_updated: row.recommendations_updated,
    recommendations_superseded: row.recommendations_superseded,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseJson(input: string | null): Record<string, unknown> {
  if (!input) {
    return {};
  }
  try {
    const parsed = JSON.parse(input);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

type RecommendationRow = {
  id: number;
  recommendation_type: Recommendation['recommendation_type'];
  rule_version: string;
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
  vendor_item_id: number | null;
  status: RecommendationStatus;
  severity_label: Recommendation['severity_label'];
  confidence_label: Recommendation['confidence_label'];
  urgency_label: Recommendation['urgency_label'];
  confidence_score: number | null;
  summary: string;
  evidence_count: number;
  expected_benefit_payload: string;
  operator_action_payload: string;
  dedupe_key: string | null;
  superseded_by_recommendation_id: number | null;
  opened_at: string;
  due_at: string | null;
  closed_at: string | null;
  last_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RecommendationEvidenceRow = {
  id: number;
  recommendation_id: number;
  evidence_type: string;
  evidence_ref_table: string;
  evidence_ref_id: string;
  explanation_text: string;
  evidence_weight: number;
  created_at: string;
};

type ReviewEventRow = {
  id: number;
  recommendation_id: number;
  from_status: RecommendationStatus | null;
  to_status: RecommendationStatus | null;
  actor_name: string | null;
  notes: string | null;
  created_at: string;
};

type IntelligenceRunRow = {
  id: number;
  job_type: string;
  run_started_at: string;
  run_completed_at: string | null;
  signals_created: number;
  signals_updated: number;
  patterns_created: number;
  patterns_updated: number;
  recommendations_created: number;
  recommendations_updated: number;
  recommendations_superseded: number;
  status: IntelligenceRun['status'];
  created_at: string;
  updated_at: string;
};

type RecipeCostRunRow = {
  id: number;
  started_at: string;
  completed_at: string | null;
  snapshots_created: number;
  snapshots_updated: number;
  complete_snapshots: number;
  partial_snapshots: number;
  incomplete_snapshots: number;
  status: IntelligenceRun['status'];
  notes: string | null;
  created_at: string;
  updated_at: string;
};
