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
