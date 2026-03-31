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
  const venueName = options.venueName?.trim() || 'PARADISE KITCHEN';
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 26;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;
  const headerHeight = 102;
  const footerHeight = 30;
  const weekdayHeaderHeight = 22;
  const weekCount = countWeeks(menu.year, menu.month);
  const availableGridHeight = usableHeight - headerHeight - footerHeight - weekdayHeaderHeight;
  const cellHeight = Math.max(72, availableGridHeight / Math.max(weekCount, 1));
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
  const topY = y + 8;
  const bottomY = y + 96;
  doc.lineWidth(2).strokeColor('#111827').moveTo(x + 10, topY).lineTo(x + width - 10, topY).stroke();
  doc.lineWidth(0.6).moveTo(x + 10, topY + 4).lineTo(x + width - 10, topY + 4).stroke();
  doc.lineWidth(2).moveTo(x + 10, bottomY).lineTo(x + width - 10, bottomY).stroke();
  doc.lineWidth(0.6).moveTo(x + 10, bottomY - 4).lineTo(x + width - 10, bottomY - 4).stroke();

  doc.font('Helvetica-Bold').fontSize(24).fillColor('#111827').text(venueName.toUpperCase(), x + 16, y + 20, {
    align: 'center',
    width: width - 32,
  });
  doc.font('Helvetica-Oblique').fontSize(9).fillColor('#475569').text('Serving Fresh, Quality Meals Daily', x + 16, y + 44, {
    align: 'center',
    width: width - 32,
  });
  doc.moveTo(x + width / 2 - 92, y + 58).lineTo(x + width / 2 + 92, y + 58).lineWidth(0.5).strokeColor('#64748b').stroke();
  doc.font('Helvetica-Bold').fontSize(19).fillColor('#111827').text(`${monthName} ${year}`, x + 16, y + 62, {
    width: width - 32,
    align: 'center',
  });
  doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text('EMPLOYEE LUNCH MENU', x + 16, y + 83, {
    width: width - 32,
    align: 'center',
  });
  doc.restore();
}

function drawWeekdayHeaders(doc: PDFKit.PDFDocument, x: number, y: number, cellWidth: number, height: number): void {
  WEEKDAY_LABELS.forEach((label, index) => {
    const cellX = x + index * cellWidth;
    doc.save();
    doc.rect(cellX, y, cellWidth, height).fillAndStroke('#f8fafc', '#9ca3af');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151').text(label.toUpperCase(), cellX + 8, y + 6, {
      width: cellWidth - 16,
      align: 'center',
    });
    doc.restore();
  });
}

function drawDayCell(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, day: CalendarDayData | null): void {
  doc.save();
  doc.rect(x, y, width, height).fillAndStroke('#ffffff', '#b8c2cf');

  if (!day) {
    doc.restore();
    return;
  }

  const dateBoxWidth = 28;
  const dateBoxHeight = 22;
  doc.lineWidth(0.55).strokeColor('#9ca3af')
    .moveTo(x + width - dateBoxWidth, y + dateBoxHeight)
    .lineTo(x + width, y + dateBoxHeight)
    .stroke();
  doc.moveTo(x + width - dateBoxWidth, y)
    .lineTo(x + width - dateBoxWidth, y + dateBoxHeight)
    .stroke();
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(String(day.dayNumber), x + width - dateBoxWidth + 4, y + 6, {
    width: dateBoxWidth - 8,
    align: 'center',
  });

  let cursorY = y + 14;
  if (day.mains.length > 0) {
    doc.font('Helvetica-Bold').fontSize(8.8).fillColor('#111827').text(day.mains.join('\n'), x + 10, cursorY, {
      width: width - 16,
      align: 'center',
      height: 34,
      ellipsis: true,
    });
    cursorY = Math.max(cursorY + 25, doc.y + 3);
  }

  if (day.sides.length > 0) {
    doc.font('Helvetica').fontSize(7.6).fillColor('#374151').text(day.sides.join(', '), x + 10, cursorY, {
      width: width - 20,
      align: 'center',
      height: 23,
      ellipsis: true,
    });
  }

  if (day.nutrition) {
    const nutritionY = y + height - 26;
    doc.moveTo(x + 10, nutritionY - 3).lineTo(x + width - 10, nutritionY - 3).lineWidth(0.45).strokeColor('#c4cbd4').stroke();
    const parts = [
      day.nutrition.calories > 0 ? `${day.nutrition.calories} cal` : null,
      day.nutrition.protein_g > 0 ? `${Math.round(day.nutrition.protein_g)}g P` : null,
      day.nutrition.fat_g > 0 ? `${Math.round(day.nutrition.fat_g)}g F` : null,
      day.nutrition.sugar_g > 0 ? `${Math.round(day.nutrition.sugar_g)}g S` : null,
    ].filter(Boolean);

    if (parts.length > 0) {
      doc.font('Helvetica').fontSize(6.7).fillColor('#6b7280').text(parts.join(' • '), x + 8, nutritionY + 2, {
        width: width - 16,
        align: 'center',
      });
    }
  }

  doc.restore();
}

function drawFooter(doc: PDFKit.PDFDocument, x: number, y: number, width: number, notes: string | null): void {
  doc.save();
  doc.moveTo(x, y).lineTo(x + width, y).lineWidth(1).strokeColor('#111827').stroke();
  doc.font('Helvetica').fontSize(7.8).fillColor('#4b5563').text('*Nutritional Information are Estimates Only.', x + 4, y + 6, {
    width: width / 2 - 20,
    align: 'left',
  });
  doc.font('Helvetica').fontSize(7.8).fillColor('#4b5563').text('Lunch served Monday - Friday | 11:30 AM - 1:00 PM', x + width / 2, y + 6, {
    width: width / 2 - 4,
    align: 'right',
  });
  doc.fillColor('#6b7280').circle(x + width / 2, y + 12, 1.5).fill();
  doc.circle(x + width / 2 - 10, y + 12, 1).fill();
  doc.circle(x + width / 2 + 10, y + 12, 1).fill();
  if (notes?.trim()) {
    doc.font('Helvetica').fontSize(7.2).fillColor('#6b7280').text(`Notes: ${notes.trim()}`, x + 4, y - 12, {
      width: width - 8,
      align: 'left',
      ellipsis: true,
    });
  }
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
