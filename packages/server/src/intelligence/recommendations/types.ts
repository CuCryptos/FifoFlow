import type { DerivedSignal, Recommendation, RecommendationEvidence, RecommendationType } from '@fifoflow/shared';
import type { IntelligenceJobResult } from '../types.js';

export interface RecommendationSignalReadRepository {
  listSignalsForRecommendationWindow(window: { start: string; end: string }, signalTypes?: Array<DerivedSignal['signal_type']>): Promise<DerivedSignal[]>;
}

export interface RecommendationRuleInput {
  signal: DerivedSignal;
  now: string;
}

export interface SynthesizedRecommendationCandidate {
  recommendation: Recommendation;
  evidence: RecommendationEvidence[];
  rule_key: string;
  source_signal_id: number | string;
}

export interface RecommendationSynthesisRunSummary {
  signals_considered: number;
  recommendations_created: number;
  recommendations_updated: number;
  recommendations_superseded: number;
  candidates_skipped: number;
}

export interface RecommendationSynthesisExecutionResult extends IntelligenceJobResult {
  recommendation_synthesis_summary: RecommendationSynthesisRunSummary;
}

export interface RecommendationRuleResult {
  matched: boolean;
  candidate?: SynthesizedRecommendationCandidate;
  reason?: string;
}

export interface RecommendationRuleDefinition {
  recommendation_type: RecommendationType;
  description: string;
  evaluate(input: RecommendationRuleInput): RecommendationRuleResult | null;
}
