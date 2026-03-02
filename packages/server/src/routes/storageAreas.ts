import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';
import { createStorageAreaSchema, updateStorageAreaSchema } from '@fifoflow/shared';

export function createStorageAreaRoutes(store: InventoryStore): Router {
  const router = Router();

  // GET /api/storage-areas
  router.get('/', async (_req, res) => {
    const areas = await store.listStorageAreas();
    res.json(areas);
  });

  // GET /api/storage-areas/:id
  router.get('/:id', async (req, res) => {
    const area = await store.getStorageAreaById(Number(req.params.id));
    if (!area) {
      res.status(404).json({ error: 'Storage area not found' });
      return;
    }
    res.json(area);
  });

  // POST /api/storage-areas
  router.post('/', async (req, res) => {
    const parsed = createStorageAreaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const area = await store.createStorageArea(parsed.data);
      res.status(201).json(area);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'A storage area with this name already exists' });
        return;
      }
      throw err;
    }
  });

  // PUT /api/storage-areas/:id
  router.put('/:id', async (req, res) => {
    const area = await store.getStorageAreaById(Number(req.params.id));
    if (!area) {
      res.status(404).json({ error: 'Storage area not found' });
      return;
    }
    const parsed = updateStorageAreaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const updated = await store.updateStorageArea(area.id, parsed.data);
      res.json(updated);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'A storage area with this name already exists' });
        return;
      }
      throw err;
    }
  });

  // DELETE /api/storage-areas/:id
  router.delete('/:id', async (req, res) => {
    const area = await store.getStorageAreaById(Number(req.params.id));
    if (!area) {
      res.status(404).json({ error: 'Storage area not found' });
      return;
    }
    const itemCount = await store.countItemsInArea(area.id);
    if (itemCount > 0) {
      res.status(409).json({ error: 'Cannot delete area with stock in it. Move all items first.' });
      return;
    }
    await store.deleteStorageArea(area.id);
    res.status(204).send();
  });

  return router;
}
