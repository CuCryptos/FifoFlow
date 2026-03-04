# Unit Conversions — Expanded Units Design

## Goal

Add 10 new measurement units (metric weight, metric volume, dry measure, count/packaging) to the existing unit system, with full conversion support.

## Architecture

Extend the existing `UNITS` constant and `UNIT_GROUPS` conversion table. No new architecture — the conversion framework in `conversions.ts` already handles arbitrary unit groups. All downstream consumers (transaction form, display unit switcher, reorder suggestions, inventory table) read from these constants and will pick up new units automatically.

## New Units

| Unit | Category |
|------|----------|
| kg | Weight |
| g | Weight |
| L | Volume |
| pint | Volume |
| cup | Volume/Dry |
| tbsp | Dry measure |
| tsp | Dry measure |
| dozen | Count |
| pack | Packaging |
| sleeve | Packaging |

## Conversion Groups

### Weight (factors relative to lb)

| Unit | Factor |
|------|--------|
| lb | 1 |
| oz | 16 |
| kg | 0.453592 |
| g | 453.592 |

### Volume (factors relative to gal)

| Unit | Factor |
|------|--------|
| gal | 1 |
| qt | 4 |
| pint | 8 |
| cup | 16 |
| fl oz | 128 |
| tbsp | 256 |
| tsp | 768 |
| ml | 3785.41 |
| L | 3.78541 |

### Count (factors relative to dozen)

| Unit | Factor |
|------|--------|
| dozen | 1 |
| each | 12 |

### Packaging-only (no standard conversions)

case, bag, box, bottle, pack, sleeve — convert only via item packaging config (qty_per_unit).

## Files Changed

- `packages/shared/src/constants.ts` — Add 10 units to UNITS array
- `packages/shared/src/conversions.ts` — Expand UNIT_GROUPS from 2 groups to 3

## Tech Decisions

- No database changes needed
- No schema changes needed
- No new UI components — existing unit pickers auto-populate from UNITS
- Packaging units (pack, sleeve) have no standard factor — they work like case/bag/box
