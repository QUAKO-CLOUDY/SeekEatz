/**
 * SeekEatz Ingestion Normalizer
 *
 * Converts raw source data (any format) into a canonical MenuItemRecord
 * ready for upsert into menu_items. Applies:
 *  - Macro validation and clamping
 *  - Category normalization (maps raw categories → normalized_category)
 *  - Meal type inference (breakfast/lunch/dinner/all_day)
 *  - Item type inference (meal/drink/modifier/side/snack)
 *  - Food tag generation
 *  - Confidence scoring based on data completeness
 */

import {
  DISH_TAXONOMY,
} from '@/lib/tagging/taxonomy';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawMenuItem {
  name: string;
  category?: string;
  price_estimate?: number | string;
  image_url?: string;
  macros?: {
    calories?: number | string;
    protein?:  number | string;
    carbs?:    number | string;
    fat?:      number | string;
    fiber?:    number | string;
    sodium?:   number | string;
    sugar?:    number | string;
    cholesterol?: number | string;
    saturated_fat?: number | string;
  };
  description?: string;
  allergens?: string[];
  // Enrichment fields
  fiber_g?:          number;
  sugar_g?:          number;
  sodium_mg?:        number;
  cholesterol_mg?:   number;
  saturated_fat_g?:  number;
}

export interface MenuItemRecord {
  name:                string;
  restaurant_name:     string;
  restaurant_id?:      string;
  category:            string;       // raw category (preserved)
  normalized_category: string;       // canonical category
  macros: {
    calories: number;
    protein:  number;
    carbs:    number;
    fat:      number;
  };
  price_estimate?:     number;
  image_url?:          string;
  description?:        string;
  allergens?:          string[];
  item_type:           string;
  meal_type:           string;
  food_tags:           string[];
  confidence_score:    number;
  is_available:        boolean;
  fiber_g?:            number;
  sugar_g?:            number;
  sodium_mg?:          number;
  cholesterol_mg?:     number;
  saturated_fat_g?:    number;
  source_id?:          string;
}

// ─── Category normalization map ───────────────────────────────────────────────
// Maps raw category strings → normalized_category values
// Keys are lowercase for case-insensitive matching

