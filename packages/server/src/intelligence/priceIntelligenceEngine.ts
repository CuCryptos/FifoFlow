import type {
  ConfidenceLabel,
  DerivedSignal,
  PriceThresholdConfig,
  PriceThresholdRuleSet,
  PatternObservation,
  Recommendation,
  RecommendationEvidence,
  SeverityLabel,
  SignalType,
  UrgencyLabel,
} from '@fifoflow/shared';
import type { PolicyRepository } from '../platform/policy/index.js';
import { defaultConfidenceLabel, type IntelligenceJobContext, type IntelligenceJobResult } from './types.js';
import { DEFAULT_PRICE_THRESHOLD_CONFIG } from './priceThresholds.js';
import {
  buildThresholdExplainabilityPayload,
  resolvePriceThresholdPolicyBundle,
  type ResolvedPriceThresholdBundle,
} from './priceThresholdPolicyResolver.js';
import type { NormalizedVendorPriceRecord, PriceIntelligenceSource } from './priceRepositories.js';
import type { IntelligencePersistenceRepository, IntelligenceRunCounters } from './persistence/types.js';

export interface PriceIntelligenceRunDependencies {
  source: PriceIntelligenceSource;
  repository: IntelligencePersistenceRepository;
  policyRepository?: PolicyRepository;
  thresholdConfig?: PriceThresholdConfig;
}

interface PriceSeries {
  vendor_item_key: string;
  vendor_id: number;
  vendor_name: string;
  inventory_item_id: number;
  inventory_item_name: string;
  category: string;
  base_unit: string;
  records: NormalizedVendorPriceRecord[];
}

interface VolatilityMetrics {
  observationCount: number;
  minPrice: number;
  maxPrice: number;
  averagePrice: number;
  pctRange: number;
  windowStart: string;
  windowEnd: string;
  records: NormalizedVendorPriceRecord[];
}

