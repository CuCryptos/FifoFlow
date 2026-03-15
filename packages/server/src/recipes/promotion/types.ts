import type {
  Recipe,
  RecipeBuilderDraftRecipe,
  RecipeBuilderJob,
  RecipeBuilderParsedRow,
  RecipeBuilderResolutionRow,
  RecipeBuilderReviewStatus,
  RecipeType,
} from '@fifoflow/shared';

export type RecipePromotionDraftStatus = 'DRAFT' | 'REVIEW_READY' | 'PROMOTABLE' | 'PROMOTED' | 'REJECTED';
export type RecipePromotionActionType = 'PROMOTION_EVALUATED' | 'PROMOTED_NEW_RECIPE' | 'PROMOTED_NEW_VERSION' | 'PROMOTION_REUSED';
export type RecipePromotionCostability = 'COSTABLE_NOW' | 'OPERATIONAL_ONLY' | 'BLOCKED_FOR_COSTING';

export interface RecipeVersionRecord {
  id: number | string;
  recipe_id: number | string;
  version_number: number;
  status: string;
  yield_quantity: number | null;
  yield_unit: string | null;
  source_builder_job_id: number | string | null;
  source_builder_draft_recipe_id: number | string | null;
  source_template_id: number | string | null;
  source_template_version_id: number | string | null;
  source_text_snapshot: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RecipeIngredientRecord {
  id: number | string;
  recipe_version_id: number | string;
  line_index: number;
  source_parsed_row_id: number | string | null;
  source_resolution_row_id: number | string | null;
  raw_ingredient_text: string;
  canonical_ingredient_id: number | string;
  inventory_item_id: number | string | null;
  quantity_normalized: number;
  unit_normalized: string;
  preparation_note: string | null;
  created_at?: string;
}

export interface RecipePromotionEvent {
  id: number | string;
  recipe_builder_job_id: number | string;
  recipe_builder_draft_recipe_id: number | string;
  action_type: RecipePromotionActionType;
  status: RecipePromotionDraftStatus;
  promoted_recipe_id: number | string | null;
  promoted_recipe_version_id: number | string | null;
  notes: string | null;
  created_by: string | null;
  created_at?: string;
}

export interface RecipeBuilderPromotionLink {
  id: number | string;
  recipe_builder_draft_recipe_id: number | string;
  recipe_id: number | string;
  recipe_version_id: number | string;
  active: boolean;
  created_at?: string;
}

export type RecipePromotionBlockingCode =
  | 'DRAFT_NOT_FOUND'
  | 'NO_INGREDIENT_ROWS'
  | 'MISSING_DRAFT_NAME'
  | 'MISSING_YIELD_QUANTITY'
  | 'MISSING_YIELD_UNIT'
  | 'BLOCKED_ROW_PRESENT'
  | 'UNRESOLVED_CANONICAL_IDENTITY'
  | 'UNTRUSTED_PARSE_ROW'
  | 'REVISION_TARGET_REQUIRED';

export interface RecipePromotionBlockingReason {
  code: RecipePromotionBlockingCode;
  message: string;
  parsed_row_id?: number | string | null;
  line_index?: number | null;
}

export interface RecipePromotionEvaluation {
  status: RecipePromotionDraftStatus;
  blocking_reasons: RecipePromotionBlockingReason[];
  promotable_rows: RecipeBuilderResolutionRow[];
  costability_after_promotion: RecipePromotionCostability;
}

export interface RecipePromotionDraftContext {
  job: RecipeBuilderJob;
  draft: RecipeBuilderDraftRecipe;
  parsed_rows: RecipeBuilderParsedRow[];
  resolution_rows: RecipeBuilderResolutionRow[];
}

export interface RecipePromotionRequest {
  recipe_builder_job_id: number | string;
  promotion_mode?: 'create_new' | 'create_revision';
  target_recipe_id?: number | string | null;
  created_by?: string | null;
  notes?: string | null;
}

export interface RecipePromotionResult {
  evaluation: RecipePromotionEvaluation;
  recipe: Recipe | null;
  recipe_version: RecipeVersionRecord | null;
  recipe_ingredients: RecipeIngredientRecord[];
  promotion_event: RecipePromotionEvent | null;
  promotion_link: RecipeBuilderPromotionLink | null;
  created_new_recipe: boolean;
  created_new_version: boolean;
  costability_status: RecipePromotionCostability;
}

export interface RecipePromotionRepository {
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
  loadDraftContext(jobId: number | string): Promise<RecipePromotionDraftContext | null>;
  getActivePromotionLink(draftId: number | string): Promise<RecipeBuilderPromotionLink | null>;
  createRecipe(input: { name: string; type: RecipeType; notes?: string | null }): Promise<Recipe>;
  getRecipeById(id: number | string): Promise<Recipe | null>;
  createRecipeVersion(input: {
    recipe_id: number | string;
    yield_quantity: number | null;
    yield_unit: string | null;
    source_builder_job_id: number | string;
    source_builder_draft_recipe_id: number | string;
    source_template_id: number | string | null;
    source_template_version_id: number | string | null;
    source_text_snapshot: string | null;
  }): Promise<RecipeVersionRecord>;
  replaceRecipeIngredients(
    recipeVersionId: number | string,
    ingredients: Array<Omit<RecipeIngredientRecord, 'id' | 'recipe_version_id' | 'created_at'>>,
  ): Promise<RecipeIngredientRecord[]>;
  createPromotionEvent(input: Omit<RecipePromotionEvent, 'id' | 'created_at'>): Promise<RecipePromotionEvent>;
  upsertPromotionLink(input: Omit<RecipeBuilderPromotionLink, 'id' | 'created_at'>): Promise<RecipeBuilderPromotionLink>;
  markDraftPromoted(jobId: number | string, draftId: number | string): Promise<void>;
  listPromotionEvents(jobId: number | string): Promise<RecipePromotionEvent[]>;
  listRecipeVersions(recipeId: number | string): Promise<RecipeVersionRecord[]>;
  listRecipeIngredients(recipeVersionId: number | string): Promise<RecipeIngredientRecord[]>;
}

export function derivePromotionStatus(input: {
  draft: RecipeBuilderDraftRecipe;
  blockingReasons: RecipePromotionBlockingReason[];
}): RecipePromotionDraftStatus {
  if (input.blockingReasons.length > 0) {
    if (input.blockingReasons.some((reason) => reason.code === 'BLOCKED_ROW_PRESENT')) {
      return 'REVIEW_READY';
    }
    return 'REVIEW_READY';
  }
  if (input.draft.completeness_status === 'CREATED') {
    return 'PROMOTED';
  }
  return 'PROMOTABLE';
}

export function derivePromotionCostability(input: {
  draft: RecipeBuilderDraftRecipe;
  blockingReasons: RecipePromotionBlockingReason[];
}): RecipePromotionCostability {
  if (input.blockingReasons.length > 0) {
    return 'BLOCKED_FOR_COSTING';
  }
  if (input.draft.costability_status === 'COSTABLE') {
    return 'COSTABLE_NOW';
  }
  return 'OPERATIONAL_ONLY';
}

export function rowIsPromotionReady(row: RecipeBuilderResolutionRow): boolean {
  return row.review_status === 'READY'
    && row.canonical_match_status === 'matched'
    && row.canonical_ingredient_id != null
    && row.quantity_normalization_status === 'NORMALIZED';
}

export function draftNeedsOperationalReview(status: RecipeBuilderReviewStatus): boolean {
  return status === 'BLOCKED' || status === 'NEEDS_REVIEW' || status === 'INCOMPLETE';
}
