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

const GENERIC_SODA_PRODUCTS = [
  'Coca-Cola',
  'Sprite',
  'Fanta Orange',
  'Pepsi',
  'Mountain Dew',
  'Starry',
  'Dr Pepper',
  'Lemonade',
  'Root Beer',
] as const;

const GENERIC_SODA_SIZES: Array<{ label: string; calories: number; carbs: number }> = [
  { label: '12 oz', calories: 140, carbs: 39 },
  { label: '16 oz', calories: 190, carbs: 52 },
  { label: '20 oz', calories: 240, carbs: 65 },
];

const GENERIC_CHAIN_SODA_FALLBACK: DrinkItem[] = GENERIC_SODA_PRODUCTS.flatMap((product) =>
  GENERIC_SODA_SIZES.map((size) => ({
    id: `generic-${product.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${size.label.replace(/\s+/g, '').toLowerCase()}`,
    name: `${product} (${size.label})`,
    macros: {
      calories: size.calories,
      protein: 0,
      carbs: size.carbs,
      fat: 0,
    },
  }))
);

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

function isFoodLikeName(name: string): boolean {
  const normalized = normalizeDrinkNameForMatch(name);
  if (!normalized) return false;
  return /\b(cake|toast|pancake|waffle|sandwich|burger|pizza|pasta|salad|bowl|burrito|taco|omelet|omelette|bagel|biscuit|croissant|muffin|entree|appetizer|board)\b/.test(normalized);
}

function isLikelyDrinkName(name: string): boolean {
  const normalized = normalizeDrinkNameForMatch(name);
  if (!normalized) return false;

  // Guardrail: avoid misclassifying food items that include beverage words
  // (e.g., "banana coffee cake") as drinks.
  if (isFoodLikeName(normalized)) {
    return false;
  }

  return /\b(drink|drinks|beverage|beverages|soda|sodas|coke|coca-cola|pepsi|sprite|fanta|mountain dew|starry|dr pepper|root beer|lemonade|tea|coffee|latte|espresso|smoothie|shake|juice|water)\b/.test(normalized);
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
 * 1. Generic non-diet Coke/Pepsi-family sodas (12/16/20 oz) for standard drink menus.
 * 2. Restaurant-specific drinks from the database when available.
 * 3. Generic sodas are always included; database drinks are appended when found.
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
      return Response.json({ drinks: GENERIC_CHAIN_SODA_FALLBACK });
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

      const topLevelDrinks = Array.isArray(data.drinks)
        ? data.drinks.filter((item) => {
            const hasName = Boolean(item.name && item.name.trim());
            const hasMacros = Boolean(item.macros || item.calories != null);
            if (!hasName || !hasMacros) return false;
            if (isFoodLikeName(item.name || '')) return false;
            return (
              isDrinkCategory(item.category || '') ||
              isLikelyDrinkName(item.name || '') ||
              isSpecialtyDrinkName(item.name || '')
            );
          })
        : [];
      const itemLevelDrinks = Array.isArray(data.items)
        ? data.items.filter((item) => {
            const hasName = Boolean(item.name && item.name.trim());
            const hasMacros = Boolean(item.macros || item.calories != null);
            if (!hasName || !hasMacros) return false;
            if (isFoodLikeName(item.name || '')) return false;
            return (
              isDrinkCategory(item.category || '') ||
              isLikelyDrinkName(item.name || '') ||
              isSpecialtyDrinkName(item.name || '')
            );
          })
        : [];

      const rawDrinks = [...topLevelDrinks, ...itemLevelDrinks];

      if (rawDrinks.length === 0) {
        return Response.json({ drinks: GENERIC_CHAIN_SODA_FALLBACK });
      }

      const restaurantSpecificDrinks = dedupeDrinksByName(
        rawDrinks.map((item, index) => toDrinkItem(item, index))
      );
      const genericSodas = dedupeDrinksByName(GENERIC_CHAIN_SODA_FALLBACK);

      const drinks = [
        ...genericSodas,
        ...restaurantSpecificDrinks,
      ];

      return Response.json({ drinks });
    }

    return Response.json({ drinks: GENERIC_CHAIN_SODA_FALLBACK });
  } catch (err) {
    console.error('[api/drinks]', err);
    return Response.json({ drinks: GENERIC_CHAIN_SODA_FALLBACK });
  }
}
