import { Router } from 'express';
import { createTransactionSchema, tryConvertQuantity } from '@fifoflow/shared';
import type { Item, TransactionWithItem, Unit } from '@fifoflow/shared';
import type { InventoryStore } from '../store/types.js';

export function createTransactionRoutes(store: InventoryStore): Router {
  const router = Router();

  // GET /api/transactions
  router.get('/', async (req, res) => {
    const { item_id, type, limit = '50', offset = '0', venue_id } = req.query;
    const venueId = typeof venue_id === 'string' ? Number(venue_id) : undefined;
    const transactions = await store.listTransactions({
      item_id: item_id ? Number(item_id) : undefined,
      type: typeof type === 'string' ? type : undefined,
      limit: Number(limit),
      offset: Number(offset),
      venueId,
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

    const { type, quantity, unit, reason, notes, from_area_id, to_area_id } = parsed.data;
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

    // Calculate estimated cost from item's unit price
    let estimatedCost: number | null = null;
    if (item.order_unit_price != null) {
      const perBaseUnitCost = item.order_unit_price / ((item.qty_per_unit != null && item.qty_per_unit > 0) ? item.qty_per_unit : 1);
      estimatedCost = Math.round(normalizedQty * perBaseUnitCost * 100) / 100;
    }

    const delta = type === 'in' ? normalizedQty : -normalizedQty;

    if (item.current_qty + delta < 0) {
      res.status(400).json({ error: 'Insufficient quantity. Cannot go below zero.' });
      return;
    }

    // Validate transfers need both areas
    if (reason === 'Transferred') {
      if (!from_area_id || !to_area_id) {
        res.status(400).json({ error: 'Transfers require both from_area_id and to_area_id' });
        return;
      }
      if (from_area_id === to_area_id) {
        res.status(400).json({ error: 'Cannot transfer to the same area' });
        return;
      }
    }

    // Validate area existence
    if (from_area_id) {
      const fromArea = await store.getStorageAreaById(from_area_id);
      if (!fromArea) {
        res.status(404).json({ error: 'Source storage area not found' });
        return;
      }
      // Check source area has sufficient quantity
      const areaStock = await store.getItemStorageByArea(item.id, from_area_id);
      const areaQty = areaStock?.quantity ?? 0;
      if (areaQty < normalizedQty) {
        res.status(400).json({ error: 'Insufficient quantity in source area' });
        return;
      }
    }
    if (to_area_id) {
      const toArea = await store.getStorageAreaById(to_area_id);
      if (!toArea) {
        res.status(404).json({ error: 'Destination storage area not found' });
        return;
      }
    }

    const result = await store.insertTransactionAndAdjustQty({
      itemId,
      type,
      quantity: normalizedQty,
      reason,
      notes: notes ?? null,
      delta,
      fromAreaId: from_area_id ?? null,
      toAreaId: to_area_id ?? null,
      estimatedCost,
    });
    res.status(201).json(result);
  };
}
