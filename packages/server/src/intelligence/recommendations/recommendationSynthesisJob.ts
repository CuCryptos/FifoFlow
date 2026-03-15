import type { IntelligenceJobContext, IntelligenceJobDefinition } from '../types.js';
import {
  executeRecommendationSynthesis,
  type RecommendationSynthesisDependencies,
} from './recommendationRuleEngine.js';
import type { RecommendationSynthesisExecutionResult } from './types.js';

export const recommendationSynthesisJobDefinition: IntelligenceJobDefinition = {
  jobName: 'recommendation-synthesis-job',
  purpose: 'Turn persisted cross-pack signals into durable, evidence-backed operator recommendations.',
  expectedInputs: [
    'derived_signals',
    'existing open and active recommendations',
    'recommendation evidence history',
  ],
  expectedOutputs: [
    'recommendations',
    'recommendation_evidence',
    'intelligence run records',
  ],
  todos: [
    'Add stable pattern inputs once durable cross-pack pattern synthesis exists.',
    'Layer standards-review promotion on top of recommendation lifecycle state.',
    'Expose recommendation payloads directly to the weekly operating memo once recommendation-first memo mode is live.',
  ],
};

export async function runRecommendationSynthesisJob(
  context: IntelligenceJobContext,
  dependencies?: RecommendationSynthesisDependencies,
): Promise<{
  recommendations?: RecommendationSynthesisExecutionResult['recommendations'];
  run?: RecommendationSynthesisExecutionResult['run'];
  run_summary?: RecommendationSynthesisExecutionResult['run_summary'];
  recommendation_synthesis_summary?: RecommendationSynthesisExecutionResult['recommendation_synthesis_summary'];
  notes: string[];
}> {
  if (!dependencies) {
    return {
      recommendations: undefined,
      run: undefined,
      run_summary: undefined,
      recommendation_synthesis_summary: undefined,
      notes: ['Recommendation synthesis requires persisted-signal and intelligence persistence dependencies before it can evaluate live operator actions.'],
    };
  }

  const result = await executeRecommendationSynthesis(context, dependencies);
  return {
    recommendations: result.recommendations,
    run: result.run,
    run_summary: result.run_summary,
    recommendation_synthesis_summary: result.recommendation_synthesis_summary,
    notes: result.notes,
  };
}

export type { RecommendationSynthesisDependencies } from './recommendationRuleEngine.js';
