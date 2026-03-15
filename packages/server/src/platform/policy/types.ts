export type PolicyScopeType =
  | 'global'
  | 'organization'
  | 'location'
  | 'operation_unit'
  | 'storage_area'
  | 'inventory_category'
  | 'recipe_group'
  | 'peer_group'
  | 'subject_entity';

export interface SubjectScopeContext {
  organization_id?: number | null;
  location_id?: number | null;
  operation_unit_id?: number | null;
  storage_area_id?: number | null;
  inventory_category_id?: number | null;
  inventory_category_key?: string | null;
  recipe_group_id?: number | null;
  recipe_group_key?: string | null;
  peer_group_ids?: number[];
  subject_entity_type?: string | null;
  subject_entity_id?: number | null;
}

export interface PolicyDefinition {
  id: number | string;
  policy_key: string;
  display_name: string;
  description: string | null;
  value_type: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PolicyVersion {
  id: number | string;
  policy_definition_id: number | string;
  version_number: number;
  effective_start_at: string;
  effective_end_at: string | null;
  active: boolean;
  created_at?: string;
}

export interface PolicyScope {
  id: number | string;
  policy_version_id: number | string;
  scope_type: PolicyScopeType;
  scope_ref_id: number | string | null;
  scope_ref_key: string | null;
  active: boolean;
  created_at?: string;
}

export interface PolicyValue {
  id: number | string;
  policy_scope_id: number | string;
  value_json: string;
  created_at?: string;
  updated_at?: string;
}

export interface ResolvedPolicyRecord {
  definition: PolicyDefinition;
  version: PolicyVersion;
  scope: PolicyScope;
  value: PolicyValue;
}

export interface PolicyResolutionRequest {
  policy_key: string;
  subject_scope: SubjectScopeContext;
  effective_at: string;
}

export interface PolicyResolutionPathStep {
  scope_type: PolicyScopeType | null;
  scope_ref_id: number | string | null;
  scope_ref_key: string | null;
  matched: boolean;
  detail: string;
}

export interface PolicyResolutionResult {
  found: boolean;
  policy_key: string;
  effective_at: string;
  resolved_value: unknown | null;
  matched_scope: {
    scope_type: PolicyScopeType | null;
    scope_ref_id: number | string | null;
    scope_ref_key: string | null;
  };
  policy_version_id: number | string | null;
  resolution_path: PolicyResolutionPathStep[];
  explanation_text: string;
}

export interface PolicyResolutionLog {
  id: number | string;
  policy_key: string;
  effective_at: string;
  subject_scope_json: string;
  matched_scope_type: PolicyScopeType | null;
  matched_scope_ref_id: number | string | null;
  matched_scope_ref_key: string | null;
  policy_version_id: number | string | null;
  explanation_text: string;
  created_at?: string;
}

export interface PolicyRepository {
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
  createPolicyDefinition(input: Omit<PolicyDefinition, 'id' | 'created_at' | 'updated_at'>): Promise<PolicyDefinition>;
  createPolicyVersion(input: Omit<PolicyVersion, 'id' | 'created_at'>): Promise<PolicyVersion>;
  createPolicyScope(input: Omit<PolicyScope, 'id' | 'created_at'>): Promise<PolicyScope>;
  createPolicyValue(input: Omit<PolicyValue, 'id' | 'created_at' | 'updated_at'>): Promise<PolicyValue>;
  listPolicyRecords(policyKey: string, effectiveAt: string): Promise<ResolvedPolicyRecord[]>;
  createResolutionLog(input: Omit<PolicyResolutionLog, 'id' | 'created_at'>): Promise<PolicyResolutionLog>;
}
