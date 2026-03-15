# Recommendation Synthesis Implementation

## What was implemented
FIFOFlow now has a deterministic recommendation synthesis layer that reads persisted live signals and turns qualifying cases into durable recommendation objects.

Implemented components:
- persisted signal read repository
- deterministic rule engine
- recommendation synthesis job
- evidence attachment through shared intelligence persistence
- memo-ready routing and summary payloads

## Rule coverage
Current live rules:
- `REVIEW_VENDOR`
- `REVIEW_RECIPE_MARGIN`
- `INVESTIGATE_VARIANCE`
- `ENFORCE_CYCLE_COUNT`
- `REVIEW_COUNT_DISCIPLINE`

Current live source packs:
- Price Intelligence
- Recipe Cost Drift
- Variance Intelligence

## Lifecycle and dedupe model
Recommendations reuse the shared `recommendations` and `recommendation_evidence` tables.

Behavior:
- create when no active matching case exists
- update when the same active case is reconfirmed
- supersede when the synthesized action changes materially

Recipe margin recommendations intentionally collapse ingredient-driver and recipe-drift signals into the same recipe-level case for the same scope.

## Evidence model
Each recommendation attaches durable evidence rows back to qualifying `derived_signals` records.

This phase does not synthesize recommendations directly from patterns yet.

## Routing model
Routing is stored in `operator_action_payload`.

Current owner mapping:
- price family -> `Purchasing Owner`
- recipe-cost family -> `Unit Manager` or `Executive Approver`
- variance family -> `Unit Manager`, with executive escalation for critical count-discipline cases

## Memo readiness
The resulting recommendation objects already carry:
- summary
- severity
- urgency
- confidence
- owner routing
- scope fields
- evidence refs

That keeps the memo layer free to read recommendations later without re-synthesizing actions.

## Current limitations
- signals-first only; durable pattern inputs are not active yet
- no recommendation review UI
- no standards promotion workflow
- no benchmark-aware recommendation logic
- no delivery or inbox surface
