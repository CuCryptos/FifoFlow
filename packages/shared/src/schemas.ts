import { z } from 'zod';
import { CATEGORIES, UNITS, TRANSACTION_TYPES, TRANSACTION_REASONS } from './constants.js';

export const createItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.enum(CATEGORIES),
  unit: z.enum(UNITS),
  order_unit: z.enum(UNITS).nullable().optional(),
  order_unit_price: z.number().min(0).nullable().optional(),
  qty_per_unit: z.number().min(0).nullable().optional(),
  inner_unit: z.enum(UNITS).nullable().optional(),
  item_size_value: z.number().min(0).nullable().optional(),
  item_size_unit: z.enum(UNITS).nullable().optional(),
  item_size: z.string().max(100).nullable().optional(), // legacy field
  reorder_level: z.number().min(0).nullable().optional(),
  reorder_qty: z.number().min(0).nullable().optional(),
  vendor_id: z.number().int().positive().nullable().optional(),
  venue_id: z.number().int().positive().nullable().optional(),
  storage_area_id: z.number().int().positive().nullable().optional(),
  sale_price: z.number().min(0).nullable().optional(),
});

export const updateItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).optional(),
  category: z.enum(CATEGORIES).optional(),
  unit: z.enum(UNITS).optional(),
  current_qty: z.number().min(0).optional(),
  order_unit: z.enum(UNITS).nullable().optional(),
  order_unit_price: z.number().min(0).nullable().optional(),
  qty_per_unit: z.number().min(0).nullable().optional(),
  inner_unit: z.enum(UNITS).nullable().optional(),
  item_size_value: z.number().min(0).nullable().optional(),
  item_size_unit: z.enum(UNITS).nullable().optional(),
  item_size: z.string().max(100).nullable().optional(), // legacy field
  reorder_level: z.number().min(0).nullable().optional(),
  reorder_qty: z.number().min(0).nullable().optional(),
  vendor_id: z.number().int().positive().nullable().optional(),
  venue_id: z.number().int().positive().nullable().optional(),
  storage_area_id: z.number().int().positive().nullable().optional(),
  sale_price: z.number().min(0).nullable().optional(),
});

export const createTransactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  quantity: z.number().positive('Quantity must be positive'),
  unit: z.enum(UNITS).optional(),
  reason: z.enum(TRANSACTION_REASONS),
  notes: z.string().max(500).nullable().optional(),
  from_area_id: z.number().int().positive().nullable().optional(),
  to_area_id: z.number().int().positive().nullable().optional(),
  vendor_price_id: z.number().int().positive().nullable().optional(),
}).superRefine((data, ctx) => {
  const noteRequiredReasons = new Set(['Wasted', 'Adjustment', 'Transferred']);
  if (noteRequiredReasons.has(data.reason)) {
    const hasNotes = typeof data.notes === 'string' && data.notes.trim().length > 0;
    if (!hasNotes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notes'],
        message: `Notes are required for ${data.reason} transactions.`,
      });
    }
  }
});

export const setItemCountSchema = z.object({
  counted_qty: z.number().min(0, 'Counted quantity cannot be negative'),
  notes: z.string().max(500).nullable().optional(),
});

export const createCountSessionSchema = z.object({
  name: z.string().min(1, 'Session name is required').max(120),
  template_category: z.enum(CATEGORIES).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const closeCountSessionSchema = z.object({
  force_close: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const recordCountEntrySchema = z.object({
  item_id: z.number().int().positive(),
  counted_qty: z.number().min(0, 'Counted quantity cannot be negative'),
  notes: z.string().max(500).nullable().optional(),
});

export const createStorageAreaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

export const updateStorageAreaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type SetItemCountInput = z.infer<typeof setItemCountSchema>;
export type CreateCountSessionInput = z.infer<typeof createCountSessionSchema>;
export type CloseCountSessionInput = z.infer<typeof closeCountSessionSchema>;
export type RecordCountEntryInput = z.infer<typeof recordCountEntrySchema>;
export const bulkUpdateItemsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
  updates: z.object({
    category: z.enum(CATEGORIES).optional(),
    vendor_id: z.number().int().positive().nullable().optional(),
    venue_id: z.number().int().positive().nullable().optional(),
    storage_area_id: z.number().int().positive().nullable().optional(),
  }).superRefine((updates, ctx) => {
    if (
      updates.category === undefined
      && updates.vendor_id === undefined
      && updates.venue_id === undefined
      && updates.storage_area_id === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one bulk update field is required.',
      });
    }
  }),
});