export async function executePriceIntelligence(
  context: IntelligenceJobContext,
  dependencies: PriceIntelligenceRunDependencies,
): Promise<IntelligenceJobResult> {
  const thresholdConfig = dependencies.thresholdConfig ?? DEFAULT_PRICE_THRESHOLD_CONFIG;
  const run = await dependencies.repository.startRun('price-intelligence-job', context.now);
  const records = await dependencies.source.listNormalizedVendorPriceHistory(context);
  const seriesList = buildPriceSeries(records);

  const signals: DerivedSignal[] = [];
  const patterns: PatternObservation[] = [];
  const recommendations: Recommendation[] = [];
  const notes: string[] = [];
  const counters: IntelligenceRunCounters = {
    signals_created: 0,
    signals_updated: 0,
    patterns_created: 0,
    patterns_updated: 0,
    recommendations_created: 0,
    recommendations_updated: 0,
    recommendations_superseded: 0,
  };

  try {
    await dependencies.repository.withTransaction(async () => {
      for (const series of seriesList) {
        const thresholdBundle = await resolvePriceThresholdPolicyBundle({
          subject: {
            inventory_item_id: series.inventory_item_id,
            inventory_item_name: series.inventory_item_name,
            inventory_category: series.category,
          },
          context,
          policyRepository: dependencies.policyRepository,
          fallbackConfig: thresholdConfig,
        });
        if (thresholdBundle.fallback_used) {
          notes.push(`Price threshold fallback defaults were used for ${series.inventory_item_name} (${series.category}).`);
        }
        const evaluatedSignals = evaluatePriceSeries(series, context, thresholdBundle);
        const persistedSeriesSignals: DerivedSignal[] = [];

        for (const signal of evaluatedSignals) {
          const upserted = await dependencies.repository.upsertSignal(signal);
          incrementCounter(counters, upserted.action, 'signals');
          persistedSeriesSignals.push(upserted.record);
          signals.push(upserted.record);
        }

        const volatilitySignal = persistedSeriesSignals.find((signal) => signal.signal_type === 'PRICE_VOLATILITY');
        if (!volatilitySignal) {
          continue;
        }

        const observedSince = subtractDays(volatilitySignal.observed_at, thresholdBundle.thresholds.recurrence_window_days);
        const historicalVolatilitySignals = await dependencies.repository.fetchActiveSignalsBySubject({
          subject_type: 'inventory_item',
          subject_key: series.vendor_item_key,
          signal_type: 'PRICE_VOLATILITY',
          observed_since: observedSince,
        });

        const allVolatilitySignals = dedupeSignalsById(historicalVolatilitySignals);
        if (allVolatilitySignals.length < thresholdBundle.thresholds.pattern_signal_threshold) {
          continue;
        }

        const pattern = buildUnstableVendorPricingPattern(series, allVolatilitySignals, context, thresholdBundle);
        const upsertedPattern = await dependencies.repository.upsertPattern(pattern);
        incrementCounter(counters, upsertedPattern.action, 'patterns');
        patterns.push(upsertedPattern.record);

        if (upsertedPattern.record.confidence_label === 'Early signal') {
          notes.push(`Volatility pattern observed for ${series.inventory_item_name} from ${series.vendor_name}, but confidence is still early.`);
          continue;
        }

        const recommendation = buildReviewVendorRecommendation(series, upsertedPattern.record, context, buildRecommendationDedupeKey(series, context));
        const upsertedRecommendation = await dependencies.repository.upsertRecommendation(recommendation);
        incrementCounter(counters, upsertedRecommendation.action, 'recommendations');
        if (upsertedRecommendation.superseded_recommendation_id !== null && upsertedRecommendation.superseded_recommendation_id !== undefined) {
          counters.recommendations_superseded += 1;
        }

        const evidence = buildRecommendationEvidence(upsertedRecommendation.record, upsertedPattern.record, volatilitySignal, series);
        await dependencies.repository.attachRecommendationEvidence(evidence);
        upsertedRecommendation.record.evidence = evidence;
        upsertedRecommendation.record.evidence_count = Math.max(upsertedRecommendation.record.evidence_count ?? 0, evidence.length);
        recommendations.push(upsertedRecommendation.record);
      }
    });

    const completedRun = await dependencies.repository.completeRun(run.id, 'completed', counters, context.now);

    if (signals.length === 0) {
      notes.push('No price intelligence signals were emitted for the evaluated data window.');
    }

    return {
      signals,
      patterns,
      recommendations,
      run: completedRun,
      run_summary: counters,
      notes,
    };
  } catch (error) {
    await dependencies.repository.completeRun(run.id, 'failed', counters, context.now);
    throw error;
  }
}

export function evaluatePriceSeries(
  series: PriceSeries,
  context: IntelligenceJobContext,
  thresholdBundle: ResolvedPriceThresholdBundle,
): DerivedSignal[] {
  const signals: DerivedSignal[] = [];
  const thresholds = thresholdBundle.thresholds;
  const ordered = [...series.records].sort((a, b) => compareIso(a.observed_at, b.observed_at));
  const latest = ordered.at(-1);
  const prior = ordered.length >= 2 ? ordered.at(-2) : undefined;

  if (latest && prior && prior.normalized_unit_cost > 0) {
    const pctChange = (latest.normalized_unit_cost - prior.normalized_unit_cost) / prior.normalized_unit_cost;
    if (pctChange >= thresholds.percent_increase_threshold) {
      signals.push(
        buildPriceChangeSignal('PRICE_INCREASE', series, prior, latest, pctChange, context, thresholdBundle),
      );
    } else if (pctChange <= -thresholds.percent_drop_threshold) {
      signals.push(
        buildPriceChangeSignal('PRICE_DROP', series, prior, latest, pctChange, context, thresholdBundle),
      );
    }
  }

  const volatilityMetrics = calculateVolatilityMetrics(ordered, latest?.observed_at ?? context.window.end, thresholds);
  if (volatilityMetrics !== null && volatilityMetrics.pctRange >= thresholds.volatility_threshold) {
    signals.push(buildVolatilitySignal(series, volatilityMetrics, context, thresholdBundle));
  }

  return signals;
}

