import type { PriceThresholdConfig } from '@fifoflow/shared';
import type { PolicyRepository } from '../platform/policy/index.js';
import { executePriceIntelligence } from './priceIntelligenceEngine.js';
import type { PriceIntelligenceSource } from './priceRepositories.js';
import type { IntelligencePersistenceRepository } from './persistence/types.js';
import type { IntelligenceJobContext, IntelligenceJobDefinition, IntelligenceJobResult } from './types.js';

export const priceIntelligenceJobDefinition: IntelligenceJobDefinition = {
  jobName: 'price-intelligence-job',
  purpose: 'Detect price movement, volatility, and vendor-item cost instability from invoices and price history.',
  expectedInputs: ['normalized_vendor_price_history', 'scoped price threshold policies', 'historical volatility signals', 'active recommendations'],
  expectedOutputs: [
    'PRICE_INCREASE signals',
    'PRICE_DROP signals',
    'PRICE_VOLATILITY signals',
    'UNSTABLE_VENDOR_PRICING patterns',
    'REVIEW_VENDOR recommendations',
  ],
  todos: [
    'Swap legacy SQLite price history source for canonical vendor item history when the migration lands.',
    'Persist intelligence outputs into canonical intelligence tables once write adapters exist.',
    'Feed REVIEW_VENDOR outputs into the governance and standards loop.',
  ],
};

export interface PriceIntelligenceJobDependencies {
  source: PriceIntelligenceSource;
  repository: IntelligencePersistenceRepository;
  policyRepository?: PolicyRepository;
  thresholdConfig?: PriceThresholdConfig;
}

export async function runPriceIntelligenceJob(
  context: IntelligenceJobContext,
  dependencies: PriceIntelligenceJobDependencies,
): Promise<IntelligenceJobResult> {
  return executePriceIntelligence(context, dependencies);
}
