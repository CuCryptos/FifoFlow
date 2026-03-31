import { Router } from 'express';
import multer from 'multer';
import type Database from 'better-sqlite3';
import {
  bulkUpdateLunchMenuDaysSchema,
  createLunchMenuSchema,
  importLunchMenuSchema,
  updateLunchMenuSchema,
  type BulkUpdateLunchMenuDaysInput,
  type LunchMenu,
  type LunchMenuCalendarDay,
  type LunchMenuCalendarView,
  type LunchMenuItem,
  type LunchMenuListEntry,
  type LunchMenuStatus,
} from '@fifoflow/shared';
import { parseLunchMenuPdfBuffer } from '../lunchMenus/lunchMenuPdfParser.js';
import { renderLunchMenuPdf } from '../lunchMenus/lunchMenuPdfExport.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only PDF lunch menu files are supported'));
  },
});

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

interface LunchMenuRow {
  id: number;
  venue_id: number | null;
  year: number;
  month: number;
  name: string;
  status: LunchMenuStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface LunchMenuListRow extends LunchMenuRow {
  venue_name: string | null;
  item_count: number;
}

interface LunchMenuItemRow {
  id: number;
  menu_id: number;
  date: string;
  dish_type: 'main' | 'side';
  dish_name: string;
  recipe_id: number | null;
  sort_order: number;
  calories: number | null;
  protein_g: number | null;
  fat_g: number | null;
  sugar_g: number | null;
  created_at: string;
  updated_at: string;
}

export function createLunchMenuRoutes(db: Database.Database): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const venueId = parsePositiveInt(req.query.venue_id);
    const year = parsePositiveInt(req.query.year);
    const status = typeof req.query.status === 'string' ? req.query.status : null;

    const clauses: string[] = [];
    const params: Array<number | string> = [];

    if (venueId != null) {
      clauses.push('lm.venue_id = ?');
      params.push(venueId);
    }
    if (year != null) {
      clauses.push('lm.year = ?');
      params.push(year);
    }
    if (status && ['draft', 'published', 'archived'].includes(status)) {
      clauses.push('lm.status = ?');
      params.push(status);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`
      SELECT
        lm.id,
        lm.venue_id,
        lm.year,
        lm.month,
        lm.name,
        lm.status,
        lm.notes,
        lm.created_at,
        lm.updated_at,
        v.name AS venue_name,
        COUNT(lmi.id) AS item_count
      FROM lunch_menus lm
      LEFT JOIN venues v
        ON v.id = lm.venue_id
      LEFT JOIN lunch_menu_items lmi
        ON lmi.menu_id = lm.id
      ${where}
      GROUP BY lm.id
      ORDER BY lm.year DESC, lm.month DESC, lm.created_at DESC
    `).all(...params) as LunchMenuListRow[];

