# Recipe Cost Signal Specification

These are the first deterministic signals the Recipe Cost Intelligence pack should eventually support.

## RECIPE_COST_DRIFT

Purpose:
- detect meaningful change in total trusted recipe cost over time

Required source data:
- current recipe cost snapshot
- prior trusted comparable recipe cost snapshot
- ingredient component breakdowns

Deterministic detection logic:
- compare comparable snapshots for the same recipe or recipe version
- emit when percentage or absolute cost movement exceeds threshold
- only emit when both snapshots meet trust requirements

Evidence payload:
- prior total cost
- current total cost
- pct change
- absolute change
- top driver ingredients
- compared snapshot ids

Severity considerations:
- higher severity for active, high-volume, or high-margin-sensitive recipes

Operator-facing explanation example:
- `Recipe cost for Seared Ahi Plate increased 8.4% since the last trusted snapshot, driven primarily by tuna and sesame oil.`

## INGREDIENT_COST_DRIVER

Purpose:
- identify one ingredient line as a material driver of recipe cost movement

Required source data:
- ingredient cost components across comparable snapshots
- resolved ingredient costs

Deterministic detection logic:
- rank ingredient line deltas by contribution to total recipe cost change
- emit for ingredients whose contribution crosses a configured driver threshold

Evidence payload:
- inventory item id and name
- prior line cost
- current line cost
- contribution pct to total recipe drift
- cost source lineage

Severity considerations:
- higher severity when the ingredient is high-cost, high-usage, or volatile

Operator-facing explanation example:
- `Ahi Tuna contributed 61% of the current recipe cost increase for this dish.`

## RECIPE_COST_INCOMPLETE

Purpose:
- flag recipes whose current cost snapshot is not trustworthy enough for drift or recommendation logic

Required source data:
- recipe cost snapshot
- ingredient resolution logs

Deterministic detection logic:
- emit when missing, ambiguous, or unit-mismatched ingredients prevent a trusted total cost

Evidence payload:
- unresolved ingredient count
- missing cost count
- ambiguous count
- unit mismatch count
- ingredient names causing incompleteness

Severity considerations:
- higher severity for recipes currently used in demand planning, cost review, or margin-sensitive operations

Operator-facing explanation example:
- `Recipe cost for House Champagne Service is incomplete because two ingredients could not be resolved to trusted normalized costs.`

## RECIPE_MARGIN_PRESSURE

Purpose:
- future-facing signal for recipes under combined cost and operational pressure

Required source data:
- recipe cost snapshots
- future margin snapshot layer
- waste, yield, and usage signals

Deterministic detection logic:
- not active in this phase
- should only activate once cost, usage, and margin prerequisites are trustworthy

Evidence payload:
- should eventually include cost, yield, waste, and usage drivers

Severity considerations:
- tied to margin exposure and sales importance

Operator-facing explanation example:
- `Recipe margin pressure is rising because ingredient cost, yield loss, and waste are all moving against standard.`

## What should not trigger drift

Do not emit `RECIPE_COST_DRIFT` when:
- the current or prior snapshot is incomplete
- ingredient costs are stale beyond acceptable fallback rules and confidence is too low
- multiple cost candidates remain ambiguous without deterministic resolution
- unit conversion is unresolved or untrusted
- recipe definition changed materially without a version-aware comparison rule

The cost layer should degrade trust before it emits false confidence.
