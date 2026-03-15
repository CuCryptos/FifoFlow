import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initializeDb } from '../db.js';
import { DEFAULT_VARIANCE_THRESHOLD_CONFIG, resolveVarianceThresholdPolicyBundle } from '../intelligence/index.js';
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
      storageAreaId: 7,
    },
    window: {
      start: '2026-04-01T00:00:00.000Z',
      end: '2026-04-30T23:59:59.000Z',
    },
    ruleVersion: 'variance-intelligence/v1',
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

describe('variance threshold policy resolver', () => {
  it('uses global default policy values when present', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'count_variance_pct_threshold',
        scope_type: 'global',
        value: 0.12,
        version_number: 1,
      });

      const bundle = await resolveVarianceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext(),
        policyRepository,
      });

      expect(bundle.thresholds.count_variance_pct_threshold).toBe(0.12);
      expect(bundle.metadata.count_variance_pct_threshold.source).toBe('policy');
      expect(bundle.metadata.count_variance_pct_threshold.matched_scope_type).toBe('global');
    } finally {
      db.close();
    }
  });

  it('location override beats organization default', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'count_variance_abs_cost_threshold',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: 40,
        version_number: 1,
      });
      await seedPolicy(policyRepository, {
        policy_key: 'count_variance_abs_cost_threshold',
        scope_type: 'location',
        scope_ref_id: 2,
        value: 25,
        version_number: 2,
      });

      const bundle = await resolveVarianceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext(),
        policyRepository,
      });

      expect(bundle.thresholds.count_variance_abs_cost_threshold).toBe(25);
      expect(bundle.metadata.count_variance_abs_cost_threshold.matched_scope_type).toBe('location');
    } finally {
      db.close();
    }
  });

  it('storage area override beats broader scope when applicable', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'count_variance_abs_qty_threshold',
        scope_type: 'location',
        scope_ref_id: 2,
        value: 2,
        version_number: 1,
      });
      await seedPolicy(policyRepository, {
        policy_key: 'count_variance_abs_qty_threshold',
        scope_type: 'storage_area',
        scope_ref_id: 7,
        value: 0.5,
        version_number: 2,
      });

      const bundle = await resolveVarianceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext(),
        policyRepository,
      });

      expect(bundle.thresholds.count_variance_abs_qty_threshold).toBe(0.5);
      expect(bundle.metadata.count_variance_abs_qty_threshold.matched_scope_type).toBe('storage_area');
    } finally {
      db.close();
    }
  });

  it('ignores inactive policy rows', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'count_immediate_pct_threshold',
        scope_type: 'global',
        value: 0.3,
        version_number: 1,
      });
      await seedPolicy(policyRepository, {
        policy_key: 'count_immediate_pct_threshold',
        scope_type: 'operation_unit',
        scope_ref_id: 3,
        value: 0.18,
        version_number: 2,
        scope_active: false,
      });

      const bundle = await resolveVarianceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext(),
        policyRepository,
      });

      expect(bundle.thresholds.count_immediate_pct_threshold).toBe(0.3);
      expect(bundle.metadata.count_immediate_pct_threshold.matched_scope_type).toBe('global');
    } finally {
      db.close();
    }
  });

  it('respects effective date when selecting active policy version', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'count_inconsistency_window_days',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: 21,
        version_number: 1,
        effective_start_at: '2026-01-01T00:00:00.000Z',
        effective_end_at: '2026-04-01T00:00:00.000Z',
      });
      await seedPolicy(policyRepository, {
        policy_key: 'count_inconsistency_window_days',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: 14,
        version_number: 2,
        effective_start_at: '2026-04-01T00:00:00.000Z',
      });

      const march = await resolveVarianceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext({ now: '2026-03-15T12:00:00.000Z' }),
        policyRepository,
      });
      const april = await resolveVarianceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext(),
        policyRepository,
      });

      expect(march.thresholds.count_inconsistency_window_days).toBe(21);
      expect(april.thresholds.count_inconsistency_window_days).toBe(14);
    } finally {
      db.close();
    }
  });

  it('falls back explicitly to defaults when no policy rows exist', async () => {
    const db = createDb();
    try {
      const bundle = await resolveVarianceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext(),
      });

      expect(bundle.thresholds.count_variance_pct_threshold).toBe(DEFAULT_VARIANCE_THRESHOLD_CONFIG.global.count_variance_pct_threshold);
      expect(bundle.fallback_used).toBe(true);
      expect(bundle.metadata.count_variance_pct_threshold.source).toBe('fallback_default');
    } finally {
      db.close();
    }
  });

  it('returns threshold explanation metadata for resolved keys', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'count_inconsistency_recurrence_threshold',
        scope_type: 'operation_unit',
        scope_ref_id: 3,
        value: 4,
        version_number: 1,
      });

      const bundle = await resolveVarianceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext(),
        policyRepository,
      });

      expect(bundle.metadata.count_inconsistency_recurrence_threshold).toMatchObject({
        policy_key: 'count_inconsistency_recurrence_threshold',
        source: 'policy',
        matched_scope_type: 'operation_unit',
        matched_scope_ref_id: 3,
      });
      expect(bundle.metadata.count_inconsistency_recurrence_threshold.resolution_path.length).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});
