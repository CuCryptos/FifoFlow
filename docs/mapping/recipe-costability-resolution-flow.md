# Recipe Costability Resolution Flow

## Flow
promoted recipe ingredient
-> canonical ingredient
-> scoped inventory item resolver
-> costability outcome
-> recipe cost source input
-> recipe cost snapshot eligibility

## Row-level logic
1. Read promoted recipe ingredient row.
2. Confirm canonical ingredient id exists.
3. Resolve scoped inventory mapping in this order:
   - operation unit
   - location
   - organization
4. If a trusted mapping resolves, emit a recipe-cost source row backed by that inventory item.
5. If no trusted mapping resolves, emit an unresolved source row with explanation metadata.

## Recipe-level outcomes
### `COSTABLE_NOW`
All promoted ingredient rows resolve to trusted inventory items for the requested scope.

### `OPERATIONAL_ONLY`
The recipe is operationally valid, but one or more ingredient rows do not yet have trusted scoped inventory resolution.
Typical cause:
- canonical identity exists
- scoped inventory mapping does not yet exist or is still under review

### `BLOCKED_FOR_COSTING`
The recipe cannot enter trustworthy costing because a required semantic identity is missing.
Typical cause:
- canonical ingredient id missing on a promoted row

## Truthfulness rules
- FIFOFlow does not invent inventory mappings for costing.
- FIFOFlow does not promote ambiguous mapping candidates into trusted cost inputs.
- Existing operational recipe rows stay intact even when costing is blocked.
- Costability classification is scope-aware. A recipe may be costable at one location or operation unit and operational-only at another.

## Output into recipe cost source
A resolved row must carry:
- recipe item id
- raw ingredient text
- canonical ingredient id
- inventory item id
- inventory item base unit
- quantity and recipe unit
- matched scope metadata
- explanation text

An unresolved row must still carry:
- recipe item id
- raw ingredient text
- canonical ingredient id if present
- unresolved status
- explanation text

The recipe cost engine then treats unresolved rows as missing-cost inputs instead of hiding them.
