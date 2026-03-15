# Recipe Cost Intelligence Architecture

Recipe Cost Intelligence is FIFOFlow's deterministic layer for turning recipe definitions and normalized ingredient costs into explainable recipe cost snapshots.

It is not yet a menu margin optimizer. It is the operational cost foundation that allows FIFOFlow to understand:
- current recipe cost
- which ingredients drive that cost
- whether cost inputs are complete, stale, or ambiguous
- whether future drift detection can be trusted

## Purpose of the pack

This pack exists to answer:
- what does this recipe cost right now
- which ingredients contribute most to total cost
- how complete and trustworthy is the cost calculation
- what source data supported each ingredient cost

The pack should not infer future action until the snapshot layer is trustworthy.

## Position in the FIFOFlow intelligence stack

Processing position:
- operational facts: recipes, recipe ingredients, invoice-linked costs, vendor price history, prior trusted snapshots, overrides
- derived facts: ingredient cost resolutions, ingredient cost components, recipe cost snapshots
- future signals: recipe cost drift, ingredient cost drivers, recipe cost incomplete
- future recommendations: recipe review, cost review, yield review, vendor review

Recipe cost belongs in the derived fact layer before recommendations.

## Required source inputs

Required inputs:
- recipe definitions
- recipe ingredient mappings
- inventory item base units
- normalized ingredient cost candidates
- source metadata for those cost candidates
- recipe yield metadata if available
- optional explicit manual cost overrides

Important dependency:
- recipe cost quality depends directly on normalized pricing and unit conversions. If those are weak, snapshot trust must drop accordingly.

## Derived fact flow

`recipe definitions -> normalized ingredient cost resolution -> recipe ingredient cost components -> recipe cost snapshots -> cost drift detection -> future recommendations`

### Recipe definitions

Recipe definitions provide:
- recipe identity
- ingredient quantities and units
- yield quantity and unit if known
- optional serving count if known

### Normalized ingredient cost resolution

Each ingredient cost is resolved in canonical base-unit terms using the approved precedence model.

### Recipe ingredient cost components

Each ingredient line produces a cost component that stores:
- normalized quantity
- normalized unit cost
- line cost
- resolution status
- explanation text
- evidence references

### Recipe cost snapshots

Each recipe snapshot stores:
- total trusted cost if available
- resolved subtotal even when incomplete
- per-yield or per-serving cost when safe
- driver items
- completeness and confidence indicators

### Cost drift detection

This phase is future-facing. Recipe cost drift should only activate once snapshots are durable and prior snapshots are available.

## Persistence flow

Recommended persistence pattern:
- start recipe cost run
- resolve ingredient costs
- persist ingredient resolution logs
- persist ingredient cost components
- upsert recipe cost snapshots
- complete run log with summary counts

The persistence model should follow the same deterministic and idempotent conventions used by price intelligence.

## Explainability requirements

Every recipe cost result must explain:
- which cost source was used for each ingredient
- whether the source was fresh, stale, ambiguous, or missing
- how quantity was normalized into the ingredient base unit
- why the recipe was marked complete, partial, or incomplete

Recipe cost must never silently invent costs to make a snapshot look complete.

## Downstream consumers

### Weekly Operating Memo

Recipe snapshots will eventually feed:
- recipe cost drift sections
- driver ingredient explanations
- incomplete-cost review prompts

### Future margin engine

Recipe cost snapshots are one of the prerequisites for:
- theoretical margin
- recipe margin pressure
- margin-driver decomposition

### Standards governance

Over time, recipe cost intelligence should support governance of:
- recipe yield standards
- preferred vendor standards for recipe-critical ingredients
- portion or prep standards tied to recipe economics

## Dependency on normalized pricing and unit conversions

Recipe cost is only as trustworthy as:
- normalized invoice and vendor price inputs
- canonical base-unit definitions
- trusted pack-to-base-unit conversions
- recipe ingredient unit compatibility

If any of these are weak, the pack should degrade confidence and completeness rather than pretend the recipe is fully costed.
