# Recipe Cost Drift Policy Integration Implementation

## What was implemented
FIFOFlow now resolves Recipe Cost Drift thresholds through the shared scoped policy layer before evaluating trusted comparable recipe snapshots.

Implemented pieces:
- policy-key definitions in the drift threshold module
- a dedicated recipe-cost drift threshold policy resolver
- drift-engine integration that resolves thresholds per recipe comparison
- signal explainability payloads showing policy vs fallback resolution
- deterministic SQLite-backed tests for precedence, fallback, effective dating, and drift-engine behavior

## Policy keys used
- `recipe_cost_drift_pct_threshold`
- `recipe_cost_drift_abs_threshold`
- `ingredient_cost_driver_abs_threshold`
- `ingredient_cost_driver_pct_of_total_delta_threshold`
- `recipe_cost_min_prior_snapshot_age_days`
- `recipe_cost_immediate_pct_threshold`
- `recipe_cost_immediate_abs_threshold`
- `recipe_cost_repeat_suppression_days`

## Scope context assumptions
Current live scope construction uses:
- `organization_id` from job context
- `location_id` from job context
- `operation_unit_id` from job context
- `recipe_group_key` from `recipe_type`
- `subject_entity_type = recipe`
- `subject_entity_id = recipe_id`

Limitation:
- live runtime does not yet provide a broadly trusted canonical `recipe_group_id`
- this phase therefore uses `recipe_type` as the scoped recipe-group key

## Fallback strategy
The static drift threshold config remains as an explicit fallback bundle.
Fallback is used only when:
- no policy repository is supplied
- no active policy row matches the subject scope
- a matched policy value is not numeric

Fallback is surfaced in:
- run notes
- per-threshold metadata
- signal `threshold_explainability`

## Explainability path
Recipe drift and ingredient driver signals now preserve:
- threshold values used
- policy keys consulted
- matched scope type and ref
- policy version id when resolved from policy
- explicit fallback markers when defaults were used

## Current limitations
- `repeat_suppression_days` is resolved but not yet used by the live drift engine
- `recipe_group` currently resolves by `recipe_type` key rather than canonical recipe-group identity
- peer-group benchmarking is still separate and not part of drift threshold selection

## Next integration targets
- Variance Intelligence threshold migration onto scoped policy
- weekly memo urgency and routing policy integration
- richer recipe-group policy once canonical recipe-group identity is live everywhere
- benchmark-aware drift interpretation after peer-group benchmark snapshots exist
