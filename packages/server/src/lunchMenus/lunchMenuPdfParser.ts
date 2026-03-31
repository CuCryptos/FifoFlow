import { extractPdfEvidence } from '../routes/invoiceDocumentExtraction.js';
import type { LunchMenuParseResult, LunchMenuParsedDay } from '@fifoflow/shared';

const MONTH_LOOKUP = new Map<string, number>([
  ['january', 1], ['jan', 1],
  ['february', 2], ['feb', 2],
  ['march', 3], ['mar', 3],
  ['april', 4], ['apr', 4],
  ['may', 5],
  ['june', 6], ['jun', 6],
  ['july', 7], ['jul', 7],
  ['august', 8], ['aug', 8],
  ['september', 9], ['sep', 9], ['sept', 9],
  ['october', 10], ['oct', 10],
  ['november', 11], ['nov', 11],
  ['december', 12], ['dec', 12],
]);

const WEEKDAY_TOKENS = [
  { tokens: ['MONDAY', 'MON'] },
  { tokens: ['TUESDAY', 'TUE', 'TUES'] },
  { tokens: ['WEDNESDAY', 'WED'] },
  { tokens: ['THURSDAY', 'THU', 'THURS'] },
  { tokens: ['FRIDAY', 'FRI'] },
] as const;

const MAIN_DISH_KEYWORDS = [
  'chicken', 'pork', 'beef', 'fish', 'shrimp', 'tofu', 'katsu', 'curry', 'stew', 'roast',
  'bbq', 'adobo', 'teriyaki', 'taco', 'quesadilla', 'pasta', 'lasagna', 'meatloaf', 'chili',
  'sausage', 'ham', 'turkey', 'salmon', 'ahi', 'mahimahi', 'kalua', 'laulau', 'kalbi',
  'bulgogi', 'shoyu', 'fried rice', 'loco moco', 'picadillo', 'salisbury', 'enchilada',
  'meatballs', 'chow mein', 'stir fry', 'casserole', 'burger', 'sandwich',
];

const SIDE_KEYWORDS = [
  'rice', 'salad', 'veggies', 'vegetables', 'mac salad', 'macaroni salad', 'mashed', 'potato',
  'bread', 'roll', 'corn', 'beans', 'coleslaw', 'slaw', 'soup', 'fries', 'noodles', 'steamed',
  'fruit', 'dessert', 'green beans', 'carrots', 'broccoli',
];

interface ParsedPageResult {
  days: LunchMenuParsedDay[];
  year: number | null;
  month: number | null;
  errors: string[];
}

interface ColumnRange {
  start: number;
  end: number;
}

interface WeekBuffer {
  dates: Array<string | null>;
  cells: string[][];
}

export async function parseLunchMenuPdfBuffer(buffer: Buffer, fileName: string): Promise<LunchMenuParseResult> {
  const pages = await extractPdfEvidence(buffer);
  const fileGuess = extractMonthYearFromFileName(fileName);
  let year = fileGuess.year;
  let month = fileGuess.month;
  const errors: string[] = [];
  const parsedDays: LunchMenuParsedDay[] = [];

  for (const page of pages) {
    const result = parseLunchMenuPageText(page.extractedText, year, month);
    parsedDays.push(...result.days);
    errors.push(...result.errors.map((entry) => `Page ${page.pageNumber}: ${entry}`));
    year = result.year ?? year;
    month = result.month ?? month;
  }

  const fallback = new Date();
  const resolvedYear = year ?? fallback.getFullYear();
  const resolvedMonth = month ?? fallback.getMonth() + 1;

  return {
    source_file_name: fileName,
    year: resolvedYear,
    month: resolvedMonth,
    days: mergeParsedDays(parsedDays).sort((left, right) => left.date.localeCompare(right.date)),
    errors,
  };
}

export function parseLunchMenuPageText(text: string, defaultYear: number | null, defaultMonth: number | null): ParsedPageResult {
  const cleaned = normalizePageText(text);
  const inferred = extractMonthYearFromText(cleaned);
  const year = inferred.year ?? defaultYear;
  const month = inferred.month ?? defaultMonth;

  if (!cleaned) {
    return {
      days: [],
      year,
      month,
      errors: ['No embedded text extracted from page'],
    };
  }

  const gridDays = parseGridLayout(cleaned, year, month);
  if (gridDays.length > 0) {
    return { days: gridDays, year, month, errors: [] };
  }

  const looseDays = parseLooseDayRows(cleaned, year, month);
  if (looseDays.length > 0) {
    return { days: looseDays, year, month, errors: [] };
  }

  return {
    days: [],
    year,
    month,
    errors: ['Unable to identify weekday menu rows from extracted PDF text'],
  };
}

