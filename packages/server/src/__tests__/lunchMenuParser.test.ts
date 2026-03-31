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
      'Nutritional Information:  Nutritional Information:  Nutritional Information:  Nutritional Information:  Nutritional Information:',
      '540cal | 28g P | 17g F | 6g S  610cal | 31g P | 19g F | 7g S  420cal | 18g P | 12g F | 5g S  550cal | 24g P | 16g F | 4g S  390cal | 9g P | 14g F | 18g S',
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
      nutrition: {
        calories: 540,
        protein_g: 28,
        fat_g: 17,
        sugar_g: 6,
      },
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

  it('recovers clean day rows from a legacy SOH calendar export layout', () => {
    const text = [
      'PARADISE KITCHEN',
      'Serving Fresh, Quality Meals Daily',
      '',
      'March 2026',
      'EMPLOYEE LUNCH MENU',
      '',
      '      MONDAY                        TUESDAY                       WEDNESDAY                     THURSDAY                      FRIDAY',
      '                          2                              3                              4                              5                             6',
      '   Chicken Katsu                  BBQ Chicken                    Quesadillas                    Roast Beef                    Beef Stew',
      'Steamed Rice, Garden Salad   Garden Salad, Steamed Rice        Garden Salad         Mac Salad, Garden Salad, Mashed   Steamed Rice, Garden Salad',
      '                                                                                                            Potatoes',
      ' Nutritional Information:     Nutritional Information:         Nutritional Information:       Nutritional Information:      Nutritional Information:',
      '1519cal | 98g P | 49g F | 10g S   774cal | 63g P | 33g F | 23g S   1250cal | 74g P | 56g F | 7g S   1373cal | 71g P | 89g F | 11g S   786cal | 56g P | 37g F | 8g S',
    ].join('\n');

    const result = parseLunchMenuPageText(text, null, null);

    expect(result.errors).toEqual([]);
    expect(result.year).toBe(2026);
    expect(result.month).toBe(3);
    expect(result.days).toHaveLength(5);
    expect(result.days[0]).toMatchObject({
      date: '2026-03-02',
      main_dishes: ['Chicken Katsu'],
      sides: ['Steamed Rice', 'Garden Salad'],
      nutrition: {
        calories: 1519,
        protein_g: 98,
        fat_g: 49,
        sugar_g: 10,
      },
      needs_review: false,
    });
    expect(result.days[3]).toMatchObject({
      date: '2026-03-05',
      main_dishes: ['Roast Beef'],
      sides: ['Mac Salad', 'Garden Salad', 'Mashed Potatoes'],
      nutrition: {
        calories: 1373,
        protein_g: 71,
        fat_g: 89,
        sugar_g: 11,
      },
      needs_review: false,
    });
  });
});
