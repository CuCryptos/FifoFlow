# FifoFlow v1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a working inventory tracking system with item management, transaction logging, searchable inventory list, activity log, and dashboard stats.

**Architecture:** npm workspaces monorepo with three packages (shared, server, client). Express REST API backed by SQLite via better-sqlite3. React + Vite frontend with TanStack Query for server state. Zod schemas shared between client and server for validation.

**Tech Stack:** TypeScript, React 19, Vite, Tailwind CSS v4, Express, better-sqlite3, Zod, TanStack Query, Vitest

---

### Task 1: Initialize monorepo and workspace structure

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`

**Step 1: Initialize git and create root package.json**

```bash
cd /Users/curtisvaughan/FifoFlow
git init
```

Create `package.json`:
```json
{
  "name": "fifoflow",
  "private": true,
  "workspaces": [
    "packages/shared",
    "packages/server",
    "packages/client"
  ],
  "scripts": {
    "dev": "npm run dev --workspace=packages/server & npm run dev --workspace=packages/client & wait",
    "build": "npm run build --workspace=packages/shared && npm run build --workspace=packages/server && npm run build --workspace=packages/client",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  }
}
```

**Step 2: Create .gitignore**

```gitignore
node_modules/
dist/
*.db
*.db-journal
.env
.DS_Store
```

**Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Step 4: Create packages/shared**

`packages/shared/package.json`:
```json
{
  "name": "@fifoflow/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

**Step 5: Create packages/server**

`packages/server/package.json`:
```json
{
  "name": "@fifoflow/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@fifoflow/shared": "*"
  }
}
```

`packages/server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

**Step 6: Create packages/client**

`packages/client/package.json` — will be scaffolded by Vite in Task 8. For now create a placeholder:
```json
{
  "name": "@fifoflow/client",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "dependencies": {
    "@fifoflow/shared": "*"
  }
}
```

**Step 7: Install root dependencies**

```bash
npm install
```

**Step 8: Commit**

```bash
git add -A
git commit -m "chore: initialize monorepo with workspace structure"
```

---

### Task 2: Build shared package — types, enums, and Zod schemas

**Files:**
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/constants.ts`

**Step 1: Install shared dependencies**

```bash
npm install zod --workspace=packages/shared
```

**Step 2: Create constants**

`packages/shared/src/constants.ts`:
```typescript
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
```

**Step 3: Create types**

`packages/shared/src/types.ts`:
```typescript
import type { CATEGORIES, UNITS, TRANSACTION_TYPES, TRANSACTION_REASONS } from './constants.js';

export type Category = (typeof CATEGORIES)[number];
export type Unit = (typeof UNITS)[number];
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type TransactionReason = (typeof TRANSACTION_REASONS)[number];

export interface Item {
  id: number;
  name: string;
  category: Category;
  unit: Unit;
  current_qty: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  item_id: number;
  type: TransactionType;
  quantity: number;
  reason: TransactionReason;
  notes: string | null;
  created_at: string;
}

export interface TransactionWithItem extends Transaction {
  item_name: string;
  item_unit: string;
}

export interface DashboardStats {
  total_items: number;
  low_stock_count: number;
  out_of_stock_count: number;
  today_transaction_count: number;
}

export interface ReconciliationResult {
  item_id: number;
  item_name: string;
  cached_qty: number;
  computed_qty: number;
  difference: number;
}
```

**Step 4: Create Zod schemas**

`packages/shared/src/schemas.ts`:
```typescript
import { z } from 'zod';
import { CATEGORIES, UNITS, TRANSACTION_TYPES, TRANSACTION_REASONS } from './constants.js';

export const createItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.enum(CATEGORIES),
  unit: z.enum(UNITS),
});

export const updateItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).optional(),
  category: z.enum(CATEGORIES).optional(),
  unit: z.enum(UNITS).optional(),
});

export const createTransactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  quantity: z.number().positive('Quantity must be positive'),
  reason: z.enum(TRANSACTION_REASONS),
  notes: z.string().max(500).nullable().optional(),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
```

**Step 5: Create barrel export**

`packages/shared/src/index.ts`:
```typescript
export * from './constants.js';
export * from './types.js';
export * from './schemas.js';
```

**Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared types, enums, and Zod validation schemas"
```

---

### Task 3: Build server — database layer

**Files:**
- Create: `packages/server/src/db.ts`
- Create: `packages/server/src/seed.ts`
- Test: `packages/server/src/__tests__/db.test.ts`

**Step 1: Install server dependencies**

```bash
npm install express better-sqlite3 cors --workspace=packages/server
npm install -D tsx typescript vitest @types/express @types/better-sqlite3 @types/cors --workspace=packages/server
```

**Step 2: Write the failing test for database initialization**

`packages/server/src/__tests__/db.test.ts`:
```typescript
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
```

**Step 3: Run test to verify it fails**

```bash
cd /Users/curtisvaughan/FifoFlow && npx vitest run --workspace=packages/server 2>&1 || true
```

Expected: FAIL — `initializeDb` does not exist.

**Step 4: Implement database initialization**

`packages/server/src/db.ts`:
```typescript
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
```

**Step 5: Run tests to verify they pass**

```bash
cd /Users/curtisvaughan/FifoFlow && npm test --workspace=packages/server
```

Expected: All 5 tests PASS.

**Step 6: Create seed script**

`packages/server/src/seed.ts`:
```typescript
import { getDb } from './db.js';

const SEED_ITEMS = [
  { name: 'Ahi Tuna', category: 'Seafood', unit: 'lb' },
  { name: 'Mahi Mahi', category: 'Seafood', unit: 'lb' },
  { name: 'Jumbo Shrimp', category: 'Seafood', unit: 'lb' },
  { name: 'Chicken Breast', category: 'Meats', unit: 'lb' },
  { name: 'Prime Rib', category: 'Meats', unit: 'lb' },
  { name: 'Kalua Pork', category: 'Meats', unit: 'lb' },
  { name: 'Jasmine Rice', category: 'Dry Goods', unit: 'bag' },
  { name: 'Macadamia Nuts', category: 'Dry Goods', unit: 'bag' },
  { name: 'Panko Breadcrumbs', category: 'Dry Goods', unit: 'box' },
  { name: 'Soy Sauce', category: 'Dry Goods', unit: 'bottle' },
  { name: 'Sesame Oil', category: 'Dry Goods', unit: 'bottle' },
  { name: 'Maui Onion', category: 'Produce', unit: 'each' },
  { name: 'Baby Bok Choy', category: 'Produce', unit: 'lb' },
  { name: 'Fresh Ginger', category: 'Produce', unit: 'lb' },
  { name: 'Lemongrass', category: 'Produce', unit: 'each' },
  { name: 'Pineapple', category: 'Produce', unit: 'each' },
  { name: 'Heavy Cream', category: 'Dairy', unit: 'qt' },
  { name: 'Unsalted Butter', category: 'Dairy', unit: 'lb' },
  { name: 'Kona Brewing Big Wave', category: 'Beverages', unit: 'case' },
  { name: 'Maui Brewing Bikini Blonde', category: 'Beverages', unit: 'case' },
  { name: 'House White Wine', category: 'Beverages', unit: 'bottle' },
  { name: 'House Red Wine', category: 'Beverages', unit: 'bottle' },
  { name: 'Coconut Syrup', category: 'Beverages', unit: 'bottle' },
  { name: 'To-Go Containers', category: 'Supplies', unit: 'case' },
  { name: 'Cocktail Napkins', category: 'Supplies', unit: 'case' },
  { name: 'Disposable Gloves', category: 'Supplies', unit: 'box' },
  { name: 'Chafing Fuel', category: 'Equipment', unit: 'case' },
];

function seed() {
  const db = getDb();

  const existingCount = db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number };
  if (existingCount.count > 0) {
    console.log('Database already seeded, skipping.');
    db.close();
    return;
  }

  const insertItem = db.prepare(
    'INSERT INTO items (name, category, unit) VALUES (@name, @category, @unit)'
  );
  const insertTx = db.prepare(
    'INSERT INTO transactions (item_id, type, quantity, reason, notes) VALUES (@item_id, @type, @quantity, @reason, @notes)'
  );
  const updateQty = db.prepare(
    'UPDATE items SET current_qty = current_qty + @delta WHERE id = @id'
  );

  const seedAll = db.transaction(() => {
    for (const item of SEED_ITEMS) {
      const result = insertItem.run(item);
      const itemId = result.lastInsertRowid as number;

      // Give each item a random initial receiving
      const qty = Math.floor(Math.random() * 40) + 5;
      insertTx.run({
        item_id: itemId,
        type: 'in',
        quantity: qty,
        reason: 'Received',
        notes: 'Initial inventory count',
      });
      updateQty.run({ delta: qty, id: itemId });

      // Use some of each item randomly
      const used = Math.floor(Math.random() * qty * 0.8);
      if (used > 0) {
        insertTx.run({
          item_id: itemId,
          type: 'out',
          quantity: used,
          reason: 'Used',
          notes: null,
        });
        updateQty.run({ delta: -used, id: itemId });
      }
    }
  });

  seedAll();
  console.log(`Seeded ${SEED_ITEMS.length} items with transactions.`);
  db.close();
}

