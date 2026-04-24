import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

type DrinkMacros = { calories: number; protein: number; carbs: number; fat: number };
export type DrinkItem = { id: string; name: string; macros: DrinkMacros };
type RawDrinkMacros = Partial<Record<keyof DrinkMacros | 'fats', number | string | null | undefined>>;
type RawDrinkEntry = {
  id?: string;
  name?: string;
  macros?: RawDrinkMacros | null;
  category?: string;
  calories?: number | string | null;
  protein_g?: number | string | null;
  carbs_g?: number | string | null;
  fat_g?: number | string | null;
  fats_g?: number | string | null;
};
type DrinkSourceFile = {
  restaurant_name?: string;
  drinks?: RawDrinkEntry[];
  items?: RawDrinkEntry[];
};

const GENERIC_CHAIN_DRINK_SIZES: DrinkItem[] = [
  {
    id: 'generic-drink-12oz',
    name: 'Generic Drink (12 oz)',
    macros: { calories: 140, protein: 0, carbs: 39, fat: 0 },
  },
  {
    id: 'generic-drink-16oz',
    name: 'Generic Drink (16 oz)',
    macros: { calories: 190, protein: 0, carbs: 52, fat: 0 },
  },
  {
    id: 'generic-drink-20oz',
    name: 'Generic Drink (20 oz)',
    macros: { calories: 240, protein: 0, carbs: 65, fat: 0 },
  },
];

function normalizeRestaurantForMatch(name: string): string {
  return (name || '').toLowerCase().trim();
}

function normalizeDrinkNameForMatch(name: string): string {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function toDrinkMacros(entry: RawDrinkEntry): DrinkMacros {
  const macros = entry.macros || {};
  return {
    calories: Number(macros.calories ?? entry.calories) || 0,
    protein: Number(macros.protein ?? entry.protein_g) || 0,
    carbs: Number(macros.carbs ?? entry.carbs_g) || 0,
    fat: Number(macros.fat ?? macros.fats ?? entry.fat_g ?? entry.fats_g) || 0,
  };
}

function isDrinkCategory(category: string): boolean {
  const normalized = (category || '').toLowerCase().trim();
  return /\b(drink|drinks|beverage|beverages|soda|sodas|alcohol|cocktail|cocktails|beer|wine|smoothie|shake|juice|juices)\b/.test(normalized);
}

function isSpecialtyDrinkName(name: string): boolean {
  const normalized = normalizeDrinkNameForMatch(name);
  if (!normalized) return false;

  return /\b(smoothie|smoothies|shake|shakes|milkshake|acai|pitaya|blend|blended|frappe|freeze|float|slush|boba|coffee|latte|mocha|espresso|matcha|cold brew|tea|chai|juice|lemonade|refresher|specialty)\b/.test(normalized);
}

function isSmoothieOrShakeName(name: string): boolean {
  const normalized = normalizeDrinkNameForMatch(name);
  return /\b(smoothie|smoothies|shake|shakes|milkshake|acai|pitaya|blend|blended)\b/.test(normalized);
}

function toDrinkItem(entry: RawDrinkEntry, index: number): DrinkItem {
  const name = (entry.name || 'Drink').trim() || 'Drink';
  return {
    id: entry.id || `drink-${index}-${name.replace(/\s+/g, '-').toLowerCase()}`,
    name,
    macros: toDrinkMacros(entry),
  };
}

function dedupeDrinksByName(items: DrinkItem[]): DrinkItem[] {
  const seen = new Set<string>();
  const deduped: DrinkItem[] = [];

  for (const item of items) {
    const key = normalizeDrinkNameForMatch(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

/**
 * GET /api/drinks?restaurant=Cheba+Hut
 * Returns drink options for the given restaurant from data/jsons/*_raw.json.
 * Behavior:
 * 1. Generic chain drink sizes (12/16/20 oz) for standard drink menus.
 * 2. Restaurant-specific specialty drinks (smoothies, shakes, and specialty beverages).
 * 3. Excludes specific standard fountain-drink names to keep the dropdown concise.
 */
export async function GET(req: NextRequest) {
  try {
    const restaurant = req.nextUrl.searchParams.get('restaurant');
    if (!restaurant || !restaurant.trim()) {
      return Response.json({ drinks: [] });
    }

    const dataDir = path.join(process.cwd(), 'data', 'jsons');
    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(dataDir, { withFileTypes: true });
    } catch {
      return Response.json({ drinks: [] });
    }

    const targetNorm = normalizeRestaurantForMatch(restaurant);
    const jsonFiles = dirEntries.filter((e) => e.isFile() && e.name.endsWith('_raw.json'));

    for (const entry of jsonFiles) {
      const filePath = path.join(dataDir, entry.name);
      let raw: string;
      try {
        raw = fs.readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      let data: DrinkSourceFile;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }

      const fileRestaurantNorm = normalizeRestaurantForMatch(data.restaurant_name || '');
      if (fileRestaurantNorm !== targetNorm) continue;

      const topLevelDrinks = Array.isArray(data.drinks) ? data.drinks : [];
      const itemLevelDrinks = Array.isArray(data.items)
        ? data.items.filter((item) => {
            const hasName = Boolean(item.name && item.name.trim());
            const hasMacros = Boolean(item.macros || item.calories != null);
            return hasName && hasMacros && (isDrinkCategory(item.category || '') || isSpecialtyDrinkName(item.name || ''));
          })
        : [];

      const rawDrinks = topLevelDrinks.length > 0 ? topLevelDrinks : itemLevelDrinks;

      if (rawDrinks.length === 0) {
        return Response.json({ drinks: [] });
      }

      const mappedDrinks = rawDrinks.map((item, index) => toDrinkItem(item, index));
      const specialtyDrinks = dedupeDrinksByName(
        mappedDrinks.filter((drink) => isSpecialtyDrinkName(drink.name))
      );

      const hasAnyStandardDrinkCandidate = mappedDrinks.some((drink) => !isSpecialtyDrinkName(drink.name));
      const allSmoothieOrShakeMenu = mappedDrinks.every((drink) => isSmoothieOrShakeName(drink.name));
      const includeGenericSizes = hasAnyStandardDrinkCandidate && !allSmoothieOrShakeMenu;

      const drinks = [
        ...(includeGenericSizes ? GENERIC_CHAIN_DRINK_SIZES : []),
        ...specialtyDrinks,
      ];

      return Response.json({ drinks });
    }

    return Response.json({ drinks: [] });
  } catch (err) {
    console.error('[api/drinks]', err);
    return Response.json({ drinks: [] });
  }
}
