import { Router } from 'express';
import type Database from 'better-sqlite3';
type ProteinUsageGroupBy = 'day' | 'week' | 'month';

interface ProteinUsageItemRecord {
  id: number;
  name: string;
  unit_label: string;
  case_unit_label: string;
  portions_per_case: number | null;
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

interface HiddenForecastProductRecord {
  id: number;
  venue_id: number;
  forecast_product_name: string;
  created_at: string;
}

interface MonthlyForecastRecord {
  id: number;
  venue_id: number;
  forecast_product_name: string;
  forecast_month: string;
  guest_count: number;
  created_at: string;
  updated_at: string;
}

interface ForecastProductAggregate {
  product_code: string | null;
  product_name: string;
  forecast_count: number;
  entry_count: number;
  total_guest_count: number;
  first_date: string;
  last_date: string;
  configured_rule_count: number;
}

function latestForecastEntriesCte(whereClause = ''): string {
  return `
    WITH ranked_forecast_entries AS (
      SELECT
        fe.id,
        fe.forecast_id,
        fe.product_code,
        fe.product_name,
        fe.forecast_date,
        fe.guest_count,
        f.created_at AS forecast_created_at,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(fe.product_code, ''), fe.product_name, fe.forecast_date
          ORDER BY f.created_at DESC, fe.forecast_id DESC, fe.id DESC
        ) AS row_rank
      FROM forecast_entries fe
      INNER JOIN forecasts f
        ON f.id = fe.forecast_id
      ${whereClause}
    ),
    latest_forecast_entries AS (
      SELECT
        id,
        forecast_id,
        product_code,
        product_name,
        forecast_date,
        guest_count,
        forecast_created_at
      FROM ranked_forecast_entries
      WHERE row_rank = 1
    )
  `;
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
    case_unit_label: string;
    portions_per_case: number | null;
    historical_usage: number;
    projected_usage: number;
    total_usage: number;
    historical_case_usage: number | null;
    projected_case_usage: number | null;
    total_case_usage: number | null;
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

function isIsoMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function monthForDate(dateText: string): string {
  return dateText.slice(0, 7);
}

function monthStartDate(monthText: string): string {
  return `${monthText}-01`;
}

function monthEndDate(monthText: string): string {
  const [yearText, monthValueText] = monthText.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthValueText) - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
  return lastDay.toISOString().slice(0, 10);
}

function listDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  while (cursor <= endDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
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

function normalizeProteinItemRows(input: unknown): Array<{
  protein_item_id: number;
  case_unit_label: string;
  portions_per_case: number | null;
}> {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      const portionsPerCase = row.portions_per_case == null || row.portions_per_case === ''
        ? null
        : Number(row.portions_per_case);
      return {
        protein_item_id: Number(row.protein_item_id),
        case_unit_label: typeof row.case_unit_label === 'string' && row.case_unit_label.trim().length > 0 ? row.case_unit_label.trim() : 'case',
        portions_per_case: portionsPerCase != null && Number.isFinite(portionsPerCase) && portionsPerCase > 0 ? portionsPerCase : null,
      };
    })
    .filter((row) => Number.isFinite(row.protein_item_id) && row.protein_item_id > 0);
}

function normalizeMonthlyForecastRows(input: unknown): Array<{
  forecast_product_name: string;
  forecast_month: string;
  guest_count: number;
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
        forecast_month: String(row.forecast_month ?? '').trim(),
        guest_count: Number(row.guest_count ?? 0),
      };
    })
    .filter((row) => row.forecast_product_name.length > 0 && isIsoMonth(row.forecast_month) && Number.isFinite(row.guest_count) && row.guest_count >= 0);
}

function listProteinItems(db: Database.Database): ProteinUsageItemRecord[] {
  return db.prepare(
    `
      SELECT id, name, unit_label, case_unit_label, portions_per_case, sort_order, active
      FROM protein_usage_items
      WHERE active = 1
      ORDER BY sort_order ASC, name ASC
    `,
  ).all() as ProteinUsageItemRecord[];
}

