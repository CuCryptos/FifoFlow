# Live Recipe Cost Job Wiring Implementation

## What was implemented
- The live recipe cost job now constructs its source path from promoted operational recipes.
- Added SQLite read support for promoted recipe versions and ingredients through `SQLiteOperationalRecipeCostReadRepository`.
- Added `SQLiteVendorPriceRecipeCostCandidateSource` so the live path can read normalized cost candidates from `vendor_prices` when safe.
- Updated the job to build bridged recipe definitions first, classify costability per recipe version, and only send `COSTABLE_NOW` recipes into the existing recipe cost engine.
- Added per-recipe run output describing whether a recipe was costable, skipped, or persisted.

## Scope context assumptions
Current runtime recipe tables do not yet carry complete location or operation-unit ownership.
The live job therefore resolves scope from the intelligence job context:
- `organizationId`
- `locationId`
- `operationUnitId`

That means recipe costing is only as scope-accurate as the supplied job context.

## Costability and snapshot persistence behavior
- `COSTABLE_NOW`: recipe is evaluated by the engine and may persist a snapshot.
- `OPERATIONAL_ONLY`: recipe is reported but skipped before engine execution.
- `BLOCKED_FOR_COSTING`: recipe is reported but skipped before engine execution.

Once a recipe reaches the engine, snapshot completeness still depends on actual cost candidate quality. Entering the engine does not guarantee a complete snapshot.

## Lineage and explainability behavior
Persisted recipe cost outputs retain:
- `recipe_id`
- `recipe_version_id`
- canonical ingredient id in resolution detail
- raw ingredient text in resolution detail
- scoped inventory mapping result in resolution detail

Builder/template lineage remains attached through the promoted `recipe_version` referenced by the snapshot.

## Limitations
- Live normalized candidates currently come from `vendor_prices`, not invoice-linked cost history.
- Recipe scope ownership still depends on job context instead of recipe-native scope fields.
- Skipped `OPERATIONAL_ONLY` recipes do not yet persist a dedicated recipe-cost evaluation record; the result is returned in the job output only.

## Next clean follow-on steps
1. Add inventory-item to vendor-item lineage so resolved recipe rows carry full supplier cost provenance.
2. Add recipe-native scope ownership fields so live costing does not rely only on job context.
3. Move recipe-cost drift thresholds onto the scoped policy layer once live recipe-cost inputs stabilize.
