import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';
import { createVenueSchema, updateVenueSchema } from '@fifoflow/shared';

export function createVenueRoutes(store: InventoryStore): Router {
  const router = Router();

  // GET /api/venues
  router.get('/', async (_req, res) => {
    const venues = await store.listVenues();
    res.json(venues);
  });

  // GET /api/venues/:id
  router.get('/:id', async (req, res) => {
    const venue = await store.getVenueById(Number(req.params.id));
    if (!venue) {
      res.status(404).json({ error: 'Venue not found' });
      return;
    }
    res.json(venue);
  });

  // POST /api/venues
  router.post('/', async (req, res) => {
    const parsed = createVenueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const venue = await store.createVenue(parsed.data);
      res.status(201).json(venue);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'A venue with this name already exists' });
        return;
      }
      throw err;
    }
  });

  // PUT /api/venues/:id
  router.put('/:id', async (req, res) => {
    const venue = await store.getVenueById(Number(req.params.id));
    if (!venue) {
      res.status(404).json({ error: 'Venue not found' });
      return;
    }
    const parsed = updateVenueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const updated = await store.updateVenue(venue.id, parsed.data);
      res.json(updated);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'A venue with this name already exists' });
        return;
      }
      throw err;
    }
  });

  // DELETE /api/venues/:id
  router.delete('/:id', async (req, res) => {
    const venue = await store.getVenueById(Number(req.params.id));
    if (!venue) {
      res.status(404).json({ error: 'Venue not found' });
      return;
    }
    const itemCount = await store.countItemsForVenue(venue.id);
    if (itemCount > 0) {
      res.status(409).json({ error: 'Cannot delete venue with items assigned. Reassign items first.' });
      return;
    }
    await store.deleteVenue(venue.id);
    res.status(204).send();
  });

  return router;
}
