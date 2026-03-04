import express from 'express';
import cors from 'cors';
import { getDb } from './db.js';
import { createItemRoutes } from './routes/items.js';
import { createTransactionRoutes } from './routes/transactions.js';
import { createDashboardRoutes } from './routes/dashboard.js';
import { createReconcileRoutes } from './routes/reconcile.js';
import { createCountSessionRoutes } from './routes/countSessions.js';
import { createStorageAreaRoutes } from './routes/storageAreas.js';
import { createVendorRoutes } from './routes/vendors.js';
import { createOrderRoutes } from './routes/orders.js';
import { createReportRoutes } from './routes/reports.js';
import { createSqliteInventoryStore } from './store/sqliteStore.js';
import { createSupabaseInventoryStoreFromEnv } from './store/supabaseStore.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const storeDriver = (process.env.INVENTORY_STORE_DRIVER ?? 'sqlite').toLowerCase();
const store = storeDriver === 'supabase'
  ? createSupabaseInventoryStoreFromEnv()
  : createSqliteInventoryStore(getDb());

app.use('/api/items', createItemRoutes(store));
app.use('/api/transactions', createTransactionRoutes(store));
app.use('/api/dashboard', createDashboardRoutes(store));
app.use('/api/reconcile', createReconcileRoutes(store));
app.use('/api/count-sessions', createCountSessionRoutes(store));
app.use('/api/storage-areas', createStorageAreaRoutes(store));
app.use('/api/vendors', createVendorRoutes(store));
app.use('/api/orders', createOrderRoutes(store));
app.use('/api/reports', createReportRoutes(store));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', store: storeDriver });
});

// In production, serve the Vite-built client
if (process.env.NODE_ENV === 'production') {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('{*path}', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err?.status === 'number' ? err.status : 500;
  const message = typeof err?.message === 'string' ? err.message : 'Internal Server Error';
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`FifoFlow server running on http://localhost:${PORT} (store=${storeDriver})`);
});
