import { Router } from 'express';
import type Database from 'better-sqlite3';
import { LOW_STOCK_THRESHOLD } from '@fifoflow/shared';
import type { DashboardStats } from '@fifoflow/shared';

export function createDashboardRoutes(db: Database.Database): Router {
  const router = Router();

  router.get('/stats', (_req, res) => {
    const totalItems = db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number };
    const lowStock = db.prepare(
      'SELECT COUNT(*) as count FROM items WHERE current_qty > 0 AND current_qty <= ?'
    ).get(LOW_STOCK_THRESHOLD) as { count: number };
    const outOfStock = db.prepare(
      'SELECT COUNT(*) as count FROM items WHERE current_qty = 0'
    ).get() as { count: number };
    const todayTx = db.prepare(
      "SELECT COUNT(*) as count FROM transactions WHERE date(created_at) = date('now')"
    ).get() as { count: number };

    const stats: DashboardStats = {
      total_items: totalItems.count,
      low_stock_count: lowStock.count,
      out_of_stock_count: outOfStock.count,
      today_transaction_count: todayTx.count,
    };

    res.json(stats);
  });

  return router;
}
