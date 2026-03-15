import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initializeDb } from '../db.js';
import {
  SQLiteCanonicalIngredientRepository,
  syncCanonicalIngredientDictionary,
  type CanonicalIngredientDictionarySeed,
} from '../mapping/ingredients/index.js';
import {
  SQLiteTemplateIngredientMappingRepository,
  buildTemplateIngredientRowKey,
} from '../mapping/templates/index.js';
import {
  SQLiteRecipeBuilderRepository,
  parseRecipeIngredientLine,
  runRecipeBuilderJob,
} from '../recipes/builder/index.js';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  initializeDb(db);
  return db;
}

function createSeed(): CanonicalIngredientDictionarySeed {
  return {
    ingredients: [
      { canonical_name: 'shrimp', category: 'seafood', base_unit: 'g', perishable_flag: true },
      { canonical_name: 'garlic', category: 'produce', base_unit: 'g', perishable_flag: true },
      { canonical_name: 'white wine', category: 'wine', base_unit: 'ml', perishable_flag: false },
      { canonical_name: 'lemon', category: 'produce', base_unit: 'each', perishable_flag: true },
      { canonical_name: 'parsley', category: 'herbs', base_unit: 'g', perishable_flag: true },
      { canonical_name: 'scallion', category: 'produce', base_unit: 'g', perishable_flag: true },
    ],
    aliases: [
      { canonical_name: 'scallion', aliases: ['green onion'] },
      { canonical_name: 'parsley', aliases: [] },
      { canonical_name: 'garlic', aliases: [] },
      { canonical_name: 'shrimp', aliases: [] },
      { canonical_name: 'white wine', aliases: [] },
      { canonical_name: 'lemon', aliases: ['lemons'] },
    ],
  };
}

function seedTemplate(
  db: Database.Database,
  ingredientName: string,
  qty = 2,
  unit = 'tbsp',
): { templateId: number; versionId: number } {
  const templateResult = db.prepare('INSERT INTO recipe_templates (name, category) VALUES (?, ?)').run('Template Base', 'Sauce');
  const templateId = Number(templateResult.lastInsertRowid);
  const versionResult = db.prepare(
    `INSERT INTO recipe_template_versions
      (recipe_template_id, version_number, yield_quantity, yield_unit, source_hash, is_active)
     VALUES (?, 1, 1, 'quart', 'template-v1', 1)`,
  ).run(templateId);
  const versionId = Number(versionResult.lastInsertRowid);
  db.prepare(
    `INSERT INTO recipe_template_ingredients
      (recipe_template_version_id, ingredient_name, qty, unit, sort_order)
     VALUES (?, ?, ?, ?, 1)`,
  ).run(versionId, ingredientName, qty, unit);
  return { templateId, versionId };
}

describe('recipe ingredient parser', () => {
  it('parses simple ingredient lines', () => {
    expect(parseRecipeIngredientLine('2 lb shrimp')).toMatchObject({
      quantity_raw: '2',
      quantity_normalized: 2,
      unit_normalized: 'lb',
      ingredient_text: 'shrimp',
      parse_status: 'PARSED',
    });
  });

  it('parses fractions and decimals', () => {
    expect(parseRecipeIngredientLine('1/2 cup white wine')).toMatchObject({
      quantity_normalized: 0.5,
      unit_normalized: 'cup',
      ingredient_text: 'white wine',
      parse_status: 'PARSED',
    });
    expect(parseRecipeIngredientLine('1.5 oz garlic')).toMatchObject({
      quantity_normalized: 1.5,
      unit_normalized: 'oz',
      ingredient_text: 'garlic',
      parse_status: 'PARSED',
    });
  });

  it('parses safe prep-note separation', () => {
    expect(parseRecipeIngredientLine('2 tbsp chopped parsley')).toMatchObject({
      quantity_normalized: 2,
      unit_normalized: 'tbsp',
      ingredient_text: 'parsley',
      preparation_note: 'chopped',
      parse_status: 'PARSED',
    });
  });

  it('marks vague quantity lines for review', () => {
    expect(parseRecipeIngredientLine('salt to taste')).toMatchObject({
      ingredient_text: 'salt',
      parse_status: 'NEEDS_REVIEW',
    });
    expect(parseRecipeIngredientLine('olive oil as needed')).toMatchObject({
      ingredient_text: 'olive oil',
      parse_status: 'NEEDS_REVIEW',
    });
  });
});

