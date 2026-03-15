import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  SQLiteCanonicalIngredientRepository,
  normalizeIngredientLookup,
  resolveCanonicalIngredient,
  syncCanonicalIngredientDictionary,
  type CanonicalIngredientDictionarySeed,
} from '../mapping/ingredients/index.js';

function createSeed(): CanonicalIngredientDictionarySeed {
  return {
    ingredients: [
      {
        canonical_name: 'parmesan cheese',
        category: 'dairy',
        base_unit: 'g',
        perishable_flag: true,
      },
      {
        canonical_name: 'olive oil',
        category: 'oil_fat',
        base_unit: 'ml',
        perishable_flag: false,
      },
      {
        canonical_name: 'extra virgin olive oil',
        category: 'oil_fat',
        base_unit: 'ml',
        perishable_flag: false,
      },
      {
        canonical_name: 'scallion',
        category: 'produce',
        base_unit: 'g',
        perishable_flag: true,
      },
    ],
    aliases: [
      {
        canonical_name: 'parmesan cheese',
        aliases: ['parmesan', 'parm'],
      },
      {
        canonical_name: 'olive oil',
        aliases: ['oliveoil'],
      },
      {
        canonical_name: 'extra virgin olive oil',
        aliases: ['evoo'],
      },
      {
        canonical_name: 'scallion',
        aliases: ['green onion'],
      },
    ],
  };
}

function createAmbiguousSeed(): CanonicalIngredientDictionarySeed {
  return {
    ingredients: [
      {
        canonical_name: 'chili paste',
        category: 'condiment',
        base_unit: 'g',
        perishable_flag: true,
      },
      {
        canonical_name: 'chili sauce',
        category: 'condiment',
        base_unit: 'ml',
        perishable_flag: true,
      },
    ],
    aliases: [
      {
        canonical_name: 'chili paste',
        aliases: ['chili'],
      },
      {
        canonical_name: 'chili sauce',
        aliases: ['chili'],
      },
    ],
  };
}

function createRepository(): { db: Database.Database; repository: SQLiteCanonicalIngredientRepository } {
  const db = new Database(':memory:');
  const repository = new SQLiteCanonicalIngredientRepository(db);
  return { db, repository };
}