export const bulkDeleteItemsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

export const createVenueSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
});

export const updateVenueSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  show_in_menus: z.number().int().min(0).max(1).optional(),
});

export type CreateVenueInput = z.infer<typeof createVenueSchema>;
export type UpdateVenueInput = z.infer<typeof updateVenueSchema>;

export type CreateStorageAreaInput = z.infer<typeof createStorageAreaSchema>;
export type UpdateStorageAreaInput = z.infer<typeof updateStorageAreaSchema>;
export type BulkUpdateItemsInput = z.infer<typeof bulkUpdateItemsSchema>;
export type BulkDeleteItemsInput = z.infer<typeof bulkDeleteItemsSchema>;

export const createVendorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  notes: z.string().max(500).nullable().optional(),
});

export const updateVendorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const createOrderSchema = z.object({
  vendor_id: z.number().int().positive(),
  notes: z.string().max(500).nullable().optional(),
  items: z.array(z.object({
    item_id: z.number().int().positive(),
    quantity: z.number().positive(),
    unit: z.string().min(1),
    unit_price: z.number().min(0),
  })).min(1),
});

export const updateOrderSchema = z.object({
  notes: z.string().max(500).nullable().optional(),
  items: z.array(z.object({
    item_id: z.number().int().positive(),
    quantity: z.number().positive(),
    unit: z.string().min(1),
    unit_price: z.number().min(0),
  })).min(1).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['sent'] as const),
});

export const createVendorPriceSchema = z.object({
  vendor_id: z.number().int().positive(),
  vendor_item_name: z.string().max(200).nullable().optional(),
  order_unit: z.enum(UNITS).nullable().optional(),
  order_unit_price: z.number().min(0),
  qty_per_unit: z.number().min(0).nullable().optional(),
  is_default: z.boolean().optional().default(false),
});

export const updateVendorPriceSchema = z.object({
  vendor_item_name: z.string().max(200).nullable().optional(),
  order_unit: z.enum(UNITS).nullable().optional(),
  order_unit_price: z.number().min(0).optional(),
  qty_per_unit: z.number().min(0).nullable().optional(),
  is_default: z.boolean().optional(),
});

export const mergeItemsSchema = z.object({
  source_ids: z.array(z.number().int().positive()).min(1),
  target_id: z.number().int().positive(),
});

export type MergeItemsInput = z.infer<typeof mergeItemsSchema>;

const ALLERGEN_CATEGORIES = ['fda_major_9', 'extended', 'custom'] as const;
const ALLERGEN_STATUSES = ['contains', 'may_contain', 'free_of', 'unknown'] as const;
const ALLERGEN_CONFIDENCES = ['verified', 'high', 'moderate', 'low', 'unverified', 'unknown'] as const;
const ALLERGEN_SOURCE_TYPES = ['manufacturer_spec', 'vendor_declaration', 'staff_verified', 'label_scan', 'uploaded_chart', 'inferred'] as const;
const ALLERGY_MATCH_STATUSES = ['suggested', 'confirmed', 'rejected', 'no_match'] as const;
const RECIPE_ORIGINS = ['manual_entry', 'photo_ingestion', 'conversational', 'purchase_inference', 'prep_sheet', 'vendor_doc', 'pos_import'] as const;
const RECIPE_CONFIDENCE_LEVELS = ['draft', 'estimated', 'reviewed', 'verified', 'locked'] as const;
const RECIPE_CAPTURE_MODES = ['single_photo', 'photo_batch', 'conversation_batch', 'prep_sheet_batch', 'blitz'] as const;
const RECIPE_CAPTURE_INPUT_TYPES = ['photo', 'text', 'prep_sheet', 'vendor_doc'] as const;
const RECIPE_CAPTURE_INPUT_STATUSES = ['PENDING', 'PROCESSED', 'FAILED'] as const;
const RECIPE_ALTERNATIVE_MATCH_CONFIDENCES = ['HIGH', 'MEDIUM', 'LOW'] as const;
const RECIPE_MATCH_BASES = ['item_name', 'item_alias', 'recipe_name', 'recipe_alias', 'operator'] as const;
const RECIPE_COMPONENT_TYPES = ['inventory_item', 'sub_recipe', 'prep_component', 'unknown'] as const;
const RECIPE_MAPPING_STATUSES = ['UNMAPPED', 'MAPPED', 'NEEDS_REVIEW', 'SKIPPED'] as const;
const RECIPE_REVIEW_PRIORITIES = ['low', 'normal', 'high'] as const;
const RECIPE_INFERENCE_RUN_STATUSES = ['PENDING', 'COMPLETED', 'FAILED'] as const;
const ITEM_ALIAS_TYPES = ['chef_slang', 'vendor_name', 'common_name', 'abbreviation', 'menu_name', 'component_name'] as const;
const RECIPE_ALIAS_TYPES = ['chef_slang', 'abbreviation', 'old_name', 'component_name'] as const;

