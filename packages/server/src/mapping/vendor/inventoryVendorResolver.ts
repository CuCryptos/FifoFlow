import { createHash } from 'node:crypto';
import type { SubjectScopeContext } from '../../platform/policy/types.js';
import type { InventoryItemRecord } from '../inventory/types.js';
import type {
  InventoryVendorMapping,
  InventoryVendorMappingCandidate,
  InventoryVendorMappingJobRequest,
  InventoryVendorMappingJobResult,
  InventoryVendorMappingReviewEvent,
  InventoryVendorMappingScopeType,
  InventoryVendorReadRepository,
  InventoryVendorRepository,
  InventoryVendorResolutionResult,
  VendorCostLineageRecord,
  VendorCostLineageResult,
  VendorItemRecord,
} from './types.js';

const RESOLUTION_SCOPE_ORDER = ['operation_unit', 'location', 'organization'] as const;
const DEFAULT_COST_STALE_AFTER_DAYS = 30;

export async function resolveInventoryVendorItem(
  input: {
    inventory_item_id: number | string;
    subject_scope: SubjectScopeContext;
    effective_at?: string | null;
  },
  repository: InventoryVendorReadRepository,
): Promise<InventoryVendorResolutionResult> {
  const mappings = await repository.listMappingsForInventoryItem(input.inventory_item_id);

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
    if (trusted?.vendor_item_id != null) {
      const vendorItem = (await repository.getVendorItemsByIds([trusted.vendor_item_id]))[0] ?? null;
      return {
        inventory_item_id: input.inventory_item_id,
        vendor_item_id: trusted.vendor_item_id,
        vendor_id: vendorItem?.vendor_id ?? null,
        vendor_name: vendorItem?.vendor_name ?? null,
        vendor_item_name: vendorItem?.vendor_item_name ?? null,
        mapping_status: trusted.mapping_status,
        confidence_label: trusted.confidence_label,
        match_reason: trusted.match_reason,
        explanation_text: trusted.explanation_text ?? `Resolved inventory item ${input.inventory_item_id} using ${scopeType} vendor mapping ${trusted.id}.`,
        matched_scope_type: trusted.scope_type,
        matched_scope_ref_id: trusted.scope_ref_id,
        preferred_flag: trusted.preferred_flag,
        trusted: true,
      };
    }

    const fallback = scopedMappings[0]!;
    return {
      inventory_item_id: input.inventory_item_id,
      vendor_item_id: null,
      vendor_id: null,
      vendor_name: null,
      vendor_item_name: null,
      mapping_status: fallback.mapping_status,
      confidence_label: fallback.confidence_label,
      match_reason: fallback.match_reason,
      explanation_text: fallback.explanation_text ?? `No trusted vendor-item mapping exists for inventory item ${input.inventory_item_id} at ${scopeType} scope ${scopeRefId}.`,
      matched_scope_type: fallback.scope_type,
      matched_scope_ref_id: fallback.scope_ref_id,
      preferred_flag: fallback.preferred_flag,
      trusted: false,
    };
  }

  return {
    inventory_item_id: input.inventory_item_id,
    vendor_item_id: null,
    vendor_id: null,
    vendor_name: null,
    vendor_item_name: null,
    mapping_status: 'UNMAPPED',
    confidence_label: 'LOW',
    match_reason: 'no_match',
    explanation_text: `No active scoped vendor-item mapping exists for inventory item ${input.inventory_item_id}.`,
    matched_scope_type: null,
    matched_scope_ref_id: null,
    preferred_flag: false,
    trusted: false,
  };
}

