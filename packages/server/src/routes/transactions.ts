import { Router } from 'express';
import { createTransactionSchema, tryConvertQuantity } from '@fifoflow/shared';
import type { Item, TransactionWithItem, Unit } from '@fifoflow/shared';
import type { InventoryStore } from '../store/types.js';

export function createTransactionRoutes(store: InventoryStore): Router {
  const router = Router();

  // GET /api/transactions
  router.get('/', async (req, res) => {
    const { item_id, type, limit = '50', offset = '0' } = req.query;
    const transactions = await store.listTransactions({
      item_id: item_id ? Number(item_id) : undefined,
      type: typeof type === 'string' ? type : undefined,
      limit: Number(limit),
      offset: Number(offset),
    }) as TransactionWithItem[];
    res.json(transactions);
  });

  return router;
}

// Handler for POST /api/items/:id/transactions (mounted on item routes)
export function createTransactionHandler(store: InventoryStore) {
  return async (req: any, res: any) => {
    const itemId = Number(req.params.id);
    const item = await store.getItemById(itemId) as Item | undefined;
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const parsed = createTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { type, quantity, unit, reason, notes } = parsed.data;
    const transactionUnit = (unit ?? item.unit) as Unit;
    const normalizedQty = tryConvertQuantity(
      quantity,
      transactionUnit,
      item.unit,
      {
        baseUnit: item.unit,
        orderUnit: item.order_unit,
        innerUnit: item.inner_unit,
        qtyPerUnit: item.qty_per_unit,
        itemSizeValue: item.item_size_value,
        itemSizeUnit: item.item_size_unit,
      },
    );

    if (normalizedQty === null) {
      res.status(400).json({
        error: `Cannot convert ${transactionUnit} to item unit ${item.unit}.`,
      });
      return;
    }

    const delta = type === 'in' ? normalizedQty : -normalizedQty;

    if (item.current_qty + delta < 0) {
      res.status(400).json({ error: 'Insufficient quantity. Cannot go below zero.' });
      return;
    }

    const result = await store.insertTransactionAndAdjustQty({
      itemId,
      type,
      quantity: normalizedQty,
      reason,
      notes: notes ?? null,
      delta,
    });
    res.status(201).json(result);
  };
}
