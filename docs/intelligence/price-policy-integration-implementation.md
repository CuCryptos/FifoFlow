# Price Policy Integration Implementation

## Implemented
- policy-backed price threshold resolver
- price subject scope construction from job scope plus inventory category key
- explicit fallback to code defaults when policy rows are missing
- threshold explainability metadata written into price signals and patterns
- SQLite-backed tests for scoped policy behavior and engine integration

## Policy keys used
- `price_increase_pct_threshold`
- `price_drop_pct_threshold`
- `price_volatility_threshold`
- `price_min_evidence_count`
- `price_recurrence_window_days`
- `price_pattern_signal_threshold`
- `price_immediate_pct_threshold`
- `price_immediate_abs_threshold`
- `price_volatility_immediate_pct_threshold`

## Scope assumptions
Current Price Intelligence derives scope from:
- job `organizationId`
- job `locationId`
- job `operationUnitId`
- job `inventoryCategoryId` when present
- price record category string as `inventory_category_key`
- exact inventory item subject override via `subject_entity`

## Fallback strategy
If policy data is missing or a resolved value is not numeric, FIFOFlow falls back to the explicit default price threshold config. Fallback use is retained in explainability metadata.

## Explainability path
Signals and patterns now retain threshold explainability payloads containing:
- resolved threshold field
- policy key requested
- final value used
- policy or fallback source
- matched scope metadata
- explanation text

## Current limitations
- category matching currently depends on category key strings unless a canonical category id is supplied
- peer-group-aware price benchmarking is not part of this phase
- policy rows still need seed or admin workflows outside tests

## Next integration targets
- Recipe Cost Drift policy integration
- Variance Intelligence built directly on scoped policy
- weekly memo urgency and routing policy integration
