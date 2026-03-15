# Identity Separation Guardrail

## The dangerous mistake

The fastest way to corrupt FIFOFlow is to collapse three different identities into one record or one foreign key path:
- canonical ingredient identity
- operational inventory item identity
- vendor-item or purchasable SKU identity

This mistake looks convenient early and destroys explainability later.

## Required FIFOFlow identity chain

FIFOFlow must model:

`recipe ingredient`
-> `canonical ingredient`
-> `inventory item`
-> `vendor item`

Each step answers a different operational question.

## Why collapse breaks intelligence

### Canonical ingredient
Answers semantic meaning.
Example: `extra virgin olive oil`

### Inventory item
Answers what the kitchen actually stocks and counts.
Example: `EVOO 1 L bottle for Line 1`

### Vendor item
Answers what the operation purchases from a supplier.
Example: `Sysco EVOO 6 x 1 L case`

If those are collapsed:
- recipe semantics drift when a location changes pack size
- vendor switches look like recipe changes
- cross-location comparisons become meaningless
- price history contaminates recipe meaning directly
- margin logic cannot explain what changed

## Anti-pattern examples

### Anti-pattern: recipe row points directly to vendor price row
This makes recipe meaning depend on a supplier SKU.

### Anti-pattern: invoice line becomes canonical ingredient without resolution
This lets supplier naming overwrite kitchen meaning.

### Anti-pattern: inventory item treated as canonical meaning
This breaks when two locations stock different operational items for the same ingredient.

## Approved modeling examples

### Approved
- recipe ingredient references canonical ingredient identity
- canonical ingredient resolves to one or more inventory items by location or operation unit
- inventory item resolves to one or more vendor items over time
- costing records the path used

### Also approved
- recipe costing uses vendor-derived normalized cost
- but the system retains which inventory item and vendor item supplied that cost

## Consequences for intelligence packs

### Recipe cost drift
Recipe drift must compare the same recipe meaning over time, not whichever vendor SKU happened to supply it.

### Price history
Price history belongs to vendor items or vendor-item-derived normalized costs, not directly to recipe ingredients.

### Margin logic
Margin must be able to explain:
- what ingredient meaning changed
- what stocked item fulfilled it
- what vendor item supplied it
- what normalized cost entered the calculation

If FIFOFlow cannot explain that path, the model is not trustworthy enough for operator use.
