export type MarginSignalType =
  | 'MARGIN_DRIFT'
  | 'MARGIN_RISK'
  | 'MARGIN_OPPORTUNITY'
  | 'RECIPE_MARGIN_PRESSURE'
  | 'YIELD_MARGIN_LOSS';

export type MarginRecommendationType =
  | 'REVIEW_MENU_PRICE'
  | 'REVIEW_PORTION_STANDARD'
  | 'REVIEW_VENDOR_COST'
  | 'REVIEW_PREP_YIELD'
  | 'REDUCE_PAR_EXPOSURE';

export interface MarginJobDefinition {
  jobName: 'margin-snapshot-job' | 'margin-driver-job';
  purpose: string;
  requiredInputs: string[];
  expectedOutputs: string[];
  todos: string[];
}
