# Recipe Cost Drift Policy Integration

## Purpose
Recipe Cost Drift is the next live FIFOFlow pack to move off pack-local threshold config and onto the shared scoped policy layer. Multi-location recipe programs cannot rely on one hard-coded drift rule set without creating false alerts, missed alerts, and expensive rewrites.

## Why this moved first
Recipe Cost Drift already evaluates trusted comparable snapshots with deterministic rules. That makes it a clean fit for policy-backed thresholds:
- snapshot trust rules stay unchanged
- comparable-window rules stay unchanged
- only threshold selection moves to scoped policy resolution

## Subject scope construction
For each trusted recipe snapshot comparison, FIFOFlow builds a subject scope context using the current runtime data available today:
- `organization_id`: from the job context
- `location_id`: from the job context
- `operation_unit_id`: from the job context
- `recipe_group_key`: from `recipe_type` on the current snapshot
- `subject_entity_type`: `recipe`
- `subject_entity_id`: `recipe_id`

Current assumption:
- formal `recipe_group_id` is not yet populated consistently in the live runtime
- `recipe_type` is therefore the safe scoped key for recipe-group-like overrides in this phase

## Threshold resolution flow
`trusted current recipe snapshot`
-> `trusted prior comparable snapshot`
-> `recipe subject scope context`
-> `policy resolution`
-> `threshold bundle`
-> `drift evaluation`
-> `persisted drift signals with threshold explanation`

## What changed
Recipe Cost Drift now resolves thresholds through the shared policy engine before evaluating each comparable recipe:
- `recipe_cost_drift_pct_threshold`
- `recipe_cost_drift_abs_threshold`
- `ingredient_cost_driver_abs_threshold`
- `ingredient_cost_driver_pct_of_total_delta_threshold`
- `recipe_cost_min_prior_snapshot_age_days`
- `recipe_cost_immediate_pct_threshold`
- `recipe_cost_immediate_abs_threshold`
- `recipe_cost_repeat_suppression_days`

The static drift config remains in code only as explicit fallback defaults.

## Fallback behavior
If no active numeric policy row resolves for a required key:
- FIFOFlow falls back to the explicit default threshold bundle in code
- the fallback is recorded in threshold metadata
- the run notes include a fallback note for the evaluated recipe

This is deliberate. Missing policy data must not look like a silent policy success.

## Explainability requirements
Drift signals now retain threshold explainability payloads so FIFOFlow can later answer:
- which threshold values were used
- which policy keys resolved them
- which scope matched
- whether fallback defaults were used
- why the selected scope won by precedence

## Separation from benchmarking and standards
This phase uses policy only.
It does not:
- use peer-group benchmarking
- use standards inheritance
- route memo urgency

Those remain separate platform layers.

## Forward path
This integration sets the pattern for:
- Variance Intelligence thresholds
- Waste Intelligence thresholds
- weekly memo urgency and routing policy
- richer recipe-group policies once canonical recipe grouping is live
