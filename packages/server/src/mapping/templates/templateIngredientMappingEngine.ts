import { createHash } from 'node:crypto';
import type { CanonicalIngredientResolutionResult } from '../ingredients/types.js';
import type {
  TemplateIngredientMapping,
  TemplateIngredientMappingCandidate,
  TemplateIngredientMappingDependencies,
  TemplateIngredientMappingExecutionResult,
  TemplateIngredientMappingReviewEvent,
  TemplateIngredientMatchReason,
  TemplateIngredientSourceRow,
} from './types.js';

export async function executeTemplateIngredientMapping(
  dependencies: TemplateIngredientMappingDependencies,
): Promise<TemplateIngredientMappingExecutionResult> {
  const rows = await dependencies.source.listActiveTemplateIngredientRows();
  const notes: string[] = [];
  const mappings: TemplateIngredientMapping[] = [];
  const candidates: TemplateIngredientMappingCandidate[] = [];
  const reviewEvents: TemplateIngredientMappingReviewEvent[] = [];
  const summary: TemplateIngredientMappingExecutionResult['run_summary'] = {
    rows_processed: rows.length,
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

  await dependencies.repository.withTransaction(async () => {
    const activeRowKeys = new Set<string>();

    for (const row of rows) {
      const rowKey = buildTemplateIngredientRowKey(row);
      activeRowKeys.add(rowKey);
      const sourceHash = buildTemplateIngredientSourceHash(row);
      const existing = await dependencies.repository.getMappingByRowKey(rowKey);

      if (existing?.mapping_status === 'MANUALLY_MAPPED' || existing?.mapping_status === 'REJECTED') {
        const preserved = await dependencies.repository.upsertMapping({
          template_id: row.template_id,
          template_version_id: row.template_version_id,
          template_ingredient_row_key: rowKey,
          ingredient_name: row.ingredient_name,
          normalized_ingredient_name: row.normalized_ingredient_name,
          mapped_canonical_ingredient_id: existing.mapped_canonical_ingredient_id,
          mapping_status: existing.mapping_status,
          confidence_label: existing.confidence_label,
          match_reason: existing.match_reason,
          chosen_candidate_id: existing.chosen_candidate_id,
          explanation_text: existing.explanation_text,
          source_hash: sourceHash,
          active: true,
          resolved_by: existing.resolved_by,
          resolved_at: existing.resolved_at,
        });

        if (preserved.action === 'created') {
          summary.mappings_created += 1;
        } else if (preserved.action === 'updated') {
          summary.mappings_updated += 1;
        } else {
          summary.mappings_reused += 1;
        }

        mappings.push(preserved.record);
        if (existing.mapping_status === 'MANUALLY_MAPPED') {
          summary.manual_preserved += 1;
        } else {
          summary.rejected_preserved += 1;
        }
        continue;
      }

      const resolution = await dependencies.resolver.resolve(row.ingredient_name);
      const plan = buildMappingPlan(row, rowKey, sourceHash, resolution);
      const persisted = await dependencies.repository.upsertMapping(plan.mapping);
      const candidateWrite = await dependencies.repository.replaceCandidates(persisted.record.id, plan.candidates);

      if (persisted.action === 'created') {
        summary.mappings_created += 1;
      } else if (persisted.action === 'updated') {
        summary.mappings_updated += 1;
      } else {
        summary.mappings_reused += 1;
      }

      summary.candidates_created += candidateWrite.created;
      summary.candidates_updated += candidateWrite.updated;
      summary.candidates_retired += candidateWrite.retired;

      const mappingRecord = persisted.record;
      mappings.push(mappingRecord);
      candidates.push(...candidateWrite.records);

      if (mappingRecord.mapping_status === 'AUTO_MAPPED') {
        summary.auto_mapped += 1;
      } else if (mappingRecord.mapping_status === 'NEEDS_REVIEW') {
        summary.needs_review += 1;
        if (dependencies.repository.recordReviewEvent && persisted.action !== 'reused') {
          const event = await dependencies.repository.recordReviewEvent({
            template_ingredient_mapping_id: mappingRecord.id,
            action_type: 'FLAGGED_FOR_REVIEW',
            actor_name: null,
            notes: mappingRecord.explanation_text,
          });
          reviewEvents.push(event);
        }
      } else if (mappingRecord.mapping_status === 'UNMAPPED') {
        summary.unmapped += 1;
        if (dependencies.repository.recordReviewEvent && persisted.action !== 'reused') {
          const event = await dependencies.repository.recordReviewEvent({
            template_ingredient_mapping_id: mappingRecord.id,
            action_type: 'UNMAPPED_DETECTED',
            actor_name: null,
            notes: mappingRecord.explanation_text,
          });
          reviewEvents.push(event);
        }
      }
    }

    summary.mappings_retired = await dependencies.repository.retireMissingMappings(activeRowKeys);
  });

  if (rows.length === 0) {
    notes.push('No active recipe template ingredient rows were available for mapping.');
  }

  return {
    mappings,
    candidates,
    review_events: reviewEvents,
    run_summary: summary,
    notes,
  };
}

export function buildTemplateIngredientRowKey(row: TemplateIngredientSourceRow): string {
  return [
    'template',
    String(row.template_id),
    'version',
    String(row.template_version_id),
    'ingredient',
    String(row.sort_order),
    row.normalized_ingredient_name,
  ].join(':');
}

export function buildTemplateIngredientSourceHash(row: TemplateIngredientSourceRow): string {
  return createHash('sha256')
    .update(JSON.stringify({
      template_id: row.template_id,
      template_version_id: row.template_version_id,
      template_version_source_hash: row.template_version_source_hash,
      sort_order: row.sort_order,
      ingredient_name: row.ingredient_name,
      normalized_ingredient_name: row.normalized_ingredient_name,
      qty: row.qty,
      unit: row.unit,
    }))
    .digest('hex');
}

function buildMappingPlan(
  row: TemplateIngredientSourceRow,
  rowKey: string,
  sourceHash: string,
  resolution: CanonicalIngredientResolutionResult,
): {
  mapping: Omit<TemplateIngredientMapping, 'id' | 'created_at' | 'updated_at'>;
  candidates: Array<Omit<TemplateIngredientMappingCandidate, 'id' | 'template_ingredient_mapping_id' | 'created_at' | 'updated_at'>>;
} {
  if (resolution.status === 'matched') {
    return {
      mapping: {
        template_id: row.template_id,
        template_version_id: row.template_version_id,
        template_ingredient_row_key: rowKey,
        ingredient_name: row.ingredient_name,
        normalized_ingredient_name: row.normalized_ingredient_name,
        mapped_canonical_ingredient_id: resolution.matched_canonical_ingredient_id,
        mapping_status: 'AUTO_MAPPED',
        confidence_label: 'HIGH',
        match_reason: translateMatchReason(resolution.match_reason),
        chosen_candidate_id: null,
        explanation_text: resolution.explanation_text,
        source_hash: sourceHash,
        active: true,
        resolved_by: null,
        resolved_at: null,
      },
      candidates: [],
    };
  }

  if (resolution.status === 'ambiguous') {
    return {
      mapping: {
        template_id: row.template_id,
        template_version_id: row.template_version_id,
        template_ingredient_row_key: rowKey,
        ingredient_name: row.ingredient_name,
        normalized_ingredient_name: row.normalized_ingredient_name,
        mapped_canonical_ingredient_id: null,
        mapping_status: 'NEEDS_REVIEW',
        confidence_label: 'LOW',
        match_reason: 'ambiguous_match',
        chosen_candidate_id: null,
        explanation_text: resolution.explanation_text,
        source_hash: sourceHash,
        active: true,
        resolved_by: null,
        resolved_at: null,
      },
      candidates: resolution.matches.map((match, index) => ({
        candidate_canonical_ingredient_id: match.ingredient.id,
        candidate_canonical_name: match.ingredient.canonical_name,
        confidence_label: 'LOW',
        match_reason: 'ambiguous_match',
        explanation_text: `Candidate ${index + 1} for "${row.ingredient_name}" is "${match.ingredient.canonical_name}". ${resolution.explanation_text}`,
        candidate_rank: index + 1,
        active: true,
      })),
    };
  }

  return {
    mapping: {
      template_id: row.template_id,
      template_version_id: row.template_version_id,
      template_ingredient_row_key: rowKey,
      ingredient_name: row.ingredient_name,
      normalized_ingredient_name: row.normalized_ingredient_name,
      mapped_canonical_ingredient_id: null,
      mapping_status: 'UNMAPPED',
      confidence_label: 'LOW',
      match_reason: 'no_match',
      chosen_candidate_id: null,
      explanation_text: resolution.explanation_text,
      source_hash: sourceHash,
      active: true,
      resolved_by: null,
      resolved_at: null,
    },
    candidates: [],
  };
}

function translateMatchReason(reason: CanonicalIngredientResolutionResult['match_reason']): TemplateIngredientMatchReason {
  switch (reason) {
    case 'exact_canonical':
      return 'exact_canonical_name';
    case 'normalized_canonical':
      return 'normalized_canonical_name';
    case 'exact_alias':
      return 'exact_alias';
    case 'normalized_alias':
      return 'normalized_alias';
    case 'no_match':
      return 'no_match';
    case 'ambiguous':
      return 'ambiguous_match';
    default:
      return 'no_match';
  }
}
