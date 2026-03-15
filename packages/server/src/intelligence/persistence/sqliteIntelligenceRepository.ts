import Database from 'better-sqlite3';
import type {
  DerivedSignal,
  EvidenceReference,
  IntelligenceRun,
  PatternObservation,
  Recommendation,
  RecommendationEvidence,
} from '@fifoflow/shared';
import { initializeIntelligenceDb } from './sqliteSchema.js';
import type {
  IntelligencePersistenceRepository,
  IntelligenceRunCounters,
  PatternLookup,
  RecommendationLookup,
  RecommendationUpsertResult,
  SignalLookup,
  UpsertResult,
} from './types.js';

const ACTIVE_PATTERN_STATUSES = ['Active', 'Monitoring'] as const;
const ACTIVE_RECOMMENDATION_STATUSES = ['OPEN', 'REVIEWED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_REVIEW', 'APPROVED'] as const;

export class SQLiteIntelligenceRepository implements IntelligencePersistenceRepository {
  constructor(private readonly db: Database.Database) {
    initializeIntelligenceDb(db);
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

  async startRun(jobType: string, startedAt: string): Promise<IntelligenceRun> {
    const result = this.db
      .prepare(
        `
          INSERT INTO intelligence_runs (job_type, run_started_at, status)
          VALUES (?, ?, 'running')
        `,
      )
      .run(jobType, startedAt);

    return this.getRunById(Number(result.lastInsertRowid));
  }

  async completeRun(
    runId: number | string,
    status: IntelligenceRun['status'],
    counters: IntelligenceRunCounters,
    completedAt: string,
  ): Promise<IntelligenceRun> {
    this.db
      .prepare(
        `
          UPDATE intelligence_runs
          SET run_completed_at = ?,
              signals_created = ?,
              signals_updated = ?,
              patterns_created = ?,
              patterns_updated = ?,
              recommendations_created = ?,
              recommendations_updated = ?,
              recommendations_superseded = ?,
              status = ?,
              updated_at = ?
          WHERE id = ?
        `,
      )
      .run(
        completedAt,
        counters.signals_created,
        counters.signals_updated,
        counters.patterns_created,
        counters.patterns_updated,
        counters.recommendations_created,
        counters.recommendations_updated,
        counters.recommendations_superseded,
        status,
        completedAt,
        runId,
      );

    return this.getRunById(Number(runId));
  }

  async upsertSignal(signal: DerivedSignal): Promise<UpsertResult<DerivedSignal>> {
    const magnitudeValue = signal.magnitude_value ?? deriveSignalMagnitude(signal);
    const evidenceCount = signal.evidence_count ?? signal.evidence.length;
    const signalPayload = serializeSignalPayload(signal);
    const existing = this.db
      .prepare(
        `
          SELECT *
          FROM derived_signals
          WHERE signal_type = ?
            AND ifnull(subject_key, '') = ifnull(?, '')
            AND ifnull(window_start, '') = ifnull(?, '')
            AND ifnull(window_end, '') = ifnull(?, '')
            AND ifnull(magnitude_value, 0) = ifnull(?, 0)
          LIMIT 1
        `,
      )
      .get(signal.signal_type, signal.subject_key ?? null, signal.window_start ?? null, signal.window_end ?? null, magnitudeValue) as SignalRow | undefined;

    if (existing) {
      const nextEvidenceCount = Math.max(existing.evidence_count, evidenceCount);
      this.db
        .prepare(
          `
            UPDATE derived_signals
            SET severity_label = ?,
                confidence_label = ?,
                confidence_score = ?,
                observed_at = ?,
                evidence_count = ?,
                signal_payload = ?,
                last_confirmed_at = ?,
                updated_at = ?
            WHERE id = ?
          `,
        )
        .run(
          signal.severity_label,
          signal.confidence_label,
          signal.confidence_score,
          signal.observed_at,
          nextEvidenceCount,
          signalPayload,
          signal.last_confirmed_at ?? signal.created_at ?? signal.observed_at,
          signal.updated_at ?? signal.created_at ?? signal.observed_at,
          existing.id,
        );

      return {
        action: 'updated',
        record: this.getSignalById(existing.id),
      };
    }

    const result = this.db
      .prepare(
        `
          INSERT INTO derived_signals (
            signal_type,
            rule_version,
            subject_type,
            subject_id,
            subject_key,
            organization_id,
            location_id,
            operation_unit_id,
            storage_area_id,
            inventory_category_id,
            inventory_item_id,
            recipe_id,
            vendor_id,
            vendor_item_id,
            severity_label,
            confidence_label,
            confidence_score,
            window_start,
            window_end,
            observed_at,
            magnitude_value,
            evidence_count,
            signal_payload,
            last_confirmed_at,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        signal.signal_type,
        signal.rule_version,
        signal.subject_type,
        signal.subject_id,
        signal.subject_key ?? null,
        signal.organization_id,
        signal.location_id,
        signal.operation_unit_id,
        signal.storage_area_id,
        signal.inventory_category_id,
        signal.inventory_item_id,
        signal.recipe_id,
        signal.vendor_id,
        signal.vendor_item_id,
        signal.severity_label,
        signal.confidence_label,
        signal.confidence_score,
        signal.window_start,
        signal.window_end,
        signal.observed_at,
        magnitudeValue,
        evidenceCount,
        signalPayload,
        signal.last_confirmed_at ?? signal.created_at ?? signal.observed_at,
        signal.created_at ?? signal.observed_at,
        signal.updated_at ?? signal.created_at ?? signal.observed_at,
      );

    return {
      action: 'created',
      record: this.getSignalById(Number(result.lastInsertRowid)),
    };
  }

  async upsertPattern(pattern: PatternObservation): Promise<UpsertResult<PatternObservation>> {
    const existing = this.db
      .prepare(
        `
          SELECT *
          FROM pattern_observations
          WHERE pattern_type = ?
            AND ifnull(subject_key, '') = ifnull(?, '')
            AND status IN ('Active', 'Monitoring')
          LIMIT 1
        `,
      )
      .get(pattern.pattern_type, pattern.subject_key ?? null) as PatternRow | undefined;

    const payload = serializePatternPayload(pattern);
    const evidenceCount = pattern.evidence_count ?? inferPatternEvidenceCount(pattern);

    if (existing) {
      const firstObservedAt = minDate(existing.first_observed_at, pattern.first_observed_at);
      const lastObservedAt = maxDate(existing.last_observed_at, pattern.last_observed_at);
      const observationCount = Math.max(existing.observation_count, pattern.observation_count);
      const nextEvidenceCount = Math.max(existing.evidence_count, evidenceCount);

      this.db
        .prepare(
          `
            UPDATE pattern_observations
            SET status = ?,
                severity_label = ?,
                confidence_label = ?,
                confidence_score = ?,
                observation_count = ?,
                evidence_count = ?,
                first_observed_at = ?,
                last_observed_at = ?,
                pattern_payload = ?,
                last_confirmed_at = ?,
                updated_at = ?
            WHERE id = ?
          `,
        )
        .run(
          pattern.status,
          pattern.severity_label,
          pattern.confidence_label,
          pattern.confidence_score,
          observationCount,
          nextEvidenceCount,
          firstObservedAt,
          lastObservedAt,
          payload,
          pattern.last_confirmed_at ?? pattern.updated_at ?? pattern.last_observed_at ?? pattern.created_at,
          pattern.updated_at ?? pattern.last_observed_at ?? pattern.created_at,
          existing.id,
        );

      return {
        action: 'updated',
        record: this.getPatternById(existing.id),
      };
    }

    const result = this.db
      .prepare(
        `
          INSERT INTO pattern_observations (
            pattern_type,
            rule_version,
            subject_type,
            subject_id,
            subject_key,
            organization_id,
            location_id,
            operation_unit_id,
            storage_area_id,
            inventory_item_id,
            recipe_id,
            vendor_id,
            vendor_item_id,
            status,
            severity_label,
            confidence_label,
            confidence_score,
            observation_count,
            evidence_count,
            first_observed_at,
            last_observed_at,
            pattern_payload,
            last_confirmed_at,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        pattern.pattern_type,
        pattern.rule_version ?? 'unknown',
        pattern.subject_type,
        pattern.subject_id,
        pattern.subject_key ?? null,
        pattern.organization_id,
        pattern.location_id,
        pattern.operation_unit_id,
        pattern.storage_area_id,
        pattern.inventory_item_id,
        pattern.recipe_id,
        pattern.vendor_id,
        pattern.vendor_item_id,
        pattern.status,
        pattern.severity_label,
        pattern.confidence_label,
        pattern.confidence_score,
        pattern.observation_count,
        evidenceCount,
        pattern.first_observed_at,
        pattern.last_observed_at,
        payload,
        pattern.last_confirmed_at ?? pattern.updated_at ?? pattern.last_observed_at ?? pattern.created_at,
        pattern.created_at ?? pattern.last_observed_at,
        pattern.updated_at ?? pattern.last_observed_at ?? pattern.created_at,
      );

    return {
      action: 'created',
      record: this.getPatternById(Number(result.lastInsertRowid)),
    };
  }

  async upsertRecommendation(recommendation: Recommendation): Promise<RecommendationUpsertResult> {
    const existing = this.db
      .prepare(
        `
          SELECT *
          FROM recommendations
          WHERE recommendation_type = ?
            AND ifnull(subject_key, '') = ifnull(?, '')
            AND status IN ('OPEN', 'REVIEWED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_REVIEW', 'APPROVED')
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        `,
      )
      .get(recommendation.recommendation_type, recommendation.subject_key ?? null) as RecommendationRow | undefined;

    const evidenceCount = recommendation.evidence_count ?? recommendation.evidence.length;
    const expectedBenefitPayload = stringifyJson(recommendation.expected_benefit_payload);
    const operatorActionPayload = stringifyJson(recommendation.operator_action_payload);

    if (existing) {
      const existingRecommendation = recommendationRowToDomain(existing);
      if (isMaterialRecommendationChange(existingRecommendation, recommendation)) {
        this.db
          .prepare(
            `UPDATE recommendations
             SET status = 'SUPERSEDED',
                 last_confirmed_at = ?,
                 updated_at = ?
             WHERE id = ?`,
          )
          .run(
            recommendation.created_at ?? recommendation.opened_at,
            recommendation.created_at ?? recommendation.opened_at,
            existing.id,
          );
        const newRecommendation = this.insertRecommendation(recommendation, evidenceCount, expectedBenefitPayload, operatorActionPayload);
        await this.supersedeRecommendation(existing.id, newRecommendation.id, recommendation.created_at ?? recommendation.opened_at);
        return {
          action: 'created',
          record: newRecommendation,
          superseded_recommendation_id: existing.id,
        };
      }

      const nextEvidenceCount = Math.max(existing.evidence_count, evidenceCount);
      this.db
        .prepare(
          `
            UPDATE recommendations
            SET status = ?,
                severity_label = ?,
                confidence_label = ?,
                urgency_label = ?,
                confidence_score = ?,
                summary = ?,
                evidence_count = ?,
                expected_benefit_payload = ?,
                operator_action_payload = ?,
                due_at = ?,
                last_confirmed_at = ?,
                updated_at = ?
            WHERE id = ?
          `,
        )
        .run(
          recommendation.status,
          recommendation.severity_label,
          recommendation.confidence_label,
          recommendation.urgency_label,
          recommendation.confidence_score,
          recommendation.summary,
          nextEvidenceCount,
          expectedBenefitPayload,
          operatorActionPayload,
          recommendation.due_at,
          recommendation.last_confirmed_at ?? recommendation.updated_at ?? recommendation.opened_at,
          recommendation.updated_at ?? recommendation.opened_at,
          existing.id,
        );

      return {
        action: 'updated',
        record: this.getRecommendationById(existing.id),
      };
    }

    return {
      action: 'created',
      record: this.insertRecommendation(recommendation, evidenceCount, expectedBenefitPayload, operatorActionPayload),
    };
  }

  async supersedeRecommendation(oldId: number | string, newId: number | string, supersededAt: string): Promise<void> {
    this.db
      .prepare(
        `
          UPDATE recommendations
          SET status = 'SUPERSEDED',
              superseded_by_recommendation_id = ?,
              last_confirmed_at = ?,
              updated_at = ?
          WHERE id = ?
        `,
      )
      .run(newId, supersededAt, supersededAt, oldId);
  }

  async attachRecommendationEvidence(evidence: RecommendationEvidence[]): Promise<number> {
    const insert = this.db.prepare(
      `
        INSERT OR IGNORE INTO recommendation_evidence (
          recommendation_id,
          evidence_type,
          evidence_ref_table,
          evidence_ref_id,
          explanation_text,
          evidence_weight,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    );

    let inserted = 0;
    for (const row of evidence) {
      const result = insert.run(
        row.recommendation_id,
        row.evidence_type,
        row.evidence_ref_table,
        row.evidence_ref_id,
        row.explanation_text,
        row.evidence_weight,
        row.created_at ?? new Date().toISOString(),
      );
      inserted += result.changes;
    }
    return inserted;
  }

  async fetchActiveSignalsBySubject(lookup: SignalLookup): Promise<DerivedSignal[]> {
    const rows = this.db
      .prepare(
        `
          SELECT *
          FROM derived_signals
          WHERE subject_type = ?
            AND ifnull(subject_key, '') = ifnull(?, '')
            AND (? IS NULL OR signal_type = ?)
            AND (? IS NULL OR observed_at >= ?)
          ORDER BY observed_at DESC, id DESC
        `,
      )
      .all(
        lookup.subject_type,
        lookup.subject_key,
        lookup.signal_type ?? null,
        lookup.signal_type ?? null,
        lookup.observed_since ?? null,
        lookup.observed_since ?? null,
      ) as SignalRow[];

    return rows.map(signalRowToDomain);
  }

  async fetchActivePatternsBySubject(lookup: PatternLookup): Promise<PatternObservation[]> {
    const rows = this.db
      .prepare(
        `
          SELECT *
          FROM pattern_observations
          WHERE subject_type = ?
            AND ifnull(subject_key, '') = ifnull(?, '')
            AND status IN ('Active', 'Monitoring')
            AND (? IS NULL OR pattern_type = ?)
          ORDER BY updated_at DESC, id DESC
        `,
      )
      .all(lookup.subject_type, lookup.subject_key, lookup.pattern_type ?? null, lookup.pattern_type ?? null) as PatternRow[];

    return rows.map(patternRowToDomain);
  }

  async fetchActiveRecommendationsBySubject(lookup: RecommendationLookup): Promise<Recommendation[]> {
    const rows = this.db
      .prepare(
        `
          SELECT *
          FROM recommendations
          WHERE subject_type = ?
            AND ifnull(subject_key, '') = ifnull(?, '')
            AND status IN ('OPEN', 'REVIEWED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_REVIEW', 'APPROVED')
            AND (? IS NULL OR recommendation_type = ?)
          ORDER BY updated_at DESC, id DESC
        `,
      )
      .all(
        lookup.subject_type,
        lookup.subject_key,
        lookup.recommendation_type ?? null,
        lookup.recommendation_type ?? null,
      ) as RecommendationRow[];

    return this.attachEvidence(rows.map(recommendationRowToDomain));
  }

  async getLatestPriceSignals(limit = 20): Promise<DerivedSignal[]> {
    const rows = this.db
      .prepare(
        `
          SELECT *
          FROM derived_signals
          WHERE signal_type IN ('PRICE_INCREASE', 'PRICE_DROP', 'PRICE_VOLATILITY')
          ORDER BY observed_at DESC, id DESC
          LIMIT ?
        `,
      )
      .all(limit) as SignalRow[];
    return rows.map(signalRowToDomain);
  }

  async getUnstableVendorPricingPatterns(limit = 20): Promise<PatternObservation[]> {
    const rows = this.db
      .prepare(
        `
          SELECT *
          FROM pattern_observations
          WHERE pattern_type = 'UNSTABLE_VENDOR_PRICING'
            AND status IN ('Active', 'Monitoring')
          ORDER BY updated_at DESC, id DESC
          LIMIT ?
        `,
      )
      .all(limit) as PatternRow[];
    return rows.map(patternRowToDomain);
  }

  async getActiveVendorReviewRecommendations(limit = 20): Promise<Recommendation[]> {
    const rows = this.db
      .prepare(
        `
          SELECT *
          FROM recommendations
          WHERE recommendation_type = 'REVIEW_VENDOR'
            AND status IN ('OPEN', 'REVIEWED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_REVIEW', 'APPROVED')
          ORDER BY updated_at DESC, id DESC
          LIMIT ?
        `,
      )
      .all(limit) as RecommendationRow[];
    return this.attachEvidence(rows.map(recommendationRowToDomain));
  }

  private getSignalById(id: number): DerivedSignal {
    const row = this.db.prepare('SELECT * FROM derived_signals WHERE id = ?').get(id) as SignalRow;
    return signalRowToDomain(row);
  }

  private getPatternById(id: number): PatternObservation {
    const row = this.db.prepare('SELECT * FROM pattern_observations WHERE id = ?').get(id) as PatternRow;
    return patternRowToDomain(row);
  }

  private getRecommendationById(id: number): Recommendation {
    const row = this.db.prepare('SELECT * FROM recommendations WHERE id = ?').get(id) as RecommendationRow;
    return attachEvidenceToRecommendation(recommendationRowToDomain(row), this.getEvidenceByRecommendationId(id));
  }

  private getRunById(id: number): IntelligenceRun {
    const row = this.db.prepare('SELECT * FROM intelligence_runs WHERE id = ?').get(id) as IntelligenceRunRow;
    return intelligenceRunRowToDomain(row);
  }

  private getEvidenceByRecommendationId(recommendationId: number): RecommendationEvidence[] {
    const rows = this.db
      .prepare('SELECT * FROM recommendation_evidence WHERE recommendation_id = ? ORDER BY id ASC')
      .all(recommendationId) as RecommendationEvidenceRow[];
    return rows.map(recommendationEvidenceRowToDomain);
  }

  private attachEvidence(recommendations: Recommendation[]): Recommendation[] {
    return recommendations.map((recommendation) =>
      attachEvidenceToRecommendation(recommendation, this.getEvidenceByRecommendationId(Number(recommendation.id))),
    );
  }

  private insertRecommendation(
    recommendation: Recommendation,
    evidenceCount: number,
    expectedBenefitPayload: string,
    operatorActionPayload: string,
  ): Recommendation {
    const result = this.db
      .prepare(
        `
          INSERT INTO recommendations (
            recommendation_type,
            rule_version,
            subject_type,
            subject_id,
            subject_key,
            organization_id,
            location_id,
            operation_unit_id,
            storage_area_id,
            inventory_item_id,
            recipe_id,
            vendor_id,
            vendor_item_id,
            status,
            severity_label,
            confidence_label,
            urgency_label,
            confidence_score,
            summary,
            evidence_count,
            expected_benefit_payload,
            operator_action_payload,
            dedupe_key,
            superseded_by_recommendation_id,
            opened_at,
            due_at,
            closed_at,
            last_confirmed_at,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        recommendation.recommendation_type,
        recommendation.rule_version ?? inferRuleVersionFromRecommendation(recommendation),
        recommendation.subject_type,
        recommendation.subject_id,
        recommendation.subject_key ?? null,
        recommendation.organization_id,
        recommendation.location_id,
        recommendation.operation_unit_id,
        recommendation.storage_area_id,
        recommendation.inventory_item_id,
        recommendation.recipe_id,
        recommendation.vendor_id,
        recommendation.vendor_item_id,
        recommendation.status,
        recommendation.severity_label,
        recommendation.confidence_label,
        recommendation.urgency_label,
        recommendation.confidence_score,
        recommendation.summary,
        evidenceCount,
        expectedBenefitPayload,
        operatorActionPayload,
        recommendation.dedupe_key,
        recommendation.superseded_by_recommendation_id,
        recommendation.opened_at,
        recommendation.due_at,
        recommendation.closed_at,
        recommendation.last_confirmed_at ?? recommendation.updated_at ?? recommendation.opened_at,
        recommendation.created_at ?? recommendation.opened_at,
        recommendation.updated_at ?? recommendation.opened_at,
      );

    return this.getRecommendationById(Number(result.lastInsertRowid));
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
  last_confirmed_at: string;
  created_at: string;
  updated_at: string;
};

type PatternRow = {
  id: number;
  pattern_type: string;
  rule_version: string;
  subject_type: PatternObservation['subject_type'];
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
  status: PatternObservation['status'];
  severity_label: PatternObservation['severity_label'];
  confidence_label: PatternObservation['confidence_label'];
  confidence_score: number | null;
  observation_count: number;
  evidence_count: number;
  first_observed_at: string | null;
  last_observed_at: string | null;
  pattern_payload: string;
  last_confirmed_at: string;
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
  status: Recommendation['status'];
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
  last_confirmed_at: string;
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
    last_confirmed_at: row.last_confirmed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function patternRowToDomain(row: PatternRow): PatternObservation {
  const payload = parseJson(row.pattern_payload);
  const signalIds = Array.isArray(payload.signal_ids) ? (payload.signal_ids as Array<number | string>) : [];
  delete payload.signal_ids;

  return {
    id: row.id,
    pattern_type: row.pattern_type,
    rule_version: row.rule_version,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    subject_key: row.subject_key,
    status: row.status,
    severity_label: row.severity_label,
    confidence_label: row.confidence_label,
    confidence_score: row.confidence_score,
    observation_count: row.observation_count,
    first_observed_at: row.first_observed_at,
    last_observed_at: row.last_observed_at,
    organization_id: row.organization_id,
    location_id: row.location_id,
    operation_unit_id: row.operation_unit_id,
    storage_area_id: row.storage_area_id,
    inventory_item_id: row.inventory_item_id,
    recipe_id: row.recipe_id,
    vendor_id: row.vendor_id,
    vendor_item_id: row.vendor_item_id,
    evidence_count: row.evidence_count,
    signal_ids: signalIds,
    pattern_payload: payload,
    last_confirmed_at: row.last_confirmed_at,
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
    last_confirmed_at: row.last_confirmed_at,
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

function attachEvidenceToRecommendation(
  recommendation: Recommendation,
  evidence: RecommendationEvidence[],
): Recommendation {
  return {
    ...recommendation,
    evidence,
    evidence_count: Math.max(recommendation.evidence_count ?? 0, evidence.length),
  };
}

function serializeSignalPayload(signal: DerivedSignal): string {
  return stringifyJson({
    ...signal.signal_payload,
    evidence_refs: signal.evidence,
  });
}

function serializePatternPayload(pattern: PatternObservation): string {
  return stringifyJson({
    ...pattern.pattern_payload,
    signal_ids: pattern.signal_ids,
  });
}

function inferPatternEvidenceCount(pattern: PatternObservation): number {
  const evidenceRefs = Array.isArray(pattern.pattern_payload.evidence_refs)
    ? (pattern.pattern_payload.evidence_refs as unknown[])
    : [];
  return Math.max(pattern.signal_ids.length, evidenceRefs.length, pattern.observation_count);
}

function deriveSignalMagnitude(signal: DerivedSignal): number | null {
  if (typeof signal.signal_payload.normalized_price_change_pct === 'number') {
    return Math.abs(signal.signal_payload.normalized_price_change_pct);
  }
  if (typeof signal.signal_payload.volatility_pct_range === 'number') {
    return signal.signal_payload.volatility_pct_range;
  }
  return null;
}

function inferRuleVersionFromRecommendation(recommendation: Recommendation): string {
  if (typeof recommendation.operator_action_payload.rule_version === 'string') {
    return recommendation.operator_action_payload.rule_version as string;
  }
  return 'price-intelligence/v1';
}

function isMaterialRecommendationChange(existing: Recommendation, incoming: Recommendation): boolean {
  return (
    existing.summary !== incoming.summary ||
    existing.severity_label !== incoming.severity_label ||
    existing.confidence_label !== incoming.confidence_label ||
    existing.urgency_label !== incoming.urgency_label ||
    stringifyJson(existing.expected_benefit_payload) !== stringifyJson(incoming.expected_benefit_payload) ||
    stringifyJson(existing.operator_action_payload) !== stringifyJson(incoming.operator_action_payload)
  );
}

function minDate(left: string | null | undefined, right: string | null | undefined): string | null {
  if (!left) {
    return right ?? null;
  }
  if (!right) {
    return left;
  }
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function maxDate(left: string | null | undefined, right: string | null | undefined): string | null {
  if (!left) {
    return right ?? null;
  }
  if (!right) {
    return left;
  }
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function parseJson(value: string): Record<string, unknown> {
  return JSON.parse(value) as Record<string, unknown>;
}

function stringifyJson(value: Record<string, unknown>): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortJsonValue((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }
  return value;
}
