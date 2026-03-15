# Recipe Costability Bridge

## Why this matters
Promoted recipe ingredients retain canonical meaning. Recipe cost intelligence still needs an operational inventory item to resolve trusted price and usage facts.

## Costability rule
A promoted recipe is not broadly costable until its canonical ingredient rows can resolve to trusted inventory items for the target scope.

## Outcomes
- `OPERATIONAL_ONLY`: recipe exists operationally but inventory mapping is incomplete
- `COSTABLE_NOW`: every required ingredient row resolves to a trusted inventory item for the requested scope
- partial readiness: some rows are resolved, but the recipe is not yet fully costable

## Scope-aware costing
A recipe can be costable at one location and not another if scoped inventory mappings differ. That is expected. Costability should be evaluated per scope, not assumed globally.
