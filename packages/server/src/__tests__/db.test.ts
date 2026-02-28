import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';

describe('Database', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates items table', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='items'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('creates transactions table', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('creates updated_at trigger', () => {
    const triggers = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name='update_item_timestamp'"
    ).all();
    expect(triggers).toHaveLength(1);
  });

  it('inserts and retrieves an item', () => {
    const result = db.prepare(
      "INSERT INTO items (name, category, unit) VALUES (?, ?, ?)"
    ).run('Ahi Tuna', 'Seafood', 'lb');

    const item = db.prepare("SELECT * FROM items WHERE id = ?").get(result.lastInsertRowid);
    expect(item).toMatchObject({
      name: 'Ahi Tuna',
      category: 'Seafood',
      unit: 'lb',
      current_qty: 0,
    });
  });

  it('enforces foreign key on transactions', () => {
    expect(() => {
      db.prepare(
        "INSERT INTO transactions (item_id, type, quantity, reason) VALUES (?, ?, ?, ?)"
      ).run(9999, 'in', 10, 'Received');
    }).toThrow();
  });
});