function normalizePageText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[\t\f]+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/ +$/gm, '')
    .trim();
}

function extractMonthYearFromFileName(fileName: string): { year: number | null; month: number | null } {
  const lower = fileName.toLowerCase();
  for (const [name, month] of MONTH_LOOKUP.entries()) {
    if (!lower.includes(name)) {
      continue;
    }
    const yearMatch = lower.match(/20\d{2}/);
    if (yearMatch) {
      return { year: Number(yearMatch[0]), month };
    }
  }

  const isoMatch = lower.match(/(20\d{2})[-_](\d{1,2})/);
  if (isoMatch) {
    return { year: Number(isoMatch[1]), month: clampMonth(Number(isoMatch[2])) };
  }

  return { year: null, month: null };
}

function extractMonthYearFromText(text: string): { year: number | null; month: number | null } {
  const lower = text.toLowerCase();
  for (const [name, month] of MONTH_LOOKUP.entries()) {
    if (!lower.includes(name)) {
      continue;
    }
    const explicit = lower.match(new RegExp(`${name}\\s+(20\\d{2})`, 'i'));
    if (explicit) {
      return { year: Number(explicit[1]), month };
    }
    const yearMatch = lower.match(/20\d{2}/);
    if (yearMatch) {
      return { year: Number(yearMatch[0]), month };
    }
    return { year: null, month };
  }
  return { year: null, month: null };
}

function parseGridLayout(text: string, year: number | null, month: number | null): LunchMenuParsedDay[] {
  if (!year || !month) {
    return [];
  }

  const lines = text.split('\n').map((line) => line.replace(/\s+$/g, ''));
  const days: LunchMenuParsedDay[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const headerMatch = detectHeaderLine(lines[index] ?? '');
    if (!headerMatch) {
      continue;
    }

    const weekBuffers: WeekBuffer[] = [];
    let currentWeek: WeekBuffer | null = null;

    for (let lineIndex = index + 1; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex] ?? '';
      if (detectHeaderLine(line)) {
        index = lineIndex - 1;
        break;
      }

      if (!line.trim()) {
        continue;
      }

      const cells = splitLineByRanges(line, headerMatch.ranges);
      if (cells.every((cell) => cell.length === 0)) {
        continue;
      }

      const detectedDates = cells.map((cell) => extractLeadingDate(cell, year, month));
      if (detectedDates.filter(Boolean).length >= 2) {
        currentWeek = {
          dates: detectedDates,
          cells: cells.map((cell) => {
            const stripped = stripLeadingDate(cell);
            return stripped ? [stripped] : [];
          }),
        };
        weekBuffers.push(currentWeek);
        continue;
      }

      if (!currentWeek) {
        continue;
      }

      cells.forEach((cell, weekdayIndex) => {
        if (!cell || !currentWeek?.dates[weekdayIndex]) {
          return;
        }
        currentWeek.cells[weekdayIndex]?.push(cell);
      });
    }

    for (const week of weekBuffers) {
      week.dates.forEach((dateValue, weekdayIndex) => {
        if (!dateValue) {
          return;
        }
        const rawText = week.cells[weekdayIndex]?.join('\n').trim() ?? '';
        const parsed = parseCellContent(rawText);
        if (parsed.main_dishes.length === 0 && parsed.sides.length === 0) {
          return;
        }
        days.push({
          date: dateValue,
          main_dishes: parsed.main_dishes,
          sides: parsed.sides,
          raw_text: rawText || null,
        });
      });
    }
  }

  return days;
}

