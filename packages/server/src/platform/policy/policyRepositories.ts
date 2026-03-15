import Database from 'better-sqlite3';
import { initializeScopedPolicyDb } from './persistence/sqliteSchema.js';
import type {
  PolicyDefinition,
  PolicyRepository,
  PolicyResolutionLog,
  PolicyScope,
  PolicyValue,
  PolicyVersion,
  ResolvedPolicyRecord,
} from './types.js';

export class SQLitePolicyRepository implements PolicyRepository {
  constructor(private readonly db: Database.Database) {
    initializeScopedPolicyDb(db);
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

  async createPolicyDefinition(input: Omit<PolicyDefinition, 'id' | 'created_at' | 'updated_at'>): Promise<PolicyDefinition> {
    const existing = this.db.prepare(
      'SELECT * FROM policy_definitions WHERE policy_key = ? LIMIT 1',
    ).get(input.policy_key) as PolicyDefinitionRow | undefined;
    if (existing) {
      return mapPolicyDefinitionRow(existing);
    }

    const result = this.db.prepare(
      `
        INSERT INTO policy_definitions (
          policy_key,
          display_name,
          description,
          value_type,
          active
        ) VALUES (?, ?, ?, ?, ?)
      `,
    ).run(input.policy_key, input.display_name, input.description ?? null, input.value_type, input.active ? 1 : 0);
    return this.getPolicyDefinitionById(Number(result.lastInsertRowid));
  }

  async createPolicyVersion(input: Omit<PolicyVersion, 'id' | 'created_at'>): Promise<PolicyVersion> {
    const result = this.db.prepare(
      `
        INSERT INTO policy_versions (
          policy_definition_id,
          version_number,
          effective_start_at,
          effective_end_at,
          active
        ) VALUES (?, ?, ?, ?, ?)
      `,
    ).run(
      input.policy_definition_id,
      input.version_number,
      input.effective_start_at,
      input.effective_end_at ?? null,
      input.active ? 1 : 0,
    );
    return this.getPolicyVersionById(Number(result.lastInsertRowid));
  }

  async createPolicyScope(input: Omit<PolicyScope, 'id' | 'created_at'>): Promise<PolicyScope> {
    const result = this.db.prepare(
      `
        INSERT INTO policy_scopes (
          policy_version_id,
          scope_type,
          scope_ref_id,
          scope_ref_key,
          active
        ) VALUES (?, ?, ?, ?, ?)
      `,
    ).run(
      input.policy_version_id,
      input.scope_type,
      input.scope_ref_id ?? null,
      input.scope_ref_key ?? null,
      input.active ? 1 : 0,
    );
    return this.getPolicyScopeById(Number(result.lastInsertRowid));
  }

  async createPolicyValue(input: Omit<PolicyValue, 'id' | 'created_at' | 'updated_at'>): Promise<PolicyValue> {
    const result = this.db.prepare(
      'INSERT INTO policy_values (policy_scope_id, value_json) VALUES (?, ?)',
    ).run(input.policy_scope_id, input.value_json);
    return this.getPolicyValueById(Number(result.lastInsertRowid));
  }

  async listPolicyRecords(policyKey: string, effectiveAt: string): Promise<ResolvedPolicyRecord[]> {
    const rows = this.db.prepare(
      `
        SELECT
          pd.id AS definition_id,
          pd.policy_key,
          pd.display_name,
          pd.description,
          pd.value_type,
          pd.active AS definition_active,
          pd.created_at AS definition_created_at,
          pd.updated_at AS definition_updated_at,
          pv.id AS version_id,
          pv.policy_definition_id,
          pv.version_number,
          pv.effective_start_at,
          pv.effective_end_at,
          pv.active AS version_active,
          pv.created_at AS version_created_at,
          ps.id AS scope_id,
          ps.policy_version_id,
          ps.scope_type,
          ps.scope_ref_id,
          ps.scope_ref_key,
          ps.active AS scope_active,
          ps.created_at AS scope_created_at,
          pval.id AS value_id,
          pval.policy_scope_id,
          pval.value_json,
          pval.created_at AS value_created_at,
          pval.updated_at AS value_updated_at
        FROM policy_definitions pd
        INNER JOIN policy_versions pv ON pv.policy_definition_id = pd.id
        INNER JOIN policy_scopes ps ON ps.policy_version_id = pv.id
        INNER JOIN policy_values pval ON pval.policy_scope_id = ps.id
        WHERE pd.policy_key = ?
          AND pd.active = 1
          AND pv.active = 1
          AND ps.active = 1
          AND pv.effective_start_at <= ?
          AND (pv.effective_end_at IS NULL OR pv.effective_end_at > ?)
      `,
    ).all(policyKey, effectiveAt, effectiveAt) as PolicyRecordRow[];

    return rows.map(mapPolicyRecordRow);
  }

  async createResolutionLog(input: Omit<PolicyResolutionLog, 'id' | 'created_at'>): Promise<PolicyResolutionLog> {
    const result = this.db.prepare(
      `
        INSERT INTO policy_resolution_logs (
          policy_key,
          effective_at,
          subject_scope_json,
          matched_scope_type,
          matched_scope_ref_id,
          matched_scope_ref_key,
          policy_version_id,
          explanation_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.policy_key,
      input.effective_at,
      input.subject_scope_json,
      input.matched_scope_type,
      input.matched_scope_ref_id ?? null,
      input.matched_scope_ref_key ?? null,
      input.policy_version_id ?? null,
      input.explanation_text,
    );
    return this.getResolutionLogById(Number(result.lastInsertRowid));
  }

  private getPolicyDefinitionById(id: number): PolicyDefinition {
    const row = this.db.prepare('SELECT * FROM policy_definitions WHERE id = ? LIMIT 1').get(id) as PolicyDefinitionRow | undefined;
    if (!row) {
      throw new Error(`Policy definition ${id} not found.`);
    }
    return mapPolicyDefinitionRow(row);
  }

  private getPolicyVersionById(id: number): PolicyVersion {
    const row = this.db.prepare('SELECT * FROM policy_versions WHERE id = ? LIMIT 1').get(id) as PolicyVersionRow | undefined;
    if (!row) {
      throw new Error(`Policy version ${id} not found.`);
    }
    return mapPolicyVersionRow(row);
  }

  private getPolicyScopeById(id: number): PolicyScope {
    const row = this.db.prepare('SELECT * FROM policy_scopes WHERE id = ? LIMIT 1').get(id) as PolicyScopeRow | undefined;
    if (!row) {
      throw new Error(`Policy scope ${id} not found.`);
    }
    return mapPolicyScopeRow(row);
  }

  private getPolicyValueById(id: number): PolicyValue {
    const row = this.db.prepare('SELECT * FROM policy_values WHERE id = ? LIMIT 1').get(id) as PolicyValueRow | undefined;
    if (!row) {
      throw new Error(`Policy value ${id} not found.`);
    }
    return mapPolicyValueRow(row);
  }

  private getResolutionLogById(id: number): PolicyResolutionLog {
    const row = this.db.prepare('SELECT * FROM policy_resolution_logs WHERE id = ? LIMIT 1').get(id) as PolicyResolutionLogRow | undefined;
    if (!row) {
      throw new Error(`Policy resolution log ${id} not found.`);
    }
    return mapPolicyResolutionLogRow(row);
  }
}

type PolicyDefinitionRow = {
  id: number;
  policy_key: string;
  display_name: string;
  description: string | null;
  value_type: string;
  active: number;
  created_at: string;
  updated_at: string;
};

type PolicyVersionRow = {
  id: number;
  policy_definition_id: number;
  version_number: number;
  effective_start_at: string;
  effective_end_at: string | null;
  active: number;
  created_at: string;
};

type PolicyScopeRow = {
  id: number;
  policy_version_id: number;
  scope_type: PolicyScope['scope_type'];
  scope_ref_id: number | null;
  scope_ref_key: string | null;
  active: number;
  created_at: string;
};

type PolicyValueRow = {
  id: number;
  policy_scope_id: number;
  value_json: string;
  created_at: string;
  updated_at: string;
};

type PolicyResolutionLogRow = {
  id: number;
  policy_key: string;
  effective_at: string;
  subject_scope_json: string;
  matched_scope_type: PolicyScope['scope_type'] | null;
  matched_scope_ref_id: number | null;
  matched_scope_ref_key: string | null;
  policy_version_id: number | null;
  explanation_text: string;
  created_at: string;
};

type PolicyRecordRow = {
  definition_id: number;
  policy_key: string;
  display_name: string;
  description: string | null;
  value_type: string;
  definition_active: number;
  definition_created_at: string;
  definition_updated_at: string;
  version_id: number;
  policy_definition_id: number;
  version_number: number;
  effective_start_at: string;
  effective_end_at: string | null;
  version_active: number;
  version_created_at: string;
  scope_id: number;
  policy_version_id: number;
  scope_type: PolicyScope['scope_type'];
  scope_ref_id: number | null;
  scope_ref_key: string | null;
  scope_active: number;
  scope_created_at: string;
  value_id: number;
  policy_scope_id: number;
  value_json: string;
  value_created_at: string;
  value_updated_at: string;
};

function mapPolicyDefinitionRow(row: PolicyDefinitionRow): PolicyDefinition {
  return {
    id: row.id,
    policy_key: row.policy_key,
    display_name: row.display_name,
    description: row.description,
    value_type: row.value_type,
    active: row.active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapPolicyVersionRow(row: PolicyVersionRow): PolicyVersion {
  return {
    id: row.id,
    policy_definition_id: row.policy_definition_id,
    version_number: row.version_number,
    effective_start_at: row.effective_start_at,
    effective_end_at: row.effective_end_at,
    active: row.active === 1,
    created_at: row.created_at,
  };
}

function mapPolicyScopeRow(row: PolicyScopeRow): PolicyScope {
  return {
    id: row.id,
    policy_version_id: row.policy_version_id,
    scope_type: row.scope_type,
    scope_ref_id: row.scope_ref_id,
    scope_ref_key: row.scope_ref_key,
    active: row.active === 1,
    created_at: row.created_at,
  };
}

function mapPolicyValueRow(row: PolicyValueRow): PolicyValue {
  return {
    id: row.id,
    policy_scope_id: row.policy_scope_id,
    value_json: row.value_json,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapPolicyResolutionLogRow(row: PolicyResolutionLogRow): PolicyResolutionLog {
  return {
    id: row.id,
    policy_key: row.policy_key,
    effective_at: row.effective_at,
    subject_scope_json: row.subject_scope_json,
    matched_scope_type: row.matched_scope_type,
    matched_scope_ref_id: row.matched_scope_ref_id,
    matched_scope_ref_key: row.matched_scope_ref_key,
    policy_version_id: row.policy_version_id,
    explanation_text: row.explanation_text,
    created_at: row.created_at,
  };
}

function mapPolicyRecordRow(row: PolicyRecordRow): ResolvedPolicyRecord {
  return {
    definition: {
      id: row.definition_id,
      policy_key: row.policy_key,
      display_name: row.display_name,
      description: row.description,
      value_type: row.value_type,
      active: row.definition_active === 1,
      created_at: row.definition_created_at,
      updated_at: row.definition_updated_at,
    },
    version: {
      id: row.version_id,
      policy_definition_id: row.policy_definition_id,
      version_number: row.version_number,
      effective_start_at: row.effective_start_at,
      effective_end_at: row.effective_end_at,
      active: row.version_active === 1,
      created_at: row.version_created_at,
    },
    scope: {
      id: row.scope_id,
      policy_version_id: row.policy_version_id,
      scope_type: row.scope_type,
      scope_ref_id: row.scope_ref_id,
      scope_ref_key: row.scope_ref_key,
      active: row.scope_active === 1,
      created_at: row.scope_created_at,
    },
    value: {
      id: row.value_id,
      policy_scope_id: row.policy_scope_id,
      value_json: row.value_json,
      created_at: row.value_created_at,
      updated_at: row.value_updated_at,
    },
  };
}
