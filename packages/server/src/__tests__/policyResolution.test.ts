import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initializeDb } from '../db.js';
import { SQLiteBenchmarkingRepository, lookupApplicableBenchmarks, resolvePeerGroups } from '../platform/benchmarking/index.js';
import { SQLitePolicyRepository, resolvePolicy, type PolicyScopeType, type SubjectScopeContext } from '../platform/policy/index.js';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  initializeDb(db);
  return db;
}

async function seedPolicy(
  repository: SQLitePolicyRepository,
  input: {
    policy_key: string;
    scope_type: PolicyScopeType;
    scope_ref_id?: number | null;
    scope_ref_key?: string | null;
    value: unknown;
    version_number?: number;
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
    value_type: 'json',
    active: input.definition_active ?? true,
  });
  const version = await repository.createPolicyVersion({
    policy_definition_id: definition.id,
    version_number: input.version_number ?? 1,
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

describe('scoped policy resolution', () => {
  it('falls back to global default when no narrower override exists', async () => {
    const db = createDb();
    const repository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(repository, {
        policy_key: 'variance.threshold',
        scope_type: 'global',
        value: { threshold: 0.1 },
      });

      const result = await resolvePolicy({
        policy_key: 'variance.threshold',
        subject_scope: { organization_id: 1, location_id: 10 },
        effective_at: '2026-03-14T12:00:00.000Z',
      }, repository);

      expect(result.found).toBe(true);
      expect(result.resolved_value).toEqual({ threshold: 0.1 });
      expect(result.matched_scope.scope_type).toBe('global');
    } finally {
      db.close();
    }
  });

  it('prefers location override over organization default', async () => {
    const db = createDb();
    const repository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(repository, {
        policy_key: 'price.volatility.threshold',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: { threshold: 0.12 },
        version_number: 1,
      });
      await seedPolicy(repository, {
        policy_key: 'price.volatility.threshold',
        scope_type: 'location',
        scope_ref_id: 10,
        value: { threshold: 0.08 },
        version_number: 2,
        effective_start_at: '2026-02-01T00:00:00.000Z',
      });

      const result = await resolvePolicy({
        policy_key: 'price.volatility.threshold',
        subject_scope: { organization_id: 1, location_id: 10 },
        effective_at: '2026-03-14T12:00:00.000Z',
      }, repository);

      expect(result.resolved_value).toEqual({ threshold: 0.08 });
      expect(result.matched_scope.scope_type).toBe('location');
    } finally {
      db.close();
    }
  });

  it('prefers exact subject override over broader scoped overrides', async () => {
    const db = createDb();
    const repository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(repository, {
        policy_key: 'recipe.cost.drift.threshold',
        scope_type: 'operation_unit',
        scope_ref_id: 25,
        value: { threshold: 0.07 },
        version_number: 1,
      });
      await seedPolicy(repository, {
        policy_key: 'recipe.cost.drift.threshold',
        scope_type: 'subject_entity',
        scope_ref_id: 9001,
        scope_ref_key: 'recipe',
        value: { threshold: 0.05 },
        version_number: 2,
        effective_start_at: '2026-03-01T00:00:00.000Z',
      });

      const result = await resolvePolicy({
        policy_key: 'recipe.cost.drift.threshold',
        subject_scope: {
          organization_id: 1,
          location_id: 10,
          operation_unit_id: 25,
          subject_entity_type: 'recipe',
          subject_entity_id: 9001,
        },
        effective_at: '2026-03-14T12:00:00.000Z',
      }, repository);

      expect(result.resolved_value).toEqual({ threshold: 0.05 });
      expect(result.matched_scope.scope_type).toBe('subject_entity');
      expect(result.explanation_text).toContain('subject_entity');
    } finally {
      db.close();
    }
  });

  it('ignores inactive scoped policies', async () => {
    const db = createDb();
    const repository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(repository, {
        policy_key: 'waste.alert.threshold',
        scope_type: 'global',
        value: { threshold: 0.15 },
        version_number: 1,
      });
      await seedPolicy(repository, {
        policy_key: 'waste.alert.threshold',
        scope_type: 'location',
        scope_ref_id: 10,
        value: { threshold: 0.08 },
        scope_active: false,
        version_number: 2,
      });

      const result = await resolvePolicy({
        policy_key: 'waste.alert.threshold',
        subject_scope: { organization_id: 1, location_id: 10 },
        effective_at: '2026-03-14T12:00:00.000Z',
      }, repository);

      expect(result.resolved_value).toEqual({ threshold: 0.15 });
      expect(result.matched_scope.scope_type).toBe('global');
    } finally {
      db.close();
    }
  });

  it('honors effective date range and chooses the active version', async () => {
    const db = createDb();
    const repository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(repository, {
        policy_key: 'variance.count.cooldown_days',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: { days: 14 },
        version_number: 1,
        effective_start_at: '2026-01-01T00:00:00.000Z',
        effective_end_at: '2026-03-01T00:00:00.000Z',
      });
      await seedPolicy(repository, {
        policy_key: 'variance.count.cooldown_days',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: { days: 7 },
        version_number: 2,
        effective_start_at: '2026-03-01T00:00:00.000Z',
      });

      const february = await resolvePolicy({
        policy_key: 'variance.count.cooldown_days',
        subject_scope: { organization_id: 1 },
        effective_at: '2026-02-15T12:00:00.000Z',
      }, repository);
      const march = await resolvePolicy({
        policy_key: 'variance.count.cooldown_days',
        subject_scope: { organization_id: 1 },
        effective_at: '2026-03-14T12:00:00.000Z',
      }, repository);

      expect(february.resolved_value).toEqual({ days: 14 });
      expect(march.resolved_value).toEqual({ days: 7 });
    } finally {
      db.close();
    }
  });

  it('returns an explanation path describing fallback steps', async () => {
    const db = createDb();
    const repository = new SQLitePolicyRepository(db);
    try {
      await seedPolicy(repository, {
        policy_key: 'memo.urgency.default',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: { urgency: 'THIS_WEEK' },
      });

      const result = await resolvePolicy({
        policy_key: 'memo.urgency.default',
        subject_scope: { organization_id: 1, location_id: 10, operation_unit_id: 22 },
        effective_at: '2026-03-14T12:00:00.000Z',
      }, repository, { persist_log: true });

      expect(result.resolution_path.some((step) => step.scope_type === 'location' && step.matched === false)).toBe(true);
      expect(result.resolution_path.at(-1)?.scope_type).toBe('organization');
    } finally {
      db.close();
    }
  });
});

