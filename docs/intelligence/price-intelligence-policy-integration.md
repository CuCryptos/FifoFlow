# Price Intelligence Policy Integration

## Why Price Intelligence moves first
Price Intelligence already has deterministic rules, durable persistence, and clear threshold-driven behavior. That makes it the right first pack to move from pack-local config to the shared scoped policy layer.

This integration proves that FIFOFlow can resolve live intelligence thresholds by scope without hard-coded pack exceptions.

## Scope context construction
For each evaluated vendor-item price series, FIFOFlow builds a policy subject scope from:
- `organization_id` from job scope
- `location_id` from job scope
- `operation_unit_id` from job scope
- `inventory_category_id` if present in job scope
- `inventory_category_key` from the price series category string
- exact subject entity override using the inventory item id

This allows policy resolution to match:
- exact inventory item overrides
- category overrides
- operation-unit overrides
- location overrides
- organization defaults
- global defaults

## Threshold flow
vendor price history
-> subject scope context
-> policy resolution
-> threshold set
-> signal evaluation
-> persisted signal with evidence and threshold explanation

## Fallback behavior
If no active policy row exists for a required key, FIFOFlow falls back explicitly to the code-level default threshold bundle.

That fallback is:
- deterministic
- documented
- visible in threshold explainability metadata

It is not silent magic.

## Explainability
Price signals and patterns retain threshold explainability metadata so FIFOFlow can later explain:
- which threshold values were used
- which policy keys were requested
- which scope matched
- whether a fallback default was used

## Next path
This same pattern should next be applied to:
- Recipe Cost Drift thresholds
- Variance Intelligence thresholds
- memo urgency and routing policy
