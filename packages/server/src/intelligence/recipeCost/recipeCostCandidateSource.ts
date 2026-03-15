import type { EvidenceReference, RecipeCostConfidenceLabel, RecipeCostSourceType } from '@fifoflow/shared';
import type {
  IngredientCostCandidate,
  RecipeCostBridgedRecipeDefinition,
  RecipeCostSource,
} from './types.js';
import type { IntelligenceJobContext } from '../types.js';
import { resolvePromotedRecipeForCosting } from './recipeCostabilityResolver.js';
import type { RecipeCostSourceBridgeDependencies } from './types.js';

export class VendorLineageRecipeCostSource implements RecipeCostSource {
  private readonly bridgedRecipeCache = new Map<string, Promise<RecipeCostBridgedRecipeDefinition[]>>();

  constructor(private readonly dependencies: RecipeCostSourceBridgeDependencies) {}

  async listRecipeDefinitions(context: IntelligenceJobContext) {
    const bridged = await this.listBridgedRecipes(context);
    return bridged.map((entry) => structuredClone(entry.recipe));
  }

  async listIngredientCostCandidates(context: IntelligenceJobContext): Promise<IngredientCostCandidate[]> {
    const bridged = await this.listBridgedRecipes(context);
    const bridgeCandidates = buildIngredientCostCandidatesFromBridgedRecipes(bridged);

    if (bridgeCandidates.length > 0 || !this.dependencies.candidateSource) {
      return bridgeCandidates;
    }

    const fallbackCandidates = await this.dependencies.candidateSource.listIngredientCostCandidates(context);
    return fallbackCandidates.map((candidate) => ({
      ...candidate,
      evidence: candidate.evidence ?? [],
      inventory_scope_explanation: candidate.inventory_scope_explanation ?? null,
      vendor_scope_explanation: candidate.vendor_scope_explanation ?? null,
    }));
  }

  async listBridgedRecipes(context: IntelligenceJobContext): Promise<RecipeCostBridgedRecipeDefinition[]> {
    const cacheKey = JSON.stringify({
      scope: context.scope,
      window: context.window,
      now: context.now,
    });

    const cached = this.bridgedRecipeCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const pending = this.loadBridgedRecipes(context);
    this.bridgedRecipeCache.set(cacheKey, pending);
    return pending;
  }

  private async loadBridgedRecipes(context: IntelligenceJobContext): Promise<RecipeCostBridgedRecipeDefinition[]> {
    const promotedRecipes = await this.dependencies.operationalRepository.listPromotedRecipes(context);
    return Promise.all(
      promotedRecipes.map((recipe) =>
        resolvePromotedRecipeForCosting(recipe, context, {
          operationalRepository: this.dependencies.operationalRepository,
          inventoryRepository: this.dependencies.inventoryRepository,
          vendorRepository: this.dependencies.vendorRepository,
        }),
      ),
    );
  }
}

export function buildIngredientCostCandidatesFromBridgedRecipes(
  bridgedRecipes: RecipeCostBridgedRecipeDefinition[],
): IngredientCostCandidate[] {
  const aggregated = new Map<string, CandidateAggregate>();

  for (const recipe of bridgedRecipes) {
    for (const row of recipe.source_rows) {
      if (row.costability_status !== 'RESOLVED_FOR_COSTING') {
        continue;
      }
      if (row.inventory_item_id == null || !row.vendor_cost_lineage || row.vendor_cost_lineage.vendor_item_id == null) {
        continue;
      }
      if (row.vendor_cost_lineage.source_type === 'missing' || row.vendor_cost_lineage.normalized_unit_cost == null) {
        continue;
      }

      const sourceType = mapVendorLineageSourceType(row.vendor_cost_lineage.source_type);
      const sourceRefTable = row.vendor_cost_lineage.source_ref_table ?? 'vendor_prices';
      const sourceRefId = row.vendor_cost_lineage.source_ref_id ?? String(row.vendor_cost_lineage.vendor_item_id);
      const candidateKey = [row.inventory_item_id, row.vendor_cost_lineage.vendor_item_id, sourceRefTable, sourceRefId].join(':');
      const existing = aggregated.get(candidateKey);
      const evidence = buildCandidateEvidence(recipe, row, sourceType, sourceRefTable, sourceRefId);

      if (!existing) {
        aggregated.set(candidateKey, {
          inventory_item_id: Number(row.inventory_item_id),
          inventory_item_name: row.inventory_item_name,
          canonical_ids: new Set(row.canonical_ingredient_id == null ? [] : [String(row.canonical_ingredient_id)]),
          source_type: sourceType,
          normalized_unit_cost: row.vendor_cost_lineage.normalized_unit_cost,
          base_unit: row.vendor_cost_lineage.base_unit ?? row.base_unit,
          normalized_cost_base_unit: row.vendor_cost_lineage.base_unit ?? row.base_unit,
          observed_at: row.vendor_cost_lineage.effective_at,
          source_ref_table: sourceRefTable,
          source_ref_id: sourceRefId,
          vendor_item_id: row.vendor_cost_lineage.vendor_item_id,
          vendor_id: row.vendor_cost_lineage.vendor_id == null ? null : Number(row.vendor_cost_lineage.vendor_id),
          vendor_name: row.vendor_cost_lineage.vendor_name,
          vendor_item_name: row.vendor_cost_lineage.vendor_item_name,
          stale_flag: row.vendor_cost_lineage.stale,
          confidence_label: mapConfidenceLabel(row.vendor_cost_lineage.confidence_label),
          inventory_scope_explanation: row.inventory_mapping_resolution?.explanation_text ?? null,
          vendor_scope_explanation: row.vendor_mapping_resolution?.explanation_text ?? null,
          effective_from: row.vendor_cost_lineage.effective_at,
          effective_to: row.vendor_cost_lineage.stale_at,
          evidence,
        });
        continue;
      }

      if (row.canonical_ingredient_id != null) {
        existing.canonical_ids.add(String(row.canonical_ingredient_id));
      }
      existing.evidence.push(...evidence);
      if (existing.confidence_label === 'medium' && row.vendor_cost_lineage.confidence_label === 'HIGH') {
        existing.confidence_label = 'high';
      }
      if (existing.vendor_scope_explanation == null && row.vendor_mapping_resolution?.explanation_text) {
        existing.vendor_scope_explanation = row.vendor_mapping_resolution.explanation_text;
      }
      if (existing.inventory_scope_explanation == null && row.inventory_mapping_resolution?.explanation_text) {
        existing.inventory_scope_explanation = row.inventory_mapping_resolution.explanation_text;
      }
    }
  }

  return [...aggregated.values()].map((entry) => ({
    inventory_item_id: entry.inventory_item_id,
    inventory_item_name: entry.inventory_item_name,
    canonical_ingredient_id: entry.canonical_ids.size === 1 ? [...entry.canonical_ids][0]! : null,
    canonical_ingredient_ids: [...entry.canonical_ids],
    vendor_item_id: entry.vendor_item_id,
    vendor_item_name: entry.vendor_item_name,
    source_type: entry.source_type,
    normalized_unit_cost: entry.normalized_unit_cost,
    base_unit: entry.base_unit,
    normalized_cost_base_unit: entry.normalized_cost_base_unit,
    observed_at: entry.observed_at,
    source_ref_table: entry.source_ref_table,
    source_ref_id: entry.source_ref_id,
    stale_flag: entry.stale_flag,
    confidence_label: entry.confidence_label,
    inventory_scope_explanation: entry.inventory_scope_explanation,
    vendor_scope_explanation: entry.vendor_scope_explanation,
    vendor_id: entry.vendor_id,
    vendor_name: entry.vendor_name,
    effective_from: entry.effective_from,
    effective_to: entry.effective_to,
    evidence: entry.evidence,
  }));
}