export const allergenCategorySchema = z.enum(ALLERGEN_CATEGORIES);
export const allergenStatusSchema = z.enum(ALLERGEN_STATUSES);
export const allergenConfidenceSchema = z.enum(ALLERGEN_CONFIDENCES);
export const allergenSourceTypeSchema = z.enum(ALLERGEN_SOURCE_TYPES);
export const allergyMatchStatusSchema = z.enum(ALLERGY_MATCH_STATUSES);
export const recipeOriginSchema = z.enum(RECIPE_ORIGINS);
export const recipeConfidenceLevelSchema = z.enum(RECIPE_CONFIDENCE_LEVELS);
export const recipeCaptureModeSchema = z.enum(RECIPE_CAPTURE_MODES);
export const recipeCaptureInputTypeSchema = z.enum(RECIPE_CAPTURE_INPUT_TYPES);
export const recipeCaptureInputStatusSchema = z.enum(RECIPE_CAPTURE_INPUT_STATUSES);
export const recipeAlternativeMatchConfidenceSchema = z.enum(RECIPE_ALTERNATIVE_MATCH_CONFIDENCES);
export const recipeMatchBasisSchema = z.enum(RECIPE_MATCH_BASES);
export const recipeDetectedComponentTypeSchema = z.enum(RECIPE_COMPONENT_TYPES);
export const recipeMappingStatusSchema = z.enum(RECIPE_MAPPING_STATUSES);
export const recipeReviewPrioritySchema = z.enum(RECIPE_REVIEW_PRIORITIES);
export const recipeInferenceRunStatusSchema = z.enum(RECIPE_INFERENCE_RUN_STATUSES);
export const itemAliasTypeSchema = z.enum(ITEM_ALIAS_TYPES);
export const recipeAliasTypeSchema = z.enum(RECIPE_ALIAS_TYPES);

export const allergenSchema = z.object({
  id: z.number().int().positive(),
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  category: allergenCategorySchema,
  icon: z.string().max(32).nullable(),
  sort_order: z.number().int(),
  is_active: z.number().int().min(0).max(1),
  created_at: z.string(),
  updated_at: z.string(),
});

