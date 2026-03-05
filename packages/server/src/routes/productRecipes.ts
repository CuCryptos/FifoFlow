import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';
import {
  setProductRecipeSchema,
  calculateOrderSchema,
  tryConvertQuantity,
} from '@fifoflow/shared';
import type {
  CalculatedIngredient,
  IngredientSource,
  OrderCalculationResult,
  Unit,
} from '@fifoflow/shared';

export function createProductRecipeRoutes(store: InventoryStore): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const venueId = req.query.venue_id ? Number(req.query.venue_id) : undefined;
    const productRecipes = await store.listProductRecipes(venueId);
    res.json(productRecipes);
  });

  // IMPORTANT: /calculate must be defined before /:venueId to avoid matching "calculate" as a param
  router.post('/calculate', async (req, res) => {
    const parsed = calculateOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { guest_counts, vendor_id } = parsed.data;

    // Aggregate ingredient needs across all venues/recipes
    const ingredientMap = new Map<number, {
      item_id: number;
      recipe_unit: string;
      total_needed: number;
      sources: IngredientSource[];
    }>();

    for (const gc of guest_counts) {
      if (gc.guest_count <= 0) continue;

      const productRecipes = await store.listProductRecipes(gc.venue_id);
      for (const pr of productRecipes) {
        const recipe = await store.getRecipeById(pr.recipe_id);
        if (!recipe) continue;

        for (const ri of recipe.items) {
          const existing = ingredientMap.get(ri.item_id);
          const subtotal = ri.quantity * pr.portions_per_guest * gc.guest_count;

          if (existing) {
            existing.total_needed += subtotal;
            existing.sources.push({
              recipe_name: recipe.name,
              quantity_per_guest: ri.quantity * pr.portions_per_guest,
              guest_count: gc.guest_count,
              subtotal,
            });
          } else {
            ingredientMap.set(ri.item_id, {
              item_id: ri.item_id,
              recipe_unit: ri.unit,
              total_needed: subtotal,
              sources: [{
                recipe_name: recipe.name,
                quantity_per_guest: ri.quantity * pr.portions_per_guest,
                guest_count: gc.guest_count,
                subtotal,
              }],
            });
          }
        }
      }
    }

    // Build result with stock comparison and vendor pricing
    const ingredients: CalculatedIngredient[] = [];
    let totalEstimatedCost = 0;

    for (const [itemId, agg] of ingredientMap) {
      const item = await store.getItemById(itemId);
      if (!item) continue;

      // Try to convert current stock to the recipe unit
      const converted = tryConvertQuantity(
        item.current_qty,
        item.unit as Unit,
        agg.recipe_unit as Unit,
        {
          baseUnit: item.unit as Unit,
          orderUnit: item.order_unit,
          innerUnit: item.inner_unit,
          qtyPerUnit: item.qty_per_unit,
          itemSizeValue: item.item_size_value,
          itemSizeUnit: item.item_size_unit,
        },
      );

      const convertedStock = converted ?? item.current_qty;
      const shortage = Math.max(0, Math.round((agg.total_needed - convertedStock) * 100) / 100);

      // Look up vendor pricing
      let vendorId: number | null = null;
      let vendorName: string | null = null;
      let orderUnit: Unit | null = null;
      let orderUnitPrice: number | null = null;
      let estimatedCost: number | null = null;

      const vendorPrices = await store.listVendorPricesForItem(itemId);
      const price = vendor_id
        ? vendorPrices.find((vp) => vp.vendor_id === vendor_id)
        : vendorPrices.find((vp) => vp.is_default) ?? vendorPrices[0];

      if (price && shortage > 0) {
        vendorId = price.vendor_id;
        const vendor = await store.getVendorById(price.vendor_id);
        vendorName = vendor?.name ?? null;
        orderUnit = price.order_unit;
        orderUnitPrice = price.order_unit_price;

        // Calculate cost: convert shortage to order units
        if (price.order_unit && price.order_unit_price > 0) {
          const inOrderUnits = tryConvertQuantity(
            shortage,
            agg.recipe_unit as Unit,
            price.order_unit as Unit,
            {
              baseUnit: item.unit as Unit,
              orderUnit: item.order_unit,
              innerUnit: item.inner_unit,
              qtyPerUnit: item.qty_per_unit,
              itemSizeValue: item.item_size_value,
              itemSizeUnit: item.item_size_unit,
            },
          );
          if (inOrderUnits !== null) {
            estimatedCost = Math.round(Math.ceil(inOrderUnits) * price.order_unit_price * 100) / 100;
            totalEstimatedCost += estimatedCost;
          }
        }
      }

      ingredients.push({
        item_id: itemId,
        item_name: item.name,
        item_unit: item.unit as Unit,
        recipe_unit: agg.recipe_unit,
        total_needed: Math.round(agg.total_needed * 100) / 100,
        current_qty: item.current_qty,
        converted_stock: converted,
        shortage,
        vendor_id: vendorId,
        vendor_name: vendorName,
        order_unit: orderUnit,
        order_unit_price: orderUnitPrice,
        estimated_cost: estimatedCost,
        sources: agg.sources,
      });
    }

    const result: OrderCalculationResult = {
      ingredients: ingredients.sort((a, b) => a.item_name.localeCompare(b.item_name)),
      total_estimated_cost: Math.round(totalEstimatedCost * 100) / 100,
    };

    res.json(result);
  });

  // Parameterized routes after static routes
  router.post('/:venueId', async (req, res) => {
    const venueId = Number(req.params.venueId);
    const venue = await store.getVenueById(venueId);
    if (!venue) {
      res.status(404).json({ error: 'Venue not found' });
      return;
    }
    const parsed = setProductRecipeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const recipe = await store.getRecipeById(parsed.data.recipe_id);
    if (!recipe) {
      res.status(400).json({ error: 'Recipe not found' });
      return;
    }
    const result = await store.setProductRecipe(venueId, parsed.data);
    res.status(201).json(result);
  });

  router.delete('/:id', async (req, res) => {
    await store.deleteProductRecipe(Number(req.params.id));
    res.status(204).send();
  });

  return router;
}
