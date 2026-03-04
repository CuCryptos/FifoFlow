# Orders Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add vendor management and purchase order generation to FifoFlow — turn reorder suggestions into vendor-grouped order lists with print/copy export and order history tracking.

**Architecture:** Vendor table with name/notes. Items get optional vendor_id FK. Orders store snapshots of order line items (quantity, price at time of order). Order generator pulls reorder suggestions and groups by vendor. Manage Vendors modal follows the existing Manage Areas pattern. SQLite first, Supabase stubs.

**Tech Stack:** React 19, TanStack Query, Tailwind CSS v4, Express 5, Zod v4, better-sqlite3

---

### Task 1: Shared Types and Schemas

Add Vendor, Order, and OrderItem types and Zod validation schemas to the shared package.

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/schemas.ts`

**Step 1: Add types to `packages/shared/src/types.ts`**

At the end of the file, add:

```typescript
export interface Vendor {
  id: number;
  name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderStatus = 'draft' | 'sent';

export interface Order {
  id: number;
  vendor_id: number;
  status: OrderStatus;
  notes: string | null;
  total_estimated_cost: number;
  created_at: string;
  updated_at: string;
}

export interface OrderWithVendor extends Order {
  vendor_name: string;
  item_count: number;
}

export interface OrderItem {
  id: number;
  order_id: number;
  item_id: number;
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
}

export interface OrderDetail extends Order {
  vendor_name: string;
  items: OrderItem[];
}
```

**Step 2: Add schemas to `packages/shared/src/schemas.ts`**

```typescript
export const createVendorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  notes: z.string().max(500).nullable().optional(),
});

export const updateVendorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const createOrderSchema = z.object({
  vendor_id: z.number().int().positive(),
  notes: z.string().max(500).nullable().optional(),
  items: z.array(z.object({
    item_id: z.number().int().positive(),
    quantity: z.number().positive(),
    unit: z.string().min(1),
    unit_price: z.number().min(0),
  })).min(1),
});

export const updateOrderSchema = z.object({
  notes: z.string().max(500).nullable().optional(),
  items: z.array(z.object({
    item_id: z.number().int().positive(),
    quantity: z.number().positive(),
    unit: z.string().min(1),
    unit_price: z.number().min(0),
  })).min(1).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['sent'] as const),
});

export type CreateVendorInput = z.infer<typeof createVendorSchema>;
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
```

**Step 3: Build shared package**

Run: `npm run build -w packages/shared`
Expected: Success

**Step 4: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/schemas.ts
git commit -m "feat: add vendor and order types and schemas"
```

---

### Task 2: Database Schema

Add vendors, orders, order_items tables and vendor_id column on items.

**Files:**
- Modify: `packages/server/src/db.ts`

**Step 1: Add table creation SQL**

In `packages/server/src/db.ts`, inside the `db.exec(...)` block (after the `item_storage` table), add:

```sql
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

CREATE INDEX IF NOT EXISTS idx_orders_vendor_id ON orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_vendor_id ON items(vendor_id);
```

**Step 2: Add vendor_id migration to items**

In the migrations section (after the existing `addColumnIfMissing` calls), add:

```typescript
addColumnIfMissing('vendor_id', 'INTEGER REFERENCES vendors(id) ON DELETE SET NULL');
```

**Step 3: Build and verify**

Run: `npm run build -w packages/server`
Expected: Success

**Step 4: Commit**

```bash
git add packages/server/src/db.ts
git commit -m "feat: add vendors, orders, order_items tables and vendor_id migration"
```

---

### Task 3: Store Interface and SQLite Implementation for Vendors

Add vendor CRUD methods to the InventoryStore interface and implement in SQLite store.

**Files:**
- Modify: `packages/server/src/store/types.ts`
- Modify: `packages/server/src/store/sqliteStore.ts`
- Modify: `packages/server/src/store/supabaseStore.ts`

**Step 1: Add vendor methods to InventoryStore interface**

In `packages/server/src/store/types.ts`, import `Vendor` and `CreateVendorInput`, `UpdateVendorInput` from `@fifoflow/shared`. Add to the interface:

```typescript
// Vendors
listVendors(): Promise<Vendor[]>;
getVendorById(id: number): Promise<Vendor | undefined>;
createVendor(input: CreateVendorInput): Promise<Vendor>;
updateVendor(id: number, input: UpdateVendorInput): Promise<Vendor>;
deleteVendor(id: number): Promise<void>;
countItemsForVendor(vendorId: number): Promise<number>;
```

**Step 2: Implement in SqliteInventoryStore**

In `packages/server/src/store/sqliteStore.ts`, add:

```typescript
async listVendors(): Promise<Vendor[]> {
  return this.db.prepare('SELECT * FROM vendors ORDER BY name ASC').all() as Vendor[];
}

async getVendorById(id: number): Promise<Vendor | undefined> {
  return this.db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as Vendor | undefined;
}

async createVendor(input: CreateVendorInput): Promise<Vendor> {
  const result = this.db.prepare(
    'INSERT INTO vendors (name, notes) VALUES (?, ?)'
  ).run(input.name, input.notes ?? null);
  return this.db.prepare('SELECT * FROM vendors WHERE id = ?').get(result.lastInsertRowid) as Vendor;
}

async updateVendor(id: number, input: UpdateVendorInput): Promise<Vendor> {
  const fields = Object.entries(input).filter(([, v]) => v !== undefined);
  if (fields.length === 0) return (await this.getVendorById(id)) as Vendor;
  const setClauses = fields.map(([key]) => `${key} = ?`).join(', ');
  const values = fields.map(([, v]) => v);
  this.db.prepare(`UPDATE vendors SET ${setClauses} WHERE id = ?`).run(...values, id);
  return this.db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as Vendor;
}

async deleteVendor(id: number): Promise<void> {
  this.db.prepare('DELETE FROM vendors WHERE id = ?').run(id);
}

async countItemsForVendor(vendorId: number): Promise<number> {
  const row = this.db.prepare(
    'SELECT COUNT(*) as count FROM items WHERE vendor_id = ?'
  ).get(vendorId) as { count: number };
  return row.count;
}
```

