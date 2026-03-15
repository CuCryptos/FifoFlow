import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initializeDb } from '../db.js';
import {
  DEFAULT_VARIANCE_THRESHOLD_CONFIG,
  SQLiteIntelligenceRepository,
  SQLiteVarianceReadRepository,
  executeVarianceIntelligence,
  type VarianceIntelligenceDependencies,
} from '../intelligence/index.js';
import type { IntelligenceJobContext } from '../intelligence/types.js';
import { SQLitePolicyRepository, type PolicyScopeType } from '../platform/policy/index.js';

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

function createDb(): {
  db: Database.Database;
  intelligenceRepository: SQLiteIntelligenceRepository;
  source: SQLiteVarianceReadRepository;
  policyRepository: SQLitePolicyRepository;
} {
  const db = new Database(':memory:');
  initializeDb(db);
  db.prepare(
    `
      INSERT INTO items (id, name, category, unit, current_qty)
      VALUES
        (44, 'Sesame Oil', 'Oil', 'fl oz', 0),
        (91, 'Ahi Tuna', 'Seafood', 'lb', 0),
        (105, 'Lemon Juice', 'Bar', 'fl oz', 0)
    `,
  ).run();
  db.prepare(`INSERT INTO vendors (id, name) VALUES (7, 'Sysco')`).run();
  db.prepare(
    `
      INSERT INTO vendor_prices (id, item_id, vendor_id, vendor_item_name, order_unit, order_unit_price, qty_per_unit, is_default, created_at, updated_at)
      VALUES
        (501, 91, 7, 'Ahi Tuna Case', 'lb', 10, 1, 1, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
        (502, 44, 7, 'Sesame Oil Bottle', 'fl oz', 0.8, 1, 1, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
        (503, 105, 7, 'Lemon Juice', 'fl oz', 0.4, 1, 1, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z')
    `,
  ).run();

  return {
    db,
    intelligenceRepository: new SQLiteIntelligenceRepository(db),
    source: new SQLiteVarianceReadRepository(db),
    policyRepository: new SQLitePolicyRepository(db),
  };
}

function insertCountSession(db: Database.Database, input: { id: number; name: string; opened_at: string; closed_at?: string | null }): void {
  db.prepare(
    `INSERT INTO count_sessions (id, name, status, template_category, notes, opened_at, closed_at)
     VALUES (?, ?, 'closed', NULL, NULL, ?, ?)`
  ).run(input.id, input.name, input.opened_at, input.closed_at ?? input.opened_at);
}

function insertCountEntry(
  db: Database.Database,
  input: {
    id: number;
    session_id: number;
    item_id: number;
    previous_qty: number;
    counted_qty: number;
    created_at: string;
    notes?: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO count_entries (id, session_id, item_id, previous_qty, counted_qty, delta, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.session_id,
    input.item_id,
    input.previous_qty,
    input.counted_qty,
    input.counted_qty - input.previous_qty,
    input.notes ?? null,
    input.created_at,
  );
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
  },
): Promise<void> {
  const definition = await repository.createPolicyDefinition({
    policy_key: input.policy_key,
    display_name: input.policy_key,
    description: null,
    value_type: 'number',
    active: true,
  });
  const version = await repository.createPolicyVersion({
    policy_definition_id: definition.id,
    version_number: input.version_number,
    effective_start_at: '2026-01-01T00:00:00.000Z',
    effective_end_at: null,
    active: true,
  });
  const scope = await repository.createPolicyScope({
    policy_version_id: version.id,
    scope_type: input.scope_type,
    scope_ref_id: input.scope_ref_id ?? null,
    scope_ref_key: input.scope_ref_key ?? null,
    active: true,
  });
  await repository.createPolicyValue({
    policy_scope_id: scope.id,
    value_json: JSON.stringify(input.value),
  });
}

async function runVariance(
  dbParts: ReturnType<typeof createDb>,
  context: IntelligenceJobContext = createContext(),
  overrides?: Partial<VarianceIntelligenceDependencies>,
) {
  return executeVarianceIntelligence(context, {
    source: dbParts.source,
    repository: dbParts.intelligenceRepository,
    policyRepository: dbParts.policyRepository,
    thresholdConfig: DEFAULT_VARIANCE_THRESHOLD_CONFIG,
    ...overrides,
  });
}

