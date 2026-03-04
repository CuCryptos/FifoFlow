import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';

export function createDashboardRoutes(store: InventoryStore): Router {
  const router = Router();

  router.get('/stats', async (req, res) => {
    const venueId = typeof req.query.venue_id === 'string' ? Number(req.query.venue_id) : undefined;
    const stats = await store.getDashboardStats(venueId);
    res.json(stats);
  });

  return router;
}
