# Recommendation Rule Catalog

## Rule Set
This phase implements deterministic recommendation rules across live persisted signals.

### REVIEW_VENDOR
Source signals:
- `PRICE_INCREASE`
- `PRICE_VOLATILITY`

Eligibility:
- `PRICE_INCREASE`: severity `high` or `critical`
- `PRICE_VOLATILITY`: severity above `low` and recurrence evidence of at least 3 observations

Logic:
- create or update a vendor review action for the scoped vendor-item case
- attach the qualifying price signal as evidence

Likely owner:
- `Purchasing Owner`

Summary pattern:
- `Review <vendor> pricing for <item>.`

Evidence requirements:
- qualifying price signal id

### REVIEW_RECIPE_MARGIN
Source signals:
- `RECIPE_COST_DRIFT`
- `INGREDIENT_COST_DRIVER`

Eligibility:
- severity `high` or `critical`
- or a material delta cost above the current bounded minimum

Logic:
- create or update a recipe-level margin review action
- recipe drift and ingredient-driver signals collapse into the same recipe recommendation case by recipe and scope

Likely owner:
- `Unit Manager`
- escalate to `Executive Approver` for critical cases

Summary pattern:
- `Review recipe margin for <recipe>.`

Evidence requirements:
- qualifying recipe-cost signal id

### INVESTIGATE_VARIANCE
Source signals:
- `COUNT_VARIANCE`

Eligibility:
- severity `high` or `critical`
- or materially large single variance by quantity or cost

Logic:
- create an immediate investigation action for the counted inventory item case

Likely owner:
- `Unit Manager`

Summary pattern:
- `Investigate count variance for <item>.`

Evidence requirements:
- qualifying count variance signal id

### ENFORCE_CYCLE_COUNT
Source signals:
- `COUNT_INCONSISTENCY`

Eligibility:
- recurrence at or above 3
- severity `medium` or above
- not already strong enough to escalate into `REVIEW_COUNT_DISCIPLINE`

Logic:
- create or update tighter cycle-count follow-up for the scoped inventory item case

Likely owner:
- `Unit Manager`

Summary pattern:
- `Enforce tighter cycle count follow-up for <item>.`

Evidence requirements:
- qualifying inconsistency signal id

### REVIEW_COUNT_DISCIPLINE
Source signals:
- `COUNT_INCONSISTENCY`

Eligibility:
- severity `high` or `critical`
- or stronger recurrence beyond the basic enforcement rule

Logic:
- escalate repeated inconsistency into a broader count-discipline review

Likely owner:
- `Unit Manager`
- `Executive Approver` for critical cases

Summary pattern:
- `Review count discipline for <item>.`

Evidence requirements:
- qualifying inconsistency signal id

## Non-creation cases
No recommendation is created when:
- signal severity is below rule threshold
- recurrence evidence is insufficient
- the signal family is not in the current live pack set
- the signal does not have enough materiality for an operator action
