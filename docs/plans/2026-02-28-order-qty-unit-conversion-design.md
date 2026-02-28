# Order Qty + Unit Conversion Design

## Order Qty

- Editable number input on both inventory list table and item detail page
- Transient (React state only, not persisted) — will feed into future PO workflow
- Column added to inventory list: `Name | Category | Qty | Unit ▾ | Order Qty | Status`

## Unit Conversion

### New Units
Add `ml` and `fl oz` to the shared UNITS constant.

### Unit Groups + Conversion Factors
- **Weight**: lb (base) ↔ oz (×16)
- **Volume**: gal (base) ↔ qt (×4) ↔ fl oz (×128) ↔ ml (×3785.41)
- **Standalone** (no conversion): each, case, bag, box, bottle

### Behavior
- Unit column in inventory list becomes a dropdown to switch display unit within the same group
- Item detail page header shows a unit toggle dropdown next to quantity
- Transaction history entries show converted quantities when display unit differs from stored unit
- Stored unit and quantity in the database are never changed by the display toggle
- If the item's unit has no conversion group (e.g. "case"), the dropdown only shows that one unit