export const itemAllergenSchema = z.object({
  id: z.number().int().positive(),
  item_id: z.number().int().positive(),
  allergen_id: z.number().int().positive(),
  status: allergenStatusSchema,
  confidence: allergenConfidenceSchema,
  notes: z.string().nullable(),
  verified_by: z.string().nullable(),
  verified_at: z.string().nullable(),
  last_reviewed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const allergenEvidenceSchema = z.object({
  id: z.number().int().positive(),
  item_allergen_id: z.number().int().positive(),
  source_type: allergenSourceTypeSchema,
  source_document_id: z.number().int().positive().nullable(),
  source_product_id: z.number().int().positive().nullable(),
  source_label: z.string().nullable(),
  source_excerpt: z.string().nullable(),
  status_claimed: allergenStatusSchema,
  confidence_claimed: allergenConfidenceSchema.nullable(),
  captured_by: z.string().nullable(),
  captured_at: z.string(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
});

export const allergyDocumentProductMatchSchema = z.object({
  id: z.number().int().positive(),
  document_product_id: z.number().int().positive(),
  item_id: z.number().int().positive(),
  match_status: allergyMatchStatusSchema,
  match_score: z.number().nullable(),
  matched_by: z.enum(['system', 'operator'] as const),
  notes: z.string().nullable(),
  active: z.number().int().min(0).max(1),
  created_at: z.string(),
  updated_at: z.string(),
});

export const recipeAllergenOverrideSchema = z.object({
  id: z.number().int().positive(),
  recipe_version_id: z.number().int().positive(),
  allergen_id: z.number().int().positive(),
  status: allergenStatusSchema,
  reason: z.string().min(1).max(2000),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const recipeAllergenRollupSchema = z.object({
  id: z.number().int().positive(),
  recipe_version_id: z.number().int().positive(),
  allergen_id: z.number().int().positive(),
  worst_status: allergenStatusSchema,
  min_confidence: allergenConfidenceSchema,
  source_item_ids: z.array(z.number().int().positive()),
  source_paths: z.array(z.string().min(1)),
  needs_review: z.number().int().min(0).max(1),
  computed_at: z.string(),
});

export const allergenQueryAuditSchema = z.object({
  id: z.number().int().positive(),
  venue_id: z.number().int().positive().nullable(),
  query_text: z.string().min(1).max(4000),
  allergen_codes: z.array(z.string().min(1)),
  response_summary: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
});

export const upsertItemAllergenProfileSchema = z.object({
  item_id: z.number().int().positive(),
  allergens: z.array(z.object({
    allergen_id: z.number().int().positive(),
    status: allergenStatusSchema,
    confidence: allergenConfidenceSchema.optional(),
    notes: z.string().max(2000).nullable().optional(),
    verified_by: z.string().max(200).nullable().optional(),
    verified_at: z.string().nullable().optional(),
    last_reviewed_at: z.string().nullable().optional(),
  })).min(1),
});

export const createAllergenEvidenceSchema = z.object({
  item_allergen_id: z.number().int().positive(),
  source_type: allergenSourceTypeSchema,
  source_document_id: z.number().int().positive().nullable().optional(),
  source_product_id: z.number().int().positive().nullable().optional(),
  source_label: z.string().max(500).nullable().optional(),
  source_excerpt: z.string().max(4000).nullable().optional(),
  status_claimed: allergenStatusSchema,
  confidence_claimed: allergenConfidenceSchema.nullable().optional(),
  captured_by: z.string().max(200).nullable().optional(),
  expires_at: z.string().nullable().optional(),
});

export const upsertAllergyDocumentProductMatchSchema = z.object({
  document_product_id: z.number().int().positive(),
  item_id: z.number().int().positive(),
  match_status: allergyMatchStatusSchema,
  match_score: z.number().min(0).max(1).nullable().optional(),
  matched_by: z.enum(['system', 'operator'] as const).optional().default('operator'),
  notes: z.string().max(2000).nullable().optional(),
  active: z.number().int().min(0).max(1).optional().default(1),
});

export const upsertRecipeAllergenOverrideSchema = z.object({
  recipe_version_id: z.number().int().positive(),
  allergen_id: z.number().int().positive(),
  status: allergenStatusSchema,
  reason: z.string().min(1).max(2000),
  created_by: z.string().max(200).nullable().optional(),
});

export const rebuildRecipeAllergenRollupSchema = z.object({
  recipe_version_id: z.number().int().positive(),
});

export const allergenQuerySchema = z.object({
  venue_id: z.number().int().positive().nullable().optional(),
  question: z.string().min(1).max(4000),
  allergen_codes: z.array(z.string().min(1).max(100)).default([]),
});

export const recipeBuilderAlternativeMatchSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  name: z.string().min(1).max(200),
  confidence: recipeAlternativeMatchConfidenceSchema,
  score: z.number().min(0).max(1),
  match_basis: recipeMatchBasisSchema,
});

export const recipeBuilderSourceIntelligenceSchema = z.object({
  origin: recipeOriginSchema,
  confidence_level: recipeConfidenceLevelSchema,
  confidence_score: z.number().int().min(0).max(100),
  confidence_details: z.array(z.string().min(1)).default([]),
  source_images: z.array(z.string().min(1)).default([]),
  parsing_issues: z.array(z.string().min(1)).default([]),
  assumptions: z.array(z.string().min(1)).default([]),
  follow_up_questions: z.array(z.string().min(1)).default([]),
  source_context: z.record(z.string(), z.unknown()).default({}),
  raw_source: z.string().nullable(),
  capture_session_id: z.union([z.number().int().positive(), z.string().min(1)]).nullable(),
  last_confidence_recalculated_at: z.string().nullable(),
  inference_variance_pct: z.number().nullable(),
});

export const recipeBuilderJobSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  source_type: z.enum(['freeform', 'template'] as const),
  source_text: z.string().nullable(),
  source_template_id: z.number().int().positive().nullable(),
  source_template_version_id: z.number().int().positive().nullable(),
  draft_name: z.string().nullable(),
  status: z.enum(['PENDING', 'PARSED', 'ASSEMBLED', 'NEEDS_REVIEW', 'BLOCKED', 'CREATED', 'FAILED'] as const),
  source_hash: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
}).merge(recipeBuilderSourceIntelligenceSchema);

export const recipeBuilderParsedRowSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  recipe_builder_job_id: z.union([z.number().int().positive(), z.string().min(1)]),
  line_index: z.number().int().min(0),
  raw_line_text: z.string().min(1),
  source_template_ingredient_name: z.string().nullable(),
  source_template_quantity: z.number().nullable(),
  source_template_unit: z.string().nullable(),
  source_template_sort_order: z.number().int().nullable(),
  quantity_raw: z.string().nullable(),
  quantity_normalized: z.number().nullable(),
  unit_raw: z.string().nullable(),
  unit_normalized: z.string().nullable(),
  ingredient_text: z.string().nullable(),
  preparation_note: z.string().nullable(),
  parse_status: z.enum(['PARSED', 'PARTIAL', 'NEEDS_REVIEW', 'FAILED'] as const),
  parser_confidence: z.enum(['HIGH', 'MEDIUM', 'LOW'] as const),
  estimated_flag: z.number().int().min(0).max(1),
  estimation_basis: z.string().nullable(),
  alternative_item_matches: z.array(recipeBuilderAlternativeMatchSchema),
  alternative_recipe_matches: z.array(recipeBuilderAlternativeMatchSchema),
  detected_component_type: recipeDetectedComponentTypeSchema,
  matched_recipe_id: z.union([z.number().int().positive(), z.string().min(1)]).nullable(),
  matched_recipe_version_id: z.union([z.number().int().positive(), z.string().min(1)]).nullable(),
  match_basis: recipeMatchBasisSchema.nullable(),
  explanation_text: z.string().min(1),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const recipeBuilderResolutionRowSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  parsed_row_id: z.union([z.number().int().positive(), z.string().min(1)]),
  recipe_builder_job_id: z.union([z.number().int().positive(), z.string().min(1)]),
  canonical_ingredient_id: z.union([z.number().int().positive(), z.string().min(1)]).nullable(),
  canonical_match_status: z.enum(['matched', 'no_match', 'ambiguous', 'skipped'] as const),
  canonical_confidence: z.enum(['HIGH', 'MEDIUM', 'LOW'] as const),
  canonical_match_reason: z.string().nullable(),
  inventory_item_id: z.union([z.number().int().positive(), z.string().min(1)]).nullable(),
  inventory_mapping_status: z.enum(['UNMAPPED', 'MAPPED', 'NEEDS_REVIEW', 'SKIPPED'] as const),
  quantity_normalization_status: z.enum(['NORMALIZED', 'PARTIAL', 'NEEDS_REVIEW', 'FAILED'] as const),
  review_status: z.enum(['READY', 'NEEDS_REVIEW', 'BLOCKED', 'INCOMPLETE', 'CREATED'] as const),
  recipe_mapping_status: recipeMappingStatusSchema,
  recipe_id: z.union([z.number().int().positive(), z.string().min(1)]).nullable(),
  recipe_version_id: z.union([z.number().int().positive(), z.string().min(1)]).nullable(),
  recipe_match_confidence: z.enum(['HIGH', 'MEDIUM', 'LOW'] as const).nullable(),
  recipe_match_reason: z.string().nullable(),
  explanation_text: z.string().min(1),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const recipeBuilderDraftRecipeSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  recipe_builder_job_id: z.union([z.number().int().positive(), z.string().min(1)]),
  draft_name: z.string().min(1).max(200),
  draft_notes: z.string().max(2000).nullable(),
  yield_quantity: z.number().positive().nullable(),
  yield_unit: z.string().nullable(),
  serving_quantity: z.number().positive().nullable(),
  serving_unit: z.string().nullable(),
  serving_count: z.number().positive().nullable(),
  completeness_status: z.enum(['READY', 'NEEDS_REVIEW', 'BLOCKED', 'INCOMPLETE', 'CREATED'] as const),
  costability_status: z.enum(['COSTABLE', 'NEEDS_REVIEW', 'NOT_COSTABLE'] as const),
  ingredient_row_count: z.number().int().min(0),
  ready_row_count: z.number().int().min(0),
  review_row_count: z.number().int().min(0),
  blocked_row_count: z.number().int().min(0),
  unresolved_canonical_count: z.number().int().min(0),
  unresolved_inventory_count: z.number().int().min(0),
  source_recipe_type: z.enum(['dish', 'prep'] as const).nullable(),
  method_notes: z.string().nullable(),
  review_priority: recipeReviewPrioritySchema,
  ready_for_review_flag: z.number().int().min(0).max(1),
  approved_by: z.string().nullable(),
  approved_at: z.string().nullable(),
  rejected_by: z.string().nullable(),
  rejected_at: z.string().nullable(),
  rejection_reason: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const recipeCaptureSessionSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  venue_id: z.union([z.number().int().positive(), z.string().min(1)]).nullable(),
  name: z.string().nullable(),
  capture_mode: recipeCaptureModeSchema,
  started_at: z.string(),
  completed_at: z.string().nullable(),
  led_by: z.string().nullable(),
  notes: z.string().nullable(),
  total_inputs: z.number().int().min(0),
  total_drafts_created: z.number().int().min(0),
  total_auto_matched: z.number().int().min(0),
  total_needs_review: z.number().int().min(0),
  total_approved: z.number().int().min(0),
  estimated_time_saved_minutes: z.number().int().min(0),
  discovered_sub_recipes_json: z.string(),
  new_items_needed_json: z.string(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const recipeCaptureInputSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  recipe_capture_session_id: z.union([z.number().int().positive(), z.string().min(1)]),
  input_type: recipeCaptureInputTypeSchema,
  source_text: z.string().nullable(),
  source_file_name: z.string().nullable(),
  source_mime_type: z.string().nullable(),
  source_storage_path: z.string().nullable(),
  parse_status: recipeCaptureInputStatusSchema,
  recipe_builder_job_id: z.union([z.number().int().positive(), z.string().min(1)]).nullable(),
  processing_notes: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const itemAliasSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  item_id: z.union([z.number().int().positive(), z.string().min(1)]),
  alias: z.string().min(1).max(200),
  normalized_alias: z.string().min(1).max(200),
  alias_type: itemAliasTypeSchema,
  active: z.number().int().min(0).max(1),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const recipeAliasSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  recipe_id: z.union([z.number().int().positive(), z.string().min(1)]),
  alias: z.string().min(1).max(200),
  normalized_alias: z.string().min(1).max(200),
  alias_type: recipeAliasTypeSchema,
  active: z.number().int().min(0).max(1),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const prepSheetCaptureSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  venue_id: z.union([z.number().int().positive(), z.string().min(1)]),
  capture_date: z.string().min(1),
  source_file_name: z.string().min(1).max(200),
  source_mime_type: z.string().min(1).max(200),
  source_storage_path: z.string().nullable(),
  extracted_text: z.string().nullable(),
  parsed_items_json: z.string(),
  inferred_relationships_json: z.string(),
  processed: z.number().int().min(0).max(1),
  processing_notes: z.string().nullable(),
  recipe_capture_session_id: z.union([z.number().int().positive(), z.string().min(1)]).nullable(),
  created_by: z.string().nullable(),
  created_at: z.string().optional(),
});