export function buildPriceSeries(records: NormalizedVendorPriceRecord[]): PriceSeries[] {
  const grouped = new Map<string, PriceSeries>();

  for (const record of records) {
    const existing = grouped.get(record.vendor_item_key);
    if (existing) {
      existing.records.push(record);
      continue;
    }

    grouped.set(record.vendor_item_key, {
      vendor_item_key: record.vendor_item_key,
      vendor_id: record.vendor_id,
      vendor_name: record.vendor_name,
      inventory_item_id: record.inventory_item_id,
      inventory_item_name: record.inventory_item_name,
      category: record.category,
      base_unit: record.base_unit,
      records: [record],
    });
  }

  return [...grouped.values()].sort((a, b) => a.vendor_item_key.localeCompare(b.vendor_item_key));
}

function buildPriceChangeSignal(
  signalType: Extract<SignalType, 'PRICE_INCREASE' | 'PRICE_DROP'>,
  series: PriceSeries,
  prior: NormalizedVendorPriceRecord,
  latest: NormalizedVendorPriceRecord,
  pctChange: number,
  context: IntelligenceJobContext,
  thresholdBundle: ResolvedPriceThresholdBundle,
): DerivedSignal {
  const thresholds = thresholdBundle.thresholds;
  const magnitude = Math.abs(pctChange);
  const absChange = Math.abs(latest.normalized_unit_cost - prior.normalized_unit_cost);
  const severityLabel = resolvePriceChangeSeverity(magnitude, absChange, thresholds);
  const confidenceScore = resolveChangeConfidenceScore(series.records.length, latest.observed_at, prior.observed_at, thresholds);
  const evidenceRefs = [prior, latest].map((record) => ({
    source_table: record.source_table,
    source_primary_key: record.source_primary_key,
    source_type: 'vendor_price_record',
    observed_at: record.observed_at,
    payload: {
      vendor_item_key: record.vendor_item_key,
      vendor_price_id: record.vendor_price_id,
      vendor_id: record.vendor_id,
      inventory_item_id: record.inventory_item_id,
      normalized_unit_cost: record.normalized_unit_cost,
      order_unit_price: record.order_unit_price,
      qty_per_unit: record.qty_per_unit,
      base_unit: record.base_unit,
    },
  }));

  return {
    id: `${signalType}:${series.vendor_item_key}:${latest.vendor_price_id}`,
    signal_type: signalType,
    subject_type: 'inventory_item',
    subject_id: series.inventory_item_id,
    subject_key: series.vendor_item_key,
    severity_label: severityLabel,
    confidence_label: defaultConfidenceLabel(confidenceScore),
    confidence_score: confidenceScore,
    rule_version: context.ruleVersion,
    window_start: prior.observed_at,
    window_end: latest.observed_at,
    observed_at: latest.observed_at,
    organization_id: context.scope.organizationId ?? null,
    location_id: context.scope.locationId ?? null,
    operation_unit_id: context.scope.operationUnitId ?? null,
    storage_area_id: context.scope.storageAreaId ?? null,
    inventory_category_id: null,
    inventory_item_id: series.inventory_item_id,
    recipe_id: null,
    vendor_id: series.vendor_id,
    vendor_item_id: latest.vendor_price_id,
    magnitude_value: magnitude,
    evidence_count: evidenceRefs.length,
    signal_payload: {
      vendor_item_key: series.vendor_item_key,
      vendor_item_name: latest.vendor_item_name ?? series.inventory_item_name,
      vendor_name: series.vendor_name,
      inventory_item_name: series.inventory_item_name,
      category: series.category,
      base_unit: series.base_unit,
      prior_normalized_price: prior.normalized_unit_cost,
      current_normalized_price: latest.normalized_unit_cost,
      normalized_price_change_pct: pctChange,
      normalized_price_change_abs: latest.normalized_unit_cost - prior.normalized_unit_cost,
      comparison_window_start: prior.observed_at,
      comparison_window_end: latest.observed_at,
      threshold_used: signalType === 'PRICE_INCREASE' ? thresholds.percent_increase_threshold : thresholds.percent_drop_threshold,
      threshold_explainability: buildThresholdExplainabilityPayload(
        thresholdBundle,
        signalType === 'PRICE_INCREASE'
          ? ['percent_increase_threshold', 'immediate_pct_threshold', 'immediate_abs_threshold', 'recurrence_window_days']
          : ['percent_drop_threshold', 'immediate_pct_threshold', 'immediate_abs_threshold', 'recurrence_window_days'],
      ),
    },
    evidence: evidenceRefs,
    last_confirmed_at: context.now,
    created_at: context.now,
    updated_at: context.now,
  };
}

