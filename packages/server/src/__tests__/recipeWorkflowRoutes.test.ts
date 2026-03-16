import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createRecipeWorkflowRoutes } from '../routes/recipeWorkflow.js';
import { SQLiteRecipeCostRepository } from '../intelligence/recipeCost/persistence/sqliteRecipeCostRepository.js';

describe('Recipe workflow routes', () => {
  let db: Database.Database;
  let app: express.Express;
  let recipeCostRepository: SQLiteRecipeCostRepository;

  beforeEach(async () => {
    db = new Database(':memory:');
    initializeDb(db);
    recipeCostRepository = new SQLiteRecipeCostRepository(db);

    seedOperationalRecipeData(db);

    await recipeCostRepository.upsertSnapshot({
      id: 'snapshot-1',
      recipe_id: 1,
      recipe_version_id: 1,
      recipe_name: 'Poke Bowl',
      recipe_type: 'dish',
      yield_qty: 1,
      yield_unit: 'each',
      serving_count: 1,
      total_cost: 12.5,
      resolved_cost_subtotal: 12.5,
      cost_per_yield_unit: 12.5,
      cost_per_serving: 12.5,
      completeness_status: 'complete',
      confidence_label: 'high',
      ingredient_count: 1,
      resolved_ingredient_count: 1,
      missing_cost_count: 0,
      stale_cost_count: 0,
      ambiguous_cost_count: 0,
      unit_mismatch_count: 0,
      comparable_key: '1:1:2026-03-15',
      source_run_id: null,
      primary_driver_item_id: 1,
      primary_driver_cost: 12.5,
      driver_items: [],
      components: [],
      snapshot_at: '2026-03-15T10:00:00.000Z',
      created_at: '2026-03-15T10:00:00.000Z',
      updated_at: '2026-03-15T10:00:00.000Z',
    });

    app = express();
    app.use('/api/recipe-workflow', createRecipeWorkflowRoutes(db));
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: err.message });
    });
  });

  afterEach(() => {
    db.close();
  });

  it('returns operational recipe readiness and latest snapshot details', async () => {
    const res = await request(app).get('/api/recipe-workflow/operational-summary');

    expect(res.status).toBe(200);
    expect(res.body.counts.total_promoted_recipes).toBe(2);
    expect(res.body.counts.costable_now_count).toBe(1);
    expect(res.body.counts.operational_only_count).toBe(1);

    const costable = res.body.summaries.find((summary: any) => summary.recipe_id === 1);
    expect(costable.costability_classification).toBe('COSTABLE_NOW');
    expect(costable.latest_snapshot.total_cost).toBe(12.5);
    expect(costable.vendor_linked_row_count).toBe(1);

    const blocked = res.body.summaries.find((summary: any) => summary.recipe_id === 2);
    expect(blocked.costability_classification).toBe('OPERATIONAL_ONLY');
    expect(blocked.missing_vendor_mapping_count).toBe(1);
    expect(blocked.latest_snapshot).toBeNull();
  });

  it('returns ingredient-level resolution detail for a promoted recipe version', async () => {
    db.prepare(`
      INSERT INTO recipe_versions (id, recipe_id, version_number, status, yield_quantity, yield_unit)
      VALUES (3, 1, 2, 'archived', 1, 'each')
    `).run();
    db.prepare(`
      INSERT INTO recipe_ingredients (recipe_version_id, line_index, raw_ingredient_text, canonical_ingredient_id, inventory_item_id, quantity_normalized, unit_normalized)
      VALUES (3, 1, '8 oz ahi tuna archived', 1, NULL, 0.8, 'lb')
    `).run();
    await recipeCostRepository.upsertSnapshot({
      id: 'snapshot-2',
      recipe_id: 1,
      recipe_version_id: 3,
      recipe_name: 'Poke Bowl',
      recipe_type: 'dish',
      yield_qty: 1,
      yield_unit: 'each',
      serving_count: 1,
      total_cost: 13.2,
      resolved_cost_subtotal: 13.2,
      cost_per_yield_unit: 13.2,
      cost_per_serving: 13.2,
      completeness_status: 'partial',
      confidence_label: 'medium',
      ingredient_count: 1,
      resolved_ingredient_count: 1,
      missing_cost_count: 0,
      stale_cost_count: 1,
      ambiguous_cost_count: 0,
      unit_mismatch_count: 0,
      comparable_key: '1:3:2026-03-10',
      source_run_id: null,
      primary_driver_item_id: 1,
      primary_driver_cost: 13.2,
      driver_items: [],
      components: [],
      snapshot_at: '2026-03-10T10:00:00.000Z',
      created_at: '2026-03-10T10:00:00.000Z',
      updated_at: '2026-03-10T10:00:00.000Z',
    });

    const res = await request(app).get('/api/recipe-workflow/operational-summary/1');

    expect(res.status).toBe(200);
    expect(res.body.summary.recipe_id).toBe(1);
    expect(res.body.ingredient_rows).toHaveLength(1);
    expect(res.body.ingredient_rows[0].costability_status).toBe('RESOLVED_FOR_COSTING');
    expect(res.body.ingredient_rows[0].vendor_cost_lineage.normalized_unit_cost).toBe(12.5);
    expect(res.body.version_history).toHaveLength(2);
    expect(res.body.version_history[0].version_number).toBe(3);
    expect(res.body.snapshot_history).toHaveLength(2);
    expect(res.body.snapshot_history.map((snapshot: any) => snapshot.version_number)).toEqual([3, 2]);
  });
});

