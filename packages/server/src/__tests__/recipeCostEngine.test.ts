import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type {
  IngredientCostResolution,
  RecipeCostSnapshot,
  RecipeType,
  Unit,
} from '@fifoflow/shared';
import { initializeDb } from '../db.js';
import {
  DEFAULT_RECIPE_COST_THRESHOLDS,
  InMemoryRecipeCostPersistenceRepository,
  SQLiteRecipeCostRepository,
  StaticRecipeCostSource,
  buildRecipeSnapshot,
  executeRecipeCostSnapshots,
  type IngredientCostCandidate,
  type RecipeDefinition,
} from '../intelligence/recipeCost/index.js';
import type { IntelligenceJobContext } from '../intelligence/types.js';

function createContext(overrides?: Partial<IntelligenceJobContext>): IntelligenceJobContext {
  return {
    scope: {
      organizationId: 1,
      locationId: 2,
      operationUnitId: 3,
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

function createRecipe(overrides?: Partial<RecipeDefinition>): RecipeDefinition {
  return {
    recipe_id: 10,
    recipe_version_id: 1,
    recipe_name: 'Seared Ahi Plate',
    recipe_type: 'dish' satisfies RecipeType,
    yield_qty: 4,
    yield_unit: 'each',
    serving_count: 4,
    ingredients: [
      {
        recipe_item_id: 1001,
        inventory_item_id: 91,
        inventory_item_name: 'Ahi Tuna',
        quantity: 8,
        unit: 'oz' satisfies Unit,
        base_unit: 'lb' satisfies Unit,
      },
      {
        recipe_item_id: 1002,
        inventory_item_id: 44,
        inventory_item_name: 'Sesame Oil',
        quantity: 2,
        unit: 'fl oz' satisfies Unit,
        base_unit: 'fl oz' satisfies Unit,
      },
    ],
    ...overrides,
  };
}

function createCandidate(overrides?: Partial<IngredientCostCandidate>): IngredientCostCandidate {
  return {
    inventory_item_id: 91,
    inventory_item_name: 'Ahi Tuna',
    source_type: 'invoice_recent',
    normalized_unit_cost: 12,
    base_unit: 'lb',
    observed_at: '2026-03-20T00:00:00.000Z',
    source_ref_table: 'invoice_lines',
    source_ref_id: '501',
    vendor_id: 7,
    vendor_name: 'Sysco',
    evidence: [],
    ...overrides,
  };
}

function getResolution(snapshot: RecipeCostSnapshot, inventoryItemId: number): IngredientCostResolution {
  const component = snapshot.components.find((entry) => entry.inventory_item_id === inventoryItemId);
  expect(component).toBeDefined();
  return component!.resolution;
}

function createSqliteRecipeCostRepository(): {
  db: Database.Database;
  repository: SQLiteRecipeCostRepository;
} {
  const db = new Database(':memory:');
  initializeDb(db);
  seedRecipeCostTestRecords(db);
  return {
    db,
    repository: new SQLiteRecipeCostRepository(db),
  };
}

function seedRecipeCostTestRecords(db: Database.Database): void {
  db.prepare(
    `
      INSERT INTO items (id, name, category, unit, current_qty)
      VALUES
        (44, 'Sesame Oil', 'Oil', 'fl oz', 0),
        (55, 'Macadamia Nuts', 'Dry Goods', 'oz', 0),
        (91, 'Ahi Tuna', 'Seafood', 'lb', 0)
    `,
  ).run();

  db.prepare(
    `
      INSERT INTO recipes (id, name, type, notes)
      VALUES (?, ?, ?, ?)
    `,
  ).run(10, 'Seared Ahi Plate', 'dish', null);
}

describe('recipe cost snapshot foundation', () => {
  it('generates a recipe cost snapshot from normalized ingredient costs', () => {
    const recipe = createRecipe();
    const { snapshot } = buildRecipeSnapshot(
      recipe,
      new Map([
        [
          91,
          [createCandidate()],
        ],
        [
          44,
          [
            createCandidate({
              inventory_item_id: 44,
              inventory_item_name: 'Sesame Oil',
              normalized_unit_cost: 0.45,
              base_unit: 'fl oz',
              source_ref_id: '502',
            }),
          ],
        ],
      ]),
      createContext(),
      DEFAULT_RECIPE_COST_THRESHOLDS,
    );

    expect(snapshot.total_cost).toBe(6.9);
    expect(snapshot.cost_per_serving).toBe(1.73);
    expect(snapshot.completeness_status).toBe('complete');
    expect(snapshot.confidence_label).toBe('high');
    expect(snapshot.driver_items[0]?.inventory_item_name).toBe('Ahi Tuna');
  });

  it('rolls up multiple ingredient costs into one recipe subtotal', () => {
    const recipe = createRecipe({
      ingredients: [
        ...createRecipe().ingredients,
        {
          recipe_item_id: 1003,
          inventory_item_id: 55,
          inventory_item_name: 'Macadamia Nuts',
          quantity: 4,
          unit: 'oz' satisfies Unit,
          base_unit: 'oz' satisfies Unit,
        },
      ],
    });

    const { snapshot } = buildRecipeSnapshot(
      recipe,
      new Map([
        [91, [createCandidate()]],
        [44, [createCandidate({ inventory_item_id: 44, inventory_item_name: 'Sesame Oil', normalized_unit_cost: 0.45, base_unit: 'fl oz', source_ref_id: '502' })]],
        [55, [createCandidate({ inventory_item_id: 55, inventory_item_name: 'Macadamia Nuts', normalized_unit_cost: 0.8, base_unit: 'oz', source_ref_id: '503' })]],
      ]),
      createContext(),
      DEFAULT_RECIPE_COST_THRESHOLDS,
    );

    expect(snapshot.total_cost).toBe(10.1);
    expect(snapshot.resolved_ingredient_count).toBe(3);
    expect(snapshot.driver_items).toHaveLength(3);
  });

  it('marks snapshots incomplete when an ingredient cost is missing', () => {
    const { snapshot } = buildRecipeSnapshot(
      createRecipe(),
      new Map([[91, [createCandidate()]]]),
      createContext(),
      DEFAULT_RECIPE_COST_THRESHOLDS,
    );

    expect(snapshot.total_cost).toBeNull();
    expect(snapshot.resolved_cost_subtotal).toBe(6);
    expect(snapshot.missing_cost_count).toBe(1);
    expect(snapshot.completeness_status).toBe('incomplete');
    expect(snapshot.confidence_label).toBe('low');
    expect(getResolution(snapshot, 44).status).toBe('missing_cost');
  });

  it('allows stale costs but degrades completeness and confidence', () => {
    const { snapshot } = buildRecipeSnapshot(
      createRecipe({
        ingredients: [
          {
            recipe_item_id: 1001,
            inventory_item_id: 91,
            inventory_item_name: 'Ahi Tuna',
            quantity: 1,
            unit: 'lb' satisfies Unit,
            base_unit: 'lb' satisfies Unit,
          },
        ],
      }),
      new Map([
        [
          91,
          [
            createCandidate({
              observed_at: '2026-01-01T00:00:00.000Z',
              source_type: 'vendor_price_history',
            }),
          ],
        ],
      ]),
      createContext(),
      DEFAULT_RECIPE_COST_THRESHOLDS,
    );

    expect(snapshot.total_cost).toBe(12);
    expect(snapshot.stale_cost_count).toBe(1);
    expect(snapshot.completeness_status).toBe('partial');
    expect(snapshot.confidence_label).toBe('medium');
    expect(getResolution(snapshot, 91).status).toBe('stale_cost');
  });

  it('marks ambiguity when multiple current vendor costs disagree', () => {
    const { snapshot } = buildRecipeSnapshot(
      createRecipe({
        ingredients: [
          {
            recipe_item_id: 1001,
            inventory_item_id: 91,
            inventory_item_name: 'Ahi Tuna',
            quantity: 1,
            unit: 'lb' satisfies Unit,
            base_unit: 'lb' satisfies Unit,
          },
        ],
      }),
      new Map([
        [
          91,
          [
            createCandidate({ source_ref_id: '501', normalized_unit_cost: 12 }),
            createCandidate({ source_ref_id: '502', normalized_unit_cost: 13.5, vendor_id: 8, vendor_name: 'Y. Hata' }),
          ],
        ],
      ]),
      createContext(),
      DEFAULT_RECIPE_COST_THRESHOLDS,
    );

    expect(snapshot.total_cost).toBeNull();
    expect(snapshot.ambiguous_cost_count).toBe(1);
    expect(snapshot.completeness_status).toBe('incomplete');
    expect(getResolution(snapshot, 91).status).toBe('ambiguous_cost');
  });

  it('marks unit mismatch when recipe quantity cannot be normalized to the base unit', () => {
    const { snapshot } = buildRecipeSnapshot(
      createRecipe({
        ingredients: [
          {
            recipe_item_id: 1001,
            inventory_item_id: 91,
            inventory_item_name: 'Ahi Tuna',
            quantity: 1,
            unit: 'cup' satisfies Unit,
            base_unit: 'lb' satisfies Unit,
          },
        ],
      }),
      new Map([[91, [createCandidate()]]]),
      createContext(),
      DEFAULT_RECIPE_COST_THRESHOLDS,
    );

    expect(snapshot.unit_mismatch_count).toBe(1);
    expect(snapshot.total_cost).toBeNull();
    expect(getResolution(snapshot, 91).status).toBe('unit_mismatch');
  });

  it('executes the snapshot job and persists outputs through the repository interface', async () => {
    const repository = new InMemoryRecipeCostPersistenceRepository();
    const source = new StaticRecipeCostSource(
      [createRecipe()],
      [
        createCandidate(),
        createCandidate({
          inventory_item_id: 44,
          inventory_item_name: 'Sesame Oil',
          normalized_unit_cost: 0.45,
          base_unit: 'fl oz',
          source_ref_id: '502',
        }),
      ],
    );

    const result = await executeRecipeCostSnapshots(createContext(), {
      source,
      repository,
    });

    expect(result.run_summary).toMatchObject({
      recipe_count: 1,
      snapshots_created: 1,
      complete_snapshots: 1,
    });
    expect(result.snapshots).toHaveLength(1);
    expect(await repository.listSnapshots()).toHaveLength(1);
    expect(await repository.listResolutions()).toHaveLength(2);
    expect(await repository.listComponents()).toHaveLength(2);
  });
});

describe('recipe cost SQLite persistence', () => {
  it('persists snapshots, components, resolutions, and run logs durably', async () => {
    const { db, repository } = createSqliteRecipeCostRepository();
    try {
      const source = new StaticRecipeCostSource(
        [createRecipe()],
        [
          createCandidate(),
          createCandidate({
            inventory_item_id: 44,
            inventory_item_name: 'Sesame Oil',
            normalized_unit_cost: 0.45,
            base_unit: 'fl oz',
            source_ref_id: '502',
          }),
        ],
      );

      const result = await executeRecipeCostSnapshots(createContext(), { source, repository });

      expect(result.run_summary).toMatchObject({
        snapshots_created: 1,
        snapshots_updated: 0,
        complete_snapshots: 1,
      });
      expect(result.run?.status).toBe('completed');
      expect(await repository.listSnapshots()).toHaveLength(1);
      expect(await repository.listComponents()).toHaveLength(2);
      expect(await repository.listResolutions()).toHaveLength(2);
      expect(await repository.listRuns()).toHaveLength(1);

      const persistedSnapshot = (await repository.listSnapshots())[0];
      expect(persistedSnapshot.total_cost).toBe(6.9);
      expect(persistedSnapshot.comparable_key).toBe('10:1:2026-03-31');
      expect(persistedSnapshot.source_run_id).toBe(result.run?.id ?? null);

      const componentRows = await repository.listComponents();
      expect(componentRows[0]?.recipe_cost_snapshot_id).toBe(persistedSnapshot.id);
      expect(componentRows[0]?.resolved_unit_cost).not.toBeNull();

      const resolutionRows = await repository.listResolutions();
      expect(resolutionRows[0]?.recipe_cost_snapshot_id).toBe(persistedSnapshot.id);
      expect(resolutionRows[0]?.candidate_count).toBeGreaterThanOrEqual(1);

      const runRow = db.prepare('SELECT status, snapshots_created, snapshots_updated FROM recipe_cost_runs LIMIT 1').get() as {
        status: string;
        snapshots_created: number;
        snapshots_updated: number;
      };
      expect(runRow).toEqual({
        status: 'completed',
        snapshots_created: 1,
        snapshots_updated: 0,
      });
    } finally {
      db.close();
    }
  });

  it('reruns idempotently for the same comparable window', async () => {
    const { db, repository } = createSqliteRecipeCostRepository();
    try {
      const source = new StaticRecipeCostSource(
        [createRecipe()],
        [
          createCandidate(),
          createCandidate({
            inventory_item_id: 44,
            inventory_item_name: 'Sesame Oil',
            normalized_unit_cost: 0.45,
            base_unit: 'fl oz',
            source_ref_id: '502',
          }),
        ],
      );

      await executeRecipeCostSnapshots(createContext(), { source, repository });
      const second = await executeRecipeCostSnapshots(createContext(), { source, repository });

      expect(second.run_summary).toMatchObject({
        snapshots_created: 0,
        snapshots_updated: 1,
      });
      expect(await repository.listSnapshots()).toHaveLength(1);
      expect(await repository.listComponents()).toHaveLength(2);
      expect(await repository.listResolutions()).toHaveLength(2);
      expect(await repository.listRuns()).toHaveLength(2);
    } finally {
      db.close();
    }
  });

  it('retrieves latest and previous comparable trusted snapshots', async () => {
    const { db, repository } = createSqliteRecipeCostRepository();
    try {
      const marchSource = new StaticRecipeCostSource(
        [createRecipe()],
        [
          createCandidate({ normalized_unit_cost: 12 }),
          createCandidate({
            inventory_item_id: 44,
            inventory_item_name: 'Sesame Oil',
            normalized_unit_cost: 0.45,
            base_unit: 'fl oz',
            source_ref_id: '502',
          }),
        ],
      );
      const aprilSource = new StaticRecipeCostSource(
        [createRecipe()],
        [
          createCandidate({ normalized_unit_cost: 14, observed_at: '2026-04-15T00:00:00.000Z', source_ref_id: '601' }),
          createCandidate({
            inventory_item_id: 44,
            inventory_item_name: 'Sesame Oil',
            normalized_unit_cost: 0.55,
            base_unit: 'fl oz',
            observed_at: '2026-04-15T00:00:00.000Z',
            source_ref_id: '602',
          }),
        ],
      );

      await executeRecipeCostSnapshots(
        createContext({
          window: { start: '2026-03-01T00:00:00.000Z', end: '2026-03-31T00:00:00.000Z' },
          now: '2026-03-31T12:00:00.000Z',
        }),
        { source: marchSource, repository },
      );
      const aprilResult = await executeRecipeCostSnapshots(
        createContext({
          window: { start: '2026-04-01T00:00:00.000Z', end: '2026-04-30T00:00:00.000Z' },
          now: '2026-04-30T12:00:00.000Z',
        }),
        { source: aprilSource, repository },
      );

      const latest = await repository.getLatestComparableSnapshot(10, 1);
      const previous = await repository.getPreviousComparableSnapshot(10, '2026-04-30T12:00:00.000Z', 1);
      const comparison = aprilResult.comparisons?.[0];

      expect(latest?.snapshot_at).toBe('2026-04-30T12:00:00.000Z');
      expect(previous?.snapshot_at).toBe('2026-03-31T12:00:00.000Z');
      expect(comparison).toMatchObject({
        comparable: true,
        total_cost_delta: 1.2,
        previous_snapshot_id: previous?.id,
      });
      expect(comparison?.primary_driver_name).toBe('Ahi Tuna');
      expect(comparison?.ingredient_deltas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ inventory_item_id: 91, delta_cost: 1 }),
          expect.objectContaining({ inventory_item_id: 44, delta_cost: 0.2 }),
        ]),
      );
    } finally {
      db.close();
    }
  });

  it('returns ingredient component history for comparable analysis', async () => {
    const { db, repository } = createSqliteRecipeCostRepository();
    try {
      await executeRecipeCostSnapshots(
        createContext(),
        {
          source: new StaticRecipeCostSource(
            [createRecipe()],
            [
              createCandidate(),
              createCandidate({ inventory_item_id: 44, inventory_item_name: 'Sesame Oil', normalized_unit_cost: 0.45, base_unit: 'fl oz', source_ref_id: '502' }),
            ],
          ),
          repository,
        },
      );
      await executeRecipeCostSnapshots(
        createContext({
          window: { start: '2026-04-01T00:00:00.000Z', end: '2026-04-30T00:00:00.000Z' },
          now: '2026-04-30T12:00:00.000Z',
        }),
        {
          source: new StaticRecipeCostSource(
            [createRecipe()],
            [
              createCandidate({ normalized_unit_cost: 13, observed_at: '2026-04-10T00:00:00.000Z', source_ref_id: '601' }),
              createCandidate({ inventory_item_id: 44, inventory_item_name: 'Sesame Oil', normalized_unit_cost: 0.5, base_unit: 'fl oz', observed_at: '2026-04-10T00:00:00.000Z', source_ref_id: '602' }),
            ],
          ),
          repository,
        },
      );

      const history = await repository.getIngredientComponentHistory(10, 91, 2);
      expect(history).toHaveLength(2);
      expect(history[0]?.extended_cost).toBe(6.5);
      expect(history[1]?.extended_cost).toBe(6);
    } finally {
      db.close();
    }
  });

  it('refuses comparison when the previous snapshot is not trusted enough', async () => {
    const { db, repository } = createSqliteRecipeCostRepository();
    try {
      await executeRecipeCostSnapshots(
        createContext({
          window: { start: '2026-03-01T00:00:00.000Z', end: '2026-03-31T00:00:00.000Z' },
          now: '2026-03-31T12:00:00.000Z',
        }),
        {
          source: new StaticRecipeCostSource([createRecipe()], [createCandidate()]),
          repository,
        },
      );

      const aprilResult = await executeRecipeCostSnapshots(
        createContext({
          window: { start: '2026-04-01T00:00:00.000Z', end: '2026-04-30T00:00:00.000Z' },
          now: '2026-04-30T12:00:00.000Z',
        }),
        {
          source: new StaticRecipeCostSource(
            [createRecipe()],
            [
              createCandidate({ normalized_unit_cost: 14, observed_at: '2026-04-15T00:00:00.000Z', source_ref_id: '601' }),
              createCandidate({ inventory_item_id: 44, inventory_item_name: 'Sesame Oil', normalized_unit_cost: 0.55, base_unit: 'fl oz', observed_at: '2026-04-15T00:00:00.000Z', source_ref_id: '602' }),
            ],
          ),
          repository,
        },
      );

      expect(aprilResult.comparisons?.[0]).toMatchObject({
        comparable: false,
        comparison_reason: 'No previous trusted comparable snapshot was available.',
      });
      expect(await repository.getLatestTrustedSnapshot(10, 1)).toMatchObject({
        snapshot_at: '2026-04-30T12:00:00.000Z',
      });
    } finally {
      db.close();
    }
  });
});
