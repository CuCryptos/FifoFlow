# Scoped Policy and Benchmarking Architecture

## Purpose
FIFOFlow needs a first-class scoped policy and benchmarking layer so intelligence packs can vary behavior by operating context without hard-coded exceptions. Single-location defaults break once locations, bars, kitchens, commissaries, and peer groups diverge.

This layer lets every engine answer four questions deterministically:
1. What is the subject scope?
2. What policy applies at that scope?
3. What benchmark or peer group applies at that scope?
4. What standards apply at that scope?

## Why hard-coded thresholds fail
Hard-coded thresholds create three problems:
1. the first exception gets embedded directly in an engine
2. similar exceptions get duplicated across engines
3. cross-location comparisons become inconsistent because each pack resolves context differently

A bar variance threshold, a seafood recipe drift threshold, and a fine-dining peer benchmark must all be modeled as explicit platform data, not scattered conditionals.

## Core concepts
- `policy`: a deterministic rule or threshold value used by an engine
- `benchmark`: a comparison baseline or expected range for a scoped population
- `peer group`: a defined set of comparable locations or operation units
- `standard`: an operating rule or approved practice that may inherit by scope
- `override`: a more specific scoped value that beats a broader default

These are related but not interchangeable.

## Scope dimensions
The platform layer supports these dimensions:
- `organization`
- `location`
- `operation_unit`
- `storage_area`
- `inventory_category`
- `recipe_group`
- `peer_group`
- exact subject entity override when needed

Not every policy or benchmark will use every dimension. The model supports them so packs can grow without schema rewrites.

## Platform role in FIFOFlow
This layer supports:
- Price Intelligence: category and location-specific price thresholds
- Recipe Cost Drift: recipe-group and operation-unit drift thresholds
- Variance Intelligence: bar versus kitchen variance tolerance
- Waste Intelligence: category and storage-area waste sensitivity
- Purchasing Intelligence: peer-aware vendor and pack strategy rules
- Weekly Operating Memo: urgency and routing by resolved scope
- Standards Governance: inherited standards by location, operation unit, or peer group
- Cross-Location Intelligence: comparable peer groups and benchmark anchors
- Margin Engine: scoped thresholds and benchmark baselines for margin pressure

## Example uses
- Bar variance thresholds differ from kitchen variance thresholds.
- Seafood recipe drift thresholds are stricter than pantry prep thresholds.
- Fine-dining kitchens should benchmark against fine-dining peers, not snack bars.
- A bar opening checklist standard may apply to bar operation units only.

## Processing model
1. engine builds a subject scope context
2. engine requests policy resolution by `policy_key`, subject scope, and effective time
3. peer groups are resolved for the subject if benchmarks require them
4. benchmark definitions are looked up for the same scope context
5. engine uses resolved values and records the explanation path

The result is deterministic, inspectable, and reusable across packs.
