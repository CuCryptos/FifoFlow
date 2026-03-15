# FIFOFlow Intelligence Engine Architecture

FIFOFlow's intelligence engine is a deterministic operational reasoning system for hospitality inventory. It does not start with vague AI summaries. It starts with operational facts, derives explainable facts from them, detects signals, aggregates repeated conditions into patterns, proposes recommendations, and promotes reviewed recommendations into governed standards.

## Processing loop

`operational facts -> derived facts -> signals -> patterns -> recommendations -> standards -> future evaluation`

Each stage must preserve evidence lineage so an operator can inspect why FIFOFlow said something changed, what is drifting, and what action is being proposed.

## Design principles

- Deterministic first: rules, thresholds, and transforms must be inspectable.
- Evidence-backed outputs: no signal, pattern, recommendation, or standard exists without source references.
- Scope-aware reasoning: conclusions must declare whether they apply at organization, location, operation unit, storage area, category, item, recipe, or vendor scope.
- Separation of concerns: facts, patterns, recommendations, and standards are distinct records.
- Repeatable processing: the same input window should produce the same outputs unless configuration changes.
- Auditability over convenience: operators must be able to trace outcomes back to invoices, counts, transactions, recipes, or forecasts.

## Evidence layer

The evidence layer holds operational records or immutable source references. This is the layer that should answer: what happened.

Primary evidence sources:
- invoices and invoice lines
- vendor items and vendor price history
- purchase orders and lines
- stock transactions
- inventory count sessions and count lines
- waste events
- prep batches and prep consumptions
- recipes, recipe versions, and recipe ingredients
- menu item recipe mappings
- forecasts and forecast lines
- migration lineage and review queue outcomes

Evidence requirements:
- every evidence row has a stable primary key
- every evidence row is scoped to at least one operational context
- every evidence row has an occurrence or effective timestamp
- every evidence row can be attached to a recommendation or standard review later

## Derived fact layer

Derived facts transform raw operational records into normalized, reusable facts. This is the layer that should answer: what is measurably true over a period.

Examples:
- latest effective vendor item price per operation unit
- normalized invoice unit price per inventory item base unit
- recipe cost snapshot by recipe version and effective date
- theoretical usage snapshot by item, date, location, and operation unit
- actual usage snapshot from stock movements and counts
- count variance snapshot by item, storage area, and count session
- waste rate snapshot by item and operation unit
- purchase cadence summary by vendor item and location

Derived fact rules:
- facts are reproducible from operational records
- facts do not invent unsupported quantities
- facts should normalize to canonical base units
- facts may reference multiple source records but must preserve evidence references

## Signal layer

Signals represent deterministic observations worth attention. This is the layer that should answer: what changed.

A signal is a single observation over a stated time window. It should contain:
- signal type
- subject scope
- observed period
- rule identifier or detection logic version
- severity
- confidence label
- evidence summary payload

Examples:
- `PRICE_INCREASE`
- `COUNT_VARIANCE`
- `WASTE_SPIKE`
- `UNMAPPED_PURCHASE`
- `YIELD_DRIFT`

Signals should not prescribe policy. They state that an operational condition occurred.

## Pattern layer

Patterns aggregate related signals across time, scope, or recurrence. This is the layer that should answer: what is drifting or repeating.

A pattern exists when a signal repeats often enough to indicate a non-random operational condition. Patterns must store:
- pattern type
- aggregate subject scope
- first observed and last observed timestamps
- observation count
- active monitoring state
- confidence score and confidence label
- evidence rollup

Examples:
- repeated count variance on one storage area item
- unstable vendor pricing on one supplier SKU
- recurring over-ordering on a prep ingredient
- recurring waste on a recipe-critical protein

## Recommendation layer

Recommendations translate patterns into operator actions. This is the layer that should answer: what needs review or what should change.

Recommendations must be:
- explicit about the proposed action
- tied to evidence and pattern references
- scoped to the operator who can act on them
- separated from standards so rejected recommendations do not mutate policy

Examples:
- `REVIEW_VENDOR`
- `ADJUST_PAR`
- `REQUIRE_CYCLE_COUNT`
- `ADD_RECIPE_MAPPING`
- `REVIEW_RECIPE_COST`

## Standards and governance layer

Standards are reviewed operational defaults that the business chooses to apply. This is the layer that should answer: what standard should we operate under now.

Standards lifecycle:
- `Suggested`
- `Adopted`
- `Proven`
- `Default`
- `Retired`

Governance records must capture:
- who reviewed the recommendation or standard
- what action was taken
- what scope was approved
- when the next effectiveness review is due
- what evidence justified promotion or retirement

## Evidence traceability requirements

Every intelligence output must carry enough metadata to reconstruct its basis:
- source records or source facts
- detection rule version
- scope and time window
- transform assumptions, including unit normalization assumptions
- confidence inputs
- lineage to recommendation and standard decisions when applicable

Recommended minimum lineage chain:
- `source operational row -> derived fact row -> signal -> pattern -> recommendation -> governance action -> standard version`

## Scoping rules

All intelligence outputs must declare one primary scope and may include secondary scopes.

Supported scopes:
- organization
- location
- operation unit
- storage area
- inventory category
- inventory item
- recipe
- vendor
- vendor item
- menu item

Scoping guidance:
- price movements are usually vendor item or inventory item scoped, then rolled up to location or organization
- count variance is usually storage area plus inventory item scoped
- waste is usually operation unit plus inventory item or recipe scoped
- recipe cost drift is recipe version scoped, often surfaced to location and operation unit consumers
- over-order and under-order candidates are location plus inventory item scoped

## Job-oriented processing model

FIFOFlow should process intelligence through bounded jobs with stable inputs and outputs rather than one monolithic service.

Initial jobs:
- price intelligence job
- recipe cost job
- inventory discipline job
- purchasing intelligence job
- waste intelligence job
- recommendation synthesis job
- standards evaluation job

Job model expectations:
- each job declares purpose, required source facts, output artifacts, and rule version
- jobs operate on a bounded time window and scope selection
- jobs emit derived facts, signals, patterns, recommendations, or reviews depending on responsibility
- jobs are rerunnable against preserved data for deterministic verification

## Future evaluation loop

Standards are not the terminal state. Future operational data should be measured against adopted standards.

Evaluation loop:
- a standard changes operator behavior
- future data shows whether variance, waste, pricing exposure, or count discipline improved
- FIFOFlow records effectiveness reviews
- standards are promoted, revised, or retired based on measured outcomes

This keeps FIFOFlow grounded in operations: learn from evidence, recommend from repeated conditions, govern with review, and validate against future results.
