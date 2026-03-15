import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initializeDb } from '../db.js';
import {
  SQLiteCanonicalIngredientRepository,
  syncCanonicalIngredientDictionary,
  type CanonicalIngredientDictionarySeed,
} from '../mapping/ingredients/index.js';
import {
  SQLiteCanonicalInventoryRepository,
  evaluateRecipeCostabilityReadiness,
  executeCanonicalInventoryMappingJob,
  resolveCanonicalInventoryItem,
} from '../mapping/inventory/index.js';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  initializeDb(db);
  return db;
}

function createSeed(): CanonicalIngredientDictionarySeed {
  return {
    ingredients: [
      { canonical_name: 'olive oil', category: 'oil_fat', base_unit: 'ml', perishable_flag: false },
      { canonical_name: 'garlic', category: 'produce', base_unit: 'g', perishable_flag: true },
      { canonical_name: 'parmesan cheese', category: 'dairy', base_unit: 'g', perishable_flag: true },
    ],
    aliases: [
      { canonical_name: 'olive oil', aliases: ['evoo'] },
      { canonical_name: 'garlic', aliases: [] },
      { canonical_name: 'parmesan cheese', aliases: ['parmesan'] },
    ],
  };
}

function seedVenue(db: Database.Database, name: string): number {
  const result = db.prepare('INSERT INTO venues (name) VALUES (?)').run(name);
  return Number(result.lastInsertRowid);
}

function seedItem(
  db: Database.Database,
  input: { name: string; category?: string; unit?: string; venue_id?: number | null },
): number {
  const result = db.prepare(
    `
      INSERT INTO items (name, category, unit, current_qty, venue_id)
      VALUES (?, ?, ?, 0, ?)
    `,
  ).run(input.name, input.category ?? 'general', input.unit ?? 'ml', input.venue_id ?? null);
  return Number(result.lastInsertRowid);
}

function seedRecipeVersion(db: Database.Database, recipeName: string): { recipeId: number; recipeVersionId: number } {
  const recipeId = Number(db.prepare('INSERT INTO recipes (name, type, notes) VALUES (?, ?, ?)').run(recipeName, 'prep', null).lastInsertRowid);
  const recipeVersionId = Number(db.prepare(
    `
      INSERT INTO recipe_versions (
        recipe_id,
        version_number,
        status,
        yield_quantity,
        yield_unit,
        source_builder_job_id,
        source_builder_draft_recipe_id,
        source_template_id,
        source_template_version_id,
        source_text_snapshot
      ) VALUES (?, 1, 'active', 1, 'quart', NULL, NULL, NULL, NULL, NULL)
    `,
  ).run(recipeId).lastInsertRowid);
  return { recipeId, recipeVersionId };
}