Import `Vendor`, `CreateVendorInput`, `UpdateVendorInput` from `@fifoflow/shared`.

**Step 3: Add Supabase stubs**

In `packages/server/src/store/supabaseStore.ts`, add:

```typescript
async listVendors(): Promise<Vendor[]> { return []; }
async getVendorById(_id: number): Promise<Vendor | undefined> { return undefined; }
async createVendor(_input: CreateVendorInput): Promise<Vendor> { return this.notImplemented('createVendor'); }
async updateVendor(_id: number, _input: UpdateVendorInput): Promise<Vendor> { return this.notImplemented('updateVendor'); }
async deleteVendor(_id: number): Promise<void> { return this.notImplemented('deleteVendor'); }
async countItemsForVendor(_vendorId: number): Promise<number> { return 0; }
```

Import `Vendor`, `CreateVendorInput`, `UpdateVendorInput` from `@fifoflow/shared`.

**Step 4: Build and run tests**

```bash
npm run build -w packages/shared && cd packages/server && npx tsc --noEmit
npm test --workspace=packages/server
```

**Step 5: Commit**

```bash
git add packages/server/src/store/types.ts packages/server/src/store/sqliteStore.ts packages/server/src/store/supabaseStore.ts
git commit -m "feat: add vendor store interface and SQLite implementation"
```

---

### Task 4: Store Interface and SQLite Implementation for Orders

Add order CRUD methods to the InventoryStore interface and implement in SQLite store.

**Files:**
- Modify: `packages/server/src/store/types.ts`
- Modify: `packages/server/src/store/sqliteStore.ts`
- Modify: `packages/server/src/store/supabaseStore.ts`

**Step 1: Add order methods to InventoryStore interface**

Import `Order`, `OrderWithVendor`, `OrderDetail`, `OrderItem`, `CreateOrderInput`, `UpdateOrderInput` from `@fifoflow/shared`. Add to the interface:

```typescript
// Orders
listOrders(): Promise<OrderWithVendor[]>;
getOrderById(id: number): Promise<OrderDetail | undefined>;
createOrder(input: CreateOrderInput): Promise<OrderDetail>;
updateOrder(id: number, input: UpdateOrderInput): Promise<OrderDetail>;
updateOrderStatus(id: number, status: 'sent'): Promise<Order>;
deleteOrder(id: number): Promise<void>;
```

**Step 2: Implement in SqliteInventoryStore**