function parseLooseDayRows(text: string, year: number | null, month: number | null): LunchMenuParsedDay[] {
  if (!year || !month) {
    return [];
  }

  const days: LunchMenuParsedDay[] = [];
  const rowPattern = /^(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?)?\s*(\d{1,2})\s*[-–:]?\s+(.+)$/i;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const match = trimmed.match(rowPattern);
    if (!match) {
      continue;
    }

    const isoDate = toIsoDate(year, month, Number(match[1]));
    if (!isoDate || isWeekend(isoDate)) {
      continue;
    }

    const parsed = parseCellContent(match[2] ?? '');
    if (parsed.main_dishes.length === 0 && parsed.sides.length === 0) {
      continue;
    }

    days.push({
      date: isoDate,
      main_dishes: parsed.main_dishes,
      sides: parsed.sides,
      raw_text: match[2]?.trim() ?? null,
    });
  }

  return days;
}

function detectHeaderLine(line: string): { ranges: ColumnRange[] } | null {
  const upper = line.toUpperCase();
  if (!WEEKDAY_TOKENS.every((weekday) => weekday.tokens.some((token) => upper.includes(token)))) {
    return null;
  }

  const starts = WEEKDAY_TOKENS.map((weekday) => {
    const matches = weekday.tokens
      .map((token) => upper.indexOf(token))
      .filter((index) => index >= 0)
      .sort((left, right) => left - right);
    return matches[0] ?? -1;
  });

  if (starts.some((start) => start < 0)) {
    return null;
  }

  return {
    ranges: starts.map((start, index) => ({
      start,
      end: index === starts.length - 1 ? line.length : starts[index + 1] ?? line.length,
    })),
  };
}

function splitLineByRanges(line: string, ranges: ColumnRange[]): string[] {
  return ranges.map((range) => line.slice(range.start, range.end).trim());
}

function extractLeadingDate(cell: string, year: number, month: number): string | null {
  const match = cell.match(/^(\d{1,2})(?:\b|\s)/);
  if (!match) {
    return null;
  }
  return toIsoDate(year, month, Number(match[1]));
}

function stripLeadingDate(cell: string): string {
  return cell.replace(/^(\d{1,2})(?:\b|\s+[-–:]?\s*)/, '').trim();
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }

  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isWeekend(isoDate: string): boolean {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function parseCellContent(content: string): Pick<LunchMenuParsedDay, 'main_dishes' | 'sides'> {
  const normalized = content
    .replace(/\s*•\s*/g, '\n')
    .replace(/\s*\|\s*/g, '\n')
    .replace(/\s{2,}/g, '\n')
    .replace(/\bserved with\b/gi, '\n');

  const parts = normalized
    .split(/[\n,;]+/)
    .map((part) => cleanDishName(part))
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return { main_dishes: [], sides: [] };
  }

  const mainDishes: string[] = [];
  const sides: string[] = [];

  for (const part of parts) {
    const lowered = part.toLowerCase();
    const isSide = SIDE_KEYWORDS.some((keyword) => lowered.includes(keyword));
    const isMain = MAIN_DISH_KEYWORDS.some((keyword) => lowered.includes(keyword));

    if (isSide) {
      sides.push(part);
      continue;
    }

    if (mainDishes.length === 0 || isMain) {
      mainDishes.push(part);
    } else {
      sides.push(part);
    }
  }

  if (mainDishes.length === 0) {
    mainDishes.push(parts[0] as string);
    sides.push(...parts.slice(1));
  }

  return {
    main_dishes: dedupeStrings(mainDishes),
    sides: dedupeStrings(sides.filter((entry) => !mainDishes.includes(entry))),
  };
}

function cleanDishName(value: string): string {
  return value
    .replace(/^[-–•]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeParsedDays(days: LunchMenuParsedDay[]): LunchMenuParsedDay[] {
  const merged = new Map<string, LunchMenuParsedDay>();

  for (const day of days) {
    const current = merged.get(day.date);
    if (!current) {
      merged.set(day.date, {
        date: day.date,
        main_dishes: dedupeStrings(day.main_dishes),
        sides: dedupeStrings(day.sides),
        raw_text: day.raw_text,
      });
      continue;
    }

    current.main_dishes = dedupeStrings([...current.main_dishes, ...day.main_dishes]);
    current.sides = dedupeStrings([...current.sides, ...day.sides]);
    if (!current.raw_text && day.raw_text) {
      current.raw_text = day.raw_text;
    }
  }

  return Array.from(merged.values());
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values.map((entry) => entry.trim()).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }

  return result;
}

function clampMonth(month: number): number | null {
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}