describe('benchmarking and peer group resolution', () => {
  async function seedBenchmarkFixture(
    repository: SQLiteBenchmarkingRepository,
    context: SubjectScopeContext,
  ): Promise<void> {
    const fineDining = await repository.createPeerGroup({
      name: 'fine_dining_kitchens',
      peer_group_type: 'operation_profile',
      description: 'Fine dining kitchens',
      active: true,
    });
    await repository.createPeerGroupMembership({
      peer_group_id: fineDining.id,
      subject_type: 'location',
      subject_id: context.location_id!,
      active: true,
    });

    const benchmark = await repository.createBenchmarkDefinition({
      benchmark_key: 'variance.weekly.expected_range',
      display_name: 'Weekly variance expected range',
      description: null,
      active: true,
    });
    await repository.createBenchmarkScope({
      benchmark_definition_id: benchmark.id,
      scope_type: 'global',
      scope_ref_id: null,
      scope_ref_key: null,
      active: true,
    });
    await repository.createBenchmarkScope({
      benchmark_definition_id: benchmark.id,
      scope_type: 'peer_group',
      scope_ref_id: fineDining.id,
      scope_ref_key: null,
      active: true,
    });
  }

  it('resolves peer-group memberships for a subject scope', async () => {
    const db = createDb();
    const repository = new SQLiteBenchmarkingRepository(db);
    try {
      await seedBenchmarkFixture(repository, { organization_id: 1, location_id: 10 });

      const result = await resolvePeerGroups({ organization_id: 1, location_id: 10 }, repository);

      expect(result.peer_groups).toHaveLength(1);
      expect(result.peer_groups[0].name).toBe('fine_dining_kitchens');
    } finally {
      db.close();
    }
  });

  it('looks up applicable benchmark scopes using peer-group context', async () => {
    const db = createDb();
    const repository = new SQLiteBenchmarkingRepository(db);
    try {
      await seedBenchmarkFixture(repository, { organization_id: 1, location_id: 10 });

      const result = await lookupApplicableBenchmarks({
        benchmark_key: 'variance.weekly.expected_range',
        subject_scope: { organization_id: 1, location_id: 10 },
      }, repository);

      expect(result.matches).toHaveLength(2);
      expect(result.matches[0].scope.scope_type).toBe('peer_group');
      expect(result.matches[1].scope.scope_type).toBe('global');
    } finally {
      db.close();
    }
  });
});
