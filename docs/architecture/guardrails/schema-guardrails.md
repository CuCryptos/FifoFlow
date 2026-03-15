# Schema Guardrails

## Required relational boundaries

### Recipe ingredients
Recipe ingredients should not directly reference vendor items.
They should resolve to canonical ingredient identity first and only later connect through operational fulfillment.

### Price history
Vendor price history should not attach directly to canonical ingredients without identity resolution context.
Price history belongs to vendor items or a derived normalized cost fact that records the path used.

### Inventory counts
Inventory counts operate on inventory items, not canonical ingredients.
A kitchen counts stocked objects, not semantic ingredient concepts.

### Invoice lines
Invoice lines should resolve into vendor items and then map forward into inventory and canonical meaning.
They should not become canonical ingredient identity directly.

### Canonical ingredient mapping
Canonical ingredient mapping should always remain explicit.
If a feature needs canonical meaning, require that mapping step instead of assuming item names are enough.

## Practical rule for contributors

If a proposed foreign key path looks like:
- recipe -> vendor item
- invoice line -> canonical ingredient directly
- count row -> canonical ingredient

stop and redesign it.

The correct path is usually:
- recipe ingredient -> canonical ingredient
- canonical ingredient -> inventory item
- inventory item -> vendor item
