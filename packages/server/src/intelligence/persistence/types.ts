import type {
  DerivedSignal,
  IntelligenceRun,
  PatternObservation,
  Recommendation,
  RecommendationEvidence,
  SignalType,
} from '@fifoflow/shared';

export type UpsertAction = 'created' | 'updated';

export interface SubjectLookup {
  subject_type: string;
  subject_key: string;
}

export interface SignalLookup extends SubjectLookup {
  signal_type?: SignalType;
  observed_since?: string;
}

export interface PatternLookup extends SubjectLookup {
  pattern_type?: string;
}

export interface RecommendationLookup extends SubjectLookup {
  recommendation_type?: string;
}

export interface UpsertResult<T> {
  action: UpsertAction;
  record: T;
}

export interface RecommendationUpsertResult extends UpsertResult<Recommendation> {
  superseded_recommendation_id?: number | string | null;
}

export interface IntelligenceRunCounters {
  signals_created: number;
  signals_updated: number;
  patterns_created: number;
  patterns_updated: number;
  recommendations_created: number;
  recommendations_updated: number;
  recommendations_superseded: number;
}

export interface IntelligencePersistenceRepository {
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
  startRun(jobType: string, startedAt: string): Promise<IntelligenceRun>;
  completeRun(runId: number | string, status: IntelligenceRun['status'], counters: IntelligenceRunCounters, completedAt: string): Promise<IntelligenceRun>;
  upsertSignal(signal: DerivedSignal): Promise<UpsertResult<DerivedSignal>>;
  upsertPattern(pattern: PatternObservation): Promise<UpsertResult<PatternObservation>>;
  upsertRecommendation(recommendation: Recommendation): Promise<RecommendationUpsertResult>;
  supersedeRecommendation(oldId: number | string, newId: number | string, supersededAt: string): Promise<void>;
  attachRecommendationEvidence(evidence: RecommendationEvidence[]): Promise<number>;
  fetchActiveSignalsBySubject(lookup: SignalLookup): Promise<DerivedSignal[]>;
  fetchActivePatternsBySubject(lookup: PatternLookup): Promise<PatternObservation[]>;
  fetchActiveRecommendationsBySubject(lookup: RecommendationLookup): Promise<Recommendation[]>;
  getLatestPriceSignals(limit?: number): Promise<DerivedSignal[]>;
  getUnstableVendorPricingPatterns(limit?: number): Promise<PatternObservation[]>;
  getActiveVendorReviewRecommendations(limit?: number): Promise<Recommendation[]>;
}
