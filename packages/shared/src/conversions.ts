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

export interface PackagingConversion {
  baseUnit?: Unit | null;
  orderUnit?: Unit | null;
  innerUnit?: Unit | null;
  qtyPerUnit?: number | null;
  itemSizeValue?: number | null;
  itemSizeUnit?: Unit | null;
}

/**
 * Get all units compatible with the given unit (including itself).
 * Returns a single-element array if the unit has no conversion group.
 */
export function getCompatibleUnits(
  unit: Unit,
  packaging?: PackagingConversion,
): Unit[] {
  const units = new Set<Unit>();

  for (const group of UNIT_GROUPS) {
    if (group.units.includes(unit)) {
      for (const candidate of group.units) {
        units.add(candidate);
      }
      break;
    }
  }
  units.add(unit);

  const orderUnit = packaging?.orderUnit ?? null;
  const innerUnit = packaging?.innerUnit ?? null;
  const qtyPerUnit = packaging?.qtyPerUnit ?? null;
  if (orderUnit && innerUnit && qtyPerUnit && qtyPerUnit > 0) {
    if (unit === orderUnit || unit === innerUnit) {
      units.add(orderUnit);
      units.add(innerUnit);
    }
  }

  const sizeUnit = packaging?.itemSizeUnit ?? null;
  const sizeValue = packaging?.itemSizeValue ?? null;
  const baseUnit = packaging?.baseUnit ?? null;
  if (sizeUnit && sizeValue && sizeValue > 0 && baseUnit && unit === baseUnit) {
    for (const group of UNIT_GROUPS) {
      if (group.units.includes(sizeUnit)) {
        for (const candidate of group.units) {
          units.add(candidate);
        }
        break;
      }
    }
  }

  return Array.from(units);
}

/**
 * Convert quantity and return null if units are incompatible.
 */
export function tryConvertQuantity(
  qty: number,
  fromUnit: Unit,
  toUnit: Unit,
  packaging?: PackagingConversion,
): number | null {
  if (fromUnit === toUnit) return qty;

  for (const group of UNIT_GROUPS) {
    const fromFactor = group.factors[fromUnit];
    const toFactor = group.factors[toUnit];
    if (fromFactor !== undefined && toFactor !== undefined) {
      const baseQty = qty / fromFactor;
      return Math.round(baseQty * toFactor * 100) / 100;
    }
  }

  const orderUnit = packaging?.orderUnit ?? null;
  const innerUnit = packaging?.innerUnit ?? null;
  const qtyPerUnit = packaging?.qtyPerUnit ?? null;
  if (!orderUnit || !innerUnit || !qtyPerUnit || qtyPerUnit <= 0) {
    return null;
  }

  if (fromUnit === orderUnit && toUnit === innerUnit) {
    return Math.round(qty * qtyPerUnit * 100) / 100;
  }
  if (fromUnit === innerUnit && toUnit === orderUnit) {
    return Math.round((qty / qtyPerUnit) * 100) / 100;
  }

  const baseUnit = packaging?.baseUnit ?? null;
  const itemSizeUnit = packaging?.itemSizeUnit ?? null;
  const itemSizeValue = packaging?.itemSizeValue ?? null;
  if (
    !baseUnit ||
    !itemSizeUnit ||
    !itemSizeValue ||
    itemSizeValue <= 0
  ) {
    return null;
  }

  let contentPerBaseInItemSizeUnit: number | null = null;
  if (baseUnit === innerUnit) {
    contentPerBaseInItemSizeUnit = itemSizeValue;
  } else if (baseUnit === orderUnit && qtyPerUnit && qtyPerUnit > 0) {
    contentPerBaseInItemSizeUnit = qtyPerUnit * itemSizeValue;
  }

  if (!contentPerBaseInItemSizeUnit) {
    return null;
  }

  // Convert content-unit quantity to base unit (e.g., ml -> case)
  if (toUnit === baseUnit) {
    const inItemSizeUnit = tryConvertQuantity(qty, fromUnit, itemSizeUnit);
    if (inItemSizeUnit !== null) {
      return Math.round((inItemSizeUnit / contentPerBaseInItemSizeUnit) * 10000) / 10000;
    }
  }

  // Convert base unit to content-unit quantity (e.g., case -> ml/fl oz)
  if (fromUnit === baseUnit) {
    const inItemSizeUnit = qty * contentPerBaseInItemSizeUnit;
    const inTarget = tryConvertQuantity(inItemSizeUnit, itemSizeUnit, toUnit);
    if (inTarget !== null) {
      return Math.round(inTarget * 100) / 100;
    }
  }

  return null;
}

/**
 * Convert a quantity from one unit to another.
 * Returns the original quantity if units are not in the same group.
 */
export function convertQuantity(
  qty: number,
  fromUnit: Unit,
  toUnit: Unit,
  packaging?: PackagingConversion,
): number {
  const converted = tryConvertQuantity(qty, fromUnit, toUnit, packaging);
  return converted ?? qty;
}