describe('canonical ingredient dictionary import and resolver', () => {
  it('imports the canonical ingredient seed idempotently', () => {
    const { db, repository } = createRepository();
    try {
      const first = syncCanonicalIngredientDictionary(repository, createSeed(), '2026-03-14T10:00:00.000Z');
      const second = syncCanonicalIngredientDictionary(repository, createSeed(), '2026-03-14T11:00:00.000Z');

      expect(first.summary).toMatchObject({
        ingredients_inserted: 4,
        aliases_inserted: 5,
        ingredients_reused: 0,
        aliases_reused: 0,
      });
      expect(second.summary).toMatchObject({
        ingredients_inserted: 0,
        ingredients_reused: 4,
        aliases_inserted: 0,
        aliases_reused: 5,
      });
      expect(repository.listCanonicalIngredients()).toHaveLength(4);
      expect(repository.listIngredientAliases()).toHaveLength(5);
      expect(repository.listSyncRuns()).toHaveLength(2);
    } finally {
      db.close();
    }
  });

  it('updates existing rows and retires removed aliases when the source changes', () => {
    const { db, repository } = createRepository();
    try {
      syncCanonicalIngredientDictionary(repository, createSeed(), '2026-03-14T10:00:00.000Z');

      const changedSeed: CanonicalIngredientDictionarySeed = {
        ingredients: [
          {
            canonical_name: 'parmesan cheese',
            category: 'dairy',
            base_unit: 'oz',
            perishable_flag: true,
          },
          {
            canonical_name: 'olive oil',
            category: 'oil_fat',
            base_unit: 'ml',
            perishable_flag: false,
          },
          {
            canonical_name: 'extra virgin olive oil',
            category: 'oil_fat',
            base_unit: 'ml',
            perishable_flag: false,
          },
          {
            canonical_name: 'scallion',
            category: 'produce',
            base_unit: 'g',
            perishable_flag: true,
          },
        ],
        aliases: [
          {
            canonical_name: 'parmesan cheese',
            aliases: ['parmesan'],
          },
          {
            canonical_name: 'olive oil',
            aliases: ['oliveoil'],
          },
          {
            canonical_name: 'extra virgin olive oil',
            aliases: ['evoo', 'extra-virgin olive oil'],
          },
          {
            canonical_name: 'scallion',
            aliases: ['green onion'],
          },
        ],
      };

      const result = syncCanonicalIngredientDictionary(repository, changedSeed, '2026-03-14T12:00:00.000Z');
      const parmesan = repository.getCanonicalIngredientByName('parmesan cheese');
      const aliases = repository.listIngredientAliases();
      const retiredParmAlias = aliases.find((alias) => alias.alias === 'parm');
      const newEvooAlias = aliases.find((alias) => alias.alias === 'extra-virgin olive oil');

      expect(result.summary).toMatchObject({
        ingredients_updated: 1,
        aliases_inserted: 1,
        aliases_retired: 1,
      });
      expect(parmesan?.base_unit).toBe('oz');
      expect(retiredParmAlias?.active).toBe(false);
      expect(newEvooAlias?.active).toBe(true);
    } finally {
      db.close();
    }
  });

  it('resolves an exact canonical match', async () => {
    const { db, repository } = createRepository();
    try {
      syncCanonicalIngredientDictionary(repository, createSeed(), '2026-03-14T10:00:00.000Z');

      const result = await resolveCanonicalIngredient('parmesan cheese', repository);
      expect(result).toMatchObject({
        status: 'matched',
        matched_canonical_name: 'parmesan cheese',
        match_reason: 'exact_canonical',
        confidence_label: 'high',
      });
    } finally {
      db.close();
    }
  });

  it('resolves a normalized canonical match', async () => {
    const { db, repository } = createRepository();
    try {
      syncCanonicalIngredientDictionary(repository, createSeed(), '2026-03-14T10:00:00.000Z');

      const result = await resolveCanonicalIngredient('Parmesan-Cheese', repository);
      expect(normalizeIngredientLookup('Parmesan-Cheese')).toBe('parmesan cheese');
      expect(result).toMatchObject({
        status: 'matched',
        matched_canonical_name: 'parmesan cheese',
        match_reason: 'normalized_canonical',
      });
    } finally {
      db.close();
    }
  });

  it('resolves an exact alias match', async () => {
    const { db, repository } = createRepository();
    try {
      syncCanonicalIngredientDictionary(repository, createSeed(), '2026-03-14T10:00:00.000Z');

      const result = await resolveCanonicalIngredient('parm', repository);
      expect(result).toMatchObject({
        status: 'matched',
        matched_canonical_name: 'parmesan cheese',
        match_reason: 'exact_alias',
      });
    } finally {
      db.close();
    }
  });

  it('resolves a normalized alias match', async () => {
    const { db, repository } = createRepository();
    try {
      syncCanonicalIngredientDictionary(repository, createSeed(), '2026-03-14T10:00:00.000Z');

      const result = await resolveCanonicalIngredient('Green-Onion', repository);
      expect(result).toMatchObject({
        status: 'matched',
        matched_canonical_name: 'scallion',
        match_reason: 'normalized_alias',
      });
    } finally {
      db.close();
    }
  });

  it('returns no_match when nothing deterministic resolves', async () => {
    const { db, repository } = createRepository();
    try {
      syncCanonicalIngredientDictionary(repository, createSeed(), '2026-03-14T10:00:00.000Z');

      const result = await resolveCanonicalIngredient('mystery sauce', repository);
      expect(result).toMatchObject({
        status: 'no_match',
        match_reason: 'no_match',
        matched_canonical_name: null,
      });
    } finally {
      db.close();
    }
  });

  it('returns ambiguous when a normalized alias matches multiple canonical ingredients', async () => {
    const { db, repository } = createRepository();
    try {
      syncCanonicalIngredientDictionary(repository, createAmbiguousSeed(), '2026-03-14T10:00:00.000Z');

      const result = await resolveCanonicalIngredient('chili', repository);
      expect(result.status).toBe('ambiguous');
      expect(result.matches).toHaveLength(2);
      expect(result.matched_canonical_name).toBeNull();
    } finally {
      db.close();
    }
  });

  it('preserves meaningful distinctions between olive oil and extra virgin olive oil', async () => {
    const { db, repository } = createRepository();
    try {
      syncCanonicalIngredientDictionary(repository, createSeed(), '2026-03-14T10:00:00.000Z');

      const oliveOil = await resolveCanonicalIngredient('olive oil', repository);
      const evoo = await resolveCanonicalIngredient('extra virgin olive oil', repository);
      const compactEvoo = await resolveCanonicalIngredient('EVOO', repository);

      expect(oliveOil.matched_canonical_name).toBe('olive oil');
      expect(evoo.matched_canonical_name).toBe('extra virgin olive oil');
      expect(compactEvoo.matched_canonical_name).toBe('extra virgin olive oil');
      expect(oliveOil.matched_canonical_name).not.toBe(compactEvoo.matched_canonical_name);
    } finally {
      db.close();
    }
  });
});
