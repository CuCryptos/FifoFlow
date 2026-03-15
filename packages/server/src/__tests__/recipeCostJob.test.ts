import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initializeDb } from '../db.js';
import { runRecipeCostJob } from '../intelligence/recipeCostJob.js';
import { SQLiteOperationalRecipeCostReadRepository } from '../intelligence/recipeCost/index.js';
import { SQLiteRecipeCostRepository } from '../intelligence/recipeCost/persistence/sqliteRecipeCostRepository.js';
import {
  SQLiteCanonicalIngredientRepository,
  syncCanonicalIngredientDictionary,
  type CanonicalIngredientDictionarySeed,
} from '../mapping/ingredients/index.js';
import { SQLiteCanonicalInventoryRepository } from '../mapping/inventory/index.js';
import { SQLiteInventoryVendorRepository } from '../mapping/vendor/index.js';
import type { IntelligenceJobContext } from '../intelligence/types.js';
import type {
  PromotedRecipeSourceRecord,
  PromotedRecipeSourceRow,
  RecipeCostOperationalReadRepository,
} from '../intelligence/recipeCost/types.js';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  initializeDb(db);
  return db;
}

function createContext(overrides?: Partial<IntelligenceJobContext>): IntelligenceJobContext {
  return {
    scope: {
      organizationId: 1,
      locationId: 10,
      operationUnitId: 100,
    },
    window: {
      start: '2026-03-01T00:00:00.000Z',
      end: '2026-03-31T00:00:00.000Z',
    },
    ruleVersion: 'recipe-cost/v1',
    now: '2026-03-31T12:00:00.000Z',
    ...overrides,
  };
}

function createSeed(): CanonicalIngredientDictionarySeed {
  return {
    ingredients: [
      { canonical_name: 'olive oil', category: 'oil_fat', base_unit: 'ml', perishable_flag: false },
      { canonical_name: 'garlic', category: 'produce', base_unit: 'g', perishable_flag: true },
      { canonical_name: 'shrimp', category: 'protein', base_unit: 'lb', perishable_flag: true },
    ],
    aliases: [
      { canonical_name: 'olive oil', aliases: ['evoo'] },
      { canonical_name: 'garlic', aliases: [] },
      { canonical_name: 'shrimp', aliases: ['prawn'] },
    ],
  };
}

function seedVenue(db: Database.Database, name: string): number {
  return Number(db.prepare('INSERT INTO venues (name) VALUES (?)').run(name).lastInsertRowid);
}

function seedVendor(db: Database.Database, name: string): number {
  return Number(db.prepare('INSERT INTO vendors (name) VALUES (?)').run(name).lastInsertRowid);
}

function seedItem(db: Database.Database, input: { name: string; category: string; unit: string; venue_id?: number | null }): number {
  return Number(
    db.prepare('INSERT INTO items (name, category, unit, current_qty, venue_id) VALUES (?, ?, ?, 0, ?)')
      .run(input.name, input.category, input.unit, input.venue_id ?? null)
      .lastInsertRowid,
  );
}

function seedVendorPrice(
  db: Database.Database,
  input: {
    item_id: number;
    vendor_id: number;
    vendor_item_name?: string | null;
    order_unit?: string | null;
    order_unit_price: number;
    qty_per_unit?: number | null;
    is_default?: boolean;
  },
): number {
  return Number(
    db.prepare(
      `
        INSERT INTO vendor_prices (
          item_id,
          vendor_id,
          vendor_item_name,
          order_unit,
          order_unit_price,
          qty_per_unit,
          is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.item_id,
      input.vendor_id,
      input.vendor_item_name ?? null,
      input.order_unit ?? null,
      input.order_unit_price,
      input.qty_per_unit ?? null,
      input.is_default ? 1 : 0,
    ).lastInsertRowid,
  );
}

function seedRecipe(db: Database.Database, input: { name: string; type?: string; yield_quantity?: number | null; yield_unit?: string | null }) {
  const recipeId = Number(db.prepare('INSERT INTO recipes (name, type, notes) VALUES (?, ?, NULL)').run(input.name, input.type ?? 'prep').lastInsertRowid);
  const recipeVersionId = Number(
    db.prepare(
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
        ) VALUES (?, 1, 'active', ?, ?, NULL, NULL, NULL, NULL, 'source text')
      `,
    ).run(recipeId, input.yield_quantity ?? 1, input.yield_unit ?? 'quart').lastInsertRowid,
  );
  return { recipeId, recipeVersionId };
}

