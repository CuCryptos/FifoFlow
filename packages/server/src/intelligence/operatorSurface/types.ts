import type {
  DerivedSignal,
  IntelligenceRun,
  Recommendation,
  RecommendationStatus,
} from '@fifoflow/shared';
import type { MemoCandidateItem } from '../memo/types.js';

export interface RecommendationReviewEvent {
  id: number;
  recommendation_id: number;
  action_type: 'STATUS_CHANGED';
  from_status: RecommendationStatus | null;
  to_status: RecommendationStatus | null;
  actor_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface SignalDetailRecord {
  signal: DerivedSignal;
  memo_item: MemoCandidateItem;
  subject_signal_history: DerivedSignal[];
  related_recommendations: Recommendation[];
}

export interface RecommendationDetailRecord {
  recommendation: Recommendation;
  evidence_signals: DerivedSignal[];
  subject_signal_history: DerivedSignal[];
  review_events: RecommendationReviewEvent[];
}

export interface RecommendationStatusUpdateInput {
  recommendation_id: number;
  status: RecommendationStatus;
  actor_name?: string | null;
  notes?: string | null;
  changed_at: string;
}

export interface PackFreshnessRecord {
  pack_key: string;
  label: string;
  description: string;
  downstream_packs: string[];
  last_run: IntelligenceRun | null;
  freshness_label: 'fresh' | 'aging' | 'stale' | 'missing';
  age_hours: number | null;
  metrics: Record<string, number | string | null>;
}
