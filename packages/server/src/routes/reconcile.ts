import { Router } from 'express';
import type Database from 'better-sqlite3';
import type { ReconciliationResult } from '@fifoflow/shared';

export function createReconcileRoutes(db: Database.Database): Router {
  const router = Router();

  router.post('/', (_req, res) => {
    const items = db.prepare('SELECT id, name, current_qty FROM items').all() as Array<{
      id: number; name: string; current_qty: number;
    }>;

    const computeQty = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type = 'in' THEN quantity ELSE -quantity END), 0) as computed
      FROM transactions WHERE item_id = ?
    `);

    const mismatches: ReconciliationResult[] = [];
    const fix = db.prepare('UPDATE items SET current_qty = ? WHERE id = ?');

    const reconcile = db.transaction(() => {
      for (const item of items) {
        const { computed } = computeQty.get(item.id) as { computed: number };
        if (Math.abs(item.current_qty - computed) > 0.001) {
          mismatches.push({
            item_id: item.id,
            item_name: item.name,
            cached_qty: item.current_qty,
            computed_qty: computed,
            difference: item.current_qty - computed,
          });
          fix.run(computed, item.id);
        }
      }
    });

    reconcile();

    res.json({
      checked: items.length,
      mismatches_found: mismatches.length,
      mismatches,
      fixed: mismatches.length > 0,
    });
  });

  return router;
}
