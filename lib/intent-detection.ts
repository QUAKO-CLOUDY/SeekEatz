/**
 * Intent Detection Utilities
 * Deterministic functions to detect explicit restaurant constraints and macro filters from user messages
 */

import { extractMacroConstraintsFromText, hasConstraints } from '@/lib/extractMacroConstraintsFromText';
import { normalizeSearchText } from '@/lib/query-normalization';

/**
 * Cleans up a restaurant query extracted by greedy regex
 * Trims trailing punctuation and common non-restaurant trailing words
 */
function cleanRestaurantQuery(raw: string): string {
  let cleaned = raw.trim().replace(/[,.!?]+$/, '');
  // Remove common trailing phrases that aren't part of a restaurant name
  const trailingWords = [
    /\s+(with|for|that|which|where|when|please|thanks|thx|pls)(\s.*)?$/i,
    /\s+(under|over|below|above|less|more|around|about|at\s+least|at\s+most)(\s.*)?$/i,
    /\s+(\d+\s*(g|grams?|calories?|cal|kcal|carbs?|protein|fat|fats))(\s.*)?$/i,
  ];
  for (const pattern of trailingWords) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned.trim();
}

/**
 * Detects if the user explicitly requested a restaurant constraint
 * Returns an object with hasRestaurant boolean and optional restaurantQuery string
 */
export function detectExplicitRestaurantConstraint(message: string): {
  hasRestaurant: boolean;
  restaurantQuery?: string;
} {
  if (!message || typeof message !== 'string') {
    return { hasRestaurant: false };
  }

  const trimmed = normalizeSearchText(message).text.trim();
  // Generic cuisine/restaurant type words that should NOT be treated as specific restaurants
  const genericRestaurantTypes = [
    'steakhouse', 'restaurant', 'diner', 'cafe', 'cafeteria', 'bistro', 'pizzeria',
    'bakery', 'grill', 'bar', 'pub', 'tavern', 'eatery', 'joint', 'spot', 'chain',
    'place', 'shop', 'stand', 'counter', 'drive-thru', 'drive thru',
    'fast food', 'fast-food', 'food court',
    // Cuisine types used generically
    'italian', 'mexican', 'chinese', 'japanese', 'asian', 'indian', 'thai',
    'greek', 'korean', 'vietnamese', 'french', 'mediterranean', 'american',
    'southern', 'cajun', 'bbq', 'barbecue', 'seafood', 'sushi',
    'burger', 'pizza', 'taco', 'sandwich', 'salad', 'noodle', 'ramen',
  ];

  /**
   * Checks if an extracted restaurant name is actually a generic descriptor
   * Strips leading articles (a/an/the) and checks against genericRestaurantTypes
   */
  function isGenericRestaurantType(name: string): boolean {
    // Strip leading articles
    let cleaned = name.toLowerCase().trim().replace(/^(a|an|the)\s+/i, '').trim();
    // Strip trailing descriptor words (restaurant, place, spot, etc.)
    cleaned = cleaned.replace(/\s+(restaurant|place|spot|joint|shop|chain|diner|grill|bar|eatery)$/i, '').trim();
    // Also strip everything after common context words (if, with, for, and, but, that, when, where, which)
    cleaned = cleaned.replace(/\s+(if|with|for|that|when|where|which|near|around)\b.*$/i, '').trim();
    // Check if what remains is a generic type (exact match on cleaned string)
    return genericRestaurantTypes.some(generic => {
      const escapedGeneric = generic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^${escapedGeneric}$`, 'i').test(cleaned);
    });
  }

  // Pattern 1: "from X" - matches "from <restaurant>" anywhere in the message
  // Greedy match to end of string, then trim common trailing words
  const pattern1 = /\bfrom\s+([a-z0-9&' .\-]+)/i;
  const match1 = trimmed.match(pattern1);
  if (match1 && match1[1]) {
    const restaurantQuery = cleanRestaurantQuery(match1[1]);
    if (restaurantQuery.length > 0 && !isGenericRestaurantType(restaurantQuery)) {
      return { hasRestaurant: true, restaurantQuery };
    }
  }

  // Pattern 2: "at X" - matches "at <restaurant>" anywhere in the message
  // Greedy match to end of string, then trim common trailing words
  // GUARD: Must not match common macro/nutritional phrases like "at least", "at most"
  const forbiddenAfterAt = [
    'least', 'most', 'around', 'about', 'approximately', 'roughly',
    'under', 'over', 'above', 'below', 'home', 'work', 'school',
  ];
  const pattern2 = /\bat\s+([a-z0-9&' .\-]+)/i;
  const match2 = trimmed.match(pattern2);
  if (match2 && match2[1]) {
    const restaurantQuery = cleanRestaurantQuery(match2[1]);
    const firstWord = restaurantQuery.toLowerCase().split(/\s+/)[0];
    if (restaurantQuery.length > 0 && !forbiddenAfterAt.includes(firstWord) && !isGenericRestaurantType(restaurantQuery)) {
      return { hasRestaurant: true, restaurantQuery };
    }
  }

  // Pattern 3: "X menu" (only if "menu" present)
  const pattern3 = /\b([a-z0-9&' .-]{2,})\s+menu\b/i;
  const match3 = trimmed.match(pattern3);
  if (match3 && match3[1]) {
    const restaurantQuery = match3[1].trim().replace(/[,\.!?]+$/, '');
    if (restaurantQuery.length > 0 && !isGenericRestaurantType(restaurantQuery)) {
      return { hasRestaurant: true, restaurantQuery };
    }
  }

  // Pattern 4: "menu of X"
  const pattern4 = /\bmenu\s+of\s+([a-z0-9&' .-]+?)(?:\s|$|,|\.|!|\?)/i;
  const match4 = trimmed.match(pattern4);
  if (match4 && match4[1]) {
    const restaurantQuery = match4[1].trim().replace(/[,\.!?]+$/, '');
    if (restaurantQuery.length > 0 && !isGenericRestaurantType(restaurantQuery)) {
      return { hasRestaurant: true, restaurantQuery };
    }
  }

  return { hasRestaurant: false };
}

/**
 * Detects macro constraints from message
 * Returns an object with hasMacroConstraints boolean and optional macro values
 */
export function detectMacroConstraints(message: string): {
  hasMacroConstraints: boolean;
  proteinMin?: number;
  proteinMax?: number;
  caloriesMin?: number;
  caloriesMax?: number;
  carbsMin?: number;
  carbsMax?: number;
  fatsMin?: number;
  fatsMax?: number;
} {
  if (!message || typeof message !== 'string') {
    return { hasMacroConstraints: false };
  }

  const constraints = extractMacroConstraintsFromText(normalizeSearchText(message).text.trim());

  return {
    hasMacroConstraints: hasConstraints(constraints),
    proteinMin: constraints.minProtein,
    proteinMax: constraints.maxProtein,
    caloriesMin: constraints.minCalories,
    caloriesMax: constraints.maxCalories,
    carbsMin: constraints.minCarbs,
    carbsMax: constraints.maxCarbs,
    fatsMin: constraints.minFats,
    fatsMax: constraints.maxFats,
  };
}

