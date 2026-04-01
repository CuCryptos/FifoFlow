import { describe, expect, it } from 'vitest';
import type { LunchMenu } from '@fifoflow/shared';
import { buildLunchMenuPdfCalendar } from '../lunchMenus/lunchMenuPdfExport.js';

describe('lunchMenuPdfExport', () => {
  it('pads the first export week so dates stay under the correct weekday', () => {
    const menu: LunchMenu = {
      id: 1,
      venue_id: 2,
      year: 2026,
      month: 4,
      name: 'April 2026 Lunch Menu',
      status: 'draft',
      notes: null,
      created_at: '2026-03-31T00:00:00Z',
      updated_at: '2026-03-31T00:00:00Z',
      items: [],
    };

    const weeks = buildLunchMenuPdfCalendar(menu);

    expect(weeks[0]).toHaveLength(5);
    expect(weeks[0][0]).toBeNull();
    expect(weeks[0][1]).toBeNull();
    expect(weeks[0][2]).toMatchObject({
      date: '2026-04-01',
      dayNumber: 1,
    });
    expect(weeks[0][4]).toMatchObject({
      date: '2026-04-03',
      dayNumber: 3,
    });
  });
});
