import type { DerivedSignal } from '@fifoflow/shared';
import type { IntelligenceJobContext } from '../types.js';
import type { IntelligencePersistenceRepository, IntelligenceRunCounters } from '../persistence/types.js';
import { buildMemoCandidate, rankMemoSignals } from './memoRankingEngine.js';
import type {
  MemoCandidateItem,
  MemoSection,
  MemoSectionKey,
  MemoSignalReadRepository,
  WeeklyOperatingMemoExecutionResult,
  WeeklyOperatingMemoPayload,
  WeeklyOperatingMemoRunSummary,
} from './types.js';

export interface WeeklyOperatingMemoDependencies {
  source: MemoSignalReadRepository;
  repository: IntelligencePersistenceRepository;
  sectionLimits?: Partial<Record<MemoSectionKey, number>>;
}

const DEFAULT_SECTION_LIMITS: Record<MemoSectionKey, number> = {
  top_priority: 5,
  price_watch: 5,
  recipe_cost_watch: 5,
  inventory_discipline: 5,
  needs_review: 5,
  standards_review: 3,
};

const SECTION_ORDER: Array<{ key: MemoSectionKey; title: string; order: number }> = [
  { key: 'top_priority', title: 'Top Priority Items', order: 1 },
  { key: 'price_watch', title: 'Price Watch', order: 2 },
  { key: 'recipe_cost_watch', title: 'Recipe Cost Watch', order: 3 },
  { key: 'inventory_discipline', title: 'Inventory Discipline', order: 4 },
  { key: 'needs_review', title: 'Needs Review / Incomplete Intelligence', order: 5 },
  { key: 'standards_review', title: 'Standards Review', order: 6 },
];

const LIVE_MEMO_SIGNAL_TYPES: DerivedSignal['signal_type'][] = [
  'PRICE_INCREASE',
  'PRICE_DROP',
  'PRICE_VOLATILITY',
  'RECIPE_COST_DRIFT',
  'INGREDIENT_COST_DRIVER',
  'COUNT_VARIANCE',
  'COUNT_INCONSISTENCY',
];

export async function executeWeeklyOperatingMemo(
  context: IntelligenceJobContext,
  dependencies: WeeklyOperatingMemoDependencies,
): Promise<WeeklyOperatingMemoExecutionResult> {
  const run = await dependencies.repository.startRun('weekly-operating-memo-job', context.now);
  const counters: IntelligenceRunCounters = {
    signals_created: 0,
    signals_updated: 0,
    patterns_created: 0,
    patterns_updated: 0,
    recommendations_created: 0,
    recommendations_updated: 0,
    recommendations_superseded: 0,
  };
  const notes: string[] = [];

  try {
    const signals = await dependencies.source.listSignalsForMemo(context.window, LIVE_MEMO_SIGNAL_TYPES);
    const rankedItems = rankMemoSignals(signals, context.now);
    const memo = buildWeeklyOperatingMemoPayload(rankedItems, context, dependencies.sectionLimits);
    const summary: WeeklyOperatingMemoRunSummary = {
      signals_considered: signals.length,
      memo_items_ranked: rankedItems.length,
      sections_emitted: memo.sections.length,
      top_priority_count: memo.top_priority_items.length,
    };

    if (rankedItems.length === 0) {
      notes.push('No eligible live intelligence signals were available for the weekly memo window.');
    }

    const completedRun = await dependencies.repository.completeRun(run.id, 'completed', counters, context.now);
    return {
      run: completedRun,
      run_summary: counters,
      notes,
      weekly_operating_memo: memo,
      weekly_operating_memo_summary: summary,
      signals: undefined,
      patterns: undefined,
      recommendations: undefined,
    };
  } catch (error) {
    await dependencies.repository.completeRun(run.id, 'failed', counters, context.now);
    throw error;
  }
}

export function buildWeeklyOperatingMemoPayload(
  rankedItems: MemoCandidateItem[],
  context: IntelligenceJobContext,
  sectionLimits?: Partial<Record<MemoSectionKey, number>>,
): WeeklyOperatingMemoPayload {
  const limits = { ...DEFAULT_SECTION_LIMITS, ...(sectionLimits ?? {}) };
  const topPriorityItems = rankedItems.slice(0, limits.top_priority);
  const sections = SECTION_ORDER.map<MemoSection>((section) => ({
    key: section.key,
    title: section.title,
    order: section.order,
    max_items: limits[section.key],
    items: buildSectionItems(section.key, rankedItems, topPriorityItems, limits[section.key]),
  }));

  return {
    memo_window: {
      start: context.window.start,
      end: context.window.end,
      generated_at: context.now,
    },
    total_candidate_signals: rankedItems.length,
    ranked_item_count: rankedItems.length,
    sections,
    top_priority_items: topPriorityItems,
    routing_summary: buildRoutingSummary(rankedItems),
    explanation_metadata: {
      ranking_model_version: 'weekly-operating-memo-ranking/v1',
      routing_model_version: 'weekly-operating-memo-routing/v1',
      eligibility_notes: [
        'Memo includes persisted live signals only.',
        'Signals are ranked deterministically across packs using explicit scoring components.',
        'Top Priority and Needs Review may repeat items already shown in family sections.',
      ],
    },
  };
}

function buildSectionItems(
  sectionKey: MemoSectionKey,
  rankedItems: MemoCandidateItem[],
  topPriorityItems: MemoCandidateItem[],
  maxItems: number,
): MemoCandidateItem[] {
  if (sectionKey === 'top_priority') {
    return topPriorityItems;
  }
  if (sectionKey === 'standards_review') {
    return [];
  }

  return rankedItems
    .filter((item) => item.section_keys.includes(sectionKey))
    .slice(0, maxItems);
}

function buildRoutingSummary(items: MemoCandidateItem[]): WeeklyOperatingMemoPayload['routing_summary'] {
  const grouped = new Map<string, { item_count: number; signal_types: Set<string> }>();
  for (const item of items) {
    const existing = grouped.get(item.likely_owner) ?? { item_count: 0, signal_types: new Set<string>() };
    existing.item_count += 1;
    existing.signal_types.add(item.signal_type);
    grouped.set(item.likely_owner, existing);
  }

  return [...grouped.entries()]
    .map(([owner, value]) => ({
      owner: owner as WeeklyOperatingMemoPayload['routing_summary'][number]['owner'],
      item_count: value.item_count,
      signal_types: [...value.signal_types].sort(),
    }))
    .sort((left, right) => right.item_count - left.item_count || left.owner.localeCompare(right.owner));
}
