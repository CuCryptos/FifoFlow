import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initializeDb } from '../db.js';
import {
  SQLiteCanonicalIngredientRepository,
  syncCanonicalIngredientDictionary,
  type CanonicalIngredientDictionarySeed,
} from '../mapping/ingredients/index.js';
import { SQLiteTemplateIngredientMappingRepository, buildTemplateIngredientRowKey } from '../mapping/templates/index.js';
import { SQLiteRecipeBuilderRepository, runRecipeBuilderJob } from '../recipes/builder/index.js';
import { evaluateDraftPromotion, executeRecipePromotion, SQLiteRecipePromotionRepository } from '../recipes/promotion/index.js';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  initializeDb(db);
  return db;
}

function createSeed(): CanonicalIngredientDictionarySeed {
  return {
    ingredients: [
      { canonical_name: 'shrimp', category: 'seafood', base_unit: 'g', perishable_flag: true },
      { canonical_name: 'white wine', category: 'wine', base_unit: 'ml', perishable_flag: false },
      { canonical_name: 'garlic', category: 'produce', base_unit: 'g', perishable_flag: true },
      { canonical_name: 'scallion', category: 'produce', base_unit: 'g', perishable_flag: true },
      { canonical_name: 'salt', category: 'spices', base_unit: 'g', perishable_flag: false },
    ],
    aliases: [
      { canonical_name: 'shrimp', aliases: [] },
      { canonical_name: 'white wine', aliases: [] },
      { canonical_name: 'garlic', aliases: [] },
      { canonical_name: 'scallion', aliases: ['green onion'] },
      { canonical_name: 'salt', aliases: [] },
    ],
  };
}

function seedTemplate(db: Database.Database, ingredientName: string): { templateId: number; versionId: number } {
  const template = db.prepare('INSERT INTO recipe_templates (name, category) VALUES (?, ?)').run('Template Promotion', 'Sauce');
  const templateId = Number(template.lastInsertRowid);
  const version = db.prepare(
    `INSERT INTO recipe_template_versions
      (recipe_template_id, version_number, yield_quantity, yield_unit, source_hash, is_active)
     VALUES (?, 1, 1, 'quart', 'template-promotion-v1', 1)`,
  ).run(templateId);
  const versionId = Number(version.lastInsertRowid);
  db.prepare(
    `INSERT INTO recipe_template_ingredients
      (recipe_template_version_id, ingredient_name, qty, unit, sort_order)
     VALUES (?, ?, 2, 'tbsp', 1)`,
  ).run(versionId, ingredientName);
  return { templateId, versionId };
}

