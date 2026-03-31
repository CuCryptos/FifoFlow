import PDFDocument from 'pdfkit';
import type { LunchMenu } from '@fifoflow/shared';

interface LunchMenuPdfOptions {
  venueName?: string | null;
}

interface CalendarDayData {
  date: string;
  dayNumber: number;
  mains: string[];
  sides: string[];
  nutrition: { calories: number; protein_g: number; fat_g: number; sugar_g: number } | null;
}

const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export async function renderLunchMenuPdf(menu: LunchMenu, options: LunchMenuPdfOptions = {}): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 28, compress: true });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  drawDocument(doc, menu, options);
  doc.end();
  return done;
}

function drawDocument(doc: PDFKit.PDFDocument, menu: LunchMenu, options: LunchMenuPdfOptions): void {
  const monthName = MONTH_NAMES[menu.month - 1] ?? String(menu.month);
  const title = menu.name?.trim() || `${monthName} ${menu.year} Lunch Menu`;
  const venueName = options.venueName?.trim() || 'FIFOFlow Lunch Menu';
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 28;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;
  const headerHeight = 72;
  const footerHeight = 28;
  const weekdayHeaderHeight = 24;
  const weekCount = countWeeks(menu.year, menu.month);
  const cellHeight = Math.max(88, (usableHeight - headerHeight - footerHeight - weekdayHeaderHeight) / Math.max(weekCount, 1));
  const cellWidth = usableWidth / 5;
  const startY = margin + headerHeight;

  drawHeader(doc, margin, margin, usableWidth, venueName, title, monthName, menu.year);
  drawWeekdayHeaders(doc, margin, startY, cellWidth, weekdayHeaderHeight);

  const weeks = buildCalendar(menu);
  weeks.forEach((week, weekIndex) => {
    const y = startY + weekdayHeaderHeight + weekIndex * cellHeight;
    week.forEach((day, dayIndex) => {
      drawDayCell(doc, margin + dayIndex * cellWidth, y, cellWidth, cellHeight, day);
    });
  });

  drawFooter(doc, margin, pageHeight - margin - footerHeight + 6, usableWidth, menu.notes);
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  venueName: string,
  title: string,
  monthName: string,
  year: number,
): void {
  doc.save();
  doc.lineWidth(1.25).strokeColor('#0f172a').roundedRect(x, y, width, 58, 10).stroke();

  doc.font('Helvetica-Bold').fontSize(22).fillColor('#0f172a').text(venueName, x + 16, y + 10, {
    width: width - 32,
    align: 'center',
  });
  doc.font('Helvetica').fontSize(10).fillColor('#475569').text(`${monthName} ${year} employee lunch menu`, x + 16, y + 34, {
    width: width - 32,
    align: 'center',
  });
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text(title, x + 16, y + 50, {
    width: width - 32,
    align: 'center',
  });
  doc.restore();
}

function drawWeekdayHeaders(doc: PDFKit.PDFDocument, x: number, y: number, cellWidth: number, height: number): void {
  WEEKDAY_LABELS.forEach((label, index) => {
    const cellX = x + index * cellWidth;
    doc.save();
    doc.rect(cellX, y, cellWidth, height).fillAndStroke('#f8fafc', '#cbd5e1');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#334155').text(label.toUpperCase(), cellX + 8, y + 7, {
      width: cellWidth - 16,
      align: 'center',
    });
    doc.restore();
  });
}

