import { resolveCanonicalIngredient } from '../../mapping/ingredients/canonicalIngredientResolver.js';
import type { CanonicalIngredientRepository } from '../../mapping/ingredients/types.js';
import { executeRecipeBuilderJob, runRecipeBuilder } from './recipeAssemblyEngine.js';
import type {
  RecipeBuilderDependencies,
  RecipeBuilderExecutionResult,
  RecipeBuilderPersistenceRepository,
  RecipeBuilderRequest,
  RecipeBuilderRunOptions,
  RecipeBuilderSource,
} from './types.js';

export const recipeBuilderJobDefinition = {
  job_name: 'recipe-builder-job',
  purpose: 'Parse freeform or template-based ingredient inputs into durable draft recipe assembly state with deterministic canonical resolution.',
  outputs: ['recipe_builder_jobs', 'recipe_builder_parsed_rows', 'recipe_builder_resolution_rows', 'recipe_builder_draft_recipes'],
} as const;

export interface RecipeBuilderJobDependencies {
  source: RecipeBuilderSource;
  repository: RecipeBuilderPersistenceRepository;
  canonicalIngredientRepository: CanonicalIngredientRepository;
  inventoryMapper?: RecipeBuilderDependencies['inventoryMapper'];
}

export async function runRecipeBuilderJob(
  request: RecipeBuilderRequest,
  dependencies: RecipeBuilderJobDependencies,
  options: RecipeBuilderRunOptions = {},
): Promise<RecipeBuilderExecutionResult> {
  return runRecipeBuilder(
    request,
    {
      source: dependencies.source,
      repository: dependencies.repository,
      canonicalResolver: {
        resolve: (input: string) => resolveCanonicalIngredient(input, dependencies.canonicalIngredientRepository),
      },
      inventoryMapper: dependencies.inventoryMapper,
    },
    options,
  );
}

export { executeRecipeBuilderJob };
