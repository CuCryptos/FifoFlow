import {
  type AllergenConfidence,
  type AllergenReference,
  type AllergenStatus,
  type RecipeIngredientSourceRecord,
  type RecipeOverrideRecord,
  SQLiteAllergenRepository,
} from './allergenRepositories.js';

interface RollupSignal {
  status: AllergenStatus;
  confidence: AllergenConfidence;
  source_item_id: number | null;
  source_path: string;
  needs_review: boolean;
}

const STATUS_RANK: Record<AllergenStatus, number> = {
  free_of: 0,
  unknown: 1,
  may_contain: 2,
  contains: 3,
};

const CONFIDENCE_RANK: Record<AllergenConfidence, number> = {
  verified: 5,
  high: 4,
  moderate: 3,
  low: 2,
  unverified: 1,
  unknown: 0,
};

export class AllergenRollupService {
  constructor(private readonly repository: SQLiteAllergenRepository) {}

  rebuildRecipeRollup(recipeVersionId: number) {
    const detail = this.repository.getRecipeDetail(recipeVersionId);
    if (!detail) {
      return null;
    }

    const allergens = this.repository.listAllergensReference();
    const ingredients = detail.ingredients;
    const overridesByAllergenId = new Map(detail.overrides.map((override) => [override.allergen_id, override]));
    const itemIds = Array.from(new Set(ingredients.map((ingredient) => ingredient.resolved_item_id).filter((value): value is number => value != null)));
    const itemAllergenRows = this.repository.getItemAllergenRowsForItems(itemIds);
    const itemAllergenByKey = new Map(itemAllergenRows.map((row) => [`${row.item_id}:${row.allergen_id}`, row]));

    const rollupRows = allergens.map((allergen) => {
      const signals = buildSignalsForAllergen({
        allergen,
        ingredients,
        override: overridesByAllergenId.get(allergen.id) ?? null,
        itemAllergenByKey,
      });

      const worstStatus = selectWorstStatus(signals);
      const minConfidence = selectMinConfidence(signals);
      const sourceItemIds = Array.from(new Set(signals.map((signal) => signal.source_item_id).filter((value): value is number => value != null)));
      const sourcePaths = signals.map((signal) => signal.source_path);
      const needsReview = signals.some((signal) => signal.needs_review)
        || worstStatus === 'unknown'
        || CONFIDENCE_RANK[minConfidence] <= CONFIDENCE_RANK.low;

      return {
        allergen_id: allergen.id,
        worst_status: worstStatus,
        min_confidence: minConfidence,
        source_item_ids: sourceItemIds,
        source_paths: sourcePaths,
        needs_review: needsReview,
      };
    });

    this.repository.upsertRecipeRollups(recipeVersionId, rollupRows);
    return this.repository.getRecipeDetail(recipeVersionId);
  }

  rebuildActiveDishRecipeRollups(): number[] {
    const recipeVersionIds = this.repository.listActiveDishRecipeVersionIds();
    for (const recipeVersionId of recipeVersionIds) {
      this.rebuildRecipeRollup(recipeVersionId);
    }
    return recipeVersionIds;
  }
}

function buildSignalsForAllergen(input: {
  allergen: AllergenReference;
  ingredients: RecipeIngredientSourceRecord[];
  override: RecipeOverrideRecord | null;
  itemAllergenByKey: Map<string, { status: AllergenStatus; confidence: AllergenConfidence; notes: string | null }>;
}): RollupSignal[] {
  const signals: RollupSignal[] = [];

  for (const ingredient of input.ingredients) {
    if (ingredient.resolved_item_id == null) {
      signals.push({
        status: 'unknown',
        confidence: 'unknown',
        source_item_id: null,
        source_path: `ingredient:${ingredient.raw_ingredient_text}:unmapped_inventory`,
        needs_review: true,
      });
      continue;
    }

    const itemAllergen = input.itemAllergenByKey.get(`${ingredient.resolved_item_id}:${input.allergen.id}`);
    if (!itemAllergen) {
      signals.push({
        status: 'unknown',
        confidence: 'unknown',
        source_item_id: ingredient.resolved_item_id,
        source_path: `ingredient:${ingredient.raw_ingredient_text}:item:${ingredient.resolved_item_name ?? ingredient.resolved_item_id}:missing_profile`,
        needs_review: true,
      });
      continue;
    }

    signals.push({
      status: itemAllergen.status,
      confidence: itemAllergen.confidence,
      source_item_id: ingredient.resolved_item_id,
      source_path: `ingredient:${ingredient.raw_ingredient_text}:item:${ingredient.resolved_item_name ?? ingredient.resolved_item_id}:${itemAllergen.status}`,
      needs_review: itemAllergen.status === 'unknown' || CONFIDENCE_RANK[itemAllergen.confidence] <= CONFIDENCE_RANK.low,
    });
  }

  if (input.override) {
    signals.push({
      status: input.override.status,
      confidence: 'high',
      source_item_id: null,
      source_path: `override:${input.override.allergen_code}:${input.override.reason}`,
      needs_review: input.override.status === 'unknown',
    });
  }

  if (signals.length === 0) {
    signals.push({
      status: 'unknown',
      confidence: 'unknown',
      source_item_id: null,
      source_path: `recipe:${input.allergen.code}:no_ingredients`,
      needs_review: true,
    });
  }

  return signals;
}

function selectWorstStatus(signals: RollupSignal[]): AllergenStatus {
  return signals.reduce<AllergenStatus>((current, signal) => {
    return STATUS_RANK[signal.status] > STATUS_RANK[current] ? signal.status : current;
  }, 'free_of');
}

function selectMinConfidence(signals: RollupSignal[]): AllergenConfidence {
  return signals.reduce<AllergenConfidence>((current, signal) => {
    return CONFIDENCE_RANK[signal.confidence] < CONFIDENCE_RANK[current] ? signal.confidence : current;
  }, 'verified');
}
