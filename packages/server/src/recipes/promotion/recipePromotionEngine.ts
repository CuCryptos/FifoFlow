import type { RecipeBuilderParsedRow, RecipeBuilderResolutionRow } from '@fifoflow/shared';
import type {
  RecipeBuilderPromotionLink,
  RecipeIngredientRecord,
  RecipePromotionBlockingReason,
  RecipePromotionDraftContext,
  RecipePromotionEvaluation,
  RecipePromotionRepository,
  RecipePromotionRequest,
  RecipePromotionResult,
  RecipeVersionRecord,
} from './types.js';
import {
  derivePromotionCostability,
  derivePromotionStatus,
  rowIsPromotionReady,
} from './types.js';

export async function executeRecipePromotion(
  request: RecipePromotionRequest,
  repository: RecipePromotionRepository,
): Promise<RecipePromotionResult> {
  return repository.withTransaction(async () => {
    const context = await repository.loadDraftContext(request.recipe_builder_job_id);
    if (!context) {
      const blockingReasons: RecipePromotionBlockingReason[] = [{
        code: 'DRAFT_NOT_FOUND',
        message: `No durable builder draft exists for recipe builder job ${request.recipe_builder_job_id}.`,
      }];
      const evaluation: RecipePromotionEvaluation = {
        status: 'REJECTED',
        blocking_reasons: blockingReasons,
        promotable_rows: [],
        costability_after_promotion: 'BLOCKED_FOR_COSTING',
      };
      return {
        evaluation,
        recipe: null,
        recipe_version: null,
        recipe_ingredients: [],
        promotion_event: null,
        promotion_link: null,
        created_new_recipe: false,
        created_new_version: false,
        costability_status: 'BLOCKED_FOR_COSTING',
      };
    }

    const evaluation = evaluateDraftPromotion(context, request);
    const activeLink = await repository.getActivePromotionLink(context.draft.id);

    if (activeLink && request.promotion_mode !== 'create_revision' && evaluation.status === 'PROMOTED') {
      const recipe = await repository.getRecipeById(activeLink.recipe_id);
      const versions = await repository.listRecipeVersions(activeLink.recipe_id);
      const recipeVersion = versions.find((version) => String(version.id) === String(activeLink.recipe_version_id)) ?? null;
      const recipeIngredients = recipeVersion ? await repository.listRecipeIngredients(recipeVersion.id) : [];
      const promotionEvent = await repository.createPromotionEvent({
        recipe_builder_job_id: context.job.id,
        recipe_builder_draft_recipe_id: context.draft.id,
        action_type: 'PROMOTION_REUSED',
        status: 'PROMOTED',
        promoted_recipe_id: activeLink.recipe_id,
        promoted_recipe_version_id: activeLink.recipe_version_id,
        notes: request.notes ?? 'Existing promotion link reused for repeat promotion request.',
        created_by: request.created_by ?? null,
      });
      return {
        evaluation,
        recipe,
        recipe_version: recipeVersion,
        recipe_ingredients: recipeIngredients,
        promotion_event: promotionEvent,
        promotion_link: activeLink,
        created_new_recipe: false,
        created_new_version: false,
        costability_status: evaluation.costability_after_promotion,
      };
    }

    if (evaluation.status !== 'PROMOTABLE') {
      const promotionEvent = await repository.createPromotionEvent({
        recipe_builder_job_id: context.job.id,
        recipe_builder_draft_recipe_id: context.draft.id,
        action_type: 'PROMOTION_EVALUATED',
        status: evaluation.status,
        promoted_recipe_id: null,
        promoted_recipe_version_id: null,
        notes: evaluation.blocking_reasons.map((reason) => reason.message).join(' '),
        created_by: request.created_by ?? null,
      });
      return {
        evaluation,
        recipe: null,
        recipe_version: null,
        recipe_ingredients: [],
        promotion_event: promotionEvent,
        promotion_link: null,
        created_new_recipe: false,
        created_new_version: false,
        costability_status: evaluation.costability_after_promotion,
      };
    }

    if (activeLink && request.promotion_mode !== 'create_revision') {
      const recipe = await repository.getRecipeById(activeLink.recipe_id);
      const versions = await repository.listRecipeVersions(activeLink.recipe_id);
      const recipeVersion = versions.find((version) => String(version.id) === String(activeLink.recipe_version_id)) ?? null;
      const recipeIngredients = recipeVersion ? await repository.listRecipeIngredients(recipeVersion.id) : [];
      const promotionEvent = await repository.createPromotionEvent({
        recipe_builder_job_id: context.job.id,
        recipe_builder_draft_recipe_id: context.draft.id,
        action_type: 'PROMOTION_REUSED',
        status: 'PROMOTED',
        promoted_recipe_id: activeLink.recipe_id,
        promoted_recipe_version_id: activeLink.recipe_version_id,
        notes: request.notes ?? 'Existing promotion link reused for repeat promotion request.',
        created_by: request.created_by ?? null,
      });
      return {
        evaluation: { ...evaluation, status: 'PROMOTED' },
        recipe,
        recipe_version: recipeVersion,
        recipe_ingredients: recipeIngredients,
        promotion_event: promotionEvent,
        promotion_link: activeLink,
        created_new_recipe: false,
        created_new_version: false,
        costability_status: evaluation.costability_after_promotion,
      };
    }

    const revisionTargetRecipeId = request.promotion_mode === 'create_revision'
      ? request.target_recipe_id ?? activeLink?.recipe_id ?? null
      : null;

    if (request.promotion_mode === 'create_revision' && revisionTargetRecipeId == null) {
      const blockingReasons: RecipePromotionBlockingReason[] = [{
        code: 'REVISION_TARGET_REQUIRED',
        message: 'Revision promotion requires an explicit target recipe or an existing promotion link.',
      }];
      const blockedEvaluation: RecipePromotionEvaluation = {
        status: 'REVIEW_READY',
        blocking_reasons: blockingReasons,
        promotable_rows: evaluation.promotable_rows,
        costability_after_promotion: 'BLOCKED_FOR_COSTING',
      };
      const promotionEvent = await repository.createPromotionEvent({
        recipe_builder_job_id: context.job.id,
        recipe_builder_draft_recipe_id: context.draft.id,
        action_type: 'PROMOTION_EVALUATED',
        status: 'REVIEW_READY',
        promoted_recipe_id: null,
        promoted_recipe_version_id: null,
        notes: blockingReasons[0].message,
        created_by: request.created_by ?? null,
      });
      return {
        evaluation: blockedEvaluation,
        recipe: null,
        recipe_version: null,
        recipe_ingredients: [],
        promotion_event: promotionEvent,
        promotion_link: null,
        created_new_recipe: false,
        created_new_version: false,
        costability_status: 'BLOCKED_FOR_COSTING',
      };
    }

    const createdNewRecipe = request.promotion_mode !== 'create_revision';
    const recipe = createdNewRecipe
      ? await repository.createRecipe({
          name: context.draft.draft_name,
          type: context.draft.source_recipe_type ?? 'prep',
          notes: buildPromotionNotes(context),
        })
      : await repository.getRecipeById(revisionTargetRecipeId!);

    if (!recipe) {
      throw new Error('Promotion target recipe could not be loaded.');
    }

    const recipeVersion = await repository.createRecipeVersion({
      recipe_id: recipe.id,
      yield_quantity: context.draft.yield_quantity,
      yield_unit: context.draft.yield_unit,
      source_builder_job_id: context.job.id,
      source_builder_draft_recipe_id: context.draft.id,
      source_template_id: context.job.source_template_id,
      source_template_version_id: context.job.source_template_version_id,
      source_text_snapshot: context.job.source_text,
    });

    const recipeIngredients = await repository.replaceRecipeIngredients(
      recipeVersion.id,
      buildPromotedIngredients(context, evaluation.promotable_rows),
    );

    const promotionLink = await repository.upsertPromotionLink({
      recipe_builder_draft_recipe_id: context.draft.id,
      recipe_id: recipe.id,
      recipe_version_id: recipeVersion.id,
      active: true,
    });

    await repository.markDraftPromoted(context.job.id, context.draft.id);

    const promotionEvent = await repository.createPromotionEvent({
      recipe_builder_job_id: context.job.id,
      recipe_builder_draft_recipe_id: context.draft.id,
      action_type: createdNewRecipe ? 'PROMOTED_NEW_RECIPE' : 'PROMOTED_NEW_VERSION',
      status: 'PROMOTED',
      promoted_recipe_id: recipe.id,
      promoted_recipe_version_id: recipeVersion.id,
      notes: request.notes ?? buildPromotionNotes(context),
      created_by: request.created_by ?? null,
    });

    return {
      evaluation: { ...evaluation, status: 'PROMOTED' },
      recipe,
      recipe_version: recipeVersion,
      recipe_ingredients: recipeIngredients,
      promotion_event: promotionEvent,
      promotion_link: promotionLink,
      created_new_recipe: createdNewRecipe,
      created_new_version: true,
      costability_status: evaluation.costability_after_promotion,
    };
  });
}

