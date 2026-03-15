import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  SQLiteCanonicalIngredientRepository,
  syncCanonicalIngredientDictionary,
  type CanonicalIngredientDictionarySeed,
} from '../mapping/ingredients/index.js';
import {
  SQLiteTemplateIngredientMappingRepository,
  buildTemplateIngredientRowKey,
  runTemplateIngredientMappingJob,
} from '../mapping/templates/index.js';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS recipe_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recipe_template_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_template_id INTEGER NOT NULL REFERENCES recipe_templates(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      yield_quantity REAL NOT NULL,
      yield_unit TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(recipe_template_id, version_number),
      UNIQUE(recipe_template_id, source_hash)
    );

    CREATE TABLE IF NOT EXISTS recipe_template_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_template_version_id INTEGER NOT NULL REFERENCES recipe_template_versions(id) ON DELETE CASCADE,
      ingredient_name TEXT NOT NULL,
      qty REAL NOT NULL,
      unit TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(recipe_template_version_id, sort_order)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_template_versions_active
      ON recipe_template_versions(recipe_template_id)
      WHERE is_active = 1;
  `);
  return db;
}

function baseSeed(): CanonicalIngredientDictionarySeed {
  return {
    ingredients: [
      { canonical_name: 'parmesan cheese', category: 'dairy', base_unit: 'g', perishable_flag: true },
      { canonical_name: 'olive oil', category: 'oil_fat', base_unit: 'ml', perishable_flag: false },
      { canonical_name: 'scallion', category: 'produce', base_unit: 'g', perishable_flag: true },
      { canonical_name: 'chili paste', category: 'condiment', base_unit: 'g', perishable_flag: true },
      { canonical_name: 'chili sauce', category: 'condiment', base_unit: 'ml', perishable_flag: true },
    ],
    aliases: [
      { canonical_name: 'parmesan cheese', aliases: ['parmesan', 'parm'] },
      { canonical_name: 'olive oil', aliases: ['oliveoil'] },
      { canonical_name: 'scallion', aliases: ['green onion'] },
      { canonical_name: 'chili paste', aliases: ['chili'] },
      { canonical_name: 'chili sauce', aliases: ['chili'] },
    ],
  };
}

function seedTemplate(
  db: Database.Database,
  templateName: string,
  ingredientName: string,
  sortOrder = 1,
): { templateId: number; versionId: number } {
  const templateResult = db.prepare(
    'INSERT INTO recipe_templates (name, category) VALUES (?, ?)',
  ).run(templateName, 'Sauce');
  const templateId = Number(templateResult.lastInsertRowid);
  const versionResult = db.prepare(
    `INSERT INTO recipe_template_versions
      (recipe_template_id, version_number, yield_quantity, yield_unit, source_hash, is_active)
     VALUES (?, 1, 1, 'quart', ?, 1)`,
  ).run(templateId, `${templateName}:v1`);
  const versionId = Number(versionResult.lastInsertRowid);
  db.prepare(
    `INSERT INTO recipe_template_ingredients
      (recipe_template_version_id, ingredient_name, qty, unit, sort_order)
     VALUES (?, ?, 1, 'cup', ?)`,
  ).run(versionId, ingredientName, sortOrder);
  return { templateId, versionId };
}

describe('template ingredient mapping engine', () => {
  it('auto-maps an exact canonical name', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteTemplateIngredientMappingRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, baseSeed(), '2026-03-14T10:00:00.000Z');
      seedTemplate(db, 'Exact Canonical', 'parmesan cheese');

      const result = await runTemplateIngredientMappingJob({
        source: mappingRepository,
        repository: mappingRepository,
        canonicalIngredientRepository: canonicalRepository,
      });

      expect(result.run_summary.auto_mapped).toBe(1);
      expect(mappingRepository.listMappings()).toEqual([
        expect.objectContaining({
          ingredient_name: 'parmesan cheese',
          mapping_status: 'AUTO_MAPPED',
          match_reason: 'exact_canonical_name',
          confidence_label: 'HIGH',
          mapped_canonical_ingredient_id: expect.any(Number),
        }),
      ]);
    } finally {
      db.close();
    }
  });

  it('auto-maps a normalized canonical name and preserves original plus normalized text', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteTemplateIngredientMappingRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, baseSeed(), '2026-03-14T10:00:00.000Z');
      seedTemplate(db, 'Normalized Canonical', 'Parmesan-Cheese');

      await runTemplateIngredientMappingJob({
        source: mappingRepository,
        repository: mappingRepository,
        canonicalIngredientRepository: canonicalRepository,
      });

      const [mapping] = mappingRepository.listMappings();
      expect(mapping).toMatchObject({
        ingredient_name: 'Parmesan-Cheese',
        normalized_ingredient_name: 'parmesan cheese',
        mapping_status: 'AUTO_MAPPED',
        match_reason: 'normalized_canonical_name',
      });
    } finally {
      db.close();
    }
  });

  it('auto-maps exact and normalized aliases', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteTemplateIngredientMappingRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, baseSeed(), '2026-03-14T10:00:00.000Z');
      seedTemplate(db, 'Exact Alias', 'parm');
      seedTemplate(db, 'Normalized Alias', 'Green-Onion');

      const result = await runTemplateIngredientMappingJob({
        source: mappingRepository,
        repository: mappingRepository,
        canonicalIngredientRepository: canonicalRepository,
      });

      expect(result.run_summary.auto_mapped).toBe(2);
      const mappings = mappingRepository.listMappings();
      expect(mappings).toEqual(expect.arrayContaining([
        expect.objectContaining({ ingredient_name: 'parm', match_reason: 'exact_alias', mapping_status: 'AUTO_MAPPED' }),
        expect.objectContaining({ ingredient_name: 'Green-Onion', match_reason: 'normalized_alias', mapping_status: 'AUTO_MAPPED' }),
      ]));
    } finally {
      db.close();
    }
  });

  it('places ambiguous results into NEEDS_REVIEW and creates candidate rows', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteTemplateIngredientMappingRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, baseSeed(), '2026-03-14T10:00:00.000Z');
      seedTemplate(db, 'Ambiguous Ingredient', 'chili');

      const result = await runTemplateIngredientMappingJob({
        source: mappingRepository,
        repository: mappingRepository,
        canonicalIngredientRepository: canonicalRepository,
      });

      expect(result.run_summary.needs_review).toBe(1);
      expect(result.run_summary.candidates_created).toBe(2);
      const [mapping] = await mappingRepository.listActiveMappingsByStatus('NEEDS_REVIEW');
      const candidates = await mappingRepository.listCandidatesForMapping(mapping.id);
      expect(mapping).toMatchObject({
        mapping_status: 'NEEDS_REVIEW',
        match_reason: 'ambiguous_match',
        mapped_canonical_ingredient_id: null,
      });
      expect(candidates).toHaveLength(2);
      expect(candidates.map((candidate) => candidate.candidate_canonical_name)).toEqual(['chili paste', 'chili sauce']);
    } finally {
      db.close();
    }
  });

  it('places unresolved rows into UNMAPPED without guessing', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteTemplateIngredientMappingRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, baseSeed(), '2026-03-14T10:00:00.000Z');
      seedTemplate(db, 'Unknown Ingredient', 'dragonfruit powder');

      const result = await runTemplateIngredientMappingJob({
        source: mappingRepository,
        repository: mappingRepository,
        canonicalIngredientRepository: canonicalRepository,
      });

      expect(result.run_summary.unmapped).toBe(1);
      expect(mappingRepository.listMappings()).toEqual([
        expect.objectContaining({
          ingredient_name: 'dragonfruit powder',
          mapping_status: 'UNMAPPED',
          match_reason: 'no_match',
          mapped_canonical_ingredient_id: null,
        }),
      ]);
      expect(mappingRepository.listCandidates()).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it('preserves meaningful ingredient distinctions instead of collapsing to a broader canonical name', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteTemplateIngredientMappingRepository(db);
    try {
      const seed: CanonicalIngredientDictionarySeed = {
        ingredients: [
          { canonical_name: 'olive oil', category: 'oil_fat', base_unit: 'ml', perishable_flag: false },
        ],
        aliases: [
          { canonical_name: 'olive oil', aliases: ['oliveoil'] },
        ],
      };
      syncCanonicalIngredientDictionary(canonicalRepository, seed, '2026-03-14T10:00:00.000Z');
      seedTemplate(db, 'Meaningful Distinction', 'extra virgin olive oil');

      await runTemplateIngredientMappingJob({
        source: mappingRepository,
        repository: mappingRepository,
        canonicalIngredientRepository: canonicalRepository,
      });

      expect(mappingRepository.listMappings()).toEqual([
        expect.objectContaining({
          ingredient_name: 'extra virgin olive oil',
          mapping_status: 'UNMAPPED',
          mapped_canonical_ingredient_id: null,
          match_reason: 'no_match',
        }),
      ]);
    } finally {
      db.close();
    }
  });

  it('is idempotent on rerun and does not duplicate mapping rows', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteTemplateIngredientMappingRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, baseSeed(), '2026-03-14T10:00:00.000Z');
      const seeded = seedTemplate(db, 'Idempotent Template', 'parm');

      const first = await runTemplateIngredientMappingJob({
        source: mappingRepository,
        repository: mappingRepository,
        canonicalIngredientRepository: canonicalRepository,
      });
      const second = await runTemplateIngredientMappingJob({
        source: mappingRepository,
        repository: mappingRepository,
        canonicalIngredientRepository: canonicalRepository,
      });

      expect(first.run_summary.mappings_created).toBe(1);
      expect(second.run_summary.mappings_reused).toBe(1);
      const mappings = mappingRepository.listMappings();
      expect(mappings).toHaveLength(1);
      expect(mappings[0]?.template_ingredient_row_key).toBe(
        buildTemplateIngredientRowKey({
          template_id: seeded.templateId,
          template_name: 'Idempotent Template',
          template_category: 'Sauce',
          template_version_id: seeded.versionId,
          template_version_number: 1,
          template_version_source_hash: 'Idempotent Template:v1',
          ingredient_name: 'parm',
          normalized_ingredient_name: 'parm',
          qty: 1,
          unit: 'cup',
          sort_order: 1,
        }),
      );
    } finally {
      db.close();
    }
  });

  it('updates automated mappings when resolver outcomes improve', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteTemplateIngredientMappingRepository(db);
    try {
      const initialSeed: CanonicalIngredientDictionarySeed = {
        ingredients: [
          { canonical_name: 'scallion', category: 'produce', base_unit: 'g', perishable_flag: true },
        ],
        aliases: [
          { canonical_name: 'scallion', aliases: [] },
        ],
      };
      syncCanonicalIngredientDictionary(canonicalRepository, initialSeed, '2026-03-14T10:00:00.000Z');
      seedTemplate(db, 'Outcome Update', 'green onion');

      const first = await runTemplateIngredientMappingJob({
        source: mappingRepository,
        repository: mappingRepository,
        canonicalIngredientRepository: canonicalRepository,
      });
      expect(first.run_summary.unmapped).toBe(1);

      const updatedSeed: CanonicalIngredientDictionarySeed = {
        ingredients: initialSeed.ingredients,
        aliases: [
          { canonical_name: 'scallion', aliases: ['green onion'] },
        ],
      };
      syncCanonicalIngredientDictionary(canonicalRepository, updatedSeed, '2026-03-14T11:00:00.000Z');

      const second = await runTemplateIngredientMappingJob({
        source: mappingRepository,
        repository: mappingRepository,
        canonicalIngredientRepository: canonicalRepository,
      });

      expect(second.run_summary.mappings_updated).toBe(1);
      expect(mappingRepository.listMappings()).toEqual([
        expect.objectContaining({
          ingredient_name: 'green onion',
          mapping_status: 'AUTO_MAPPED',
          match_reason: 'exact_alias',
          confidence_label: 'HIGH',
        }),
      ]);
    } finally {
      db.close();
    }
  });
});