```typescript
async listOrders(): Promise<OrderWithVendor[]> {
  return this.db.prepare(`
    SELECT o.*, v.name as vendor_name,
      (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
    FROM orders o
    JOIN vendors v ON o.vendor_id = v.id
    ORDER BY o.created_at DESC
  `).all() as OrderWithVendor[];
}

async getOrderById(id: number): Promise<OrderDetail | undefined> {
  const order = this.db.prepare(`
    SELECT o.*, v.name as vendor_name
    FROM orders o
    JOIN vendors v ON o.vendor_id = v.id
    WHERE o.id = ?
  `).get(id) as (Order & { vendor_name: string }) | undefined;
  if (!order) return undefined;

  const items = this.db.prepare(`
    SELECT oi.*, i.name as item_name
    FROM order_items oi
    JOIN items i ON oi.item_id = i.id
    WHERE oi.order_id = ?
  `).all(id) as OrderItem[];

  return { ...order, items };
}

async createOrder(input: CreateOrderInput): Promise<OrderDetail> {
  const totalCost = input.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const result = this.db.prepare(
    'INSERT INTO orders (vendor_id, notes, total_estimated_cost) VALUES (?, ?, ?)'
  ).run(input.vendor_id, input.notes ?? null, Math.round(totalCost * 100) / 100);

  const orderId = Number(result.lastInsertRowid);
  const insertItem = this.db.prepare(
    'INSERT INTO order_items (order_id, item_id, quantity, unit, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)'
  );

  for (const item of input.items) {
    const lineTotal = Math.round(item.quantity * item.unit_price * 100) / 100;
    insertItem.run(orderId, item.item_id, item.quantity, item.unit, item.unit_price, lineTotal);
  }

  return (await this.getOrderById(orderId))!;
}

async updateOrder(id: number, input: UpdateOrderInput): Promise<OrderDetail> {
  if (input.notes !== undefined) {
    this.db.prepare('UPDATE orders SET notes = ? WHERE id = ?').run(input.notes, id);
  }
  if (input.items) {
    this.db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
    const insertItem = this.db.prepare(
      'INSERT INTO order_items (order_id, item_id, quantity, unit, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)'
    );
    let totalCost = 0;
    for (const item of input.items) {
      const lineTotal = Math.round(item.quantity * item.unit_price * 100) / 100;
      insertItem.run(id, item.item_id, item.quantity, item.unit, item.unit_price, lineTotal);
      totalCost += lineTotal;
    }
    this.db.prepare('UPDATE orders SET total_estimated_cost = ? WHERE id = ?').run(
      Math.round(totalCost * 100) / 100, id
    );
  }
  return (await this.getOrderById(id))!;
}

async updateOrderStatus(id: number, status: 'sent'): Promise<Order> {
  this.db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
  return this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Order;
}

async deleteOrder(id: number): Promise<void> {
  this.db.prepare('DELETE FROM orders WHERE id = ?').run(id);
}
```

Import all needed types from `@fifoflow/shared`.

**Step 3: Add Supabase stubs**

```typescript
async listOrders(): Promise<OrderWithVendor[]> { return []; }
async getOrderById(_id: number): Promise<OrderDetail | undefined> { return undefined; }
async createOrder(_input: CreateOrderInput): Promise<OrderDetail> { return this.notImplemented('createOrder'); }
async updateOrder(_id: number, _input: UpdateOrderInput): Promise<OrderDetail> { return this.notImplemented('updateOrder'); }
async updateOrderStatus(_id: number, _status: 'sent'): Promise<Order> { return this.notImplemented('updateOrderStatus'); }
async deleteOrder(_id: number): Promise<void> { return this.notImplemented('deleteOrder'); }
```

Import `Order`, `OrderWithVendor`, `OrderDetail`, `CreateOrderInput`, `UpdateOrderInput` from `@fifoflow/shared`.

**Step 4: Build and run tests**

```bash
npm run build -w packages/shared && cd packages/server && npx tsc --noEmit
npm test --workspace=packages/server
```

**Step 5: Commit**

```bash
git add packages/server/src/store/types.ts packages/server/src/store/sqliteStore.ts packages/server/src/store/supabaseStore.ts
git commit -m "feat: add order store interface and SQLite implementation"
```

---

### Task 5: Server Routes for Vendors

Add Express routes for vendor CRUD.

**Files:**
- Create: `packages/server/src/routes/vendors.ts`
- Modify: `packages/server/src/index.ts`

**Step 1: Create vendor routes**

Create `packages/server/src/routes/vendors.ts`:

```typescript
import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';
import { createVendorSchema, updateVendorSchema } from '@fifoflow/shared';

export function createVendorRoutes(store: InventoryStore): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const vendors = await store.listVendors();
    res.json(vendors);
  });

  router.get('/:id', async (req, res) => {
    const vendor = await store.getVendorById(Number(req.params.id));
    if (!vendor) {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }
    res.json(vendor);
  });

  router.post('/', async (req, res) => {
    const parsed = createVendorSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const vendor = await store.createVendor(parsed.data);
      res.status(201).json(vendor);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'A vendor with this name already exists' });
        return;
      }
      throw err;
    }
  });

  router.put('/:id', async (req, res) => {
    const vendor = await store.getVendorById(Number(req.params.id));
    if (!vendor) {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }
    const parsed = updateVendorSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const updated = await store.updateVendor(vendor.id, parsed.data);
      res.json(updated);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'A vendor with this name already exists' });
        return;
      }
      throw err;
    }
  });

  router.delete('/:id', async (req, res) => {
    const vendor = await store.getVendorById(Number(req.params.id));
    if (!vendor) {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }
    const itemCount = await store.countItemsForVendor(vendor.id);
    if (itemCount > 0) {
      res.status(409).json({ error: 'Cannot delete vendor with assigned items. Reassign items first.' });
      return;
    }
    await store.deleteVendor(vendor.id);
    res.status(204).send();
  });

  return router;
}
```

**Step 2: Register route in `packages/server/src/index.ts`**

Add import and route registration:

```typescript
import { createVendorRoutes } from './routes/vendors.js';
// ...
app.use('/api/vendors', createVendorRoutes(store));
```

**Step 3: Add vendor_id to updateItemSchema**

In `packages/shared/src/schemas.ts`, add to `updateItemSchema`:

```typescript
vendor_id: z.number().int().positive().nullable().optional(),
```

Also add to `createItemSchema`:

```typescript
vendor_id: z.number().int().positive().nullable().optional(),
```

**Step 4: Build and run tests**

```bash
npm run build -w packages/shared && npm run build -w packages/server
npm test --workspace=packages/server
```

**Step 5: Commit**

```bash
git add packages/server/src/routes/vendors.ts packages/server/src/index.ts packages/shared/src/schemas.ts
git commit -m "feat: add vendor CRUD routes"
```

---

### Task 6: Server Routes for Orders

Add Express routes for order CRUD.

**Files:**
- Create: `packages/server/src/routes/orders.ts`
- Modify: `packages/server/src/index.ts`

**Step 1: Create order routes**

Create `packages/server/src/routes/orders.ts`:

```typescript
import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';
import { createOrderSchema, updateOrderSchema, updateOrderStatusSchema } from '@fifoflow/shared';

export function createOrderRoutes(store: InventoryStore): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const orders = await store.listOrders();
    res.json(orders);
  });

  router.get('/:id', async (req, res) => {
    const order = await store.getOrderById(Number(req.params.id));
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(order);
  });

  router.post('/', async (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const vendor = await store.getVendorById(parsed.data.vendor_id);
    if (!vendor) {
      res.status(400).json({ error: 'Vendor not found' });
      return;
    }
    const order = await store.createOrder(parsed.data);
    res.status(201).json(order);
  });

  router.put('/:id', async (req, res) => {
    const order = await store.getOrderById(Number(req.params.id));
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    if (order.status === 'sent') {
      res.status(409).json({ error: 'Cannot edit a sent order' });
      return;
    }
    const parsed = updateOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const updated = await store.updateOrder(order.id, parsed.data);
    res.json(updated);
  });

  router.patch('/:id/status', async (req, res) => {
    const order = await store.getOrderById(Number(req.params.id));
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    const parsed = updateOrderStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const updated = await store.updateOrderStatus(order.id, parsed.data.status);
    res.json(updated);
  });

  router.delete('/:id', async (req, res) => {
    const order = await store.getOrderById(Number(req.params.id));
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    if (order.status === 'sent') {
      res.status(409).json({ error: 'Cannot delete a sent order' });
      return;
    }
    await store.deleteOrder(order.id);
    res.status(204).send();
  });

  return router;
}
```

**Step 2: Register in `packages/server/src/index.ts`**

```typescript
import { createOrderRoutes } from './routes/orders.js';
// ...
app.use('/api/orders', createOrderRoutes(store));
```

**Step 3: Build and run tests**

```bash
npm run build -w packages/shared && npm run build -w packages/server
npm test --workspace=packages/server
```

**Step 4: Commit**

```bash
git add packages/server/src/routes/orders.ts packages/server/src/index.ts
git commit -m "feat: add order CRUD routes"
```

---

### Task 7: Client API and Hooks for Vendors

Add vendor API methods and TanStack Query hooks.

**Files:**
- Modify: `packages/client/src/api.ts`
- Create: `packages/client/src/hooks/useVendors.ts`

**Step 1: Add vendor API methods**

In `packages/client/src/api.ts`, import `Vendor`, `CreateVendorInput`, `UpdateVendorInput` from `@fifoflow/shared`. Add a `vendors` section to the `api` object:

```typescript
vendors: {
  list: () => fetchJson<Vendor[]>('/vendors'),
  get: (id: number) => fetchJson<Vendor>(`/vendors/${id}`),
  create: (data: CreateVendorInput) =>
    fetchJson<Vendor>('/vendors', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: UpdateVendorInput) =>
    fetchJson<Vendor>(`/vendors/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    fetchJson<void>(`/vendors/${id}`, { method: 'DELETE' }),
},
```

**Step 2: Create vendor hooks**

Create `packages/client/src/hooks/useVendors.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateVendorInput, UpdateVendorInput } from '@fifoflow/shared';

