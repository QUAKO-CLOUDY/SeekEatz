import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

type SauceMacros = { calories: number; protein: number; carbs: number; fat: number };
export type SauceItem = { id: string; name: string; macros: SauceMacros };
type RawSauceMacros = Partial<Record<keyof SauceMacros | 'fats', number | string | null | undefined>>;
type RawSauceEntry = {
  id?: string;
  name?: string;
  macros?: RawSauceMacros | null;
  category?: string;
  calories?: number | string | null;
  protein_g?: number | string | null;
  carbs_g?: number | string | null;
  fat_g?: number | string | null;
  fats_g?: number | string | null;
};
type SauceSourceFile = {
  restaurant_name?: string;
  sauces?: RawSauceEntry[];
  items?: RawSauceEntry[];
};

const MAX_SAUCE_CALORIES = 500;
const SAUCE_LIKE_TOKEN_PATTERN = /\b(sauce|dressing|vinaigrette|aioli|mayo|mayonnaise|mustard|salsa|dip|shoyu|soy|teriyaki|adobo|tzatziki|crema|pesto)\b/;

function normalizeRestaurantForMatch(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function normalizeSauceName(name: string): string {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function toSauceItem(entry: RawSauceEntry, index: number): SauceItem {
  const macros = entry.macros || {};
  const cal = Number(macros.calories ?? entry.calories) || 0;
  const protein = Number(macros.protein ?? entry.protein_g) || 0;
  const carbs = Number(macros.carbs ?? entry.carbs_g) || 0;
  const fat = Number(macros.fat ?? macros.fats ?? entry.fat_g ?? entry.fats_g) || 0;
  const name = (entry.name || 'Sauce').trim() || 'Sauce';

  return {
    id: entry.id || `sauce-${index}-${name.replace(/\s+/g, '-').toLowerCase()}`,
    name,
    macros: { calories: cal, protein, carbs, fat },
  };
}

function isAllowedSauceCategory(category: string): boolean {
  const normalized = (category || '').toLowerCase().trim();
  return SAUCE_LIKE_TOKEN_PATTERN.test(normalized);
}

function isAllowedSauceName(name: string): boolean {
  const normalized = normalizeSauceName(name);
  return SAUCE_LIKE_TOKEN_PATTERN.test(normalized);
}

function isMealLikeName(name: string): boolean {
  const normalized = normalizeSauceName(name);

  // Hard reject common entree patterns so meal items cannot leak into sauce lists.
  if (/\b(salad\s+(with|without)|sandwich|burger|cheeseburger|hamburger|pizza|bowl|plate|entree|combo|wrap|taco|meal|things?|platter|box)\b/.test(normalized)) {
    return true;
  }

  if (/\bno\s+(sauce|dressing)\b/.test(normalized) || /\bw\/o\s+dressing\b/.test(normalized)) {
    return true;
  }

  // Reject protein entree names whether or not "sauce" appears in the text.
  if (/\b(chicken\s+fingerz?|chicken\s+fingers?|fingers?|tenders?|nuggets?|boneless\s+wings?|traditional\s+wings?|wings?|kebabs?|kebobs?|skewers?)\b/.test(normalized) || /\badd\s+protein\b/.test(normalized)) {
    return true;
  }

  // Extra protection for quantity-style menu item names like "(5)".
  if (/\(\s*\d+\s*\)/.test(normalized) && /\b(chicken|wings?|fingerz?|fingers?|tenders?)\b/.test(normalized)) {
    return true;
  }

  return false;
}

function isStrictSauceEntry(entry: RawSauceEntry): boolean {
  const name = (entry.name || '').trim();
  if (!name) return false;

  const sauceLike = isAllowedSauceCategory(entry.category || '') || isAllowedSauceName(name);
  if (!sauceLike) return false;
  if (isMealLikeName(name)) return false;

  const macros = entry.macros || {};
  const calories = Number(macros.calories ?? entry.calories) || 0;
  if (calories > MAX_SAUCE_CALORIES) return false;

  return Boolean(entry.macros || entry.calories != null);
}

function dedupeSaucesByName(items: SauceItem[]): SauceItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeSauceName(item.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * GET /api/sauces?restaurant=Cheba+Hut
 * Strict sauce source:
 * 1) top-level sauces[] entries that are explicitly sauce/dressing and <= 500 cal
 * 2) items[] entries with sauce/dressing category/name and <= 500 cal
 */
export async function GET(req: NextRequest) {
  try {
    const restaurant = req.nextUrl.searchParams.get('restaurant');
    if (!restaurant || !restaurant.trim()) {
      return Response.json({ sauces: [] });
    }

    const dataDir = path.join(process.cwd(), 'data', 'jsons');
    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(dataDir, { withFileTypes: true });
    } catch {
      return Response.json({ sauces: [] });
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

      let data: SauceSourceFile;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }

      const fileRestaurantNorm = normalizeRestaurantForMatch(data.restaurant_name || '');
      if (!fileRestaurantNorm || fileRestaurantNorm !== targetNorm) continue;

      let sauceEntries: RawSauceEntry[] = [];
      if (Array.isArray(data.sauces) && data.sauces.length > 0) {
        sauceEntries = data.sauces.filter(isStrictSauceEntry);
      } else if (Array.isArray(data.items)) {
        sauceEntries = data.items.filter(isStrictSauceEntry);
      }

      const sauces = dedupeSaucesByName(
        sauceEntries
          .map((entry, i) => toSauceItem(entry, i))
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      return Response.json({ sauces });
    }

    return Response.json({ sauces: [] });
  } catch (err) {
    console.error('[api/sauces]', err);
    return Response.json({ sauces: [] });
  }
}






