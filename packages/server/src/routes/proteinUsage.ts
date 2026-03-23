import { Router } from 'express';
import type Database from 'better-sqlite3';
type ProteinUsageGroupBy = 'day' | 'week' | 'month';

interface ProteinUsageItemRecord {
  id: number;
  name: string;
  unit_label: string;
  sort_order: number;
  active: number;
}

interface ProteinUsageRuleRecord {
  id: number;
  venue_id: number;
  forecast_product_name: string;
  protein_item_id: number;
  usage_per_pax: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ForecastProductAggregate {
  product_name: string;
  forecast_count: number;
  entry_count: number;
  total_guest_count: number;
  first_date: string;
  last_date: string;
  configured_rule_count: number;
}

interface ProteinUsageSummaryRow {
  period: string;
  historical_guest_count: number;
  projected_guest_count: number;
  total_guest_count: number;
  proteins: Array<{
    protein_item_id: number;
    protein_name: string;
    unit_label: string;
    historical_usage: number;
    projected_usage: number;
    total_usage: number;
  }>;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function startOfWeek(dateText: string): string {
  const date = new Date(`${dateText}T00:00:00Z`);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function periodForDate(dateText: string, groupBy: ProteinUsageGroupBy): string {
  if (groupBy === 'day') {
    return dateText;
  }
  if (groupBy === 'month') {
    return dateText.slice(0, 7);
  }
  return startOfWeek(dateText);
}

function parseVenueId(value: unknown): number | null {
  const venueId = Number(value);
  return Number.isFinite(venueId) && venueId > 0 ? venueId : null;
}

function normalizeRuleRows(input: unknown): Array<{
  forecast_product_name: string;
  protein_item_id: number;
  usage_per_pax: number;
  notes: string | null;
}> {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        forecast_product_name: String(row.forecast_product_name ?? '').trim(),
        protein_item_id: Number(row.protein_item_id),
        usage_per_pax: Number(row.usage_per_pax),
        notes: typeof row.notes === 'string' && row.notes.trim().length > 0 ? row.notes.trim() : null,
      };
    })
    .filter((row) => row.forecast_product_name.length > 0 && Number.isFinite(row.protein_item_id) && row.protein_item_id > 0 && Number.isFinite(row.usage_per_pax));
}

function listProteinItems(db: Database.Database): ProteinUsageItemRecord[] {
  return db.prepare(
    `
      SELECT id, name, unit_label, sort_order, active
      FROM protein_usage_items
      WHERE active = 1
      ORDER BY sort_order ASC, name ASC
    `,
  ).all() as ProteinUsageItemRecord[];
}

function listProteinRules(db: Database.Database, venueId: number): ProteinUsageRuleRecord[] {
  return db.prepare(
    `
      SELECT id, venue_id, forecast_product_name, protein_item_id, usage_per_pax, notes, created_at, updated_at
      FROM forecast_protein_usage_rules
      WHERE venue_id = ?
      ORDER BY forecast_product_name ASC, protein_item_id ASC
    `,
  ).all(venueId) as ProteinUsageRuleRecord[];
}

function listForecastProductAggregates(db: Database.Database, venueId: number): ForecastProductAggregate[] {
  return db.prepare(
    `
      SELECT
        fe.product_name,
        COUNT(DISTINCT fe.forecast_id) AS forecast_count,
        COUNT(*) AS entry_count,
        SUM(fe.guest_count) AS total_guest_count,
        MIN(fe.forecast_date) AS first_date,
        MAX(fe.forecast_date) AS last_date,
        COUNT(DISTINCT r.id) AS configured_rule_count
      FROM forecast_entries fe
      LEFT JOIN forecast_protein_usage_rules r
        ON r.forecast_product_name = fe.product_name
       AND r.venue_id = ?
      GROUP BY fe.product_name
      ORDER BY total_guest_count DESC, fe.product_name ASC
    `,
  ).all(venueId) as ForecastProductAggregate[];
}