function buildVolatilitySignal(
  series: PriceSeries,
  metrics: VolatilityMetrics,
  context: IntelligenceJobContext,
  thresholdBundle: ResolvedPriceThresholdBundle,
): DerivedSignal {
  const thresholds = thresholdBundle.thresholds;
  const severityLabel = resolveVolatilitySeverity(metrics.pctRange, thresholds);
  const confidenceScore = resolveVolatilityConfidenceScore(metrics.observationCount, thresholds.minimum_evidence_count);

  return {
    id: `PRICE_VOLATILITY:${series.vendor_item_key}:${metrics.windowEnd}`,
    signal_type: 'PRICE_VOLATILITY',
    subject_type: 'inventory_item',
    subject_id: series.inventory_item_id,
    subject_key: series.vendor_item_key,
    severity_label: severityLabel,
    confidence_label: defaultConfidenceLabel(confidenceScore),
    confidence_score: confidenceScore,
    rule_version: context.ruleVersion,
    window_start: metrics.windowStart,
    window_end: metrics.windowEnd,
    observed_at: metrics.windowEnd,
    organization_id: context.scope.organizationId ?? null,
    location_id: context.scope.locationId ?? null,
    operation_unit_id: context.scope.operationUnitId ?? null,
    storage_area_id: context.scope.storageAreaId ?? null,
    inventory_category_id: null,
    inventory_item_id: series.inventory_item_id,
    recipe_id: null,
    vendor_id: series.vendor_id,
    vendor_item_id: metrics.records.at(-1)?.vendor_price_id ?? null,
    magnitude_value: metrics.pctRange,
    evidence_count: metrics.records.length,
    signal_payload: {
      vendor_item_key: series.vendor_item_key,
      vendor_name: series.vendor_name,
      inventory_item_name: series.inventory_item_name,
      category: series.category,
      base_unit: series.base_unit,
      observation_count: metrics.observationCount,
      min_normalized_price: metrics.minPrice,
      max_normalized_price: metrics.maxPrice,
      average_normalized_price: metrics.averagePrice,
      volatility_pct_range: metrics.pctRange,
      comparison_window_start: metrics.windowStart,
      comparison_window_end: metrics.windowEnd,
      threshold_used: thresholds.volatility_threshold,
      threshold_explainability: buildThresholdExplainabilityPayload(
        thresholdBundle,
        ['volatility_threshold', 'minimum_evidence_count', 'recurrence_window_days', 'immediate_volatility_threshold'],
      ),
      source_vendor_price_ids: metrics.records.map((record) => record.vendor_price_id),
    },
    evidence: metrics.records.map((record) => ({
      source_table: record.source_table,
      source_primary_key: record.source_primary_key,
      source_type: 'vendor_price_record',
      observed_at: record.observed_at,
      payload: {
        vendor_item_key: record.vendor_item_key,
        vendor_price_id: record.vendor_price_id,
        normalized_unit_cost: record.normalized_unit_cost,
        order_unit_price: record.order_unit_price,
        qty_per_unit: record.qty_per_unit,
        inventory_item_id: record.inventory_item_id,
        vendor_id: record.vendor_id,
      },
    })),
    last_confirmed_at: context.now,
    created_at: context.now,
    updated_at: context.now,
  };
}