describe('recipe builder assembly engine', () => {
  it('persists a freeform builder job with canonical resolution', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const builderRepository = new SQLiteRecipeBuilderRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');

      const result = await runRecipeBuilderJob(
        {
          source_type: 'freeform',
          source_text: '2 lb shrimp\n1/2 cup white wine\n4 cloves garlic',
          draft_name: 'Shrimp Prep',
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

      expect(result.job.status).toBe('ASSEMBLED');
      expect(result.parsed_rows).toHaveLength(3);
      expect(result.resolution_rows).toHaveLength(3);
      expect(result.resolution_rows.every((row) => row.canonical_match_status === 'matched')).toBe(true);
      expect(result.draft_recipe).toMatchObject({
        draft_name: 'Shrimp Prep',
        completeness_status: 'READY',
        costability_status: 'NEEDS_REVIEW',
        unresolved_canonical_count: 0,
      });
      expect(await builderRepository.getDraftRecipe(result.job.id)).toMatchObject({
        draft_name: 'Shrimp Prep',
      });
    } finally {
      db.close();
    }
  });

  it('preserves original line text while parsing from sanitized working text', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const builderRepository = new SQLiteRecipeBuilderRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');

      const result = await runRecipeBuilderJob(
        {
          source_type: 'freeform',
          source_text: '- 2 lb shrimp',
          draft_name: 'Traceability Draft',
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

      expect(result.parsed_rows[0]).toMatchObject({
        raw_line_text: '- 2 lb shrimp',
        ingredient_text: 'shrimp',
        parse_status: 'PARSED',
      });
    } finally {
      db.close();
    }
  });

  it('records no-match canonical outcomes and review-required draft state', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const builderRepository = new SQLiteRecipeBuilderRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');

      const result = await runRecipeBuilderJob(
        {
          source_type: 'freeform',
          source_text: '2 lb dragonfruit powder',
          draft_name: 'Unknown Item',
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

      expect(result.job.status).toBe('NEEDS_REVIEW');
      expect(result.resolution_rows[0]).toMatchObject({
        canonical_match_status: 'no_match',
        review_status: 'NEEDS_REVIEW',
      });
      expect(result.draft_recipe).toMatchObject({
        completeness_status: 'NEEDS_REVIEW',
        unresolved_canonical_count: 1,
      });
    } finally {
      db.close();
    }
  });

  it('marks draft incomplete when yield is missing even if rows are otherwise ready', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const builderRepository = new SQLiteRecipeBuilderRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');

      const result = await runRecipeBuilderJob(
        {
          source_type: 'freeform',
          source_text: '3 each lemon',
          draft_name: 'Lemon Base',
          source_recipe_type: 'prep',
        },
        {
          source: builderRepository,
          repository: builderRepository,
          canonicalIngredientRepository: canonicalRepository,
        },
      );

      expect(result.draft_recipe).toMatchObject({
        completeness_status: 'INCOMPLETE',
        costability_status: 'NEEDS_REVIEW',
      });
      expect(result.job.status).toBe('NEEDS_REVIEW');
    } finally {
      db.close();
    }
  });

  it('supports template-seeded builder jobs and reuses template canonical mappings when available', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const builderRepository = new SQLiteRecipeBuilderRepository(db);
    const templateMappingRepository = new SQLiteTemplateIngredientMappingRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const { templateId, versionId } = seedTemplate(db, 'green onion', 2, 'tbsp');
      const scallion = canonicalRepository.getCanonicalIngredientByName('scallion');
      if (!scallion) {
        throw new Error('Expected scallion canonical ingredient to exist.');
      }
      const rowKey = buildTemplateIngredientRowKey({
        template_id: templateId,
        template_name: 'Template Base',
        template_category: 'Sauce',
        template_version_id: versionId,
        template_version_number: 1,
        template_version_source_hash: 'template-v1',
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
        explanation_text: 'Resolved from template ingredient mapping queue.',
        source_hash: 'template-mapping-hash',
        active: true,
        resolved_by: null,
        resolved_at: null,
      });

      const result = await runRecipeBuilderJob(
        {
          source_type: 'template',
          source_template_id: templateId,
          source_template_version_id: versionId,
          draft_name: 'Template Draft',
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

      expect(result.parsed_rows[0]).toMatchObject({
        raw_line_text: '2 tbsp green onion',
        parse_status: 'PARSED',
      });
      expect(result.resolution_rows[0]).toMatchObject({
        canonical_match_status: 'matched',
        canonical_ingredient_id: scallion.id,
      });
    } finally {
      db.close();
    }
  });

  it('supports stable reruns against the same builder job', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const builderRepository = new SQLiteRecipeBuilderRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');

      const request = {
        source_type: 'freeform' as const,
        source_text: '2 lb shrimp\n4 cloves garlic',
        draft_name: 'Rerun Draft',
        yield_quantity: 1,
        yield_unit: 'quart',
        source_recipe_type: 'prep' as const,
      };

      const first = await runRecipeBuilderJob(request, {
        source: builderRepository,
        repository: builderRepository,
        canonicalIngredientRepository: canonicalRepository,
      });
      const second = await runRecipeBuilderJob(request, {
        source: builderRepository,
        repository: builderRepository,
        canonicalIngredientRepository: canonicalRepository,
      }, { job_id: first.job.id });

      expect(second.job.id).toBe(first.job.id);
      expect(await builderRepository.listParsedRows(first.job.id)).toHaveLength(2);
      expect(await builderRepository.listResolutionRows(first.job.id)).toHaveLength(2);
      expect(await builderRepository.getDraftRecipe(first.job.id)).toMatchObject({
        draft_name: 'Rerun Draft',
        ingredient_row_count: 2,
      });
    } finally {
      db.close();
    }
  });
});
