import { createHash } from 'node:crypto';
import type { SubjectScopeContext } from '../../platform/policy/types.js';
import type {
  CanonicalIngredientWithAliases,
  CanonicalInventoryMapping,
  CanonicalInventoryMappingCandidate,
  CanonicalInventoryMappingJobRequest,
  CanonicalInventoryMappingJobResult,
  CanonicalInventoryMappingReviewEvent,
  CanonicalInventoryMatchReason,
  CanonicalInventoryReadRepository,
  CanonicalInventoryRepository,
  CanonicalInventoryResolutionResult,
  InventoryItemRecord,
  RecipeCostabilityReadinessResult,
  RecipeCostabilityIngredientStatus,
} from './types.js';

const RESOLUTION_SCOPE_ORDER = ['operation_unit', 'location', 'organization'] as const;

export async function resolveCanonicalInventoryItem(
  input: { canonical_ingredient_id: number | string; subject_scope: SubjectScopeContext },
  repository: CanonicalInventoryReadRepository,
): Promise<CanonicalInventoryResolutionResult> {
  const mappings = await repository.listMappingsForCanonical(input.canonical_ingredient_id);

  for (const scopeType of RESOLUTION_SCOPE_ORDER) {
    const scopeRefId = scopeRefForResolution(scopeType, input.subject_scope);
    if (scopeRefId == null) {
      continue;
    }

    const scopedMappings = mappings
      .filter((mapping) => mapping.active && mapping.scope_type === scopeType && String(mapping.scope_ref_id) === String(scopeRefId))
      .sort(compareMappings);

    if (scopedMappings.length === 0) {
      continue;
    }

    const trusted = scopedMappings.find(isTrustedMapping);
    if (trusted) {
      const inventoryItem = trusted.inventory_item_id != null
        ? (await repository.getInventoryItemsByIds([trusted.inventory_item_id]))[0] ?? null
        : null;
      return {
        canonical_ingredient_id: input.canonical_ingredient_id,
        inventory_item_id: trusted.inventory_item_id,
        inventory_item_name: inventoryItem?.name ?? null,
        inventory_item_unit: inventoryItem?.unit ?? null,
        mapping_status: trusted.mapping_status,
        confidence_label: trusted.confidence_label,
        match_reason: trusted.match_reason,
        explanation_text: trusted.explanation_text ?? `Resolved canonical ingredient ${input.canonical_ingredient_id} using ${scopeType} mapping ${trusted.id}.`,
        matched_scope_type: trusted.scope_type,
        matched_scope_ref_id: trusted.scope_ref_id,
        preferred_flag: trusted.preferred_flag,
        trusted: true,
      };
    }

    const fallback = scopedMappings[0]!;
    return {
      canonical_ingredient_id: input.canonical_ingredient_id,
      inventory_item_id: null,
      inventory_item_name: null,
      inventory_item_unit: null,
      mapping_status: fallback.mapping_status,
      confidence_label: fallback.confidence_label,
      match_reason: fallback.match_reason,
      explanation_text: fallback.explanation_text ?? `No trusted inventory item mapping exists for canonical ingredient ${input.canonical_ingredient_id} at ${scopeType} scope ${scopeRefId}.`,
      matched_scope_type: fallback.scope_type,
      matched_scope_ref_id: fallback.scope_ref_id,
      preferred_flag: fallback.preferred_flag,
      trusted: false,
    };
  }

  return {
    canonical_ingredient_id: input.canonical_ingredient_id,
    inventory_item_id: null,
    inventory_item_name: null,
    inventory_item_unit: null,
    mapping_status: 'UNMAPPED',
    confidence_label: 'LOW',
    match_reason: 'no_match',
    explanation_text: `No active scoped inventory mapping exists for canonical ingredient ${input.canonical_ingredient_id}.`,
    matched_scope_type: null,
    matched_scope_ref_id: null,
    preferred_flag: false,
    trusted: false,
  };
}

