import { Router } from 'express';
import { createItemSchema, setItemCountSchema, updateItemSchema, tryConvertQuantity } from '@fifoflow/shared';
import type { Item, ItemCountAdjustmentResult, ReorderSuggestion, Transaction, Unit } from '@fifoflow/shared';
import { createTransactionHandler } from './transactions.js';
import type { InventoryStore } from '../store/types.js';

export function createItemRoutes(store: InventoryStore): Router {
  const router = Router();

  router.get('/reorder-suggestions', async (_req, res) => {
    const items = await store.listItemsWithReorderLevel() as Item[];
    const suggestions: ReorderSuggestion[] = items
      .filter((item) => item.reorder_level !== null && item.current_qty <= item.reorder_level)
      .map((item) => {
        const reorderLevel = item.reorder_level as number;
        const shortageQty = Math.max(reorderLevel - item.current_qty, 0);
        const suggestedQty = item.reorder_qty && item.reorder_qty > 0
          ? item.reorder_qty
          : shortageQty;

        let estimatedOrderUnits: number | null = null;
        let estimatedTotalCost: number | null = null;
        if (item.order_unit_price !== null && suggestedQty > 0) {
          const converted = item.order_unit
            ? tryConvertQuantity(
                suggestedQty,
                item.unit,
                item.order_unit,
                {
                  baseUnit: item.unit,
                  orderUnit: item.order_unit,
                  innerUnit: item.inner_unit,
                  qtyPerUnit: item.qty_per_unit,
                  itemSizeValue: item.item_size_value,
                  itemSizeUnit: item.item_size_unit,
                },
              )
            : suggestedQty;
          if (converted !== null) {
            estimatedOrderUnits = converted;
            estimatedTotalCost = Math.round(converted * item.order_unit_price * 100) / 100;
          }
        }

        return {
          item_id: item.id,
          item_name: item.name,
          current_qty: item.current_qty,
          reorder_level: reorderLevel,
          reorder_qty: item.reorder_qty,
          shortage_qty: Math.round(shortageQty * 1000) / 1000,
          suggested_qty: Math.round(suggestedQty * 1000) / 1000,
          base_unit: item.unit as Unit,
          order_unit: item.order_unit as Unit | null,
          estimated_order_units: estimatedOrderUnits,
          order_unit_price: item.order_unit_price,
          estimated_total_cost: estimatedTotalCost,
        };
      })
      .sort((a, b) => {
        if (a.estimated_total_cost !== null && b.estimated_total_cost !== null) {
          return b.estimated_total_cost - a.estimated_total_cost;
        }
        return b.shortage_qty - a.shortage_qty;
      });

    res.json(suggestions);
  });

  // GET /api/items
  router.get('/', async (req, res) => {
    const { search, category } = req.query;
    const items = await store.listItems({
      search: typeof search === 'string' ? search : undefined,
      category: typeof category === 'string' ? category : undefined,
    });
    res.json(items);
  });

  // GET /api/items/:id
  router.get('/:id', async (req, res) => {
    const item = await store.getItemById(Number(req.params.id)) as Item | undefined;
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const transactions = await store.listTransactionsForItem(Number(req.params.id), 50) as Transaction[];

    res.json({ item, transactions });
  });

  // POST /api/items
  router.post('/', async (req, res) => {
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const item = await store.createItem(parsed.data);
    res.status(201).json(item);
  });

  // PUT /api/items/:id
  router.put('/:id', async (req, res) => {
    const existing = await store.getItemById(Number(req.params.id)) as Item | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const updates = parsed.data;
    const fields = Object.entries(updates).filter(([, v]) => v !== undefined);
    if (fields.length === 0) {
      res.json(existing);
      return;
    }

    const updated = await store.updateItem(Number(req.params.id), updates);
    res.json(updated);
  });

  // DELETE /api/items/:id
  router.delete('/:id', async (req, res) => {
    const existing = await store.getItemById(Number(req.params.id)) as Item | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const txCount = await store.countTransactionsForItem(Number(req.params.id));

    if (txCount > 0) {
      res.status(409).json({ error: 'Cannot delete item with transaction history' });
      return;
    }

    await store.deleteItem(Number(req.params.id));
    res.status(204).send();
  });

  // POST /api/items/:id/count
  router.post('/:id/count', async (req, res) => {
    const itemId = Number(req.params.id);
    const item = await store.getItemById(itemId);
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const parsed = setItemCountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const result = await store.setItemCountWithAdjustment({
      itemId,
      countedQty: parsed.data.counted_qty,
      notes: parsed.data.notes ?? null,
    }) as ItemCountAdjustmentResult;

    res.status(201).json(result);
  });

  // POST /api/items/:id/transactions
  router.post('/:id/transactions', createTransactionHandler(store));

  return router;
}
