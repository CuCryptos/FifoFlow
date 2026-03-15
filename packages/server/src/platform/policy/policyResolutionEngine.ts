import type {
  PolicyResolutionPathStep,
  PolicyResolutionRequest,
  PolicyResolutionResult,
  PolicyRepository,
  PolicyScopeType,
  ResolvedPolicyRecord,
  SubjectScopeContext,
} from './types.js';

const SCOPE_PRECEDENCE: PolicyScopeType[] = [
  'subject_entity',
  'operation_unit',
  'storage_area',
  'inventory_category',
  'recipe_group',
  'peer_group',
  'location',
  'organization',
  'global',
];

export async function resolvePolicy(
  request: PolicyResolutionRequest,
  repository: PolicyRepository,
  options?: { persist_log?: boolean },
): Promise<PolicyResolutionResult> {
  const records = await repository.listPolicyRecords(request.policy_key, request.effective_at);
  const resolutionPath: PolicyResolutionPathStep[] = [];

  for (const scopeType of SCOPE_PRECEDENCE) {
    const matches = records
      .filter((record) => scopeMatches(scopeType, record, request.subject_scope))
      .sort(comparePolicyRecords);

    if (matches.length === 0) {
      resolutionPath.push({
        scope_type: scopeType,
        scope_ref_id: expectedScopeRef(scopeType, request.subject_scope),
        scope_ref_key: expectedScopeKey(scopeType, request.subject_scope),
        matched: false,
        detail: `No active ${scopeType} policy matched ${request.policy_key}.`,
      });
      continue;
    }

    const chosen = matches[0];
    const result: PolicyResolutionResult = {
      found: true,
      policy_key: request.policy_key,
      effective_at: request.effective_at,
      resolved_value: parsePolicyValue(chosen.value.value_json),
      matched_scope: {
        scope_type: chosen.scope.scope_type,
        scope_ref_id: chosen.scope.scope_ref_id,
        scope_ref_key: chosen.scope.scope_ref_key,
      },
      policy_version_id: chosen.version.id,
      resolution_path: [
        ...resolutionPath,
        {
          scope_type: chosen.scope.scope_type,
          scope_ref_id: chosen.scope.scope_ref_id,
          scope_ref_key: chosen.scope.scope_ref_key,
          matched: true,
          detail: buildMatchedScopeDetail(chosen),
        },
      ],
      explanation_text: `Resolved ${request.policy_key} from ${chosen.scope.scope_type} scope using policy version ${chosen.version.version_number}.`,
    };

    if (options?.persist_log) {
      await repository.createResolutionLog({
        policy_key: request.policy_key,
        effective_at: request.effective_at,
        subject_scope_json: JSON.stringify(request.subject_scope),
        matched_scope_type: result.matched_scope.scope_type,
        matched_scope_ref_id: result.matched_scope.scope_ref_id,
        matched_scope_ref_key: result.matched_scope.scope_ref_key,
        policy_version_id: result.policy_version_id,
        explanation_text: result.explanation_text,
      });
    }

    return result;
  }

  const result: PolicyResolutionResult = {
    found: false,
    policy_key: request.policy_key,
    effective_at: request.effective_at,
    resolved_value: null,
    matched_scope: {
      scope_type: null,
      scope_ref_id: null,
      scope_ref_key: null,
    },
    policy_version_id: null,
    resolution_path: resolutionPath,
    explanation_text: `No active policy matched ${request.policy_key} for the supplied subject scope.`,
  };

  if (options?.persist_log) {
    await repository.createResolutionLog({
      policy_key: request.policy_key,
      effective_at: request.effective_at,
      subject_scope_json: JSON.stringify(request.subject_scope),
      matched_scope_type: null,
      matched_scope_ref_id: null,
      matched_scope_ref_key: null,
      policy_version_id: null,
      explanation_text: result.explanation_text,
    });
  }

  return result;
}

