# Scoped Policy and Benchmarking Implementation

## Implemented in this phase
- draft scoped policy schema
- draft benchmarking and peer-group schema
- SQLite bootstrap for both platform layers
- deterministic policy resolution engine with explanation path
- peer-group resolver
- benchmark scope lookup scaffolding
- SQLite-backed tests for precedence, effective dates, and membership lookup

## Scope model
The runtime subject scope context supports:
- organization
- location
- operation unit
- storage area
- inventory category
- recipe group
- peer groups
- exact subject entity override

## Policy precedence model
Resolution order is:
1. exact subject entity
2. operation-unit, storage-area, inventory-category, recipe-group, peer-group
3. location
4. organization
5. global

## Peer-group model
Peer groups are explicit membership records. They are not inferred heuristics. Benchmark lookup can use those memberships to find applicable scoped benchmark definitions.

## Benchmark model
This phase scaffolds benchmark definitions and scopes only. It does not compute benchmark observations yet.

## How future packs should consume this layer
- Price Intelligence: replace pack-local threshold lookup with resolved policy values by category and location scope
- Recipe Cost Drift: resolve thresholds by recipe group and operation unit scope
- Variance and Waste: resolve thresholds by operation unit, storage area, and peer group
- Weekly memo: resolve urgency routing and owner defaults by scope
- Standards workflow: attach inheritance and review rules to the same scope model

## Current limitations
- no admin tooling
- no write-side CRUD workflow beyond repository scaffolding and tests
- no benchmark snapshot computation yet
- existing intelligence packs are not refactored to consume this layer in this phase

## Blockers before full admin tooling exists
- policy write workflows and validation
- benchmark snapshot generation
- scoped standards persistence that reuses the same scope model
- migration of existing pack-local threshold configs into policy rows
