# Recipe Cost Drift Implementation

## Implemented logic

The current pack evaluates trusted comparable recipe-cost snapshots and emits:

- `RECIPE_COST_DRIFT`
- `INGREDIENT_COST_DRIVER`

Runtime files:

- `/Users/curtisvaughan/FifoFlow/packages/server/src/intelligence/recipeCost/recipeCostThresholds.ts`
- `/Users/curtisvaughan/FifoFlow/packages/server/src/intelligence/recipeCost/recipeCostDriftEngine.ts`
- `/Users/curtisvaughan/FifoFlow/packages/server/src/intelligence/recipeCost/recipeCostDriftJob.ts`

## Trust gating rules

The implementation refuses signal emission when:

- current snapshot is not `complete + high`
- prior trusted comparable snapshot is missing
- prior snapshot is not `complete + high`
- comparison output is not comparable
- total delta fields are missing
- recipe delta is not positive
- recipe delta is below material thresholds
- ingredient delta is missing, non-positive, or below driver thresholds

## Persistence behavior

Signals are persisted through the shared intelligence repository into `derived_signals`.

The pack uses the existing run log path in `intelligence_runs`.

This keeps recipe-cost signals on the same durable intelligence substrate as price signals.

## Idempotency model

Idempotency relies on the existing `derived_signals` dedupe behavior.

Signal identity is effectively scoped by:

- signal type
- recipe subject key
- comparison window start and end
- magnitude value

Rerunning the same trusted comparison updates the existing signal instead of duplicating it.

## Evidence shape

### RECIPE_COST_DRIFT

Payload and evidence include:

- recipe identity
- current snapshot id
- prior snapshot id
- current total cost
- prior total cost
- delta cost
- delta percent
- trust metadata
- primary driver summary

### INGREDIENT_COST_DRIVER

Payload and evidence include:

- recipe identity
- ingredient item identity
- current and prior component cost
- ingredient delta cost
- ingredient delta percent
- contribution to total recipe delta
- current snapshot id
- prior snapshot id

## Limitations

- upward drift only in this phase
- no recommendations emitted yet
- no recipe-group override model yet
- no separate evidence table for signals beyond persisted evidence payloads
- no memo ranking logic yet

## Blockers before recommendations

Recipe-cost recommendations should wait for:

1. threshold tuning against real operating data
2. policy for repeated drift vs one-time spike handling
3. stronger invoice-linked cost coverage
4. canonical recipe-group hierarchy
5. manual override governance for ingredient cost sources
