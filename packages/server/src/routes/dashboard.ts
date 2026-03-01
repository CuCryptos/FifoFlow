import { Router } from 'express';
import { LOW_STOCK_THRESHOLD } from '@fifoflow/shared';
import type { InventoryStore } from '../store/types.js';

export function createDashboardRoutes(store: InventoryStore): Router {
  const router = Router();

  router.get('/stats', async (_req, res) => {
    const stats = await store.getDashboardStats(LOW_STOCK_THRESHOLD);
    res.json(stats);
  });

  return router;
}