function saveProteinRules(
  db: Database.Database,
  venueId: number,
  rules: Array<{
    forecast_product_name: string;
    protein_item_id: number;
    usage_per_pax: number;
    notes: string | null;
  }>,
): ProteinUsageRuleRecord[] {
  const upsert = db.prepare(
    `
      INSERT INTO forecast_protein_usage_rules (
        venue_id,
        forecast_product_name,
        protein_item_id,
        usage_per_pax,
        notes
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(venue_id, forecast_product_name, protein_item_id)
      DO UPDATE SET
        usage_per_pax = excluded.usage_per_pax,
        notes = excluded.notes
    `,
  );
  const remove = db.prepare(
    `
      DELETE FROM forecast_protein_usage_rules
      WHERE venue_id = ?
        AND forecast_product_name = ?
        AND protein_item_id = ?
    `,
  );

  const transaction = db.transaction(() => {
    for (const rule of rules) {
      if (rule.usage_per_pax > 0) {
        upsert.run(venueId, rule.forecast_product_name, rule.protein_item_id, rule.usage_per_pax, rule.notes);
      } else {
        remove.run(venueId, rule.forecast_product_name, rule.protein_item_id);
      }
    }
  });

  transaction();
  return listProteinRules(db, venueId);
}

function buildProteinUsageSummary(
  db: Database.Database,
  input: {
    venueId: number;
    start: string;
    end: string;
    groupBy: ProteinUsageGroupBy;
  },
) {
  const proteinItems = listProteinItems(db);
  const proteinById = new Map(proteinItems.map((item) => [item.id, item]));
  const today = new Date().toISOString().slice(0, 10);

  const rows = db.prepare(
    `
      SELECT
        fe.forecast_date,
        fe.product_name,
        fe.guest_count,
        r.protein_item_id,
        r.usage_per_pax
      FROM forecast_entries fe
      INNER JOIN forecast_protein_usage_rules r
        ON r.forecast_product_name = fe.product_name
      WHERE r.venue_id = ?
        AND fe.forecast_date >= ?
        AND fe.forecast_date <= ?
      ORDER BY fe.forecast_date ASC, fe.product_name ASC
    `,
  ).all(input.venueId, input.start, input.end) as Array<{
    forecast_date: string;
    product_name: string;
    guest_count: number;
    protein_item_id: number;
    usage_per_pax: number;
  }>;

  const periodMap = new Map<string, ProteinUsageSummaryRow>();
  const totalsMap = new Map<number, {
    protein_item_id: number;
    protein_name: string;
    unit_label: string;
    historical_usage: number;
    projected_usage: number;
    total_usage: number;
  }>();
  const unmappedForecastProducts = db.prepare(
    `
      SELECT
        fe.product_name,
        COUNT(*) AS entry_count,
        SUM(fe.guest_count) AS total_guest_count,
        MIN(fe.forecast_date) AS first_date,
        MAX(fe.forecast_date) AS last_date
      FROM forecast_entries fe
      LEFT JOIN forecast_protein_usage_rules r
        ON r.forecast_product_name = fe.product_name
       AND r.venue_id = ?
      WHERE fe.forecast_date >= ?
        AND fe.forecast_date <= ?
      GROUP BY fe.product_name
      HAVING COUNT(r.id) = 0
      ORDER BY total_guest_count DESC, fe.product_name ASC
    `,
  ).all(input.venueId, input.start, input.end) as Array<{
    product_name: string;
    entry_count: number;
    total_guest_count: number;
    first_date: string;
    last_date: string;
  }>;

  for (const row of rows) {
    const protein = proteinById.get(row.protein_item_id);
    if (!protein) {
      continue;
    }

    const period = periodForDate(row.forecast_date, input.groupBy);
    const isHistorical = row.forecast_date < today;
    const usage = row.guest_count * row.usage_per_pax;

    const periodRow = periodMap.get(period) ?? {
      period,
      historical_guest_count: 0,
      projected_guest_count: 0,
      total_guest_count: 0,
      proteins: [],
    };

    periodRow.total_guest_count += row.guest_count;
    if (isHistorical) {
      periodRow.historical_guest_count += row.guest_count;
    } else {
      periodRow.projected_guest_count += row.guest_count;
    }

    let periodProtein = periodRow.proteins.find((entry) => entry.protein_item_id === protein.id);
    if (!periodProtein) {
      periodProtein = {
        protein_item_id: protein.id,
        protein_name: protein.name,
        unit_label: protein.unit_label,
        historical_usage: 0,
        projected_usage: 0,
        total_usage: 0,
      };
      periodRow.proteins.push(periodProtein);
    }

    periodProtein.total_usage += usage;
    if (isHistorical) {
      periodProtein.historical_usage += usage;
    } else {
      periodProtein.projected_usage += usage;
    }

    const totalEntry = totalsMap.get(protein.id) ?? {
      protein_item_id: protein.id,
      protein_name: protein.name,
      unit_label: protein.unit_label,
      historical_usage: 0,
      projected_usage: 0,
      total_usage: 0,
    };
    totalEntry.total_usage += usage;
    if (isHistorical) {
      totalEntry.historical_usage += usage;
    } else {
      totalEntry.projected_usage += usage;
    }
    totalsMap.set(protein.id, totalEntry);
    periodMap.set(period, periodRow);
  }

  return {
    filters: {
      venue_id: input.venueId,
      start: input.start,
      end: input.end,
      group_by: input.groupBy,
      today,
    },
    proteins: proteinItems,
    totals: Array.from(totalsMap.values()).sort((left, right) => left.protein_name.localeCompare(right.protein_name, undefined, { sensitivity: 'base' })),
    periods: Array.from(periodMap.values())
      .sort((left, right) => left.period.localeCompare(right.period))
      .map((row) => ({
        ...row,
        proteins: row.proteins.sort((left, right) => left.protein_name.localeCompare(right.protein_name, undefined, { sensitivity: 'base' })),
      })),
    unmapped_forecast_products: unmappedForecastProducts,
  };
}