function seedRecipeIngredient(
  db: Database.Database,
  input: {
    recipeVersionId: number;
    lineIndex: number;
    rawIngredientText: string;
    canonicalIngredientId: number | string | null;
    quantity: number;
    unit: string;
    inventoryItemId?: number | null;
  },
): number {
  return Number(
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
        ) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, NULL)
      `,
    ).run(
      input.recipeVersionId,
      input.lineIndex,
      input.rawIngredientText,
      input.canonicalIngredientId,
      input.inventoryItemId ?? null,
      input.quantity,
      input.unit,
    ).lastInsertRowid,
  );
}

function createDependencies(db: Database.Database) {
  return {
    repository: new SQLiteRecipeCostRepository(db),
    operationalRepository: new SQLiteOperationalRecipeCostReadRepository(db),
    inventoryRepository: new SQLiteCanonicalInventoryRepository(db),
    vendorRepository: new SQLiteInventoryVendorRepository(db),
  };
}

describe('live recipe cost job wiring', () => {
  it('flows a promoted recipe version through the live job into snapshot creation with vendor lineage', async () => {
    const db = createDb();
    try {
      const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
      const inventoryRepository = new SQLiteCanonicalInventoryRepository(db);
      const vendorRepository = new SQLiteInventoryVendorRepository(db);
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const vendorId = seedVendor(db, 'Sysco');
      const oliveOil = canonicalRepository.getCanonicalIngredientByName('olive oil');
      if (!oliveOil) throw new Error('missing olive oil');
      const itemId = seedItem(db, { name: 'olive oil', category: 'oil_fat', unit: 'ml' });
      const vendorItemId = seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorId,
        vendor_item_name: 'Sysco Olive Oil 1 L',
        order_unit: 'bottle',
        order_unit_price: 30,
        qty_per_unit: 1000,
        is_default: true,
      });
      await inventoryRepository.upsertPreferredMapping({
        canonical_ingredient_id: oliveOil.id,
        inventory_item_id: itemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization olive oil mapping.',
        source_hash: 'olive-org',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:00:00.000Z',
      });
      await vendorRepository.upsertPreferredMapping({
        inventory_item_id: itemId,
        vendor_item_id: vendorItemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization olive oil vendor mapping.',
        source_hash: 'olive-vendor-org',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:01:00.000Z',
      });
      const { recipeVersionId } = seedRecipe(db, { name: 'House Dressing', type: 'dish', yield_quantity: 2, yield_unit: 'each' });
      seedRecipeIngredient(db, {
        recipeVersionId,
        lineIndex: 1,
        rawIngredientText: 'olive oil',
        canonicalIngredientId: oliveOil.id,
        quantity: 50,
        unit: 'ml',
      });

      const result = await runRecipeCostJob(createContext(), createDependencies(db));
      const snapshotCount = db.prepare('SELECT COUNT(*) AS count FROM recipe_cost_snapshots').get() as { count: number };
      const detailRow = db.prepare('SELECT detail_json FROM ingredient_cost_resolution_log LIMIT 1').get() as { detail_json: string };
      const detail = JSON.parse(detailRow.detail_json).detail_json;

      expect(result.recipe_cost_recipe_results?.[0]?.costability_classification).toBe('COSTABLE_NOW');
      expect(result.recipe_cost_recipe_results?.[0]?.snapshot_persisted).toBe(true);
      expect(snapshotCount.count).toBe(1);
      expect(detail.vendor_item_id).toBe(vendorItemId);
      expect(detail.inventory_scope_explanation).toContain('olive oil');
    } finally {
      db.close();
    }
  });

  it('uses location vendor override when it beats organization default', async () => {
    const db = createDb();
    try {
      const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
      const inventoryRepository = new SQLiteCanonicalInventoryRepository(db);
      const vendorRepository = new SQLiteInventoryVendorRepository(db);
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const oliveOil = canonicalRepository.getCanonicalIngredientByName('olive oil');
      if (!oliveOil) throw new Error('missing olive oil');
      const locationId = seedVenue(db, 'Kailua');
      const itemId = seedItem(db, { name: 'olive oil', category: 'oil_fat', unit: 'ml', venue_id: locationId });
      const vendorId = seedVendor(db, 'Sysco');
      const orgVendorItemId = seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorId,
        vendor_item_name: 'Org Olive Oil 1 L',
        order_unit: 'bottle',
        order_unit_price: 18,
        qty_per_unit: 1000,
      });
      const locationVendorItemId = seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorId,
        vendor_item_name: 'Kailua Olive Oil 1 L',
        order_unit: 'bottle',
        order_unit_price: 21,
        qty_per_unit: 1000,
      });
      await inventoryRepository.upsertPreferredMapping({
        canonical_ingredient_id: oliveOil.id,
        inventory_item_id: itemId,
        scope_type: 'location',
        scope_ref_id: locationId,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Kailua olive oil mapping.',
        source_hash: 'olive-kailua',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:00:00.000Z',
      });
      await vendorRepository.upsertPreferredMapping({
        inventory_item_id: itemId,
        vendor_item_id: orgVendorItemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization olive oil vendor mapping.',
        source_hash: 'olive-vendor-org',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:01:00.000Z',
      });
      await vendorRepository.upsertPreferredMapping({
        inventory_item_id: itemId,
        vendor_item_id: locationVendorItemId,
        scope_type: 'location',
        scope_ref_id: locationId,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Kailua olive oil vendor override.',
        source_hash: 'olive-vendor-kailua',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:02:00.000Z',
      });
      const { recipeVersionId } = seedRecipe(db, { name: 'Location Dressing' });
      seedRecipeIngredient(db, {
        recipeVersionId,
        lineIndex: 1,
        rawIngredientText: 'olive oil',
        canonicalIngredientId: oliveOil.id,
        quantity: 50,
        unit: 'ml',
      });

      await runRecipeCostJob(createContext({ scope: { organizationId: 1, locationId } }), createDependencies(db));
      const detailRow = db.prepare('SELECT detail_json FROM ingredient_cost_resolution_log LIMIT 1').get() as { detail_json: string };
      const detail = JSON.parse(detailRow.detail_json).detail_json;

      expect(detail.vendor_item_id).toBe(locationVendorItemId);
      expect(detail.vendor_scope_explanation).toContain('Kailua');
    } finally {
      db.close();
    }
  });

  it('does not persist a trusted snapshot when canonical identity is missing', async () => {
    const db = createDb();
    try {
      const operationalRepository: RecipeCostOperationalReadRepository = {
        async listPromotedRecipes(): Promise<PromotedRecipeSourceRecord[]> {
          return [{
            recipe_id: 101,
            recipe_version_id: 201,
            recipe_name: 'Broken Recipe',
            recipe_type: 'prep',
            yield_qty: 1,
            yield_unit: 'quart',
            serving_count: null,
          }];
        },
        async listPromotedRecipeIngredients(): Promise<PromotedRecipeSourceRow[]> {
          return [{
            recipe_item_id: 301,
            recipe_version_id: 201,
            line_index: 1,
            raw_ingredient_text: 'mystery oil',
            canonical_ingredient_id: null,
            quantity_normalized: 1,
            unit_normalized: 'cup',
            preparation_note: null,
            existing_inventory_item_id: null,
          }];
        },
        async getCanonicalIngredientName(): Promise<string | null> {
          return null;
        },
      };

      const result = await runRecipeCostJob(createContext(), {
        ...createDependencies(db),
        operationalRepository,
      });
      const snapshotCount = db.prepare('SELECT COUNT(*) AS count FROM recipe_cost_snapshots').get() as { count: number };

      expect(result.recipe_cost_recipe_results?.[0]?.costability_classification).toBe('BLOCKED_FOR_COSTING');
      expect(result.recipe_cost_recipe_results?.[0]?.snapshot_persisted).toBe(false);
      expect(snapshotCount.count).toBe(0);
    } finally {
      db.close();
    }
  });

  it('keeps promoted recipes operational-only when vendor mapping is missing', async () => {
    const db = createDb();
    try {
      const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
      const inventoryRepository = new SQLiteCanonicalInventoryRepository(db);
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const garlic = canonicalRepository.getCanonicalIngredientByName('garlic');
      if (!garlic) throw new Error('missing garlic');
      const itemId = seedItem(db, { name: 'garlic', category: 'produce', unit: 'g' });
      await inventoryRepository.upsertPreferredMapping({
        canonical_ingredient_id: garlic.id,
        inventory_item_id: itemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization garlic mapping.',
        source_hash: 'garlic-org',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:00:00.000Z',
      });
      const { recipeVersionId } = seedRecipe(db, { name: 'Garlic Prep' });
      seedRecipeIngredient(db, {
        recipeVersionId,
        lineIndex: 1,
        rawIngredientText: 'garlic',
        canonicalIngredientId: garlic.id,
        quantity: 25,
        unit: 'g',
      });

      const result = await runRecipeCostJob(createContext(), createDependencies(db));
      const snapshotCount = db.prepare('SELECT COUNT(*) AS count FROM recipe_cost_snapshots').get() as { count: number };

      expect(result.recipe_cost_recipe_results?.[0]?.costability_classification).toBe('OPERATIONAL_ONLY');
      expect(result.recipe_cost_recipe_results?.[0]?.blocking_reasons[0]?.code).toBe('MISSING_SCOPED_VENDOR_MAPPING');
      expect(snapshotCount.count).toBe(0);
    } finally {
      db.close();
    }
  });

  it('surfaces missing normalized cost lineage explicitly and skips snapshot persistence', async () => {
    const db = createDb();
    try {
      const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
      const inventoryRepository = new SQLiteCanonicalInventoryRepository(db);
      const vendorRepository = new SQLiteInventoryVendorRepository(db);
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const shrimp = canonicalRepository.getCanonicalIngredientByName('shrimp');
      if (!shrimp) throw new Error('missing shrimp');
      const itemId = seedItem(db, { name: 'shrimp', category: 'protein', unit: 'lb' });
      const vendorId = seedVendor(db, 'Pacific Seafood');
      const vendorItemId = seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorId,
        vendor_item_name: 'Shrimp Case',
        order_unit: 'case',
        order_unit_price: 80,
        qty_per_unit: null,
        is_default: true,
      });
      await inventoryRepository.upsertPreferredMapping({
        canonical_ingredient_id: shrimp.id,
        inventory_item_id: itemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization shrimp mapping.',
        source_hash: 'shrimp-org',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:00:00.000Z',
      });
      await vendorRepository.upsertPreferredMapping({
        inventory_item_id: itemId,
        vendor_item_id: vendorItemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization shrimp vendor mapping.',
        source_hash: 'shrimp-vendor-org',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:01:00.000Z',
      });
      const { recipeVersionId } = seedRecipe(db, { name: 'Shrimp Plate' });
      seedRecipeIngredient(db, {
        recipeVersionId,
        lineIndex: 1,
        rawIngredientText: 'shrimp',
        canonicalIngredientId: shrimp.id,
        quantity: 1,
        unit: 'lb',
      });

      const result = await runRecipeCostJob(createContext(), createDependencies(db));
      const snapshotCount = db.prepare('SELECT COUNT(*) AS count FROM recipe_cost_snapshots').get() as { count: number };

      expect(result.recipe_cost_recipe_results?.[0]?.costability_classification).toBe('OPERATIONAL_ONLY');
      expect(result.recipe_cost_recipe_results?.[0]?.blocking_reasons[0]?.code).toBe('MISSING_VENDOR_COST_LINEAGE');
      expect(snapshotCount.count).toBe(0);
    } finally {
      db.close();
    }
  });

  it('keeps reruns idempotent for the same comparable window', async () => {
    const db = createDb();
    try {
      const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
      const inventoryRepository = new SQLiteCanonicalInventoryRepository(db);
      const vendorRepository = new SQLiteInventoryVendorRepository(db);
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const oliveOil = canonicalRepository.getCanonicalIngredientByName('olive oil');
      if (!oliveOil) throw new Error('missing olive oil');
      const itemId = seedItem(db, { name: 'olive oil', category: 'oil_fat', unit: 'ml' });
      const vendorId = seedVendor(db, 'Sysco');
      const vendorItemId = seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorId,
        vendor_item_name: 'Sysco Olive Oil 1 L',
        order_unit: 'bottle',
        order_unit_price: 20,
        qty_per_unit: 1000,
        is_default: true,
      });
      await inventoryRepository.upsertPreferredMapping({
        canonical_ingredient_id: oliveOil.id,
        inventory_item_id: itemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization olive oil mapping.',
        source_hash: 'olive-org',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:00:00.000Z',
      });
      await vendorRepository.upsertPreferredMapping({
        inventory_item_id: itemId,
        vendor_item_id: vendorItemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization olive oil vendor mapping.',
        source_hash: 'olive-vendor-org',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:01:00.000Z',
      });
      const { recipeVersionId } = seedRecipe(db, { name: 'Rerun Recipe', type: 'dish', yield_quantity: 2, yield_unit: 'each' });
      seedRecipeIngredient(db, {
        recipeVersionId,
        lineIndex: 1,
        rawIngredientText: 'olive oil',
        canonicalIngredientId: oliveOil.id,
        quantity: 25,
        unit: 'ml',
      });

      await runRecipeCostJob(createContext(), createDependencies(db));
      const second = await runRecipeCostJob(createContext(), createDependencies(db));
      const snapshotCount = db.prepare('SELECT COUNT(*) AS count FROM recipe_cost_snapshots').get() as { count: number };

      expect(snapshotCount.count).toBe(1);
      expect(second.recipe_cost_summary?.snapshots_updated).toBe(1);
    } finally {
      db.close();
    }
  });
});
