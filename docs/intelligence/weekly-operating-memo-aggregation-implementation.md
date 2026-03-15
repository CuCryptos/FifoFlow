# Weekly Operating Memo Aggregation Implementation

## What was implemented
- persisted-signal read layer for memo generation
- deterministic cross-pack memo ranking
- memo section grouping
- provisional routing
- structured weekly memo payload
- SQLite-backed memo tests across live signal families

## Ranking model
The current model is additive and explainable. Each item carries a ranking explanation with:
- component scores
- total score
- explicit factors used

## Routing model
Routing is family-based with critical escalation:
- price -> purchasing
- recipe cost -> unit manager or executive
- variance -> unit manager

## Section model
The memo returns ordered sections rather than a flat signal dump. `Top Priority Items` and `Needs Review / Incomplete Intelligence` intentionally cross-cut the family sections.

## Current limitations
- patterns are not yet first-class memo inputs
- recommendations are not yet fused into the memo
- standards review remains placeholder-only
- no render layer or delivery channel is included in this phase

## Next integration targets
- bring recommendation synthesis into memo generation carefully
- add standards-review payloads
- support routing-aware inbox or delivery surfaces
- add benchmark-aware memo slices after peer-group benchmarking is live
