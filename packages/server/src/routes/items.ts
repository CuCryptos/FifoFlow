import { Router } from 'express';
import { createItemSchema, setItemCountSchema, updateItemSchema, bulkUpdateItemsSchema, bulkDeleteItemsSchema, mergeItemsSchema, replaceItemStorageSchema, tryConvertQuantity } from '@fifoflow/shared';
import type { Item, ItemCountAdjustmentResult, ItemStorage, MergeItemsResult, ReorderSuggestion, Transaction, Unit } from '@fifoflow/shared';
import { createTransactionHandler } from './transactions.js';
import { createVendorPriceRoutes } from './vendorPrices.js';
import type { InventoryStore } from '../store/types.js';

const ORDERING_MISSING_FIELDS = ['reorder_level', 'reorder_qty', 'order_unit', 'qty_per_unit', 'order_unit_price'] as const;
type OrderingMissingField = (typeof ORDERING_MISSING_FIELDS)[number];

type ItemWorkflowFlags = {
  missing_vendor: boolean;
  missing_venue: boolean;
  missing_storage_area: boolean;
  ordering_incomplete: boolean;
  needs_reorder: boolean;
  needs_attention: boolean;
};

type ItemReadModel = Item & {
  vendor_name: string | null;
  venue_name: string | null;
  storage_area_name: string | null;
  storage_location_count: number;
  storage_total_qty: number;
  storage_qty_delta: number;
  pack_summary: string | null;
  unit_cost: number | null;
  inventory_value: number | null;
  ordering_missing_fields: OrderingMissingField[];
  workflow_flags: ItemWorkflowFlags;
};

