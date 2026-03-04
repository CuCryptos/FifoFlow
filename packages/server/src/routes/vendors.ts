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
