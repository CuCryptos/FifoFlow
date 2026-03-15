import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initializeDb } from '../db.js';
import {
  PromotedRecipeCostSourceBridge,
  resolvePromotedRecipeForCosting,
  executeRecipeCostSnapshots,
  InMemoryRecipeCostPersistenceRepository,
  SQLiteOperationalRecipeCostReadRepository,
} from '../intelligence/recipeCost/index.js';
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
        ) VALUES (?, 1, 'active', ?, ?, NULL, NULL, NULL, NULL, NULL)
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

async function buildBridgedRecipe(db: Database.Database, recipeVersionId: number, context: IntelligenceJobContext) {
  const operationalRepository = new SQLiteOperationalRecipeCostReadRepository(db);
  const inventoryRepository = new SQLiteCanonicalInventoryRepository(db);
  const vendorRepository = new SQLiteInventoryVendorRepository(db);
  const recipes = await operationalRepository.listPromotedRecipes({
    ...context,
    scope: {
      ...context.scope,
      recipeId: undefined,
    },
  });
  const recipe = recipes.find((entry) => Number(entry.recipe_version_id) === recipeVersionId);
  if (!recipe) {
    throw new Error(`Missing recipe version ${recipeVersionId}`);
  }
  return resolvePromotedRecipeForCosting(recipe, context, {
    operationalRepository,
    inventoryRepository,
    vendorRepository,
  });
}

