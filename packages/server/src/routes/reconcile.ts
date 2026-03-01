import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';

export function createReconcileRoutes(store: InventoryStore): Router {
  const router = Router();

  router.post('/', async (_req, res) => {
    res.json(await store.reconcile());
  });

  return router;
}
