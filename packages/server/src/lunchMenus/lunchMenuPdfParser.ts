import { extractPdfEvidence } from '../routes/invoiceDocumentExtraction.js';
import type { LunchMenuDayNutrition, LunchMenuParseResult, LunchMenuParsedDay } from '@fifoflow/shared';

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

interface TextSpan {
  text: string;
  start: number;
  end: number;
}

interface ParsedCellContent {
  main_dishes: string[];
  sides: string[];
  nutrition: LunchMenuDayNutrition | null;
  needs_review: boolean;
  review_notes: string[];
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
      if (isFooterLine(line)) {
        break;
      }
      if (detectHeaderLine(line)) {
        index = lineIndex - 1;
        break;
      }

      if (!line.trim()) {
        continue;
      }

      const detectedDates = detectWeekDateLine(line, year, month);
      if (detectedDates.filter(Boolean).length > 0) {
        currentWeek = {
          dates: detectedDates,
          cells: detectedDates.map(() => []),
        };
        weekBuffers.push(currentWeek);
        continue;
      }

      if (!currentWeek) {
        continue;
      }

      for (const span of extractTextSpans(line)) {
        const weekdayIndex = assignSpanToWeekday(span, headerMatch.ranges);
        if (weekdayIndex == null || !currentWeek.dates[weekdayIndex]) {
          continue;
        }
        currentWeek.cells[weekdayIndex]?.push(span.text);
      }
    }

    for (const week of weekBuffers) {
      week.dates.forEach((dateValue, weekdayIndex) => {
        if (!dateValue) {
          return;
        }
        const rawText = week.cells[weekdayIndex]?.join('\n').trim() ?? '';
        const parsed = parseStructuredCellLines(week.cells[weekdayIndex] ?? []);
        if (parsed.main_dishes.length === 0 && parsed.sides.length === 0 && !parsed.nutrition) {
          return;
        }
        days.push({
          date: dateValue,
          main_dishes: parsed.main_dishes,
          sides: parsed.sides,
          nutrition: parsed.nutrition,
          raw_text: rawText || null,
          needs_review: parsed.needs_review,
          review_notes: parsed.review_notes,
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

    const parsed = parseFreeformContent(match[2] ?? '');
    if (parsed.main_dishes.length === 0 && parsed.sides.length === 0 && !parsed.nutrition) {
      continue;
    }

    days.push({
      date: isoDate,
      main_dishes: parsed.main_dishes,
      sides: parsed.sides,
      nutrition: parsed.nutrition,
      raw_text: match[2]?.trim() ?? null,
      needs_review: parsed.needs_review,
      review_notes: parsed.review_notes,
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

function detectWeekDateLine(line: string, year: number, month: number): Array<string | null> {
  if (/[A-Za-z]/.test(line)) {
    return [];
  }

  const spans = extractTextSpans(line).filter((span) => /^\d{1,2}$/.test(span.text));
  if (spans.length === 0 || spans.length > 5) {
    return [];
  }

  const dates = Array<string | null>(5).fill(null);
  spans.forEach((span, index) => {
    if (index < 5) {
      dates[index] = toIsoDate(year, month, Number(span.text));
    }
  });
  return dates;
}

function extractTextSpans(line: string): TextSpan[] {
  const spans: TextSpan[] = [];
  const regex = /\S+(?: \S+)*/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    const text = match[0]?.trim();
    if (!text) {
      continue;
    }
    spans.push({
      text,
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return spans;
}

function assignSpanToWeekday(span: TextSpan, ranges: ColumnRange[]): number | null {
  const midPoint = span.start + ((span.end - span.start) / 2);

  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    if (!range) {
      continue;
    }
    const upperBound = index === ranges.length - 1
      ? Number.POSITIVE_INFINITY
      : ((range.end - 1) + (ranges[index + 1]?.start ?? range.end)) / 2;
    if (midPoint >= range.start && midPoint < upperBound) {
      return index;
    }
  }

  return null;
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

function parseStructuredCellLines(lines: string[]): ParsedCellContent {
  const rawLines = lines
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !isFooterLine(line));

  if (rawLines.length === 0) {
    return {
      main_dishes: [],
      sides: [],
      nutrition: null,
      needs_review: false,
      review_notes: [],
    };
  }

  const contentLines: string[] = [];
  const nutritionLines: string[] = [];
  let inNutrition = false;

  for (const line of rawLines) {
    if (/nutritional information/i.test(line)) {
      inNutrition = true;
      nutritionLines.push(line);
      continue;
    }
    if (inNutrition) {
      nutritionLines.push(line);
    } else {
      contentLines.push(line);
    }
  }

  const mainLine = cleanDishName(contentLines[0] ?? '');
  const collapsedSideLines = collapseWrappedContentLines(contentLines.slice(1));
  const sideText = collapsedSideLines.join(', ');
  const sideParts = sideText
    .split(/[,;]+/)
    .map((part) => cleanDishName(part))
    .filter(Boolean)
    .filter((part) => !looksLikeNutritionFragment(part));
  const nutrition = parseNutritionText(nutritionLines.join(' '));

  const mainDishes = mainLine ? [mainLine] : [];
  const sides = dedupeStrings(sideParts.filter((entry) => !mainDishes.includes(entry)));
  const reviewNotes = buildReviewNotes({
    main_dishes: mainDishes,
    sides,
    nutrition,
    raw_text: rawLines.join('\n'),
  });

  return {
    main_dishes: mainDishes,
    sides,
    nutrition,
    needs_review: reviewNotes.length > 0,
    review_notes: reviewNotes,
  };
}

function collapseWrappedContentLines(lines: string[]): string[] {
  const collapsed: string[] = [];

  for (const rawLine of lines) {
    const line = cleanDishName(rawLine);
    if (!line) {
      continue;
    }

    if (collapsed.length === 0) {
      collapsed.push(line);
      continue;
    }

    const previous = collapsed[collapsed.length - 1] ?? '';
    const continuation = isContinuationLine(previous, line);
    if (continuation) {
      collapsed[collapsed.length - 1] = `${previous} ${line}`.replace(/\s+/g, ' ').trim();
    } else {
      collapsed.push(line);
    }
  }

  return collapsed;
}

function isContinuationLine(previous: string, current: string): boolean {
  if (current.split(/\s+/).length <= 1) {
    return true;
  }

  if (/^(?:and|with|rice|potatoes|salad|chips|bread|rolls?)$/i.test(current)) {
    return true;
  }

  return /\b(?:mashed|steamed|garden|mac|mixed|white|brown|fried|garlic|green)$|,$/i.test(previous);
}

function parseFreeformContent(content: string): ParsedCellContent {
  const nutrition = parseNutritionText(content);
  const normalized = content
    .replace(/\bNutritional Information:?\b/gi, '\n')
    .replace(/\s*•\s*/g, '\n')
    .replace(/\s{2,}/g, '\n')
    .replace(/\bserved with\b/gi, '\n');

  const parts = normalized
    .split(/[\n,;]+/)
    .map((part) => cleanDishName(part))
    .filter((part) => part.length > 0)
    .filter((part) => !looksLikeNutritionFragment(part));

  if (parts.length === 0) {
    return {
      main_dishes: [],
      sides: [],
      nutrition,
      needs_review: nutrition == null,
      review_notes: nutrition == null ? ['No dish text could be recovered from this parsed row.'] : [],
    };
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

  const dedupedMains = dedupeStrings(mainDishes);
  const dedupedSides = dedupeStrings(sides.filter((entry) => !dedupedMains.includes(entry)));
  const reviewNotes = buildReviewNotes({
    main_dishes: dedupedMains,
    sides: dedupedSides,
    nutrition,
    raw_text: content,
  });

  return {
    main_dishes: dedupedMains,
    sides: dedupedSides,
    nutrition,
    needs_review: reviewNotes.length > 0,
    review_notes: reviewNotes,
  };
}

function parseNutritionText(text: string): LunchMenuDayNutrition | null {
  if (!text) {
    return null;
  }

  const calories = extractNutritionNumber(text, /(\d+(?:\.\d+)?)\s*cal\b/i);
  const protein = extractNutritionNumber(text, /(\d+(?:\.\d+)?)\s*g\s*p\b/i);
  const fat = extractNutritionNumber(text, /(\d+(?:\.\d+)?)\s*g\s*f\b/i);
  const sugar = extractNutritionNumber(text, /(\d+(?:\.\d+)?)\s*g\s*s\b/i);

  if (calories == null && protein == null && fat == null && sugar == null) {
    return null;
  }

  return {
    calories: calories ?? 0,
    protein_g: protein ?? 0,
    fat_g: fat ?? 0,
    sugar_g: sugar ?? 0,
  };
}

function extractNutritionNumber(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildReviewNotes(day: Pick<LunchMenuParsedDay, 'main_dishes' | 'sides' | 'nutrition' | 'raw_text'>): string[] {
  const notes: string[] = [];
  const allEntries = [...day.main_dishes, ...day.sides];

  if (day.main_dishes.length === 0) {
    notes.push('Main dish could not be identified cleanly.');
  }

  if (allEntries.some((entry) => looksTruncated(entry))) {
    notes.push('At least one dish name looks truncated and should be reviewed.');
  }

  if (allEntries.some((entry) => looksLikeNutritionFragment(entry))) {
    notes.push('Nutrition text leaked into dish content and should be corrected.');
  }

  if (!day.nutrition && /\bcal\b|\bg\s*[PFS]\b/i.test(day.raw_text ?? '')) {
    notes.push('Nutrition text was detected but not fully recovered.');
  }

  return dedupeStrings(notes);
}

function looksTruncated(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3) {
    return true;
  }
  return /^[a-z]/.test(trimmed) || /(?:^|[\s-])[a-z]{1,2}$/.test(trimmed);
}

function looksLikeNutritionFragment(value: string): boolean {
  return /\b(?:nutri|itional information|cal\b|\d+\s*g\s*[PFS])\b/i.test(value);
}

function isFooterLine(line: string): boolean {
  return /generated from fifoflow lunch menu planning|lunch served monday\s*-\s*friday|\*?nutritional information are estimates only/i.test(line);
}

function cleanDishName(value: string): string {
  return value
    .replace(/^[-–•]+/, '')
    .replace(/\bNutritional Information:?\b/gi, '')
    .replace(/\b\d+(?:\.\d+)?\s*cal\b/gi, '')
    .replace(/\b\d+(?:\.\d+)?\s*g\s*[PFS]\b/gi, '')
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^,+|,+$/g, '')
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
        nutrition: day.nutrition,
        raw_text: day.raw_text,
        needs_review: day.needs_review,
        review_notes: dedupeStrings(day.review_notes),
      });
      continue;
    }

    current.main_dishes = dedupeStrings([...current.main_dishes, ...day.main_dishes]);
    current.sides = dedupeStrings([...current.sides, ...day.sides]);
    current.nutrition = current.nutrition ?? day.nutrition;
    if (!current.raw_text && day.raw_text) {
      current.raw_text = day.raw_text;
    }
    current.needs_review = current.needs_review || day.needs_review;
    current.review_notes = dedupeStrings([...current.review_notes, ...day.review_notes]);
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