seed();
```

Add seed script to `packages/server/package.json` scripts:
```json
"seed": "tsx src/seed.ts"
```

**Step 7: Create data directory and seed**

```bash
mkdir -p packages/server/data
echo "*.db" >> packages/server/data/.gitignore
echo "*.db-journal" >> packages/server/data/.gitignore
npm run seed --workspace=packages/server
```

**Step 8: Commit**

```bash
git add packages/server/src/db.ts packages/server/src/seed.ts packages/server/src/__tests__/ packages/server/package.json packages/server/data/.gitignore package-lock.json
git commit -m "feat: add database schema, initialization, seed data, and db tests"
```

---

### Task 4: Build server — API routes for items

**Files:**
- Create: `packages/server/src/routes/items.ts`
- Test: `packages/server/src/__tests__/items.test.ts`

**Step 1: Write failing tests for item CRUD**

`packages/server/src/__tests__/items.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createItemRoutes } from '../routes/items.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const app = express();
  app.use(express.json());
  app.use('/api/items', createItemRoutes(db));
  return { app, db };
}

describe('Items API', () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(() => {
    ({ app, db } = createTestApp());
  });

  afterEach(() => {
    db.close();
  });

  describe('POST /api/items', () => {
    it('creates an item', async () => {
      const res = await request(app)
        .post('/api/items')
        .send({ name: 'Ahi Tuna', category: 'Seafood', unit: 'lb' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'Ahi Tuna',
        category: 'Seafood',
        unit: 'lb',
        current_qty: 0,
      });
      expect(res.body.id).toBeDefined();
    });

    it('rejects invalid category', async () => {
      const res = await request(app)
        .post('/api/items')
        .send({ name: 'Test', category: 'InvalidCat', unit: 'lb' });
      expect(res.status).toBe(400);
    });

    it('rejects missing name', async () => {
      const res = await request(app)
        .post('/api/items')
        .send({ category: 'Seafood', unit: 'lb' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/items', () => {
    beforeEach(() => {
      db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb');
      db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Jasmine Rice', 'Dry Goods', 'bag');
      db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Maui Onion', 'Produce', 'each');
    });

    it('lists all items', async () => {
      const res = await request(app).get('/api/items');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
    });

    it('filters by category', async () => {
      const res = await request(app).get('/api/items?category=Seafood');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Ahi Tuna');
    });

    it('searches by name', async () => {
      const res = await request(app).get('/api/items?search=rice');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Jasmine Rice');
    });
  });

  describe('GET /api/items/:id', () => {
    it('returns item with recent transactions', async () => {
      const result = db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb');
      const itemId = result.lastInsertRowid;
      db.prepare("INSERT INTO transactions (item_id, type, quantity, reason) VALUES (?, ?, ?, ?)").run(itemId, 'in', 20, 'Received');

      const res = await request(app).get(`/api/items/${itemId}`);
      expect(res.status).toBe(200);
      expect(res.body.item.name).toBe('Ahi Tuna');
      expect(res.body.transactions).toHaveLength(1);
    });

    it('returns 404 for nonexistent item', async () => {
      const res = await request(app).get('/api/items/9999');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/items/:id', () => {
    it('updates item fields', async () => {
      const result = db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb');
      const res = await request(app)
        .put(`/api/items/${result.lastInsertRowid}`)
        .send({ name: 'Yellowfin Tuna' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Yellowfin Tuna');
    });
  });

  describe('DELETE /api/items/:id', () => {
    it('deletes item with no transactions', async () => {
      const result = db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb');
      const res = await request(app).delete(`/api/items/${result.lastInsertRowid}`);
      expect(res.status).toBe(204);
    });

    it('blocks delete when transactions exist', async () => {
      const result = db.prepare("INSERT INTO items (name, category, unit) VALUES (?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb');
      db.prepare("INSERT INTO transactions (item_id, type, quantity, reason) VALUES (?, ?, ?, ?)").run(result.lastInsertRowid, 'in', 10, 'Received');
      const res = await request(app).delete(`/api/items/${result.lastInsertRowid}`);
      expect(res.status).toBe(409);
    });
  });
});
```

**Step 2: Install supertest**

```bash
npm install -D supertest @types/supertest --workspace=packages/server
```

**Step 3: Run tests to verify they fail**

```bash
npm test --workspace=packages/server
```

Expected: FAIL — `createItemRoutes` does not exist.

**Step 4: Implement item routes**

`packages/server/src/routes/items.ts`:
```typescript
import { Router } from 'express';
import type Database from 'better-sqlite3';
import { createItemSchema, updateItemSchema } from '@fifoflow/shared';
import type { Item, Transaction } from '@fifoflow/shared';

export function createItemRoutes(db: Database.Database): Router {
  const router = Router();

  // GET /api/items
  router.get('/', (req, res) => {
    const { search, category } = req.query;
    let sql = 'SELECT * FROM items WHERE 1=1';
    const params: unknown[] = [];

    if (category && typeof category === 'string') {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (search && typeof search === 'string') {
      sql += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }

    sql += ' ORDER BY name ASC';
    const items = db.prepare(sql).all(...params);
    res.json(items);
  });

  // GET /api/items/:id
  router.get('/:id', (req, res) => {
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id) as Item | undefined;
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const transactions = db.prepare(
      'SELECT * FROM transactions WHERE item_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(req.params.id) as Transaction[];

    res.json({ item, transactions });
  });

  // POST /api/items
  router.post('/', (req, res) => {
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { name, category, unit } = parsed.data;
    const result = db.prepare(
      'INSERT INTO items (name, category, unit) VALUES (?, ?, ?)'
    ).run(name, category, unit);

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  });

  // PUT /api/items/:id
  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id) as Item | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const updates = parsed.data;
    const fields = Object.entries(updates).filter(([, v]) => v !== undefined);
    if (fields.length === 0) {
      res.json(existing);
      return;
    }

    const setClauses = fields.map(([key]) => `${key} = ?`).join(', ');
    const values = fields.map(([, v]) => v);

    db.prepare(`UPDATE items SET ${setClauses} WHERE id = ?`).run(...values, req.params.id);
    const updated = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
    res.json(updated);
  });

  // DELETE /api/items/:id
  router.delete('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id) as Item | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const txCount = db.prepare(
      'SELECT COUNT(*) as count FROM transactions WHERE item_id = ?'
    ).get(req.params.id) as { count: number };

    if (txCount.count > 0) {
      res.status(409).json({ error: 'Cannot delete item with transaction history' });
      return;
    }

    db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
    res.status(204).send();
  });

  return router;
}
```

**Step 5: Run tests to verify they pass**

```bash
npm test --workspace=packages/server
```

Expected: All item tests PASS.

**Step 6: Commit**

```bash
git add packages/server/src/routes/ packages/server/src/__tests__/items.test.ts package-lock.json
git commit -m "feat: add item CRUD API routes with tests"
```

---

### Task 5: Build server — transaction routes, dashboard stats, reconciliation

**Files:**
- Create: `packages/server/src/routes/transactions.ts`
- Create: `packages/server/src/routes/dashboard.ts`
- Create: `packages/server/src/routes/reconcile.ts`
- Test: `packages/server/src/__tests__/transactions.test.ts`
- Test: `packages/server/src/__tests__/dashboard.test.ts`

**Step 1: Write failing tests for transactions**

`packages/server/src/__tests__/transactions.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createItemRoutes } from '../routes/items.js';
import { createTransactionRoutes } from '../routes/transactions.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const app = express();
  app.use(express.json());
  app.use('/api/items', createItemRoutes(db));
  app.use('/api/transactions', createTransactionRoutes(db));
  return { app, db };
}

describe('Transactions API', () => {
  let app: express.Express;
  let db: Database.Database;
  let itemId: number;

  beforeEach(() => {
    ({ app, db } = createTestApp());
    const result = db.prepare("INSERT INTO items (name, category, unit, current_qty) VALUES (?, ?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb', 10);
    itemId = result.lastInsertRowid as number;
  });

  afterEach(() => {
    db.close();
  });

  describe('POST /api/items/:id/transactions', () => {
    it('logs an IN transaction and updates quantity', async () => {
      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({ type: 'in', quantity: 5, reason: 'Received' });
      expect(res.status).toBe(201);
      expect(res.body.transaction.quantity).toBe(5);
      expect(res.body.item.current_qty).toBe(15);
    });

    it('logs an OUT transaction and updates quantity', async () => {
      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({ type: 'out', quantity: 3, reason: 'Used' });
      expect(res.status).toBe(201);
      expect(res.body.item.current_qty).toBe(7);
    });

    it('rejects negative resulting quantity', async () => {
      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({ type: 'out', quantity: 999, reason: 'Used' });
      expect(res.status).toBe(400);
    });

    it('rejects invalid reason', async () => {
      const res = await request(app)
        .post(`/api/items/${itemId}/transactions`)
        .send({ type: 'in', quantity: 5, reason: 'Stolen' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/transactions', () => {
    beforeEach(() => {
      db.prepare("INSERT INTO transactions (item_id, type, quantity, reason) VALUES (?, ?, ?, ?)").run(itemId, 'in', 20, 'Received');
      db.prepare("INSERT INTO transactions (item_id, type, quantity, reason) VALUES (?, ?, ?, ?)").run(itemId, 'out', 5, 'Used');
    });

    it('lists all transactions with item name', async () => {
      const res = await request(app).get('/api/transactions');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      expect(res.body[0].item_name).toBe('Ahi Tuna');
    });

    it('filters by item_id', async () => {
      const res = await request(app).get(`/api/transactions?item_id=${itemId}`);
      expect(res.status).toBe(200);
      expect(res.body.every((t: any) => t.item_id === itemId)).toBe(true);
    });
  });
});
```

**Step 2: Write failing tests for dashboard**

`packages/server/src/__tests__/dashboard.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createDashboardRoutes } from '../routes/dashboard.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard', createDashboardRoutes(db));
  return { app, db };
}

describe('Dashboard API', () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(() => {
    ({ app, db } = createTestApp());
    db.prepare("INSERT INTO items (name, category, unit, current_qty) VALUES (?, ?, ?, ?)").run('Ahi Tuna', 'Seafood', 'lb', 20);
    db.prepare("INSERT INTO items (name, category, unit, current_qty) VALUES (?, ?, ?, ?)").run('Rice', 'Dry Goods', 'bag', 3);
    db.prepare("INSERT INTO items (name, category, unit, current_qty) VALUES (?, ?, ?, ?)").run('Gloves', 'Supplies', 'box', 0);
  });

  afterEach(() => {
    db.close();
  });

  it('returns correct stats', async () => {
    const res = await request(app).get('/api/dashboard/stats');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total_items: 3,
      low_stock_count: 1,   // Rice at 3
      out_of_stock_count: 1, // Gloves at 0
    });
    expect(res.body.today_transaction_count).toBeDefined();
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
npm test --workspace=packages/server
```

**Step 4: Implement transaction routes**

`packages/server/src/routes/transactions.ts`:
```typescript
import { Router } from 'express';
import type Database from 'better-sqlite3';
import { createTransactionSchema } from '@fifoflow/shared';
import type { Item, TransactionWithItem } from '@fifoflow/shared';

export function createTransactionRoutes(db: Database.Database): Router {
  const router = Router();

  // POST /api/items/:id/transactions (mounted under /api/items in app, but we re-export for /api/items usage)
  // This will actually be mounted on the items router — see note below.
  // Standalone transaction list route:

  // GET /api/transactions
  router.get('/', (req, res) => {
    const { item_id, type, limit = '50', offset = '0' } = req.query;
    let sql = `
      SELECT t.*, i.name as item_name, i.unit as item_unit
      FROM transactions t
      JOIN items i ON t.item_id = i.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (item_id) {
      sql += ' AND t.item_id = ?';
      params.push(item_id);
    }
    if (type && typeof type === 'string') {
      sql += ' AND t.type = ?';
      params.push(type);
    }

    sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const transactions = db.prepare(sql).all(...params) as TransactionWithItem[];
    res.json(transactions);
  });

  return router;
}

// Function to add transaction creation to item routes
export function createTransactionHandler(db: Database.Database) {
  return (req: any, res: any) => {
    const itemId = Number(req.params.id);
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as Item | undefined;
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const parsed = createTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { type, quantity, reason, notes } = parsed.data;
    const delta = type === 'in' ? quantity : -quantity;

    if (item.current_qty + delta < 0) {
      res.status(400).json({ error: 'Insufficient quantity. Cannot go below zero.' });
      return;
    }

    const execute = db.transaction(() => {
      const result = db.prepare(
        'INSERT INTO transactions (item_id, type, quantity, reason, notes) VALUES (?, ?, ?, ?, ?)'
      ).run(itemId, type, quantity, reason, notes ?? null);

      db.prepare('UPDATE items SET current_qty = current_qty + ? WHERE id = ?').run(delta, itemId);

      const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
      const updatedItem = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
      return { transaction, item: updatedItem };
    });

    const result = execute();
    res.status(201).json(result);
  };
}
```

Then update `packages/server/src/routes/items.ts` — add after the DELETE route, before `return router`:
```typescript
import { createTransactionHandler } from './transactions.js';
// ... inside createItemRoutes, add:
router.post('/:id/transactions', createTransactionHandler(db));
```

**Step 5: Implement dashboard routes**

`packages/server/src/routes/dashboard.ts`:
```typescript
import { Router } from 'express';
import type Database from 'better-sqlite3';
import { LOW_STOCK_THRESHOLD } from '@fifoflow/shared';
import type { DashboardStats } from '@fifoflow/shared';

export function createDashboardRoutes(db: Database.Database): Router {
  const router = Router();

  router.get('/stats', (_req, res) => {
    const totalItems = db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number };
    const lowStock = db.prepare(
      'SELECT COUNT(*) as count FROM items WHERE current_qty > 0 AND current_qty <= ?'
    ).get(LOW_STOCK_THRESHOLD) as { count: number };
    const outOfStock = db.prepare(
      'SELECT COUNT(*) as count FROM items WHERE current_qty = 0'
    ).get() as { count: number };
    const todayTx = db.prepare(
      "SELECT COUNT(*) as count FROM transactions WHERE date(created_at) = date('now')"
    ).get() as { count: number };

    const stats: DashboardStats = {
      total_items: totalItems.count,
      low_stock_count: lowStock.count,
      out_of_stock_count: outOfStock.count,
      today_transaction_count: todayTx.count,
    };

    res.json(stats);
  });

  return router;
}
```

**Step 6: Implement reconcile route**

`packages/server/src/routes/reconcile.ts`:
```typescript
import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { ReconciliationResult } from '@fifoflow/shared';

export function createReconcileRoutes(db: Database.Database): Router {
  const router = Router();

  router.post('/', (_req, res) => {
    const items = db.prepare('SELECT id, name, current_qty FROM items').all() as Array<{
      id: number; name: string; current_qty: number;
    }>;

    const computeQty = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type = 'in' THEN quantity ELSE -quantity END), 0) as computed
      FROM transactions WHERE item_id = ?
    `);

    const mismatches: ReconciliationResult[] = [];
    const fix = db.prepare('UPDATE items SET current_qty = ? WHERE id = ?');

    const reconcile = db.transaction(() => {
      for (const item of items) {
        const { computed } = computeQty.get(item.id) as { computed: number };
        if (Math.abs(item.current_qty - computed) > 0.001) {
          mismatches.push({
            item_id: item.id,
            item_name: item.name,
            cached_qty: item.current_qty,
            computed_qty: computed,
            difference: item.current_qty - computed,
          });
          fix.run(computed, item.id);
        }
      }
    });

    reconcile();

    res.json({
      checked: items.length,
      mismatches_found: mismatches.length,
      mismatches,
      fixed: mismatches.length > 0,
    });
  });

  return router;
}
```

**Step 7: Run all tests**

```bash
npm test --workspace=packages/server
```

Expected: All tests PASS.

**Step 8: Commit**

```bash
git add packages/server/src/routes/ packages/server/src/__tests__/ package-lock.json
git commit -m "feat: add transaction, dashboard, and reconciliation API routes with tests"
```

---

### Task 6: Build server — Express app entry point

**Files:**
- Create: `packages/server/src/index.ts`

**Step 1: Create the Express app**

`packages/server/src/index.ts`:
```typescript
import express from 'express';
import cors from 'cors';
import { getDb } from './db.js';
import { createItemRoutes } from './routes/items.js';
import { createTransactionRoutes } from './routes/transactions.js';
import { createDashboardRoutes } from './routes/dashboard.js';
import { createReconcileRoutes } from './routes/reconcile.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const db = getDb();

app.use('/api/items', createItemRoutes(db));
app.use('/api/transactions', createTransactionRoutes(db));
app.use('/api/dashboard', createDashboardRoutes(db));
app.use('/api/reconcile', createReconcileRoutes(db));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`FifoFlow server running on http://localhost:${PORT}`);
});
```

**Step 2: Verify server starts**

```bash
cd /Users/curtisvaughan/FifoFlow && npx tsx packages/server/src/index.ts &
sleep 2
curl http://localhost:3001/api/health
curl http://localhost:3001/api/items | head -c 200
kill %1
```

Expected: `{"status":"ok"}` and a JSON array of items.

**Step 3: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat: add Express server entry point with all routes mounted"
```

---

### Task 7: Scaffold React client with Vite

**Files:**
- Overwrite: `packages/client/` (Vite scaffold)
- Modify: `packages/client/package.json` (add workspace dependency)

**Step 1: Scaffold Vite React TypeScript project**

```bash
cd /Users/curtisvaughan/FifoFlow
rm -rf packages/client
npm create vite@latest packages/client -- --template react-ts
```

**Step 2: Update client package.json**

Add to `packages/client/package.json`:
- Change `"name"` to `"@fifoflow/client"`
- Add `"@fifoflow/shared": "*"` to dependencies

**Step 3: Install client dependencies**

```bash
npm install @tanstack/react-query react-router-dom --workspace=packages/client
npm install -D tailwindcss @tailwindcss/vite --workspace=packages/client
npm install
```

**Step 4: Configure Vite with Tailwind and API proxy**

Update `packages/client/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
```

**Step 5: Set up Tailwind with custom theme**

Replace `packages/client/src/index.css`:
```css
@import "tailwindcss";
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&display=swap');

@theme {
  --color-navy: #0F1419;
  --color-navy-light: #1A2332;
  --color-navy-lighter: #243044;
  --color-border: #2D3A4A;
  --color-text-primary: #E8EAED;
  --color-text-secondary: #8B95A5;
  --color-accent-green: #34D399;
  --color-accent-red: #F87171;
  --color-accent-amber: #E8A838;
  --font-mono: 'IBM Plex Mono', monospace;
}

body {
  font-family: var(--font-mono);
  background-color: var(--color-navy);
  color: var(--color-text-primary);
  margin: 0;
}
```

**Step 6: Commit**

```bash
git add packages/client/ package-lock.json
git commit -m "feat: scaffold React client with Vite, Tailwind, and custom dark theme"
```

---

### Task 8: Build client — API layer and shared hooks

**Files:**
- Create: `packages/client/src/api.ts`
- Create: `packages/client/src/hooks/useItems.ts`
- Create: `packages/client/src/hooks/useTransactions.ts`
- Create: `packages/client/src/hooks/useDashboard.ts`

**Step 1: Create API client**

`packages/client/src/api.ts`:
```typescript
import type {
  Item,
  Transaction,
  TransactionWithItem,
  DashboardStats,
  CreateItemInput,
  UpdateItemInput,
  CreateTransactionInput,
} from '@fifoflow/shared';

const BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  items: {
    list: (params?: { search?: string; category?: string }) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.category) qs.set('category', params.category);
      const query = qs.toString();
      return fetchJson<Item[]>(`/items${query ? `?${query}` : ''}`);
    },
    get: (id: number) => fetchJson<{ item: Item; transactions: Transaction[] }>(`/items/${id}`),
    create: (data: CreateItemInput) =>
      fetchJson<Item>('/items', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: UpdateItemInput) =>
      fetchJson<Item>(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      fetchJson<void>(`/items/${id}`, { method: 'DELETE' }),
  },
  transactions: {
    list: (params?: { item_id?: number; type?: string; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.item_id) qs.set('item_id', String(params.item_id));
      if (params?.type) qs.set('type', params.type);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.offset) qs.set('offset', String(params.offset));
      const query = qs.toString();
      return fetchJson<TransactionWithItem[]>(`/transactions${query ? `?${query}` : ''}`);
    },
    create: (itemId: number, data: CreateTransactionInput) =>
      fetchJson<{ transaction: Transaction; item: Item }>(
        `/items/${itemId}/transactions`,
        { method: 'POST', body: JSON.stringify(data) }
      ),
  },
  dashboard: {
    stats: () => fetchJson<DashboardStats>('/dashboard/stats'),
  },
  reconcile: () => fetchJson<any>('/reconcile', { method: 'POST' }),
};
```

**Step 2: Create TanStack Query hooks**

`packages/client/src/hooks/useItems.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateItemInput, UpdateItemInput } from '@fifoflow/shared';

export function useItems(params?: { search?: string; category?: string }) {
  return useQuery({
    queryKey: ['items', params],
    queryFn: () => api.items.list(params),
  });
}

export function useItem(id: number) {
  return useQuery({
    queryKey: ['items', id],
    queryFn: () => api.items.get(id),
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateItemInput) => api.items.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); },
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateItemInput }) => api.items.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.items.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); },
  });
}
```

`packages/client/src/hooks/useTransactions.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateTransactionInput } from '@fifoflow/shared';

export function useTransactions(params?: { item_id?: number; type?: string; limit?: number }) {
  return useQuery({
    queryKey: ['transactions', params],
    queryFn: () => api.transactions.list(params),
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: CreateTransactionInput }) =>
      api.transactions.create(itemId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
```

`packages/client/src/hooks/useDashboard.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.dashboard.stats(),
    refetchInterval: 30000, // refresh every 30s
  });
}
```

**Step 3: Commit**

```bash
git add packages/client/src/
git commit -m "feat: add API client and TanStack Query hooks for items, transactions, dashboard"
```

---

### Task 9: Build client — layout, navigation, and routing

**Files:**
- Create: `packages/client/src/components/Layout.tsx`
- Create: `packages/client/src/pages/Dashboard.tsx` (placeholder)
- Create: `packages/client/src/pages/Inventory.tsx` (placeholder)
- Create: `packages/client/src/pages/ItemDetail.tsx` (placeholder)
- Create: `packages/client/src/pages/Activity.tsx` (placeholder)
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/main.tsx`

**Step 1: Create Layout component**

`packages/client/src/components/Layout.tsx`:
```tsx
import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/activity', label: 'Activity' },
];

