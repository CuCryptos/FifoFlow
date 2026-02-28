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

    CREATE TRIGGER IF NOT EXISTS update_item_timestamp
    AFTER UPDATE ON items
    BEGIN
      UPDATE items SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE INDEX IF NOT EXISTS idx_transactions_item_id ON transactions(item_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
  `);
}

export function getDb(): Database.Database {
  const dbPath = path.join(__dirname, '..', 'data', 'fifoflow.db');
  const db = new Database(dbPath);
  initializeDb(db);
  return db;
}