    res.json(rows.map(mapLunchMenuListRow));
  });

  router.post('/upload', upload.single('file'), async (req, res) => {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: 'No lunch menu PDF uploaded' });
      return;
    }

    try {
      const parsed = await parseLunchMenuPdfBuffer(file.buffer, file.originalname);
      res.status(201).json(parsed);
    } catch (error: any) {
      res.status(500).json({ error: error.message ?? 'Failed to parse lunch menu PDF' });
    }
  });

  router.post('/import', (req, res) => {
    const parsed = importLunchMenuSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const menu = importLunchMenuIntoDatabase(db, parsed.data);
      res.status(201).json({
        menu,
        calendar: buildCalendarView(menu),
      });
    } catch (error: any) {
      const message = error.message ?? 'Failed to import lunch menu';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  router.post('/generate', (_req, res) => {
    res.status(501).json({ error: 'Lunch menu generation is not implemented yet.' });
  });

  router.post('/', (req, res) => {
    const parsed = createLunchMenuSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const existing = db.prepare(
      'SELECT id FROM lunch_menus WHERE venue_id = ? AND year = ? AND month = ?'
    ).get(parsed.data.venue_id, parsed.data.year, parsed.data.month) as { id: number } | undefined;

    if (existing) {
      res.status(409).json({ error: 'A lunch menu already exists for this venue and month.' });
      return;
    }

    const name = parsed.data.name?.trim() || `${MONTH_NAMES[parsed.data.month - 1]} ${parsed.data.year} Lunch Menu`;
    const result = db.prepare(`
      INSERT INTO lunch_menus (venue_id, year, month, name, status, notes)
      VALUES (?, ?, ?, ?, 'draft', ?)
    `).run(
      parsed.data.venue_id,
      parsed.data.year,
      parsed.data.month,
      name,
      parsed.data.notes ?? null,
    );

    const menu = getLunchMenuById(db, Number(result.lastInsertRowid));
    res.status(201).json(menu);
  });

  router.get('/:menuId/export/pdf', async (req, res) => {
    const menuId = parseRequiredPositiveInt(req.params.menuId);
    if (menuId == null) {
      res.status(400).json({ error: 'Invalid lunch menu id' });
      return;
    }

    const menu = getLunchMenuById(db, menuId);
    if (!menu) {
      res.status(404).json({ error: 'Lunch menu not found' });
      return;
    }

    const venueName = menu.venue_id != null
      ? (db.prepare('SELECT name FROM venues WHERE id = ?').get(menu.venue_id) as { name: string } | undefined)?.name ?? null
      : null;

    try {
      const pdfBuffer = await renderLunchMenuPdf(menu, { venueName });
      const fileName = slugifyFileName(menu.name || `${MONTH_NAMES[menu.month - 1]}-${menu.year}-lunch-menu`);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      res.status(500).json({ error: error.message ?? 'Failed to export lunch menu PDF' });
    }
  });

  router.put('/:menuId/items/bulk', (req, res) => {
    const menuId = parseRequiredPositiveInt(req.params.menuId);
    if (menuId == null) {
      res.status(400).json({ error: 'Invalid lunch menu id' });
      return;
    }

    const parsed = bulkUpdateLunchMenuDaysSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const existing = getLunchMenuById(db, menuId);
    if (!existing) {
      res.status(404).json({ error: 'Lunch menu not found' });
      return;
    }

    upsertLunchMenuDays(db, menuId, parsed.data);
    const refreshed = getLunchMenuById(db, menuId);
    res.json({
      menu: refreshed,
      calendar: refreshed ? buildCalendarView(refreshed) : null,
    });
  });

  router.get('/:menuId/calendar', (req, res) => {
    const menuId = parseRequiredPositiveInt(req.params.menuId);
    if (menuId == null) {
      res.status(400).json({ error: 'Invalid lunch menu id' });
      return;
    }

    const menu = getLunchMenuById(db, menuId);
    if (!menu) {
      res.status(404).json({ error: 'Lunch menu not found' });
      return;
    }
    res.json(buildCalendarView(menu));
  });

  router.get('/:menuId', (req, res) => {
    const menuId = parseRequiredPositiveInt(req.params.menuId);
    if (menuId == null) {
      res.status(400).json({ error: 'Invalid lunch menu id' });
      return;
    }

    const menu = getLunchMenuById(db, menuId);
    if (!menu) {
      res.status(404).json({ error: 'Lunch menu not found' });
      return;
    }
    res.json(menu);
  });

  router.put('/:menuId', (req, res) => {
    const menuId = parseRequiredPositiveInt(req.params.menuId);
    if (menuId == null) {
      res.status(400).json({ error: 'Invalid lunch menu id' });
      return;
    }

    const existing = db.prepare('SELECT * FROM lunch_menus WHERE id = ?').get(menuId) as LunchMenuRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Lunch menu not found' });
      return;
    }

    const parsed = updateLunchMenuSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const next = {
      name: parsed.data.name ?? existing.name,
      status: parsed.data.status ?? existing.status,
      notes: parsed.data.notes !== undefined ? parsed.data.notes : existing.notes,
    };

    db.prepare('UPDATE lunch_menus SET name = ?, status = ?, notes = ? WHERE id = ?').run(
      next.name,
      next.status,
      next.notes ?? null,
      menuId,
    );

    res.json(getLunchMenuById(db, menuId));
  });

  router.delete('/:menuId', (req, res) => {
    const menuId = parseRequiredPositiveInt(req.params.menuId);
    if (menuId == null) {
      res.status(400).json({ error: 'Invalid lunch menu id' });
      return;
    }

    const existing = db.prepare('SELECT id FROM lunch_menus WHERE id = ?').get(menuId) as { id: number } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Lunch menu not found' });
      return;
    }
    db.prepare('DELETE FROM lunch_menus WHERE id = ?').run(menuId);
    res.status(204).send();
  });

  return router;
}

