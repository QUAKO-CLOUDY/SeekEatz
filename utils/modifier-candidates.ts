/**
 * Modifier Candidates Fetcher
 * Fetches single-ingredient (modifier) rows from menu_items for a specific restaurant
 */

import { normalizeMacros, type Macros } from '@/lib/macro-utils';

export type ModifierCandidate = {
  id: string;
  name: string;
  category: string;
  macros: Macros;
};

export type MealModifierContext =
  | 'sweet_breakfast'
  | 'savory_breakfast'
  | 'sandwich'
  | 'salad'
  | 'generic';

const PREFERRED_CATEGORY_KEYWORDS = [
  'modifier',
  'ingredient',
  'add',
  'topping',
  'protein',
  'side',
  'sauce',
  'extra',
  'add-on',
  'addon',
  'dressing',
  'condiment',
];

const NON_MODIFIER_ITEM_NAME_PATTERN =
  /\b(soup|salad|sandwich|wrap|burger|burrito|quesadilla|pancake|waffle|omelet|omelette|french toast|smoothie|oatmeal|club|benedict|pizza|pasta|chips?|fries|potatoes?|hash browns?|avocado toast)\b/i;

const PROTEIN_LIKE_NAME_PATTERN =
  /\b(bacon|sausage|ham|turkey|chicken|steak|egg|eggs|patty|links?|canadian bacon|chorizo|corned beef|protein)\b/i;

const SWEET_BREAKFAST_PATTERN =
  /\b(pancake|pancakes|waffle|waffles|french toast|crepe|crepes)\b/i;

const SAVORY_BREAKFAST_PATTERN =
  /\b(omelet|omelette|benedict|scrambl(?:e|ed)|egg|eggs|breakfast|platter|traditional favorites?)\b/i;

const SANDWICH_PATTERN =
  /\b(sandwich|club|melt|reuben|blt|burger|sub|hoagie|hero|grinder)\b/i;

const SALAD_PATTERN = /\b(salad|caesar|cobb)\b/i;

function categoryIncludes(category: string, value: string): boolean {
  return category.toLowerCase().includes(value.toLowerCase());
}

export function inferMealModifierContext(mealName: string): MealModifierContext {
  if (!mealName) {
    return 'generic';
  }

  if (SWEET_BREAKFAST_PATTERN.test(mealName)) {
    return 'sweet_breakfast';
  }

  if (SAVORY_BREAKFAST_PATTERN.test(mealName)) {
    return 'savory_breakfast';
  }

  if (SANDWICH_PATTERN.test(mealName)) {
    return 'sandwich';
  }

  if (SALAD_PATTERN.test(mealName)) {
    return 'salad';
  }

  return 'generic';
}

export function filterModifierCandidatesForMeal(
  mealName: string,
  candidates: ModifierCandidate[]
): ModifierCandidate[] {
  if (!mealName || candidates.length === 0) {
    return candidates;
  }

  const context = inferMealModifierContext(mealName);

  return candidates.filter((candidate) => {
    const candidateName = candidate.name || '';
    const category = candidate.category || '';
    const lowerCategory = category.toLowerCase();
    const isProteinLike = PROTEIN_LIKE_NAME_PATTERN.test(candidateName);
    const isRangeAddOn = categoryIncludes(category, 'range-add-ons');
    const isSideMeat = categoryIncludes(category, 'sides meats');
    const isDressing = categoryIncludes(category, 'dressing');
    const isSandwichSide = categoryIncludes(category, 'sandwich sides');
    const isOtherCategory = lowerCategory === 'other';
    const isNonModifierSide = NON_MODIFIER_ITEM_NAME_PATTERN.test(candidateName);

    switch (context) {
      case 'sweet_breakfast':
        if (isDressing || isSandwichSide) {
          return false;
        }

        if (isRangeAddOn || isSideMeat) {
          return true;
        }

        return isOtherCategory && /(^|\b)\d+\s+eggs?\b/i.test(candidateName);

      case 'savory_breakfast':
        if (isDressing || isSandwichSide) {
          return false;
        }

        if (isSideMeat) {
          return true;
        }

        return isOtherCategory && isProteinLike && !isNonModifierSide;

      case 'sandwich':
        if (isSandwichSide && isNonModifierSide) {
          return false;
        }

        return isRangeAddOn || isSideMeat || (isDressing && !isNonModifierSide);

      case 'salad':
        if (isSandwichSide && isNonModifierSide) {
          return false;
        }

        return isRangeAddOn || isSideMeat || isDressing;

      default:
        if (isSandwichSide && isNonModifierSide) {
          return false;
        }

        return true;
    }
  });
}

