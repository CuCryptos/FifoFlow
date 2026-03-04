import { Router } from 'express';
import { createVendorPriceSchema, updateVendorPriceSchema } from '@fifoflow/shared';
import type { InventoryStore } from '../store/types.js';

export function createVendorPriceRoutes(store: InventoryStore): Router {
  const router = Router({ mergeParams: true });

  // GET /api/items/:id/vendor-prices
  router.get('/', async (req: any, res: any) => {
    const itemId = Number(req.params.id);
    const item = await store.getItemById(itemId);
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    const prices = await store.listVendorPricesForItem(itemId);
    res.json(prices);
  });

  // POST /api/items/:id/vendor-prices
  router.post('/', async (req: any, res: any) => {
    const itemId = Number(req.params.id);
    const item = await store.getItemById(itemId);
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const parsed = createVendorPriceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const vendor = await store.getVendorById(parsed.data.vendor_id);
    if (!vendor) {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }

    const price = await store.createVendorPrice(itemId, parsed.data);
    res.status(201).json(price);
  });

  // PUT /api/items/:id/vendor-prices/:priceId
  router.put('/:priceId', async (req, res) => {
    const priceId = Number(req.params.priceId);
    const existing = await store.getVendorPriceById(priceId);
    if (!existing) {
      res.status(404).json({ error: 'Vendor price not found' });
      return;
    }

    const parsed = updateVendorPriceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const updated = await store.updateVendorPrice(priceId, parsed.data);
    res.json(updated);
  });

  // DELETE /api/items/:id/vendor-prices/:priceId
  router.delete('/:priceId', async (req, res) => {
    const priceId = Number(req.params.priceId);
    const existing = await store.getVendorPriceById(priceId);
    if (!existing) {
      res.status(404).json({ error: 'Vendor price not found' });
      return;
    }

    await store.deleteVendorPrice(priceId);
    res.status(204).send();
  });

  return router;
}
