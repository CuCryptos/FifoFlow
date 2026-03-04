import { Router } from 'express';
import type { InventoryStore } from '../store/types.js';

export function createReportRoutes(store: InventoryStore): Router {
  const router = Router();

  function defaultStart(): string {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }

  function defaultEnd(): string {
    return new Date().toISOString().slice(0, 10);
  }

  router.get('/usage', async (req, res) => {
    const start = (req.query.start as string) || defaultStart();
    const end = (req.query.end as string) || defaultEnd();
    const groupBy = (req.query.group_by as string) || 'day';
    const report = await store.getUsageReport({ start, end, groupBy });
    res.json(report);
  });

  router.get('/waste', async (req, res) => {
    const start = (req.query.start as string) || defaultStart();
    const end = (req.query.end as string) || defaultEnd();
    const report = await store.getWasteReport({ start, end });
    res.json(report);
  });

  router.get('/cost', async (req, res) => {
    const start = (req.query.start as string) || defaultStart();
    const end = (req.query.end as string) || defaultEnd();
    const groupBy = (req.query.group_by as string) || 'category';
    const report = await store.getCostReport({ start, end, groupBy });
    res.json(report);
  });

  return router;
}
