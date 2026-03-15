import type { IntelligenceJobContext, IntelligenceJobDefinition, IntelligenceJobResult } from './types.js';

export const purchasingIntelligenceJobDefinition: IntelligenceJobDefinition = {
  jobName: 'purchasing-intelligence-job',
  purpose: 'Compare purchasing behavior to theoretical demand, par expectations, and mapping completeness.',
  expectedInputs: [
    'purchase_orders',
    'purchase_order_lines',
    'invoice_lines',
    'forecast_lines',
    'menu_item_recipe_mappings',
    'recipe_ingredients',
  ],
  expectedOutputs: [
    'UNMAPPED_PURCHASE signals',
    'PURCHASE_TO_THEORETICAL_MISMATCH signals',
    'OVER_ORDER_PATTERN_CANDIDATE signals',
    'UNDER_ORDER_PATTERN_CANDIDATE signals',
  ],
  todos: [
    'Build theoretical demand snapshots per inventory item and operation unit.',
    'Compare normalized purchases against demand and par coverage windows.',
    'Emit review items for unmapped vendor items and blocked demand coverage.',
  ],
};

export async function runPurchasingIntelligenceJob(_context: IntelligenceJobContext): Promise<IntelligenceJobResult> {
  return {
    signals: [],
    notes: [
      'Placeholder only. This job will synthesize purchasing discipline signals from order, invoice, and theoretical demand data.',
    ],
  };
}