export async function resolveVendorCostLineage(
  input: {
    inventory_item_id: number | string;
    subject_scope: SubjectScopeContext;
    effective_at?: string | null;
    stale_after_days?: number;
  },
  repository: InventoryVendorReadRepository,
): Promise<VendorCostLineageResult> {
  const mappingResolution = await resolveInventoryVendorItem(input, repository);

  if (!mappingResolution.trusted || mappingResolution.vendor_item_id == null) {
    return {
      inventory_item_id: input.inventory_item_id,
      vendor_item_id: null,
      vendor_id: null,
      vendor_name: null,
      vendor_item_name: null,
      normalized_unit_cost: null,
      base_unit: null,
      source_type: 'missing',
      source_ref_table: null,
      source_ref_id: null,
      effective_at: null,
      stale_at: null,
      stale: false,
      confidence_label: 'LOW',
      explanation_text: `${mappingResolution.explanation_text} No trusted vendor-item cost lineage is available.`,
      mapping_resolution: mappingResolution,
    };
  }

  const vendorItem = (await repository.getVendorItemsByIds([mappingResolution.vendor_item_id]))[0] ?? null;
  if (!vendorItem) {
    return {
      inventory_item_id: input.inventory_item_id,
      vendor_item_id: mappingResolution.vendor_item_id,
      vendor_id: null,
      vendor_name: null,
      vendor_item_name: null,
      normalized_unit_cost: null,
      base_unit: null,
      source_type: 'missing',
      source_ref_table: null,
      source_ref_id: null,
      effective_at: null,
      stale_at: null,
      stale: false,
      confidence_label: 'LOW',
      explanation_text: `${mappingResolution.explanation_text} Vendor item ${mappingResolution.vendor_item_id} could not be loaded for cost lineage.`,
      mapping_resolution: mappingResolution,
    };
  }

  const lineageRecord = (await repository.listCostLineageRecords(vendorItem.id, input.effective_at))[0] ?? null;
  if (lineageRecord?.normalized_unit_cost != null) {
    const stale = isLineageStale({
      effectiveAt: lineageRecord.effective_at,
      staleAt: lineageRecord.stale_at,
      referenceTime: input.effective_at,
      staleAfterDays: input.stale_after_days ?? DEFAULT_COST_STALE_AFTER_DAYS,
    });
    return {
      inventory_item_id: input.inventory_item_id,
      vendor_item_id: vendorItem.id,
      vendor_id: vendorItem.vendor_id,
      vendor_name: vendorItem.vendor_name,
      vendor_item_name: vendorItem.vendor_item_name,
      normalized_unit_cost: lineageRecord.normalized_unit_cost,
      base_unit: lineageRecord.base_unit,
      source_type: lineageRecord.source_type,
      source_ref_table: lineageRecord.source_ref_table,
      source_ref_id: lineageRecord.source_ref_id,
      effective_at: lineageRecord.effective_at,
      stale_at: lineageRecord.stale_at,
      stale,
      confidence_label: stale ? 'MEDIUM' : lineageRecord.confidence_label ?? 'HIGH',
      explanation_text: `${mappingResolution.explanation_text} Using ${lineageRecord.source_type} lineage record ${lineageRecord.id} for vendor item ${vendorItem.id}.`,
      mapping_resolution: mappingResolution,
    };
  }

  const normalizedUnitCost = normalizeVendorItemCost(vendorItem);
  if (normalizedUnitCost != null) {
    const effectiveAt = vendorItem.updated_at ?? vendorItem.created_at;
    const stale = isLineageStale({
      effectiveAt,
      staleAt: null,
      referenceTime: input.effective_at,
      staleAfterDays: input.stale_after_days ?? DEFAULT_COST_STALE_AFTER_DAYS,
    });
    return {
      inventory_item_id: input.inventory_item_id,
      vendor_item_id: vendorItem.id,
      vendor_id: vendorItem.vendor_id,
      vendor_name: vendorItem.vendor_name,
      vendor_item_name: vendorItem.vendor_item_name,
      normalized_unit_cost: normalizedUnitCost,
      base_unit: vendorItem.base_unit,
      source_type: 'vendor_price_history',
      source_ref_table: 'vendor_prices',
      source_ref_id: String(vendorItem.id),
      effective_at: effectiveAt,
      stale_at: null,
      stale,
      confidence_label: stale ? 'MEDIUM' : 'HIGH',
      explanation_text: `${mappingResolution.explanation_text} Using normalized vendor price history from vendor_prices row ${vendorItem.id}.`,
      mapping_resolution: mappingResolution,
    };
  }

  return {
    inventory_item_id: input.inventory_item_id,
    vendor_item_id: vendorItem.id,
    vendor_id: vendorItem.vendor_id,
    vendor_name: vendorItem.vendor_name,
    vendor_item_name: vendorItem.vendor_item_name,
    normalized_unit_cost: null,
    base_unit: vendorItem.base_unit,
    source_type: 'missing',
    source_ref_table: 'vendor_prices',
    source_ref_id: String(vendorItem.id),
    effective_at: vendorItem.updated_at ?? vendorItem.created_at,
    stale_at: null,
    stale: false,
    confidence_label: 'LOW',
    explanation_text: `${mappingResolution.explanation_text} Vendor item ${vendorItem.id} does not expose enough pack information to normalize cost into ${vendorItem.base_unit}.`,
    mapping_resolution: mappingResolution,
  };
}

