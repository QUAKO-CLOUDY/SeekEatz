import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

type Macros = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type SideOption = {
  id: string;
  name: string;
  macros: Macros;
};

type SideGroup = {
  id: 'base_side_choice' | 'protein_add_on' | 'extra_sides';
  label: string;
  required: boolean;
  multi: boolean;
  defaultOptionId?: string;
  maxSelections?: number;
  options: SideOption[];
};

type SideCustomizationResponse = {
  enabled: boolean;
  reason?: string;
  template?: string;
  groups?: SideGroup[];
};

type RawItem = {
  name?: string;
  category?: string;
  macros?: {
    calories?: number | string | null;
    protein?: number | string | null;
    carbs?: number | string | null;
    fat?: number | string | null;
    fats?: number | string | null;
  } | null;
};

type RawSource = {
  restaurant_name?: string;
  items?: RawItem[];
};

const WABA_FILE = path.join(process.cwd(), 'data', 'jsons', 'wabagrill_raw.json');
const WABA_NAMES = new Set(['waba grill', 'wa ba grill', 'waba']);
const ELIGIBLE_CATEGORIES = new Set(['BOWLS', 'PLATES']);

function norm(value: string): string {
  return (value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}


function canonicalMealName(value: string): string {
  return norm(value)
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9&\s]/g, ' ')
    .replace(/\b(veggie\s+bowl|mini\s+bowl|bowl|bowls|plate|plates)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTokenSet(value: string): Set<string> {
  return new Set(
    canonicalMealName(value)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  );
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / Math.max(a.size, b.size);
}

function isMealNameMatch(left: string, right: string): boolean {
  const a = canonicalMealName(left);
  const b = canonicalMealName(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return overlapRatio(toTokenSet(a), toTokenSet(b)) >= 0.7;
}
function macrosFromItem(item: RawItem): Macros {
  const raw = item.macros || {};
  return {
    calories: Number(raw.calories) || 0,
    protein: Number(raw.protein) || 0,
    carbs: Number(raw.carbs) || 0,
    fat: Number(raw.fat ?? raw.fats) || 0,
  };
}

function toOption(item: RawItem, fallbackId: string): SideOption {
  return {
    id: fallbackId,
    name: (item.name || '').trim() || fallbackId,
    macros: macrosFromItem(item),
  };
}

function distanceScore(item: RawItem, target: { calories?: number; protein?: number; carbs?: number; fat?: number }) {
  const m = macrosFromItem(item);
  const cal = Math.abs((target.calories ?? m.calories) - m.calories);
  const protein = Math.abs((target.protein ?? m.protein) - m.protein);
  const carbs = Math.abs((target.carbs ?? m.carbs) - m.carbs);
  const fat = Math.abs((target.fat ?? m.fat) - m.fat);
  return cal + protein * 8 + carbs * 4 + fat * 7;
}

function pickBestEligibleMeal(
  items: RawItem[],
  mealName: string,
  targetMacros: { calories?: number; protein?: number; carbs?: number; fat?: number }
): RawItem | null {
  const nameNorm = norm(mealName);
  const candidates = items.filter((item) => {
    const category = (item.category || '').trim().toUpperCase();
    if (!ELIGIBLE_CATEGORIES.has(category)) return false;
    return norm(item.name || '') === nameNorm;
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  return candidates
    .slice()
    .sort((a, b) => distanceScore(a, targetMacros) - distanceScore(b, targetMacros))[0];
}

function isProteinSide(name: string): boolean {
  const value = norm(name);
  return (
    value.includes('side | chicken') ||
    value.includes('side | white meat chicken') ||
    value.includes('side | sweet & spicy chicken') ||
    value.includes('side | steak') ||
    value.includes('side | salmon') ||
    value.includes('side | shrimp') ||
    value.includes('side | tofu')
  );
}

function isBaseSide(name: string): boolean {
  const value = norm(name);
  return (
    value.includes('white rice') ||
    value.includes('brown rice') ||
    value.includes('salad') ||
    value.includes('steamed veggies') ||
    value.includes('pork veggie dumplings')
  );
}

function isExtraSide(name: string): boolean {
  const value = norm(name);
  if (!value.startsWith('side | ')) return false;
  return !isProteinSide(name) && !isBaseSide(name);
}

function dedupeByName(options: SideOption[]): SideOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = norm(option.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(req: NextRequest) {
  try {
    const restaurant = req.nextUrl.searchParams.get('restaurant') || '';
    const mealName = req.nextUrl.searchParams.get('mealName') || '';
    const calories = Number(req.nextUrl.searchParams.get('calories') || '');
    const protein = Number(req.nextUrl.searchParams.get('protein') || '');
    const carbs = Number(req.nextUrl.searchParams.get('carbs') || '');
    const fat = Number(req.nextUrl.searchParams.get('fat') || req.nextUrl.searchParams.get('fats') || '');

    if (!restaurant.trim() || !mealName.trim()) {
      return Response.json({
        enabled: false,
        reason: 'Missing restaurant or meal name.',
      });
    }

    const restaurantNorm = norm(restaurant);
    const isWaba = [...WABA_NAMES].some((name) => restaurantNorm === name || restaurantNorm.includes(name) || name.includes(restaurantNorm));
    if (!isWaba) {
      return Response.json({
        enabled: false,
        reason: 'Sides customization is not available for this restaurant yet.',
      });
    }

    let raw: RawSource;
    try {
      raw = JSON.parse(fs.readFileSync(WABA_FILE, 'utf-8')) as RawSource;
    } catch {
      return Response.json({
        enabled: false,
        reason: 'Sides data is unavailable.',
      });
    }

    const items = Array.isArray(raw.items) ? raw.items : [];
    const baseMeal = pickBestEligibleMeal(items, mealName, {
      calories: Number.isFinite(calories) ? calories : undefined,
      protein: Number.isFinite(protein) ? protein : undefined,
      carbs: Number.isFinite(carbs) ? carbs : undefined,
      fat: Number.isFinite(fat) ? fat : undefined,
    });

    if (!baseMeal) {
      return Response.json({
        enabled: false,
        reason: 'Meal is not eligible for sides customization.',
      });
    }

    const mealCategory = (baseMeal.category || '').trim().toUpperCase();
    if (!ELIGIBLE_CATEGORIES.has(mealCategory)) {
      return Response.json({
        enabled: false,
        reason: 'Only Waba bowls and plates are eligible right now.',
      });
    }

    const sideItems = items.filter((item) => (item.category || '').trim().toUpperCase() === 'SIDES');
    if (sideItems.length === 0) {
      return Response.json({
        enabled: false,
        reason: 'No side options found.',
      });
    }

    const baseOptions = dedupeByName(
      sideItems
        .filter((item) => isBaseSide(item.name || ''))
        .map((item, idx) => toOption(item, `base-${idx}`))
    );
    const proteinOptions = dedupeByName(
      sideItems
        .filter((item) => isProteinSide(item.name || ''))
        .map((item, idx) => toOption(item, `protein-${idx}`))
    );
    const extraSideOptions = dedupeByName(
      sideItems
        .filter((item) => isExtraSide(item.name || ''))
        .map((item, idx) => toOption(item, `extra-${idx}`))
    );

    const defaultBase =
      baseOptions.find((opt) => norm(opt.name).includes('white rice')) || baseOptions[0];

    if (!defaultBase || baseOptions.length === 0) {
      return Response.json({
        enabled: false,
        reason: 'Base side defaults are incomplete.',
      });
    }

    const groups = [
      {
        id: 'base_side_choice',
        label: 'Base side',
        required: true,
        multi: false,
        defaultOptionId: defaultBase.id,
        options: baseOptions,
      },
      {
        id: 'protein_add_on',
        label: 'Protein add-on',
        required: false,
        multi: true,
        maxSelections: 2,
        options: proteinOptions,
      },
      {
        id: 'extra_sides',
        label: 'Extra sides',
        required: false,
        multi: true,
        maxSelections: 3,
        options: extraSideOptions,
      },
    ].filter((group) => group.options.length > 0) as SideGroup[];

    if (groups.length === 0) {
      return Response.json({
        enabled: false,
        reason: 'No valid side groups are available.',
      });
    }

    return Response.json({
      enabled: true,
      template: 'waba_plate_bowl_v1',
      groups,
    });
  } catch (error) {
    console.error('[api/sides] failed', error);
    return Response.json({
      enabled: false,
      reason: 'Unable to load side customizations.',
    });
  }
}



