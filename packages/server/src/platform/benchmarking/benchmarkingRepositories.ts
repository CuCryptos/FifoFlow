import Database from 'better-sqlite3';
import { initializeBenchmarkingDb } from './persistence/sqliteSchema.js';
import type {
  BenchmarkDefinition,
  BenchmarkRecord,
  BenchmarkScope,
  BenchmarkingRepository,
  PeerGroup,
  PeerGroupMembership,
} from './types.js';

export class SQLiteBenchmarkingRepository implements BenchmarkingRepository {
  constructor(private readonly db: Database.Database) {
    initializeBenchmarkingDb(db);
  }

  async withTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const result = await work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async createPeerGroup(input: Omit<PeerGroup, 'id' | 'created_at' | 'updated_at'>): Promise<PeerGroup> {
    const result = this.db.prepare(
      'INSERT INTO peer_groups (name, peer_group_type, description, active) VALUES (?, ?, ?, ?)',
    ).run(input.name, input.peer_group_type, input.description ?? null, input.active ? 1 : 0);
    return this.getPeerGroupById(Number(result.lastInsertRowid));
  }

  async createPeerGroupMembership(input: Omit<PeerGroupMembership, 'id' | 'created_at' | 'updated_at'>): Promise<PeerGroupMembership> {
    const result = this.db.prepare(
      `
        INSERT INTO peer_group_memberships (
          peer_group_id,
          subject_type,
          subject_id,
          active
        ) VALUES (?, ?, ?, ?)
      `,
    ).run(input.peer_group_id, input.subject_type, input.subject_id, input.active ? 1 : 0);
    return this.getPeerGroupMembershipById(Number(result.lastInsertRowid));
  }

  async createBenchmarkDefinition(input: Omit<BenchmarkDefinition, 'id' | 'created_at' | 'updated_at'>): Promise<BenchmarkDefinition> {
    const result = this.db.prepare(
      `
        INSERT INTO benchmark_definitions (
          benchmark_key,
          display_name,
          description,
          active
        ) VALUES (?, ?, ?, ?)
      `,
    ).run(input.benchmark_key, input.display_name, input.description ?? null, input.active ? 1 : 0);
    return this.getBenchmarkDefinitionById(Number(result.lastInsertRowid));
  }

  async createBenchmarkScope(input: Omit<BenchmarkScope, 'id' | 'created_at' | 'updated_at'>): Promise<BenchmarkScope> {
    const result = this.db.prepare(
      `
        INSERT INTO benchmark_scopes (
          benchmark_definition_id,
          scope_type,
          scope_ref_id,
          scope_ref_key,
          active
        ) VALUES (?, ?, ?, ?, ?)
      `,
    ).run(
      input.benchmark_definition_id,
      input.scope_type,
      input.scope_ref_id ?? null,
      input.scope_ref_key ?? null,
      input.active ? 1 : 0,
    );
    return this.getBenchmarkScopeById(Number(result.lastInsertRowid));
  }

  async listPeerGroups(): Promise<PeerGroup[]> {
    const rows = this.db.prepare('SELECT * FROM peer_groups WHERE active = 1 ORDER BY id ASC').all() as PeerGroupRow[];
    return rows.map(mapPeerGroupRow);
  }

  async listPeerGroupMemberships(subjectType: PeerGroupMembership['subject_type'], subjectId: number | string): Promise<PeerGroupMembership[]> {
    const rows = this.db.prepare(
      `
        SELECT *
        FROM peer_group_memberships
        WHERE subject_type = ?
          AND subject_id = ?
          AND active = 1
        ORDER BY id ASC
      `,
    ).all(subjectType, subjectId) as PeerGroupMembershipRow[];
    return rows.map(mapPeerGroupMembershipRow);
  }

  async listBenchmarkRecords(benchmarkKey?: string): Promise<BenchmarkRecord[]> {
    const rows = (benchmarkKey
      ? this.db.prepare(
          `
            SELECT
              bd.id AS definition_id,
              bd.benchmark_key,
              bd.display_name,
              bd.description,
              bd.active AS definition_active,
              bd.created_at AS definition_created_at,
              bd.updated_at AS definition_updated_at,
              bs.id AS scope_id,
              bs.benchmark_definition_id,
              bs.scope_type,
              bs.scope_ref_id,
              bs.scope_ref_key,
              bs.active AS scope_active,
              bs.created_at AS scope_created_at,
              bs.updated_at AS scope_updated_at
            FROM benchmark_definitions bd
            INNER JOIN benchmark_scopes bs ON bs.benchmark_definition_id = bd.id
            WHERE bd.active = 1
              AND bs.active = 1
              AND bd.benchmark_key = ?
            ORDER BY bd.id ASC, bs.id ASC
          `,
        ).all(benchmarkKey)
      : this.db.prepare(
          `
            SELECT
              bd.id AS definition_id,
              bd.benchmark_key,
              bd.display_name,
              bd.description,
              bd.active AS definition_active,
              bd.created_at AS definition_created_at,
              bd.updated_at AS definition_updated_at,
              bs.id AS scope_id,
              bs.benchmark_definition_id,
              bs.scope_type,
              bs.scope_ref_id,
              bs.scope_ref_key,
              bs.active AS scope_active,
              bs.created_at AS scope_created_at,
              bs.updated_at AS scope_updated_at
            FROM benchmark_definitions bd
            INNER JOIN benchmark_scopes bs ON bs.benchmark_definition_id = bd.id
            WHERE bd.active = 1
              AND bs.active = 1
            ORDER BY bd.id ASC, bs.id ASC
          `,
        ).all()) as BenchmarkRecordRow[];

    return rows.map(mapBenchmarkRecordRow);
  }

