import type { VarianceExecutionResult, VarianceRunSummary } from './types.js';
import type { IntelligenceJobContext, IntelligenceJobDefinition } from '../types.js';
import {
  executeVarianceIntelligence,
  type VarianceIntelligenceDependencies,
} from './varianceEngine.js';

export const varianceJobDefinition: IntelligenceJobDefinition = {
  jobName: 'variance-intelligence-job',
  purpose: 'Turn inventory count facts into deterministic COUNT_VARIANCE and COUNT_INCONSISTENCY signals using scoped policy thresholds.',
  expectedInputs: [
    'count_sessions',
    'count_entries',
    'items',
    'optional expected cost context',
    'scoped variance policy thresholds',
  ],
  expectedOutputs: [
    'COUNT_VARIANCE signals',
    'COUNT_INCONSISTENCY signals',
    'intelligence run records',
  ],
  todos: [
    'Layer discipline recommendations on top of stable persisted inconsistency signals.',
    'Use benchmark-aware peer comparisons after benchmarking snapshots exist.',
    'Split theoretical-vs-count variance from operational count discipline once expected inventory projections mature.',
  ],
};

export async function runVarianceJob(
  context: IntelligenceJobContext,
  dependencies?: VarianceIntelligenceDependencies,
): Promise<{
  signals?: VarianceExecutionResult['signals'];
  run?: VarianceExecutionResult['run'];
  run_summary?: VarianceExecutionResult['run_summary'];
  variance_summary?: VarianceRunSummary;
  notes: string[];
}> {
  if (!dependencies) {
    return {
      notes: ['Variance Intelligence requires count-source and persistence dependencies before it can evaluate live count variance.'],
      signals: undefined,
      run: undefined,
      run_summary: undefined,
      variance_summary: undefined,
    };
  }

  const result = await executeVarianceIntelligence(context, dependencies);
  return {
    signals: result.signals,
    run: result.run,
    run_summary: result.run_summary,
    variance_summary: result.variance_summary,
    notes: result.notes,
  };
}

export type { VarianceIntelligenceDependencies } from './varianceEngine.js';