describe('variance intelligence', () => {
  it('emits qty-based COUNT_VARIANCE above threshold', async () => {
    const parts = createDb();
    try {
      insertCountSession(parts.db, { id: 1, name: 'Freezer Count', opened_at: '2026-04-10T09:00:00.000Z' });
      insertCountEntry(parts.db, {
        id: 1001,
        session_id: 1,
        item_id: 91,
        previous_qty: 10,
        counted_qty: 8,
        created_at: '2026-04-10T09:15:00.000Z',
      });

      const result = await runVariance(parts);
      const signal = result.signals?.find((entry) => entry.signal_type === 'COUNT_VARIANCE');

      expect(signal).toBeDefined();
      expect(signal?.signal_payload['variance_qty_abs']).toBe(2);
      expect(result.variance_summary.count_variance_signals_emitted).toBe(1);
    } finally {
      parts.db.close();
    }
  });

  it('does not emit a variance signal below threshold', async () => {
    const parts = createDb();
    try {
      insertCountSession(parts.db, { id: 1, name: 'Bar Count', opened_at: '2026-04-10T09:00:00.000Z' });
      insertCountEntry(parts.db, {
        id: 1001,
        session_id: 1,
        item_id: 105,
        previous_qty: 10,
        counted_qty: 9.5,
        created_at: '2026-04-10T09:15:00.000Z',
      });

      const result = await runVariance(parts);

      expect(result.signals).toHaveLength(0);
      expect(result.variance_summary.rows_below_threshold).toBe(1);
    } finally {
      parts.db.close();
    }
  });

  it('uses cost-based severity escalation when expected cost is available', async () => {
    const parts = createDb();
    try {
      insertCountSession(parts.db, { id: 1, name: 'Freezer Count', opened_at: '2026-04-10T09:00:00.000Z' });
      insertCountEntry(parts.db, {
        id: 1001,
        session_id: 1,
        item_id: 91,
        previous_qty: 10,
        counted_qty: 6,
        created_at: '2026-04-10T09:15:00.000Z',
      });
      await seedPolicy(parts.policyRepository, {
        policy_key: 'count_immediate_abs_cost_threshold',
        scope_type: 'global',
        value: 35,
        version_number: 1,
      });

      const result = await runVariance(parts);
      const signal = result.signals?.find((entry) => entry.signal_type === 'COUNT_VARIANCE');

      expect(signal?.severity_label).toBe('critical');
      expect(signal?.signal_payload['variance_cost_abs']).toBe(40);
    } finally {
      parts.db.close();
    }
  });

  it('uses global default policy resolution for variance thresholds', async () => {
    const parts = createDb();
    try {
      insertCountSession(parts.db, { id: 1, name: 'Freezer Count', opened_at: '2026-04-10T09:00:00.000Z' });
      insertCountEntry(parts.db, {
        id: 1001,
        session_id: 1,
        item_id: 91,
        previous_qty: 10,
        counted_qty: 8.9,
        created_at: '2026-04-10T09:15:00.000Z',
      });
      await seedPolicy(parts.policyRepository, {
        policy_key: 'count_variance_abs_qty_threshold',
        scope_type: 'global',
        value: 0.5,
        version_number: 1,
      });

      const result = await runVariance(parts);

      expect(result.signals?.some((entry) => entry.signal_type === 'COUNT_VARIANCE')).toBe(true);
    } finally {
      parts.db.close();
    }
  });

  it('location override beats organization default', async () => {
    const parts = createDb();
    try {
      insertCountSession(parts.db, { id: 1, name: 'Freezer Count', opened_at: '2026-04-10T09:00:00.000Z' });
      insertCountEntry(parts.db, {
        id: 1001,
        session_id: 1,
        item_id: 91,
        previous_qty: 10,
        counted_qty: 9,
        created_at: '2026-04-10T09:15:00.000Z',
      });
      await seedPolicy(parts.policyRepository, {
        policy_key: 'count_variance_abs_qty_threshold',
        scope_type: 'organization',
        scope_ref_id: 1,
        value: 2,
        version_number: 1,
      });
      await seedPolicy(parts.policyRepository, {
        policy_key: 'count_variance_abs_qty_threshold',
        scope_type: 'location',
        scope_ref_id: 2,
        value: 0.5,
        version_number: 2,
      });

      const result = await runVariance(parts);
      const signal = result.signals?.find((entry) => entry.signal_type === 'COUNT_VARIANCE');
      const explainability = signal?.signal_payload['threshold_explainability'] as {
        resolved_thresholds: Array<{ threshold_field: string; matched_scope_type: string | null; value: number }>;
      };

      expect(signal).toBeDefined();
      expect(explainability.resolved_thresholds.find((entry) => entry.threshold_field === 'count_variance_abs_qty_threshold'))
        .toMatchObject({ matched_scope_type: 'location', value: 0.5 });
    } finally {
      parts.db.close();
    }
  });

  it('operation unit override beats broader scope when applicable', async () => {
    const parts = createDb();
    try {
      insertCountSession(parts.db, { id: 1, name: 'Freezer Count', opened_at: '2026-04-10T09:00:00.000Z' });
      insertCountEntry(parts.db, {
        id: 1001,
        session_id: 1,
        item_id: 91,
        previous_qty: 10,
        counted_qty: 9,
        created_at: '2026-04-10T09:15:00.000Z',
      });
      await seedPolicy(parts.policyRepository, {
        policy_key: 'count_variance_abs_qty_threshold',
        scope_type: 'location',
        scope_ref_id: 2,
        value: 2,
        version_number: 1,
      });
      await seedPolicy(parts.policyRepository, {
        policy_key: 'count_variance_abs_qty_threshold',
        scope_type: 'operation_unit',
        scope_ref_id: 3,
        value: 0.5,
        version_number: 2,
      });

      const result = await runVariance(parts);
      const signal = result.signals?.find((entry) => entry.signal_type === 'COUNT_VARIANCE');
      const explainability = signal?.signal_payload['threshold_explainability'] as {
        resolved_thresholds: Array<{ threshold_field: string; matched_scope_type: string | null }>;
      };

      expect(signal).toBeDefined();
      expect(explainability.resolved_thresholds.find((entry) => entry.threshold_field === 'count_variance_abs_qty_threshold'))
        .toMatchObject({ matched_scope_type: 'operation_unit' });
    } finally {
      parts.db.close();
    }
  });

  it('emits COUNT_INCONSISTENCY when recurrence threshold is exceeded', async () => {
    const parts = createDb();
    try {
      insertCountSession(parts.db, { id: 1, name: 'Count 1', opened_at: '2026-04-02T09:00:00.000Z' });
      insertCountSession(parts.db, { id: 2, name: 'Count 2', opened_at: '2026-04-09T09:00:00.000Z' });
      insertCountSession(parts.db, { id: 3, name: 'Count 3', opened_at: '2026-04-16T09:00:00.000Z' });
      insertCountEntry(parts.db, { id: 1001, session_id: 1, item_id: 91, previous_qty: 10, counted_qty: 8, created_at: '2026-04-02T09:15:00.000Z' });
      insertCountEntry(parts.db, { id: 1002, session_id: 2, item_id: 91, previous_qty: 10, counted_qty: 8, created_at: '2026-04-09T09:15:00.000Z' });
      insertCountEntry(parts.db, { id: 1003, session_id: 3, item_id: 91, previous_qty: 10, counted_qty: 8, created_at: '2026-04-16T09:15:00.000Z' });

      const result = await runVariance(parts, createContext({ now: '2026-04-16T10:00:00.000Z' }));
      const inconsistency = result.signals?.find((entry) => entry.signal_type === 'COUNT_INCONSISTENCY');

      expect(inconsistency).toBeDefined();
      expect(inconsistency?.signal_payload['recurrence_count']).toBe(3);
      expect(result.variance_summary.count_inconsistency_signals_emitted).toBe(1);
    } finally {
      parts.db.close();
    }
  });

  it('does not emit COUNT_INCONSISTENCY without enough history', async () => {
    const parts = createDb();
    try {
      insertCountSession(parts.db, { id: 1, name: 'Count 1', opened_at: '2026-04-02T09:00:00.000Z' });
      insertCountSession(parts.db, { id: 2, name: 'Count 2', opened_at: '2026-04-09T09:00:00.000Z' });
      insertCountEntry(parts.db, { id: 1001, session_id: 1, item_id: 91, previous_qty: 10, counted_qty: 8, created_at: '2026-04-02T09:15:00.000Z' });
      insertCountEntry(parts.db, { id: 1002, session_id: 2, item_id: 91, previous_qty: 10, counted_qty: 8, created_at: '2026-04-09T09:15:00.000Z' });

      const result = await runVariance(parts);

      expect(result.signals?.some((entry) => entry.signal_type === 'COUNT_INCONSISTENCY')).toBe(false);
      expect(result.variance_summary.count_inconsistency_signals_emitted).toBe(0);
    } finally {
      parts.db.close();
    }
  });

  it('falls back explicitly to defaults when no policy rows exist', async () => {
    const parts = createDb();
    try {
      insertCountSession(parts.db, { id: 1, name: 'Freezer Count', opened_at: '2026-04-10T09:00:00.000Z' });
      insertCountEntry(parts.db, { id: 1001, session_id: 1, item_id: 91, previous_qty: 10, counted_qty: 8, created_at: '2026-04-10T09:15:00.000Z' });

      const result = await executeVarianceIntelligence(createContext(), {
        source: parts.source,
        repository: parts.intelligenceRepository,
        thresholdConfig: DEFAULT_VARIANCE_THRESHOLD_CONFIG,
      });
      const signal = result.signals?.find((entry) => entry.signal_type === 'COUNT_VARIANCE');
      const explainability = signal?.signal_payload['threshold_explainability'] as { fallback_used: boolean };

      expect(explainability.fallback_used).toBe(true);
      expect(result.notes.some((note) => note.includes('fallback defaults'))).toBe(true);
    } finally {
      parts.db.close();
    }
  });

  it('returns threshold explanation metadata', async () => {
    const parts = createDb();
    try {
      insertCountSession(parts.db, { id: 1, name: 'Freezer Count', opened_at: '2026-04-10T09:00:00.000Z' });
      insertCountEntry(parts.db, { id: 1001, session_id: 1, item_id: 91, previous_qty: 10, counted_qty: 8, created_at: '2026-04-10T09:15:00.000Z' });
      await seedPolicy(parts.policyRepository, {
        policy_key: 'count_variance_pct_threshold',
        scope_type: 'global',
        value: 0.08,
        version_number: 1,
      });

      const result = await runVariance(parts);
      const signal = result.signals?.find((entry) => entry.signal_type === 'COUNT_VARIANCE');
      const explainability = signal?.signal_payload['threshold_explainability'] as {
        fallback_used: boolean;
        resolved_thresholds: Array<{ threshold_field: string; source: string }>;
      };

      expect(explainability.resolved_thresholds.find((entry) => entry.threshold_field === 'count_variance_pct_threshold'))
        .toMatchObject({ source: 'policy' });
    } finally {
      parts.db.close();
    }
  });

  it('remains idempotent on rerun', async () => {
    const parts = createDb();
    try {
      insertCountSession(parts.db, { id: 1, name: 'Count 1', opened_at: '2026-04-02T09:00:00.000Z' });
      insertCountSession(parts.db, { id: 2, name: 'Count 2', opened_at: '2026-04-09T09:00:00.000Z' });
      insertCountSession(parts.db, { id: 3, name: 'Count 3', opened_at: '2026-04-16T09:00:00.000Z' });
      insertCountEntry(parts.db, { id: 1001, session_id: 1, item_id: 91, previous_qty: 10, counted_qty: 8, created_at: '2026-04-02T09:15:00.000Z' });
      insertCountEntry(parts.db, { id: 1002, session_id: 2, item_id: 91, previous_qty: 10, counted_qty: 8, created_at: '2026-04-09T09:15:00.000Z' });
      insertCountEntry(parts.db, { id: 1003, session_id: 3, item_id: 91, previous_qty: 10, counted_qty: 8, created_at: '2026-04-16T09:15:00.000Z' });
      await seedPolicy(parts.policyRepository, {
        policy_key: 'count_variance_pct_threshold',
        scope_type: 'global',
        value: 0.08,
        version_number: 1,
      });

      const first = await runVariance(parts, createContext({ now: '2026-04-16T10:00:00.000Z' }));
      const second = await runVariance(parts, createContext({ now: '2026-04-16T10:00:00.000Z' }));

      expect(first.run_summary).toMatchObject({ signals_created: 4, signals_updated: 0 });
      expect(second.run_summary).toMatchObject({ signals_created: 0, signals_updated: 4 });
    } finally {
      parts.db.close();
    }
  });
});
