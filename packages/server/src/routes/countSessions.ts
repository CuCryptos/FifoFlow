import { Router } from 'express';
import {
  closeCountSessionSchema,
  createCountSessionSchema,
  recordCountEntrySchema,
} from '@fifoflow/shared';
import type { InventoryStore } from '../store/types.js';

export function createCountSessionRoutes(store: InventoryStore): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const sessions = await store.listCountSessions();
    res.json(sessions);
  });

  router.get('/open', async (_req, res) => {
    const open = await store.getOpenCountSession();
    res.json(open ?? null);
  });

  router.post('/', async (req, res) => {
    const parsed = createCountSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const created = await store.createCountSession(parsed.data);
    res.status(201).json(created);
  });

  router.get('/:id/entries', async (req, res) => {
    const sessionId = Number(req.params.id);
    const entries = await store.listCountEntries(sessionId);
    res.json(entries);
  });

  router.get('/:id/checklist', async (req, res) => {
    const sessionId = Number(req.params.id);
    const checklist = await store.listCountChecklist(sessionId);
    res.json(checklist);
  });

  router.post('/:id/entries', async (req, res) => {
    const sessionId = Number(req.params.id);
    const parsed = recordCountEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const entry = await store.recordCountEntry(sessionId, {
      itemId: parsed.data.item_id,
      countedQty: parsed.data.counted_qty,
      notes: parsed.data.notes ?? null,
    });
    res.status(201).json(entry);
  });

  router.post('/:id/close', async (req, res) => {
    const sessionId = Number(req.params.id);
    const parsed = closeCountSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const closed = await store.closeCountSession(sessionId, parsed.data);
    res.json(closed);
  });

  return router;
}