export async function executeCanonicalInventoryMappingJob(
  request: CanonicalInventoryMappingJobRequest,
  repository: CanonicalInventoryRepository,
): Promise<CanonicalInventoryMappingJobResult> {
  const canonicalIngredients = await repository.listCanonicalIngredients(request.canonical_ingredient_ids);
  const inventoryItems = await repository.listInventoryItemsForScope(request.scope_type, request.scope_ref_id, request.scope_context);
  const mappings: CanonicalInventoryMapping[] = [];
  const candidates: CanonicalInventoryMappingCandidate[] = [];
  const reviewEvents: CanonicalInventoryMappingReviewEvent[] = [];
  const notes: string[] = [];
  const summary: CanonicalInventoryMappingJobResult['run_summary'] = {
    ingredients_processed: canonicalIngredients.length,
    mappings_created: 0,
    mappings_updated: 0,
    mappings_reused: 0,
    mappings_retired: 0,
    auto_mapped: 0,
    needs_review: 0,
    unmapped: 0,
    manual_preserved: 0,
    rejected_preserved: 0,
    candidates_created: 0,
    candidates_updated: 0,
    candidates_retired: 0,
  };

  await repository.withTransaction(async () => {
    const activeCanonicalIds = new Set<string>();

    for (const ingredient of canonicalIngredients) {
      activeCanonicalIds.add(String(ingredient.id));
      const existing = await repository.getPreferredMapping(ingredient.id, request.scope_type, request.scope_ref_id);
      const sourceHash = buildMappingSourceHash(ingredient, inventoryItems, request);

      if (existing?.mapping_status === 'MANUALLY_MAPPED' || existing?.mapping_status === 'REJECTED') {
        const preserved = await repository.upsertPreferredMapping({
          canonical_ingredient_id: ingredient.id,
          inventory_item_id: existing.inventory_item_id,
          scope_type: request.scope_type,
          scope_ref_id: request.scope_ref_id,
          active: true,
          preferred_flag: true,
          mapping_status: existing.mapping_status,
          confidence_label: existing.confidence_label,
          match_reason: existing.match_reason,
          explanation_text: existing.explanation_text,
          source_hash: sourceHash,
          resolved_by: existing.resolved_by,
          resolved_at: existing.resolved_at,
        });
        accumulateMappingWrite(summary, preserved.action);
        mappings.push(preserved.record);
        if (existing.mapping_status === 'MANUALLY_MAPPED') {
          summary.manual_preserved += 1;
        } else {
          summary.rejected_preserved += 1;
        }
        continue;
      }

      const plan = buildMappingPlan(ingredient, inventoryItems, request.scope_type, request.scope_ref_id, sourceHash);
      const persisted = await repository.upsertPreferredMapping(plan.mapping);
      const candidateWrite = await repository.replaceCandidates(persisted.record.id, plan.candidates);
      accumulateMappingWrite(summary, persisted.action);
      summary.candidates_created += candidateWrite.created;
      summary.candidates_updated += candidateWrite.updated;
      summary.candidates_retired += candidateWrite.retired;

      mappings.push(persisted.record);
      candidates.push(...candidateWrite.records);

      if (persisted.record.mapping_status === 'AUTO_MAPPED') {
        summary.auto_mapped += 1;
      } else if (persisted.record.mapping_status === 'NEEDS_REVIEW') {
        summary.needs_review += 1;
        if (persisted.action !== 'reused') {
          const event = await repository.recordReviewEvent({
            canonical_inventory_mapping_id: persisted.record.id,
            action_type: 'FLAGGED_FOR_REVIEW',
            actor_name: null,
            notes: persisted.record.explanation_text,
          });
          reviewEvents.push(event);
        }
      } else if (persisted.record.mapping_status === 'UNMAPPED') {
        summary.unmapped += 1;
        if (persisted.action !== 'reused') {
          const event = await repository.recordReviewEvent({
            canonical_inventory_mapping_id: persisted.record.id,
            action_type: 'UNMAPPED_DETECTED',
            actor_name: null,
            notes: persisted.record.explanation_text,
          });
          reviewEvents.push(event);
        }
      }
    }

    if (!request.canonical_ingredient_ids) {
      summary.mappings_retired = await repository.retireScopeMappings(request.scope_type, request.scope_ref_id, activeCanonicalIds);
    }
  });

  if (canonicalIngredients.length === 0) {
    notes.push('No canonical ingredients were available for scoped inventory mapping.');
  }
  if (inventoryItems.length === 0) {
    notes.push('No inventory items were available in the current runtime scope, so no trusted mappings could be created automatically.');
  }

  return {
    mappings,
    candidates,
    review_events: reviewEvents,
    run_summary: summary,
    notes,
  };
}

