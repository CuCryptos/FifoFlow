import type {
  RecipeBuilderDraftRecipe,
  RecipeBuilderJob,
  RecipeBuilderParsedRow,
  RecipeBuilderResolutionRow,
} from '@fifoflow/shared';
import type { CanonicalIngredientResolutionResult } from '../../mapping/ingredients/types.js';
import {
  deriveCostabilityStatus,
  deriveDraftCompletenessStatus,
  type RecipeBuilderDependencies,
  type RecipeBuilderExecutionResult,
  type RecipeBuilderParsedInputRow,
  type RecipeBuilderRequest,
  type RecipeBuilderRunOptions,
  type RecipeBuilderTemplateSourceRow,
} from './types.js';
import { parseRecipeIngredientLine, segmentRecipeSourceText } from './recipeIngredientParser.js';

export async function runRecipeBuilder(
  request: RecipeBuilderRequest,
  dependencies: RecipeBuilderDependencies,
  options: RecipeBuilderRunOptions = {},
): Promise<RecipeBuilderExecutionResult> {
  const job = options.job_id
    ? await dependencies.source.getJob(options.job_id) ?? await dependencies.source.createJob(request)
    : await dependencies.source.createJob(request);

  return executeRecipeBuilderJob(job, request, dependencies);
}

export async function executeRecipeBuilderJob(
  job: RecipeBuilderJob,
  request: RecipeBuilderRequest,
  dependencies: RecipeBuilderDependencies,
): Promise<RecipeBuilderExecutionResult> {
  const notes: string[] = [];

  return dependencies.repository.withTransaction(async () => {
    const parsedInputRows = request.source_type === 'freeform'
      ? buildFreeformParsedRows(request.source_text)
      : await buildTemplateParsedRows(request.source_template_id, request.source_template_version_id ?? null, dependencies);

    if (parsedInputRows.length === 0) {
      notes.push('No ingredient rows were available to assemble into a draft recipe.');
    }

    await dependencies.repository.updateJobStatus(job.id, 'PARSED');

    const persistedParsedRows = await dependencies.repository.replaceParsedRows(
      job.id,
      parsedInputRows.map((row) => ({
        line_index: row.line_index,
        raw_line_text: row.raw_line_text,
        quantity_raw: row.parsed.quantity_raw,
        quantity_normalized: row.parsed.quantity_normalized,
        unit_raw: row.parsed.unit_raw,
        unit_normalized: row.parsed.unit_normalized,
        ingredient_text: row.parsed.ingredient_text,
        preparation_note: row.parsed.preparation_note,
        parse_status: row.parsed.parse_status,
        parser_confidence: row.parsed.parser_confidence,
        explanation_text: row.parsed.explanation_text,
      })),
    );

    const parsedByIndex = new Map(persistedParsedRows.map((row) => [row.line_index, row]));
    const resolutionInputs = await Promise.all(parsedInputRows.map(async (row) => {
      const parsedRow = parsedByIndex.get(row.line_index);
      if (!parsedRow) {
        throw new Error(`Missing persisted parsed row for line ${row.line_index}.`);
      }
      const canonicalResolution = await resolveCanonicalForInputRow(row, dependencies);
      return buildResolutionRow(job, parsedRow, row, canonicalResolution, dependencies);
    }));

    const persistedResolutionRows = await dependencies.repository.replaceResolutionRows(
      job.id,
      resolutionInputs.map((row) => ({
        parsed_row_id: row.parsed_row_id,
        canonical_ingredient_id: row.canonical_ingredient_id,
        canonical_match_status: row.canonical_match_status,
        canonical_confidence: row.canonical_confidence,
        canonical_match_reason: row.canonical_match_reason,
        inventory_item_id: row.inventory_item_id,
        inventory_mapping_status: row.inventory_mapping_status,
        quantity_normalization_status: row.quantity_normalization_status,
        review_status: row.review_status,
        explanation_text: row.explanation_text,
      })),
    );

    const blockedRows = persistedResolutionRows.filter((row) => row.review_status === 'BLOCKED').length;
    const reviewRows = persistedResolutionRows.filter((row) => row.review_status === 'NEEDS_REVIEW').length;
    const readyRows = persistedResolutionRows.filter((row) => row.review_status === 'READY').length;
    const unresolvedCanonicalRows = persistedResolutionRows.filter((row) => row.canonical_ingredient_id == null).length;
    const unresolvedInventoryRows = persistedResolutionRows.filter((row) => row.inventory_mapping_status !== 'MAPPED').length;
    const hasYield = (request.yield_quantity ?? null) != null && (request.yield_unit ?? null) != null;
    const completenessStatus = deriveDraftCompletenessStatus({
      blockedRows,
      reviewRows,
      unresolvedCanonicalRows,
      hasYield,
    });
    const costabilityStatus = deriveCostabilityStatus({
      completenessStatus,
      unresolvedInventoryRows,
      unresolvedCanonicalRows,
    });

    const draftUpsert = await dependencies.repository.upsertDraftRecipe({
      recipe_builder_job_id: job.id,
      draft_name: request.draft_name ?? deriveDraftName(request, parsedInputRows),
      yield_quantity: request.yield_quantity ?? null,
      yield_unit: request.yield_unit ?? null,
      completeness_status: completenessStatus,
      costability_status: costabilityStatus,
      ingredient_row_count: persistedParsedRows.length,
      ready_row_count: readyRows,
      review_row_count: reviewRows,
      blocked_row_count: blockedRows,
      unresolved_canonical_count: unresolvedCanonicalRows,
      unresolved_inventory_count: unresolvedInventoryRows,
      source_recipe_type: request.source_recipe_type ?? null,
    });

    const finalStatus: RecipeBuilderJob['status'] = blockedRows > 0
      ? 'BLOCKED'
      : reviewRows > 0 || completenessStatus === 'INCOMPLETE'
        ? 'NEEDS_REVIEW'
        : 'ASSEMBLED';
    const finalJob = await dependencies.repository.updateJobStatus(job.id, finalStatus);

    return {
      job: finalJob,
      parsed_rows: persistedParsedRows,
      resolution_rows: persistedResolutionRows,
      draft_recipe: draftUpsert.record,
      run_summary: {
        parsed_rows_created: persistedParsedRows.length,
        parsed_rows_total: persistedParsedRows.length,
        ready_rows: readyRows,
        review_rows: reviewRows,
        blocked_rows: blockedRows,
        unresolved_canonical_rows: unresolvedCanonicalRows,
        unresolved_inventory_rows: unresolvedInventoryRows,
      },
      notes,
    };
  });
}