function buildUnstableVendorPricingPattern(
  series: PriceSeries,
  signals: DerivedSignal[],
  context: IntelligenceJobContext,
  thresholdBundle: ResolvedPriceThresholdBundle,
): PatternObservation {
  const thresholds = thresholdBundle.thresholds;
  const observationCount = signals.length;
  const confidenceScore = resolvePatternConfidenceScore(observationCount, thresholds.pattern_signal_threshold);
  const latestSignal = [...signals].sort((a, b) => compareIso(a.observed_at, b.observed_at)).at(-1)!;
  const maxVolatility = Math.max(
    ...signals.map((signal) => Number(signal.signal_payload['volatility_pct_range'] ?? 0)),
  );

  return {
    id: `UNSTABLE_VENDOR_PRICING:${series.vendor_item_key}:${latestSignal.observed_at}`,
    pattern_type: 'UNSTABLE_VENDOR_PRICING',
    rule_version: context.ruleVersion,
    subject_type: 'inventory_item',
    subject_id: series.inventory_item_id,
    subject_key: series.vendor_item_key,
    status: 'Active',
    severity_label: resolveVolatilitySeverity(maxVolatility, thresholds),
    confidence_label: defaultConfidenceLabel(confidenceScore),
    confidence_score: confidenceScore,
    observation_count: observationCount,
    first_observed_at: [...signals].sort((a, b) => compareIso(a.observed_at, b.observed_at))[0]?.observed_at ?? null,
    last_observed_at: latestSignal.observed_at,
    organization_id: context.scope.organizationId ?? null,
    location_id: context.scope.locationId ?? null,
    operation_unit_id: context.scope.operationUnitId ?? null,
    storage_area_id: context.scope.storageAreaId ?? null,
    inventory_item_id: series.inventory_item_id,
    recipe_id: null,
    vendor_id: series.vendor_id,
    vendor_item_id: latestSignal.vendor_item_id,
    evidence_count: signals.reduce((total, signal) => total + (signal.evidence_count ?? signal.evidence.length), 0),
    signal_ids: signals.map((signal) => signal.id),
    pattern_payload: {
      rule_version: context.ruleVersion,
      vendor_item_key: series.vendor_item_key,
      vendor_name: series.vendor_name,
      inventory_item_name: series.inventory_item_name,
      category: series.category,
      recurrence_count: observationCount,
      recurrence_window_days: thresholds.recurrence_window_days,
      threshold_explainability: buildThresholdExplainabilityPayload(
        thresholdBundle,
        ['pattern_signal_threshold', 'recurrence_window_days', 'volatility_threshold', 'immediate_volatility_threshold'],
      ),
      latest_window_start: latestSignal.window_start,
      latest_window_end: latestSignal.window_end,
      max_volatility_pct_range: maxVolatility,
      evidence_refs: signals.flatMap((signal) => signal.evidence),
    },
    last_confirmed_at: context.now,
    created_at: context.now,
    updated_at: context.now,
  };
}

function buildReviewVendorRecommendation(
  series: PriceSeries,
  pattern: PatternObservation,
  context: IntelligenceJobContext,
  dedupeKey: string,
): Recommendation {
  const urgencyLabel = resolveRecommendationUrgency(pattern.confidence_label, pattern.severity_label);
  const recurrenceCount = Number(pattern.pattern_payload['recurrence_count'] ?? pattern.observation_count);
  const maxVolatility = Number(pattern.pattern_payload['max_volatility_pct_range'] ?? 0);

  return {
    id: `REVIEW_VENDOR:${series.vendor_item_key}:${pattern.last_observed_at}`,
    recommendation_type: 'REVIEW_VENDOR',
    rule_version: context.ruleVersion,
    subject_type: 'vendor',
    subject_id: series.vendor_id,
    subject_key: series.vendor_item_key,
    status: 'OPEN',
    severity_label: pattern.severity_label,
    confidence_label: pattern.confidence_label,
    urgency_label: urgencyLabel,
    confidence_score: pattern.confidence_score,
    summary: `Review ${series.vendor_name} pricing for ${series.inventory_item_name}. Unit cost volatility repeated ${recurrenceCount} times and reached ${(maxVolatility * 100).toFixed(1)}% across the recent pricing window.`,
    organization_id: context.scope.organizationId ?? null,
    location_id: context.scope.locationId ?? null,
    operation_unit_id: context.scope.operationUnitId ?? null,
    storage_area_id: context.scope.storageAreaId ?? null,
    inventory_item_id: series.inventory_item_id,
    recipe_id: null,
    vendor_id: series.vendor_id,
    vendor_item_id: pattern.vendor_item_id,
    dedupe_key: dedupeKey,
    superseded_by_recommendation_id: null,
    evidence_count: 0,
    expected_benefit_payload: {
      benefit_type: 'cost_stability',
      vendor_id: series.vendor_id,
      inventory_item_id: series.inventory_item_id,
      volatility_pct_range: maxVolatility,
      recurrence_count: recurrenceCount,
    },
    operator_action_payload: {
      rule_version: context.ruleVersion,
      assigned_role: 'Purchasing Owner',
      suggested_steps: [
        'Review recent invoice prices for this supplier SKU.',
        'Check alternate vendor items or pack definitions for the same inventory item.',
        'Confirm whether the current vendor should remain preferred for this item.',
      ],
      due_in_days: urgencyLabel === 'IMMEDIATE' ? 1 : urgencyLabel === 'THIS_WEEK' ? 7 : 14,
    },
    evidence: [],
    opened_at: context.now,
    due_at: urgencyLabel === 'IMMEDIATE' ? context.now : null,
    closed_at: null,
    last_confirmed_at: context.now,
    created_at: context.now,
    updated_at: context.now,
  };
}

