import type { LunchMenuDishType, LunchMenuItem } from '@fifoflow/shared';

interface SourceMenu {
  id: number;
  year: number;
  month: number;
  items: LunchMenuItem[];
}

interface DishPattern {
  dish_name: string;
  frequency: number;
  weekday_counts: Map<number, number>;
  paired_sides: Map<string, number>;
}

export interface GeneratedLunchMenuDay {
  date: string;
  main_dishes: string[];
  sides: string[];
}

export interface GeneratedLunchMenu {
  year: number;
  month: number;
  days: GeneratedLunchMenuDay[];
  patterns_info: {
    source_menu_count: number;
    main_dishes_found: number;
    side_dishes_found: number;
    generated_days: number;
  };
}

export function generateLunchMenuFromHistory(
  year: number,
  month: number,
  sourceMenus: SourceMenu[],
): GeneratedLunchMenu {
  const mainPatterns = analyzePatterns(sourceMenus, 'main');
  const sidePatterns = analyzePatterns(sourceMenus, 'side');
  const weekdays = getWeekdaysInMonth(year, month);
  const recentMains: string[] = [];
  const days: GeneratedLunchMenuDay[] = [];

  for (const date of weekdays) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const mainDish = selectMainDish(mainPatterns, weekday, recentMains);
    recentMains.push(mainDish);
    if (recentMains.length > 5) {
      recentMains.shift();
    }

    const sides = selectSides(mainDish, sidePatterns, mainPatterns.get(mainDish), weekday);
    days.push({
      date,
      main_dishes: [mainDish],
      sides,
    });
  }

  return {
    year,
    month,
    days,
    patterns_info: {
      source_menu_count: sourceMenus.length,
      main_dishes_found: mainPatterns.size,
      side_dishes_found: sidePatterns.size,
      generated_days: days.length,
    },
  };
}

function analyzePatterns(sourceMenus: SourceMenu[], dishType: LunchMenuDishType): Map<string, DishPattern> {
  const patterns = new Map<string, DishPattern>();

  for (const menu of sourceMenus) {
    const itemsByDate = new Map<string, LunchMenuItem[]>();
    for (const item of menu.items) {
      const current = itemsByDate.get(item.date) ?? [];
      current.push(item);
      itemsByDate.set(item.date, current);
    }

    for (const [date, items] of itemsByDate.entries()) {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const typedItems = items
        .filter((item) => item.dish_type === dishType)
        .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id);

      for (const item of typedItems) {
        const dishName = item.dish_name.trim();
        if (!dishName) {
          continue;
        }

        const pattern = patterns.get(dishName) ?? {
          dish_name: dishName,
          frequency: 0,
          weekday_counts: new Map<number, number>(),
          paired_sides: new Map<string, number>(),
        };
        pattern.frequency += 1;
        pattern.weekday_counts.set(weekday, (pattern.weekday_counts.get(weekday) ?? 0) + 1);

        if (dishType === 'main') {
          items
            .filter((entry) => entry.dish_type === 'side')
            .forEach((side) => {
              const sideName = side.dish_name.trim();
              if (!sideName) {
                return;
              }
              pattern.paired_sides.set(sideName, (pattern.paired_sides.get(sideName) ?? 0) + 1);
            });
        }

        patterns.set(dishName, pattern);
      }
    }
  }

  return patterns;
}

function getWeekdaysInMonth(year: number, month: number): string[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates: string[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) {
      dates.push(isoDate);
    }
  }

  return dates;
}

function selectMainDish(patterns: Map<string, DishPattern>, weekday: number, recentMains: string[]): string {
  const ranked = Array.from(patterns.values())
    .filter((pattern) => !recentMains.includes(pattern.dish_name))
    .map((pattern) => ({
      dish_name: pattern.dish_name,
      score: pattern.frequency * 10 + (pattern.weekday_counts.get(weekday) ?? 0) * 5,
    }))
    .sort((left, right) => right.score - left.score || left.dish_name.localeCompare(right.dish_name));

  if (ranked.length > 0) {
    return ranked[0]!.dish_name;
  }

  const fallback = Array.from(patterns.values())
    .sort((left, right) => right.frequency - left.frequency || left.dish_name.localeCompare(right.dish_name));
  if (fallback.length === 0) {
    return 'Chef Special';
  }
  return fallback[0]!.dish_name;
}

function selectSides(
  mainDish: string,
  sidePatterns: Map<string, DishPattern>,
  mainPattern: DishPattern | undefined,
  weekday: number,
): string[] {
  const rankedPairedSides = Array.from(mainPattern?.paired_sides.entries() ?? [])
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([dishName]) => dishName);

  const selected: string[] = [];
  for (const side of rankedPairedSides) {
    if (!selected.includes(side)) {
      selected.push(side);
    }
    if (selected.length >= 2) {
      return selected;
    }
  }

  const fallbackSides = Array.from(sidePatterns.values())
    .filter((pattern) => pattern.dish_name !== mainDish)
    .map((pattern) => ({
      dish_name: pattern.dish_name,
      score: pattern.frequency * 10 + (pattern.weekday_counts.get(weekday) ?? 0) * 2,
    }))
    .sort((left, right) => right.score - left.score || left.dish_name.localeCompare(right.dish_name));

  for (const candidate of fallbackSides) {
    if (!selected.includes(candidate.dish_name)) {
      selected.push(candidate.dish_name);
    }
    if (selected.length >= 2) {
      break;
    }
  }

  if (selected.length === 0) {
    selected.push('Rice');
  }

  return selected;
}
