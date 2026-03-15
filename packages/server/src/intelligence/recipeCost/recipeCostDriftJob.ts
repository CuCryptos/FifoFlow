import type { RecipeCostDriftRunSummary } from '@fifoflow/shared';
import type { IntelligenceJobContext, IntelligenceJobDefinition } from '../types.js';
import {
  executeRecipeCostDriftIntelligence,
  type RecipeCostDriftDependencies,
  type RecipeCostDriftExecutionResult,
} from './recipeCostDriftEngine.js';

export const recipeCostDriftJobDefinition: IntelligenceJobDefinition = {
  jobName: 'recipe-cost-drift-job',
  purpose: 'Turn trusted comparable recipe cost snapshots into persisted RECIPE_COST_DRIFT and INGREDIENT_COST_DRIVER signals.',
  expectedInputs: [
    'trusted current recipe cost snapshots',
    'trusted prior comparable recipe cost snapshots',
    'recipe cost comparison deltas',
    'recipe cost drift thresholds',
  ],
  expectedOutputs: [
    'derived recipe cost drift signals',
    'derived ingredient cost driver signals',
    'intelligence run records',
  ],
  todos: [
    'Tune thresholds by recipe group once canonical recipe grouping exists.',
    'Layer recipe-cost recommendations on top of stable persisted signals.',
    'Connect drift outputs into weekly operating memo ranking.',
  ],
};

export async function runRecipeCostDriftJob(
  context: IntelligenceJobContext,
  dependencies?: RecipeCostDriftDependencies,
): Promise<{
  signals?: RecipeCostDriftExecutionResult['signals'];
  run?: RecipeCostDriftExecutionResult['run'];
  run_summary?: RecipeCostDriftExecutionResult['run_summary'];
  recipe_cost_drift_summary?: RecipeCostDriftRunSummary;
  notes: string[];
}> {
  if (!dependencies) {
    return {
      notes: ['Recipe cost drift job is wired for trusted comparable snapshot evaluation, but no repository dependencies were supplied.'],
      recipe_cost_drift_summary: undefined,
      signals: undefined,
      run: undefined,
      run_summary: undefined,
    };
  }

  const result = await executeRecipeCostDriftIntelligence(context, dependencies);
  return {
    signals: result.signals,
    run: result.run,
    run_summary: result.run_summary,
    recipe_cost_drift_summary: result.recipe_cost_drift_summary,
    notes: result.notes,
  };
}
