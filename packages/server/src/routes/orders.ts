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
