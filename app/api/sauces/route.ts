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

function normalizeRestaurantForMatch(name: string): string {
  return (name || '').toLowerCase().trim();
}

/**
 * GET /api/sauces?restaurant=Cheba+Hut
 * Returns sauces for the given restaurant from data/jsons/*_raw.json.
 * Sauces come from: (1) top-level "sauces" array if present, or
 * (2) items where category === "Sauce" with macros.
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
    const jsonFiles = dirEntries.filter(
      (e) => e.isFile() && e.name.endsWith('_raw.json')
    );

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
      const fileRestaurantNorm = normalizeRestaurantForMatch(
        data.restaurant_name || ''
      );
      if (fileRestaurantNorm !== targetNorm) continue;

      // Prefer top-level sauces array; fallback to items with category "Sauce"
      let sauces: SauceItem[] = [];
      if (Array.isArray(data.sauces) && data.sauces.length > 0) {
        sauces = data.sauces.map((s: RawSauceEntry, i: number) => {
          const macros = s.macros || {};
          return {
            id: s.id || `sauce-${i}-${(s.name || '').replace(/\s+/g, '-').toLowerCase()}`,
            name: s.name || 'Sauce',
            macros: {
              calories: Number(macros.calories) || 0,
              protein: Number(macros.protein) || 0,
              carbs: Number(macros.carbs) || 0,
              fat: Number(macros.fat) ?? Number(macros.fats) ?? 0,
            },
          };
        });
      } else if (Array.isArray(data.items)) {
        const sauceItems = data.items.filter(
          (i: RawSauceEntry) =>
            (i.category || '').toLowerCase() === 'sauce' &&
            i.name &&
            (i.macros || i.calories != null)
        );
        sauces = sauceItems.map((s: RawSauceEntry, i: number) => {
          const macros = s.macros || {};
          const cal = Number(macros.calories ?? s.calories) || 0;
          const protein = Number(macros.protein ?? s.protein_g) || 0;
          const carbs = Number(macros.carbs ?? s.carbs_g) || 0;
          const fat =
            Number(macros.fat ?? macros.fats ?? s.fat_g ?? s.fats_g) || 0;
          return {
            id: s.id || `sauce-${i}-${(s.name || '').replace(/\s+/g, '-').toLowerCase()}`,
            name: s.name || 'Sauce',
            macros: { calories: cal, protein, carbs, fat },
          };
        });
      }

      return Response.json({ sauces });
    }

    return Response.json({ sauces: [] });
  } catch (err) {
    console.error('[api/sauces]', err);
    return Response.json({ sauces: [] });
  }
}