export async function executeInventoryVendorMappingJob(
  request: InventoryVendorMappingJobRequest,
  repository: InventoryVendorRepository,
): Promise<InventoryVendorMappingJobResult> {
  const scopedInventoryItems = await repository.listInventoryItemsForScope(request.scope_type, request.scope_ref_id, request.scope_context);
  const inventoryItems = request.inventory_item_ids && request.inventory_item_ids.length > 0
    ? scopedInventoryItems.filter((item) => request.inventory_item_ids!.some((candidateId) => String(candidateId) === String(item.id)))
    : scopedInventoryItems;

  const mappings: InventoryVendorMapping[] = [];
  const candidates: InventoryVendorMappingCandidate[] = [];
  const reviewEvents: InventoryVendorMappingReviewEvent[] = [];
  const notes: string[] = [];
  const summary: InventoryVendorMappingJobResult['run_summary'] = {
    inventory_items_processed: inventoryItems.length,
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
    const activeInventoryItemIds = new Set<string>();

    for (const inventoryItem of inventoryItems) {
      activeInventoryItemIds.add(String(inventoryItem.id));
      const existing = await repository.getPreferredMapping(inventoryItem.id, request.scope_type, request.scope_ref_id);
      const vendorItems = await repository.listVendorItemsForInventoryItem(
        inventoryItem.id,
        request.scope_type,
        request.scope_ref_id,
        request.scope_context,
      );
      const sourceHash = buildMappingSourceHash(inventoryItem, vendorItems, request);

      if (existing?.mapping_status === 'MANUALLY_MAPPED' || existing?.mapping_status === 'REJECTED') {
        const preserved = await repository.upsertPreferredMapping({
          inventory_item_id: inventoryItem.id,
          vendor_item_id: existing.vendor_item_id,
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

      const plan = buildMappingPlan(inventoryItem, vendorItems, request.scope_type, request.scope_ref_id, sourceHash);
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
            inventory_vendor_mapping_id: persisted.record.id,
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
            inventory_vendor_mapping_id: persisted.record.id,
            action_type: 'UNMAPPED_DETECTED',
            actor_name: null,
            notes: persisted.record.explanation_text,
          });
          reviewEvents.push(event);
        }
      }
    }

    if (!request.inventory_item_ids) {
      summary.mappings_retired = await repository.retireScopeMappings(request.scope_type, request.scope_ref_id, activeInventoryItemIds);
    }
  });

  if (inventoryItems.length === 0) {
    notes.push('No inventory items were available for the scoped vendor mapping run.');
  }

  return {
    mappings,
    candidates,
    review_events: reviewEvents,
    run_summary: summary,
    notes,
  };
}

