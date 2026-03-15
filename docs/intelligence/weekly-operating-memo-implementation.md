# Weekly Operating Memo Implementation

## What was implemented
FIFOFlow now has a backend weekly memo layer that:
- reads persisted live signals across packs
- ranks them deterministically
- groups them into memo sections
- assigns provisional owner routing
- returns a structured memo payload

## Ranking model
The ranking engine uses explicit weighted components:
- severity
- urgency
- confidence
- recurrence
- freshness
- impact hints
- evidence completeness
- fallback penalty

No opaque scoring or hidden heuristics are used.

## Routing model
Current routing rules are explicit and deterministic:
- price signals -> `Purchasing Owner`
- recipe cost signals -> `Unit Manager` or `Executive Approver`
- count signals -> `Unit Manager`
- immediate / cross-cutting critical items can escalate to `Executive Approver`

## Section model
Current memo sections:
- `Top Priority Items`
- `Price Watch`
- `Recipe Cost Watch`
- `Inventory Discipline`
- `Needs Review / Incomplete Intelligence`
- `Standards Review` placeholder

## Current limitations
- memo currently reads signals only, not durable patterns or recommendations
- standards review is a placeholder section
- ranking uses explicit impact hints from signal payloads where present, but not benchmark context
- routing is provisional and not a workflow engine

## Next integration targets
- fold stable recommendations into memo sections once recommendation synthesis matures
- add standards-review summaries as real memo inputs
- route memo urgency into owner inbox/work queues
- add benchmark-aware executive memo views later

## Blockers before polished operator memo experience
- recommendation synthesis across live packs
- standards governance objects that are memo-ready
- delivery and rendering surfaces
- peer-group benchmarking for comparative memo framing