function buildRecommendationEvidence(
  recommendation: Recommendation,
  pattern: PatternObservation,
  volatilitySignal: DerivedSignal,
  series: PriceSeries,
): RecommendationEvidence[] {
  const volatilityPayload = volatilitySignal.signal_payload;
  const sourceVendorPriceIds = Array.isArray(volatilityPayload['source_vendor_price_ids'])
    ? (volatilityPayload['source_vendor_price_ids'] as number[])
    : [];

  const evidence: RecommendationEvidence[] = [
    {
      id: `${recommendation.id}:pattern`,
      recommendation_id: recommendation.id,
      evidence_type: 'pattern_summary',
      evidence_ref_table: 'pattern_observations',
      evidence_ref_id: String(pattern.id),
      explanation_text: `Pattern ${pattern.pattern_type} reached ${pattern.observation_count} observations for ${series.inventory_item_name} from ${series.vendor_name}. Latest volatility window ran ${volatilitySignal.window_start} to ${volatilitySignal.window_end} with ${(Number(volatilityPayload['volatility_pct_range'] ?? 0) * 100).toFixed(1)}% range.`,
      evidence_weight: 1,
      created_at: recommendation.created_at,
    },
  ];

  for (const vendorPriceId of sourceVendorPriceIds) {
    evidence.push({
      id: `${recommendation.id}:vendor-price:${vendorPriceId}`,
      recommendation_id: recommendation.id,
      evidence_type: 'vendor_price_record',
      evidence_ref_table: 'vendor_prices',
      evidence_ref_id: String(vendorPriceId),
      explanation_text: `Vendor price record ${vendorPriceId} is part of the volatility window for ${series.inventory_item_name} from ${series.vendor_name} between ${volatilitySignal.window_start} and ${volatilitySignal.window_end}.`,
      evidence_weight: 0.8,
      created_at: recommendation.created_at,
    });
  }

  return evidence;
}

function calculateVolatilityMetrics(
  records: NormalizedVendorPriceRecord[],
  latestObservedAt: string,
  thresholds: PriceThresholdRuleSet,
): VolatilityMetrics | null {
  const windowStart = subtractDays(latestObservedAt, thresholds.recurrence_window_days);
  const windowStartTs = Date.parse(windowStart);
  const latestObservedAtTs = Date.parse(latestObservedAt);
  const recentRecords = records.filter((record) => {
    const observedAtTs = Date.parse(record.observed_at);
    return observedAtTs >= windowStartTs && observedAtTs <= latestObservedAtTs;
  });
  if (recentRecords.length < thresholds.minimum_evidence_count) {
    return null;
  }

  const costs = recentRecords.map((record) => record.normalized_unit_cost);
  const minPrice = Math.min(...costs);
  const maxPrice = Math.max(...costs);
  if (minPrice <= 0) {
    return null;
  }

  const averagePrice = costs.reduce((sum, value) => sum + value, 0) / costs.length;
  return {
    observationCount: recentRecords.length,
    minPrice,
    maxPrice,
    averagePrice,
    pctRange: (maxPrice - minPrice) / minPrice,
    windowStart,
    windowEnd: latestObservedAt,
    records: recentRecords,
  };
}

