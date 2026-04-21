import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from '@fifoflow/shared';
import { initializeAuthDb } from './auth/schema.js';
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
      order_unit TEXT,
      order_unit_price REAL,
      qty_per_unit REAL,
      inner_unit TEXT,
      item_size_value REAL,
      item_size_unit TEXT,
      item_size TEXT,
      reorder_level REAL,
      reorder_qty REAL,
      vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
      venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
      storage_area_id INTEGER REFERENCES storage_areas(id) ON DELETE SET NULL,
      sale_price REAL,
      brand_name TEXT,
      manufacturer_name TEXT,
      gtin TEXT,
      upc TEXT,
      sysco_supc TEXT,
      manufacturer_item_code TEXT,
      external_product_confidence TEXT CHECK(external_product_confidence IN ('high','medium','low')),
      external_product_last_matched_at TEXT,
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

    CREATE TABLE IF NOT EXISTS inventory_categories (
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

    CREATE TRIGGER IF NOT EXISTS update_inventory_category_timestamp
    AFTER UPDATE ON inventory_categories
    BEGIN
      UPDATE inventory_categories SET updated_at = datetime('now') WHERE id = NEW.id;
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
    CREATE INDEX IF NOT EXISTS idx_inventory_categories_name ON inventory_categories(name);
    CREATE INDEX IF NOT EXISTS idx_orders_vendor_id ON orders(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
    CREATE TABLE IF NOT EXISTS vendor_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      vendor_item_name TEXT,
      vendor_item_code TEXT,
      vendor_pack_text TEXT,
      order_unit TEXT,
      order_unit_price REAL NOT NULL,
      qty_per_unit REAL,
      gtin TEXT,
      upc TEXT,
      sysco_supc TEXT,
      brand_name TEXT,
      manufacturer_name TEXT,
      source_catalog TEXT,
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

    CREATE TABLE IF NOT EXISTS external_product_catalogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('sysco','usda_fdc','gdsn','manual_import')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS external_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      catalog_id INTEGER NOT NULL REFERENCES external_product_catalogs(id) ON DELETE CASCADE,
      external_key TEXT NOT NULL,
      gtin TEXT,
      upc TEXT,
      vendor_item_code TEXT,
      sysco_supc TEXT,
      brand_name TEXT,
      manufacturer_name TEXT,
      product_name TEXT NOT NULL,
      pack_text TEXT,
      size_text TEXT,
      ingredient_statement TEXT,
      allergen_statement TEXT,
      nutrition_json TEXT NOT NULL DEFAULT '{}',
      raw_payload_json TEXT NOT NULL DEFAULT '{}',
      source_url TEXT,
      last_seen_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(catalog_id, external_key)
    );

    CREATE TABLE IF NOT EXISTS external_product_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      vendor_price_id INTEGER REFERENCES vendor_prices(id) ON DELETE SET NULL,
      external_product_id INTEGER NOT NULL REFERENCES external_products(id) ON DELETE CASCADE,
      match_status TEXT NOT NULL CHECK(match_status IN ('suggested','confirmed','rejected','auto_confirmed')),
      match_basis TEXT NOT NULL CHECK(match_basis IN ('gtin','upc','sysco_supc','vendor_item_code','name_pack','operator')),
      match_confidence TEXT NOT NULL CHECK(match_confidence IN ('high','medium','low')),
      match_score REAL,
      matched_by TEXT NOT NULL CHECK(matched_by IN ('system','operator')) DEFAULT 'system',
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(item_id, external_product_id)
    );

    CREATE TABLE IF NOT EXISTS external_product_allergen_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_product_id INTEGER NOT NULL REFERENCES external_products(id) ON DELETE CASCADE,
      allergen_id INTEGER NOT NULL REFERENCES allergens(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('contains','may_contain','free_of','unknown')),
      confidence TEXT NOT NULL CHECK(confidence IN ('verified','high','moderate','low','unverified','unknown')),
      source_excerpt TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(external_product_id, allergen_id)
    );

    CREATE TABLE IF NOT EXISTS external_product_sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      catalog_id INTEGER NOT NULL REFERENCES external_product_catalogs(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      summary_json TEXT NOT NULL DEFAULT '{}',
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS item_allergen_import_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      external_product_match_id INTEGER REFERENCES external_product_matches(id) ON DELETE SET NULL,
      import_source TEXT NOT NULL CHECK(import_source IN ('external_product','uploaded_chart','operator')),
      import_mode TEXT NOT NULL CHECK(import_mode IN ('draft_claims','direct_apply')),
      summary_json TEXT NOT NULL DEFAULT '{}',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_external_products_gtin ON external_products(gtin);
    CREATE INDEX IF NOT EXISTS idx_external_products_upc ON external_products(upc);
    CREATE INDEX IF NOT EXISTS idx_external_products_sysco_supc ON external_products(sysco_supc);
    CREATE INDEX IF NOT EXISTS idx_external_products_vendor_item_code ON external_products(vendor_item_code);
    CREATE INDEX IF NOT EXISTS idx_external_products_name ON external_products(product_name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_external_product_matches_item_id ON external_product_matches(item_id, active DESC, match_status);
    CREATE INDEX IF NOT EXISTS idx_external_product_matches_external_product_id ON external_product_matches(external_product_id, match_status);
    CREATE INDEX IF NOT EXISTS idx_external_product_matches_status ON external_product_matches(match_status, match_confidence, match_score DESC);
    CREATE INDEX IF NOT EXISTS idx_external_product_allergen_claims_product_id ON external_product_allergen_claims(external_product_id, allergen_id);
    CREATE INDEX IF NOT EXISTS idx_external_product_sync_runs_catalog_id ON external_product_sync_runs(catalog_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_item_allergen_import_audit_item_id ON item_allergen_import_audit(item_id, created_at DESC);

    CREATE TRIGGER IF NOT EXISTS update_external_product_catalogs_timestamp
    AFTER UPDATE ON external_product_catalogs
    BEGIN
      UPDATE external_product_catalogs SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_external_products_timestamp
    AFTER UPDATE ON external_products
    BEGIN
      UPDATE external_products SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_external_product_matches_timestamp
    AFTER UPDATE ON external_product_matches
    BEGIN
      UPDATE external_product_matches SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_external_product_allergen_claims_timestamp
    AFTER UPDATE ON external_product_allergen_claims
    BEGIN
      UPDATE external_product_allergen_claims SET updated_at = datetime('now') WHERE id = NEW.id;
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

    CREATE TABLE IF NOT EXISTS lunch_menus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(venue_id, year, month)
    );

    CREATE TABLE IF NOT EXISTS lunch_menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_id INTEGER NOT NULL REFERENCES lunch_menus(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      dish_type TEXT NOT NULL CHECK(dish_type IN ('main', 'side')),
      dish_name TEXT NOT NULL,
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      calories INTEGER,
      protein_g REAL,
      fat_g REAL,
      sugar_g REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_lunch_menus_venue_period ON lunch_menus(venue_id, year DESC, month DESC);
    CREATE INDEX IF NOT EXISTS idx_lunch_menu_items_menu_date ON lunch_menu_items(menu_id, date, sort_order);
    CREATE INDEX IF NOT EXISTS idx_lunch_menu_items_recipe_id ON lunch_menu_items(recipe_id);

    CREATE TRIGGER IF NOT EXISTS update_lunch_menus_timestamp
    AFTER UPDATE ON lunch_menus
    BEGIN
      UPDATE lunch_menus SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_lunch_menu_items_timestamp
    AFTER UPDATE ON lunch_menu_items
    BEGIN
      UPDATE lunch_menu_items SET updated_at = datetime('now') WHERE id = NEW.id;
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

    CREATE TABLE IF NOT EXISTS protein_usage_monthly_forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      forecast_product_name TEXT NOT NULL,
      forecast_month TEXT NOT NULL,
      guest_count REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(venue_id, forecast_product_name, forecast_month)
    );

    CREATE INDEX IF NOT EXISTS idx_protein_usage_monthly_forecasts_venue
      ON protein_usage_monthly_forecasts(venue_id, forecast_month, forecast_product_name);

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

    CREATE TRIGGER IF NOT EXISTS update_protein_usage_monthly_forecasts_timestamp
    AFTER UPDATE ON protein_usage_monthly_forecasts
    BEGIN
      UPDATE protein_usage_monthly_forecasts SET updated_at = datetime('now') WHERE id = NEW.id;
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
  addColumnIfMissing('brand_name', 'TEXT');
  addColumnIfMissing('manufacturer_name', 'TEXT');
  addColumnIfMissing('gtin', 'TEXT');
  addColumnIfMissing('upc', 'TEXT');
  addColumnIfMissing('sysco_supc', 'TEXT');
  addColumnIfMissing('manufacturer_item_code', 'TEXT');
  addColumnIfMissing('external_product_confidence', "TEXT CHECK(external_product_confidence IN ('high','medium','low'))");
  addColumnIfMissing('external_product_last_matched_at', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_items_storage_area_id ON items(storage_area_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_items_gtin ON items(gtin)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_items_upc ON items(upc)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_items_sysco_supc ON items(sysco_supc)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_items_manufacturer_item_code ON items(manufacturer_item_code)');

  const vendorPriceColumns = db.pragma('table_info(vendor_prices)') as Array<{ name: string }>;
  const vendorPriceColumnNames = vendorPriceColumns.map((c) => c.name);
  const addVendorPriceColumnIfMissing = (name: string, definition: string) => {
    if (!vendorPriceColumnNames.includes(name)) {
      db.exec(`ALTER TABLE vendor_prices ADD COLUMN ${name} ${definition};`);
      vendorPriceColumnNames.push(name);
    }
  };

  addVendorPriceColumnIfMissing('vendor_item_code', 'TEXT');
  addVendorPriceColumnIfMissing('vendor_pack_text', 'TEXT');
  addVendorPriceColumnIfMissing('gtin', 'TEXT');
  addVendorPriceColumnIfMissing('upc', 'TEXT');
  addVendorPriceColumnIfMissing('sysco_supc', 'TEXT');
  addVendorPriceColumnIfMissing('brand_name', 'TEXT');
  addVendorPriceColumnIfMissing('manufacturer_name', 'TEXT');
  addVendorPriceColumnIfMissing('source_catalog', 'TEXT');

  db.exec('CREATE INDEX IF NOT EXISTS idx_vendor_prices_vendor_item_code ON vendor_prices(vendor_item_code)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_vendor_prices_gtin ON vendor_prices(gtin)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_vendor_prices_upc ON vendor_prices(upc)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_vendor_prices_sysco_supc ON vendor_prices(sysco_supc)');

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

  db.exec(`
    INSERT INTO external_product_catalogs (code, name, source_type)
    VALUES
      ('sysco', 'Sysco Catalog', 'sysco'),
      ('usda_fdc', 'USDA FoodData Central', 'usda_fdc'),
      ('gdsn', 'GS1 GDSN', 'gdsn'),
      ('manual_import', 'Manual Import', 'manual_import')
    ON CONFLICT(code) DO NOTHING;
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

  const seedInventoryCategory = db.prepare(`
    INSERT INTO inventory_categories (name)
    VALUES (?)
    ON CONFLICT(name) DO NOTHING
  `);
  for (const category of CATEGORIES) {
    seedInventoryCategory.run(category);
  }
  db.exec(`
    INSERT INTO inventory_categories (name)
    SELECT DISTINCT category
    FROM items
    WHERE TRIM(COALESCE(category, '')) <> ''
    ON CONFLICT(name) DO NOTHING;
  `);
  db.exec(`
    INSERT INTO inventory_categories (name)
    SELECT DISTINCT template_category
    FROM count_sessions
    WHERE TRIM(COALESCE(template_category, '')) <> ''
    ON CONFLICT(name) DO NOTHING;
  `);

  initializeAuthDb(db);
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
