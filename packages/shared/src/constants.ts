export const CATEGORIES = [
  'Produce',
  'Meats',
  'Seafood',
  'Dairy',
  'Dry Goods',
  'Beverages',
  'Supplies',
  'Equipment',
] as const;

export const UNITS = [
  'each',
  'lb',
  'oz',
  'gal',
  'qt',
  'fl oz',
  'ml',
  'case',
  'bag',
  'box',
  'bottle',
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