export function evaluateDraftPromotion(
  context: RecipePromotionDraftContext,
  request: Pick<RecipePromotionRequest, 'promotion_mode' | 'target_recipe_id'>,
): RecipePromotionEvaluation {
  const blockingReasons: RecipePromotionBlockingReason[] = [];
  const parsedById = new Map(context.parsed_rows.map((row) => [String(row.id), row]));

  if (!context.draft.draft_name?.trim()) {
    blockingReasons.push({ code: 'MISSING_DRAFT_NAME', message: 'Draft recipe name is required before operational promotion.' });
  }
  if (context.draft.ingredient_row_count === 0) {
    blockingReasons.push({ code: 'NO_INGREDIENT_ROWS', message: 'At least one promotable ingredient row is required.' });
  }
  if (context.draft.yield_quantity == null) {
    blockingReasons.push({ code: 'MISSING_YIELD_QUANTITY', message: 'Yield quantity is required for operational promotion.' });
  }
  if (!context.draft.yield_unit) {
    blockingReasons.push({ code: 'MISSING_YIELD_UNIT', message: 'Yield unit is required for operational promotion.' });
  }

  for (const row of context.resolution_rows) {
    const parsedRow = parsedById.get(String(row.parsed_row_id));
    if (!parsedRow) {
      continue;
    }
    if (parsedRow.parse_status === 'FAILED' || row.review_status === 'BLOCKED') {
      blockingReasons.push({
        code: 'BLOCKED_ROW_PRESENT',
        message: `Ingredient line ${parsedRow.line_index} is blocked and must be resolved or removed before promotion.`,
        parsed_row_id: parsedRow.id,
        line_index: parsedRow.line_index,
      });
      continue;
    }
    if (row.canonical_ingredient_id == null || row.canonical_match_status !== 'matched') {
      blockingReasons.push({
        code: 'UNRESOLVED_CANONICAL_IDENTITY',
        message: `Ingredient line ${parsedRow.line_index} does not have trusted canonical ingredient identity.`,
        parsed_row_id: parsedRow.id,
        line_index: parsedRow.line_index,
      });
      continue;
    }
    if (!rowIsPromotionReady(row)) {
      blockingReasons.push({
        code: 'UNTRUSTED_PARSE_ROW',
        message: `Ingredient line ${parsedRow.line_index} still needs review before operational promotion.`,
        parsed_row_id: parsedRow.id,
        line_index: parsedRow.line_index,
      });
    }
  }

  if (request.promotion_mode === 'create_revision' && request.target_recipe_id == null) {
    blockingReasons.push({
      code: 'REVISION_TARGET_REQUIRED',
      message: 'Revision promotion requires a target recipe identifier.',
    });
  }

  const promotableRows = context.resolution_rows.filter((row) => rowIsPromotionReady(row));
  const status = derivePromotionStatus({ draft: context.draft, blockingReasons });
  return {
    status,
    blocking_reasons: dedupeBlockingReasons(blockingReasons),
    promotable_rows: promotableRows,
    costability_after_promotion: derivePromotionCostability({ draft: context.draft, blockingReasons }),
  };
}

