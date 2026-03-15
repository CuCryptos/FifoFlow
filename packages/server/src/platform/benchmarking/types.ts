import type { PolicyScopeType, SubjectScopeContext } from '../policy/types.js';

export interface PeerGroup {
  id: number | string;
  name: string;
  peer_group_type: string;
  description: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PeerGroupMembership {
  id: number | string;
  peer_group_id: number | string;
  subject_type: 'organization' | 'location' | 'operation_unit' | 'storage_area';
  subject_id: number | string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BenchmarkDefinition {
  id: number | string;
  benchmark_key: string;
  display_name: string;
  description: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BenchmarkScope {
  id: number | string;
  benchmark_definition_id: number | string;
  scope_type: Exclude<PolicyScopeType, 'subject_entity'>;
  scope_ref_id: number | string | null;
  scope_ref_key: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BenchmarkRecord {
  definition: BenchmarkDefinition;
  scope: BenchmarkScope;
}

export interface PeerGroupResolutionResult {
  peer_groups: PeerGroup[];
  explanation_text: string;
}

export interface BenchmarkLookupRequest {
  subject_scope: SubjectScopeContext;
  benchmark_key?: string;
}

export interface BenchmarkLookupResult {
  matches: BenchmarkRecord[];
  explanation_text: string;
}

export interface BenchmarkingRepository {
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
  createPeerGroup(input: Omit<PeerGroup, 'id' | 'created_at' | 'updated_at'>): Promise<PeerGroup>;
  createPeerGroupMembership(input: Omit<PeerGroupMembership, 'id' | 'created_at' | 'updated_at'>): Promise<PeerGroupMembership>;
  createBenchmarkDefinition(input: Omit<BenchmarkDefinition, 'id' | 'created_at' | 'updated_at'>): Promise<BenchmarkDefinition>;
  createBenchmarkScope(input: Omit<BenchmarkScope, 'id' | 'created_at' | 'updated_at'>): Promise<BenchmarkScope>;
  listPeerGroups(): Promise<PeerGroup[]>;
  listPeerGroupMemberships(subjectType: PeerGroupMembership['subject_type'], subjectId: number | string): Promise<PeerGroupMembership[]>;
  listBenchmarkRecords(benchmarkKey?: string): Promise<BenchmarkRecord[]>;
}