describe('recipe cost source bridge', () => {
  it('uses scoped inventory and vendor mappings to make a promoted recipe costable', async () => {
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
        order_unit_price: 18,
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
        explanation_text: 'Organization default olive oil mapping.',
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
        explanation_text: 'Organization default olive oil vendor item.',
        source_hash: 'olive-vendor-org',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:01:00.000Z',
      });
      const { recipeVersionId } = seedRecipe(db, { name: 'House Dressing' });
      seedRecipeIngredient(db, {
        recipeVersionId,
        lineIndex: 1,
        rawIngredientText: 'olive oil',
        canonicalIngredientId: oliveOil.id,
        quantity: 100,
        unit: 'ml',
      });

      const bridged = await buildBridgedRecipe(db, recipeVersionId, createContext({ scope: { organizationId: 1 } }));

      expect(bridged.costability_summary.classification).toBe('COSTABLE_NOW');
      expect(bridged.source_rows[0]?.inventory_mapping_resolution?.matched_scope_type).toBe('organization');
      expect(bridged.source_rows[0]?.vendor_mapping_resolution?.matched_scope_type).toBe('organization');
      expect(bridged.source_rows[0]?.vendor_cost_lineage?.vendor_item_id).toBe(vendorItemId);
      expect(bridged.source_rows[0]?.vendor_cost_lineage?.normalized_unit_cost).toBe(0.018);
    } finally {
      db.close();
    }
  });

  it('prefers location inventory override while preserving vendor lineage', async () => {
    const db = createDb();
    try {
      const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
      const inventoryRepository = new SQLiteCanonicalInventoryRepository(db);
      const vendorRepository = new SQLiteInventoryVendorRepository(db);
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const oliveOil = canonicalRepository.getCanonicalIngredientByName('olive oil');
      if (!oliveOil) throw new Error('missing olive oil');
      const locationId = seedVenue(db, 'Kailua');
      const orgItemId = seedItem(db, { name: 'olive oil', category: 'oil_fat', unit: 'ml' });
      const locationItemId = seedItem(db, { name: 'kailua olive oil', category: 'oil_fat', unit: 'ml', venue_id: locationId });
      const vendorId = seedVendor(db, 'Sysco');
      const vendorItemId = seedVendorPrice(db, {
        item_id: locationItemId,
        vendor_id: vendorId,
        vendor_item_name: 'Kailua Olive Oil 1 L',
        order_unit: 'bottle',
        order_unit_price: 21,
        qty_per_unit: 1000,
        is_default: true,
      });
      await inventoryRepository.upsertPreferredMapping({
        canonical_ingredient_id: oliveOil.id,
        inventory_item_id: orgItemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization olive oil default.',
        source_hash: 'olive-org',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:00:00.000Z',
      });
      await inventoryRepository.upsertPreferredMapping({
        canonical_ingredient_id: oliveOil.id,
        inventory_item_id: locationItemId,
        scope_type: 'location',
        scope_ref_id: locationId,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Kailua olive oil override.',
        source_hash: 'olive-kailua',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:05:00.000Z',
      });
      await vendorRepository.upsertPreferredMapping({
        inventory_item_id: locationItemId,
        vendor_item_id: vendorItemId,
        scope_type: 'location',
        scope_ref_id: locationId,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Kailua vendor item override.',
        source_hash: 'kailua-vendor',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:06:00.000Z',
      });
      const { recipeVersionId } = seedRecipe(db, { name: 'Location Dressing' });
      seedRecipeIngredient(db, {
        recipeVersionId,
        lineIndex: 1,
        rawIngredientText: 'olive oil',
        canonicalIngredientId: oliveOil.id,
        quantity: 100,
        unit: 'ml',
      });

      const bridged = await buildBridgedRecipe(db, recipeVersionId, createContext({ scope: { organizationId: 1, locationId } }));

      expect(bridged.source_rows[0]?.inventory_item_id).toBe(locationItemId);
      expect(bridged.source_rows[0]?.inventory_mapping_resolution?.matched_scope_type).toBe('location');
      expect(bridged.source_rows[0]?.vendor_mapping_resolution?.matched_scope_type).toBe('location');
    } finally {
      db.close();
    }
  });

  it('prefers operation-unit inventory override and vendor override together', async () => {
    const db = createDb();
    try {
      const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
      const inventoryRepository = new SQLiteCanonicalInventoryRepository(db);
      const vendorRepository = new SQLiteInventoryVendorRepository(db);
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const garlic = canonicalRepository.getCanonicalIngredientByName('garlic');
      if (!garlic) throw new Error('missing garlic');
      const locationId = seedVenue(db, 'Waikiki');
      const locationItemId = seedItem(db, { name: 'garlic', category: 'produce', unit: 'g', venue_id: locationId });
      const opUnitItemId = seedItem(db, { name: 'peeled garlic', category: 'produce', unit: 'g', venue_id: locationId });
      const vendorId = seedVendor(db, 'ChefSource');
      const vendorItemId = seedVendorPrice(db, {
        item_id: opUnitItemId,
        vendor_id: vendorId,
        vendor_item_name: 'Peeled Garlic 5 lb',
        order_unit: 'case',
        order_unit_price: 34,
        qty_per_unit: 2267.96,
        is_default: true,
      });
      await inventoryRepository.upsertPreferredMapping({
        canonical_ingredient_id: garlic.id,
        inventory_item_id: locationItemId,
        scope_type: 'location',
        scope_ref_id: locationId,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Waikiki garlic default.',
        source_hash: 'garlic-location',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:10:00.000Z',
      });
      await inventoryRepository.upsertPreferredMapping({
        canonical_ingredient_id: garlic.id,
        inventory_item_id: opUnitItemId,
        scope_type: 'operation_unit',
        scope_ref_id: 200,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Prep kitchen uses peeled garlic.',
        source_hash: 'garlic-op',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:12:00.000Z',
      });
      await vendorRepository.upsertPreferredMapping({
        inventory_item_id: opUnitItemId,
        vendor_item_id: vendorItemId,
        scope_type: 'operation_unit',
        scope_ref_id: 200,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Prep kitchen vendor override.',
        source_hash: 'garlic-vendor-op',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:13:00.000Z',
      });
      const { recipeVersionId } = seedRecipe(db, { name: 'Garlic Prep' });
      seedRecipeIngredient(db, {
        recipeVersionId,
        lineIndex: 1,
        rawIngredientText: 'garlic',
        canonicalIngredientId: garlic.id,
        quantity: 50,
        unit: 'g',
      });

      const bridged = await buildBridgedRecipe(db, recipeVersionId, createContext({
        scope: { organizationId: 1, locationId, operationUnitId: 200 },
      }));

      expect(bridged.source_rows[0]?.inventory_item_id).toBe(opUnitItemId);
      expect(bridged.source_rows[0]?.inventory_mapping_resolution?.matched_scope_type).toBe('operation_unit');
      expect(bridged.source_rows[0]?.vendor_mapping_resolution?.matched_scope_type).toBe('operation_unit');
    } finally {
      db.close();
    }
  });

  it('blocks costing when canonical ingredient identity is missing', async () => {
    const repository: RecipeCostOperationalReadRepository = {
      async listPromotedRecipes(): Promise<PromotedRecipeSourceRecord[]> {
        return [{
          recipe_id: 10,
          recipe_version_id: 11,
          recipe_name: 'Broken Recipe',
          recipe_type: 'prep',
          yield_qty: 1,
          yield_unit: 'quart',
          serving_count: null,
        }];
      },
      async listPromotedRecipeIngredients(): Promise<PromotedRecipeSourceRow[]> {
        return [{
          recipe_item_id: 101,
          recipe_version_id: 11,
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
    const db = createDb();
    try {
      const bridged = await resolvePromotedRecipeForCosting({
        recipe_id: 10,
        recipe_version_id: 11,
        recipe_name: 'Broken Recipe',
        recipe_type: 'prep',
        yield_qty: 1,
        yield_unit: 'quart',
        serving_count: null,
      }, createContext(), {
        operationalRepository: repository,
        inventoryRepository: new SQLiteCanonicalInventoryRepository(db),
        vendorRepository: new SQLiteInventoryVendorRepository(db),
      });

      expect(bridged.costability_summary.classification).toBe('BLOCKED_FOR_COSTING');
      expect(bridged.costability_summary.blocking_reasons[0]?.code).toBe('MISSING_CANONICAL_INGREDIENT');
    } finally {
      db.close();
    }
  });

  it('keeps recipes operational-only when scoped inventory mapping is missing', async () => {
    const db = createDb();
    try {
      const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const shrimp = canonicalRepository.getCanonicalIngredientByName('shrimp');
      if (!shrimp) throw new Error('missing shrimp');
      const { recipeVersionId } = seedRecipe(db, { name: 'Shrimp Plate' });
      seedRecipeIngredient(db, {
        recipeVersionId,
        lineIndex: 1,
        rawIngredientText: 'shrimp',
        canonicalIngredientId: shrimp.id,
        quantity: 1,
        unit: 'lb',
      });

      const bridged = await buildBridgedRecipe(db, recipeVersionId, createContext());

      expect(bridged.costability_summary.classification).toBe('OPERATIONAL_ONLY');
      expect(bridged.costability_summary.blocking_reasons[0]?.code).toBe('MISSING_SCOPED_INVENTORY_MAPPING');
    } finally {
      db.close();
    }
  });

  it('surfaces missing scoped vendor mapping explicitly', async () => {
    const db = createDb();
    try {
      const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
      const inventoryRepository = new SQLiteCanonicalInventoryRepository(db);
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const shrimp = canonicalRepository.getCanonicalIngredientByName('shrimp');
      if (!shrimp) throw new Error('missing shrimp');
      const itemId = seedItem(db, { name: 'shrimp', category: 'protein', unit: 'lb' });
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
      const { recipeVersionId } = seedRecipe(db, { name: 'Shrimp Plate' });
      seedRecipeIngredient(db, {
        recipeVersionId,
        lineIndex: 1,
        rawIngredientText: 'shrimp',
        canonicalIngredientId: shrimp.id,
        quantity: 1,
        unit: 'lb',
      });

      const bridged = await buildBridgedRecipe(db, recipeVersionId, createContext());

      expect(bridged.costability_summary.classification).toBe('OPERATIONAL_ONLY');
      expect(bridged.costability_summary.blocking_reasons[0]?.code).toBe('MISSING_SCOPED_VENDOR_MAPPING');
    } finally {
      db.close();
    }
  });

  it('surfaces missing normalized vendor lineage explicitly', async () => {
    const db = createDb();
    try {
      const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
      const inventoryRepository = new SQLiteCanonicalInventoryRepository(db);
      const vendorRepository = new SQLiteInventoryVendorRepository(db);
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const garlic = canonicalRepository.getCanonicalIngredientByName('garlic');
      if (!garlic) throw new Error('missing garlic');
      const itemId = seedItem(db, { name: 'garlic', category: 'produce', unit: 'g' });
      const vendorId = seedVendor(db, 'Produce Co');
      const vendorItemId = seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorId,
        vendor_item_name: 'Garlic Case',
        order_unit: 'case',
        order_unit_price: 40,
        qty_per_unit: null,
        is_default: true,
      });
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
        explanation_text: 'Organization garlic vendor mapping.',
        source_hash: 'garlic-vendor-org',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:01:00.000Z',
      });
      const { recipeVersionId } = seedRecipe(db, { name: 'Garlic Prep' });
      seedRecipeIngredient(db, {
        recipeVersionId,
        lineIndex: 1,
        rawIngredientText: 'garlic',
        canonicalIngredientId: garlic.id,
        quantity: 30,
        unit: 'g',
      });

      const bridged = await buildBridgedRecipe(db, recipeVersionId, createContext());

      expect(bridged.costability_summary.classification).toBe('OPERATIONAL_ONLY');
      expect(bridged.costability_summary.blocking_reasons[0]?.code).toBe('MISSING_VENDOR_COST_LINEAGE');
    } finally {
      db.close();
    }
  });

  it('feeds bridged promoted recipe rows into the recipe cost engine with vendor lineage detail', async () => {
    const db = createDb();
    try {
      const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
      const inventoryRepository = new SQLiteCanonicalInventoryRepository(db);
      const vendorRepository = new SQLiteInventoryVendorRepository(db);
      const operationalRepository = new SQLiteOperationalRecipeCostReadRepository(db);
      syncCanonicalIngredientDictionary(canonicalRepository, createSeed(), '2026-03-14T10:00:00.000Z');
      const oliveOil = canonicalRepository.getCanonicalIngredientByName('olive oil');
      if (!oliveOil) throw new Error('missing olive oil');
      const oliveOilItemId = seedItem(db, { name: 'olive oil', category: 'oil_fat', unit: 'ml' });
      const vendorId = seedVendor(db, 'Sysco');
      const vendorItemId = seedVendorPrice(db, {
        item_id: oliveOilItemId,
        vendor_id: vendorId,
        vendor_item_name: 'Sysco Olive Oil 1 L',
        order_unit: 'bottle',
        order_unit_price: 30,
        qty_per_unit: 1000,
        is_default: true,
      });
      await inventoryRepository.upsertPreferredMapping({
        canonical_ingredient_id: oliveOil.id,
        inventory_item_id: oliveOilItemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization default olive oil mapping.',
        source_hash: 'olive-org',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:00:00.000Z',
      });
      await vendorRepository.upsertPreferredMapping({
        inventory_item_id: oliveOilItemId,
        vendor_item_id: vendorItemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization vendor mapping.',
        source_hash: 'vendor-olive-org',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:01:00.000Z',
      });
      const { recipeId, recipeVersionId } = seedRecipe(db, { name: 'Engine Feed Recipe', type: 'dish', yield_quantity: 2, yield_unit: 'each' });
      seedRecipeIngredient(db, {
        recipeVersionId,
        lineIndex: 1,
        rawIngredientText: 'olive oil',
        canonicalIngredientId: oliveOil.id,
        quantity: 50,
        unit: 'ml',
      });

      const bridge = new PromotedRecipeCostSourceBridge({
        operationalRepository,
        inventoryRepository,
        vendorRepository,
      });

      const result = await executeRecipeCostSnapshots(createContext({ scope: { organizationId: 1, recipeId } }), {
        source: bridge,
        repository: new InMemoryRecipeCostPersistenceRepository(),
      });

      expect(result.snapshots).toHaveLength(1);
      expect(result.snapshots[0]?.completeness_status).toBe('complete');
      expect(result.snapshots[0]?.total_cost).toBe(1.5);
      expect(result.components[0]?.inventory_item_id).toBe(oliveOilItemId);
      expect(result.resolutions[0]?.detail_json?.vendor_item_id).toBe(vendorItemId);
      expect(result.resolutions[0]?.detail_json?.vendor_scope_explanation).toBeTruthy();
    } finally {
      db.close();
    }
  });
});
