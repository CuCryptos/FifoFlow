import type { Unit } from './types.js';

// Each group defines units that can convert between each other.
// Factor is relative to the group's base unit (first in the array).
const UNIT_GROUPS: { units: Unit[]; factors: Record<string, number> }[] = [
  {
    units: ['lb', 'oz'],
    factors: { lb: 1, oz: 16 },
  },
  {
    units: ['gal', 'qt', 'fl oz', 'ml'],
    factors: { gal: 1, qt: 4, 'fl oz': 128, ml: 3785.41 },
  },
];

/**
 * Get all units compatible with the given unit (including itself).
 * Returns a single-element array if the unit has no conversion group.
 */
export function getCompatibleUnits(unit: Unit): Unit[] {
  for (const group of UNIT_GROUPS) {
    if (group.units.includes(unit)) {
      return group.units;
    }
  }
  return [unit];
}

/**
 * Convert a quantity from one unit to another.
 * Returns the original quantity if units are not in the same group.
 */
export function convertQuantity(qty: number, fromUnit: Unit, toUnit: Unit): number {
  if (fromUnit === toUnit) return qty;

  for (const group of UNIT_GROUPS) {
    const fromFactor = group.factors[fromUnit];
    const toFactor = group.factors[toUnit];
    if (fromFactor !== undefined && toFactor !== undefined) {
      // Convert: qty in fromUnit -> base unit -> toUnit
      const baseQty = qty / fromFactor;
      return Math.round(baseQty * toFactor * 100) / 100;
    }
  }

  return qty; // incompatible units, return unchanged
}
