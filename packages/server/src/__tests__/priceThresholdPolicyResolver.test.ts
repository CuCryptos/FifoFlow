import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initializeDb } from '../db.js';
import { resolvePriceThresholdPolicyBundle } from '../intelligence/priceThresholdPolicyResolver.js';
import { DEFAULT_PRICE_THRESHOLD_CONFIG } from '../intelligence/priceThresholds.js';
import { SQLitePolicyRepository, type PolicyScopeType } from '../platform/policy/index.js';
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
      locationId: 2,
      operationUnitId: 3,
    },
    window: {
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-03-31T00:00:00.000Z',
    },
    ruleVersion: 'price-intelligence/v1',
    now: '2026-03-31T12:00:00.000Z',
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

describe('price threshold policy resolver', () => {
  it('uses global default policy values when present', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'price_increase_pct_threshold',
        scope_type: 'global',
        value: 0.09,
        version_number: 1,
      });

      const bundle = await resolvePriceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext(),
        policyRepository,
      });

      expect(bundle.thresholds.percent_increase_threshold).toBe(0.09);
      expect(bundle.metadata.percent_increase_threshold.source).toBe('policy');
      expect(bundle.metadata.percent_increase_threshold.matched_scope_type).toBe('global');
    } finally {
      db.close();
    }
  });

  it('location override beats organization default', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'price_volatility_threshold',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: 0.15,
        version_number: 1,
      });
      await seedPolicy(policyRepository, {
        policy_key: 'price_volatility_threshold',
        scope_type: 'location',
        scope_ref_id: 2,
        value: 0.11,
        version_number: 2,
      });

      const bundle = await resolvePriceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext(),
        policyRepository,
      });

      expect(bundle.thresholds.volatility_threshold).toBe(0.11);
      expect(bundle.metadata.volatility_threshold.matched_scope_type).toBe('location');
    } finally {
      db.close();
    }
  });

  it('inventory category override beats broader scope when applicable', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'price_increase_pct_threshold',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: 0.08,
        version_number: 1,
      });
      await seedPolicy(policyRepository, {
        policy_key: 'price_increase_pct_threshold',
        scope_type: 'inventory_category',
        scope_ref_key: 'Seafood',
        value: 0.04,
        version_number: 2,
      });

      const bundle = await resolvePriceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext(),
        policyRepository,
      });

      expect(bundle.thresholds.percent_increase_threshold).toBe(0.04);
      expect(bundle.metadata.percent_increase_threshold.matched_scope_type).toBe('inventory_category');
      expect(bundle.metadata.percent_increase_threshold.matched_scope_ref_key).toBe('Seafood');
    } finally {
      db.close();
    }
  });

  it('ignores inactive policy rows', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'price_drop_pct_threshold',
        scope_type: 'global',
        value: 0.08,
        version_number: 1,
      });
      await seedPolicy(policyRepository, {
        policy_key: 'price_drop_pct_threshold',
        scope_type: 'location',
        scope_ref_id: 2,
        value: 0.03,
        version_number: 2,
        scope_active: false,
      });

      const bundle = await resolvePriceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext(),
        policyRepository,
      });

      expect(bundle.thresholds.percent_drop_threshold).toBe(0.08);
      expect(bundle.metadata.percent_drop_threshold.matched_scope_type).toBe('global');
    } finally {
      db.close();
    }
  });

  it('respects effective date when selecting active policy version', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'price_recurrence_window_days',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: 45,
        version_number: 1,
        effective_start_at: '2026-01-01T00:00:00.000Z',
        effective_end_at: '2026-03-01T00:00:00.000Z',
      });
      await seedPolicy(policyRepository, {
        policy_key: 'price_recurrence_window_days',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: 30,
        version_number: 2,
        effective_start_at: '2026-03-01T00:00:00.000Z',
      });

      const february = await resolvePriceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext({ now: '2026-02-15T12:00:00.000Z' }),
        policyRepository,
      });
      const march = await resolvePriceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext({ now: '2026-03-31T12:00:00.000Z' }),
        policyRepository,
      });

      expect(february.thresholds.recurrence_window_days).toBe(45);
      expect(march.thresholds.recurrence_window_days).toBe(30);
    } finally {
      db.close();
    }
  });

  it('falls back explicitly to defaults when no policy rows exist', async () => {
    const db = createDb();
    try {
      const bundle = await resolvePriceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext(),
      });

      expect(bundle.thresholds.percent_increase_threshold).toBe(DEFAULT_PRICE_THRESHOLD_CONFIG.category_overrides.Seafood!.percent_increase_threshold);
      expect(bundle.fallback_used).toBe(true);
      expect(bundle.metadata.percent_increase_threshold.source).toBe('fallback_default');
    } finally {
      db.close();
    }
  });

  it('returns threshold explanation metadata for resolved keys', async () => {
    const db = createDb();
    const policyRepository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(policyRepository, {
        policy_key: 'price_min_evidence_count',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: 4,
        version_number: 1,
      });

      const bundle = await resolvePriceThresholdPolicyBundle({
        subject: { inventory_item_id: 91, inventory_item_name: 'Ahi Tuna', inventory_category: 'Seafood' },
        context: createContext(),
        policyRepository,
      });

      expect(bundle.metadata.minimum_evidence_count.explanation_text).toContain('Resolved price_min_evidence_count');
      expect(bundle.metadata.minimum_evidence_count.resolution_path.length).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});
