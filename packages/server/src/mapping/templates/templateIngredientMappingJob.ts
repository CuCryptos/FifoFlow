import { resolveCanonicalIngredient } from '../ingredients/canonicalIngredientResolver.js';
import type { CanonicalIngredientRepository } from '../ingredients/types.js';
import { executeTemplateIngredientMapping } from './templateIngredientMappingEngine.js';
import type {
  TemplateIngredientMappingExecutionResult,
  TemplateIngredientMappingRepository,
  TemplateIngredientMappingSource,
} from './types.js';

export const templateIngredientMappingJobDefinition = {
  job_name: 'template-ingredient-mapping-job',
  purpose: 'Resolve recipe template ingredient rows to canonical ingredient identity using deterministic lookup and review queues.',
  outputs: ['template_ingredient_mappings', 'template_ingredient_mapping_candidates'],
} as const;

export interface TemplateIngredientMappingJobDependencies {
  source: TemplateIngredientMappingSource;
  repository: TemplateIngredientMappingRepository;
  canonicalIngredientRepository: CanonicalIngredientRepository;
}

export async function runTemplateIngredientMappingJob(
  dependencies: TemplateIngredientMappingJobDependencies,
): Promise<TemplateIngredientMappingExecutionResult> {
  return executeTemplateIngredientMapping({
    source: dependencies.source,
    repository: dependencies.repository,
    resolver: {
      resolve: (input: string) => resolveCanonicalIngredient(input, dependencies.canonicalIngredientRepository),
    },
  });
}