function buildFreeformParsedRows(sourceText: string): RecipeBuilderParsedInputRow[] {
  return segmentRecipeSourceText(sourceText).map((line, index) => ({
    line_index: index + 1,
    raw_line_text: line,
    parsed: parseRecipeIngredientLine(line),
    source_kind: 'freeform',
    template_context: null,
  }));
}

async function buildTemplateParsedRows(
  templateId: number,
  templateVersionId: number | null,
  dependencies: RecipeBuilderDependencies,
): Promise<RecipeBuilderParsedInputRow[]> {
  const templateRows = await dependencies.source.listTemplateSourceRows(templateId, templateVersionId);
  return templateRows.map((row, index) => ({
    line_index: index + 1,
    raw_line_text: `${trimNumber(row.qty)} ${row.unit} ${row.ingredient_name}`,
    parsed: {
      raw_line_text: `${trimNumber(row.qty)} ${row.unit} ${row.ingredient_name}`,
      quantity_raw: trimNumber(row.qty),
      quantity_normalized: row.qty,
      unit_raw: row.unit,
      unit_normalized: row.unit,
      ingredient_text: row.ingredient_name,
      preparation_note: null,
      parse_status: 'PARSED',
      parser_confidence: 'HIGH',
      explanation_text: 'The row was seeded from a structured recipe template ingredient record.',
    },
    source_kind: 'template',
    template_context: row,
  }));
}

async function resolveCanonicalForInputRow(
  inputRow: RecipeBuilderParsedInputRow,
  dependencies: RecipeBuilderDependencies,
): Promise<CanonicalIngredientResolutionResult | null> {
  const ingredientText = inputRow.parsed.ingredient_text;
  if (!ingredientText) {
    return null;
  }

  if (
    inputRow.source_kind === 'template'
    && inputRow.template_context?.mapped_canonical_ingredient_id != null
    && (inputRow.template_context.template_mapping_status === 'AUTO_MAPPED' || inputRow.template_context.template_mapping_status === 'MANUALLY_MAPPED')
  ) {
    return {
      input: ingredientText,
      normalized_input: ingredientText,
      status: 'matched',
      matched_canonical_ingredient_id: inputRow.template_context.mapped_canonical_ingredient_id,
      matched_canonical_name: inputRow.template_context.mapped_canonical_name ?? ingredientText,
      match_reason: inputRow.template_context.template_mapping_status === 'MANUALLY_MAPPED' ? 'exact_alias' : 'exact_alias',
      confidence_label: 'high',
      explanation_text: 'Canonical ingredient identity was reused from the template ingredient mapping queue.',
      matches: [],
    };
  }

  return dependencies.canonicalResolver.resolve(ingredientText);
}

