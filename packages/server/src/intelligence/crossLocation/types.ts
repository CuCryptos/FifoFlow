export type CrossLocationSignalType =
  | 'LOCATION_VARIANCE_OUTLIER'
  | 'LOCATION_PRICE_OUTLIER'
  | 'LOCATION_WASTE_OUTLIER'
  | 'LOCATION_DISCIPLINE_OUTLIER';

export type CrossLocationPatternType =
  | 'HIGH_VARIANCE_LOCATION'
  | 'BEST_PRACTICE_LOCATION'
  | 'WASTE_OUTLIER_LOCATION'
  | 'HIGH_PRICE_PRESSURE_LOCATION'
  | 'DISCIPLINE_GAP_LOCATION';

export type CrossLocationRecommendationType =
  | 'STANDARDIZE_VENDOR_STRATEGY'
  | 'PROPAGATE_BEST_PRACTICE'
  | 'REVIEW_LOCATION_COUNT_STANDARD'
  | 'REVIEW_LOCATION_WASTE_PROCESS'
  | 'REVIEW_OPERATION_UNIT_PAR_STRATEGY';

export interface CrossLocationJobDefinition {
  jobName: 'cross-location-benchmark-job' | 'best-practice-discovery-job';
  purpose: string;
  requiredInputs: string[];
  expectedOutputs: string[];
  todos: string[];
}