export async function evaluateRecipeCostabilityReadiness(
  input: { recipe_version_id: number | string; subject_scope: SubjectScopeContext },
  repository: CanonicalInventoryReadRepository,
): Promise<RecipeCostabilityReadinessResult> {
  const recipeIngredients = await repository.listRecipeIngredients(input.recipe_version_id);
  const ingredientStatuses: RecipeCostabilityIngredientStatus[] = [];

  for (const ingredient of recipeIngredients) {
    if (ingredient.inventory_item_id != null) {
      ingredientStatuses.push({
        recipe_ingredient_id: ingredient.id,
        canonical_ingredient_id: ingredient.canonical_ingredient_id,
        raw_ingredient_text: ingredient.raw_ingredient_text,
        resolved_inventory_item_id: ingredient.inventory_item_id,
        mapping_status: 'MANUALLY_MAPPED',
        trusted: true,
        explanation_text: `Recipe ingredient row ${ingredient.id} already carries inventory item ${ingredient.inventory_item_id}.`,
      });
      continue;
    }

    const resolution = await resolveCanonicalInventoryItem({
      canonical_ingredient_id: ingredient.canonical_ingredient_id,
      subject_scope: input.subject_scope,
    }, repository);

    ingredientStatuses.push({
      recipe_ingredient_id: ingredient.id,
        canonical_ingredient_id: ingredient.canonical_ingredient_id,
        raw_ingredient_text: ingredient.raw_ingredient_text,
        resolved_inventory_item_id: resolution.inventory_item_id,
        mapping_status: resolution.mapping_status,
        trusted: resolution.trusted,
      explanation_text: resolution.explanation_text,
    });
  }

  const totalRows = ingredientStatuses.length;
  const costableRows = ingredientStatuses.filter((status) => status.trusted && status.resolved_inventory_item_id != null).length;
  const unresolvedRows = totalRows - costableRows;
  const costablePercent = totalRows === 0 ? 0 : Number(((costableRows / totalRows) * 100).toFixed(2));

  return {
    recipe_version_id: input.recipe_version_id,
    total_rows: totalRows,
    costable_rows: costableRows,
    unresolved_rows: unresolvedRows,
    costable_percent: costablePercent,
    status: unresolvedRows === 0 ? 'COSTABLE_NOW' : 'OPERATIONAL_ONLY',
    ingredient_statuses: ingredientStatuses,
  };
}

