# FIFOFlow Standards Promotion Model

Standards are governed operating defaults. They are not raw recommendations and they are not silent machine decisions. They exist because a recommendation was reviewed, adopted, observed in operation, and proven effective enough to formalize.

## Lifecycle

`Suggested -> Adopted -> Proven -> Default -> Retired`

## Lifecycle meaning

### Suggested

A standard candidate exists because evidence supports a repeatable operational change, but no formal approval has been recorded.

### Adopted

A manager approved the standard for a defined scope and effective date. FIFOFlow should now measure whether the change improves outcomes.

### Proven

Post-adoption data shows the standard produced the intended result or materially reduced the targeted operational issue.

### Default

The standard is stable enough to become the preferred default for new locations, operation units, categories, or items within the approved inheritance scope.

### Retired

The standard no longer fits operations because products changed, workflow changed, better standards replaced it, or evidence no longer supports it.

## Promotion rules

A recommendation should become a standard candidate only when:
- evidence is strong enough to justify repeatable application
- scope is clear
- there is an operator role responsible for the standard
- the change can be evaluated against future operational outcomes

Suggested promotion guidance:
- `Suggested -> Adopted`: operator approval and explicit scope selection
- `Adopted -> Proven`: effectiveness review shows improvement against baseline metrics
- `Proven -> Default`: the standard remains effective across enough periods or locations to justify default inheritance
- `Any state -> Retired`: effectiveness falls off, operations changed, or a newer standard supersedes it

## Governance roles

Recommended role model:
- `inventory_lead`: reviews count discipline, storage, and par candidates
- `kitchen_manager`: reviews recipe, prep, waste, and theoretical usage standards
- `bar_manager`: reviews beverage-specific pack, par, and count discipline standards
- `purchasing_manager`: reviews vendor, vendor item, and pricing standards
- `f_and_b_director`: approves broader multi-location defaults and retirement of organization-wide standards

## Scope model

Standards should be explicitly scoped.

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

Scope rules:
- start narrow when evidence is local
- widen only after proof exists across comparable operating contexts
- never auto-upgrade a local standard into an organization-wide default without governance review

## Inheritance model

Inheritance allows proven standards to influence future operations without flattening local context.

Recommended inheritance order:
- organization default
- location override
- operation unit override
- storage area override
- item or recipe exception

Inheritance principles:
- narrower scope overrides broader scope
- inherited defaults remain reviewable
- inherited defaults must record lineage to the standard version they came from

## Standard effectiveness review

Every adopted standard needs an explicit review schedule and evaluation criteria.

Effectiveness review should capture:
- baseline metrics before adoption
- observed metrics after adoption
- review window
- reviewer
- outcome: improved, unchanged, regressed, inconclusive
- notes and follow-up decision

Examples:
- par adjustment reduces stockouts without increasing waste
- preferred vendor standard reduces price volatility
- count discipline standard reduces repeated variance in one storage area
- recipe yield standard narrows theoretical vs actual gap

## Evaluating against future operational data

FIFOFlow should compare post-adoption operations against the same condition the standard intended to improve.

Examples:
- par standard: compare under-order or over-order signals before and after adoption
- vendor standard: compare price volatility and price increase exposure before and after adoption
- count cadence standard: compare count inconsistency and variance rates before and after adoption
- yield standard: compare observed yield drift before and after adoption

## Standard object expectations

A standard should include:
- standard type
- subject type and subject id
- lifecycle state
- version history
- scope references
- source recommendation reference
- effectiveness review cadence
- current active version

## Why this matters

FIFOFlow becomes an operating system when repeated good decisions can be governed, measured, inherited, and revised. Standards are the mechanism that turns recommendations into durable operating behavior.