export function Layout() {
  return (
    <div className="min-h-screen bg-navy">
      <nav className="bg-navy-light border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span className="text-accent-green font-bold text-lg tracking-wider">FIFOFLOW</span>
          <div className="flex gap-1">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded text-sm transition-colors ${
                    isActive
                      ? 'bg-navy-lighter text-accent-green'
                      : 'text-text-secondary hover:text-text-primary'
                  }`
                }
                end={to === '/'}
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
```

**Step 2: Create placeholder pages**

Each page file exports a simple component returning a `<div>` with the page name. These are filled out in Tasks 10-13.

**Step 3: Set up routing in App.tsx**

`packages/client/src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import { ItemDetail } from './pages/ItemDetail';
import { Activity } from './pages/Activity';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10000, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/inventory/:id" element={<ItemDetail />} />
            <Route path="/activity" element={<Activity />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

**Step 4: Clean up main.tsx** — remove default Vite CSS imports, ensure it renders `<App />` with StrictMode.

**Step 5: Verify it compiles**

```bash
npm run dev --workspace=packages/client &
sleep 3
curl -s http://localhost:5173 | head -20
kill %1
```

**Step 6: Commit**

```bash
git add packages/client/src/
git commit -m "feat: add layout, navigation, and React Router setup"
```

---

### Task 10: Build client — Dashboard page

**Files:**
- Modify: `packages/client/src/pages/Dashboard.tsx`

**Step 1: Implement Dashboard with stats cards and recent activity**

`packages/client/src/pages/Dashboard.tsx`:
```tsx
import { useDashboardStats } from '../hooks/useDashboard';
import { useTransactions } from '../hooks/useTransactions';
import { LOW_STOCK_THRESHOLD } from '@fifoflow/shared';

export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: recentTx, isLoading: txLoading } = useTransactions({ limit: 10 });

  if (statsLoading) return <div className="text-text-secondary">Loading...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Items" value={stats?.total_items ?? 0} />
        <StatCard label="Low Stock" value={stats?.low_stock_count ?? 0} color="amber" subtitle={`≤ ${LOW_STOCK_THRESHOLD} units`} />
        <StatCard label="Out of Stock" value={stats?.out_of_stock_count ?? 0} color="red" />
        <StatCard label="Today's Transactions" value={stats?.today_transaction_count ?? 0} color="green" />
      </div>

      {/* Recent activity */}
      <div>
        <h2 className="text-sm font-medium text-text-secondary mb-3">Recent Activity</h2>
        {txLoading ? (
          <div className="text-text-secondary text-sm">Loading...</div>
        ) : recentTx && recentTx.length > 0 ? (
          <div className="space-y-2">
            {recentTx.map((tx) => (
              <div key={tx.id} className="bg-navy-light border border-border rounded px-4 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className={tx.type === 'in' ? 'text-accent-green' : 'text-accent-red'}>
                    {tx.type === 'in' ? '+' : '-'}{tx.quantity}
                  </span>
                  <span className="text-text-primary">{tx.item_name}</span>
                  <span className="text-text-secondary">{tx.reason}</span>
                </div>
                <span className="text-text-secondary text-xs">
                  {new Date(tx.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-text-secondary text-sm">No transactions yet.</div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, subtitle }: {
  label: string; value: number; color?: 'green' | 'red' | 'amber'; subtitle?: string;
}) {
  const colorClass = color === 'green' ? 'text-accent-green'
    : color === 'red' ? 'text-accent-red'
    : color === 'amber' ? 'text-accent-amber'
    : 'text-text-primary';

  return (
    <div className="bg-navy-light border border-border rounded-lg p-4">
      <div className="text-text-secondary text-xs mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
      {subtitle && <div className="text-text-secondary text-xs mt-1">{subtitle}</div>}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/client/src/pages/Dashboard.tsx
git commit -m "feat: add Dashboard page with stats cards and recent activity"
```

---

### Task 11: Build client — Inventory list page

**Files:**
- Modify: `packages/client/src/pages/Inventory.tsx`
- Create: `packages/client/src/components/AddItemModal.tsx`

**Step 1: Implement Inventory list with search, filter, stock indicators**

`packages/client/src/pages/Inventory.tsx`:
```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useItems } from '../hooks/useItems';
import { CATEGORIES, LOW_STOCK_THRESHOLD } from '@fifoflow/shared';
import { AddItemModal } from '../components/AddItemModal';

export function Inventory() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const { data: items, isLoading } = useItems({
    search: search || undefined,
    category: category || undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-accent-green text-navy px-4 py-2 rounded text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + Add Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-navy-light border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary flex-1 max-w-sm focus:outline-none focus:border-accent-green"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-navy-light border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Item list */}
      {isLoading ? (
        <div className="text-text-secondary text-sm">Loading...</div>
      ) : items && items.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-lighter text-text-secondary text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-border hover:bg-navy-lighter/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/inventory/${item.id}`} className="text-accent-green hover:underline">
                      {item.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{item.category}</td>
                  <td className="px-4 py-3 font-medium">{item.current_qty}</td>
                  <td className="px-4 py-3 text-text-secondary">{item.unit}</td>
                  <td className="px-4 py-3">
                    <StockBadge qty={item.current_qty} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-text-secondary text-sm">No items found.</div>
      )}

      {showAddModal && <AddItemModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}

function StockBadge({ qty }: { qty: number }) {
  if (qty === 0) {
    return <span className="text-xs px-2 py-0.5 rounded bg-accent-red/20 text-accent-red">OUT</span>;
  }
  if (qty <= LOW_STOCK_THRESHOLD) {
    return <span className="text-xs px-2 py-0.5 rounded bg-accent-amber/20 text-accent-amber">LOW</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded bg-accent-green/20 text-accent-green">OK</span>;
}
```

**Step 2: Create AddItemModal**

`packages/client/src/components/AddItemModal.tsx`:
```tsx
import { useState } from 'react';
import { useCreateItem } from '../hooks/useItems';
import { CATEGORIES, UNITS } from '@fifoflow/shared';
import type { Category, Unit } from '@fifoflow/shared';

export function AddItemModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [unit, setUnit] = useState<Unit>(UNITS[0]);
  const createItem = useCreateItem();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createItem.mutate({ name, category, unit }, {
      onSuccess: () => onClose(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-navy-light border border-border rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Add Item</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
              >
                {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as Unit)}
                className="w-full bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          {createItem.error && (
            <div className="text-accent-red text-xs">{createItem.error.message}</div>
          )}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={createItem.isPending}
              className="bg-accent-green text-navy px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {createItem.isPending ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add packages/client/src/
git commit -m "feat: add Inventory list page with search, filters, stock badges, and add item modal"
```

---

### Task 12: Build client — Item Detail page

**Files:**
- Modify: `packages/client/src/pages/ItemDetail.tsx`
- Create: `packages/client/src/components/TransactionForm.tsx`

**Step 1: Implement Item Detail page**

`packages/client/src/pages/ItemDetail.tsx`:
```tsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useItem, useUpdateItem, useDeleteItem } from '../hooks/useItems';
import { CATEGORIES, UNITS } from '@fifoflow/shared';
import type { Category, Unit } from '@fifoflow/shared';
import { TransactionForm } from '../components/TransactionForm';

export function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useItem(Number(id));
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<Category>(CATEGORIES[0]);
  const [editUnit, setEditUnit] = useState<Unit>(UNITS[0]);

  if (isLoading) return <div className="text-text-secondary">Loading...</div>;
  if (!data) return <div className="text-accent-red">Item not found.</div>;

  const { item, transactions } = data;

  const startEdit = () => {
    setEditName(item.name);
    setEditCategory(item.category);
    setEditUnit(item.unit);
    setEditing(true);
  };

  const saveEdit = () => {
    updateItem.mutate(
      { id: item.id, data: { name: editName, category: editCategory, unit: editUnit } },
      { onSuccess: () => setEditing(false) }
    );
  };

  const handleDelete = () => {
    if (confirm('Delete this item? This cannot be undone.')) {
      deleteItem.mutate(item.id, { onSuccess: () => navigate('/inventory') });
    }
  };

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/inventory')} className="text-text-secondary text-sm hover:text-text-primary">
        ← Back to Inventory
      </button>

      {/* Item header */}
      <div className="bg-navy-light border border-border rounded-lg p-6">
        {editing ? (
          <div className="space-y-3">
            <input value={editName} onChange={(e) => setEditName(e.target.value)}
              className="bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary w-full focus:outline-none focus:border-accent-green" />
            <div className="flex gap-3">
              <select value={editCategory} onChange={(e) => setEditCategory(e.target.value as Category)}
                className="bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select value={editUnit} onChange={(e) => setEditUnit(e.target.value as Unit)}
                className="bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green">
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={saveEdit} className="bg-accent-green text-navy px-3 py-1.5 rounded text-sm font-medium">Save</button>
              <button onClick={() => setEditing(false)} className="text-text-secondary text-sm px-3 py-1.5">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold">{item.name}</h1>
              <div className="flex gap-4 mt-2 text-sm text-text-secondary">
                <span>{item.category}</span>
                <span>{item.current_qty} {item.unit}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={startEdit} className="text-text-secondary text-sm hover:text-text-primary px-3 py-1.5 border border-border rounded">Edit</button>
              <button onClick={handleDelete} className="text-accent-red text-sm hover:opacity-80 px-3 py-1.5 border border-border rounded">Delete</button>
            </div>
          </div>
        )}
      </div>

      {/* Log transaction */}
      <TransactionForm itemId={item.id} />

      {/* Transaction history */}
      <div>
        <h2 className="text-sm font-medium text-text-secondary mb-3">Transaction History</h2>
        {transactions.length > 0 ? (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="bg-navy-light border border-border rounded px-4 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className={tx.type === 'in' ? 'text-accent-green' : 'text-accent-red'}>
                    {tx.type === 'in' ? '+' : '-'}{tx.quantity}
                  </span>
                  <span className="text-text-secondary">{tx.reason}</span>
                  {tx.notes && <span className="text-text-secondary italic">— {tx.notes}</span>}
                </div>
                <span className="text-text-secondary text-xs">{new Date(tx.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-text-secondary text-sm">No transactions yet.</div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create TransactionForm**

`packages/client/src/components/TransactionForm.tsx`:
```tsx
import { useState } from 'react';
import { useCreateTransaction } from '../hooks/useTransactions';
import { TRANSACTION_TYPES, TRANSACTION_REASONS } from '@fifoflow/shared';
import type { TransactionType, TransactionReason } from '@fifoflow/shared';

export function TransactionForm({ itemId }: { itemId: number }) {
  const [type, setType] = useState<TransactionType>('in');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<TransactionReason>('Received');
  const [notes, setNotes] = useState('');
  const createTx = useCreateTransaction();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTx.mutate(
      { itemId, data: { type, quantity: Number(quantity), reason, notes: notes || null } },
      {
        onSuccess: () => {
          setQuantity('');
          setNotes('');
        },
      }
    );
  };

  return (
    <div className="bg-navy-light border border-border rounded-lg p-4">
      <h2 className="text-sm font-medium text-text-secondary mb-3">Log Transaction</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
        <div className="flex rounded overflow-hidden border border-border">
          {TRANSACTION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                type === t
                  ? t === 'in' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <input
          type="number"
          step="any"
          min="0.01"
          placeholder="Qty"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
          className="w-24 bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
        />
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as TransactionReason)}
          className="bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-green"
        >
          {TRANSACTION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input
          type="text"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="flex-1 min-w-32 bg-navy border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent-green"
        />
        <button
          type="submit"
          disabled={createTx.isPending}
          className="bg-accent-green text-navy px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {createTx.isPending ? 'Logging...' : 'Log'}
        </button>
      </form>
      {createTx.error && (
        <div className="text-accent-red text-xs mt-2">{createTx.error.message}</div>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add packages/client/src/
git commit -m "feat: add Item Detail page with edit, delete, and transaction logging"
```

---

### Task 13: Build client — Activity Log page

**Files:**
- Modify: `packages/client/src/pages/Activity.tsx`

**Step 1: Implement Activity Log**

`packages/client/src/pages/Activity.tsx`:
```tsx
import { useState } from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { Link } from 'react-router-dom';

export function Activity() {
  const [typeFilter, setTypeFilter] = useState<string>('');
  const { data: transactions, isLoading } = useTransactions({
    type: typeFilter || undefined,
    limit: 100,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Activity Log</h1>
        <div className="flex gap-2">
          {['', 'in', 'out'].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                typeFilter === t
                  ? 'bg-navy-lighter text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t === '' ? 'All' : t === 'in' ? 'IN' : 'OUT'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-text-secondary text-sm">Loading...</div>
      ) : transactions && transactions.length > 0 ? (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <div key={tx.id} className="bg-navy-light border border-border rounded px-4 py-3 flex items-center justify-between text-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`font-medium ${tx.type === 'in' ? 'text-accent-green' : 'text-accent-red'}`}>
                  {tx.type === 'in' ? '+' : '-'}{tx.quantity} {tx.item_unit}
                </span>
                <Link to={`/inventory/${tx.item_id}`} className="text-accent-green hover:underline">
                  {tx.item_name}
                </Link>
                <span className="text-text-secondary">{tx.reason}</span>
                {tx.notes && <span className="text-text-secondary italic">— {tx.notes}</span>}
              </div>
              <span className="text-text-secondary text-xs whitespace-nowrap ml-4">
                {new Date(tx.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-text-secondary text-sm">No transactions found.</div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/client/src/pages/Activity.tsx
git commit -m "feat: add Activity Log page with type filtering"
```

---

### Task 14: Wire up dev command and verify everything works end-to-end

**Files:**
- Modify: `package.json` (root — fix dev script)
- Verify: full stack starts and operates correctly

**Step 1: Install concurrently for root dev command**

```bash
npm install -D concurrently
```

**Step 2: Update root package.json dev script**

```json
"dev": "concurrently -n server,client -c green,blue \"npm run dev -w packages/server\" \"npm run dev -w packages/client\""
```

**Step 3: Ensure database is seeded**

```bash
npm run seed --workspace=packages/server
```

**Step 4: Run `npm run dev` from root**

Verify:
- Server starts on port 3001
- Client starts on port 5173
- `http://localhost:5173` shows Dashboard with stats
- Inventory page lists seeded items with stock badges
- Clicking an item shows detail page
- Logging a transaction updates quantity
- Activity page shows transaction feed

**Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add concurrently for single-command dev startup"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Monorepo scaffold | — |
| 2 | Shared types/schemas | — |
| 3 | Database layer | 5 tests |
| 4 | Item API routes | 8 tests |
| 5 | Transaction/dashboard/reconcile routes | 7 tests |
| 6 | Express entry point | Manual verify |
| 7 | Vite React scaffold | Manual verify |
| 8 | API client + hooks | — |
| 9 | Layout + routing | Manual verify |
| 10 | Dashboard page | Manual verify |
| 11 | Inventory list page | Manual verify |
| 12 | Item detail page | Manual verify |
| 13 | Activity log page | Manual verify |
| 14 | Dev command + E2E verify | Manual verify |