export function useVendors() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: () => api.vendors.list(),
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateVendorInput) => api.vendors.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); },
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateVendorInput }) =>
      api.vendors.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); },
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.vendors.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); },
  });
}
```

**Step 3: Verify compilation**

Run: `cd packages/client && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add packages/client/src/api.ts packages/client/src/hooks/useVendors.ts
git commit -m "feat: add client API and hooks for vendors"
```

---

### Task 8: Client API and Hooks for Orders

Add order API methods and TanStack Query hooks.

**Files:**
- Modify: `packages/client/src/api.ts`
- Create: `packages/client/src/hooks/useOrders.ts`

**Step 1: Add order API methods**

In `packages/client/src/api.ts`, import `OrderWithVendor`, `OrderDetail`, `Order`, `CreateOrderInput`, `UpdateOrderInput` from `@fifoflow/shared`. Add to the `api` object:

```typescript
orders: {
  list: () => fetchJson<OrderWithVendor[]>('/orders'),
  get: (id: number) => fetchJson<OrderDetail>(`/orders/${id}`),
  create: (data: CreateOrderInput) =>
    fetchJson<OrderDetail>('/orders', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: UpdateOrderInput) =>
    fetchJson<OrderDetail>(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateStatus: (id: number, status: 'sent') =>
    fetchJson<Order>(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  delete: (id: number) =>
    fetchJson<void>(`/orders/${id}`, { method: 'DELETE' }),
},
```

**Step 2: Create order hooks**

Create `packages/client/src/hooks/useOrders.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CreateOrderInput, UpdateOrderInput } from '@fifoflow/shared';

export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: () => api.orders.list(),
  });
}

export function useOrder(id: number) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => api.orders.get(id),
    enabled: id > 0,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateOrderInput) => api.orders.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); },
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateOrderInput }) =>
      api.orders.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); },
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'sent' }) =>
      api.orders.updateStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); },
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.orders.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); },
  });
}
```

**Step 3: Verify compilation**

Run: `cd packages/client && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add packages/client/src/api.ts packages/client/src/hooks/useOrders.ts
git commit -m "feat: add client API and hooks for orders"
```

---

### Task 9: Manage Vendors Modal and Vendor Column in Inventory

Add the Manage Vendors modal (same pattern as Manage Areas) and a vendor dropdown column in the Inventory table.

**Files:**
- Create: `packages/client/src/components/ManageVendorsModal.tsx`
- Modify: `packages/client/src/pages/Inventory.tsx`

**Step 1: Create ManageVendorsModal**

Create `packages/client/src/components/ManageVendorsModal.tsx`. Follow the exact same pattern as `ManageAreasModal.tsx` but for vendors:

- List vendors with inline edit for name
- Add a notes field (textarea or text input)
- Delete button disabled if vendor has assigned items (use a `countItemsForVendor`-like check — on the client, we can check if any loaded items have that vendor_id)
- Add new vendor at bottom

```typescript
import { useState, useEffect, useRef } from 'react';
import { useVendors, useCreateVendor, useUpdateVendor, useDeleteVendor } from '../hooks/useVendors';
import { useItems } from '../hooks/useItems';
import { X } from 'lucide-react';