function saveProteinItems(
  db: Database.Database,
  rows: Array<{
    protein_item_id: number;
    case_unit_label: string;
    portions_per_case: number | null;
  }>,
): ProteinUsageItemRecord[] {
  const update = db.prepare(
    `
      UPDATE protein_usage_items
      SET case_unit_label = ?,
          portions_per_case = ?
      WHERE id = ?
    `,
  );

  const transaction = db.transaction(() => {
    for (const row of rows) {
      update.run(row.case_unit_label, row.portions_per_case, row.protein_item_id);
    }
  });

  transaction();
  return listProteinItems(db);
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

function listHiddenForecastProducts(db: Database.Database, venueId: number): HiddenForecastProductRecord[] {
  return db.prepare(
    `
      SELECT id, venue_id, forecast_product_name, created_at
      FROM protein_usage_hidden_products
      WHERE venue_id = ?
      ORDER BY forecast_product_name ASC
    `,
  ).all(venueId) as HiddenForecastProductRecord[];
}

function listMonthlyForecasts(db: Database.Database, venueId: number): MonthlyForecastRecord[] {
  return db.prepare(
    `
      SELECT mf.id, mf.venue_id, mf.forecast_product_name, mf.forecast_month, mf.guest_count, mf.created_at, mf.updated_at
      FROM protein_usage_monthly_forecasts mf
      LEFT JOIN protein_usage_hidden_products hp
        ON hp.forecast_product_name = mf.forecast_product_name
       AND hp.venue_id = mf.venue_id
      WHERE mf.venue_id = ?
        AND hp.id IS NULL
      ORDER BY mf.forecast_month ASC, mf.forecast_product_name ASC
    `,
  ).all(venueId) as MonthlyForecastRecord[];
}

function listForecastProductAggregates(db: Database.Database, venueId: number): ForecastProductAggregate[] {
  return db.prepare(
    `
      ${latestForecastEntriesCte()}
      SELECT
        lfe.product_code,
        lfe.product_name,
        COUNT(DISTINCT lfe.forecast_id) AS forecast_count,
        COUNT(*) AS entry_count,
        SUM(lfe.guest_count) AS total_guest_count,
        MIN(lfe.forecast_date) AS first_date,
        MAX(lfe.forecast_date) AS last_date,
        COUNT(DISTINCT r.id) AS configured_rule_count
      FROM latest_forecast_entries lfe
      LEFT JOIN forecast_protein_usage_rules r
        ON r.forecast_product_name = lfe.product_name
       AND r.venue_id = ?
      LEFT JOIN protein_usage_hidden_products hp
        ON hp.forecast_product_name = lfe.product_name
       AND hp.venue_id = ?
      WHERE hp.id IS NULL
      GROUP BY lfe.product_code, lfe.product_name
      ORDER BY total_guest_count DESC, lfe.product_name ASC
    `,
  ).all(venueId, venueId) as ForecastProductAggregate[];
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

function hideForecastProducts(
  db: Database.Database,
  venueId: number,
  productNames: string[],
): HiddenForecastProductRecord[] {
  const insert = db.prepare(
    `
      INSERT INTO protein_usage_hidden_products (venue_id, forecast_product_name)
      VALUES (?, ?)
      ON CONFLICT(venue_id, forecast_product_name) DO NOTHING
    `,
  );

  const removeRules = db.prepare(
    `
      DELETE FROM forecast_protein_usage_rules
      WHERE venue_id = ?
        AND forecast_product_name = ?
    `,
  );

  const transaction = db.transaction(() => {
    for (const productName of productNames) {
      insert.run(venueId, productName);
      removeRules.run(venueId, productName);
    }
  });

  transaction();
  return listHiddenForecastProducts(db, venueId);
}

function restoreForecastProducts(
  db: Database.Database,
  venueId: number,
  productNames: string[],
): HiddenForecastProductRecord[] {
  const remove = db.prepare(
    `
      DELETE FROM protein_usage_hidden_products
      WHERE venue_id = ?
        AND forecast_product_name = ?
    `,
  );

  const transaction = db.transaction(() => {
    for (const productName of productNames) {
      remove.run(venueId, productName);
    }
  });

  transaction();
  return listHiddenForecastProducts(db, venueId);
}

function saveMonthlyForecasts(
  db: Database.Database,
  venueId: number,
  rows: Array<{
    forecast_product_name: string;
    forecast_month: string;
    guest_count: number;
  }>,
): MonthlyForecastRecord[] {
  const upsert = db.prepare(
    `
      INSERT INTO protein_usage_monthly_forecasts (
        venue_id,
        forecast_product_name,
        forecast_month,
        guest_count
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(venue_id, forecast_product_name, forecast_month)
      DO UPDATE SET
        guest_count = excluded.guest_count
    `,
  );
  const remove = db.prepare(
    `
      DELETE FROM protein_usage_monthly_forecasts
      WHERE venue_id = ?
        AND forecast_product_name = ?
        AND forecast_month = ?
    `,
  );

  const transaction = db.transaction(() => {
    for (const row of rows) {
      if (row.guest_count > 0) {
        upsert.run(venueId, row.forecast_product_name, row.forecast_month, row.guest_count);
      } else {
        remove.run(venueId, row.forecast_product_name, row.forecast_month);
      }
    }
  });

  transaction();
  return listMonthlyForecasts(db, venueId);
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
      ${latestForecastEntriesCte('WHERE fe.forecast_date >= ? AND fe.forecast_date <= ?')}
      SELECT
        lfe.forecast_date,
        lfe.product_name,
        lfe.guest_count,
        r.protein_item_id,
        r.usage_per_pax
      FROM latest_forecast_entries lfe
      INNER JOIN forecast_protein_usage_rules r
        ON r.forecast_product_name = lfe.product_name
      LEFT JOIN protein_usage_hidden_products hp
        ON hp.forecast_product_name = lfe.product_name
       AND hp.venue_id = ?
      WHERE r.venue_id = ?
        AND hp.id IS NULL
      ORDER BY lfe.forecast_date ASC, lfe.product_name ASC
    `,
  ).all(input.start, input.end, input.venueId, input.venueId) as Array<{
    forecast_date: string;
    product_name: string;
    guest_count: number;
    protein_item_id: number;
    usage_per_pax: number;
  }>;

  const monthlyRows = db.prepare(
    `
      SELECT
        mf.forecast_month,
        mf.forecast_product_name,
        mf.guest_count,
        r.protein_item_id,
        r.usage_per_pax
      FROM protein_usage_monthly_forecasts mf
      INNER JOIN forecast_protein_usage_rules r
        ON r.forecast_product_name = mf.forecast_product_name
      LEFT JOIN protein_usage_hidden_products hp
        ON hp.forecast_product_name = mf.forecast_product_name
       AND hp.venue_id = mf.venue_id
      WHERE mf.venue_id = ?
        AND mf.forecast_month >= ?
        AND mf.forecast_month <= ?
        AND hp.id IS NULL
      ORDER BY mf.forecast_month ASC, mf.forecast_product_name ASC
    `,
  ).all(input.venueId, monthForDate(input.start), monthForDate(input.end)) as Array<{
    forecast_month: string;
    forecast_product_name: string;
    guest_count: number;
    protein_item_id: number;
    usage_per_pax: number;
  }>;
  const dailyCoverageKeys = new Set(rows.map((row) => `${row.product_name}::${monthForDate(row.forecast_date)}`));

  const periodMap = new Map<string, ProteinUsageSummaryRow>();
  const totalsMap = new Map<number, {
    protein_item_id: number;
    protein_name: string;
    unit_label: string;
    case_unit_label: string;
    portions_per_case: number | null;
    historical_usage: number;
    projected_usage: number;
    total_usage: number;
    historical_case_usage: number | null;
    projected_case_usage: number | null;
    total_case_usage: number | null;
  }>();
  const unmappedForecastProducts = db.prepare(
    `
      ${latestForecastEntriesCte('WHERE fe.forecast_date >= ? AND fe.forecast_date <= ?')}
      SELECT
        lfe.product_name,
        COUNT(*) AS entry_count,
        SUM(lfe.guest_count) AS total_guest_count,
        MIN(lfe.forecast_date) AS first_date,
        MAX(lfe.forecast_date) AS last_date
      FROM latest_forecast_entries lfe
      LEFT JOIN forecast_protein_usage_rules r
        ON r.forecast_product_name = lfe.product_name
       AND r.venue_id = ?
      LEFT JOIN protein_usage_hidden_products hp
        ON hp.forecast_product_name = lfe.product_name
       AND hp.venue_id = ?
      WHERE hp.id IS NULL
      GROUP BY lfe.product_name
      HAVING COUNT(r.id) = 0
      ORDER BY total_guest_count DESC, lfe.product_name ASC
    `,
  ).all(input.start, input.end, input.venueId, input.venueId) as Array<{
    product_name: string;
    entry_count: number;
    total_guest_count: number;
    first_date: string;
    last_date: string;
  }>;

  const applyUsageRow = (forecastDate: string, proteinItemId: number, guestCount: number, usagePerPax: number) => {
    const protein = proteinById.get(proteinItemId);
    if (!protein) {
      return;
    }

    const period = periodForDate(forecastDate, input.groupBy);
    const isHistorical = forecastDate < today;
    const usage = guestCount * usagePerPax;

    const periodRow = periodMap.get(period) ?? {
      period,
      historical_guest_count: 0,
      projected_guest_count: 0,
      total_guest_count: 0,
      proteins: [],
    };

    periodRow.total_guest_count += guestCount;
    if (isHistorical) {
      periodRow.historical_guest_count += guestCount;
    } else {
      periodRow.projected_guest_count += guestCount;
    }

    let periodProtein = periodRow.proteins.find((entry) => entry.protein_item_id === protein.id);
    if (!periodProtein) {
      periodProtein = {
        protein_item_id: protein.id,
        protein_name: protein.name,
        unit_label: protein.unit_label,
        case_unit_label: protein.case_unit_label,
        portions_per_case: protein.portions_per_case,
        historical_usage: 0,
        projected_usage: 0,
        total_usage: 0,
        historical_case_usage: null,
        projected_case_usage: null,
        total_case_usage: null,
      };
      periodRow.proteins.push(periodProtein);
    }

    periodProtein.total_usage += usage;
    if (isHistorical) {
      periodProtein.historical_usage += usage;
    } else {
      periodProtein.projected_usage += usage;
    }
    if (protein.portions_per_case != null && protein.portions_per_case > 0) {
      periodProtein.historical_case_usage = periodProtein.historical_usage / protein.portions_per_case;
      periodProtein.projected_case_usage = periodProtein.projected_usage / protein.portions_per_case;
      periodProtein.total_case_usage = periodProtein.total_usage / protein.portions_per_case;
    }

    const totalEntry = totalsMap.get(protein.id) ?? {
      protein_item_id: protein.id,
      protein_name: protein.name,
      unit_label: protein.unit_label,
      case_unit_label: protein.case_unit_label,
      portions_per_case: protein.portions_per_case,
      historical_usage: 0,
      projected_usage: 0,
      total_usage: 0,
      historical_case_usage: null,
      projected_case_usage: null,
      total_case_usage: null,
    };
    totalEntry.total_usage += usage;
    if (isHistorical) {
      totalEntry.historical_usage += usage;
    } else {
      totalEntry.projected_usage += usage;
    }
    if (protein.portions_per_case != null && protein.portions_per_case > 0) {
      totalEntry.historical_case_usage = totalEntry.historical_usage / protein.portions_per_case;
      totalEntry.projected_case_usage = totalEntry.projected_usage / protein.portions_per_case;
      totalEntry.total_case_usage = totalEntry.total_usage / protein.portions_per_case;
    }
    totalsMap.set(protein.id, totalEntry);
    periodMap.set(period, periodRow);
  };

  for (const row of rows) {
    applyUsageRow(row.forecast_date, row.protein_item_id, row.guest_count, row.usage_per_pax);
  }

  for (const row of monthlyRows) {
    if (dailyCoverageKeys.has(`${row.forecast_product_name}::${row.forecast_month}`)) {
      continue;
    }
    const fullMonthDates = listDatesInRange(monthStartDate(row.forecast_month), monthEndDate(row.forecast_month));
    const inWindowDates = fullMonthDates.filter((date) => date >= input.start && date <= input.end);
    if (inWindowDates.length === 0) {
      continue;
    }

    if (input.groupBy === 'month') {
      applyUsageRow(monthStartDate(row.forecast_month), row.protein_item_id, row.guest_count, row.usage_per_pax);
      continue;
    }

    const dailyGuestCount = row.guest_count / fullMonthDates.length;
    for (const date of inWindowDates) {
      applyUsageRow(date, row.protein_item_id, dailyGuestCount, row.usage_per_pax);
    }
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
      hidden_products: listHiddenForecastProducts(db, venueId),
      monthly_forecasts: listMonthlyForecasts(db, venueId),
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

  router.post('/config/items', (req, res) => {
    const rows = normalizeProteinItemRows(req.body.items);
    if (rows.length === 0) {
      res.status(400).json({ error: 'items are required' });
      return;
    }

    res.json({
      protein_items: saveProteinItems(db, rows),
    });
  });

  router.post('/hidden-products/hide', (req, res) => {
    const venueId = parseVenueId(req.body.venue_id);
    const productNames = Array.isArray(req.body.product_names)
      ? req.body.product_names.map((value: unknown) => String(value ?? '').trim()).filter((value: string) => value.length > 0)
      : [];

    if (!venueId) {
      res.status(400).json({ error: 'venue_id is required' });
      return;
    }
    if (productNames.length === 0) {
      res.status(400).json({ error: 'product_names are required' });
      return;
    }

    res.json({
      hidden_products: hideForecastProducts(db, venueId, productNames),
    });
  });

  router.post('/hidden-products/restore', (req, res) => {
    const venueId = parseVenueId(req.body.venue_id);
    const productNames = Array.isArray(req.body.product_names)
      ? req.body.product_names.map((value: unknown) => String(value ?? '').trim()).filter((value: string) => value.length > 0)
      : [];

    if (!venueId) {
      res.status(400).json({ error: 'venue_id is required' });
      return;
    }
    if (productNames.length === 0) {
      res.status(400).json({ error: 'product_names are required' });
      return;
    }

    res.json({
      hidden_products: restoreForecastProducts(db, venueId, productNames),
    });
  });

  router.post('/monthly-forecasts/bulk', (req, res) => {
    const venueId = parseVenueId(req.body.venue_id);
    const rows = normalizeMonthlyForecastRows(req.body.rows);

    if (!venueId) {
      res.status(400).json({ error: 'venue_id is required' });
      return;
    }
    if (rows.length === 0) {
      res.status(400).json({ error: 'rows are required' });
      return;
    }

    res.json({
      monthly_forecasts: saveMonthlyForecasts(db, venueId, rows),
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
