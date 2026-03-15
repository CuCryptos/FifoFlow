import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initializeDb } from '../db.js';
import {
  DEFAULT_RECIPE_COST_DRIFT_THRESHOLD_CONFIG,
  resolveRecipeCostDriftThresholdPolicyBundle,
} from '../intelligence/index.js';
import type { IntelligenceJobContext } from '../intelligence/types.js';
import { SQLitePolicyRepository, type PolicyScopeType } from '../platform/policy/index.js';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  initializeDb(db);
  return db;
}

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

describe('recipe cost drift threshold policy resolver', () => {
  it('uses global default policy values when present', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'recipe_cost_drift_pct_threshold',
        scope_type: 'global',
        value: 0.09,
        version_number: 1,
      });

      const bundle = await resolveRecipeCostDriftThresholdPolicyBundle({
        subject: { recipe_id: 10, recipe_name: 'Seared Ahi Plate', recipe_type: 'dish' },
        context: createContext(),
        policyRepository,
      });

      expect(bundle.thresholds.recipe_cost_drift_pct_threshold).toBe(0.09);
      expect(bundle.metadata.recipe_cost_drift_pct_threshold.source).toBe('policy');
      expect(bundle.metadata.recipe_cost_drift_pct_threshold.matched_scope_type).toBe('global');
    } finally {
      db.close();
    }
  });

  it('location override beats organization default', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'recipe_cost_drift_abs_threshold',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: 1.1,
        version_number: 1,
      });
      await seedPolicy(policyRepository, {
        policy_key: 'recipe_cost_drift_abs_threshold',
        scope_type: 'location',
        scope_ref_id: 2,
        value: 0.65,
        version_number: 2,
      });

      const bundle = await resolveRecipeCostDriftThresholdPolicyBundle({
        subject: { recipe_id: 10, recipe_name: 'Seared Ahi Plate', recipe_type: 'dish' },
        context: createContext(),
        policyRepository,
      });

      expect(bundle.thresholds.recipe_cost_drift_abs_threshold).toBe(0.65);
      expect(bundle.metadata.recipe_cost_drift_abs_threshold.matched_scope_type).toBe('location');
    } finally {
      db.close();
    }
  });

  it('recipe group override beats broader scope when applicable', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'recipe_cost_immediate_pct_threshold',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: 0.2,
        version_number: 1,
      });
      await seedPolicy(policyRepository, {
        policy_key: 'recipe_cost_immediate_pct_threshold',
        scope_type: 'recipe_group',
        scope_ref_key: 'dish',
        value: 0.12,
        version_number: 2,
      });

      const bundle = await resolveRecipeCostDriftThresholdPolicyBundle({
        subject: { recipe_id: 10, recipe_name: 'Seared Ahi Plate', recipe_type: 'dish' },
        context: createContext(),
        policyRepository,
      });

      expect(bundle.thresholds.immediate_recipe_cost_drift_pct_threshold).toBe(0.12);
      expect(bundle.metadata.immediate_recipe_cost_drift_pct_threshold.matched_scope_type).toBe('recipe_group');
      expect(bundle.metadata.immediate_recipe_cost_drift_pct_threshold.matched_scope_ref_key).toBe('dish');
    } finally {
      db.close();
    }
  });

  it('ignores inactive policy rows', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'ingredient_cost_driver_abs_threshold',
        scope_type: 'global',
        value: 0.42,
        version_number: 1,
      });
      await seedPolicy(policyRepository, {
        policy_key: 'ingredient_cost_driver_abs_threshold',
        scope_type: 'location',
        scope_ref_id: 2,
        value: 0.25,
        version_number: 2,
        scope_active: false,
      });

      const bundle = await resolveRecipeCostDriftThresholdPolicyBundle({
        subject: { recipe_id: 10, recipe_name: 'Seared Ahi Plate', recipe_type: 'dish' },
        context: createContext(),
        policyRepository,
      });

      expect(bundle.thresholds.ingredient_driver_abs_threshold).toBe(0.42);
      expect(bundle.metadata.ingredient_driver_abs_threshold.matched_scope_type).toBe('global');
    } finally {
      db.close();
    }
  });

  it('respects effective date when selecting active policy version', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'recipe_cost_min_prior_snapshot_age_days',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: 5,
        version_number: 1,
        effective_start_at: '2026-01-01T00:00:00.000Z',
        effective_end_at: '2026-04-01T00:00:00.000Z',
      });
      await seedPolicy(policyRepository, {
        policy_key: 'recipe_cost_min_prior_snapshot_age_days',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: 2,
        version_number: 2,
        effective_start_at: '2026-04-01T00:00:00.000Z',
      });

      const march = await resolveRecipeCostDriftThresholdPolicyBundle({
        subject: { recipe_id: 10, recipe_name: 'Seared Ahi Plate', recipe_type: 'dish' },
        context: createContext({ now: '2026-03-15T12:00:00.000Z' }),
        policyRepository,
      });
      const april = await resolveRecipeCostDriftThresholdPolicyBundle({
        subject: { recipe_id: 10, recipe_name: 'Seared Ahi Plate', recipe_type: 'dish' },
        context: createContext(),
        policyRepository,
      });

      expect(march.thresholds.minimum_prior_snapshot_age_days).toBe(5);
      expect(april.thresholds.minimum_prior_snapshot_age_days).toBe(2);
    } finally {
      db.close();
    }
  });

  it('falls back explicitly to defaults when no policy rows exist', async () => {
    const db = createDb();
    try {
      const bundle = await resolveRecipeCostDriftThresholdPolicyBundle({
        subject: { recipe_id: 10, recipe_name: 'Seared Ahi Plate', recipe_type: 'dish' },
        context: createContext(),
      });

      expect(bundle.thresholds.recipe_cost_drift_pct_threshold)
        .toBe(DEFAULT_RECIPE_COST_DRIFT_THRESHOLD_CONFIG.category_overrides.dish!.recipe_cost_drift_pct_threshold);
      expect(bundle.fallback_used).toBe(true);
      expect(bundle.metadata.recipe_cost_drift_pct_threshold.source).toBe('fallback_default');
    } finally {
      db.close();
    }
  });

  it('returns threshold explanation metadata for resolved keys', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'recipe_cost_immediate_abs_threshold',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: 2.5,
        version_number: 1,
      });

      const bundle = await resolveRecipeCostDriftThresholdPolicyBundle({
        subject: { recipe_id: 10, recipe_name: 'Seared Ahi Plate', recipe_type: 'dish' },
        context: createContext(),
        policyRepository,
      });

      expect(bundle.metadata.immediate_recipe_cost_drift_abs_threshold).toMatchObject({
        policy_key: 'recipe_cost_immediate_abs_threshold',
        source: 'policy',
        matched_scope_type: 'organization',
        matched_scope_ref_id: 1,
      });
      expect(bundle.metadata.immediate_recipe_cost_drift_abs_threshold.resolution_path.length).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});