export const recipeInferenceRunSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  venue_id: z.union([z.number().int().positive(), z.string().min(1)]).nullable(),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  status: recipeInferenceRunStatusSchema,
  notes_json: z.string(),
  created_at: z.string().optional(),
  completed_at: z.string().nullable().optional(),
});

export const recipeInferenceResultSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  recipe_inference_run_id: z.union([z.number().int().positive(), z.string().min(1)]),
  item_id: z.union([z.number().int().positive(), z.string().min(1)]),
  recipe_id: z.union([z.number().int().positive(), z.string().min(1)]).nullable(),
  recipe_version_id: z.union([z.number().int().positive(), z.string().min(1)]).nullable(),
  total_purchased_base_qty: z.number(),
  total_units_sold: z.number(),
  inferred_portion_base_qty: z.number(),
  current_recipe_portion_base_qty: z.number().nullable(),
  variance_pct: z.number().nullable(),
  waste_factor: z.number(),
  menu_usage_json: z.string(),
  acknowledged: z.number().int().min(0).max(1),
  acknowledged_by: z.string().nullable(),
  acknowledged_at: z.string().nullable(),
  action_taken: z.string().nullable(),
  created_at: z.string().optional(),
});

export const recipeDraftIngredientSchema = z.object({
  item_id: z.number().int().positive().nullable(),
  quantity: z.number().positive().nullable(),
  unit: z.string().min(1).nullable(),
  template_ingredient_name: z.string().min(1).nullable().optional(),
  template_quantity: z.number().positive().nullable().optional(),
  template_unit: z.string().min(1).nullable().optional(),
  template_sort_order: z.number().int().min(0).nullable().optional(),
  template_canonical_ingredient_id: z.number().int().positive().nullable().optional(),
});

