import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initializeDb } from '../db.js';
import {
  PromotedRecipeCostSourceBridge,
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
    ],
    aliases: [
      { canonical_name: 'olive oil', aliases: ['evoo'] },
    ],
  };
}

function seedVendor(db: Database.Database, name: string): number {
  return Number(db.prepare('INSERT INTO vendors (name) VALUES (?)').run(name).lastInsertRowid);
}

function seedItem(db: Database.Database, input: { name: string; category: string; unit: string }): number {
  return Number(
    db.prepare('INSERT INTO items (name, category, unit, current_qty, venue_id) VALUES (?, ?, ?, 0, NULL)')
      .run(input.name, input.category, input.unit)
      .lastInsertRowid,
  );
}

function seedVendorPrice(
  db: Database.Database,
  input: {
    item_id: number;
    vendor_id: number;
    vendor_item_name: string;
    order_unit: string;
    order_unit_price: number;
    qty_per_unit: number;
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
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
      `,
    ).run(
      input.item_id,
      input.vendor_id,
      input.vendor_item_name,
      input.order_unit,
      input.order_unit_price,
      input.qty_per_unit,
    ).lastInsertRowid,
  );
}

function seedRecipe(db: Database.Database, recipeName: string): { recipeId: number; recipeVersionId: number } {
  const recipeId = Number(db.prepare('INSERT INTO recipes (name, type, notes) VALUES (?, ?, NULL)').run(recipeName, 'dish').lastInsertRowid);
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
        ) VALUES (?, 1, 'active', 2, 'each', NULL, NULL, NULL, NULL, 'source text')
      `,
    ).run(recipeId).lastInsertRowid,
  );
  return { recipeId, recipeVersionId };
}

function seedRecipeIngredient(db: Database.Database, recipeVersionId: number, canonicalIngredientId: number | string): void {
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
      ) VALUES (?, 1, NULL, NULL, 'olive oil', ?, NULL, 50, 'ml', NULL)
    `,
  ).run(recipeVersionId, canonicalIngredientId);
}

describe('vendor-lineage recipe cost candidate source', () => {
  it('builds a vendor-backed ingredient cost candidate from the full scoped chain', async () => {
    const db = createDb();
    try {
      const canonicalRepository = new SQLiteCanonicalIngredientRepository(db);
      const inventoryRepository = new SQLiteCanonicalInventoryRepository(db);
      const vendorRepository = new SQLiteInventoryVendorRepository(db);
      const operationalRepository = new SQLiteOperationalRecipeCostReadRepository(db);
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
        order_unit_price: 24,
        qty_per_unit: 1000,
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
      const { recipeVersionId } = seedRecipe(db, 'Candidate Recipe');
      seedRecipeIngredient(db, recipeVersionId, oliveOil.id);

      const source = new PromotedRecipeCostSourceBridge({
        operationalRepository,
        inventoryRepository,
        vendorRepository,
      });

      const candidates = await source.listIngredientCostCandidates(createContext());

      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.inventory_item_id).toBe(itemId);
      expect(candidates[0]?.vendor_item_id).toBe(vendorItemId);
      expect(candidates[0]?.normalized_unit_cost).toBe(0.024);
      expect(candidates[0]?.inventory_scope_explanation).toContain('olive oil');
      expect(candidates[0]?.vendor_scope_explanation).toContain('vendor mapping');
    } finally {
      db.close();
    }
  });
});
