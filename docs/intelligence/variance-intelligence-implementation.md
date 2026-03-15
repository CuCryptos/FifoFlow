# Variance Intelligence Implementation

## What was implemented
FIFOFlow now has a live Variance Intelligence pack with:
- policy-backed threshold resolution
- deterministic count variance detection
- deterministic repeated inconsistency detection
- shared intelligence persistence
- signal explainability payloads

## Implemented signal logic
### `COUNT_VARIANCE`
Emits when a count line has:
- counted quantity
- expected quantity
- variance exceeding at least one configured threshold:
  - percent threshold
  - absolute quantity threshold
  - absolute cost threshold when cost context exists

### `COUNT_INCONSISTENCY`
Emits when repeated `COUNT_VARIANCE` signals for the same scoped inventory subject reach recurrence threshold inside the configured window.

## Trust and completeness gates
- missing counted quantity: skipped
- missing expected quantity: skipped
- missing expected cost: qty-based variance still allowed
- insufficient prior variance history: no inconsistency signal

## Policy integration
Thresholds resolve through the shared scoped policy engine using:
- organization
- location
- operation unit
- storage area
- inventory category
- subject entity = inventory item

## Fallback behavior
If no active numeric policy row matches a threshold key, FIFOFlow falls back to explicit code defaults. Fallback is surfaced in:
- run notes
- threshold metadata
- signal explainability payloads

## Explainability path
Signals now preserve:
- count session id and name
- count entry id
- expected quantity
- counted quantity
- variance quantity and percent
- optional cost context and source
- threshold values used
- matched scope and policy version when available

## Current limitations
- runtime count rows do not yet carry rich location/storage-area lineage directly
- cost context currently uses safe vendor-price data, not full vendor-lineage cost evidence
- recommendations and standards actions are not layered on top yet

## Blockers before recommendations and memo integration
- recommendation synthesis rules for repeated inconsistency
- memo prioritization and routing on top of persisted variance signals
- stronger expected-quantity sources beyond count-entry `previous_qty` when theoretical inventory matures
