import { describe, expect, it } from 'vitest';
import type { Item } from '@fifoflow/shared';
import {
  matchInvoiceLineToInventory,
  normalizeInvoiceItemName,
  type InvoiceVendorPriceMatchRecord,
} from '../routes/invoiceMatching.js';

describe('invoice line matching', () => {
  it('normalizes OCR-confused invoice names before matching', () => {
    expect(normalizeInvoiceItemName('T0MATO JU1CE 6/1L')).toBe('tomato juice');
  });

  it('matches distorted invoice names to the correct inventory item', () => {
    const items = [
      makeItem(1, 'Tomato Juice'),
      makeItem(2, 'Lemon Juice'),
    ];
    const vendorPrices: InvoiceVendorPriceMatchRecord[] = [
      { id: 11, item_id: 1, vendor_id: 7, vendor_item_name: 'Tomato Juice 6/1 L' },
    ];

    const result = matchInvoiceLineToInventory('T0MATO JU1CE 6/1L', items, vendorPrices);

    expect(result).toMatchObject({
      matched_item_id: 1,
      matched_item_name: 'Tomato Juice',
      existing_vendor_price_id: 11,
    });
    expect(result.match_confidence).not.toBe('none');
    expect(result.suggested_matches[0]).toMatchObject({
      item_id: 1,
      item_name: 'Tomato Juice',
      matched_via: 'vendor_alias',
    });
  });

  it('prefers an exact vendor item alias over a broader raw inventory name', () => {
    const items = [
      makeItem(1, 'Soy Sauce'),
      makeItem(2, 'Shoyu'),
    ];
    const vendorPrices: InvoiceVendorPriceMatchRecord[] = [
      { id: 21, item_id: 2, vendor_id: 4, vendor_item_name: 'Kikkoman Soy Sauce' },
    ];

    const result = matchInvoiceLineToInventory('Kikkoman Soy Sauce', items, vendorPrices);

    expect(result).toMatchObject({
      matched_item_id: 2,
      matched_item_name: 'Shoyu',
      match_confidence: 'exact',
      existing_vendor_price_id: 21,
    });
    expect(result.suggested_matches[0]).toMatchObject({
      item_id: 2,
      item_name: 'Shoyu',
      match_confidence: 'high',
      existing_vendor_price_id: 21,
      matched_via: 'vendor_alias',
    });
    expect(result.suggested_matches[1]).toMatchObject({
      item_id: 1,
      item_name: 'Soy Sauce',
      existing_vendor_price_id: null,
      matched_via: 'inventory_name',
    });
  });

  it('treats pack and count noise as non-semantic for exact item matching', () => {
    const items = [makeItem(1, 'Romaine Heart')];

    const result = matchInvoiceLineToInventory('Romaine Hearts 6 CT', items, []);

    expect(result).toMatchObject({
      matched_item_id: 1,
      matched_item_name: 'Romaine Heart',
      match_confidence: 'exact',
      existing_vendor_price_id: null,
    });
    expect(result.suggested_matches).toEqual([
      expect.objectContaining({
        item_id: 1,
        item_name: 'Romaine Heart',
        match_confidence: 'high',
        existing_vendor_price_id: null,
        matched_via: 'inventory_name',
      }),
    ]);
  });

  it('returns none when only generic overlap exists', () => {
    const items = [
      makeItem(1, 'Fresh Basil'),
      makeItem(2, 'Salad Mix'),
    ];

    const result = matchInvoiceLineToInventory('Fresh Mix', items, []);

    expect(result).toEqual({
      matched_item_id: null,
      matched_item_name: null,
      match_confidence: 'none',
      existing_vendor_price_id: null,
      suggested_matches: [],
    });
  });

  it('returns ranked suggestions for low-confidence lines without silently auto-matching', () => {
    const items = [
      makeItem(1, 'Tomato Juice'),
      makeItem(2, 'Tomato Paste'),
      makeItem(3, 'Lemon Juice'),
    ];

    const result = matchInvoiceLineToInventory('tomato juce', items, []);

    expect(result).toMatchObject({
      matched_item_id: null,
      matched_item_name: null,
      match_confidence: 'none',
    });
    expect(result.suggested_matches[0]).toEqual(
      expect.objectContaining({ item_id: 1, item_name: 'Tomato Juice' }),
    );
  });
});

function makeItem(id: number, name: string): Item {
  const now = '2026-03-18T00:00:00.000Z';
  return {
    id,
    name,
    category: 'Other',
    unit: 'each',
    current_qty: 0,
    order_unit: null,
    order_unit_price: null,
    qty_per_unit: null,
    inner_unit: null,
    item_size_value: null,
    item_size_unit: null,
    item_size: null,
    reorder_level: null,
    reorder_qty: null,
    vendor_id: null,
    venue_id: null,
    storage_area_id: null,
    sale_price: null,
    brand_name: null,
    manufacturer_name: null,
    gtin: null,
    upc: null,
    sysco_supc: null,
    manufacturer_item_code: null,
    external_product_confidence: null,
    external_product_last_matched_at: null,
    created_at: now,
    updated_at: now,
  };
}
