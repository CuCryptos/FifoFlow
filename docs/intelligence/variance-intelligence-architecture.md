# Variance Intelligence Architecture

## Purpose
Variance Intelligence turns inventory count execution into deterministic operational signals. It identifies count lines that materially diverge from expected quantity and then detects repeated variance for the same inventory subject over time.

## Position in FIFOFlow
This pack sits on top of:
- operational inventory counts
- inventory item identity
- shared scoped policy resolution
- shared intelligence persistence

It does not depend on UI or benchmark logic to produce first-order signals.

## Required source inputs
- `count_sessions`
- `count_entries`
- `items`
- optional expected cost context from current vendor-price data
- scoped variance policy values

## Trust and completeness gates
Variance evaluation is deterministic and gated:
- if counted quantity is missing: no signal
- if expected quantity is missing: no `COUNT_VARIANCE`
- if expected cost context is missing: qty-based variance may still emit
- if insufficient prior variance history exists: no `COUNT_INCONSISTENCY`

FIFOFlow does not invent expected values or cost values.

## Policy-backed threshold resolution
Each evaluated count line resolves thresholds through the shared policy layer using subject scope context:
- `organization_id`
- `location_id`
- `operation_unit_id`
- `storage_area_id`
- `inventory_category`
- subject entity = `inventory_item`

## Signal generation flow
`inventory count session`
-> `count lines`
-> `expected quantity / expected cost context`
-> `variance calculation`
-> `scoped policy resolution`
-> `signal evaluation`
-> `persisted signals`

## Persistence flow
Signals persist through the shared intelligence repository:
- `COUNT_VARIANCE`
- `COUNT_INCONSISTENCY`
- run records and counters

No separate variance-specific persistence path is introduced.

## Evidence model
Signals retain evidence refs to:
- `count_sessions`
- `count_entries`
- optional `vendor_prices` cost source when cost severity uses it
- derived count-variance signals for inconsistency recurrence

## Future downstream use
This pack prepares inputs for:
- weekly operating memo prioritization
- discipline recommendations
- standards governance around count discipline
- margin engine support where repeated variance degrades trust in theoretical inventory assumptions

## Current runtime assumptions
The current SQLite runtime does not carry rich count-line scope fields like location and storage area directly on count rows. This phase therefore uses job-context scope plus item category as the safe operational scope context.
