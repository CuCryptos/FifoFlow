import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';

export function createRecipeRoutes(store: InventoryStore): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const recipes = await store.listRecipes();
    res.json(recipes);
  });

  router.get('/:id', async (req, res) => {
    const recipe = await store.getRecipeById(Number(req.params.id));
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    res.json(recipe);
  });

  router.delete('/:id', async (req, res) => {
    const existing = await store.getRecipeById(Number(req.params.id));
    if (!existing) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    try {
      await store.deleteRecipe(existing.id);
      res.status(204).send();
    } catch (err: any) {
      if (err.status === 409) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  return router;
}