function importLunchMenuIntoDatabase(db: Database.Database, input: {
  menu_id?: number;
  venue_id: number;
  year: number;
  month: number;
  name?: string | null;
  notes?: string | null;
  replace_existing?: boolean;
  parsed_days: Array<{ date: string; main_dishes: string[]; sides: string[] }>;
}): LunchMenu {
  const transaction = db.transaction(() => {
    let menuId = input.menu_id ?? null;

    if (menuId != null) {
      const existing = db.prepare('SELECT id FROM lunch_menus WHERE id = ?').get(menuId) as { id: number } | undefined;
      if (!existing) {
        throw new Error('Lunch menu not found');
      }
      db.prepare('UPDATE lunch_menus SET name = COALESCE(?, name), notes = ?, venue_id = ?, year = ?, month = ? WHERE id = ?').run(
        input.name?.trim() || null,
        input.notes ?? null,
        input.venue_id,
        input.year,
        input.month,
        menuId,
      );
    } else {
      const existing = db.prepare(
        'SELECT id FROM lunch_menus WHERE venue_id = ? AND year = ? AND month = ?'
      ).get(input.venue_id, input.year, input.month) as { id: number } | undefined;

      if (existing) {
        menuId = existing.id;
        db.prepare('UPDATE lunch_menus SET name = COALESCE(?, name), notes = ? WHERE id = ?').run(
          input.name?.trim() || null,
          input.notes ?? null,
          menuId,
        );
      } else {
        const result = db.prepare(`
          INSERT INTO lunch_menus (venue_id, year, month, name, status, notes)
          VALUES (?, ?, ?, ?, 'draft', ?)
        `).run(
          input.venue_id,
          input.year,
          input.month,
          input.name?.trim() || `${MONTH_NAMES[input.month - 1]} ${input.year} Lunch Menu`,
          input.notes ?? null,
        );
        menuId = Number(result.lastInsertRowid);
      }
    }

    if (input.replace_existing !== false) {
      db.prepare('DELETE FROM lunch_menu_items WHERE menu_id = ?').run(menuId);
    }

    insertParsedDays(db, menuId, input.parsed_days);
    touchLunchMenu(db, menuId);
    return menuId;
  });

  const menuId = transaction();
  const menu = getLunchMenuById(db, menuId);
  if (!menu) {
    throw new Error('Lunch menu import completed but the menu could not be reloaded');
  }
  return menu;
}

function upsertLunchMenuDays(db: Database.Database, menuId: number, input: BulkUpdateLunchMenuDaysInput): void {
  const transaction = db.transaction(() => {
    for (const day of input.days) {
      db.prepare('DELETE FROM lunch_menu_items WHERE menu_id = ? AND date = ?').run(menuId, day.date);
      insertEditedDay(db, menuId, day);
    }
    touchLunchMenu(db, menuId);
  });

  transaction();
}

