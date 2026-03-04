import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';

export function createDashboardRoutes(store: InventoryStore): Router {
  const router = Router();

  router.get('/stats', async (_req, res) => {
    const stats = await store.getDashboardStats();
    res.json(stats);
  });

  return router;
}
