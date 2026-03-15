import { executeRecipePromotion } from './recipePromotionEngine.js';
import type { RecipePromotionRepository, RecipePromotionRequest, RecipePromotionResult } from './types.js';

export const recipePromotionJobDefinition = {
  job_name: 'recipe-promotion-job',
  purpose: 'Promote trusted draft recipe builder state into operational recipe, recipe version, and recipe ingredient records with lineage.',
  outputs: ['recipes', 'recipe_versions', 'recipe_ingredients', 'recipe_promotion_events'],
} as const;

export async function runRecipePromotionJob(
  request: RecipePromotionRequest,
  repository: RecipePromotionRepository,
): Promise<RecipePromotionResult> {
  return executeRecipePromotion(request, repository);
}
