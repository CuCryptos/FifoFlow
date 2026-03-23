import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeIntelligenceDb } from './intelligence/persistence/sqliteSchema.js';
import { initializeRecipeCostDb } from './intelligence/recipeCost/persistence/sqliteSchema.js';
import { initializeCanonicalIngredientDb } from './mapping/ingredients/persistence/sqliteSchema.js';
import { initializeCanonicalInventoryMappingDb } from './mapping/inventory/persistence/sqliteSchema.js';
import { initializeInventoryVendorMappingDb } from './mapping/vendor/persistence/sqliteSchema.js';
import { initializeTemplateIngredientMappingDb } from './mapping/templates/persistence/sqliteSchema.js';
import { initializeRecipeBuilderDb } from './recipes/builder/persistence/sqliteSchema.js';
import { initializeRecipeTemplateLibraryDb } from './recipes/builder/persistence/sqliteTemplateSchema.js';
import { initializeRecipePromotionDb } from './recipes/promotion/persistence/sqliteSchema.js';
import { initializeScopedPolicyDb } from './platform/policy/persistence/sqliteSchema.js';
import { initializeBenchmarkingDb } from './platform/benchmarking/persistence/sqliteSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function initializeDb(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit TEXT NOT NULL,
      current_qty REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id),
      type TEXT NOT NULL CHECK(type IN ('in', 'out')),
      quantity REAL NOT NULL CHECK(quantity > 0),
      reason TEXT NOT NULL CHECK(reason IN ('Received', 'Used', 'Wasted', 'Transferred', 'Returned', 'Adjustment')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS count_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open', 'closed')) DEFAULT 'open',
      template_category TEXT,
      notes TEXT,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS count_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES count_sessions(id),
      item_id INTEGER NOT NULL REFERENCES items(id),
      previous_qty REAL NOT NULL,
      counted_qty REAL NOT NULL,
      delta REAL NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS count_session_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES count_sessions(id),
      item_id INTEGER NOT NULL REFERENCES items(id),
      counted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS storage_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS item_storage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id),
      area_id INTEGER NOT NULL REFERENCES storage_areas(id),
      quantity REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(item_id, area_id)
    );

    CREATE TABLE IF NOT EXISTS venues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id),
      status TEXT NOT NULL CHECK(status IN ('draft', 'sent')) DEFAULT 'draft',
      notes TEXT,
      total_estimated_cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id),
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL
    );

    CREATE TRIGGER IF NOT EXISTS update_item_timestamp
    AFTER UPDATE ON items
    BEGIN
      UPDATE items SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_storage_area_timestamp
    AFTER UPDATE ON storage_areas
    BEGIN
      UPDATE storage_areas SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_vendor_timestamp
    AFTER UPDATE ON vendors
    BEGIN
      UPDATE vendors SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_venue_timestamp
    AFTER UPDATE ON venues
    BEGIN
      UPDATE venues SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_order_timestamp
    AFTER UPDATE ON orders
    BEGIN
      UPDATE orders SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE INDEX IF NOT EXISTS idx_transactions_item_id ON transactions(item_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
    CREATE INDEX IF NOT EXISTS idx_count_entries_session_id ON count_entries(session_id);
    CREATE INDEX IF NOT EXISTS idx_count_entries_item_id ON count_entries(item_id);
    CREATE INDEX IF NOT EXISTS idx_count_session_items_session_id ON count_session_items(session_id);
    CREATE INDEX IF NOT EXISTS idx_count_session_items_item_id ON count_session_items(item_id);
    CREATE INDEX IF NOT EXISTS idx_item_storage_item_id ON item_storage(item_id);
    CREATE INDEX IF NOT EXISTS idx_item_storage_area_id ON item_storage(area_id);
    CREATE INDEX IF NOT EXISTS idx_orders_vendor_id ON orders(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

    CREATE TABLE IF NOT EXISTS vendor_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      vendor_item_name TEXT,
      order_unit TEXT,
      order_unit_price REAL NOT NULL,
      qty_per_unit REAL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_vendor_prices_item_id ON vendor_prices(item_id);
    CREATE INDEX IF NOT EXISTS idx_vendor_prices_vendor_id ON vendor_prices(vendor_id);

    CREATE TRIGGER IF NOT EXISTS update_vendor_price_timestamp
    AFTER UPDATE ON vendor_prices
    BEGIN
      UPDATE vendor_prices SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('dish', 'prep')),
      notes TEXT,
      yield_quantity REAL,
      yield_unit TEXT,
      serving_quantity REAL,
      serving_unit TEXT,
      serving_count REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recipe_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id),
      quantity REAL NOT NULL CHECK(quantity > 0),
      unit TEXT NOT NULL,
      UNIQUE(recipe_id, item_id)
    );

    CREATE TRIGGER IF NOT EXISTS update_recipe_timestamp
    AFTER UPDATE ON recipes
    BEGIN
      UPDATE recipes SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe_id ON recipe_items(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_recipe_items_item_id ON recipe_items(item_id);

    CREATE TABLE IF NOT EXISTS forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      date_range_start TEXT,
      date_range_end TEXT,
      raw_dates TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS forecast_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      forecast_id INTEGER NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
      product_code TEXT,
      product_name TEXT NOT NULL,
      forecast_date TEXT NOT NULL,
      guest_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_forecast_entries_fid ON forecast_entries(forecast_id);

    CREATE TABLE IF NOT EXISTS forecast_product_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL UNIQUE,
      venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TRIGGER IF NOT EXISTS update_forecast_mapping_timestamp
    AFTER UPDATE ON forecast_product_mappings
    BEGIN
      UPDATE forecast_product_mappings SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TABLE IF NOT EXISTS protein_usage_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      unit_label TEXT NOT NULL DEFAULT 'portion',
      case_unit_label TEXT NOT NULL DEFAULT 'case',
      portions_per_case REAL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS forecast_protein_usage_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      forecast_product_name TEXT NOT NULL,
      protein_item_id INTEGER NOT NULL REFERENCES protein_usage_items(id) ON DELETE CASCADE,
      usage_per_pax REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(venue_id, forecast_product_name, protein_item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_forecast_protein_usage_rules_venue
      ON forecast_protein_usage_rules(venue_id, forecast_product_name);

    CREATE TABLE IF NOT EXISTS protein_usage_hidden_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      forecast_product_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(venue_id, forecast_product_name)
    );

    CREATE INDEX IF NOT EXISTS idx_protein_usage_hidden_products_venue
      ON protein_usage_hidden_products(venue_id, forecast_product_name);

    CREATE TRIGGER IF NOT EXISTS update_protein_usage_items_timestamp
    AFTER UPDATE ON protein_usage_items
    BEGIN
      UPDATE protein_usage_items SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_forecast_protein_usage_rules_timestamp
    AFTER UPDATE ON forecast_protein_usage_rules
    BEGIN
      UPDATE forecast_protein_usage_rules SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id),
      quantity REAL NOT NULL CHECK(quantity > 0),
      unit_qty INTEGER NOT NULL DEFAULT 1,
      sale_price REAL NOT NULL,
      total REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sales_item_id ON sales(item_id);
    CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
  `);

  // Migrations — add inventory fields incrementally
  const columns = db.pragma('table_info(items)') as Array<{ name: string }>;
  const columnNames = columns.map((c) => c.name);

  const addColumnIfMissing = (name: string, definition: string) => {
    if (!columnNames.includes(name)) {
      db.exec(`ALTER TABLE items ADD COLUMN ${name} ${definition};`);
      columnNames.push(name);
    }
  };

  addColumnIfMissing('order_unit', 'TEXT');
  addColumnIfMissing('order_unit_price', 'REAL');
  addColumnIfMissing('qty_per_unit', 'REAL');
  addColumnIfMissing('inner_unit', 'TEXT');
  addColumnIfMissing('item_size_value', 'REAL');
  addColumnIfMissing('item_size_unit', 'TEXT');
  addColumnIfMissing('item_size', 'TEXT');
  addColumnIfMissing('reorder_level', 'REAL');
  addColumnIfMissing('reorder_qty', 'REAL');
  addColumnIfMissing('vendor_id', 'INTEGER REFERENCES vendors(id) ON DELETE SET NULL');

  db.exec('CREATE INDEX IF NOT EXISTS idx_items_vendor_id ON items(vendor_id)');

  addColumnIfMissing('venue_id', 'INTEGER REFERENCES venues(id) ON DELETE SET NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_items_venue_id ON items(venue_id)');

  addColumnIfMissing('storage_area_id', 'INTEGER REFERENCES storage_areas(id) ON DELETE SET NULL');

  addColumnIfMissing('sale_price', 'REAL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_items_storage_area_id ON items(storage_area_id)');

  const recipeColumns = db.pragma('table_info(recipes)') as Array<{ name: string }>;
  const recipeColumnNames = recipeColumns.map((c) => c.name);
  const addRecipeColumnIfMissing = (name: string, definition: string) => {
    if (!recipeColumnNames.includes(name)) {
      db.exec(`ALTER TABLE recipes ADD COLUMN ${name} ${definition};`);
      recipeColumnNames.push(name);
    }
  };

  addRecipeColumnIfMissing('yield_quantity', 'REAL');
  addRecipeColumnIfMissing('yield_unit', 'TEXT');
  addRecipeColumnIfMissing('serving_quantity', 'REAL');
  addRecipeColumnIfMissing('serving_unit', 'TEXT');
  addRecipeColumnIfMissing('serving_count', 'REAL');

  const sessionColumns = db.pragma('table_info(count_sessions)') as Array<{ name: string }>;
  const sessionColumnNames = sessionColumns.map((c) => c.name);
  if (!sessionColumnNames.includes('template_category')) {
    db.exec('ALTER TABLE count_sessions ADD COLUMN template_category TEXT;');
  }

  // Backfill checklist rows for legacy sessions created before count_session_items existed.
  db.exec(`
    INSERT OR IGNORE INTO count_session_items (session_id, item_id, counted)
    SELECT e.session_id, e.item_id, 1
    FROM count_entries e;
  `);

  db.exec(`
    INSERT OR IGNORE INTO count_session_items (session_id, item_id, counted)
    SELECT
      s.id,
      i.id,
      CASE WHEN EXISTS (
        SELECT 1 FROM count_entries e
        WHERE e.session_id = s.id
          AND e.item_id = i.id
      ) THEN 1 ELSE 0 END
    FROM count_sessions s
    JOIN items i ON 1=1
    WHERE NOT EXISTS (
      SELECT 1 FROM count_session_items si
      WHERE si.session_id = s.id
    );
  `);

  // Migration: add from_area_id and to_area_id to transactions
  const txColumns = db.pragma('table_info(transactions)') as Array<{ name: string }>;
  const txColumnNames = txColumns.map((c) => c.name);
  if (!txColumnNames.includes('from_area_id')) {
    db.exec(`
      ALTER TABLE transactions ADD COLUMN from_area_id INTEGER REFERENCES storage_areas(id);
      ALTER TABLE transactions ADD COLUMN to_area_id INTEGER REFERENCES storage_areas(id);
    `);
  }
  if (!txColumnNames.includes('estimated_cost')) {
    db.exec('ALTER TABLE transactions ADD COLUMN estimated_cost REAL;');
  }
  if (!txColumnNames.includes('vendor_price_id')) {
    db.exec('ALTER TABLE transactions ADD COLUMN vendor_price_id INTEGER REFERENCES vendor_prices(id) ON DELETE SET NULL;');
  }

  // Migration: add sort_order to venues
  const venueColumns = db.pragma('table_info(venues)') as Array<{ name: string }>;
  if (!venueColumns.some((c) => c.name === 'sort_order')) {
    db.exec('ALTER TABLE venues ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;');
    // Initialize sort_order from current alphabetical order
    const venueRows = db.prepare('SELECT id FROM venues ORDER BY name ASC').all() as Array<{ id: number }>;
    const updateStmt = db.prepare('UPDATE venues SET sort_order = ? WHERE id = ?');
    for (let i = 0; i < venueRows.length; i++) {
      updateStmt.run(i, venueRows[i].id);
    }
  }

  // Migration: add show_in_menus to venues
  const venueColumns2 = db.pragma('table_info(venues)') as Array<{ name: string }>;
  if (!venueColumns2.some((c) => c.name === 'show_in_menus')) {
    db.exec('ALTER TABLE venues ADD COLUMN show_in_menus INTEGER NOT NULL DEFAULT 1;');
  }

  // Migration: add unit_qty to sales
  const salesColumns = db.pragma('table_info(sales)') as Array<{ name: string }>;
  if (salesColumns.length > 0 && !salesColumns.some((c) => c.name === 'unit_qty')) {
    db.exec('ALTER TABLE sales ADD COLUMN unit_qty INTEGER NOT NULL DEFAULT 1;');
  }

  const forecastEntryColumns = db.pragma('table_info(forecast_entries)') as Array<{ name: string }>;
  if (forecastEntryColumns.length > 0 && !forecastEntryColumns.some((c) => c.name === 'product_code')) {
    db.exec('ALTER TABLE forecast_entries ADD COLUMN product_code TEXT;');
  }

  const proteinUsageColumns = db.pragma('table_info(protein_usage_items)') as Array<{ name: string }>;
  if (proteinUsageColumns.length > 0 && !proteinUsageColumns.some((c) => c.name === 'case_unit_label')) {
    db.exec("ALTER TABLE protein_usage_items ADD COLUMN case_unit_label TEXT NOT NULL DEFAULT 'case';");
  }
  if (proteinUsageColumns.length > 0 && !proteinUsageColumns.some((c) => c.name === 'portions_per_case')) {
    db.exec('ALTER TABLE protein_usage_items ADD COLUMN portions_per_case REAL;');
  }

  db.exec(`
    INSERT OR IGNORE INTO protein_usage_items (name, unit_label, sort_order) VALUES
      ('5oz Tenderloin', 'portion', 1),
      ('Prime Tenderloin', 'portion', 2),
      ('Top Round', 'portion', 3),
      ('Chicken', 'portion', 4),
      ('Lobster', 'portion', 5);
  `);

  // Backfill vendor_prices from existing item vendor+pricing data
  db.exec(`
    INSERT OR IGNORE INTO vendor_prices (item_id, vendor_id, order_unit, order_unit_price, qty_per_unit, is_default)
    SELECT id, vendor_id, order_unit, order_unit_price, qty_per_unit, 1
    FROM items
    WHERE vendor_id IS NOT NULL AND order_unit_price IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM vendor_prices vp WHERE vp.item_id = items.id AND vp.vendor_id = items.vendor_id
      )
  `);

  // Seed default "General" storage area and populate item_storage
  const generalArea = db.prepare(
    "SELECT id FROM storage_areas WHERE name = 'General'"
  ).get() as { id: number } | undefined;

  if (!generalArea) {
    const result = db.prepare(
      "INSERT INTO storage_areas (name) VALUES ('General')"
    ).run();
    const generalId = result.lastInsertRowid;

    // Move all existing item quantities into item_storage
    db.prepare(`
      INSERT INTO item_storage (item_id, area_id, quantity)
      SELECT id, ?, current_qty FROM items WHERE current_qty > 0
    `).run(generalId);
  }

  initializeIntelligenceDb(db);
  initializeRecipeCostDb(db);
  initializeCanonicalIngredientDb(db);
  initializeCanonicalInventoryMappingDb(db);
  initializeInventoryVendorMappingDb(db);
  initializeTemplateIngredientMappingDb(db);
  initializeRecipeTemplateLibraryDb(db);
  initializeRecipeBuilderDb(db);
  initializeRecipePromotionDb(db);
  initializeScopedPolicyDb(db);
  initializeBenchmarkingDb(db);
}

export function getDb(): Database.Database {
  const dbPath = path.join(__dirname, '..', 'data', 'fifoflow.db');
  const db = new Database(dbPath);
  initializeDb(db);
  return db;
}
