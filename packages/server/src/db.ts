import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
}

export function getDb(): Database.Database {
  const dbPath = path.join(__dirname, '..', 'data', 'fifoflow.db');
  const db = new Database(dbPath);
  initializeDb(db);
  return db;
}