function buildMappingPlan(
  inventoryItem: InventoryItemRecord,
  vendorItems: VendorItemRecord[],
  scopeType: InventoryVendorMappingScopeType,
  scopeRefId: number | string,
  sourceHash: string,
): {
  mapping: Omit<InventoryVendorMapping, 'id' | 'created_at' | 'updated_at'>;
  candidates: Array<Omit<InventoryVendorMappingCandidate, 'id' | 'inventory_vendor_mapping_id' | 'created_at' | 'updated_at'>>;
} {
  const exactMatches = uniqueVendorItems(vendorItems.filter((vendorItem) => vendorItem.vendor_item_name === inventoryItem.name));
  if (exactMatches.length === 1) {
    return autoMappedPlan(
      inventoryItem,
      exactMatches[0]!,
      scopeType,
      scopeRefId,
      sourceHash,
      'exact_vendor_item_name',
      `Resolved inventory item "${inventoryItem.name}" to vendor item "${exactMatches[0]!.vendor_item_name}" using exact vendor item name overlap.`,
    );
  }
  if (exactMatches.length > 1) {
    return reviewPlan(
      inventoryItem,
      exactMatches,
      scopeType,
      scopeRefId,
      sourceHash,
      'ambiguous_vendor_match',
      `Multiple vendor items matched inventory item "${inventoryItem.name}" by exact name. FIFOFlow will not guess.`,
    );
  }

  const normalizedMatches = uniqueVendorItems(
    vendorItems.filter((vendorItem) => vendorItem.normalized_vendor_item_name === inventoryItem.normalized_name),
  );
  if (normalizedMatches.length === 1) {
    return autoMappedPlan(
      inventoryItem,
      normalizedMatches[0]!,
      scopeType,
      scopeRefId,
      sourceHash,
      'normalized_vendor_item_name',
      `Resolved inventory item "${inventoryItem.name}" to vendor item "${normalizedMatches[0]!.vendor_item_name}" using normalized vendor item name overlap.`,
    );
  }
  if (normalizedMatches.length > 1) {
    return reviewPlan(
      inventoryItem,
      normalizedMatches,
      scopeType,
      scopeRefId,
      sourceHash,
      'ambiguous_vendor_match',
      `Multiple vendor items matched inventory item "${inventoryItem.name}" after normalization. FIFOFlow will not guess.`,
    );
  }

  const defaultVendorItems = uniqueVendorItems(vendorItems.filter((vendorItem) => vendorItem.is_default));
  if (defaultVendorItems.length === 1) {
    return autoMappedPlan(
      inventoryItem,
      defaultVendorItems[0]!,
      scopeType,
      scopeRefId,
      sourceHash,
      'scoped_default',
      `Resolved inventory item "${inventoryItem.name}" to vendor item "${defaultVendorItems[0]!.vendor_item_name}" using the existing default vendor-price relationship for this inventory item.`,
    );
  }
  if (defaultVendorItems.length > 1) {
    return reviewPlan(
      inventoryItem,
      defaultVendorItems,
      scopeType,
      scopeRefId,
      sourceHash,
      'ambiguous_vendor_match',
      `Multiple vendor items are marked as defaults for inventory item "${inventoryItem.name}". FIFOFlow will not guess.`,
    );
  }

  if (vendorItems.length === 1) {
    return autoMappedPlan(
      inventoryItem,
      vendorItems[0]!,
      scopeType,
      scopeRefId,
      sourceHash,
      'existing_vendor_price_link',
      `Resolved inventory item "${inventoryItem.name}" to vendor item "${vendorItems[0]!.vendor_item_name}" because it is the only active vendor-price relationship on record.`,
    );
  }

  if (vendorItems.length > 1) {
    return reviewPlan(
      inventoryItem,
      vendorItems,
      scopeType,
      scopeRefId,
      sourceHash,
      'ambiguous_vendor_match',
      `Inventory item "${inventoryItem.name}" has multiple active vendor items on record for ${scopeType} scope ${scopeRefId}. FIFOFlow will not guess.`,
    );
  }

  return {
    mapping: {
      inventory_item_id: inventoryItem.id,
      vendor_item_id: null,
      scope_type: scopeType,
      scope_ref_id: scopeRefId,
      active: true,
      preferred_flag: true,
      mapping_status: 'UNMAPPED',
      confidence_label: 'LOW',
      match_reason: 'no_match',
      explanation_text: `No active vendor item matched inventory item "${inventoryItem.name}" for ${scopeType} scope ${scopeRefId}.`,
      source_hash: sourceHash,
      resolved_by: null,
      resolved_at: null,
    },
    candidates: [],
  };
}

function autoMappedPlan(
  inventoryItem: InventoryItemRecord,
  vendorItem: VendorItemRecord,
  scopeType: InventoryVendorMappingScopeType,
  scopeRefId: number | string,
  sourceHash: string,
  matchReason: NonNullable<InventoryVendorMapping['match_reason']>,
  explanationText: string,
): {
  mapping: Omit<InventoryVendorMapping, 'id' | 'created_at' | 'updated_at'>;
  candidates: [];
} {
  return {
    mapping: {
      inventory_item_id: inventoryItem.id,
      vendor_item_id: vendorItem.id,
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
    },
    candidates: [],
  };
}

function reviewPlan(
  inventoryItem: InventoryItemRecord,
  vendorItems: VendorItemRecord[],
  scopeType: InventoryVendorMappingScopeType,
  scopeRefId: number | string,
  sourceHash: string,
  matchReason: NonNullable<InventoryVendorMapping['match_reason']>,
  explanationText: string,
): {
  mapping: Omit<InventoryVendorMapping, 'id' | 'created_at' | 'updated_at'>;
  candidates: Array<Omit<InventoryVendorMappingCandidate, 'id' | 'inventory_vendor_mapping_id' | 'created_at' | 'updated_at'>>;
} {
  const orderedVendorItems = [...vendorItems].sort((left, right) => {
    if (left.is_default !== right.is_default) {
      return Number(right.is_default) - Number(left.is_default);
    }
    return String(left.id).localeCompare(String(right.id));
  });

  return {
    mapping: {
      inventory_item_id: inventoryItem.id,
      vendor_item_id: null,
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
    },
    candidates: orderedVendorItems.map((vendorItem, index) => ({
      candidate_vendor_item_id: vendorItem.id,
      candidate_vendor_name: vendorItem.vendor_name,
      candidate_vendor_item_name: vendorItem.vendor_item_name,
      confidence_label: index === 0 && vendorItem.is_default ? 'MEDIUM' : 'LOW',
      match_reason: matchReason,
      explanation_text: vendorItem.is_default
        ? `${vendorItem.vendor_item_name} is currently marked default for inventory item ${inventoryItem.id}, but multiple vendor choices still exist.`
        : `${vendorItem.vendor_item_name} is a plausible vendor item for inventory item ${inventoryItem.id}, but FIFOFlow needs review before choosing it.`,
      candidate_rank: index + 1,
      active: true,
    })),
  };
}

