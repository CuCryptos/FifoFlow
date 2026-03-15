# Recommendation Synthesis Architecture

## Purpose
FIFOFlow's recommendation layer turns trusted observations into explicit operator actions.

Signals answer what happened.
Recommendations answer what should likely be done next.

This layer sits after persisted signal generation and before memo rendering, standards review, and operator workflow tooling.

## Why this layer exists
A memo built only from signals still leaves an operator to translate observations into action. That does not scale cleanly across locations or packs.

Recommendation synthesis creates:
- deterministic action objects
- explicit likely owner routing
- durable evidence linkage
- memo-ready summaries
- later handoff into standards governance

## Inputs
This first phase is signals-first.

Current live inputs:
- Price Intelligence signals
- Recipe Cost Drift signals
- Variance Intelligence signals

Future inputs:
- durable cross-pack patterns
- recommendation review outcomes
- benchmark-aware operating context

## Synthesis flow
persisted signals / patterns
-> recommendation eligibility rules
-> dedupe / supersession logic
-> recommendation persistence
-> memo-ready outputs

Current implementation uses persisted `derived_signals` only. Pattern-driven synthesis is deferred until durable cross-pack pattern coverage is stronger.

## Persistence flow
The synthesis job:
1. reads recent persisted eligible signals
2. evaluates deterministic recommendation rules
3. upserts recommendations through shared intelligence persistence
4. attaches recommendation evidence rows back to the qualifying source signals
5. returns recommendation objects that are already durable and memo-ready

Recommendations remain separate from:
- signals
- memo items
- standards

## Evidence model
Every synthesized recommendation retains evidence refs to the qualifying source signals.

Evidence records capture:
- evidence type
- source table
- source record id
- explanation text
- evidence weight

This keeps the action explainable without collapsing the recommendation into the signal record.

## Routing expectations
Routing is provisional, not a workflow engine.

Current owner roles:
- Purchasing Owner
- Unit Manager
- Executive Approver

Routing is assigned from rule family and severity, then carried in `operator_action_payload` for later memo and workflow use.

## Growth path
This foundation prepares FIFOFlow for:
- weekly memo recommendation-first sections
- operator review queues
- standards review candidates
- governance promotion later

It does not yet implement:
- recommendation review UI
- standards lifecycle automation
- benchmark-aware recommendation synthesis
- delivery surfaces