function buildMappingPlan(
  ingredient: CanonicalIngredientWithAliases,
  inventoryItems: InventoryItemRecord[],
  scopeType: CanonicalInventoryMappingJobRequest['scope_type'],
  scopeRefId: CanonicalInventoryMappingJobRequest['scope_ref_id'],
  sourceHash: string,
): {
  mapping: Omit<CanonicalInventoryMapping, 'id' | 'created_at' | 'updated_at'>;
  candidates: Array<Omit<CanonicalInventoryMappingCandidate, 'id' | 'canonical_inventory_mapping_id' | 'created_at' | 'updated_at'>>;
} {
  const exactCanonical = uniqueItems(inventoryItems.filter((item) => item.name === ingredient.canonical_name));
  if (exactCanonical.length === 1) {
    return autoMappedPlan(ingredient, exactCanonical[0]!, scopeType, scopeRefId, sourceHash, 'exact_inventory_name', `Resolved canonical ingredient "${ingredient.canonical_name}" to inventory item "${exactCanonical[0]!.name}" using exact inventory name match.`);
  }
  if (exactCanonical.length > 1) {
    return reviewPlan(ingredient, exactCanonical, scopeType, scopeRefId, sourceHash, 'ambiguous_inventory_match', `Multiple inventory items matched canonical ingredient "${ingredient.canonical_name}" by exact name. FIFOFlow will not guess.`);
  }

  const normalizedCanonical = uniqueItems(inventoryItems.filter((item) => item.normalized_name === ingredient.normalized_canonical_name));
  if (normalizedCanonical.length === 1) {
    return autoMappedPlan(ingredient, normalizedCanonical[0]!, scopeType, scopeRefId, sourceHash, 'normalized_inventory_name', `Resolved canonical ingredient "${ingredient.canonical_name}" to inventory item "${normalizedCanonical[0]!.name}" using normalized inventory name match.`);
  }
  if (normalizedCanonical.length > 1) {
    return reviewPlan(ingredient, normalizedCanonical, scopeType, scopeRefId, sourceHash, 'ambiguous_inventory_match', `Multiple inventory items matched canonical ingredient "${ingredient.canonical_name}" after normalization. FIFOFlow will not guess.`);
  }

  const aliasMatches = uniqueItems(
    inventoryItems.filter((item) => ingredient.aliases.includes(item.name) || ingredient.normalized_aliases.includes(item.normalized_name)),
  );
  if (aliasMatches.length === 1) {
    return autoMappedPlan(ingredient, aliasMatches[0]!, scopeType, scopeRefId, sourceHash, 'alias_based_match', `Resolved canonical ingredient "${ingredient.canonical_name}" to inventory item "${aliasMatches[0]!.name}" using canonical alias overlap.`);
  }
  if (aliasMatches.length > 1) {
    return reviewPlan(ingredient, aliasMatches, scopeType, scopeRefId, sourceHash, 'ambiguous_inventory_match', `Multiple inventory items overlapped aliases for canonical ingredient "${ingredient.canonical_name}". FIFOFlow will not guess.`);
  }

  return {
    mapping: {
      canonical_ingredient_id: ingredient.id,
      inventory_item_id: null,
      scope_type: scopeType,
      scope_ref_id: scopeRefId,
      active: true,
      preferred_flag: true,
      mapping_status: 'UNMAPPED',
      confidence_label: 'LOW',
      match_reason: 'no_match',
      explanation_text: `No active inventory item matched canonical ingredient "${ingredient.canonical_name}" for ${scopeType} scope ${scopeRefId}.`,
      source_hash: sourceHash,
      resolved_by: null,
      resolved_at: null,
    },
    candidates: [],
  };
}

function autoMappedPlan(
  ingredient: CanonicalIngredientWithAliases,
  inventoryItem: InventoryItemRecord,
  scopeType: CanonicalInventoryMappingJobRequest['scope_type'],
  scopeRefId: CanonicalInventoryMappingJobRequest['scope_ref_id'],
  sourceHash: string,
  matchReason: Extract<CanonicalInventoryMatchReason, 'exact_inventory_name' | 'normalized_inventory_name' | 'alias_based_match'>,
  explanationText: string,
) {
  return {
    mapping: {
      canonical_ingredient_id: ingredient.id,
      inventory_item_id: inventoryItem.id,
      scope_type: scopeType,
      scope_ref_id: scopeRefId,
      active: true,
      preferred_flag: true,
      mapping_status: 'AUTO_MAPPED',
      confidence_label: 'HIGH',
      match_reason: matchReason,
      explanation_text: explanationText,
      source_hash: sourceHash,
      resolved_by: null,
      resolved_at: null,
    } satisfies Omit<CanonicalInventoryMapping, 'id' | 'created_at' | 'updated_at'>,
    candidates: [],
  };
}