export function ManageVendorsModal({ onClose }: { onClose: () => void }) {
  const { data: vendors } = useVendors();
  const { data: items } = useItems();
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const deleteVendor = useDeleteVendor();

  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Build set of vendor IDs that have items assigned
  const vendorsWithItems = new Set(
    (items ?? []).filter((i) => i.vendor_id != null).map((i) => i.vendor_id!),
  );

  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createVendor.mutate({ name: trimmed, notes: newNotes.trim() || null }, {
      onSuccess: () => { setNewName(''); setNewNotes(''); },
    });
  };

  const handleEditStart = (id: number, name: string, notes: string | null) => {
    setEditingId(id);
    setEditingName(name);
    setEditingNotes(notes ?? '');
  };

  const handleEditSave = () => {
    if (editingId === null) return;
    const vendor = (vendors ?? []).find((v) => v.id === editingId);
    const trimmedName = editingName.trim();
    const trimmedNotes = editingNotes.trim() || null;
    if (!trimmedName || (trimmedName === vendor?.name && trimmedNotes === vendor?.notes)) {
      setEditingId(null);
      return;
    }
    updateVendor.mutate(
      { id: editingId, data: { name: trimmedName, notes: trimmedNotes } },
      { onSuccess: () => setEditingId(null) },
    );
  };

  const handleDelete = (id: number) => {
    if (!window.confirm('Are you sure you want to delete this vendor?')) return;
    deleteVendor.mutate(id);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-bg-card rounded-2xl shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-text-primary">Manage Vendors</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
          {(vendors ?? []).map((vendor) => {
            const hasItems = vendorsWithItems.has(vendor.id);
            const isEditing = editingId === vendor.id;

            return (
              <div key={vendor.id} className="bg-white border border-border rounded-lg px-4 py-3">
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave();
                        if (e.key === 'Escape') { e.stopPropagation(); setEditingId(null); }
                      }}
                      className="w-full bg-white border border-accent-indigo rounded-lg px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
                      placeholder="Vendor name"
                    />
                    <input
                      type="text"
                      value={editingNotes}
                      onChange={(e) => setEditingNotes(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave();
                        if (e.key === 'Escape') { e.stopPropagation(); setEditingId(null); }
                      }}
                      className="w-full bg-white border border-border rounded-lg px-2 py-1 text-sm text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
                      placeholder="Notes (phone, email, etc.)"
                    />
                    <div className="flex justify-end">
                      <button onClick={handleEditSave} className="text-accent-indigo text-xs px-2 py-1">Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-text-primary truncate block">{vendor.name}</span>
                      {vendor.notes && (
                        <span className="text-xs text-text-muted truncate block">{vendor.notes}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleEditStart(vendor.id, vendor.name, vendor.notes)}
                        className="text-text-secondary hover:text-text-primary text-xs px-2 py-1 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(vendor.id)}
                        disabled={hasItems || deleteVendor.isPending}
                        className="text-accent-red hover:bg-badge-red-bg text-xs px-2 py-1 disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded"
                        title={hasItems ? 'Cannot delete vendor with assigned items.' : 'Delete vendor'}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {(vendors ?? []).length === 0 && (
            <div className="text-text-secondary text-sm">No vendors yet.</div>
          )}
        </div>

        {createVendor.error && <div className="text-accent-red text-xs mb-2">{createVendor.error.message}</div>}
        {deleteVendor.error && <div className="text-accent-red text-xs mb-2">{deleteVendor.error.message}</div>}

        <div className="space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="New vendor name..."
            className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="Notes (optional)..."
              className="flex-1 bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-secondary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-indigo/20 focus:border-accent-indigo"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || createVendor.isPending}
              className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-50 transition-colors"
            >
              {createVendor.isPending ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Add vendor dropdown column to Inventory table**

In `packages/client/src/pages/Inventory.tsx`:

- Import `useVendors` from `../hooks/useVendors`
- Import `ManageVendorsModal` from `../components/ManageVendorsModal`
- Add `const { data: vendors } = useVendors();` (may already have a vendors query — check)
- Add `const [showVendorsModal, setShowVendorsModal] = useState(false);`
- In the header buttons area, add a "Manage Vendors" button next to "Manage Areas"
- Add a "Vendor" column in the Stock group (after Category). In the group header row, increase Stock colSpan from 6 to 7. Update `colSpanTotal` to add 1.
- Add a `<th>` for "Vendor" in the column header row (not sortable for now — just plain th)
- In each data row, add a vendor select `<td>` after the Category `<td>`:

```tsx
<td className="px-3 py-2">
  <select
    value={item.vendor_id ?? ''}
    onChange={(e) => {
      const val = e.target.value ? Number(e.target.value) : null;
      updateItem.mutate({ id: item.id, data: { vendor_id: val } });
    }}
    className="bg-white border border-transparent hover:border-border focus:border-accent-indigo rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none cursor-pointer"
  >
    <option value="">—</option>
    {(vendors ?? []).map((v) => (
      <option key={v.id} value={v.id}>{v.name}</option>
    ))}
  </select>
</td>
```

- Render `ManageVendorsModal` when `showVendorsModal` is true

Note: The `Item` type needs `vendor_id` — it was already added to the shared types in Task 1. Make sure the Item interface in `types.ts` includes `vendor_id: number | null`.

**Step 3: Update Item type to include vendor_id**

In `packages/shared/src/types.ts`, add to the `Item` interface:

```typescript
vendor_id: number | null;
```

**Step 4: Verify compilation**

```bash
npm run build -w packages/shared && cd packages/client && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add packages/client/src/components/ManageVendorsModal.tsx packages/client/src/pages/Inventory.tsx packages/shared/src/types.ts
git commit -m "feat: add manage vendors modal and vendor column in inventory"
```

---

### Task 10: Nav Update and Orders Page Shell

Add Orders to sidebar nav and create the Orders page with Generate/History tabs.

**Files:**
- Modify: `packages/client/src/components/Layout.tsx`
- Create: `packages/client/src/pages/Orders.tsx`
- Modify: `packages/client/src/App.tsx`

**Step 1: Add Orders to sidebar nav**

In `packages/client/src/components/Layout.tsx`, import `ShoppingCart` from `lucide-react`. Add to the `navItems` array (between Inventory and Counts):

```typescript
{ to: '/orders', label: 'Orders', icon: ShoppingCart },
```

**Step 2: Create Orders page shell**

Create `packages/client/src/pages/Orders.tsx`:

```tsx
import { useState } from 'react';
import { useReorderSuggestions } from '../hooks/useItems';
import { useVendors } from '../hooks/useVendors';
import { useOrders } from '../hooks/useOrders';
import { ManageVendorsModal } from '../components/ManageVendorsModal';

type OrderTab = 'generate' | 'history';

export function Orders() {
  const [activeTab, setActiveTab] = useState<OrderTab>('generate');
  const [showVendorsModal, setShowVendorsModal] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">Orders</h1>
        <button
          onClick={() => setShowVendorsModal(true)}
          className="bg-bg-card border border-border-emphasis text-text-secondary px-4 py-2 rounded-lg text-sm font-medium hover:bg-bg-hover transition-colors"
        >
          Manage Vendors
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg-card rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('generate')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'generate'
              ? 'bg-accent-indigo text-white'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Generate Orders
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-accent-indigo text-white'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Order History
        </button>
      </div>

      {activeTab === 'generate' && <OrderGenerator />}
      {activeTab === 'history' && <OrderHistory />}

      {showVendorsModal && (
        <ManageVendorsModal onClose={() => setShowVendorsModal(false)} />
      )}
    </div>
  );
}

function OrderGenerator() {
  return <div className="text-text-secondary text-sm">Order generator coming soon...</div>;
}

function OrderHistory() {
  return <div className="text-text-secondary text-sm">Order history coming soon...</div>;
}
```

**Step 3: Add route in App.tsx**

In `packages/client/src/App.tsx`, import `Orders` and add route:

```tsx
import { Orders } from './pages/Orders';
// ...
<Route path="/orders" element={<Orders />} />
```

**Step 4: Verify compilation**

```bash
cd packages/client && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add packages/client/src/components/Layout.tsx packages/client/src/pages/Orders.tsx packages/client/src/App.tsx
git commit -m "feat: add orders page shell with tabs and nav link"
```

---

### Task 11: Order Generator Tab

Implement the Order Generator — pull reorder suggestions, group by vendor, editable quantities, create order or print/copy.

**Files:**
- Modify: `packages/client/src/pages/Orders.tsx`

**Step 1: Implement OrderGenerator component**

Replace the placeholder `OrderGenerator` function with:

```tsx
function OrderGenerator() {
  const { data: suggestions, isLoading } = useReorderSuggestions();
  const { data: items } = useItems();
  const { data: vendors } = useVendors();
  const createOrder = useCreateOrder();
  const { toast } = useToast();
  const [quantities, setQuantities] = useState<Record<number, string>>({});

  // Build item → vendor lookup
  const itemVendorMap = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const item of items ?? []) {
      map.set(item.id, item.vendor_id);
    }
    return map;
  }, [items]);

  // Build vendor lookup
  const vendorMap = useMemo(() => {
    const map = new Map<number, Vendor>();
    for (const v of vendors ?? []) map.set(v.id, v);
    return map;
  }, [vendors]);

  // Group suggestions by vendor
  const groupedByVendor = useMemo(() => {
    const groups = new Map<number | null, ReorderSuggestion[]>();
    for (const s of suggestions ?? []) {
      const vendorId = itemVendorMap.get(s.item_id) ?? null;
      const arr = groups.get(vendorId) ?? [];
      arr.push(s);
      groups.set(vendorId, arr);
    }
    // Sort: named vendors first (alphabetical), unassigned last
    const entries = Array.from(groups.entries());
    entries.sort((a, b) => {
      if (a[0] === null) return 1;
      if (b[0] === null) return -1;
      const nameA = vendorMap.get(a[0])?.name ?? '';
      const nameB = vendorMap.get(b[0])?.name ?? '';
      return nameA.localeCompare(nameB);
    });
    return entries;
  }, [suggestions, itemVendorMap, vendorMap]);

  const getQty = (itemId: number, defaultQty: number) => {
    const custom = quantities[itemId];
    if (custom !== undefined) return Number(custom) || 0;
    return defaultQty;
  };

  const handleCreateOrder = (vendorId: number, vendorSuggestions: ReorderSuggestion[]) => {
    const orderItems = vendorSuggestions.map((s) => ({
      item_id: s.item_id,
      quantity: getQty(s.item_id, s.estimated_order_units ?? s.suggested_qty),
      unit: s.order_unit ?? s.base_unit,
      unit_price: s.order_unit_price ?? 0,
    }));
    createOrder.mutate(
      { vendor_id: vendorId, items: orderItems },
      {
        onSuccess: () => toast('Order created as draft', 'success'),
        onError: (err) => toast(`Failed to create order: ${err.message}`, 'error'),
      },
    );
  };

  const handleCopyToClipboard = (vendorName: string, vendorSuggestions: ReorderSuggestion[]) => {
    const lines = [`Order for ${vendorName}`, `Date: ${new Date().toLocaleDateString()}`, ''];
    for (const s of vendorSuggestions) {
      const qty = getQty(s.item_id, s.estimated_order_units ?? s.suggested_qty);
      const unit = s.order_unit ?? s.base_unit;
      const price = s.order_unit_price != null ? ` @ $${s.order_unit_price.toFixed(2)}/${unit}` : '';
      lines.push(`${s.item_name}: ${qty} ${unit}${price}`);
    }
    const total = vendorSuggestions.reduce((sum, s) => {
      const qty = getQty(s.item_id, s.estimated_order_units ?? s.suggested_qty);
      return sum + qty * (s.order_unit_price ?? 0);
    }, 0);
    lines.push('', `Estimated Total: $${total.toFixed(2)}`);
    navigator.clipboard.writeText(lines.join('\n'));
    toast('Order copied to clipboard', 'success');
  };

  if (isLoading) return <div className="text-text-secondary text-sm">Loading...</div>;
  if (!suggestions?.length) return <div className="text-text-secondary text-sm">No items need reordering.</div>;

  return (
    <div className="space-y-4">
      {groupedByVendor.map(([vendorId, vendorSuggestions]) => {
        const vendorName = vendorId != null ? vendorMap.get(vendorId)?.name ?? 'Unknown' : 'Unassigned';
        const groupTotal = vendorSuggestions.reduce((sum, s) => {
          const qty = getQty(s.item_id, s.estimated_order_units ?? s.suggested_qty);
          return sum + qty * (s.order_unit_price ?? 0);
        }, 0);

        return (
          <div key={vendorId ?? 'unassigned'} className="bg-bg-card rounded-xl shadow-sm">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary">{vendorName}</h3>
              <span className="text-sm text-text-secondary font-mono">
                Est. ${groupTotal.toFixed(2)}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-table-header text-text-secondary text-left">
                  <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide">Item</th>
                  <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Current</th>
                  <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Order Qty</th>
                  <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide">Unit</th>
                  <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Unit Price</th>
                  <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {vendorSuggestions.map((s) => {
                  const qty = getQty(s.item_id, s.estimated_order_units ?? s.suggested_qty);
                  const unit = s.order_unit ?? s.base_unit;
                  const lineTotal = qty * (s.order_unit_price ?? 0);
                  return (
                    <tr key={s.item_id} className="border-b border-border hover:bg-bg-hover">
                      <td className="px-4 py-2 text-text-primary">{s.item_name}</td>
                      <td className="px-4 py-2 text-right font-mono text-text-secondary">
                        {s.current_qty} {s.base_unit}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={quantities[s.item_id] ?? (s.estimated_order_units ?? s.suggested_qty)}
                          onChange={(e) => setQuantities((prev) => ({ ...prev, [s.item_id]: e.target.value }))}
                          className="w-20 bg-white border border-border rounded-lg px-2 py-1 text-xs text-right text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
                        />
                      </td>
                      <td className="px-4 py-2 text-text-secondary">{unit}</td>
                      <td className="px-4 py-2 text-right font-mono text-text-secondary">
                        {s.order_unit_price != null ? `$${s.order_unit_price.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-text-primary">
                        {s.order_unit_price != null ? `$${lineTotal.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
              <button
                onClick={() => handleCopyToClipboard(vendorName, vendorSuggestions)}
                className="border border-border text-text-secondary px-3 py-1.5 rounded-lg text-sm hover:bg-bg-hover transition-colors"
              >
                Copy
              </button>
              {vendorId != null && (
                <button
                  onClick={() => handleCreateOrder(vendorId, vendorSuggestions)}
                  disabled={createOrder.isPending}
                  className="bg-accent-indigo text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
                >
                  Create Order
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

Make sure to add the needed imports at the top of Orders.tsx:

```typescript
import { useState, useMemo } from 'react';
import { useItems, useReorderSuggestions } from '../hooks/useItems';
import { useVendors } from '../hooks/useVendors';
import { useOrders, useCreateOrder } from '../hooks/useOrders';
import { useToast } from '../contexts/ToastContext';
import type { Vendor, ReorderSuggestion } from '@fifoflow/shared';
```

**Step 2: Verify compilation**

```bash
cd packages/client && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add packages/client/src/pages/Orders.tsx
git commit -m "feat: implement order generator with vendor grouping"
```

---

### Task 12: Order History Tab and Order Detail

Implement Order History table and order detail view with print/copy.

**Files:**
- Modify: `packages/client/src/pages/Orders.tsx`

**Step 1: Implement OrderHistory component**

Replace the placeholder `OrderHistory` function with:

```tsx
function OrderHistory() {
  const { data: orders, isLoading } = useOrders();
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  if (isLoading) return <div className="text-text-secondary text-sm">Loading...</div>;
  if (!orders?.length) return <div className="text-text-secondary text-sm">No orders yet.</div>;

  if (selectedOrderId) {
    return <OrderDetailView orderId={selectedOrderId} onBack={() => setSelectedOrderId(null)} />;
  }

  return (
    <div className="bg-bg-card rounded-xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-bg-table-header text-text-secondary text-left">
            <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide">Date</th>
            <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide">Vendor</th>
            <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Items</th>
            <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Est. Cost</th>
            <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr
              key={order.id}
              onClick={() => setSelectedOrderId(order.id)}
              className="border-b border-border hover:bg-bg-hover cursor-pointer transition-colors"
            >
              <td className="px-4 py-2 text-text-primary">
                {new Date(order.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-2 text-text-primary">{order.vendor_name}</td>
              <td className="px-4 py-2 text-right font-mono text-text-secondary">{order.item_count}</td>
              <td className="px-4 py-2 text-right font-mono text-text-primary">
                ${order.total_estimated_cost.toFixed(2)}
              </td>
              <td className="px-4 py-2">
                <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                  order.status === 'sent'
                    ? 'bg-badge-green-bg text-badge-green-text'
                    : 'bg-badge-amber-bg text-badge-amber-text'
                }`}>
                  {order.status === 'sent' ? 'Sent' : 'Draft'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 2: Add OrderDetailView component**

```tsx
function OrderDetailView({ orderId, onBack }: { orderId: number; onBack: () => void }) {
  const { data: order, isLoading } = useOrder(orderId);
  const updateStatus = useUpdateOrderStatus();
  const deleteOrder = useDeleteOrder();
  const { toast } = useToast();

  if (isLoading) return <div className="text-text-secondary text-sm">Loading...</div>;
  if (!order) return <div className="text-accent-red text-sm">Order not found.</div>;

  const handleMarkSent = () => {
    updateStatus.mutate(
      { id: order.id, status: 'sent' },
      { onSuccess: () => toast('Order marked as sent', 'success') },
    );
  };

  const handleDelete = () => {
    if (!window.confirm('Delete this draft order?')) return;
    deleteOrder.mutate(order.id, {
      onSuccess: () => { toast('Order deleted', 'success'); onBack(); },
      onError: (err) => toast(`Failed: ${err.message}`, 'error'),
    });
  };

  const handleCopy = () => {
    const lines = [
      `Order for ${order.vendor_name}`,
      `Date: ${new Date(order.created_at).toLocaleDateString()}`,
      `Status: ${order.status}`,
      '',
    ];
    for (const item of order.items) {
      const price = item.unit_price > 0 ? ` @ $${item.unit_price.toFixed(2)}/${item.unit}` : '';
      lines.push(`${item.item_name}: ${item.quantity} ${item.unit}${price}`);
    }
    lines.push('', `Estimated Total: $${order.total_estimated_cost.toFixed(2)}`);
    navigator.clipboard.writeText(lines.join('\n'));
    toast('Order copied to clipboard', 'success');
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-accent-indigo text-sm hover:underline">
        &larr; Back to Order History
      </button>

      <div className="bg-bg-card rounded-xl shadow-sm">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-text-primary">{order.vendor_name}</h3>
            <span className="text-xs text-text-muted">
              {new Date(order.created_at).toLocaleDateString()} &middot;{' '}
              <span className={order.status === 'sent' ? 'text-badge-green-text' : 'text-badge-amber-text'}>
                {order.status === 'sent' ? 'Sent' : 'Draft'}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="border border-border text-text-secondary px-3 py-1.5 rounded-lg text-sm hover:bg-bg-hover transition-colors"
            >
              Copy
            </button>
            <button
              onClick={() => window.print()}
              className="border border-border text-text-secondary px-3 py-1.5 rounded-lg text-sm hover:bg-bg-hover transition-colors"
            >
              Print
            </button>
            {order.status === 'draft' && (
              <>
                <button
                  onClick={handleMarkSent}
                  disabled={updateStatus.isPending}
                  className="bg-accent-indigo text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
                >
                  Mark Sent
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteOrder.isPending}
                  className="bg-accent-red/10 text-accent-red border border-accent-red/30 px-3 py-1.5 rounded-lg text-sm hover:bg-accent-red/20 transition-colors"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-table-header text-text-secondary text-left">
              <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide">Item</th>
              <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Qty</th>
              <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide">Unit</th>
              <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Unit Price</th>
              <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-border">
                <td className="px-4 py-2 text-text-primary">{item.item_name}</td>
                <td className="px-4 py-2 text-right font-mono">{item.quantity}</td>
                <td className="px-4 py-2 text-text-secondary">{item.unit}</td>
                <td className="px-4 py-2 text-right font-mono text-text-secondary">
                  ${item.unit_price.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-text-primary">
                  ${item.line_total.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-bg-page">
              <td colSpan={4} className="px-4 py-3 text-sm text-text-secondary text-right font-medium">
                Estimated Total
              </td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-text-primary">
                ${order.total_estimated_cost.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>

        {order.notes && (
          <div className="px-4 py-3 border-t border-border text-sm text-text-secondary">
            <span className="font-medium">Notes:</span> {order.notes}
          </div>
        )}
      </div>
    </div>
  );
}
```

Add needed imports:

```typescript
import { useOrders, useOrder, useCreateOrder, useUpdateOrderStatus, useDeleteOrder } from '../hooks/useOrders';
```

**Step 3: Add print styles**

In `packages/client/src/index.css`, add a print media query to hide nav/sidebar:

```css
@media print {
  aside, nav, .no-print { display: none !important; }
  main { margin-left: 0 !important; padding-top: 0 !important; }
}
```

**Step 4: Run full build**

```bash
npm run build
```

**Step 5: Run server tests**

```bash
npm test --workspace=packages/server
```

**Step 6: Commit**

```bash
git add packages/client/src/pages/Orders.tsx packages/client/src/index.css
git commit -m "feat: add order history tab with detail view, print, and copy"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Shared types and schemas | `types.ts`, `schemas.ts` |
| 2 | Database schema | `db.ts` |
| 3 | Store interface + SQLite for vendors | `types.ts`, `sqliteStore.ts`, `supabaseStore.ts` |
| 4 | Store interface + SQLite for orders | `types.ts`, `sqliteStore.ts`, `supabaseStore.ts` |
| 5 | Server routes for vendors | `vendors.ts`, `index.ts`, `schemas.ts` |
| 6 | Server routes for orders | `orders.ts`, `index.ts` |
| 7 | Client API + hooks for vendors | `api.ts`, `useVendors.ts` |
| 8 | Client API + hooks for orders | `api.ts`, `useOrders.ts` |
| 9 | Manage Vendors modal + vendor column | `ManageVendorsModal.tsx`, `Inventory.tsx`, `types.ts` |
| 10 | Nav update + Orders page shell | `Layout.tsx`, `Orders.tsx`, `App.tsx` |
| 11 | Order Generator tab | `Orders.tsx` |
| 12 | Order History tab + detail view | `Orders.tsx`, `index.css` |

Tasks 1-6 are backend (sequential). Tasks 7-8 are client infrastructure. Tasks 9-12 are frontend (sequential, each builds on the previous).
