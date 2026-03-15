import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { initializeDb } from '../db.js';
import {
  SQLiteInventoryVendorRepository,
  executeInventoryVendorMappingJob,
  resolveInventoryVendorItem,
  resolveVendorCostLineage,
} from '../mapping/vendor/index.js';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  initializeDb(db);
  return db;
}

function seedVenue(db: Database.Database, name: string): number {
  return Number(db.prepare('INSERT INTO venues (name) VALUES (?)').run(name).lastInsertRowid);
}

function seedVendor(db: Database.Database, name: string): number {
  return Number(db.prepare('INSERT INTO vendors (name) VALUES (?)').run(name).lastInsertRowid);
}

function seedItem(
  db: Database.Database,
  input: { name: string; category?: string; unit?: string; venue_id?: number | null },
): number {
  return Number(
    db.prepare(
      `
        INSERT INTO items (name, category, unit, current_qty, venue_id)
        VALUES (?, ?, ?, 0, ?)
      `,
    ).run(input.name, input.category ?? 'general', input.unit ?? 'each', input.venue_id ?? null).lastInsertRowid,
  );
}

function seedVendorPrice(
  db: Database.Database,
  input: {
    item_id: number;
    vendor_id: number;
    vendor_item_name?: string | null;
    order_unit?: string | null;
    order_unit_price: number;
    qty_per_unit?: number | null;
    is_default?: boolean;
  },
): number {
  return Number(
    db.prepare(
      `
        INSERT INTO vendor_prices (
          item_id,
          vendor_id,
          vendor_item_name,
          order_unit,
          order_unit_price,
          qty_per_unit,
          is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.item_id,
      input.vendor_id,
      input.vendor_item_name ?? null,
      input.order_unit ?? null,
      input.order_unit_price,
      input.qty_per_unit ?? null,
      input.is_default ? 1 : 0,
    ).lastInsertRowid,
  );
}

describe('inventory item to vendor item mapping', () => {
  it('resolves an organization default mapping', async () => {
    const db = createDb();
    const repository = new SQLiteInventoryVendorRepository(db);
    try {
      const vendorId = seedVendor(db, 'Sysco');
      const itemId = seedItem(db, { name: 'olive oil', category: 'oil_fat', unit: 'ml' });
      const vendorItemId = seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorId,
        vendor_item_name: 'Sysco Olive Oil 1 L',
        order_unit: 'bottle',
        order_unit_price: 18,
        qty_per_unit: 1000,
        is_default: true,
      });
      await repository.upsertPreferredMapping({
        inventory_item_id: itemId,
        vendor_item_id: vendorItemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization default olive oil vendor item.',
        source_hash: 'org-olive-oil',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:00:00.000Z',
      });

      const result = await resolveInventoryVendorItem({
        inventory_item_id: itemId,
        subject_scope: { organization_id: 1 },
      }, repository);

      expect(result.vendor_item_id).toBe(vendorItemId);
      expect(result.mapping_status).toBe('MANUALLY_MAPPED');
      expect(result.matched_scope_type).toBe('organization');
      expect(result.trusted).toBe(true);
    } finally {
      db.close();
    }
  });

  it('location override beats organization default', async () => {
    const db = createDb();
    const repository = new SQLiteInventoryVendorRepository(db);
    try {
      const locationId = seedVenue(db, 'Waikiki');
      const vendorId = seedVendor(db, 'Sysco');
      const itemId = seedItem(db, { name: 'olive oil', category: 'oil_fat', unit: 'ml', venue_id: locationId });
      const orgVendorItemId = seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorId,
        vendor_item_name: 'Sysco Olive Oil 1 L',
        order_unit: 'bottle',
        order_unit_price: 18,
        qty_per_unit: 1000,
      });
      const locationVendorItemId = seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorId,
        vendor_item_name: 'Waikiki Reserve Olive Oil 1 L',
        order_unit: 'bottle',
        order_unit_price: 21,
        qty_per_unit: 1000,
      });
      await repository.upsertPreferredMapping({
        inventory_item_id: itemId,
        vendor_item_id: orgVendorItemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization default olive oil vendor item.',
        source_hash: 'org-olive-oil',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:00:00.000Z',
      });
      await repository.upsertPreferredMapping({
        inventory_item_id: itemId,
        vendor_item_id: locationVendorItemId,
        scope_type: 'location',
        scope_ref_id: locationId,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Waikiki location override vendor item.',
        source_hash: 'waikiki-olive-oil',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:05:00.000Z',
      });

      const result = await resolveInventoryVendorItem({
        inventory_item_id: itemId,
        subject_scope: { organization_id: 1, location_id: locationId },
      }, repository);

      expect(result.vendor_item_id).toBe(locationVendorItemId);
      expect(result.matched_scope_type).toBe('location');
      expect(result.explanation_text).toContain('Waikiki');
    } finally {
      db.close();
    }
  });

  it('operation_unit override beats location', async () => {
    const db = createDb();
    const repository = new SQLiteInventoryVendorRepository(db);
    try {
      const locationId = seedVenue(db, 'Downtown');
      const vendorId = seedVendor(db, 'ChefSource');
      const itemId = seedItem(db, { name: 'garlic', category: 'produce', unit: 'g', venue_id: locationId });
      const locationVendorItemId = seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorId,
        vendor_item_name: 'Whole Garlic 5 lb',
        order_unit: 'case',
        order_unit_price: 28,
        qty_per_unit: 2267.96,
      });
      const opUnitVendorItemId = seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorId,
        vendor_item_name: 'Peeled Garlic 5 lb',
        order_unit: 'case',
        order_unit_price: 34,
        qty_per_unit: 2267.96,
      });
      await repository.upsertPreferredMapping({
        inventory_item_id: itemId,
        vendor_item_id: locationVendorItemId,
        scope_type: 'location',
        scope_ref_id: locationId,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Downtown location garlic vendor default.',
        source_hash: 'location-garlic',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:10:00.000Z',
      });
      await repository.upsertPreferredMapping({
        inventory_item_id: itemId,
        vendor_item_id: opUnitVendorItemId,
        scope_type: 'operation_unit',
        scope_ref_id: 301,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Prep unit uses peeled garlic vendor item.',
        source_hash: 'op-garlic',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:15:00.000Z',
      });

      const result = await resolveInventoryVendorItem({
        inventory_item_id: itemId,
        subject_scope: { organization_id: 1, location_id: locationId, operation_unit_id: 301 },
      }, repository);

      expect(result.vendor_item_id).toBe(opUnitVendorItemId);
      expect(result.matched_scope_type).toBe('operation_unit');
      expect(result.explanation_text).toContain('peeled garlic');
    } finally {
      db.close();
    }
  });

  it('returns an explicit unresolved result when no mapping exists', async () => {
    const db = createDb();
    const repository = new SQLiteInventoryVendorRepository(db);
    try {
      const itemId = seedItem(db, { name: 'parmesan cheese', category: 'dairy', unit: 'g' });

      const result = await resolveInventoryVendorItem({
        inventory_item_id: itemId,
        subject_scope: { organization_id: 1, location_id: 10, operation_unit_id: 20 },
      }, repository);

      expect(result.mapping_status).toBe('UNMAPPED');
      expect(result.vendor_item_id).toBeNull();
      expect(result.trusted).toBe(false);
    } finally {
      db.close();
    }
  });

  it('creates an auto-mapped candidate from exact vendor item name overlap', async () => {
    const db = createDb();
    const repository = new SQLiteInventoryVendorRepository(db);
    try {
      const vendorId = seedVendor(db, 'US Foods');
      const itemId = seedItem(db, { name: 'canola oil', category: 'oil_fat', unit: 'ml' });
      seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorId,
        vendor_item_name: 'canola oil',
        order_unit: 'jug',
        order_unit_price: 14,
        qty_per_unit: 3500,
      });

      const result = await executeInventoryVendorMappingJob({
        scope_type: 'organization',
        scope_ref_id: 1,
        inventory_item_ids: [itemId],
      }, repository);

      expect(result.run_summary.auto_mapped).toBe(1);
      expect(result.mappings[0]?.mapping_status).toBe('AUTO_MAPPED');
      expect(result.mappings[0]?.match_reason).toBe('exact_vendor_item_name');
    } finally {
      db.close();
    }
  });

  it('sends ambiguous vendor choices to review and persists candidates', async () => {
    const db = createDb();
    const repository = new SQLiteInventoryVendorRepository(db);
    try {
      const vendorA = seedVendor(db, 'Sysco');
      const vendorB = seedVendor(db, 'US Foods');
      const itemId = seedItem(db, { name: 'olive oil', category: 'oil_fat', unit: 'ml' });
      seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorA,
        vendor_item_name: 'olive oil',
        order_unit: 'bottle',
        order_unit_price: 18,
        qty_per_unit: 1000,
      });
      seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorB,
        vendor_item_name: 'olive oil',
        order_unit: 'bottle',
        order_unit_price: 19,
        qty_per_unit: 1000,
      });

      const result = await executeInventoryVendorMappingJob({
        scope_type: 'organization',
        scope_ref_id: 1,
        inventory_item_ids: [itemId],
      }, repository);

      expect(result.mappings[0]?.mapping_status).toBe('NEEDS_REVIEW');
      expect(result.candidates).toHaveLength(2);
      expect(result.review_events).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('does not duplicate mappings on idempotent rerun', async () => {
    const db = createDb();
    const repository = new SQLiteInventoryVendorRepository(db);
    try {
      const vendorId = seedVendor(db, 'Sysco');
      const itemId = seedItem(db, { name: 'garlic powder', category: 'dry_goods', unit: 'g' });
      seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorId,
        vendor_item_name: 'garlic powder',
        order_unit: 'bag',
        order_unit_price: 9,
        qty_per_unit: 500,
      });

      await executeInventoryVendorMappingJob({
        scope_type: 'organization',
        scope_ref_id: 1,
        inventory_item_ids: [itemId],
      }, repository);
      const second = await executeInventoryVendorMappingJob({
        scope_type: 'organization',
        scope_ref_id: 1,
        inventory_item_ids: [itemId],
      }, repository);

      const count = db.prepare('SELECT COUNT(*) AS count FROM inventory_vendor_mappings').get() as { count: number };
      expect(count.count).toBe(1);
      expect(second.run_summary.mappings_reused).toBe(1);
    } finally {
      db.close();
    }
  });

  it('returns normalized cost lineage metadata when available from vendor prices', async () => {
    const db = createDb();
    const repository = new SQLiteInventoryVendorRepository(db);
    try {
      const vendorId = seedVendor(db, 'Sysco');
      const itemId = seedItem(db, { name: 'shrimp', category: 'protein', unit: 'lb' });
      const vendorItemId = seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorId,
        vendor_item_name: '16/20 Shrimp 10 lb',
        order_unit: 'case',
        order_unit_price: 80,
        qty_per_unit: 10,
        is_default: true,
      });
      await repository.upsertPreferredMapping({
        inventory_item_id: itemId,
        vendor_item_id: vendorItemId,
        scope_type: 'organization',
        scope_ref_id: 1,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Organization default shrimp vendor item.',
        source_hash: 'shrimp-vendor',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:20:00.000Z',
      });

      const result = await resolveVendorCostLineage({
        inventory_item_id: itemId,
        subject_scope: { organization_id: 1 },
        effective_at: '2026-03-20T00:00:00.000Z',
      }, repository);

      expect(result.vendor_item_id).toBe(vendorItemId);
      expect(result.source_type).toBe('vendor_price_history');
      expect(result.normalized_unit_cost).toBe(8);
      expect(result.explanation_text).toContain('vendor_prices row');
    } finally {
      db.close();
    }
  });

  it('uses stored lineage records when present and preserves source explanation', async () => {
    const db = createDb();
    const repository = new SQLiteInventoryVendorRepository(db);
    try {
      const vendorId = seedVendor(db, 'Pacific Produce');
      const itemId = seedItem(db, { name: 'lemons', category: 'produce', unit: 'each' });
      const vendorItemId = seedVendorPrice(db, {
        item_id: itemId,
        vendor_id: vendorId,
        vendor_item_name: 'Lemons 40 ct',
        order_unit: 'case',
        order_unit_price: 32,
        qty_per_unit: 40,
        is_default: true,
      });
      await repository.upsertPreferredMapping({
        inventory_item_id: itemId,
        vendor_item_id: vendorItemId,
        scope_type: 'location',
        scope_ref_id: 12,
        active: true,
        preferred_flag: true,
        mapping_status: 'MANUALLY_MAPPED',
        confidence_label: 'HIGH',
        match_reason: 'manual_resolution',
        explanation_text: 'Location default lemon vendor item.',
        source_hash: 'lemons-location',
        resolved_by: 'tester',
        resolved_at: '2026-03-14T10:25:00.000Z',
      });
      db.prepare(
        `
          INSERT INTO vendor_cost_lineage_records (
            vendor_item_id,
            normalized_unit_cost,
            base_unit,
            source_type,
            source_ref_table,
            source_ref_id,
            effective_at,
            stale_at,
            confidence_label
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        vendorItemId,
        0.85,
        'each',
        'invoice_linked_cost',
        'invoice_lines',
        '889',
        '2026-03-18T00:00:00.000Z',
        null,
        'HIGH',
      );

      const result = await resolveVendorCostLineage({
        inventory_item_id: itemId,
        subject_scope: { organization_id: 1, location_id: 12 },
        effective_at: '2026-03-20T00:00:00.000Z',
      }, repository);

      expect(result.source_type).toBe('invoice_linked_cost');
      expect(result.normalized_unit_cost).toBe(0.85);
      expect(result.explanation_text).toContain('invoice_linked_cost');
      expect(result.mapping_resolution.matched_scope_type).toBe('location');
    } finally {
      db.close();
    }
  });
});