const RAW_CATEGORY_MAP: Record<string, string> = {
  // Entrees
  'entree': 'entree', 'entrée': 'entree', 'main': 'entree', 'main course': 'entree',
  'dinner': 'entree', 'lunch': 'entree', 'plate': 'entree', 'mains': 'entree',
  'grilled': 'entree', 'flame grilled': 'entree', 'roasted': 'entree',

  // Burgers
  'burger': 'burger', 'burgers': 'burger', 'hamburger': 'burger', 'cheeseburger': 'burger',
  'beef burger': 'burger', 'plant-based burger': 'burger',

  // Sandwiches
  'sandwich': 'sandwich', 'sandwiches': 'sandwich', 'sub': 'sandwich', 'subs': 'sandwich',
  'hoagie': 'sandwich', 'hero': 'sandwich', 'panini': 'sandwich', 'grinder': 'sandwich',

  // Wraps
  'wrap': 'wrap', 'wraps': 'wrap', 'flatbread wrap': 'wrap',

  // Salads
  'salad': 'salad', 'salads': 'salad', 'greens': 'salad', 'chopped salad': 'salad',

  // Bowls
  'bowl': 'bowl', 'bowls': 'bowl', 'grain bowl': 'bowl', 'power bowl': 'bowl',
  'rice bowl': 'bowl', 'protein bowl': 'bowl',

  // Pizza
  'pizza': 'pizza', 'flatbread': 'pizza', 'calzone': 'pizza',

  // Pasta
  'pasta': 'pasta', 'noodles': 'pasta', 'spaghetti': 'pasta', 'fettuccine': 'pasta',
  'linguine': 'pasta', 'rigatoni': 'pasta', 'penne': 'pasta', 'lasagna': 'pasta',

  // Tacos
  'taco': 'taco', 'tacos': 'taco',

  // Burritos
  'burrito': 'burrito', 'burritos': 'burrito',

  // Quesadillas
  'quesadilla': 'quesadilla', 'quesadillas': 'quesadilla', 'dilla': 'quesadilla',

  // Chicken
  'chicken': 'chicken', 'tenders': 'chicken', 'nuggets': 'chicken', 'wings': 'wings',
  'boneless wings': 'wings', 'bone-in wings': 'wings',

  // Seafood
  'seafood': 'seafood', 'fish': 'seafood', 'shrimp': 'seafood', 'lobster': 'seafood',

  // Soup
  'soup': 'soup', 'chowder': 'soup', 'bisque': 'soup', 'chili': 'soup',

  // Appetizers
  'appetizer': 'appetizer', 'appetizers': 'appetizer', 'starter': 'appetizer',
  'starters': 'appetizer', 'shareable': 'appetizer', 'shareables': 'appetizer',
  'small plates': 'appetizer', 'small plate': 'appetizer',

  // Breakfast
  'breakfast': 'breakfast_item', 'breakfast item': 'breakfast_item',
  'brunch': 'breakfast_item', 'morning': 'breakfast_item', 'pancake': 'breakfast_item',
  'waffle': 'breakfast_item', 'omelet': 'breakfast_item', 'egg': 'breakfast_item',

  // Smoothies
  'smoothie': 'smoothie', 'smoothies': 'smoothie', 'juice': 'smoothie',
  'blend': 'smoothie', 'acai bowl': 'smoothie', 'pitaya bowl': 'smoothie',
  'smoothie bowl': 'smoothie',

  // Coffee
  'coffee': 'coffee', 'espresso': 'coffee', 'latte': 'coffee', 'cappuccino': 'coffee',

  // Hot dogs
  'hot dog': 'hot_dog', 'hot dogs': 'hot_dog', 'hotdog': 'hot_dog',

  // Snacks
  'snack': 'snack', 'snacks': 'snack', 'treat': 'snack',

  // Sides
  'side': 'side', 'sides': 'side', 'side dish': 'side', 'side item': 'side',
  'extras': 'side', 'add-on': 'modifier', 'add on': 'modifier',

  // Drinks
  'drink': 'drink', 'drinks': 'drink', 'beverage': 'drink', 'beverages': 'drink',
  'soda': 'drink', 'water': 'drink', 'tea': 'drink', 'lemonade': 'drink',
  'milkshake': 'drink', 'shake': 'drink', 'beer': 'drink', 'wine': 'drink',
  'cocktail': 'drink', 'alcohol': 'drink',

  // Modifiers
  'modifier': 'modifier', 'modifiers': 'modifier', 'sauce': 'modifier',
  'sauces': 'modifier', 'dressing': 'modifier', 'dressings': 'modifier',
  'topping': 'modifier', 'toppings': 'modifier', 'extra': 'modifier',
  'condiment': 'modifier', 'condiments': 'modifier',
};

// ─── Breakfast restaurant list ────────────────────────────────────────────────
// Items from these restaurants default to meal_type='breakfast'

const BREAKFAST_RESTAURANTS = new Set([
  'another broken egg cafe',
  'first watch',
  'the original pancake house',
  'original pancake house',
  'ihop',
  'denny\'s',
  'waffle house',
]);

// ─── Breakfast item name keywords ─────────────────────────────────────────────
const BREAKFAST_KEYWORDS = /\b(pancake|waffle|omelet|omelette|scrambled|hash brown|hashbrown|biscuit|bagel|egg|eggs|benedict|frittata|crepe|granola|oatmeal|french toast|breakfast|morning)\b/i;

// ─── Drink name keywords ──────────────────────────────────────────────────────
const DRINK_KEYWORDS = /\b(smoothie|shake|juice|lemonade|iced tea|coffee|espresso|latte|cappuccino|cold brew|frappuccino|soda|water|beer|wine|cocktail|margarita|mojito|kombucha|sparkling)\b/i;

