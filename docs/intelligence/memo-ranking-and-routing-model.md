# Memo Ranking And Routing Model

## Ranking model
Memo ranking is deterministic and additive.

Current score components:
- severity score
- urgency score
- confidence score
- recurrence score
- freshness score
- impact score
- evidence score
- fallback penalty

## Ranking factors
### Severity
- `critical` > `high` > `medium` > `low`

### Urgency
Derived deterministically from signal behavior:
- `critical` -> `IMMEDIATE`
- `high` -> `THIS_WEEK`
- recurring operational signals like `COUNT_INCONSISTENCY` and `PRICE_VOLATILITY` -> at least `THIS_WEEK`
- otherwise `MONITOR`

### Confidence
- `Stable pattern` > `Emerging pattern` > `Early signal`

### Recurrence
Used when signal payload provides repeated-occurrence hints such as:
- `recurrence_count`
- `observation_count`

### Freshness
More recent items rank above stale items inside the memo window.

### Impact hints
Impact scoring uses explicit numeric hints when present, such as:
- recipe delta cost
- ingredient delta cost
- variance cost
- normalized price change absolute value

### Evidence completeness
More evidence refs raise memo confidence modestly.

### Fallback penalty
Signals that relied on policy fallback defaults are still eligible, but receive a small ranking penalty and are also surfaced in `Needs Review / Incomplete Intelligence`.

## Tie-breaking
When total score ties:
1. higher severity wins
2. newer observed time wins
3. stable signal id ordering breaks the remainder

## Routing model
### Signal-family routing
- `PRICE_INCREASE`, `PRICE_DROP`, `PRICE_VOLATILITY` -> `Purchasing Owner`
- `RECIPE_COST_DRIFT`, `INGREDIENT_COST_DRIVER` -> `Unit Manager`, escalating to `Executive Approver` for high-severity cases
- `COUNT_VARIANCE`, `COUNT_INCONSISTENCY` -> `Unit Manager`

### Cross-cutting escalation
Critical or immediate items can route to `Executive Approver` even if their family default is different.

## Provisional status
Routing is intentionally provisional in this phase. It identifies the likely owner lane, not a full workflow assignee.