describe('recipe promotion engine', () => {
  it('promotes a trusted draft into recipe, recipe version, and recipe ingredients', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const builderRepository = new SQLiteRecipeBuilderRepository(db);
    const promotionRepository = new SQLiteRecipePromotionRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const draft = await runRecipeBuilderJob(
        {
          source_type: 'freeform',
          source_text: '2 lb shrimp\n1/2 cup white wine\n4 cloves garlic',
          draft_name: 'Shrimp Scampi Base',
          yield_quantity: 1,
          yield_unit: 'quart',
          source_recipe_type: 'prep',
        },
        {
          source: builderRepository,
          repository: builderRepository,
          canonicalIngredientRepository: canonicalRepository,
        },
      );

      const result = await executeRecipePromotion(
        { recipe_builder_job_id: draft.job.id, created_by: 'tester' },
        promotionRepository,
      );

      expect(result.evaluation.status).toBe('PROMOTED');
      expect(result.recipe).toMatchObject({ name: 'Shrimp Scampi Base', type: 'prep' });
      expect(result.recipe_version).toMatchObject({ version_number: 1, yield_quantity: 1, yield_unit: 'quart' });
      expect(result.recipe_ingredients).toHaveLength(3);
      expect(result.promotion_event).toMatchObject({ action_type: 'PROMOTED_NEW_RECIPE', status: 'PROMOTED' });
      expect(result.costability_status).toBe('OPERATIONAL_ONLY');

      const versions = await promotionRepository.listRecipeVersions(result.recipe!.id);
      const ingredients = await promotionRepository.listRecipeIngredients(result.recipe_version!.id);
      expect(versions).toHaveLength(1);
      expect(ingredients).toHaveLength(3);
    } finally {
      db.close();
    }
  });

  it('blocks promotion when yield is missing and returns structured blocking reasons', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const builderRepository = new SQLiteRecipeBuilderRepository(db);
    const promotionRepository = new SQLiteRecipePromotionRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const draft = await runRecipeBuilderJob(
        {
          source_type: 'freeform',
          source_text: '2 lb shrimp',
          draft_name: 'Yield Missing Draft',
          source_recipe_type: 'prep',
        },
        {
          source: builderRepository,
          repository: builderRepository,
          canonicalIngredientRepository: canonicalRepository,
        },
      );

      const result = await executeRecipePromotion(
        { recipe_builder_job_id: draft.job.id, created_by: 'tester' },
        promotionRepository,
      );

      expect(result.recipe).toBeNull();
      expect(result.evaluation.status).toBe('REVIEW_READY');
      expect(result.evaluation.blocking_reasons.map((reason) => reason.code)).toEqual(
        expect.arrayContaining(['MISSING_YIELD_QUANTITY', 'MISSING_YIELD_UNIT']),
      );
      expect(result.costability_status).toBe('BLOCKED_FOR_COSTING');
    } finally {
      db.close();
    }
  });

  it('prevents promotion when a blocked ingredient row exists', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const builderRepository = new SQLiteRecipeBuilderRepository(db);
    const promotionRepository = new SQLiteRecipePromotionRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const job = await builderRepository.createJob({
        source_type: 'freeform',
        source_text: 'unparsed line',
        draft_name: 'Blocked Draft',
        yield_quantity: 1,
        yield_unit: 'quart',
        source_recipe_type: 'prep',
      });
      await builderRepository.replaceParsedRows(job.id, [
        {
          line_index: 1,
          raw_line_text: 'unparsed line',
          source_template_ingredient_name: null,
          source_template_quantity: null,
          source_template_unit: null,
          source_template_sort_order: null,
          quantity_raw: null,
          quantity_normalized: null,
          unit_raw: null,
          unit_normalized: null,
          ingredient_text: null,
          preparation_note: null,
          parse_status: 'FAILED',
          parser_confidence: 'LOW',
          estimated_flag: 0,
          estimation_basis: null,
          alternative_item_matches: [],
          alternative_recipe_matches: [],
          detected_component_type: 'unknown',
          matched_recipe_id: null,
          matched_recipe_version_id: null,
          match_basis: null,
          explanation_text: 'Forced failed parse for promotion gating test.',
        },
      ]);
      await builderRepository.replaceResolutionRows(job.id, [
        {
          parsed_row_id: 1,
          canonical_ingredient_id: null,
          canonical_match_status: 'skipped',
          canonical_confidence: 'LOW',
          canonical_match_reason: null,
          inventory_item_id: null,
          inventory_mapping_status: 'SKIPPED',
          recipe_mapping_status: 'SKIPPED',
          recipe_id: null,
          recipe_version_id: null,
          recipe_match_confidence: null,
          recipe_match_reason: null,
          quantity_normalization_status: 'FAILED',
          review_status: 'BLOCKED',
          explanation_text: 'Blocked row for promotion test.',
        },
      ]);
      await builderRepository.upsertDraftRecipe({
        recipe_builder_job_id: job.id,
        draft_name: 'Blocked Draft',
        draft_notes: null,
        yield_quantity: 1,
        yield_unit: 'quart',
        serving_quantity: null,
        serving_unit: null,
        serving_count: null,
        completeness_status: 'BLOCKED',
        costability_status: 'NOT_COSTABLE',
        ingredient_row_count: 1,
        ready_row_count: 0,
        review_row_count: 0,
        blocked_row_count: 1,
        unresolved_canonical_count: 1,
        unresolved_inventory_count: 1,
        source_recipe_type: 'prep',
        method_notes: null,
        review_priority: 'normal',
        ready_for_review_flag: 0,
        approved_by: null,
        approved_at: null,
        rejected_by: null,
        rejected_at: null,
        rejection_reason: null,
      });

      const result = await executeRecipePromotion(
        { recipe_builder_job_id: job.id, created_by: 'tester' },
        promotionRepository,
      );

      expect(result.recipe).toBeNull();
      expect(result.evaluation.blocking_reasons.map((reason) => reason.code)).toContain('BLOCKED_ROW_PRESENT');
    } finally {
      db.close();
    }
  });

  it('prevents trustworthy promotion when canonical identity is unresolved', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const builderRepository = new SQLiteRecipeBuilderRepository(db);
    const promotionRepository = new SQLiteRecipePromotionRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const draft = await runRecipeBuilderJob(
        {
          source_type: 'freeform',
          source_text: '2 lb dragonfruit powder',
          draft_name: 'Unresolved Identity',
          yield_quantity: 1,
          yield_unit: 'quart',
          source_recipe_type: 'prep',
        },
        {
          source: builderRepository,
          repository: builderRepository,
          canonicalIngredientRepository: canonicalRepository,
        },
      );

      const result = await executeRecipePromotion(
        { recipe_builder_job_id: draft.job.id, created_by: 'tester' },
        promotionRepository,
      );

      expect(result.recipe).toBeNull();
      expect(result.evaluation.blocking_reasons.map((reason) => reason.code)).toContain('UNRESOLVED_CANONICAL_IDENTITY');
    } finally {
      db.close();
    }
  });

  it('allows operational promotion without inventory mapping but keeps costing non-final', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const builderRepository = new SQLiteRecipeBuilderRepository(db);
    const promotionRepository = new SQLiteRecipePromotionRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const draft = await runRecipeBuilderJob(
        {
          source_type: 'freeform',
          source_text: '2 lb shrimp',
          draft_name: 'Operational Only Draft',
          yield_quantity: 1,
          yield_unit: 'quart',
          source_recipe_type: 'prep',
        },
        {
          source: builderRepository,
          repository: builderRepository,
          canonicalIngredientRepository: canonicalRepository,
        },
      );

      const result = await executeRecipePromotion(
        { recipe_builder_job_id: draft.job.id },
        promotionRepository,
      );

      expect(result.recipe).not.toBeNull();
      expect(result.costability_status).toBe('OPERATIONAL_ONLY');
      expect(result.recipe_ingredients[0]?.inventory_item_id).toBeNull();
    } finally {
      db.close();
    }
  });

  it('does not duplicate recipe/version rows on repeat promotion without revision intent', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const builderRepository = new SQLiteRecipeBuilderRepository(db);
    const promotionRepository = new SQLiteRecipePromotionRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const draft = await runRecipeBuilderJob(
        {
          source_type: 'freeform',
          source_text: '2 lb shrimp',
          draft_name: 'Repeat Draft',
          yield_quantity: 1,
          yield_unit: 'quart',
          source_recipe_type: 'prep',
        },
        {
          source: builderRepository,
          repository: builderRepository,
          canonicalIngredientRepository: canonicalRepository,
        },
      );

      const first = await executeRecipePromotion({ recipe_builder_job_id: draft.job.id }, promotionRepository);
      const second = await executeRecipePromotion({ recipe_builder_job_id: draft.job.id }, promotionRepository);

      expect(first.recipe?.id).toBe(second.recipe?.id);
      expect(first.recipe_version?.id).toBe(second.recipe_version?.id);
      expect((await promotionRepository.listRecipeVersions(first.recipe!.id))).toHaveLength(1);
      expect((await promotionRepository.listPromotionEvents(draft.job.id)).map((event) => event.action_type)).toEqual([
        'PROMOTED_NEW_RECIPE',
        'PROMOTION_REUSED',
      ]);
    } finally {
      db.close();
    }
  });

  it('preserves freeform source lineage on promoted recipe versions', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const builderRepository = new SQLiteRecipeBuilderRepository(db);
    const promotionRepository = new SQLiteRecipePromotionRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const sourceText = '2 lb shrimp\n4 cloves garlic';
      const draft = await runRecipeBuilderJob(
        {
          source_type: 'freeform',
          source_text: sourceText,
          draft_name: 'Freeform Lineage',
          yield_quantity: 1,
          yield_unit: 'quart',
          source_recipe_type: 'prep',
        },
        {
          source: builderRepository,
          repository: builderRepository,
          canonicalIngredientRepository: canonicalRepository,
        },
      );

      const result = await executeRecipePromotion({ recipe_builder_job_id: draft.job.id }, promotionRepository);
      const version = (await promotionRepository.listRecipeVersions(result.recipe!.id))[0];

      expect(version).toMatchObject({
        source_builder_job_id: draft.job.id,
        source_builder_draft_recipe_id: draft.draft_recipe.id,
        source_text_snapshot: sourceText,
      });
    } finally {
      db.close();
    }
  });

  it('preserves template lineage on promoted recipe versions', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const builderRepository = new SQLiteRecipeBuilderRepository(db);
    const promotionRepository = new SQLiteRecipePromotionRepository(db);
    const templateMappingRepository = new SQLiteTemplateIngredientMappingRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const { templateId, versionId } = seedTemplate(db, 'green onion');
      const scallion = canonicalRepository.getCanonicalIngredientByName('scallion');
      if (!scallion) {
        throw new Error('Expected scallion canonical ingredient.');
      }
      const rowKey = buildTemplateIngredientRowKey({
        template_id: templateId,
        template_name: 'Template Promotion',
        template_category: 'Sauce',
        template_version_id: versionId,
        template_version_number: 1,
        template_version_source_hash: 'template-promotion-v1',
        ingredient_name: 'green onion',
        normalized_ingredient_name: 'green onion',
        qty: 2,
        unit: 'tbsp',
        sort_order: 1,
      });
      await templateMappingRepository.upsertMapping({
        template_id: templateId,
        template_version_id: versionId,
        template_ingredient_row_key: rowKey,
        ingredient_name: 'green onion',
        normalized_ingredient_name: 'green onion',
        mapped_canonical_ingredient_id: scallion.id,
        mapping_status: 'AUTO_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'normalized_alias',
        chosen_candidate_id: null,
        explanation_text: 'Template canonical mapping exists.',
        source_hash: 'template-promotion-row',
        active: true,
        resolved_by: null,
        resolved_at: null,
      });

      const draft = await runRecipeBuilderJob(
        {
          source_type: 'template',
          source_template_id: templateId,
          source_template_version_id: versionId,
          draft_name: 'Template Promoted Recipe',
          yield_quantity: 1,
          yield_unit: 'quart',
          source_recipe_type: 'prep',
        },
        {
          source: builderRepository,
          repository: builderRepository,
          canonicalIngredientRepository: canonicalRepository,
        },
      );

      const result = await executeRecipePromotion({ recipe_builder_job_id: draft.job.id }, promotionRepository);
      const version = (await promotionRepository.listRecipeVersions(result.recipe!.id))[0];

      expect(version).toMatchObject({
        source_template_id: templateId,
        source_template_version_id: versionId,
        source_builder_job_id: draft.job.id,
      });
    } finally {
      db.close();
    }
  });

  it('returns explicit evaluation output for reviewable drafts', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const builderRepository = new SQLiteRecipeBuilderRepository(db);
    const promotionRepository = new SQLiteRecipePromotionRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const draft = await runRecipeBuilderJob(
        {
          source_type: 'freeform',
          source_text: 'salt to taste',
          draft_name: 'Review Draft',
          yield_quantity: 1,
          yield_unit: 'quart',
          source_recipe_type: 'prep',
        },
        {
          source: builderRepository,
          repository: builderRepository,
          canonicalIngredientRepository: canonicalRepository,
        },
      );
      const context = await promotionRepository.loadDraftContext(draft.job.id);
      if (!context) {
        throw new Error('Expected promotion draft context.');
      }

      const evaluation = evaluateDraftPromotion(context, { promotion_mode: 'create_new' });
      expect(evaluation.status).toBe('REVIEW_READY');
      expect(evaluation.blocking_reasons.map((reason) => reason.code)).toEqual(
        expect.arrayContaining(['UNTRUSTED_PARSE_ROW']),
      );
    } finally {
      db.close();
    }
  });
});
