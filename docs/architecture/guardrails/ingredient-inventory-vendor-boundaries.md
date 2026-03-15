# Ingredient, Inventory, And Vendor Boundaries

## Canonical ingredient

### Purpose
Represents the stable kitchen meaning of an ingredient.

### What it represents
A semantic ingredient identity used across recipes, templates, and cross-location comparisons.

### What it must never represent
- a counted stock record
- a supplier SKU
- a purchasable pack definition

### Key relationships
- referenced by recipe ingredients and template ingredient mappings
- may map to many inventory items
- may relate indirectly to many vendor items through inventory items

### Example
- canonical ingredient: `extra virgin olive oil`

## Inventory item

### Purpose
Represents the operational stock object the business counts, stores, transfers, and consumes.

### What it represents
A location-aware kitchen object with storage, unit, and operational behaviors.

### What it must never represent
- the universal semantic ingredient for all locations
- a supplier SKU identity

### Key relationships
- may fulfill one canonical ingredient or a specific operational variant
- may have multiple vendor items over time
- is the target of counts, transactions, waste, and storage tracking

### Example
- inventory item: `extra virgin olive oil 1 L bottle`

## Vendor item

### Purpose
Represents the supplier-specific purchasable SKU or pack.

### What it represents
The thing the purchasing team buys from a specific vendor at a specific pack and price shape.

### What it must never represent
- the recipe meaning of an ingredient
- the counted inventory object by default

### Key relationships
- belongs to a vendor context
- may supply one inventory item
- carries vendor pricing and pack behavior
- may change without changing recipe meaning

### Example
- vendor item: `Sysco EVOO 6 x 1 L case`

## Worked example

### Canonical ingredient
- `olive oil`

### More specific canonical ingredient
- `extra virgin olive oil`

### Inventory item
- `extra virgin olive oil 1 L bottle`

### Vendor item
- `Sysco EVOO 6 x 1 L case`

That chain allows FIFOFlow to preserve meaning while still tracking:
- kitchen stock operations
- supplier pack behavior
- vendor price changes

## Boundary rule

Never let the vendor item become the canonical meaning.
Never let the inventory item become the only semantic identity.
Canonical ingredient, inventory item, and vendor item are different layers because the kitchen, storeroom, and purchasing office do not operate on the same identity model.
