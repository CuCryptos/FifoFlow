import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { RecipeType, Unit } from '@fifoflow/shared';
import { initializeDb } from '../db.js';
import {
  DEFAULT_RECIPE_COST_DRIFT_THRESHOLD_CONFIG,
  DEFAULT_RECIPE_COST_THRESHOLDS,
  SQLiteIntelligenceRepository,
  SQLiteRecipeCostRepository,
  StaticRecipeCostSource,
  evaluateRecipeCostDriftSignal,
  executeRecipeCostDriftIntelligence,
  executeRecipeCostSnapshots,
  resolveRecipeCostDriftThresholds,
  type IngredientCostCandidate,
  type RecipeDefinition,
} from '../intelligence/index.js';
import type { IntelligenceJobContext } from '../intelligence/types.js';
import { SQLitePolicyRepository, type PolicyScopeType } from '../platform/policy/index.js';

function createContext(overrides?: Partial<IntelligenceJobContext>): IntelligenceJobContext {
  return {
    scope: {
      organizationId: 1,
      locationId: 2,
      operationUnitId: 3,
    },
    window: {
      start: '2026-04-01T00:00:00.000Z',
      end: '2026-04-30T23:59:59.000Z',
    },
    ruleVersion: 'recipe-cost-drift/v1',
    now: '2026-04-30T12:00:00.000Z',
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

function createRepositories(): {
  db: Database.Database;
  intelligenceRepository: SQLiteIntelligenceRepository;
  recipeCostRepository: SQLiteRecipeCostRepository;
} {
  const db = new Database(':memory:');
  initializeDb(db);
  db.prepare(
    `
      INSERT INTO items (id, name, category, unit, current_qty)
      VALUES
        (44, 'Sesame Oil', 'Oil', 'fl oz', 0),
        (91, 'Ahi Tuna', 'Seafood', 'lb', 0)
    `,
  ).run();
  db.prepare(
    `
      INSERT INTO recipes (id, name, type, notes)
      VALUES (?, ?, ?, ?)
    `,
  ).run(10, 'Seared Ahi Plate', 'dish', null);

  return {
    db,
    intelligenceRepository: new SQLiteIntelligenceRepository(db),
    recipeCostRepository: new SQLiteRecipeCostRepository(db),
  };
}

async function seedPolicy(
  repository: SQLitePolicyRepository,
  input: {
    policy_key: string;
    scope_type: PolicyScopeType;
    scope_ref_id?: number | null;
    scope_ref_key?: string | null;
    value: number;
    version_number: number;
    effective_start_at?: string;
    effective_end_at?: string | null;
    definition_active?: boolean;
    version_active?: boolean;
    scope_active?: boolean;
  },
): Promise<void> {
  const definition = await repository.createPolicyDefinition({
    policy_key: input.policy_key,
    display_name: input.policy_key,
    description: null,
    value_type: 'number',
    active: input.definition_active ?? true,
  });
  const version = await repository.createPolicyVersion({
    policy_definition_id: definition.id,
    version_number: input.version_number,
    effective_start_at: input.effective_start_at ?? '2026-01-01T00:00:00.000Z',
    effective_end_at: input.effective_end_at ?? null,
    active: input.version_active ?? true,
  });
  const scope = await repository.createPolicyScope({
    policy_version_id: version.id,
    scope_type: input.scope_type,
    scope_ref_id: input.scope_ref_id ?? null,
    scope_ref_key: input.scope_ref_key ?? null,
    active: input.scope_active ?? true,
  });
  await repository.createPolicyValue({
    policy_scope_id: scope.id,
    value_json: JSON.stringify(input.value),
  });
}

async function persistComparableSnapshots(
  recipeCostRepository: SQLiteRecipeCostRepository,
  overrides?: {
    marchCandidates?: IngredientCostCandidate[];
    aprilCandidates?: IngredientCostCandidate[];
  },
): Promise<void> {
  const marchSource = new StaticRecipeCostSource(
    [createRecipe()],
    overrides?.marchCandidates ?? [
      createCandidate({ normalized_unit_cost: 12, observed_at: '2026-03-20T00:00:00.000Z', source_ref_id: '501' }),
      createCandidate({ inventory_item_id: 44, inventory_item_name: 'Sesame Oil', normalized_unit_cost: 0.45, base_unit: 'fl oz', observed_at: '2026-03-20T00:00:00.000Z', source_ref_id: '502' }),
    ],
  );
  const aprilSource = new StaticRecipeCostSource(
    [createRecipe()],
    overrides?.aprilCandidates ?? [
      createCandidate({ normalized_unit_cost: 14, observed_at: '2026-04-15T00:00:00.000Z', source_ref_id: '601' }),
      createCandidate({ inventory_item_id: 44, inventory_item_name: 'Sesame Oil', normalized_unit_cost: 0.55, base_unit: 'fl oz', observed_at: '2026-04-15T00:00:00.000Z', source_ref_id: '602' }),
    ],
  );

  await executeRecipeCostSnapshots(
    createContext({
      ruleVersion: 'recipe-cost/v1',
      window: { start: '2026-03-01T00:00:00.000Z', end: '2026-03-31T00:00:00.000Z' },
      now: '2026-03-31T12:00:00.000Z',
    }),
    { source: marchSource, repository: recipeCostRepository, thresholds: DEFAULT_RECIPE_COST_THRESHOLDS },
  );

  await executeRecipeCostSnapshots(
    createContext({
      ruleVersion: 'recipe-cost/v1',
      window: { start: '2026-04-01T00:00:00.000Z', end: '2026-04-30T00:00:00.000Z' },
      now: '2026-04-30T12:00:00.000Z',
    }),
    { source: aprilSource, repository: recipeCostRepository, thresholds: DEFAULT_RECIPE_COST_THRESHOLDS },
  );
}

describe('recipe cost drift intelligence', () => {
  it('emits recipe cost drift and ingredient driver signals when thresholds are exceeded', async () => {
    const { db, intelligenceRepository, recipeCostRepository } = createRepositories();
    try {
      await persistComparableSnapshots(recipeCostRepository);

      const result = await executeRecipeCostDriftIntelligence(createContext(), {
        recipeCostRepository,
        intelligenceRepository,
      });

      expect(result.recipe_cost_drift_summary).toMatchObject({
        recipes_evaluated: 1,
        comparable_recipes: 1,
        drift_signals_emitted: 1,
        driver_signals_emitted: 1,
      });
      expect(result.run_summary).toMatchObject({
        signals_created: 2,
        signals_updated: 0,
      });
      expect(result.signals?.map((signal) => signal.signal_type)).toEqual(
        expect.arrayContaining(['RECIPE_COST_DRIFT', 'INGREDIENT_COST_DRIVER']),
      );

      const activeSignals = await intelligenceRepository.fetchActiveSignalsBySubject({
        subject_type: 'recipe',
        subject_key: 'recipe:10:1',
      });
      const driftSignal = activeSignals.find((signal) => signal.signal_type === 'RECIPE_COST_DRIFT');
      const driverSignal = result.signals?.find((signal) => signal.signal_type === 'INGREDIENT_COST_DRIVER');
      const driftExplainability = driftSignal?.signal_payload.threshold_explainability as {
        fallback_used: boolean;
        resolved_thresholds: Array<{ source: string }>;
      };

      expect(driftSignal?.signal_payload.delta_cost).toBe(1.2);
      expect(driftSignal?.evidence).toHaveLength(2);
      expect(driftExplainability.fallback_used).toBe(true);
      expect(driftExplainability.resolved_thresholds.every((entry) => entry.source === 'fallback_default')).toBe(true);
      expect(driverSignal?.signal_payload.ingredient_name).toBe('Ahi Tuna');
      expect(driverSignal?.signal_payload.ingredient_delta_cost).toBe(1);
      expect(driverSignal?.inventory_item_id).toBe(91);
    } finally {
      db.close();
    }
  });

  it('does not emit a drift signal when the comparison stays below threshold', async () => {
    const { db, intelligenceRepository, recipeCostRepository } = createRepositories();
    try {
      await persistComparableSnapshots(recipeCostRepository, {
        aprilCandidates: [
          createCandidate({ normalized_unit_cost: 12.4, observed_at: '2026-04-15T00:00:00.000Z', source_ref_id: '601' }),
          createCandidate({ inventory_item_id: 44, inventory_item_name: 'Sesame Oil', normalized_unit_cost: 0.45, base_unit: 'fl oz', observed_at: '2026-04-15T00:00:00.000Z', source_ref_id: '602' }),
        ],
      });

      const result = await executeRecipeCostDriftIntelligence(createContext(), {
        recipeCostRepository,
        intelligenceRepository,
      });

      expect(result.signals).toHaveLength(0);
      expect(result.recipe_cost_drift_summary.drift_signals_emitted).toBe(0);
    } finally {
      db.close();
    }
  });

  it('does not emit a drift signal for an incomplete current snapshot', async () => {
    const { db, recipeCostRepository } = createRepositories();
    try {
      await persistComparableSnapshots(recipeCostRepository, {
        aprilCandidates: [
          createCandidate({ normalized_unit_cost: 14, observed_at: '2026-04-15T00:00:00.000Z', source_ref_id: '601' }),
        ],
      });

      const current = await recipeCostRepository.getLatestComparableSnapshot(10, 1);
      const previous = await recipeCostRepository.getPreviousComparableSnapshot(10, '2026-04-30T12:00:00.000Z', 1);
      const incompleteCurrent = {
        ...(await recipeCostRepository.listSnapshots())[0]!,
        completeness_status: 'incomplete' as const,
        confidence_label: 'low' as const,
      };
      const comparison = current
        ? await recipeCostRepository.buildComparableSnapshotComparison(current, 1)
        : null;

      const signal = current && previous && comparison
        ? evaluateRecipeCostDriftSignal(
            {
              recipe_id: current.recipe_id,
              recipe_version_id: current.recipe_version_id ?? null,
              current_snapshot: incompleteCurrent,
              previous_snapshot: previous,
              comparison,
            },
            createContext(),
            resolveRecipeCostDriftThresholds('dish', DEFAULT_RECIPE_COST_DRIFT_THRESHOLD_CONFIG),
          )
        : null;

      expect(signal).toBeNull();
    } finally {
      db.close();
    }
  });

  it('does not emit drift signals without a prior trusted comparable snapshot', async () => {
    const { db, intelligenceRepository, recipeCostRepository } = createRepositories();
    try {
      await executeRecipeCostSnapshots(
        createContext({
          ruleVersion: 'recipe-cost/v1',
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
          repository: recipeCostRepository,
          thresholds: DEFAULT_RECIPE_COST_THRESHOLDS,
        },
      );

      const result = await executeRecipeCostDriftIntelligence(createContext(), {
        recipeCostRepository,
        intelligenceRepository,
      });

      expect(result.signals).toHaveLength(0);
      expect(result.recipe_cost_drift_summary.recipes_skipped_no_prior).toBe(1);
    } finally {
      db.close();
    }
  });

  it('does not emit ingredient driver signals for weak contributors', async () => {
    const { db, intelligenceRepository, recipeCostRepository } = createRepositories();
    try {
      await persistComparableSnapshots(recipeCostRepository, {
        aprilCandidates: [
          createCandidate({ normalized_unit_cost: 13.6, observed_at: '2026-04-15T00:00:00.000Z', source_ref_id: '601' }),
          createCandidate({ inventory_item_id: 44, inventory_item_name: 'Sesame Oil', normalized_unit_cost: 0.46, base_unit: 'fl oz', observed_at: '2026-04-15T00:00:00.000Z', source_ref_id: '602' }),
        ],
      });

      const result = await executeRecipeCostDriftIntelligence(createContext(), {
        recipeCostRepository,
        intelligenceRepository,
        thresholdConfig: {
          global: {
            ...DEFAULT_RECIPE_COST_DRIFT_THRESHOLD_CONFIG.global,
            ingredient_driver_abs_threshold: 1,
          },
          category_overrides: {},
        },
      });

      expect(result.signals?.filter((signal) => signal.signal_type === 'INGREDIENT_COST_DRIVER')).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it('remains idempotent on rerun and persists through the shared intelligence repository', async () => {
    const { db, intelligenceRepository, recipeCostRepository } = createRepositories();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await persistComparableSnapshots(recipeCostRepository);
      await seedPolicy(policyRepository, {
        policy_key: 'recipe_cost_drift_pct_threshold',
        scope_type: 'global',
        value: 0.08,
        version_number: 1,
      });

      const first = await executeRecipeCostDriftIntelligence(createContext(), {
        recipeCostRepository,
        intelligenceRepository,
        policyRepository,
      });
      const second = await executeRecipeCostDriftIntelligence(createContext(), {
        recipeCostRepository,
        intelligenceRepository,
        policyRepository,
      });

      expect(first.run_summary).toMatchObject({ signals_created: 2, signals_updated: 0 });
      expect(second.run_summary).toMatchObject({ signals_created: 0, signals_updated: 2 });

      const activeSignals = await intelligenceRepository.fetchActiveSignalsBySubject({
        subject_type: 'recipe',
        subject_key: 'recipe:10:1',
      });
      expect(activeSignals).toHaveLength(1);
      const signalCount = db.prepare('SELECT COUNT(*) as count FROM derived_signals').get() as { count: number };
      expect(signalCount.count).toBe(2);
    } finally {
      db.close();
    }
  });

  it('supports threshold overrides when supplied', async () => {
    const { db, intelligenceRepository, recipeCostRepository } = createRepositories();
    try {
      await persistComparableSnapshots(recipeCostRepository, {
        aprilCandidates: [
          createCandidate({ normalized_unit_cost: 12.6, observed_at: '2026-04-15T00:00:00.000Z', source_ref_id: '601' }),
          createCandidate({ inventory_item_id: 44, inventory_item_name: 'Sesame Oil', normalized_unit_cost: 0.45, base_unit: 'fl oz', observed_at: '2026-04-15T00:00:00.000Z', source_ref_id: '602' }),
        ],
      });

      const result = await executeRecipeCostDriftIntelligence(createContext(), {
        recipeCostRepository,
        intelligenceRepository,
        thresholdConfig: {
          global: DEFAULT_RECIPE_COST_DRIFT_THRESHOLD_CONFIG.global,
          category_overrides: {
            dish: {
              recipe_cost_drift_abs_threshold: 0.25,
              recipe_cost_drift_pct_threshold: 0.02,
              ingredient_driver_abs_threshold: 0.2,
              ingredient_driver_pct_of_total_delta_threshold: 0.5,
            },
          },
        },
      });

      expect(result.signals?.some((signal) => signal.signal_type === 'RECIPE_COST_DRIFT')).toBe(true);
    } finally {
      db.close();
    }
  });

  it('uses resolved policy thresholds instead of static defaults when policy rows exist', async () => {
    const { db, intelligenceRepository, recipeCostRepository } = createRepositories();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await persistComparableSnapshots(recipeCostRepository, {
        aprilCandidates: [
          createCandidate({ normalized_unit_cost: 12.6, observed_at: '2026-04-15T00:00:00.000Z', source_ref_id: '601' }),
          createCandidate({ inventory_item_id: 44, inventory_item_name: 'Sesame Oil', normalized_unit_cost: 0.45, base_unit: 'fl oz', observed_at: '2026-04-15T00:00:00.000Z', source_ref_id: '602' }),
        ],
      });
      await seedPolicy(policyRepository, {
        policy_key: 'recipe_cost_drift_pct_threshold',
        scope_type: 'recipe_group',
        scope_ref_key: 'dish',
        value: 0.02,
        version_number: 1,
      });
      await seedPolicy(policyRepository, {
        policy_key: 'recipe_cost_drift_abs_threshold',
        scope_type: 'recipe_group',
        scope_ref_key: 'dish',
        value: 0.25,
        version_number: 1,
      });
      await seedPolicy(policyRepository, {
        policy_key: 'ingredient_cost_driver_abs_threshold',
        scope_type: 'recipe_group',
        scope_ref_key: 'dish',
        value: 0.2,
        version_number: 1,
      });
      await seedPolicy(policyRepository, {
        policy_key: 'ingredient_cost_driver_pct_of_total_delta_threshold',
        scope_type: 'recipe_group',
        scope_ref_key: 'dish',
        value: 0.5,
        version_number: 1,
      });

      const result = await executeRecipeCostDriftIntelligence(createContext(), {
        recipeCostRepository,
        intelligenceRepository,
        policyRepository,
      });

      const driftSignal = result.signals?.find((signal) => signal.signal_type === 'RECIPE_COST_DRIFT');
      const explainability = driftSignal?.signal_payload.threshold_explainability as {
        fallback_used: boolean;
        resolved_thresholds: Array<{ threshold_field: string; source: string; matched_scope_type: string | null }>;
      };

      expect(driftSignal).toBeDefined();
      expect(driftSignal?.signal_payload.threshold_used).toMatchObject({
        recipe_cost_drift_pct_threshold: 0.02,
        recipe_cost_drift_abs_threshold: 0.25,
      });
      expect(explainability.fallback_used).toBe(true);
      expect(explainability.resolved_thresholds.find((entry) => entry.threshold_field === 'recipe_cost_drift_pct_threshold'))
        .toMatchObject({ source: 'policy', matched_scope_type: 'recipe_group' });
      expect(explainability.resolved_thresholds.find((entry) => entry.threshold_field === 'recipe_cost_drift_abs_threshold'))
        .toMatchObject({ source: 'policy', matched_scope_type: 'recipe_group' });
    } finally {
      db.close();
    }
  });

  it('location override beats organization default in drift policy resolution', async () => {
    const { db, intelligenceRepository, recipeCostRepository } = createRepositories();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await persistComparableSnapshots(recipeCostRepository);
      await seedPolicy(policyRepository, {
        policy_key: 'recipe_cost_drift_abs_threshold',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: 2.0,
        version_number: 1,
      });
      await seedPolicy(policyRepository, {
        policy_key: 'recipe_cost_drift_abs_threshold',
        scope_type: 'location',
        scope_ref_id: 2,
        value: 0.75,
        version_number: 2,
      });

      const result = await executeRecipeCostDriftIntelligence(createContext(), {
        recipeCostRepository,
        intelligenceRepository,
        policyRepository,
      });

      const driftSignal = result.signals?.find((signal) => signal.signal_type === 'RECIPE_COST_DRIFT');
      const explainability = driftSignal?.signal_payload.threshold_explainability as {
        resolved_thresholds: Array<{ threshold_field: string; matched_scope_type: string | null; value: number }>;
      };

      expect(driftSignal).toBeDefined();
      expect(explainability.resolved_thresholds.find((entry) => entry.threshold_field === 'recipe_cost_drift_abs_threshold'))
        .toMatchObject({ matched_scope_type: 'location', value: 0.75 });
    } finally {
      db.close();
    }
  });
});