function resolvePriceChangeSeverity(magnitudePct: number, absoluteDelta: number, thresholds: PriceThresholdRuleSet): SeverityLabel {
  if (
    magnitudePct >= thresholds.immediate_pct_threshold * 1.5
    || absoluteDelta >= thresholds.immediate_abs_threshold * 1.5
  ) {
    return 'critical';
  }
  if (magnitudePct >= thresholds.immediate_pct_threshold || absoluteDelta >= thresholds.immediate_abs_threshold) {
    return 'high';
  }
  if (magnitudePct >= Math.min(thresholds.percent_increase_threshold, thresholds.percent_drop_threshold) * 1.5) {
    return 'medium';
  }
  return 'low';
}

function resolveVolatilitySeverity(pctRange: number, thresholds: PriceThresholdRuleSet): SeverityLabel {
  if (pctRange >= thresholds.immediate_volatility_threshold * 1.5) {
    return 'critical';
  }
  if (pctRange >= thresholds.immediate_volatility_threshold) {
    return 'high';
  }
  if (pctRange >= thresholds.volatility_threshold * 1.5) {
    return 'medium';
  }
  return 'low';
}

function resolveChangeConfidenceScore(
  seriesLength: number,
  latestObservedAt: string,
  priorObservedAt: string,
  thresholds: PriceThresholdRuleSet,
): number {
  let score = 0.3;
  if (seriesLength >= 3) {
    score += 0.1;
  }
  if (seriesLength >= 5) {
    score += 0.15;
  }
  if (Date.parse(priorObservedAt) >= Date.parse(subtractDays(latestObservedAt, thresholds.recurrence_window_days))) {
    score += 0.1;
  }
  return roundScore(Math.min(score, 0.8));
}

function resolveVolatilityConfidenceScore(observationCount: number, minimumEvidenceCount: number): number {
  const extraObservations = Math.max(0, observationCount - minimumEvidenceCount);
  return roundScore(Math.min(0.4 + extraObservations * 0.15, 0.85));
}

function resolvePatternConfidenceScore(observationCount: number, patternSignalThreshold: number): number {
  const extraSignals = Math.max(0, observationCount - patternSignalThreshold);
  return roundScore(Math.min(0.45 + extraSignals * 0.18, 0.9));
}

function resolveRecommendationUrgency(confidenceLabel: ConfidenceLabel, severityLabel: SeverityLabel): UrgencyLabel {
  if (confidenceLabel === 'Stable pattern' && (severityLabel === 'high' || severityLabel === 'critical')) {
    return 'IMMEDIATE';
  }
  if (
    confidenceLabel === 'Stable pattern' ||
    (confidenceLabel === 'Emerging pattern' && (severityLabel === 'medium' || severityLabel === 'high' || severityLabel === 'critical'))
  ) {
    return 'THIS_WEEK';
  }
  return 'MONITOR';
}

function buildRecommendationDedupeKey(series: PriceSeries, context: IntelligenceJobContext): string {
  return [
    'REVIEW_VENDOR',
    `vendor:${series.vendor_id}`,
    `item:${series.inventory_item_id}`,
    `vendor-item:${series.vendor_item_key}`,
    `location:${context.scope.locationId ?? 'all'}`,
    `operation-unit:${context.scope.operationUnitId ?? 'all'}`,
  ].join('|');
}

function incrementCounter(
  counters: IntelligenceRunCounters,
  action: 'created' | 'updated',
  bucket: 'signals' | 'patterns' | 'recommendations',
): void {
  if (bucket === 'signals') {
    if (action === 'created') {
      counters.signals_created += 1;
    } else {
      counters.signals_updated += 1;
    }
    return;
  }

  if (bucket === 'patterns') {
    if (action === 'created') {
      counters.patterns_created += 1;
    } else {
      counters.patterns_updated += 1;
    }
    return;
  }

  if (action === 'created') {
    counters.recommendations_created += 1;
  } else {
    counters.recommendations_updated += 1;
  }
}

function dedupeSignalsById(signals: DerivedSignal[]): DerivedSignal[] {
  const seen = new Set<string>();
  const deduped: DerivedSignal[] = [];

  for (const signal of signals) {
    const key = String(signal.id);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(signal);
  }

  return deduped.sort((a, b) => compareIso(a.observed_at, b.observed_at));
}

function subtractDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function compareIso(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

function roundScore(score: number): number {
  return Math.round(score * 10000) / 10000;
}