/**
 * Fetches modifier candidates from menu_items for a specific restaurant
 * Returns array of items likely to be single-ingredient add-ons/modifiers
 * 
 * Rules:
 * - Same restaurant only
 * - Must have macros object and calories in reasonable modifier range (0 < calories <= 400)
 * - Exclude "full meals" heuristically:
 *   - if calories >= 450 AND protein/carbs/fats all non-trivial -> treat as meal, exclude
 * - Prefer category keywords if available:
 *   category ILIKE any of: '%modifier%', '%ingredient%', '%add%', '%topping%', '%protein%', '%side%', '%sauce%', '%extra%'
 */
export async function getModifierCandidates(
  supabase: any,
  restaurant_name: string
): Promise<ModifierCandidate[]> {
  if (!restaurant_name || !supabase) {
    return [];
  }

  try {
    // Fetch all items from the restaurant
    const { data: items, error } = await supabase
      .from('menu_items')
      .select('id, restaurant_name, name, category, macros')
      .eq('restaurant_name', restaurant_name);

    if (error) {
      console.error('[modifierCandidates] Error fetching items:', error);
      return [];
    }

    if (!items || items.length === 0) {
      return [];
    }

    // Filter to modifier candidates
    const candidates: ModifierCandidate[] = [];

    for (const item of items) {
      // Must have macros
      if (!item.macros || typeof item.macros !== 'object') {
        continue;
      }

      // Normalize macros
      const normalizedMacros = normalizeMacros(item.macros);
      if (!normalizedMacros) {
        continue;
      }

      // Calories must be in modifier range (0 < calories <= 400)
      if (normalizedMacros.calories <= 0 || normalizedMacros.calories > 400) {
        continue;
      }

      // Exclude "full meals" heuristically:
      // If calories >= 450 AND protein/carbs/fats all non-trivial -> treat as meal, exclude
      // Actually, we already filtered calories <= 400, so this check is redundant but kept for clarity
      if (normalizedMacros.calories >= 450) {
        const hasNonTrivialMacros = 
          normalizedMacros.protein >= 15 ||
          normalizedMacros.carbs >= 20 ||
          normalizedMacros.fats >= 10;
        
        if (hasNonTrivialMacros) {
          continue; // Likely a meal, not a modifier
        }
      }

      // Prefer category keywords (but don't require them - some modifiers may not have category set)
      const category = (item.category || '').toLowerCase();
      const hasPreferredCategory = PREFERRED_CATEGORY_KEYWORDS.some(keyword =>
        category.includes(keyword)
      );

      // Side categories often contain entire small dishes (e.g. soup, side salad).
      // Keep side proteins/condiments, but reject standalone meal rows masquerading as modifiers.
      if (category.includes('side') && NON_MODIFIER_ITEM_NAME_PATTERN.test(item.name || '')) {
        continue;
      }

      if (!hasPreferredCategory && NON_MODIFIER_ITEM_NAME_PATTERN.test(item.name || '')) {
        continue;
      }

      // Include item if:
      // 1. Has preferred category keyword, OR
      // 2. Calories are low enough to be a modifier (already checked above)
      // Additional heuristic: if calories < 200, more likely to be a modifier
      const isLikelyModifier = hasPreferredCategory || normalizedMacros.calories < 200;

      if (isLikelyModifier) {
        candidates.push({
          id: item.id,
          name: item.name || 'Unknown',
          category: item.category || '',
          macros: normalizedMacros,
        });
      }
    }

    // Log in dev
    if (process.env.NODE_ENV === 'development') {
      console.log(`[modifierCandidates] Found ${candidates.length} modifier candidates for ${restaurant_name}`);
    }

    return candidates;
  } catch (error) {
    console.error('[modifierCandidates] Exception fetching candidates:', error);
    return [];
  }
}
