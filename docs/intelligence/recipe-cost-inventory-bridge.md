# Recipe Cost Inventory Bridge

## Purpose
Promoted recipes are not broadly costable just because they preserve canonical ingredient identity. Canonical identity tells FIFOFlow what an ingredient means. Recipe costing still needs the operational inventory item that fulfills that meaning for the target scope.

The bridge in this phase connects:

promoted recipe ingredient
-> canonical ingredient
-> scoped inventory item resolver
-> recipe cost source row
-> recipe cost snapshot engine

## Identity rule
Canonical ingredient identity remains semantic.
Inventory item identity remains operational.
The bridge must not collapse those into one object.

A recipe ingredient row says what the kitchen intends to use.
A scoped inventory mapping says which stocked item fulfills that intent at organization, location, or operation-unit scope.

## Why this bridge is required
Without this layer, promoted recipes remain operational records but not truthful cost inputs. The recipe cost engine needs an inventory-item-backed source row because supplier-derived cost candidates attach to operational inventory items, not directly to canonical ingredients.

## Source flow
1. Load promoted `recipe_versions` and `recipe_ingredients`.
2. Read canonical ingredient identity from each recipe ingredient row.
3. Resolve the best active inventory item through scoped canonical-to-inventory mapping.
4. Produce recipe-cost source rows with:
   - canonical ingredient id
   - resolved inventory item id when trusted
   - matched scope type
   - match reason
   - explanation text
5. Hand those rows to the recipe cost engine unchanged except for normal cost resolution.

## Trust and blocking rules
- Missing canonical ingredient identity: blocked for costing.
- Canonical ingredient present but no trusted scoped inventory mapping: operational only, not fully costable.
- Trusted scoped inventory mapping present: row is costable.
- Mixed recipes remain partially costable but the recipe classification stays `OPERATIONAL_ONLY` until all rows resolve or a hard block is cleared.

## Status model
- `COSTABLE_NOW`: every promoted ingredient row resolved to a trusted inventory item.
- `OPERATIONAL_ONLY`: recipe exists operationally but one or more rows still lack trusted scoped inventory resolution.
- `BLOCKED_FOR_COSTING`: semantic identity is missing on at least one row, so the recipe cannot enter trustworthy costing.

## Explainability requirements
For every resolved row FIFOFlow must retain:
- canonical ingredient id and name
- inventory item id and name
- matched scope type and scope reference
- mapping status
- match reason
- explanation text

For unresolved rows FIFOFlow must retain:
- original ingredient text
- canonical ingredient id if present
- blocking reason
- explanation text describing why FIFOFlow refused to cost the row

## Recipe-cost impact
This bridge does not replace recipe cost resolution. It makes the source layer truthful. The existing recipe cost engine still chooses normalized cost evidence from invoice, vendor price history, prior trusted snapshot, or approved override. The new bridge ensures those candidate lookups happen against the correct operational item identity.