function reviewPlan(
  ingredient: CanonicalIngredientWithAliases,
  matches: InventoryItemRecord[],
  scopeType: CanonicalInventoryMappingJobRequest['scope_type'],
  scopeRefId: CanonicalInventoryMappingJobRequest['scope_ref_id'],
  sourceHash: string,
  matchReason: Extract<CanonicalInventoryMatchReason, 'ambiguous_inventory_match'>,
  explanationText: string,
) {
  return {
    mapping: {
      canonical_ingredient_id: ingredient.id,
      inventory_item_id: null,
      scope_type: scopeType,
      scope_ref_id: scopeRefId,
      active: true,
      preferred_flag: true,
      mapping_status: 'NEEDS_REVIEW',
      confidence_label: 'LOW',
      match_reason: matchReason,
      explanation_text: explanationText,
      source_hash: sourceHash,
      resolved_by: null,
      resolved_at: null,
    } satisfies Omit<CanonicalInventoryMapping, 'id' | 'created_at' | 'updated_at'>,
    candidates: matches.map((match, index) => ({
      candidate_inventory_item_id: match.id,
      candidate_inventory_name: match.name,
      confidence_label: 'LOW',
      match_reason: matchReason,
      explanation_text: `Candidate ${index + 1} for canonical ingredient "${ingredient.canonical_name}" is inventory item "${match.name}". ${explanationText}`,
      candidate_rank: index + 1,
      active: true,
    } satisfies Omit<CanonicalInventoryMappingCandidate, 'id' | 'canonical_inventory_mapping_id' | 'created_at' | 'updated_at'>)),
  };
}

function uniqueItems(items: InventoryItemRecord[]): InventoryItemRecord[] {
  const deduped = new Map<string, InventoryItemRecord>();
  for (const item of items) {
    if (!deduped.has(String(item.id))) {
      deduped.set(String(item.id), item);
    }
  }
  return [...deduped.values()];
}

function buildMappingSourceHash(
  ingredient: CanonicalIngredientWithAliases,
  inventoryItems: InventoryItemRecord[],
  request: CanonicalInventoryMappingJobRequest,
): string {
  return createHash('sha256')
    .update(JSON.stringify({
      canonical_ingredient_id: ingredient.id,
      canonical_name: ingredient.canonical_name,
      normalized_canonical_name: ingredient.normalized_canonical_name,
      aliases: ingredient.aliases,
      scope_type: request.scope_type,
      scope_ref_id: request.scope_ref_id,
      inventory_items: inventoryItems.map((item) => ({ id: item.id, name: item.name, normalized_name: item.normalized_name, venue_id: item.venue_id })),
    }))
    .digest('hex');
}

function scopeRefForResolution(
  scopeType: typeof RESOLUTION_SCOPE_ORDER[number],
  subjectScope: SubjectScopeContext,
): number | string | null {
  if (scopeType === 'operation_unit') {
    return subjectScope.operation_unit_id ?? null;
  }
  if (scopeType === 'location') {
    return subjectScope.location_id ?? null;
  }
  return subjectScope.organization_id ?? null;
}

function compareMappings(left: CanonicalInventoryMapping, right: CanonicalInventoryMapping): number {
  if (left.preferred_flag !== right.preferred_flag) {
    return left.preferred_flag ? -1 : 1;
  }
  const leftTrusted = isTrustedMapping(left);
  const rightTrusted = isTrustedMapping(right);
  if (leftTrusted !== rightTrusted) {
    return leftTrusted ? -1 : 1;
  }
  return Number(left.id) - Number(right.id);
}

function isTrustedMapping(mapping: CanonicalInventoryMapping): boolean {
  return mapping.inventory_item_id != null
    && (mapping.mapping_status === 'AUTO_MAPPED' || mapping.mapping_status === 'MANUALLY_MAPPED');
}

function accumulateMappingWrite(
  summary: CanonicalInventoryMappingJobResult['run_summary'],
  action: 'created' | 'updated' | 'reused',
): void {
  if (action === 'created') {
    summary.mappings_created += 1;
  } else if (action === 'updated') {
    summary.mappings_updated += 1;
  } else {
    summary.mappings_reused += 1;
  }
}
