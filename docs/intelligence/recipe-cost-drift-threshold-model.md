# Recipe Cost Drift Threshold Model

## Purpose

Recipe cost drift should only be emitted when cost movement is materially meaningful for kitchen operations.

This phase focuses on upward cost pressure.

Negative drift is measured in the comparison layer but is not emitted as a signal here.

## Global defaults

Current defaults:

- `recipe_cost_drift_pct_threshold = 0.08`
- `recipe_cost_drift_abs_threshold = 0.75`
- `ingredient_driver_abs_threshold = 0.35`
- `ingredient_driver_pct_of_total_delta_threshold = 0.30`
- `minimum_prior_snapshot_age_days = 1`
- `repeat_suppression_days = 7`
- `immediate_recipe_cost_drift_pct_threshold = 0.18`
- `immediate_recipe_cost_drift_abs_threshold = 2.00`

## Material recipe drift rule

A recipe drift is material only when both are true:

- absolute delta cost meets threshold
- percent delta meets threshold

Using both avoids noisy signals from:

- large percentage changes on tiny recipes
- large absolute changes on extremely expensive recipes where the percentage shift is not meaningful

## Material ingredient driver rule

An ingredient is a material driver only when both are true:

- ingredient delta cost meets threshold
- ingredient contributes at least the configured share of total recipe delta

This prevents small line movements from becoming false driver signals.

## Overrides

Current implementation supports:

- global defaults
- override hooks keyed by recipe type

This is a temporary bridge until canonical recipe groups exist.

Future override targets should include:

- recipe group
- cuisine family
- operation-unit context

## Minimum prior snapshot age

A prior comparable snapshot must be at least the configured minimum age behind the current snapshot.

This prevents same-day or near-duplicate comparisons from producing operationally weak drift signals.

## Repeat suppression

Current repeat suppression is bounded by the shared signal dedupe model.

That means:

- the same recipe/window/magnitude rerun updates the existing signal
- nearby future windows can still emit new signals if the drift remains real

Cross-window cooldown suppression is intentionally not overbuilt in this phase.