export const upsertRecipeDraftSchema = z.object({
  draft_name: z.string().min(1, 'Draft name is required').max(200),
  draft_notes: z.string().max(2000).nullable().optional(),
  source_recipe_type: z.enum(['dish', 'prep'] as const),
  creation_mode: z.enum(['template', 'blank'] as const),
  source_template_id: z.number().int().positive().nullable().optional(),
  source_template_version_id: z.number().int().positive().nullable().optional(),
  yield_quantity: z.number().positive().nullable().optional(),
  yield_unit: z.enum(UNITS).nullable().optional(),
  serving_quantity: z.number().positive().nullable().optional(),
  serving_unit: z.enum(UNITS).nullable().optional(),
  serving_count: z.number().positive().nullable().optional(),
  ingredients: z.array(recipeDraftIngredientSchema).default([]),
}).superRefine((data, ctx) => {
  if (data.creation_mode === 'template' && data.source_template_id == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['source_template_id'],
      message: 'Template mode requires a source template.',
    });
  }

  const yieldQuantityProvided = data.yield_quantity !== undefined;
  const yieldUnitProvided = data.yield_unit !== undefined;
  if (yieldQuantityProvided !== yieldUnitProvided) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: yieldQuantityProvided ? ['yield_unit'] : ['yield_quantity'],
      message: 'Yield quantity and yield unit must be provided together.',
    });
  }

  const servingQuantityProvided = data.serving_quantity !== undefined;
  const servingUnitProvided = data.serving_unit !== undefined;
  if (servingQuantityProvided !== servingUnitProvided) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: servingQuantityProvided ? ['serving_unit'] : ['serving_quantity'],
      message: 'Serving quantity and serving unit must be provided together.',
    });
  }
});