  private getPeerGroupById(id: number): PeerGroup {
    const row = this.db.prepare('SELECT * FROM peer_groups WHERE id = ? LIMIT 1').get(id) as PeerGroupRow | undefined;
    if (!row) {
      throw new Error(`Peer group ${id} not found.`);
    }
    return mapPeerGroupRow(row);
  }

  private getPeerGroupMembershipById(id: number): PeerGroupMembership {
    const row = this.db.prepare('SELECT * FROM peer_group_memberships WHERE id = ? LIMIT 1').get(id) as PeerGroupMembershipRow | undefined;
    if (!row) {
      throw new Error(`Peer group membership ${id} not found.`);
    }
    return mapPeerGroupMembershipRow(row);
  }

  private getBenchmarkDefinitionById(id: number): BenchmarkDefinition {
    const row = this.db.prepare('SELECT * FROM benchmark_definitions WHERE id = ? LIMIT 1').get(id) as BenchmarkDefinitionRow | undefined;
    if (!row) {
      throw new Error(`Benchmark definition ${id} not found.`);
    }
    return mapBenchmarkDefinitionRow(row);
  }

  private getBenchmarkScopeById(id: number): BenchmarkScope {
    const row = this.db.prepare('SELECT * FROM benchmark_scopes WHERE id = ? LIMIT 1').get(id) as BenchmarkScopeRow | undefined;
    if (!row) {
      throw new Error(`Benchmark scope ${id} not found.`);
    }
    return mapBenchmarkScopeRow(row);
  }
}

type PeerGroupRow = {
  id: number;
  name: string;
  peer_group_type: string;
  description: string | null;
  active: number;
  created_at: string;
  updated_at: string;
};

type PeerGroupMembershipRow = {
  id: number;
  peer_group_id: number;
  subject_type: PeerGroupMembership['subject_type'];
  subject_id: number;
  active: number;
  created_at: string;
  updated_at: string;
};

type BenchmarkDefinitionRow = {
  id: number;
  benchmark_key: string;
  display_name: string;
  description: string | null;
  active: number;
  created_at: string;
  updated_at: string;
};

type BenchmarkScopeRow = {
  id: number;
  benchmark_definition_id: number;
  scope_type: BenchmarkScope['scope_type'];
  scope_ref_id: number | null;
  scope_ref_key: string | null;
  active: number;
  created_at: string;
  updated_at: string;
};

type BenchmarkRecordRow = {
  definition_id: number;
  benchmark_key: string;
  display_name: string;
  description: string | null;
  definition_active: number;
  definition_created_at: string;
  definition_updated_at: string;
  scope_id: number;
  benchmark_definition_id: number;
  scope_type: BenchmarkScope['scope_type'];
  scope_ref_id: number | null;
  scope_ref_key: string | null;
  scope_active: number;
  scope_created_at: string;
  scope_updated_at: string;
};

function mapPeerGroupRow(row: PeerGroupRow): PeerGroup {
  return {
    id: row.id,
    name: row.name,
    peer_group_type: row.peer_group_type,
    description: row.description,
    active: row.active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapPeerGroupMembershipRow(row: PeerGroupMembershipRow): PeerGroupMembership {
  return {
    id: row.id,
    peer_group_id: row.peer_group_id,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    active: row.active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapBenchmarkDefinitionRow(row: BenchmarkDefinitionRow): BenchmarkDefinition {
  return {
    id: row.id,
    benchmark_key: row.benchmark_key,
    display_name: row.display_name,
    description: row.description,
    active: row.active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapBenchmarkScopeRow(row: BenchmarkScopeRow): BenchmarkScope {
  return {
    id: row.id,
    benchmark_definition_id: row.benchmark_definition_id,
    scope_type: row.scope_type,
    scope_ref_id: row.scope_ref_id,
    scope_ref_key: row.scope_ref_key,
    active: row.active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapBenchmarkRecordRow(row: BenchmarkRecordRow): BenchmarkRecord {
  return {
    definition: {
      id: row.definition_id,
      benchmark_key: row.benchmark_key,
      display_name: row.display_name,
      description: row.description,
      active: row.definition_active === 1,
      created_at: row.definition_created_at,
      updated_at: row.definition_updated_at,
    },
    scope: {
      id: row.scope_id,
      benchmark_definition_id: row.benchmark_definition_id,
      scope_type: row.scope_type,
      scope_ref_id: row.scope_ref_id,
      scope_ref_key: row.scope_ref_key,
      active: row.scope_active === 1,
      created_at: row.scope_created_at,
      updated_at: row.scope_updated_at,
    },
  };
}
