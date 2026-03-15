# Weekly Operating Memo Aggregation

## Purpose
The weekly operating memo is FIFOFlow's primary operator surface. It turns persisted live intelligence into a ranked operating brief instead of forcing operators to scan generic dashboards.

## Why memo beats dashboard
Operators need a short list of what changed, what matters now, and who likely needs to respond. The memo layer therefore:
- filters for memo-eligible live intelligence
- ranks items deterministically across packs
- groups them into operating sections
- assigns provisional owner routing

## Required inputs
This phase reads persisted live signals from:
- Price Intelligence
- Recipe Cost Drift
- Variance Intelligence

Patterns and recommendations remain separate concepts. Signals are sufficient for the first memo foundation.

## Memo generation flow
`persisted signals`
-> `eligibility filters`
-> `ranking`
-> `section grouping`
-> `routing`
-> `memo payload`

## Output shape
The memo payload includes:
- memo window
- top priority items
- ordered memo sections
- ranked items per section
- routing summary
- ranking and eligibility explanation metadata

## Explainability requirements
Every memo item must preserve:
- source signal id and type
- operational summary
- severity, urgency, confidence
- likely owner
- scope summary
- ranking explanation
- evidence refs
- whether threshold fallback defaults were used upstream

## Forward path
This foundation is designed to later support:
- operator workflows
- recommendation synthesis
- standards review routing
- executive summary layers
