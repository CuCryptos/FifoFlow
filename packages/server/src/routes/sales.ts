import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';
import { createSaleSchema } from '@fifoflow/shared';

export function createSalesRoutes(store: InventoryStore): Router {
  const router = Router();

  // GET /api/sales
  router.get('/', async (req, res) => {
    const { start_date, end_date, item_id } = req.query;
    const sales = await store.listSales({
      start_date: typeof start_date === 'string' ? start_date : undefined,
      end_date: typeof end_date === 'string' ? end_date : undefined,
      item_id: item_id ? Number(item_id) : undefined,
    });
    res.json(sales);
  });

  // GET /api/sales/summary
  router.get('/summary', async (req, res) => {
    const { start_date, end_date } = req.query;
    const summary = await store.getSalesSummary({
      start_date: typeof start_date === 'string' ? start_date : undefined,
      end_date: typeof end_date === 'string' ? end_date : undefined,
    });
    res.json(summary);
  });

  // POST /api/sales
  router.post('/', async (req, res) => {
    const parsed = createSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    // Find the Snack Bar storage area
    const areas = await store.listStorageAreas();
    const snackBarArea = areas.find(a => a.name === 'Snack Bar');
    if (!snackBarArea) {
      res.status(400).json({ error: 'Snack Bar storage area not found. Create it first.' });
      return;
    }

    // Check stock in snack bar area
    const itemStorage = await store.listItemStorage(parsed.data.item_id);
    const areaStock = itemStorage.find(is => is.area_id === snackBarArea.id);
    if (!areaStock || areaStock.quantity < parsed.data.quantity) {
      res.status(400).json({
        error: `Insufficient stock in Snack Bar. Available: ${areaStock?.quantity ?? 0}`,
      });
      return;
    }

    try {
      const sale = await store.createSale({
        itemId: parsed.data.item_id,
        quantity: parsed.data.quantity,
        unitQty: parsed.data.unit_qty,
        fromAreaId: snackBarArea.id,
      });
      res.status(201).json(sale);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