function scopeMatches(scopeType: PolicyScopeType, record: ResolvedPolicyRecord, context: SubjectScopeContext): boolean {
  if (record.scope.scope_type !== scopeType) {
    return false;
  }

  switch (scopeType) {
    case 'subject_entity':
      return record.scope.scope_ref_key === context.subject_entity_type
        && String(record.scope.scope_ref_id) === String(context.subject_entity_id ?? '');
    case 'organization':
      return String(record.scope.scope_ref_id) === String(context.organization_id ?? '');
    case 'location':
      return String(record.scope.scope_ref_id) === String(context.location_id ?? '');
    case 'operation_unit':
      return String(record.scope.scope_ref_id) === String(context.operation_unit_id ?? '');
    case 'storage_area':
      return String(record.scope.scope_ref_id) === String(context.storage_area_id ?? '');
    case 'inventory_category':
      if (record.scope.scope_ref_id != null && context.inventory_category_id != null) {
        return String(record.scope.scope_ref_id) === String(context.inventory_category_id);
      }
      if (record.scope.scope_ref_key != null && context.inventory_category_key != null) {
        return record.scope.scope_ref_key === context.inventory_category_key;
      }
      return false;
    case 'recipe_group':
      if (record.scope.scope_ref_id != null && context.recipe_group_id != null) {
        return String(record.scope.scope_ref_id) === String(context.recipe_group_id);
      }
      if (record.scope.scope_ref_key != null && context.recipe_group_key != null) {
        return record.scope.scope_ref_key === context.recipe_group_key;
      }
      return false;
    case 'peer_group':
      return context.peer_group_ids?.some((id) => String(id) === String(record.scope.scope_ref_id)) ?? false;
    case 'global':
      return true;
    default:
      return false;
  }
}

function comparePolicyRecords(left: ResolvedPolicyRecord, right: ResolvedPolicyRecord): number {
  const leftTime = Date.parse(left.version.effective_start_at);
  const rightTime = Date.parse(right.version.effective_start_at);
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  if (left.version.version_number !== right.version.version_number) {
    return right.version.version_number - left.version.version_number;
  }

  return Number(left.scope.id) - Number(right.scope.id);
}

function parsePolicyValue(valueJson: string): unknown {
  try {
    return JSON.parse(valueJson);
  } catch {
    return valueJson;
  }
}

function buildMatchedScopeDetail(record: ResolvedPolicyRecord): string {
  const suffix = record.scope.scope_ref_id != null
    ? ` ref ${record.scope.scope_ref_id}`
    : record.scope.scope_ref_key != null
      ? ` key ${record.scope.scope_ref_key}`
      : '';
  return `Matched ${record.scope.scope_type}${suffix} on policy version ${record.version.version_number}.`;
}

function expectedScopeRef(scopeType: PolicyScopeType, context: SubjectScopeContext): number | string | null {
  switch (scopeType) {
    case 'organization':
      return context.organization_id ?? null;
    case 'location':
      return context.location_id ?? null;
    case 'operation_unit':
      return context.operation_unit_id ?? null;
    case 'storage_area':
      return context.storage_area_id ?? null;
    case 'inventory_category':
      return context.inventory_category_id ?? null;
    case 'recipe_group':
      return context.recipe_group_id ?? null;
    case 'peer_group':
      return context.peer_group_ids?.[0] ?? null;
    case 'subject_entity':
      return context.subject_entity_id ?? null;
    case 'global':
      return null;
    default:
      return null;
  }
}

function expectedScopeKey(scopeType: PolicyScopeType, context: SubjectScopeContext): string | null {
  if (scopeType === 'subject_entity') {
    return context.subject_entity_type ?? null;
  }
  if (scopeType === 'inventory_category') {
    return context.inventory_category_key ?? null;
  }
  if (scopeType === 'recipe_group') {
    return context.recipe_group_key ?? null;
  }
  return null;
}