function seedOperationalRecipeData(db: Database.Database) {
  db.prepare(`INSERT INTO items (id, name, category, unit, current_qty) VALUES (1, 'Ahi Tuna', 'protein', 'lb', 10)`).run();
  db.prepare(`INSERT INTO items (id, name, category, unit, current_qty) VALUES (2, 'Cucumber', 'produce', 'lb', 8)`).run();
  db.prepare(`INSERT INTO vendors (id, name) VALUES (1, 'Sysco')`).run();
  db.prepare(`
    INSERT INTO vendor_prices (id, item_id, vendor_id, vendor_item_name, order_unit, order_unit_price, qty_per_unit, is_default)
    VALUES (1, 1, 1, 'Ahi Tuna Case', 'case', 125, 10, 1)
  `).run();

  db.prepare(`
    INSERT INTO canonical_ingredients (id, canonical_name, normalized_canonical_name, category, base_unit, perishable_flag, active, source_hash)
    VALUES (1, 'ahi tuna', 'ahi tuna', 'protein', 'lb', 1, 1, 'seed-1')
  `).run();
  db.prepare(`
    INSERT INTO canonical_ingredients (id, canonical_name, normalized_canonical_name, category, base_unit, perishable_flag, active, source_hash)
    VALUES (2, 'cucumber', 'cucumber', 'produce', 'lb', 1, 1, 'seed-2')
  `).run();

  db.prepare(`INSERT INTO recipes (id, name, type) VALUES (1, 'Poke Bowl', 'dish')`).run();
  db.prepare(`INSERT INTO recipes (id, name, type) VALUES (2, 'Cucumber Salad', 'dish')`).run();

  db.prepare(`
    INSERT INTO recipe_versions (id, recipe_id, version_number, status, yield_quantity, yield_unit)
    VALUES (1, 1, 3, 'active', 1, 'each')
  `).run();
  db.prepare(`
    INSERT INTO recipe_versions (id, recipe_id, version_number, status, yield_quantity, yield_unit)
    VALUES (2, 2, 1, 'active', 1, 'each')
  `).run();

  db.prepare(`
    INSERT INTO recipe_ingredients (recipe_version_id, line_index, raw_ingredient_text, canonical_ingredient_id, inventory_item_id, quantity_normalized, unit_normalized)
    VALUES (1, 1, '8 oz ahi tuna', 1, NULL, 0.8, 'lb')
  `).run();
  db.prepare(`
    INSERT INTO recipe_ingredients (recipe_version_id, line_index, raw_ingredient_text, canonical_ingredient_id, inventory_item_id, quantity_normalized, unit_normalized)
    VALUES (2, 1, '1 lb cucumber', 2, NULL, 1, 'lb')
  `).run();

  db.prepare(`
    INSERT INTO canonical_inventory_mappings (
      canonical_ingredient_id,
      inventory_item_id,
      scope_type,
      scope_ref_id,
      active,
      preferred_flag,
      mapping_status,
      confidence_label,
      match_reason,
      explanation_text
    ) VALUES (1, 1, 'organization', 1, 1, 1, 'MANUALLY_MAPPED', 'HIGH', 'manual_resolution', 'Mapped ahi tuna to inventory item Ahi Tuna at organization scope.')
  `).run();
  db.prepare(`
    INSERT INTO canonical_inventory_mappings (
      canonical_ingredient_id,
      inventory_item_id,
      scope_type,
      scope_ref_id,
      active,
      preferred_flag,
      mapping_status,
      confidence_label,
      match_reason,
      explanation_text
    ) VALUES (2, 2, 'organization', 1, 1, 1, 'MANUALLY_MAPPED', 'HIGH', 'manual_resolution', 'Mapped cucumber to inventory item Cucumber at organization scope.')
  `).run();

  db.prepare(`
    INSERT INTO inventory_vendor_mappings (
      inventory_item_id,
      vendor_item_id,
      scope_type,
      scope_ref_id,
      active,
      preferred_flag,
      mapping_status,
      confidence_label,
      match_reason,
      explanation_text
    ) VALUES (1, 1, 'organization', 1, 1, 1, 'MANUALLY_MAPPED', 'HIGH', 'manual_resolution', 'Mapped Ahi Tuna to Sysco vendor item at organization scope.')
  `).run();
}