function uniqueVendorItems(vendorItems: VendorItemRecord[]): VendorItemRecord[] {
  const seen = new Set<string>();
  const unique: VendorItemRecord[] = [];
  for (const vendorItem of vendorItems) {
    const key = String(vendorItem.id);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(vendorItem);
  }
  return unique;
}

function scopeRefForResolution(
  scopeType: InventoryVendorMappingScopeType,
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

function compareMappings(left: InventoryVendorMapping, right: InventoryVendorMapping): number {
  if (left.preferred_flag !== right.preferred_flag) {
    return Number(right.preferred_flag) - Number(left.preferred_flag);
  }
  if (left.active !== right.active) {
    return Number(right.active) - Number(left.active);
  }
  return String(right.id).localeCompare(String(left.id));
}

function isTrustedMapping(mapping: InventoryVendorMapping): boolean {
  return mapping.vendor_item_id != null
    && (mapping.mapping_status === 'AUTO_MAPPED' || mapping.mapping_status === 'MANUALLY_MAPPED')
    && mapping.active;
}

function normalizeVendorItemCost(vendorItem: VendorItemRecord): number | null {
  if (!Number.isFinite(vendorItem.order_unit_price)) {
    return null;
  }
  if (vendorItem.qty_per_unit != null && vendorItem.qty_per_unit > 0) {
    return Number((vendorItem.order_unit_price / vendorItem.qty_per_unit).toFixed(6));
  }
  if (vendorItem.order_unit == null || normalizeUnit(vendorItem.order_unit) === normalizeUnit(vendorItem.base_unit)) {
    return Number(vendorItem.order_unit_price.toFixed(6));
  }
  return null;
}

function normalizeUnit(unit: string | null): string {
  return String(unit ?? '').trim().toLowerCase();
}

function isLineageStale(input: {
  effectiveAt: string | null;
  staleAt: string | null;
  referenceTime?: string | null;
  staleAfterDays: number;
}): boolean {
  const referenceTime = parseTime(input.referenceTime);
  if (!referenceTime) {
    return false;
  }

  const explicitStaleAt = parseTime(input.staleAt);
  if (explicitStaleAt && referenceTime.getTime() > explicitStaleAt.getTime()) {
    return true;
  }

  const effectiveAt = parseTime(input.effectiveAt);
  if (!effectiveAt) {
    return false;
  }

  const ageMs = referenceTime.getTime() - effectiveAt.getTime();
  return ageMs > input.staleAfterDays * 24 * 60 * 60 * 1000;
}

function parseTime(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function buildMappingSourceHash(
  inventoryItem: InventoryItemRecord,
  vendorItems: VendorItemRecord[],
  request: InventoryVendorMappingJobRequest,
): string {
  return createHash('sha256')
    .update(JSON.stringify({
      inventory_item_id: inventoryItem.id,
      inventory_item_name: inventoryItem.name,
      scope_type: request.scope_type,
      scope_ref_id: request.scope_ref_id,
      vendor_items: vendorItems.map((vendorItem) => ({
        id: vendorItem.id,
        vendor_id: vendorItem.vendor_id,
        vendor_item_name: vendorItem.vendor_item_name,
        normalized_vendor_item_name: vendorItem.normalized_vendor_item_name,
        is_default: vendorItem.is_default,
        order_unit: vendorItem.order_unit,
        qty_per_unit: vendorItem.qty_per_unit,
        order_unit_price: vendorItem.order_unit_price,
      })),
    }))
    .digest('hex');
}

function accumulateMappingWrite(
  summary: InventoryVendorMappingJobResult['run_summary'],
  action: 'created' | 'updated' | 'reused',
): void {
  if (action === 'created') {
    summary.mappings_created += 1;
    return;
  }
  if (action === 'updated') {
    summary.mappings_updated += 1;
    return;
  }
  summary.mappings_reused += 1;
}