interface CandidateAggregate {
  inventory_item_id: number;
  inventory_item_name: string;
  canonical_ids: Set<string>;
  source_type: RecipeCostSourceType;
  normalized_unit_cost: number;
  base_unit: string;
  normalized_cost_base_unit: string;
  observed_at: string | null;
  source_ref_table: string;
  source_ref_id: string;
  vendor_item_id: number | string | null;
  vendor_id: number | null;
  vendor_name: string | null;
  vendor_item_name: string | null;
  stale_flag: boolean;
  confidence_label: RecipeCostConfidenceLabel;
  inventory_scope_explanation: string | null;
  vendor_scope_explanation: string | null;
  effective_from: string | null;
  effective_to: string | null;
  evidence: EvidenceReference[];
}

function buildCandidateEvidence(
  recipe: RecipeCostBridgedRecipeDefinition,
  row: RecipeCostBridgedRecipeDefinition['source_rows'][number],
  sourceType: RecipeCostSourceType,
  sourceRefTable: string,
  sourceRefId: string,
): EvidenceReference[] {
  return [{
    source_table: sourceRefTable,
    source_primary_key: sourceRefId,
    source_type: sourceType,
    observed_at: row.vendor_cost_lineage?.effective_at ?? null,
    payload: {
      recipe_id: recipe.recipe.recipe_id,
      recipe_version_id: recipe.recipe.recipe_version_id ?? null,
      recipe_item_id: row.recipe_item_id,
      canonical_ingredient_id: row.canonical_ingredient_id ?? null,
      canonical_ingredient_name: row.canonical_ingredient_name ?? null,
      inventory_item_id: row.inventory_item_id,
      inventory_item_name: row.inventory_item_name,
      vendor_item_id: row.vendor_cost_lineage?.vendor_item_id ?? null,
      vendor_item_name: row.vendor_cost_lineage?.vendor_item_name ?? null,
      vendor_name: row.vendor_cost_lineage?.vendor_name ?? null,
      normalized_unit_cost: row.vendor_cost_lineage?.normalized_unit_cost ?? null,
      normalized_cost_base_unit: row.vendor_cost_lineage?.base_unit ?? row.base_unit,
      stale_flag: row.vendor_cost_lineage?.stale ?? false,
      inventory_scope_explanation: row.inventory_mapping_resolution?.explanation_text ?? null,
      vendor_scope_explanation: row.vendor_mapping_resolution?.explanation_text ?? null,
      vendor_lineage_explanation: row.vendor_cost_lineage?.explanation_text ?? null,
    },
  }];
}

function mapVendorLineageSourceType(sourceType: 'invoice_linked_cost' | 'vendor_price_history' | 'fallback_cost_record'): RecipeCostSourceType {
  if (sourceType === 'invoice_linked_cost') {
    return 'invoice_recent';
  }
  if (sourceType === 'fallback_cost_record') {
    return 'manual_override';
  }
  return 'vendor_price_history';
}

function mapConfidenceLabel(confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW'): RecipeCostConfidenceLabel {
  if (confidenceLabel === 'HIGH') {
    return 'high';
  }
  if (confidenceLabel === 'MEDIUM') {
    return 'medium';
  }
  return 'low';
}
