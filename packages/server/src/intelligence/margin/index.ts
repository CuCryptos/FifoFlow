import type { MarginJobDefinition } from './types.js';

export const marginSnapshotJobDefinition: MarginJobDefinition = {
  jobName: 'margin-snapshot-job',
  purpose: 'Build theoretical and actual margin snapshots by recipe, menu item, location, and operation unit.',
  requiredInputs: [
    'vendor price history',
    'recipe cost snapshots',
    'yield facts',
    'theoretical usage snapshots',
    'actual usage snapshots',
  ],
  expectedOutputs: ['margin snapshots', 'margin drift signals', 'margin pressure summaries'],
  todos: [
    'Refuse low-trust output when theoretical and actual usage quality is incomplete.',
    'Record demand authority on every margin snapshot.',
    'Separate theoretical margin from actual observed margin explicitly.',
  ],
};

export const marginDriverJobDefinition: MarginJobDefinition = {
  jobName: 'margin-driver-job',
  purpose: 'Explain margin movement in operational terms such as vendor cost, yield loss, waste concentration, and count variance.',
  requiredInputs: [
    'margin snapshots',
    'price intelligence outputs',
    'yield intelligence outputs',
    'waste and variance intelligence outputs',
  ],
  expectedOutputs: ['margin drivers', 'margin recommendations'],
  todos: [
    'Attribute driver contribution by operational cause instead of generic score.',
    'Attach evidence-backed explanation text for every major driver.',
    'Surface only actionable margin pressure, not raw cost noise.',
  ],
};

export * from './types.js';
