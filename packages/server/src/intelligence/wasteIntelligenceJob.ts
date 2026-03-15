import type { IntelligenceJobContext, IntelligenceJobDefinition, IntelligenceJobResult } from './types.js';

export const wasteIntelligenceJobDefinition: IntelligenceJobDefinition = {
  jobName: 'waste-intelligence-job',
  purpose: 'Detect waste spikes and recurring waste conditions by item, recipe, and operation unit.',
  expectedInputs: ['waste_events', 'stock_transactions', 'inventory_items', 'recipes', 'operation_units'],
  expectedOutputs: ['WASTE_SPIKE signals', 'waste patterns'],
  todos: [
    'Establish baseline waste rates by item and operation unit.',
    'Group waste by reason code and period.',
    'Differentiate one-off spoilage from recurring waste conditions.',
  ],
};

export async function runWasteIntelligenceJob(_context: IntelligenceJobContext): Promise<IntelligenceJobResult> {
  return {
    signals: [],
    patterns: [],
    notes: [
      'Placeholder only. This job will detect waste spikes and recurring waste conditions with item and reason evidence.',
    ],
  };
}
