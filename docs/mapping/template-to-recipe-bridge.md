# Template To Recipe Bridge

Template ingredient mapping is the prerequisite bridge between FIFOFlow seed templates and operational recipes.

## Bridge sequence

1. Template ingredient row resolves to canonical ingredient identity.
2. Canonical ingredient id is stored on the template mapping row.
3. Template instantiation creates recipe ingredient rows using that canonical identity.
4. A later inventory-linkage layer resolves canonical ingredient identity to location-specific inventory items.
5. Recipe cost intelligence can then evaluate cost using trusted inventory-linked ingredients.

## What gets carried forward

When a template is instantiated into an operational recipe, FIFOFlow should carry forward:
- original template ingredient text
- mapped canonical ingredient id
- mapping confidence
- mapping status
- template row lineage

This preserves traceability from seeded template to live recipe ingredient.

## Blocking and warning rules

Template-driven recipe creation should not treat all mapping outcomes equally.

### Hard block
Block trusted recipe instantiation when required ingredients are:
- `UNMAPPED`
- `NEEDS_REVIEW`

### Warning state
Allow draft instantiation with explicit warnings only if the user is creating an incomplete draft and understands that:
- recipe cost will not be fully trusted
- inventory linkage is incomplete
- later review is required before operational use

## Minimum completeness for trusted recipe cost

Recipe-cost computation should only be treated as trustworthy when all recipe ingredients that materially contribute cost have:
- canonical ingredient identity
- compatible units
- resolvable inventory linkage or cost source

A fully mapped template is not the entire requirement, but it is the first irreversible step.

## How this leads to inventory linkage

Canonical ingredient identity does not replace inventory items. It narrows the problem first.

Later linkage should follow this order:
- template ingredient -> canonical ingredient
- canonical ingredient -> operational recipe ingredient
- operational recipe ingredient -> inventory item
- inventory item -> vendor item and cost history

That sequencing keeps FIFOFlow from collapsing supplier naming, local stock naming, and recipe naming into one unstable concept.