async function buildResolutionRow(
  job: RecipeBuilderJob,
  parsedRow: RecipeBuilderParsedRow,
  sourceRow: RecipeBuilderParsedInputRow,
  canonicalResolution: CanonicalIngredientResolutionResult | null,
  dependencies: RecipeBuilderDependencies,
): Promise<Omit<RecipeBuilderResolutionRow, 'id' | 'created_at' | 'updated_at'>> {
  const quantityStatus = deriveQuantityNormalizationStatus(parsedRow);
  if (parsedRow.parse_status === 'FAILED') {
    return {
      parsed_row_id: parsedRow.id,
      recipe_builder_job_id: job.id,
      canonical_ingredient_id: null,
      canonical_match_status: 'skipped',
      canonical_confidence: 'LOW',
      canonical_match_reason: null,
      inventory_item_id: null,
      inventory_mapping_status: 'SKIPPED',
      quantity_normalization_status: quantityStatus,
      review_status: 'BLOCKED',
      explanation_text: 'The ingredient line could not be parsed safely, so canonical and inventory resolution were skipped.',
    };
  }

  const canonicalMatchStatus = canonicalResolution?.status ?? 'skipped';
  const canonicalConfidence = canonicalResolution == null
    ? 'LOW'
    : canonicalResolution.status === 'matched'
      ? 'HIGH'
      : 'LOW';
  const canonicalIngredientId = canonicalResolution?.status === 'matched'
    ? canonicalResolution.matched_canonical_ingredient_id
    : null;

  const inventoryResolution = canonicalIngredientId != null && dependencies.inventoryMapper?.mapToInventoryItem
    ? await dependencies.inventoryMapper.mapToInventoryItem({
        parsed_row: sourceRow,
        canonical_resolution: canonicalResolution,
      })
    : canonicalIngredientId != null
      ? {
          inventory_item_id: null,
          inventory_mapping_status: 'UNMAPPED' as const,
          explanation_text: 'No inventory item mapping hook is configured yet for recipe builder rows.',
        }
      : {
          inventory_item_id: null,
          inventory_mapping_status: canonicalMatchStatus === 'skipped' ? 'SKIPPED' as const : 'NEEDS_REVIEW' as const,
          explanation_text: 'Inventory item mapping is deferred until canonical ingredient identity is resolved.',
        };

  const reviewStatus = deriveReviewStatus(parsedRow, canonicalMatchStatus, quantityStatus);
  const explanations = [parsedRow.explanation_text];
  if (canonicalResolution) {
    explanations.push(canonicalResolution.explanation_text);
  }
  explanations.push(inventoryResolution.explanation_text);

  return {
    parsed_row_id: parsedRow.id,
    recipe_builder_job_id: job.id,
    canonical_ingredient_id: canonicalIngredientId,
    canonical_match_status: canonicalMatchStatus,
    canonical_confidence: canonicalConfidence,
    canonical_match_reason: canonicalResolution ? translateCanonicalReason(canonicalResolution.match_reason) : null,
    inventory_item_id: inventoryResolution.inventory_item_id,
    inventory_mapping_status: inventoryResolution.inventory_mapping_status,
    quantity_normalization_status: quantityStatus,
    review_status: reviewStatus,
    explanation_text: explanations.join(' '),
  };
}

function deriveDraftName(request: RecipeBuilderRequest, parsedRows: RecipeBuilderParsedInputRow[]): string {
  if (request.source_type === 'template') {
    return parsedRows[0]?.template_context?.template_name ?? 'Draft Recipe';
  }
  return request.draft_name ?? 'Draft Recipe';
}

function deriveQuantityNormalizationStatus(
  parsedRow: RecipeBuilderParsedRow,
): RecipeBuilderResolutionRow['quantity_normalization_status'] {
  if (parsedRow.parse_status === 'FAILED') {
    return 'FAILED';
  }
  if (parsedRow.quantity_normalized != null && parsedRow.unit_normalized) {
    return 'NORMALIZED';
  }
  if (parsedRow.parse_status === 'PARTIAL') {
    return 'PARTIAL';
  }
  return 'NEEDS_REVIEW';
}

function deriveReviewStatus(
  parsedRow: RecipeBuilderParsedRow,
  canonicalMatchStatus: RecipeBuilderResolutionRow['canonical_match_status'],
  quantityStatus: RecipeBuilderResolutionRow['quantity_normalization_status'],
): RecipeBuilderResolutionRow['review_status'] {
  if (parsedRow.parse_status === 'FAILED') {
    return 'BLOCKED';
  }
  if (quantityStatus === 'FAILED') {
    return 'BLOCKED';
  }
  if (canonicalMatchStatus === 'ambiguous' || canonicalMatchStatus === 'no_match') {
    return 'NEEDS_REVIEW';
  }
  if (parsedRow.parse_status === 'PARTIAL' || parsedRow.parse_status === 'NEEDS_REVIEW') {
    return 'NEEDS_REVIEW';
  }
  if (quantityStatus === 'PARTIAL' || quantityStatus === 'NEEDS_REVIEW') {
    return 'NEEDS_REVIEW';
  }
  return 'READY';
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function translateCanonicalReason(reason: CanonicalIngredientResolutionResult['match_reason']): string {
  switch (reason) {
    case 'exact_canonical':
      return 'exact_canonical_name';
    case 'normalized_canonical':
      return 'normalized_canonical_name';
    case 'exact_alias':
      return 'exact_alias';
    case 'normalized_alias':
      return 'normalized_alias';
    case 'ambiguous':
      return 'ambiguous_match';
    case 'no_match':
      return 'no_match';
    default:
      return 'no_match';
  }
}
