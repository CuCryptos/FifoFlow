import type { SubjectScopeContext } from '../policy/types.js';
import type {
  BenchmarkLookupRequest,
  BenchmarkLookupResult,
  BenchmarkRecord,
  BenchmarkingRepository,
  PeerGroupResolutionResult,
} from './types.js';

const BENCHMARK_SCOPE_PRECEDENCE = [
  'operation_unit',
  'storage_area',
  'inventory_category',
  'recipe_group',
  'peer_group',
  'location',
  'organization',
  'global',
] as const;

export async function resolvePeerGroups(
  context: SubjectScopeContext,
  repository: BenchmarkingRepository,
): Promise<PeerGroupResolutionResult> {
  const activePeerGroups = await repository.listPeerGroups();
  const memberships = await Promise.all([
    context.organization_id != null ? repository.listPeerGroupMemberships('organization', context.organization_id) : Promise.resolve([]),
    context.location_id != null ? repository.listPeerGroupMemberships('location', context.location_id) : Promise.resolve([]),
    context.operation_unit_id != null ? repository.listPeerGroupMemberships('operation_unit', context.operation_unit_id) : Promise.resolve([]),
    context.storage_area_id != null ? repository.listPeerGroupMemberships('storage_area', context.storage_area_id) : Promise.resolve([]),
  ]);

  const explicitIds = new Set((context.peer_group_ids ?? []).map((id) => Number(id)));
  const membershipIds = new Set(memberships.flat().map((membership) => Number(membership.peer_group_id)));
  const resolvedIds = new Set([...explicitIds, ...membershipIds]);
  const peerGroups = activePeerGroups.filter((group) => resolvedIds.has(Number(group.id)));

  return {
    peer_groups: peerGroups,
    explanation_text: peerGroups.length > 0
      ? `Resolved ${peerGroups.length} peer group(s) from explicit scope and subject memberships.`
      : 'No active peer groups matched the supplied subject scope.',
  };
}

export async function lookupApplicableBenchmarks(
  request: BenchmarkLookupRequest,
  repository: BenchmarkingRepository,
): Promise<BenchmarkLookupResult> {
  const peerGroupResolution = await resolvePeerGroups(request.subject_scope, repository);
  const allRecords = await repository.listBenchmarkRecords(request.benchmark_key);
  const context: SubjectScopeContext = {
    ...request.subject_scope,
    peer_group_ids: peerGroupResolution.peer_groups.map((group) => Number(group.id)),
  };

  const matches = allRecords
    .filter((record) => benchmarkScopeMatches(record, context))
    .sort(compareBenchmarkRecords);

  return {
    matches,
    explanation_text: matches.length > 0
      ? `Resolved ${matches.length} applicable benchmark scope record(s).`
      : 'No active benchmark scopes matched the supplied subject scope.',
  };
}

function benchmarkScopeMatches(record: BenchmarkRecord, context: SubjectScopeContext): boolean {
  switch (record.scope.scope_type) {
    case 'global':
      return true;
    case 'organization':
      return String(record.scope.scope_ref_id) === String(context.organization_id ?? '');
    case 'location':
      return String(record.scope.scope_ref_id) === String(context.location_id ?? '');
    case 'operation_unit':
      return String(record.scope.scope_ref_id) === String(context.operation_unit_id ?? '');
    case 'storage_area':
      return String(record.scope.scope_ref_id) === String(context.storage_area_id ?? '');
    case 'inventory_category':
      return String(record.scope.scope_ref_id) === String(context.inventory_category_id ?? '');
    case 'recipe_group':
      return String(record.scope.scope_ref_id) === String(context.recipe_group_id ?? '');
    case 'peer_group':
      return context.peer_group_ids?.some((id) => String(id) === String(record.scope.scope_ref_id)) ?? false;
    default:
      return false;
  }
}

function compareBenchmarkRecords(left: BenchmarkRecord, right: BenchmarkRecord): number {
  const leftRank = BENCHMARK_SCOPE_PRECEDENCE.indexOf(left.scope.scope_type as (typeof BENCHMARK_SCOPE_PRECEDENCE)[number]);
  const rightRank = BENCHMARK_SCOPE_PRECEDENCE.indexOf(right.scope.scope_type as (typeof BENCHMARK_SCOPE_PRECEDENCE)[number]);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return Number(left.scope.id) - Number(right.scope.id);
}
