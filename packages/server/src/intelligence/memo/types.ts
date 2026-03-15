import type { DerivedSignal, EvidenceReference, SeverityLabel, UrgencyLabel } from '@fifoflow/shared';
import type { IntelligenceJobResult } from '../types.js';

export type MemoSectionKey =
  | 'top_priority'
  | 'price_watch'
  | 'recipe_cost_watch'
  | 'inventory_discipline'
  | 'needs_review'
  | 'standards_review';

export type MemoOwner = 'Unit Manager' | 'Purchasing Owner' | 'Executive Approver';

export interface MemoSignalReadRepository {
  listSignalsForMemo(window: { start: string; end: string }, signalTypes?: string[]): Promise<DerivedSignal[]>;
}

export interface MemoScopeSummary {
  organization_id: number | null;
  location_id: number | null;
  operation_unit_id: number | null;
  storage_area_id: number | null;
  inventory_category_id: number | null;
  inventory_item_id: number | null;
  recipe_id: number | null;
  vendor_id: number | null;
}

export interface MemoRankingExplanation {
  total_score: number;
  components: {
    severity: number;
    urgency: number;
    confidence: number;
    recurrence: number;
    freshness: number;
    impact: number;
    evidence: number;
    fallback_penalty: number;
  };
  factors: string[];
}

export interface MemoCandidateItem {
  source_signal: DerivedSignal;
  source_signal_id: number | string;
  signal_type: DerivedSignal['signal_type'];
  title: string;
  subject_label: string;
  severity: SeverityLabel;
  urgency: UrgencyLabel;
  confidence: DerivedSignal['confidence_label'];
  likely_owner: MemoOwner;
  scope_summary: MemoScopeSummary;
  short_explanation: string;
  ranking_explanation: MemoRankingExplanation;
  evidence_references: EvidenceReference[];
  policy_fallback_used: boolean;
  section_keys: MemoSectionKey[];
  observed_at: string;
}

export interface MemoSection {
  key: MemoSectionKey;
  title: string;
  order: number;
  max_items: number;
  items: MemoCandidateItem[];
}

export interface WeeklyOperatingMemoPayload {
  memo_window: {
    start: string;
    end: string;
    generated_at: string;
  };
  total_candidate_signals: number;
  ranked_item_count: number;
  sections: MemoSection[];
  top_priority_items: MemoCandidateItem[];
  routing_summary: Array<{
    owner: MemoOwner;
    item_count: number;
    signal_types: string[];
  }>;
  explanation_metadata: {
    ranking_model_version: string;
    routing_model_version: string;
    eligibility_notes: string[];
  };
}

export interface WeeklyOperatingMemoRunSummary {
  signals_considered: number;
  memo_items_ranked: number;
  sections_emitted: number;
  top_priority_count: number;
}

export interface WeeklyOperatingMemoExecutionResult extends IntelligenceJobResult {
  weekly_operating_memo: WeeklyOperatingMemoPayload;
  weekly_operating_memo_summary: WeeklyOperatingMemoRunSummary;
}