function buildPromotedIngredients(
  context: RecipePromotionDraftContext,
  promotableRows: RecipeBuilderResolutionRow[],
): Array<Omit<RecipeIngredientRecord, 'id' | 'recipe_version_id' | 'created_at'>> {
  const parsedById = new Map(context.parsed_rows.map((row) => [String(row.id), row]));
  return promotableRows.map((row) => {
    const parsedRow = parsedById.get(String(row.parsed_row_id));
    if (!parsedRow || row.canonical_ingredient_id == null || parsedRow.quantity_normalized == null || !parsedRow.unit_normalized) {
      throw new Error(`Cannot promote recipe ingredient row ${row.id} without parsed quantity, unit, and canonical identity.`);
    }

    return {
      line_index: parsedRow.line_index,
      source_parsed_row_id: parsedRow.id,
      source_resolution_row_id: row.id,
      raw_ingredient_text: parsedRow.raw_line_text,
      canonical_ingredient_id: row.canonical_ingredient_id,
      inventory_item_id: row.inventory_item_id,
      quantity_normalized: parsedRow.quantity_normalized,
      unit_normalized: parsedRow.unit_normalized,
      preparation_note: parsedRow.preparation_note,
    };
  });
}

function buildPromotionNotes(context: RecipePromotionDraftContext): string {
  return `Promoted from recipe builder job ${context.job.id}.`;
}

function dedupeBlockingReasons(reasons: RecipePromotionBlockingReason[]): RecipePromotionBlockingReason[] {
  const seen = new Set<string>();
  const result: RecipePromotionBlockingReason[] = [];
  for (const reason of reasons) {
    const key = `${reason.code}:${reason.parsed_row_id ?? 'none'}:${reason.line_index ?? 'none'}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(reason);
  }
  return result;
}
