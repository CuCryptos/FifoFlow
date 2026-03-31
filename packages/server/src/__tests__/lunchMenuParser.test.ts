import { describe, expect, it } from 'vitest';
import { parseLunchMenuPageText } from '../lunchMenus/lunchMenuPdfParser.js';

describe('lunchMenuPdfParser', () => {
  it('parses weekday grid text into lunch menu days', () => {
    const text = [
      'APRIL 2026 EMPLOYEE LUNCH MENU',
      'MONDAY             TUESDAY            WEDNESDAY          THURSDAY           FRIDAY',
      '6                  7                  8                  9                  10',
      'Chicken Katsu      Beef Stew          Fish Tacos         Pork Adobo         Veggie Curry',
      'Rice               Green Salad        Garlic Bread       Steamed Rice       Fruit Cup',
    ].join('\n');

    const result = parseLunchMenuPageText(text, null, null);

    expect(result.errors).toEqual([]);
    expect(result.year).toBe(2026);
    expect(result.month).toBe(4);
    expect(result.days).toHaveLength(5);
    expect(result.days[0]).toMatchObject({
      date: '2026-04-06',
      main_dishes: ['Chicken Katsu'],
      sides: ['Rice'],
    });
    expect(result.days[1]).toMatchObject({
      date: '2026-04-07',
      main_dishes: ['Beef Stew'],
      sides: ['Green Salad'],
    });
    expect(result.days[4]?.date).toBe('2026-04-10');
    expect(result.days[4]?.main_dishes[0]?.toLowerCase()).toContain('veggie');
    expect(result.days[4]?.sides[0]?.toLowerCase()).toContain('fruit');
  });
});