describe('canonical ingredient to inventory mapping', () => {
  it('resolves an organization default mapping', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteCanonicalInventoryRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      seedItem(db, { name: 'olive oil', category: 'oil_fat', unit: 'ml' });
      const oliveOil = canonicalRepository.getCanonicalIngredientByName('olive oil');
      if (!oliveOil) throw new Error('missing seed ingredient');

      await executeCanonicalInventoryMappingJob({
        scope_type: 'organization',
        scope_ref_id: 1,
        canonical_ingredient_ids: [oliveOil.id],
      }, mappingRepository);

      const result = await resolveCanonicalInventoryItem({
        canonical_ingredient_id: oliveOil.id,
        subject_scope: { organization_id: 1 },
      }, mappingRepository);

      expect(result.inventory_item_id).not.toBeNull();
      expect(result.mapping_status).toBe('AUTO_MAPPED');
      expect(result.matched_scope_type).toBe('organization');
      expect(result.trusted).toBe(true);
    } finally {
      db.close();
    }
  });

  it('location override beats organization default', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteCanonicalInventoryRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const locationId = seedVenue(db, 'Waikiki');
      const orgItemId = seedItem(db, { name: 'olive oil', category: 'oil_fat', unit: 'ml' });
      const locationItemId = seedItem(db, { name: 'olive oil reserve', category: 'oil_fat', unit: 'ml', venue_id: locationId });
      const oliveOil = canonicalRepository.getCanonicalIngredientByName('olive oil');
      if (!oliveOil) throw new Error('missing seed ingredient');

      await mappingRepository.upsertPreferredMapping({
        canonical_ingredient_id: oliveOil.id,
        inventory_item_id: orgItemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization default oil mapping.',
        source_hash: 'org-default',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:00:00.000Z',
      });
      await mappingRepository.upsertPreferredMapping({
        canonical_ingredient_id: oliveOil.id,
        inventory_item_id: locationItemId,
        scope_type: 'location',
        scope_ref_id: locationId,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Waikiki location override.',
        source_hash: 'location-default',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:05:00.000Z',
      });

      const result = await resolveCanonicalInventoryItem({
        canonical_ingredient_id: oliveOil.id,
        subject_scope: { organization_id: 1, location_id: locationId },
      }, mappingRepository);

      expect(result.inventory_item_id).toBe(locationItemId);
      expect(result.matched_scope_type).toBe('location');
      expect(result.explanation_text).toContain('Waikiki');
    } finally {
      db.close();
    }
  });

  it('operation_unit override beats location mapping', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteCanonicalInventoryRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const locationId = seedVenue(db, 'Downtown');
      const locationItemId = seedItem(db, { name: 'garlic', category: 'produce', unit: 'g', venue_id: locationId });
      const opUnitItemId = seedItem(db, { name: 'peeled garlic', category: 'produce', unit: 'g', venue_id: locationId });
      const garlic = canonicalRepository.getCanonicalIngredientByName('garlic');
      if (!garlic) throw new Error('missing seed ingredient');

      await mappingRepository.upsertPreferredMapping({
        canonical_ingredient_id: garlic.id,
        inventory_item_id: locationItemId,
        scope_type: 'location',
        scope_ref_id: locationId,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Downtown location garlic default.',
        source_hash: 'location-garlic',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:10:00.000Z',
      });
      await mappingRepository.upsertPreferredMapping({
        canonical_ingredient_id: garlic.id,
        inventory_item_id: opUnitItemId,
        scope_type: 'operation_unit',
        scope_ref_id: 301,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Prep kitchen uses peeled garlic.',
        source_hash: 'op-garlic',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:15:00.000Z',
      });

      const result = await resolveCanonicalInventoryItem({
        canonical_ingredient_id: garlic.id,
        subject_scope: { organization_id: 1, location_id: locationId, operation_unit_id: 301 },
      }, mappingRepository);

      expect(result.inventory_item_id).toBe(opUnitItemId);
      expect(result.matched_scope_type).toBe('operation_unit');
      expect(result.explanation_text).toContain('peeled garlic');
    } finally {
      db.close();
    }
  });

  it('returns an explicit unresolved result when no mapping exists', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteCanonicalInventoryRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const parmesan = canonicalRepository.getCanonicalIngredientByName('parmesan cheese');
      if (!parmesan) throw new Error('missing seed ingredient');

      const result = await resolveCanonicalInventoryItem({
        canonical_ingredient_id: parmesan.id,
        subject_scope: { organization_id: 1, location_id: 10, operation_unit_id: 20 },
      }, mappingRepository);

      expect(result.mapping_status).toBe('UNMAPPED');
      expect(result.inventory_item_id).toBeNull();
      expect(result.trusted).toBe(false);
    } finally {
      db.close();
    }
  });

  it('creates an auto-mapped candidate from exact inventory name match', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteCanonicalInventoryRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      seedItem(db, { name: 'parmesan cheese', category: 'dairy', unit: 'g' });
      const parmesan = canonicalRepository.getCanonicalIngredientByName('parmesan cheese');
      if (!parmesan) throw new Error('missing seed ingredient');

      const result = await executeCanonicalInventoryMappingJob({
        scope_type: 'organization',
        scope_ref_id: 1,
        canonical_ingredient_ids: [parmesan.id],
      }, mappingRepository);

      expect(result.run_summary.auto_mapped).toBe(1);
      expect(result.mappings[0]?.mapping_status).toBe('AUTO_MAPPED');
      expect(result.mappings[0]?.match_reason).toBe('exact_inventory_name');
    } finally {
      db.close();
    }
  });

  it('sends ambiguous inventory choices to review and persists candidates', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteCanonicalInventoryRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      seedItem(db, { name: 'olive oil', category: 'oil_fat', unit: 'ml' });
      seedItem(db, { name: 'olive oil', category: 'oil_fat', unit: 'ml' });
      const oliveOil = canonicalRepository.getCanonicalIngredientByName('olive oil');
      if (!oliveOil) throw new Error('missing seed ingredient');

      const result = await executeCanonicalInventoryMappingJob({
        scope_type: 'organization',
        scope_ref_id: 1,
        canonical_ingredient_ids: [oliveOil.id],
      }, mappingRepository);

      expect(result.mappings[0]?.mapping_status).toBe('NEEDS_REVIEW');
      expect(result.candidates).toHaveLength(2);
      expect(result.review_events).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('does not duplicate mappings on idempotent rerun', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteCanonicalInventoryRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      seedItem(db, { name: 'garlic', category: 'produce', unit: 'g' });
      const garlic = canonicalRepository.getCanonicalIngredientByName('garlic');
      if (!garlic) throw new Error('missing seed ingredient');

      await executeCanonicalInventoryMappingJob({
        scope_type: 'organization',
        scope_ref_id: 1,
        canonical_ingredient_ids: [garlic.id],
      }, mappingRepository);
      const second = await executeCanonicalInventoryMappingJob({
        scope_type: 'organization',
        scope_ref_id: 1,
        canonical_ingredient_ids: [garlic.id],
      }, mappingRepository);

      const count = db.prepare('SELECT COUNT(*) AS count FROM canonical_inventory_mappings').get() as { count: number };
      expect(count.count).toBe(1);
      expect(second.run_summary.mappings_reused).toBe(1);
    } finally {
      db.close();
    }
  });

  it('classifies promoted recipe costability by mapped and unmapped ingredients', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteCanonicalInventoryRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const oliveOilItemId = seedItem(db, { name: 'olive oil', category: 'oil_fat', unit: 'ml' });
      const oliveOil = canonicalRepository.getCanonicalIngredientByName('olive oil');
      const garlic = canonicalRepository.getCanonicalIngredientByName('garlic');
      if (!oliveOil || !garlic) throw new Error('missing seed ingredient');

      await mappingRepository.upsertPreferredMapping({
        canonical_ingredient_id: oliveOil.id,
        inventory_item_id: oliveOilItemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization oil mapping.',
        source_hash: 'olive-org',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:30:00.000Z',
      });

      const { recipeVersionId } = seedRecipeVersion(db, 'Costability Test');
      db.prepare(
        `
          INSERT INTO recipe_ingredients (
            recipe_version_id,
            line_index,
            source_parsed_row_id,
            source_resolution_row_id,
            raw_ingredient_text,
            canonical_ingredient_id,
            inventory_item_id,
            quantity_normalized,
            unit_normalized,
            preparation_note
          ) VALUES (?, ?, NULL, NULL, ?, ?, NULL, ?, ?, NULL)
        `,
      ).run(recipeVersionId, 1, 'olive oil', oliveOil.id, 100, 'ml');
      db.prepare(
        `
          INSERT INTO recipe_ingredients (
            recipe_version_id,
            line_index,
            source_parsed_row_id,
            source_resolution_row_id,
            raw_ingredient_text,
            canonical_ingredient_id,
            inventory_item_id,
            quantity_normalized,
            unit_normalized,
            preparation_note
          ) VALUES (?, ?, NULL, NULL, ?, ?, NULL, ?, ?, NULL)
        `,
      ).run(recipeVersionId, 2, 'garlic', garlic.id, 20, 'g');

      const readiness = await evaluateRecipeCostabilityReadiness({
        recipe_version_id: recipeVersionId,
        subject_scope: { organization_id: 1 },
      }, mappingRepository);

      expect(readiness.total_rows).toBe(2);
      expect(readiness.costable_rows).toBe(1);
      expect(readiness.unresolved_rows).toBe(1);
      expect(readiness.status).toBe('OPERATIONAL_ONLY');
      expect(readiness.costable_percent).toBe(50);
    } finally {
      db.close();
    }
  });

  it('preserves scope reasoning in mapping explanations', async () => {
    const db = createDb();
    const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
    const mappingRepository = new SQLiteCanonicalInventoryRepository(db);
    try {
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const locationId = seedVenue(db, 'Kailua');
      const itemId = seedItem(db, { name: 'olive oil', category: 'oil_fat', unit: 'ml', venue_id: locationId });
      const oliveOil = canonicalRepository.getCanonicalIngredientByName('olive oil');
      if (!oliveOil) throw new Error('missing seed ingredient');

      await mappingRepository.upsertPreferredMapping({
        canonical_ingredient_id: oliveOil.id,
        inventory_item_id: itemId,
        scope_type: 'location',
        scope_ref_id: locationId,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Kailua location override uses bottled olive oil for this ingredient.',
        source_hash: 'kailua-olive',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T11:00:00.000Z',
      });

      const result = await resolveCanonicalInventoryItem({
        canonical_ingredient_id: oliveOil.id,
        subject_scope: { organization_id: 1, location_id: locationId },
      }, mappingRepository);

      expect(result.explanation_text).toContain('Kailua');
      expect(result.matched_scope_type).toBe('location');
    } finally {
      db.close();
    }
  });
});
