import type {
  ConfidenceLabel,
  DerivedSignal,
  IntelligenceRun,
  PatternObservation,
  Recommendation,
  Standard,
  StandardEffectivenessReview,
} from '@fifoflow/shared';

export type IntelligenceJobName =
  | 'price-intelligence-job'
  | 'recipe-cost-job'
  | 'recipe-cost-drift-job'
  | 'variance-intelligence-job'
  | 'weekly-operating-memo-job'
  | 'inventory-discipline-job'
  | 'purchasing-intelligence-job'
  | 'waste-intelligence-job'
  | 'recommendation-synthesis-job'
  | 'standards-evaluation-job';

export interface IntelligenceJobScope {
  organizationId?: number;
  locationId?: number;
  operationUnitId?: number;
  storageAreaId?: number;
  inventoryCategoryId?: number;
  inventoryItemId?: number;
  recipeId?: number;
  vendorId?: number;
  vendorItemId?: number;
}

export interface IntelligenceJobWindow {
  start: string;
  end: string;
}

export interface IntelligenceJobContext {
  scope: IntelligenceJobScope;
  window: IntelligenceJobWindow;
  ruleVersion: string;
  now: string;
}

export interface IntelligenceJobDefinition {
  jobName: IntelligenceJobName;
  purpose: string;
  expectedInputs: string[];
  expectedOutputs: string[];
  todos: string[];
}

export interface IntelligenceJobResult {
  signals?: DerivedSignal[];
  patterns?: PatternObservation[];
  recommendations?: Recommendation[];
  standards?: Standard[];
  reviews?: StandardEffectivenessReview[];
  run?: IntelligenceRun;
  run_summary?: {
    signals_created: number;
    signals_updated: number;
    patterns_created: number;
    patterns_updated: number;
    recommendations_created: number;
    recommendations_updated: number;
    recommendations_superseded: number;
  };
  notes: string[];
}

export function defaultConfidenceLabel(score: number): ConfidenceLabel {
  if (score >= 0.75) {
    return 'Stable pattern';
  }
  if (score >= 0.4) {
    return 'Emerging pattern';
  }
  return 'Early signal';
}
