import type { CrossLocationJobDefinition } from './types.js';

export const crossLocationBenchmarkJobDefinition: CrossLocationJobDefinition = {
  jobName: 'cross-location-benchmark-job',
  purpose: 'Compare locations and operation units inside peer groups to detect outliers and benchmark observations.',
  requiredInputs: [
    'peer group definitions',
    'benchmark-quality price, variance, waste, and purchasing facts',
    'normalized scopes across locations',
  ],
  expectedOutputs: [
    'benchmark observations',
    'location outlier signals',
    'best-practice candidates',
  ],
  todos: [
    'Define benchmark-quality metric families by peer group.',
    'Normalize for demand and operating context before comparison.',
    'Refuse comparison when evidence quality is weak or peer grouping is invalid.',
  ],
};

export const bestPracticeDiscoveryJobDefinition: CrossLocationJobDefinition = {
  jobName: 'best-practice-discovery-job',
  purpose: 'Identify repeatably strong operating behavior and propose governed propagation to similar locations or operation units.',
  requiredInputs: [
    'benchmark observations',
    'standards and effectiveness history',
    'cross-location peer groups',
  ],
  expectedOutputs: [
    'best-practice candidates',
    'cross-location recommendations',
  ],
  todos: [
    'Require repeated strong performance, not one-off wins.',
    'Attach source-location evidence before proposing propagation.',
    'Respect governance and local override rules.',
  ],
};

export * from './types.js';
