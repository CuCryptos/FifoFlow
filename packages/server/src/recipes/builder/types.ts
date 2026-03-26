import type {
  RecipeBuilderAlternativeMatch,
  RecipeBuilderCostabilityStatus,
  RecipeBuilderDraftRecipe,
  RecipeBuilderJob,
  RecipeBuilderParseStatus,
  RecipeBuilderParsedRow,
  RecipeBuilderResolutionRow,
  RecipeBuilderReviewStatus,
  RecipeType,
} from '@fifoflow/shared';
import type { CanonicalIngredientResolutionResult } from '../../mapping/ingredients/types.js';
import type { TemplateIngredientMappingStatus } from '../../mapping/templates/types.js';

export interface RecipeBuilderFreeformInput {
  source_type: 'freeform';
  draft_name?: string | null;
  draft_notes?: string | null;
  source_text: string;
  yield_quantity?: number | null;
  yield_unit?: string | null;
  serving_quantity?: number | null;
  serving_unit?: string | null;
  serving_count?: number | null;
  source_recipe_type?: RecipeType | null;
}

export interface RecipeBuilderTemplateInput {
  source_type: 'template';
  draft_name?: string | null;
  draft_notes?: string | null;
  source_template_id: number;
  source_template_version_id?: number | null;
  yield_quantity?: number | null;
  yield_unit?: string | null;
  serving_quantity?: number | null;
  serving_unit?: string | null;
  serving_count?: number | null;
  source_recipe_type?: RecipeType | null;
}

export type RecipeBuilderRequest = RecipeBuilderFreeformInput | RecipeBuilderTemplateInput;

export interface RecipeBuilderRunOptions {
  job_id?: number | string;
}

export interface RecipeBuilderTemplateSourceRow {
  template_id: number;
  template_name: string;
  template_category: string;
  template_version_id: number;
  template_version_number: number;
  ingredient_name: string;
  qty: number;
  unit: string;
  sort_order: number;
  mapped_canonical_ingredient_id: number | string | null;
  mapped_canonical_name: string | null;
  template_mapping_status: TemplateIngredientMappingStatus | null;
}

export interface RecipeIngredientParseResult {
  raw_line_text: string;
  quantity_raw: string | null;
  quantity_normalized: number | null;
  unit_raw: string | null;
  unit_normalized: string | null;
  ingredient_text: string | null;
  preparation_note: string | null;
  parse_status: RecipeBuilderParseStatus;
  parser_confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  explanation_text: string;
}

export interface RecipeBuilderParsedInputRow {
  line_index: number;
  raw_line_text: string;
  parsed: RecipeIngredientParseResult;
  source_kind: 'freeform' | 'template';
  template_context?: RecipeBuilderTemplateSourceRow | null;
}

export interface RecipeBuilderInventoryMappingResult {
  inventory_item_id: number | string | null;
  inventory_mapping_status: 'UNMAPPED' | 'MAPPED' | 'NEEDS_REVIEW' | 'SKIPPED';
  explanation_text: string;
}

export interface RecipeBuilderInventoryMapper {
  mapToInventoryItem?(input: {
    parsed_row: RecipeBuilderParsedInputRow;
    canonical_resolution: CanonicalIngredientResolutionResult | null;
  }): Promise<RecipeBuilderInventoryMappingResult>;
}

export interface RecipeBuilderResolvedRow {
  parsed_row: RecipeBuilderParsedRow;
  resolution_row: RecipeBuilderResolutionRow;
}

export interface RecipeBuilderSource {
  createJob(input: RecipeBuilderRequest): Promise<RecipeBuilderJob>;
  getJob(jobId: number | string): Promise<RecipeBuilderJob | null>;
  listTemplateSourceRows(templateId: number, templateVersionId?: number | null): Promise<RecipeBuilderTemplateSourceRow[]>;
}

export interface RecipeBuilderPersistenceRepository {
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
  getJob(jobId: number | string): Promise<RecipeBuilderJob | null>;
  updateJobStatus(jobId: number | string, status: RecipeBuilderJob['status']): Promise<RecipeBuilderJob>;
  replaceParsedRows(
    jobId: number | string,
    rows: Array<Omit<RecipeBuilderParsedRow, 'id' | 'recipe_builder_job_id' | 'created_at' | 'updated_at'>>,
  ): Promise<RecipeBuilderParsedRow[]>;
  replaceResolutionRows(
    jobId: number | string,
    rows: Array<Omit<RecipeBuilderResolutionRow, 'id' | 'recipe_builder_job_id' | 'created_at' | 'updated_at'>>,
  ): Promise<RecipeBuilderResolutionRow[]>;
  upsertDraftRecipe(
    draft: Omit<RecipeBuilderDraftRecipe, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<{ action: 'created' | 'updated'; record: RecipeBuilderDraftRecipe }>;
  listParsedRows(jobId: number | string): Promise<RecipeBuilderParsedRow[]>;
  listResolutionRows(jobId: number | string): Promise<RecipeBuilderResolutionRow[]>;
  getDraftRecipe(jobId: number | string): Promise<RecipeBuilderDraftRecipe | null>;
  findItemMatchCandidates?(input: string): Promise<RecipeBuilderAlternativeMatch[]>;
  findRecipeMatchCandidates?(input: string): Promise<Array<RecipeBuilderAlternativeMatch & {
    recipe_id: number | string;
    recipe_version_id: number | string | null;
  }>>;
}

export interface RecipeBuilderDependencies {
  source: RecipeBuilderSource;
  repository: RecipeBuilderPersistenceRepository;
  canonicalResolver: {
    resolve(input: string): Promise<CanonicalIngredientResolutionResult>;
  };
  inventoryMapper?: RecipeBuilderInventoryMapper;
}

export interface RecipeBuilderRunSummary {
  parsed_rows_created: number;
  parsed_rows_total: number;
  ready_rows: number;
  review_rows: number;
  blocked_rows: number;
  unresolved_canonical_rows: number;
  unresolved_inventory_rows: number;
}

export interface RecipeBuilderExecutionResult {
  job: RecipeBuilderJob;
  parsed_rows: RecipeBuilderParsedRow[];
  resolution_rows: RecipeBuilderResolutionRow[];
  draft_recipe: RecipeBuilderDraftRecipe;
  run_summary: RecipeBuilderRunSummary;
  notes: string[];
}

export function deriveDraftCompletenessStatus(input: {
  blockedRows: number;
  reviewRows: number;
  unresolvedCanonicalRows: number;
  hasYield: boolean;
  requiresServingMath?: boolean;
  hasServingMath?: boolean;
}): RecipeBuilderReviewStatus {
  if (input.blockedRows > 0) {
    return 'BLOCKED';
  }
  if (input.reviewRows > 0 || input.unresolvedCanonicalRows > 0) {
    return 'NEEDS_REVIEW';
  }
  if (input.requiresServingMath && !input.hasServingMath) {
    return 'INCOMPLETE';
  }
  if (!input.hasYield) {
    return 'INCOMPLETE';
  }
  return 'READY';
}

export function deriveCostabilityStatus(input: {
  completenessStatus: RecipeBuilderReviewStatus;
  unresolvedInventoryRows: number;
  unresolvedCanonicalRows: number;
}): RecipeBuilderCostabilityStatus {
  if (input.completenessStatus === 'READY' && input.unresolvedCanonicalRows === 0 && input.unresolvedInventoryRows === 0) {
    return 'COSTABLE';
  }
  if (input.completenessStatus === 'BLOCKED') {
    return 'NOT_COSTABLE';
  }
  return 'NEEDS_REVIEW';
}
