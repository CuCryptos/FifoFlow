# Full Cost Lineage Flow

## End-to-end path
promoted `recipe_version`
-> `recipe_ingredients`
-> canonical ingredient ids
-> scoped canonical -> inventory resolver
-> scoped inventory -> vendor resolver
-> vendor cost lineage helper
-> normalized cost candidate
-> recipe cost source row
-> recipe cost engine
-> persisted snapshot, components, and resolution logs

## Outcome points
- `BLOCKED_FOR_COSTING`
  - canonical ingredient identity missing
- `OPERATIONAL_ONLY`
  - scoped inventory mapping missing
  - scoped vendor mapping missing
  - vendor cost lineage missing
- low-confidence or partial
  - stale vendor-backed lineage exists, so costing may proceed but with degraded confidence
- `COSTABLE_NOW`
  - full scoped identity chain resolves and normalized vendor cost lineage is present

## Preserved metadata
At recipe source row level:
- canonical ingredient id and name
- inventory mapping resolution
- vendor mapping resolution
- vendor cost lineage result

At candidate level:
- canonical ingredient id or ids
- inventory item id
- vendor item id
- vendor item display name
- normalized unit cost
- normalized cost base unit
- source type
- source ref table and id
- stale flag
- confidence label
- inventory-scope explanation
- vendor-scope explanation

At persisted resolution level:
- raw ingredient text
- recipe quantity normalization
- inventory mapping resolution
- vendor mapping resolution
- vendor cost lineage payload
- vendor item id and name
- source evidence references
