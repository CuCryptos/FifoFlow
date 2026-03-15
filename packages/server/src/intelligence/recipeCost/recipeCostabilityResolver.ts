import type { IntelligenceJobContext } from '../types.js';
import { resolveCanonicalInventoryItem } from '../../mapping/inventory/canonicalInventoryResolver.js';
import { resolveVendorCostLineage } from '../../mapping/vendor/inventoryVendorResolver.js';
import type {
  PromotedRecipeSourceRecord,
  PromotedRecipeSourceRow,
  RecipeCostBridgedRecipeDefinition,
  RecipeCostInventoryResolutionDependencies,
  RecipeCostSourceRow,
  RecipeCostabilityBlockingReason,
  RecipeCostabilitySummary,
  ResolvedInventoryMappingResult,
  ResolvedVendorCostLineageResult,
  ResolvedVendorMappingResult,
} from './types.js';

export async function resolvePromotedRecipeForCosting(
  recipe: PromotedRecipeSourceRecord,
  context: IntelligenceJobContext,
  dependencies: RecipeCostInventoryResolutionDependencies,
): Promise<RecipeCostBridgedRecipeDefinition> {
  const ingredientRows = await dependencies.operationalRepository.listPromotedRecipeIngredients(recipe.recipe_version_id);
  const subjectScope = buildRecipeCostSubjectScope(context);
  const sourceRows: RecipeCostSourceRow[] = [];
  const blockingReasons: RecipeCostabilityBlockingReason[] = [];

  for (const ingredient of ingredientRows) {
    const row = await resolvePromotedRecipeSourceRow(ingredient, subjectScope, context.now, dependencies);
    sourceRows.push(row);

    if (row.costability_status === 'MISSING_CANONICAL_INGREDIENT') {
      blockingReasons.push({
        code: 'MISSING_CANONICAL_INGREDIENT',
        recipe_item_id: row.recipe_item_id,
        line_index: row.line_index,
        message: row.resolution_explanation,
      });
    }

    if (row.costability_status === 'MISSING_SCOPED_INVENTORY_MAPPING') {
      blockingReasons.push({
        code: 'MISSING_SCOPED_INVENTORY_MAPPING',
        recipe_item_id: row.recipe_item_id,
        line_index: row.line_index,
        message: row.resolution_explanation,
      });
    }

    if (row.costability_status === 'MISSING_SCOPED_VENDOR_MAPPING') {
      blockingReasons.push({
        code: 'MISSING_SCOPED_VENDOR_MAPPING',
        recipe_item_id: row.recipe_item_id,
        line_index: row.line_index,
        message: row.resolution_explanation,
      });
    }

    if (row.costability_status === 'MISSING_VENDOR_COST_LINEAGE') {
      blockingReasons.push({
        code: 'MISSING_VENDOR_COST_LINEAGE',
        recipe_item_id: row.recipe_item_id,
        line_index: row.line_index,
        message: row.resolution_explanation,
      });
    }
  }

  const resolvedRows = sourceRows.filter((row) => row.costability_status === 'RESOLVED_FOR_COSTING').length;
  const unresolvedRows = sourceRows.length - resolvedRows;
  const costablePercent = sourceRows.length === 0 ? 0 : Number(((resolvedRows / sourceRows.length) * 100).toFixed(2));

  const costabilitySummary: RecipeCostabilitySummary = {
    recipe_id: recipe.recipe_id,
    recipe_version_id: recipe.recipe_version_id,
    total_rows: sourceRows.length,
    resolved_rows: resolvedRows,
    unresolved_rows: unresolvedRows,
    costable_percent: costablePercent,
    classification: blockingReasons.some((reason) => reason.code === 'MISSING_CANONICAL_INGREDIENT')
      ? 'BLOCKED_FOR_COSTING'
      : unresolvedRows > 0
        ? 'OPERATIONAL_ONLY'
        : 'COSTABLE_NOW',
    blocking_reasons: blockingReasons,
  };

  return {
    recipe: {
      recipe_id: recipe.recipe_id,
      recipe_version_id: Number(recipe.recipe_version_id),
      recipe_name: recipe.recipe_name,
      recipe_type: recipe.recipe_type,
      yield_qty: recipe.yield_qty,
      yield_unit: recipe.yield_unit,
      serving_count: recipe.serving_count,
      ingredients: sourceRows.map((row) => ({
        recipe_item_id: row.recipe_item_id,
        line_index: row.line_index,
        raw_ingredient_text: row.raw_ingredient_text,
        canonical_ingredient_id: row.canonical_ingredient_id,
        canonical_ingredient_name: row.canonical_ingredient_name,
        inventory_item_id: row.inventory_item_id,
        inventory_item_name: row.inventory_item_name,
        quantity: row.quantity,
        unit: row.unit,
        base_unit: row.base_unit,
        costability_status: row.costability_status,
        inventory_mapping_resolution: row.inventory_mapping_resolution,
        vendor_mapping_resolution: row.vendor_mapping_resolution,
        vendor_cost_lineage: row.vendor_cost_lineage,
      })),
    },
    source_rows: sourceRows,
    costability_summary: costabilitySummary,
  };
}