export function createProteinUsageRoutes(db: Database.Database): Router {
  const router = Router();

  router.get('/config', (req, res) => {
    const venueId = parseVenueId(req.query.venue_id);
    if (!venueId) {
      res.status(400).json({ error: 'venue_id is required' });
      return;
    }

    res.json({
      protein_items: listProteinItems(db),
      rule_rows: listProteinRules(db, venueId),
      forecast_products: listForecastProductAggregates(db, venueId),
    });
  });

  router.post('/rules/bulk', (req, res) => {
    const venueId = parseVenueId(req.body.venue_id);
    if (!venueId) {
      res.status(400).json({ error: 'venue_id is required' });
      return;
    }

    const rules = normalizeRuleRows(req.body.rules);
    if (rules.length === 0) {
      res.status(400).json({ error: 'rules are required' });
      return;
    }

    res.json({
      rule_rows: saveProteinRules(db, venueId, rules),
    });
  });

  router.get('/summary', (req, res) => {
    const venueId = parseVenueId(req.query.venue_id);
    const start = typeof req.query.start === 'string' ? req.query.start : '';
    const end = typeof req.query.end === 'string' ? req.query.end : '';
    const groupBy = req.query.group_by === 'week' || req.query.group_by === 'month' ? req.query.group_by : 'day';

    if (!venueId) {
      res.status(400).json({ error: 'venue_id is required' });
      return;
    }
    if (!isIsoDate(start) || !isIsoDate(end)) {
      res.status(400).json({ error: 'start and end must be YYYY-MM-DD' });
      return;
    }

    res.json(buildProteinUsageSummary(db, { venueId, start, end, groupBy }));
  });

  return router;
}