// ─── Modifier name keywords ───────────────────────────────────────────────────
const MODIFIER_KEYWORDS = /\b(sauce|dressing|topping|addon|add-on|syrup|dip|spread|butter|jam|extra|condiment|seasoning|ranch|vinaigrette|aioli)\b/i;

// ─── Main normalizer ──────────────────────────────────────────────────────────

export function normalizeMenuItem(
  raw: RawMenuItem,
  restaurantName: string,
  restaurantId?: string,
  sourceId?: string
): MenuItemRecord {
  const name = (raw.name || '').trim();
  const rawCategory = (raw.category || '').trim();
  const lowerName = name.toLowerCase();
  const lowerRestaurant = restaurantName.toLowerCase();

  // ── Macros ────────────────────────────────────────────────────────────────
  const macros = normalizeMacros(raw.macros ?? {});

  // ── Normalized category ───────────────────────────────────────────────────
  const normalizedCategory = resolveCategory(rawCategory, lowerName);

  // ── Item type ─────────────────────────────────────────────────────────────
  const itemType = resolveItemType(normalizedCategory, lowerName);

  // ── Meal type ─────────────────────────────────────────────────────────────
  const mealType = resolveMealType(
    normalizedCategory, lowerName, lowerRestaurant, itemType
  );

  // ── Food tags ─────────────────────────────────────────────────────────────
  const foodTags = buildFoodTags(macros, normalizedCategory, lowerName);

  // ── Confidence score ──────────────────────────────────────────────────────
  const confidenceScore = computeConfidence(macros, raw);

  return {
    name,
    restaurant_name:     restaurantName,
    restaurant_id:       restaurantId,
    category:            rawCategory || 'uncategorized',
    normalized_category: normalizedCategory,
    macros,
    price_estimate:      raw.price_estimate !== undefined ? Number(raw.price_estimate) : undefined,
    image_url:           raw.image_url || undefined,
    description:         raw.description || undefined,
    allergens:           raw.allergens,
    item_type:           itemType,
    meal_type:           mealType,
    food_tags:           foodTags,
    confidence_score:    confidenceScore,
    is_available:        true,
    fiber_g:             raw.macros?.fiber !== undefined ? Number(raw.macros.fiber) : raw.fiber_g,
    sugar_g:             raw.macros?.sugar !== undefined ? Number(raw.macros.sugar) : raw.sugar_g,
    sodium_mg:           raw.macros?.sodium !== undefined ? Number(raw.macros.sodium) : raw.sodium_mg,
    cholesterol_mg:      raw.macros?.cholesterol !== undefined ? Number(raw.macros.cholesterol) : raw.cholesterol_mg,
    saturated_fat_g:     raw.macros?.saturated_fat !== undefined ? Number(raw.macros.saturated_fat) : raw.saturated_fat_g,
    source_id:           sourceId,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type MacroRecord = {
  calories?: number | string;
  protein?: number | string;
  carbs?: number | string;
  fat?: number | string;
};

function normalizeMacros(raw: MacroRecord): { calories: number; protein: number; carbs: number; fat: number } {
  const cal = clampMacro(raw.calories, 0, 10000);
  const pro = clampMacro(raw.protein,  0, 500);
  const carb = clampMacro(raw.carbs,   0, 500);
  const fat  = clampMacro(raw.fat,     0, 500);
  return { calories: cal, protein: pro, carbs: carb, fat };
}

function clampMacro(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (isNaN(n) || !isFinite(n)) return 0;
  return Math.max(min, Math.min(max, Math.round(n * 10) / 10));
}

function resolveCategory(rawCategory: string, lowerName: string): string {
  // Try direct lookup in raw category map
  const lower = rawCategory.toLowerCase().trim();
  if (lower && RAW_CATEGORY_MAP[lower]) return RAW_CATEGORY_MAP[lower];

  // Try partial match (first word)
  const firstWord = lower.split(/\s+/)[0];
  if (firstWord && RAW_CATEGORY_MAP[firstWord]) return RAW_CATEGORY_MAP[firstWord];

  // Try dish taxonomy keyword match on item name
  for (const [, { keywords, normalized }] of Object.entries(DISH_TAXONOMY)) {
    for (const kw of keywords) {
      if (lowerName.includes(kw)) return normalized;
    }
  }

  // Default: entree for all else
  return 'entree';
}

function resolveItemType(normalizedCategory: string, lowerName: string): string {
  if (['modifier'].includes(normalizedCategory)) return 'modifier';
  if (['side'].includes(normalizedCategory))     return 'side';
  if (['snack'].includes(normalizedCategory))    return 'snack';
  if (['drink', 'coffee', 'smoothie'].includes(normalizedCategory)) return 'drink';
  if (MODIFIER_KEYWORDS.test(lowerName)) return 'modifier';
  if (DRINK_KEYWORDS.test(lowerName))   return 'drink';
  return 'meal';
}

function resolveMealType(
  normalizedCategory: string,
  lowerName: string,
  lowerRestaurant: string,
  itemType: string
): string {
  if (itemType === 'drink')    return 'drink';
  if (itemType === 'modifier') return 'all_day';
  if (itemType === 'side')     return 'all_day';

  // Breakfast restaurant → default breakfast
  if (BREAKFAST_RESTAURANTS.has(lowerRestaurant)) return 'breakfast';

  // Breakfast category or name keywords
  if (normalizedCategory === 'breakfast_item') return 'breakfast';
  if (BREAKFAST_KEYWORDS.test(lowerName))       return 'breakfast';

  // Pasta/seafood in fine dining context → dinner
  if (['pasta', 'seafood'].includes(normalizedCategory)) return 'dinner';

  return 'all_day';
}

function buildFoodTags(
  macros: { calories: number; protein: number; carbs: number; fat: number },
  normalizedCategory: string,
  lowerName: string
): string[] {
  const tags: string[] = [];

  if (macros.calories >= 5000) {
    tags.push('catering', 'multi_serving');
  } else if (macros.calories >= 2500) {
    tags.push('sharing_platter', 'large_portion');
  } else if (macros.calories >= 1500) {
    tags.push('large_portion');
  }

  // Multi-serving name detection
  if (/\bfor\s+[2-9][0-9]?\b/i.test(lowerName)) {
    if (!tags.includes('sharing_platter')) tags.push('sharing_platter', 'multi_serving');
  }

  return tags;
}

function computeConfidence(
  macros: { calories: number; protein: number; carbs: number; fat: number },
  raw: RawMenuItem
): number {
  let score = 0.80; // base

  // Macro completeness
  const macroCheck = macros.calories > 0 && macros.protein >= 0 &&
    macros.carbs >= 0 && macros.fat >= 0;
  if (!macroCheck) score -= 0.20;

  // Calorie sanity: calories ≈ protein*4 + carbs*4 + fat*9 (within 20%)
  if (macros.calories > 0) {
    const expected = macros.protein * 4 + macros.carbs * 4 + macros.fat * 9;
    const ratio = Math.abs(macros.calories - expected) / macros.calories;
    if (ratio > 0.30) score -= 0.15;  // large discrepancy
    if (ratio > 0.60) score -= 0.20;  // severe discrepancy (data error)
  }

  // Enrichment bonus
  if (raw.macros?.fiber !== undefined)         score += 0.03;
  if (raw.macros?.sodium !== undefined)        score += 0.03;
  if (raw.description)                         score += 0.02;

  // Outlier flags
  if (macros.protein > 200 && macros.calories < 3000) score -= 0.40; // impossible ratio
  if (macros.calories > 5000)                          score -= 0.20; // multi-serving

  return Math.max(0.10, Math.min(1.00, Math.round(score * 100) / 100));
}