export const createRecipeCaptureSessionSchema = z.object({
  venue_id: z.number().int().positive().nullable().optional(),
  name: z.string().max(200).nullable().optional(),
  capture_mode: recipeCaptureModeSchema,
  led_by: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const createPrepSheetCaptureSchema = z.object({
  venue_id: z.number().int().positive(),
  capture_date: z.string().min(1),
  source_file_name: z.string().min(1).max(200),
  source_mime_type: z.string().min(1).max(200),
  source_storage_path: z.string().max(2000).nullable().optional(),
  extracted_text: z.string().max(40000).nullable().optional(),
  parsed_items_json: z.string().optional().default('[]'),
  inferred_relationships_json: z.string().optional().default('[]'),
  created_by: z.string().max(200).nullable().optional(),
  recipe_capture_session_id: z.number().int().positive().nullable().optional(),
  processing_notes: z.string().max(2000).nullable().optional(),
});

export const createItemAliasSchema = z.object({
  alias: z.string().min(1).max(200),
  alias_type: itemAliasTypeSchema,
});

export const createRecipeAliasSchema = z.object({
  alias: z.string().min(1).max(200),
  alias_type: recipeAliasTypeSchema,
});

export const recalculateRecipeDraftConfidenceSchema = z.object({
  trigger: z.enum(['operator_review', 'capture_import', 'prep_sheet_link', 'purchase_inference'] as const),
});

export const startRecipeConversationDraftSchema = z.object({
  venue_id: z.number().int().positive(),
  session_name: z.string().max(200).nullable().optional(),
  created_by: z.string().max(200).nullable().optional(),
  entries: z.array(z.object({
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(4000),
  })).min(1),
});

export const createRecipeInferenceRunSchema = z.object({
  venue_id: z.number().int().positive().nullable().optional(),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
});

export type RecipeDraftIngredientInput = z.infer<typeof recipeDraftIngredientSchema>;
export type UpsertRecipeDraftInput = z.infer<typeof upsertRecipeDraftSchema>;
export type RecipeBuilderAlternativeMatchInput = z.infer<typeof recipeBuilderAlternativeMatchSchema>;
export type RecipeBuilderSourceIntelligenceInput = z.infer<typeof recipeBuilderSourceIntelligenceSchema>;
export type RecipeBuilderJobInput = z.infer<typeof recipeBuilderJobSchema>;
export type RecipeBuilderParsedRowInput = z.infer<typeof recipeBuilderParsedRowSchema>;
export type RecipeBuilderResolutionRowInput = z.infer<typeof recipeBuilderResolutionRowSchema>;
export type RecipeBuilderDraftRecipeInput = z.infer<typeof recipeBuilderDraftRecipeSchema>;
export type RecipeCaptureSessionInput = z.infer<typeof recipeCaptureSessionSchema>;
export type RecipeCaptureInputInput = z.infer<typeof recipeCaptureInputSchema>;
export type ItemAliasInput = z.infer<typeof itemAliasSchema>;
export type RecipeAliasInput = z.infer<typeof recipeAliasSchema>;
export type PrepSheetCaptureInput = z.infer<typeof prepSheetCaptureSchema>;
export type RecipeInferenceRunInput = z.infer<typeof recipeInferenceRunSchema>;
export type RecipeInferenceResultInput = z.infer<typeof recipeInferenceResultSchema>;
export type CreateRecipeCaptureSessionInput = z.infer<typeof createRecipeCaptureSessionSchema>;
export type CreatePrepSheetCaptureInput = z.infer<typeof createPrepSheetCaptureSchema>;
export type CreateItemAliasInput = z.infer<typeof createItemAliasSchema>;
export type CreateRecipeAliasInput = z.infer<typeof createRecipeAliasSchema>;
export type RecalculateRecipeDraftConfidenceInput = z.infer<typeof recalculateRecipeDraftConfidenceSchema>;
export type StartRecipeConversationDraftInput = z.infer<typeof startRecipeConversationDraftSchema>;
export type CreateRecipeInferenceRunInput = z.infer<typeof createRecipeInferenceRunSchema>;
export type CreateVendorInput = z.infer<typeof createVendorSchema>;
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
export type CreateVendorPriceInput = z.infer<typeof createVendorPriceSchema>;
export type UpdateVendorPriceInput = z.infer<typeof updateVendorPriceSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type UpsertItemAllergenProfileInput = z.infer<typeof upsertItemAllergenProfileSchema>;
export type CreateAllergenEvidenceInput = z.infer<typeof createAllergenEvidenceSchema>;
export type UpsertAllergyDocumentProductMatchInput = z.infer<typeof upsertAllergyDocumentProductMatchSchema>;
export type UpsertRecipeAllergenOverrideInput = z.infer<typeof upsertRecipeAllergenOverrideSchema>;
export type RebuildRecipeAllergenRollupInput = z.infer<typeof rebuildRecipeAllergenRollupSchema>;
export type AllergenQueryInput = z.infer<typeof allergenQuerySchema>;

export const saveForecastSchema = z.object({
  filename: z.string().min(1),
  dates: z.array(z.string()).min(1),
  products: z.array(z.object({
    product_code: z.string().min(1).nullable().optional(),
    product_name: z.string().min(1),
    group: z.string().min(1),
    counts: z.record(z.string(), z.number().int().min(0)),
  })).min(1),
});

export const saveForecastMappingsBulkSchema = z.object({
  mappings: z.array(z.object({
    product_name: z.string().min(1),
    venue_id: z.number().int().positive(),
  })).min(1),
});

export const updateForecastEntrySchema = z.object({
  guest_count: z.number().int().min(0),
});

export type SaveForecastInput = z.infer<typeof saveForecastSchema>;
export type SaveForecastMappingsBulkInput = z.infer<typeof saveForecastMappingsBulkSchema>;
export type UpdateForecastEntryInput = z.infer<typeof updateForecastEntrySchema>;

// Snack Bar Sales
export const createSaleSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().positive('Quantity must be positive'),
  unit_qty: z.number().int().positive().optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
