# FIFOFlow Pattern and Confidence Model

Patterns are not single events. They are repeated operational conditions assembled from deterministic signals.

## What a pattern is

A pattern is an aggregate record that groups related signals across a defined time window and scope. It exists to distinguish noise from repeated operational behavior.

A pattern should answer:
- what is repeating
- where it is repeating
- how often it is repeating
- whether confidence is rising or falling
- whether operators acted and the condition improved

## How signals aggregate into patterns

Signals roll into patterns when they share:
- the same pattern family or compatible signal set
- the same primary subject, such as an inventory item, vendor item, recipe, or storage area
- the same relevant scope, such as one location or operation unit
- a valid aggregation window, such as 14, 30, or 60 days

Examples:
- multiple `COUNT_VARIANCE` signals on the same item and storage area become a repeated count variance pattern
- repeated `PRICE_INCREASE` and `PRICE_VOLATILITY` signals on the same vendor item become an unstable pricing pattern
- multiple `UNMAPPED_PURCHASE` signals from the same vendor item text become a repeated unmapped purchase pattern

## Confidence label system

Confidence labels describe how much evidence supports a pattern. Confidence is about certainty, not business urgency.

### Early signal

Use when:
- there is a first observation or weak evidence set
- the pattern is plausible but not repeated enough for strong operational action
- there are unresolved mapping or unit issues

Typical characteristics:
- 1 to 2 relevant signals
- short history window
- low cross-source agreement

### Emerging pattern

Use when:
- the condition has repeated enough to warrant operator review
- evidence is consistent across multiple observations or sources
- unresolved data-quality issues are limited

Typical characteristics:
- 3 to 5 relevant signals
- recurrence over at least two operating periods
- stable subject mapping

### Stable pattern

Use when:
- the condition is repeated, consistent, and evidence is strong
- the system can support a recommendation with high traceability
- the pattern persists after normal operational noise is accounted for

Typical characteristics:
- 5 or more relevant signals or strong multi-source agreement
- long enough time window to establish recurrence
- clean mapping and unit normalization

## Confidence score inputs

Confidence score should be calculated from explainable components, for example a weighted 0 to 1 score.

Suggested inputs:
- observation count
- recency of latest observation
- duration of repeated behavior
- source agreement across invoices, counts, waste, or recipes
- unit normalization quality
- mapping quality for vendor items and recipe ingredients
- whether a human review already confirmed the underlying data relationship
- whether the condition persists after a recommendation was acted on

Suggested scoring interpretation:
- `0.00 - 0.39`: Early signal
- `0.40 - 0.74`: Emerging pattern
- `0.75 - 1.00`: Stable pattern

## Confidence vs severity

These are different fields and should not be merged.

- Confidence answers: how sure are we that the condition is real?
- Severity answers: how much operational or financial impact does the condition carry?

Examples:
- a small but well-proven price drift may be high confidence and low severity
- a suspected unmapped premium seafood purchase may be low confidence and high severity until reviewed

## Pattern lifecycle

### Active

The condition is currently repeating or recently observed and should influence recommendations.

### Monitoring

The condition has weakened or operator action is in progress, but FIFOFlow is still watching to see if it resolves.

### Resolved

The condition stopped repeating and evidence suggests the operational problem improved.

### Retired

The pattern is no longer relevant because the subject was discontinued, merged, replaced, or the rule was superseded.

## Example thresholds

Thresholds should be configurable later, but FIFOFlow needs initial defaults.

### Repeated variance

Candidate pattern: repeated count variance
- aggregate when `COUNT_VARIANCE` occurs on the same item and storage area in `3 of 5` recent count sessions
- mark `Emerging pattern` if average absolute variance exceeds `8%`
- mark `Stable pattern` if average absolute variance exceeds `8%` and recurrence persists across `5+` sessions

### Unstable pricing

Candidate pattern: unstable vendor pricing
- aggregate when price observations exist in at least `4` invoices over `60` days
- mark `Emerging pattern` if normalized price range exceeds `10%`
- mark `Stable pattern` if normalized price range exceeds `15%` or coefficient of variation exceeds configured threshold with `6+` observations

### Recurring waste

Candidate pattern: recurring waste condition
- aggregate when `WASTE_SPIKE` or waste-over-baseline conditions occur in `2` consecutive weekly windows
- mark `Emerging pattern` when the current period exceeds baseline by `50%`
- mark `Stable pattern` when the current period exceeds baseline by `50%` in `3 of 4` weeks

### Repeated unmapped purchases

Candidate pattern: recurring unmapped vendor item
- aggregate when the same raw line text or same vendor SKU is unresolved in `2` invoices
- mark `Emerging pattern` at `2` occurrences in `30` days
- mark `Stable pattern` at `4+` occurrences or when unresolved spend crosses a high-spend threshold

## Pattern record expectations

Each pattern record should include:
- `pattern_type`
- `subject_type`
- `subject_id`
- `scope_context`
- `signal_types`
- `observation_count`
- `window_start`
- `window_end`
- `first_observed_at`
- `last_observed_at`
- `confidence_score`
- `confidence_label`
- `severity_label`
- `status`
- `evidence_rollup`
- `rule_version`

## Operational use

Patterns are the operating bridge between detection and action. Signals tell FIFOFlow what happened. Patterns tell FIFOFlow whether it is likely to keep happening. Recommendations should be created from patterns, not isolated signals, except for urgent single-event conditions like a severe price spike or a critical unmapped purchase.