function drawDayCell(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, day: CalendarDayData | null): void {
  doc.save();
  doc.rect(x, y, width, height).fillAndStroke('#ffffff', '#cbd5e1');

  if (!day) {
    doc.restore();
    return;
  }

  doc.roundedRect(x + width - 28, y, 28, 22, 0).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(String(day.dayNumber), x + width - 24, y + 6, {
    width: 20,
    align: 'center',
  });

  let cursorY = y + 10;
  if (day.mains.length > 0) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(day.mains.join('\n'), x + 8, cursorY, {
      width: width - 16,
      align: 'center',
      height: 36,
      ellipsis: true,
    });
    cursorY = Math.max(cursorY + 28, doc.y + 4);
  }

  if (day.sides.length > 0) {
    doc.font('Helvetica').fontSize(8).fillColor('#334155').text(day.sides.join(', '), x + 8, cursorY, {
      width: width - 16,
      align: 'center',
      height: 24,
      ellipsis: true,
    });
  }

  if (day.nutrition) {
    const nutritionY = y + height - 28;
    doc.moveTo(x + 12, nutritionY - 4).lineTo(x + width - 12, nutritionY - 4).strokeColor('#e2e8f0').stroke();
    const parts = [
      day.nutrition.calories > 0 ? `${day.nutrition.calories} cal` : null,
      day.nutrition.protein_g > 0 ? `${Math.round(day.nutrition.protein_g)}g P` : null,
      day.nutrition.fat_g > 0 ? `${Math.round(day.nutrition.fat_g)}g F` : null,
      day.nutrition.sugar_g > 0 ? `${Math.round(day.nutrition.sugar_g)}g S` : null,
    ].filter(Boolean);

    if (parts.length > 0) {
      doc.font('Helvetica').fontSize(7).fillColor('#64748b').text(parts.join(' • '), x + 8, nutritionY + 2, {
        width: width - 16,
        align: 'center',
      });
    }
  }

  doc.restore();
}

function drawFooter(doc: PDFKit.PDFDocument, x: number, y: number, width: number, notes: string | null): void {
  doc.save();
  doc.moveTo(x, y).lineTo(x + width, y).strokeColor('#cbd5e1').stroke();
  const footerText = notes?.trim()
    ? `Notes: ${notes.trim()}`
    : 'Generated from FIFOFlow lunch menu planning.';
  doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(footerText, x, y + 6, {
    width,
    align: 'left',
  });
  doc.restore();
}

function buildCalendar(menu: LunchMenu): Array<Array<CalendarDayData | null>> {
  const byDate = new Map<string, CalendarDayData>();

  for (const item of menu.items) {
    const existing = byDate.get(item.date) ?? {
      date: item.date,
      dayNumber: Number(item.date.slice(-2)),
      mains: [],
      sides: [],
      nutrition: null,
    };

    if (item.dish_type === 'main') {
      existing.mains.push(item.dish_name);
    } else {
      existing.sides.push(item.dish_name);
    }

    if (item.calories != null || item.protein_g != null || item.fat_g != null || item.sugar_g != null) {
      existing.nutrition = {
        calories: (existing.nutrition?.calories ?? 0) + (item.calories ?? 0),
        protein_g: (existing.nutrition?.protein_g ?? 0) + (item.protein_g ?? 0),
        fat_g: (existing.nutrition?.fat_g ?? 0) + (item.fat_g ?? 0),
        sugar_g: (existing.nutrition?.sugar_g ?? 0) + (item.sugar_g ?? 0),
      };
    }

    byDate.set(item.date, existing);
  }

  const result: Array<Array<CalendarDayData | null>> = [];
  let currentWeek: Array<CalendarDayData | null> = [];
  const daysInMonth = new Date(Date.UTC(menu.year, menu.month, 0)).getUTCDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const isoDate = `${menu.year}-${String(menu.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) {
      continue;
    }
    if (weekday === 1 && currentWeek.length > 0) {
      while (currentWeek.length < 5) currentWeek.push(null);
      result.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push(byDate.get(isoDate) ?? {
      date: isoDate,
      dayNumber: day,
      mains: [],
      sides: [],
      nutrition: null,
    });
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 5) currentWeek.push(null);
    result.push(currentWeek);
  }

  return result;
}

function countWeeks(year: number, month: number): number {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let weekCount = 0;
  let openWeek = false;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) {
      continue;
    }
    if (weekday === 1 || !openWeek) {
      weekCount += 1;
      openWeek = true;
    }
  }

  return Math.max(weekCount, 1);
}