interface ItemReadModelContext {
  vendorNameById: Map<number, string>;
  venueNameById: Map<number, string>;
  storageAreaNameById: Map<number, string>;
  storageRowsByItem: Map<number, ItemStorage[]>;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildPackSummary(item: Item): string | null {
  const parts: string[] = [];

  if (item.item_size) {
    parts.push(item.item_size);
  } else if (item.item_size_value != null && item.item_size_unit) {
    parts.push(`${item.item_size_value} ${item.item_size_unit}`);
  }

  if (item.order_unit && item.qty_per_unit != null) {
    parts.push(`${item.qty_per_unit} ${item.unit} per ${item.order_unit}`);
  } else if (item.order_unit) {
    parts.push(`Order unit: ${item.order_unit}`);
  }

  return parts.length > 0 ? parts.join(' / ') : null;
}

function getOrderingMissingFields(item: Item): OrderingMissingField[] {
  const missing: OrderingMissingField[] = [];
  if (item.reorder_level == null) missing.push('reorder_level');
  if (item.reorder_qty == null) missing.push('reorder_qty');
  if (item.order_unit == null) missing.push('order_unit');
  if (item.qty_per_unit == null) missing.push('qty_per_unit');
  if (item.order_unit_price == null) missing.push('order_unit_price');
  return missing;
}

function buildItemReadModel(item: Item, context: ItemReadModelContext): ItemReadModel {
  const storageRows = context.storageRowsByItem.get(item.id) ?? [];
  const activeStorageRows = storageRows.filter((row) => row.quantity > 0);
  const storageTotalQty = activeStorageRows.reduce((sum, row) => sum + row.quantity, 0);
  const unitCost = item.order_unit_price != null && item.qty_per_unit != null && item.qty_per_unit > 0
    ? roundTo(item.order_unit_price / item.qty_per_unit, 4)
    : null;
  const orderingMissingFields = getOrderingMissingFields(item);
  const missingStorageArea = item.storage_area_id == null && activeStorageRows.length === 0;
  const workflowFlags: ItemWorkflowFlags = {
    missing_vendor: item.vendor_id == null,
    missing_venue: item.venue_id == null,
    missing_storage_area: missingStorageArea,
    ordering_incomplete: orderingMissingFields.length > 0,
    needs_reorder: item.reorder_level != null && item.current_qty <= item.reorder_level,
    needs_attention:
      item.vendor_id == null
      || item.venue_id == null
      || missingStorageArea
      || orderingMissingFields.length > 0
      || (item.reorder_level != null && item.current_qty <= item.reorder_level),
  };

  return {
    ...item,
    vendor_name: item.vendor_id == null ? null : context.vendorNameById.get(item.vendor_id) ?? null,
    venue_name: item.venue_id == null ? null : context.venueNameById.get(item.venue_id) ?? null,
    storage_area_name: item.storage_area_id == null ? null : context.storageAreaNameById.get(item.storage_area_id) ?? null,
    storage_location_count: activeStorageRows.length,
    storage_total_qty: roundTo(storageTotalQty, 3),
    storage_qty_delta: roundTo(item.current_qty - storageTotalQty, 3),
    pack_summary: buildPackSummary(item),
    unit_cost: unitCost,
    inventory_value: unitCost == null ? null : roundTo(item.current_qty * unitCost, 2),
    ordering_missing_fields: orderingMissingFields,
    workflow_flags: workflowFlags,
  };
}

async function buildItemReadModelContext(store: InventoryStore, storageRows?: ItemStorage[]): Promise<ItemReadModelContext> {
  const [vendors, venues, storageAreas] = await Promise.all([
    store.listVendors(),
    store.listVenues(),
    store.listStorageAreas(),
  ]);

  const rows = storageRows ?? await store.listAllItemStorage();
  const storageRowsByItem = new Map<number, ItemStorage[]>();
  for (const row of rows) {
    const bucket = storageRowsByItem.get(row.item_id) ?? [];
    bucket.push(row);
    storageRowsByItem.set(row.item_id, bucket);
  }

  return {
    vendorNameById: new Map(vendors.map((vendor) => [vendor.id, vendor.name])),
    venueNameById: new Map(venues.map((venue) => [venue.id, venue.name])),
    storageAreaNameById: new Map(storageAreas.map((area) => [area.id, area.name])),
    storageRowsByItem,
  };
}

async function enrichItems(store: InventoryStore, items: Item[]): Promise<ItemReadModel[]> {
  const context = await buildItemReadModelContext(store);
  return items.map((item) => buildItemReadModel(item, context));
}

async function enrichItem(store: InventoryStore, item: Item): Promise<ItemReadModel> {
  const context = await buildItemReadModelContext(store, await store.listItemStorage(item.id));
  return buildItemReadModel(item, context);
}

export function createItemRoutes(store: InventoryStore): Router {
  const router = Router();

  // POST /api/items/merge — merge multiple items into one
  router.post('/merge', async (req, res) => {
    const parsed = mergeItemsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const result = await store.mergeItems(parsed.data.target_id, parsed.data.source_ids);
      if (result.target_item) {
        result.target_item = await enrichItem(store, result.target_item);
      }
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/reorder-suggestions', async (req, res) => {
    const venueId = typeof req.query.venue_id === 'string' ? Number(req.query.venue_id) : undefined;
    const items = await store.listItemsWithReorderLevel(venueId) as Item[];
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

  // GET /api/items/storage — all item-storage rows
  router.get('/storage', async (_req, res) => {
    const rows = await store.listAllItemStorage();
    res.json(rows);
  });

  // PATCH /api/items/bulk — bulk category reassign
  router.patch('/bulk', async (req, res) => {
    const parsed = bulkUpdateItemsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const result = await store.bulkUpdateItems(parsed.data.ids, parsed.data.updates);
    res.json(result);
  });

  // DELETE /api/items/bulk — bulk delete with protection
  router.delete('/bulk', async (req, res) => {
    const parsed = bulkDeleteItemsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const result = await store.bulkDeleteItems(parsed.data.ids);
    res.json(result);
  });

  // GET /api/items
  router.get('/', async (req, res) => {
    const { search, category, venue_id } = req.query;
    const items = await store.listItems({
      search: typeof search === 'string' ? search : undefined,
      category: typeof category === 'string' ? category : undefined,
      venueId: typeof venue_id === 'string' ? Number(venue_id) : undefined,
    });
    res.json(await enrichItems(store, items));
  });

  // GET /api/items/:id
  router.get('/:id', async (req, res) => {
    const item = await store.getItemById(Number(req.params.id)) as Item | undefined;
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const transactions = await store.listTransactionsForItem(Number(req.params.id), 50) as Transaction[];

    res.json({ item: await enrichItem(store, item), transactions });
  });

  // POST /api/items
  router.post('/', async (req, res) => {
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const item = await store.createItem(parsed.data);
    res.status(201).json(await enrichItem(store, item));
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
      res.json(await enrichItem(store, existing));
      return;
    }

    const updated = await store.updateItem(Number(req.params.id), updates);
    res.json(await enrichItem(store, updated));
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

  // GET /api/items/:id/storage
  router.get('/:id/storage', async (req, res) => {
    const item = await store.getItemById(Number(req.params.id)) as Item | undefined;
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    const rows = await store.listItemStorage(Number(req.params.id));
    res.json(rows);
  });

  // PUT /api/items/:id/storage
  router.put('/:id/storage', async (req, res) => {
    const itemId = Number(req.params.id);
    const item = await store.getItemById(itemId) as Item | undefined;
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const parsed = replaceItemStorageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const rows = await store.replaceItemStorage(itemId, parsed.data.rows);
      const updatedItem = await store.getItemById(itemId) as Item;
      res.json({
        item: await enrichItem(store, updatedItem),
        rows,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
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

    res.status(201).json({
      ...result,
      item: await enrichItem(store, result.item),
    });
  });

  // POST /api/items/:id/transactions
  router.post('/:id/transactions', createTransactionHandler(store));

  // Vendor prices sub-router
  router.use('/:id/vendor-prices', createVendorPriceRoutes(store));

  return router;
}