export async function resolvePromotedRecipeSourceRow(
  ingredient: PromotedRecipeSourceRow,
  subjectScope: ReturnType<typeof buildRecipeCostSubjectScope>,
  effectiveAt: string,
  dependencies: RecipeCostInventoryResolutionDependencies,
): Promise<RecipeCostSourceRow> {
  if (ingredient.canonical_ingredient_id == null) {
    return {
      recipe_item_id: ingredient.recipe_item_id,
      line_index: ingredient.line_index,
      raw_ingredient_text: ingredient.raw_ingredient_text,
      canonical_ingredient_id: null,
      canonical_ingredient_name: null,
      inventory_item_id: null,
      inventory_item_name: ingredient.raw_ingredient_text,
      quantity: ingredient.quantity_normalized,
      unit: ingredient.unit_normalized,
      base_unit: ingredient.unit_normalized,
      preparation_note: ingredient.preparation_note,
      costability_status: 'MISSING_CANONICAL_INGREDIENT',
      resolution_explanation: `Recipe ingredient row ${ingredient.recipe_item_id} cannot be costed because no canonical ingredient identity was recorded.`,
      inventory_mapping_resolution: null,
      vendor_mapping_resolution: null,
      vendor_cost_lineage: null,
    };
  }

  const canonicalName = await dependencies.operationalRepository.getCanonicalIngredientName(ingredient.canonical_ingredient_id);
  const mapping = await resolveCanonicalInventoryItem(
    {
      canonical_ingredient_id: ingredient.canonical_ingredient_id,
      subject_scope: subjectScope,
    },
    dependencies.inventoryRepository,
  );

  const resolvedMapping: ResolvedInventoryMappingResult = {
    canonical_ingredient_id: ingredient.canonical_ingredient_id,
    inventory_item_id: mapping.inventory_item_id == null ? null : Number(mapping.inventory_item_id),
    inventory_item_name: mapping.inventory_item_name,
    inventory_item_unit: mapping.inventory_item_unit,
    mapping_status: mapping.mapping_status,
    confidence_label: mapping.confidence_label,
    match_reason: mapping.match_reason,
    explanation_text: mapping.explanation_text,
    matched_scope_type: mapping.matched_scope_type,
    matched_scope_ref_id: mapping.matched_scope_ref_id,
    preferred_flag: mapping.preferred_flag,
    trusted: mapping.trusted,
  };

  if (!mapping.trusted || mapping.inventory_item_id == null) {
    return {
      recipe_item_id: ingredient.recipe_item_id,
      line_index: ingredient.line_index,
      raw_ingredient_text: ingredient.raw_ingredient_text,
      canonical_ingredient_id: ingredient.canonical_ingredient_id,
      canonical_ingredient_name: canonicalName,
      inventory_item_id: null,
      inventory_item_name: canonicalName ?? ingredient.raw_ingredient_text,
      quantity: ingredient.quantity_normalized,
      unit: ingredient.unit_normalized,
      base_unit: ingredient.unit_normalized,
      preparation_note: ingredient.preparation_note,
      costability_status: 'MISSING_SCOPED_INVENTORY_MAPPING',
      resolution_explanation: mapping.explanation_text,
      inventory_mapping_resolution: resolvedMapping,
      vendor_mapping_resolution: null,
      vendor_cost_lineage: null,
    };
  }

  const vendorCostLineage = await resolveVendorCostLineage({
    inventory_item_id: mapping.inventory_item_id,
    subject_scope: subjectScope,
    effective_at: effectiveAt,
  }, dependencies.vendorRepository);

  const resolvedVendorMapping: ResolvedVendorMappingResult = {
    inventory_item_id: vendorCostLineage.mapping_resolution.inventory_item_id,
    vendor_item_id: vendorCostLineage.mapping_resolution.vendor_item_id,
    vendor_id: vendorCostLineage.mapping_resolution.vendor_id,
    vendor_name: vendorCostLineage.mapping_resolution.vendor_name,
    vendor_item_name: vendorCostLineage.mapping_resolution.vendor_item_name,
    mapping_status: vendorCostLineage.mapping_resolution.mapping_status,
    confidence_label: vendorCostLineage.mapping_resolution.confidence_label,
    match_reason: vendorCostLineage.mapping_resolution.match_reason,
    explanation_text: vendorCostLineage.mapping_resolution.explanation_text,
    matched_scope_type: vendorCostLineage.mapping_resolution.matched_scope_type,
    matched_scope_ref_id: vendorCostLineage.mapping_resolution.matched_scope_ref_id,
    preferred_flag: vendorCostLineage.mapping_resolution.preferred_flag,
    trusted: vendorCostLineage.mapping_resolution.trusted,
  };

  const resolvedVendorCostLineage: ResolvedVendorCostLineageResult = {
    inventory_item_id: vendorCostLineage.inventory_item_id,
    vendor_item_id: vendorCostLineage.vendor_item_id,
    vendor_id: vendorCostLineage.vendor_id,
    vendor_name: vendorCostLineage.vendor_name,
    vendor_item_name: vendorCostLineage.vendor_item_name,
    normalized_unit_cost: vendorCostLineage.normalized_unit_cost,
    base_unit: vendorCostLineage.base_unit,
    source_type: vendorCostLineage.source_type,
    source_ref_table: vendorCostLineage.source_ref_table,
    source_ref_id: vendorCostLineage.source_ref_id,
    effective_at: vendorCostLineage.effective_at,
    stale_at: vendorCostLineage.stale_at,
    stale: vendorCostLineage.stale,
    confidence_label: vendorCostLineage.confidence_label,
    explanation_text: vendorCostLineage.explanation_text,
    vendor_mapping_resolution: resolvedVendorMapping,
  };

  if (!vendorCostLineage.mapping_resolution.trusted || vendorCostLineage.vendor_item_id == null) {
    return {
      recipe_item_id: ingredient.recipe_item_id,
      line_index: ingredient.line_index,
      raw_ingredient_text: ingredient.raw_ingredient_text,
      canonical_ingredient_id: ingredient.canonical_ingredient_id,
      canonical_ingredient_name: canonicalName,
      inventory_item_id: Number(mapping.inventory_item_id),
      inventory_item_name: mapping.inventory_item_name ?? canonicalName ?? ingredient.raw_ingredient_text,
      quantity: ingredient.quantity_normalized,
      unit: ingredient.unit_normalized,
      base_unit: mapping.inventory_item_unit ?? ingredient.unit_normalized,
      preparation_note: ingredient.preparation_note,
      costability_status: 'MISSING_SCOPED_VENDOR_MAPPING',
      resolution_explanation: vendorCostLineage.explanation_text,
      inventory_mapping_resolution: resolvedMapping,
      vendor_mapping_resolution: resolvedVendorMapping,
      vendor_cost_lineage: resolvedVendorCostLineage,
    };
  }

  if (vendorCostLineage.source_type === 'missing' || vendorCostLineage.normalized_unit_cost == null) {
    return {
      recipe_item_id: ingredient.recipe_item_id,
      line_index: ingredient.line_index,
      raw_ingredient_text: ingredient.raw_ingredient_text,
      canonical_ingredient_id: ingredient.canonical_ingredient_id,
      canonical_ingredient_name: canonicalName,
      inventory_item_id: Number(mapping.inventory_item_id),
      inventory_item_name: mapping.inventory_item_name ?? canonicalName ?? ingredient.raw_ingredient_text,
      quantity: ingredient.quantity_normalized,
      unit: ingredient.unit_normalized,
      base_unit: mapping.inventory_item_unit ?? ingredient.unit_normalized,
      preparation_note: ingredient.preparation_note,
      costability_status: 'MISSING_VENDOR_COST_LINEAGE',
      resolution_explanation: vendorCostLineage.explanation_text,
      inventory_mapping_resolution: resolvedMapping,
      vendor_mapping_resolution: resolvedVendorMapping,
      vendor_cost_lineage: resolvedVendorCostLineage,
    };
  }

  return {
    recipe_item_id: ingredient.recipe_item_id,
    line_index: ingredient.line_index,
    raw_ingredient_text: ingredient.raw_ingredient_text,
    canonical_ingredient_id: ingredient.canonical_ingredient_id,
    canonical_ingredient_name: canonicalName,
    inventory_item_id: Number(mapping.inventory_item_id),
    inventory_item_name: mapping.inventory_item_name ?? canonicalName ?? ingredient.raw_ingredient_text,
    quantity: ingredient.quantity_normalized,
    unit: ingredient.unit_normalized,
    base_unit: vendorCostLineage.base_unit ?? mapping.inventory_item_unit ?? ingredient.unit_normalized,
    preparation_note: ingredient.preparation_note,
    costability_status: 'RESOLVED_FOR_COSTING',
    resolution_explanation: vendorCostLineage.explanation_text,
    inventory_mapping_resolution: resolvedMapping,
    vendor_mapping_resolution: resolvedVendorMapping,
    vendor_cost_lineage: resolvedVendorCostLineage,
  };
}

export function buildRecipeCostSubjectScope(context: IntelligenceJobContext) {
  return {
    organization_id: context.scope.organizationId ?? null,
    location_id: context.scope.locationId ?? null,
    operation_unit_id: context.scope.operationUnitId ?? null,
  };
}