function insertParsedDays(
  db: Database.Database,
  menuId: number,
  days: Array<{ date: string; main_dishes: string[]; sides: string[] }>,
): void {
  const insert = db.prepare(`
    INSERT INTO lunch_menu_items (
      menu_id,
      date,
      dish_type,
      dish_name,
      recipe_id,
      sort_order,
      calories,
      protein_g,
      fat_g,
      sugar_g
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const day of days) {
    let sortOrder = 0;
    for (const main of day.main_dishes) {
      insert.run(menuId, day.date, 'main', main, null, sortOrder, null, null, null, null);
      sortOrder += 1;
    }
    for (const side of day.sides) {
      insert.run(menuId, day.date, 'side', side, null, sortOrder, null, null, null, null);
      sortOrder += 1;
    }
  }
}

function insertEditedDay(
  db: Database.Database,
  menuId: number,
  day: BulkUpdateLunchMenuDaysInput['days'][number],
): void {
  const insert = db.prepare(`
    INSERT INTO lunch_menu_items (
      menu_id,
      date,
      dish_type,
      dish_name,
      recipe_id,
      sort_order,
      calories,
      protein_g,
      fat_g,
      sugar_g
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const nutritionTargetType = day.mains.length > 0 ? 'main' : day.sides.length > 0 ? 'side' : null;
  let nutritionWritten = false;
  let sortOrder = 0;

  for (const main of day.mains) {
    const includeNutrition = nutritionTargetType === 'main' && !nutritionWritten;
    insert.run(
      menuId,
      day.date,
      'main',
      main.dish_name,
      main.recipe_id ?? null,
      sortOrder,
      includeNutrition ? day.nutrition?.calories ?? null : null,
      includeNutrition ? day.nutrition?.protein_g ?? null : null,
      includeNutrition ? day.nutrition?.fat_g ?? null : null,
      includeNutrition ? day.nutrition?.sugar_g ?? null : null,
    );
    if (includeNutrition) {
      nutritionWritten = true;
    }
    sortOrder += 1;
  }

  for (const side of day.sides) {
    const includeNutrition = nutritionTargetType === 'side' && !nutritionWritten;
    insert.run(
      menuId,
      day.date,
      'side',
      side.dish_name,
      side.recipe_id ?? null,
      sortOrder,
      includeNutrition ? day.nutrition?.calories ?? null : null,
      includeNutrition ? day.nutrition?.protein_g ?? null : null,
      includeNutrition ? day.nutrition?.fat_g ?? null : null,
      includeNutrition ? day.nutrition?.sugar_g ?? null : null,
    );
    if (includeNutrition) {
      nutritionWritten = true;
    }
    sortOrder += 1;
  }
}

function touchLunchMenu(db: Database.Database, menuId: number): void {
  db.prepare("UPDATE lunch_menus SET updated_at = datetime('now') WHERE id = ?").run(menuId);
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseRequiredPositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function slugifyFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'lunch-menu';
}

function getLunchMenuById(db: Database.Database, menuId: number): LunchMenu | null {
  if (!Number.isInteger(menuId) || menuId <= 0) {
    return null;
  }

  const menuRow = db.prepare('SELECT * FROM lunch_menus WHERE id = ?').get(menuId) as LunchMenuRow | undefined;
  if (!menuRow) {
    return null;
  }

  const itemRows = db.prepare(`
    SELECT *
    FROM lunch_menu_items
    WHERE menu_id = ?
    ORDER BY date ASC, dish_type ASC, sort_order ASC, id ASC
  `).all(menuId) as LunchMenuItemRow[];

  return {
    ...mapLunchMenuRow(menuRow),
    items: itemRows.map(mapLunchMenuItemRow),
  };
}

function mapLunchMenuRow(row: LunchMenuRow): Omit<LunchMenu, 'items'> {
  return {
    id: row.id,
    venue_id: row.venue_id,
    year: row.year,
    month: row.month,
    name: row.name,
    status: row.status,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapLunchMenuItemRow(row: LunchMenuItemRow): LunchMenuItem {
  return {
    id: row.id,
    menu_id: row.menu_id,
    date: row.date,
    dish_type: row.dish_type,
    dish_name: row.dish_name,
    recipe_id: row.recipe_id,
    sort_order: row.sort_order,
    calories: row.calories,
    protein_g: row.protein_g,
    fat_g: row.fat_g,
    sugar_g: row.sugar_g,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapLunchMenuListRow(row: LunchMenuListRow): LunchMenuListEntry {
  return {
    ...mapLunchMenuRow(row),
    venue_name: row.venue_name,
    item_count: Number(row.item_count ?? 0),
  };
}

function buildCalendarView(menu: LunchMenu): LunchMenuCalendarView {
  const itemsByDate = new Map<string, LunchMenuCalendarDay>();

  for (const item of menu.items) {
    const existing = itemsByDate.get(item.date) ?? {
      date: item.date,
      day_name: weekdayLabel(item.date),
      main_dishes: [],
      sides: [],
      nutrition: { calories: 0, protein_g: 0, fat_g: 0, sugar_g: 0 },
    };

    if (item.dish_type === 'main') {
      existing.main_dishes.push(item.dish_name);
    } else {
      existing.sides.push(item.dish_name);
    }

    if (item.calories != null) existing.nutrition!.calories += item.calories;
    if (item.protein_g != null) existing.nutrition!.protein_g += item.protein_g;
    if (item.fat_g != null) existing.nutrition!.fat_g += item.fat_g;
    if (item.sugar_g != null) existing.nutrition!.sugar_g += item.sugar_g;

    itemsByDate.set(item.date, existing);
  }

  const weeks: LunchMenuCalendarView['weeks'] = [];
  let currentWeek: LunchMenuCalendarDay[] = [];
  let weekNumber = 1;
  const daysInMonth = new Date(menu.year, menu.month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateString = `${menu.year}-${String(menu.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const weekday = new Date(`${dateString}T00:00:00`).getDay();
    if (weekday === 0 || weekday === 6) {
      continue;
    }

    if (weekday === 1 && currentWeek.length > 0) {
      weeks.push({ week_number: weekNumber, days: currentWeek });
      currentWeek = [];
      weekNumber += 1;
    }

    const existing = itemsByDate.get(dateString);
    currentWeek.push(existing ?? {
      date: dateString,
      day_name: WEEKDAY_LABELS[weekday],
      main_dishes: [],
      sides: [],
      nutrition: null,
    });
  }

  if (currentWeek.length > 0) {
    weeks.push({ week_number: weekNumber, days: currentWeek });
  }

  return {
    menu_id: menu.id,
    venue_id: menu.venue_id,
    year: menu.year,
    month: menu.month,
    month_name: MONTH_NAMES[menu.month - 1],
    weeks,
  };
}

function weekdayLabel(dateString: string): string {
  const dayIndex = new Date(`${dateString}T00:00:00`).getDay();
  return WEEKDAY_LABELS[dayIndex];
}
