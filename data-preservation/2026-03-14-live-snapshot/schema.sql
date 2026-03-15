CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit TEXT NOT NULL,
      current_qty REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    , order_unit TEXT, order_unit_price REAL, qty_per_unit REAL, inner_unit TEXT, item_size_value REAL, item_size_unit TEXT, item_size TEXT, reorder_level REAL, reorder_qty REAL, vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL, venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL, storage_area_id INTEGER REFERENCES storage_areas(id) ON DELETE SET NULL);
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id),
      type TEXT NOT NULL CHECK(type IN ('in', 'out')),
      quantity REAL NOT NULL CHECK(quantity > 0),
      reason TEXT NOT NULL CHECK(reason IN ('Received', 'Used', 'Wasted', 'Transferred', 'Returned', 'Adjustment')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    , from_area_id INTEGER REFERENCES storage_areas(id), to_area_id INTEGER REFERENCES storage_areas(id), estimated_cost REAL, vendor_price_id INTEGER REFERENCES vendor_prices(id) ON DELETE SET NULL);
CREATE TABLE count_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open', 'closed')) DEFAULT 'open',
      template_category TEXT,
      notes TEXT,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT
    );
CREATE TABLE count_entries (
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
CREATE TABLE count_session_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES count_sessions(id),
      item_id INTEGER NOT NULL REFERENCES items(id),
      counted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_id, item_id)
    );
CREATE TABLE storage_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
CREATE TABLE item_storage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id),
      area_id INTEGER NOT NULL REFERENCES storage_areas(id),
      quantity REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(item_id, area_id)
    );
CREATE TABLE venues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    , sort_order INTEGER NOT NULL DEFAULT 0, show_in_menus INTEGER NOT NULL DEFAULT 1);
CREATE TABLE vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL REFERENCES vendors(id),
      status TEXT NOT NULL CHECK(status IN ('draft', 'sent')) DEFAULT 'draft',
      notes TEXT,
      total_estimated_cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id),
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL
    );
CREATE TRIGGER update_item_timestamp
    AFTER UPDATE ON items
    BEGIN
      UPDATE items SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
CREATE TRIGGER update_storage_area_timestamp
    AFTER UPDATE ON storage_areas
    BEGIN
      UPDATE storage_areas SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
CREATE TRIGGER update_vendor_timestamp
    AFTER UPDATE ON vendors
    BEGIN
      UPDATE vendors SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
CREATE TRIGGER update_venue_timestamp
    AFTER UPDATE ON venues
    BEGIN
      UPDATE venues SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
CREATE TRIGGER update_order_timestamp
    AFTER UPDATE ON orders
    BEGIN
      UPDATE orders SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
CREATE INDEX idx_transactions_item_id ON transactions(item_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_items_category ON items(category);
CREATE INDEX idx_count_entries_session_id ON count_entries(session_id);
CREATE INDEX idx_count_entries_item_id ON count_entries(item_id);
CREATE INDEX idx_count_session_items_session_id ON count_session_items(session_id);
CREATE INDEX idx_count_session_items_item_id ON count_session_items(item_id);
CREATE INDEX idx_item_storage_item_id ON item_storage(item_id);
CREATE INDEX idx_item_storage_area_id ON item_storage(area_id);
CREATE INDEX idx_orders_vendor_id ON orders(vendor_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_items_vendor_id ON items(vendor_id);
CREATE INDEX idx_items_venue_id ON items(venue_id);
CREATE INDEX idx_items_storage_area_id ON items(storage_area_id);
CREATE TABLE vendor_prices (
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
CREATE INDEX idx_vendor_prices_item_id ON vendor_prices(item_id);
CREATE INDEX idx_vendor_prices_vendor_id ON vendor_prices(vendor_id);
CREATE TRIGGER update_vendor_price_timestamp
    AFTER UPDATE ON vendor_prices
    BEGIN
      UPDATE vendor_prices SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
CREATE TABLE recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('dish', 'prep')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
CREATE TABLE recipe_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id),
      quantity REAL NOT NULL CHECK(quantity > 0),
      unit TEXT NOT NULL,
      UNIQUE(recipe_id, item_id)
    );
CREATE TABLE product_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      portions_per_guest REAL NOT NULL DEFAULT 1.0 CHECK(portions_per_guest > 0),
      UNIQUE(venue_id, recipe_id)
    );
CREATE TRIGGER update_recipe_timestamp
    AFTER UPDATE ON recipes
    BEGIN
      UPDATE recipes SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
CREATE INDEX idx_recipe_items_recipe_id ON recipe_items(recipe_id);
CREATE INDEX idx_recipe_items_item_id ON recipe_items(item_id);
CREATE INDEX idx_product_recipes_venue_id ON product_recipes(venue_id);
CREATE INDEX idx_product_recipes_recipe_id ON product_recipes(recipe_id);
CREATE TABLE forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      date_range_start TEXT,
      date_range_end TEXT,
      raw_dates TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
CREATE TABLE forecast_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      forecast_id INTEGER NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
      product_name TEXT NOT NULL,
      forecast_date TEXT NOT NULL,
      guest_count INTEGER NOT NULL DEFAULT 0
    );
CREATE INDEX idx_forecast_entries_fid ON forecast_entries(forecast_id);
CREATE TABLE forecast_product_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL UNIQUE,
      venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
CREATE TRIGGER update_forecast_mapping_timestamp
    AFTER UPDATE ON forecast_product_mappings
    BEGIN
      UPDATE forecast_product_mappings SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
