export const CATEGORIES = [
  'Produce',
  'Meats',
  'Seafood',
  'Dairy',
  'Dry Goods',
  'Food',
  'Beverages',
  'Beer',
  'Spirits',
  'Supplies',
  'Decorations',
  'Equipment',
] as const;

export const UNITS = [
  'each',
  'lb',
  'oz',
  'kg',
  'g',
  'gal',
  'qt',
  'pint',
  'cup',
  'fl oz',
  'tbsp',
  'tsp',
  'ml',
  'L',
  'dozen',
  'case',
  'bag',
  'box',
  'bottle',
  'pack',
  'sleeve',
] as const;

export const TRANSACTION_TYPES = ['in', 'out'] as const;

export const TRANSACTION_REASONS = [
  'Received',
  'Used',
  'Wasted',
  'Transferred',
  'Returned',
  'Adjustment',
] as const;

export const LOW_STOCK_THRESHOLD = 5;
