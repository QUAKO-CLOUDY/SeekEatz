/**
 * Search Intent Detection Utilities
 * Deterministic functions to extract explicit restaurant queries and macro filters from search text
 */

import { extractMacroConstraintsFromText, hasConstraints } from '@/lib/extractMacroConstraintsFromText';
import { normalizeSearchText } from '@/lib/query-normalization';

/**
 * Cleans up a restaurant query extracted by greedy regex
 * Trims trailing punctuation and common non-restaurant trailing words
 */
function cleanRestaurantQuery(raw: string): string {
  let cleaned = raw.trim().replace(/[,.!?]+$/, '');
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
 * Extracts explicit restaurant query from message text
 * Only returns restaurantQuery when explicit patterns exist
 */
export function extractExplicitRestaurant(message: string): {
  restaurantQuery?: string;
} {
  if (!message || typeof message !== 'string') {
    return {};
  }

  const trimmed = normalizeSearchText(message).text.trim();
  const lowerMessage = trimmed.toLowerCase();

  // Pattern 1: "from X" - greedy match to end, then clean trailing words
  const pattern1 = /\bfrom\s+([a-z0-9&' .\-]+)/i;
  const match1 = trimmed.match(pattern1);
  if (match1 && match1[1]) {
    const restaurantQuery = cleanRestaurantQuery(match1[1]);
    if (restaurantQuery.length > 0) {
      return { restaurantQuery };
    }
  }

  // Pattern 2: "at X" - greedy match, then clean trailing words
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
    if (restaurantQuery.length > 0 && !forbiddenAfterAt.includes(firstWord)) {
      return { restaurantQuery };
    }
  }

  // Pattern 3: "X menu" (only if "menu" present)
  const pattern3 = /\b([a-z0-9&' .-]{2,})\s+menu\b/i;
  const match3 = trimmed.match(pattern3);
  if (match3 && match3[1]) {
    const restaurantQuery = match3[1].trim().replace(/[,\.!?]+$/, '');
    if (restaurantQuery.length > 0) {
      return { restaurantQuery };
    }
  }

  // Pattern 4: "menu of X"
  const pattern4 = /\bmenu\s+of\s+([a-z0-9&' .-]+?)(?:\s|$|,|\.|!|\?)/i;
  const match4 = trimmed.match(pattern4);
  if (match4 && match4[1]) {
    const restaurantQuery = match4[1].trim().replace(/[,\.!?]+$/, '');
    if (restaurantQuery.length > 0) {
      return { restaurantQuery };
    }
  }

  return {};
}

/**
 * Extracts macro filters from message text
 * Returns an object with optional macro constraint values
 */
export function extractMacroFilters(message: string): {
  proteinMin?: number;
  proteinMax?: number;
  caloriesMin?: number;
  caloriesMax?: number;
  carbsMin?: number;
  carbsMax?: number;
  fatsMin?: number;
  fatsMax?: number;
} | null {
  if (!message || typeof message !== 'string') {
    return null;
  }

  const constraints = extractMacroConstraintsFromText(normalizeSearchText(message).text.trim());
  if (!hasConstraints(constraints)) {
    return null;
  }

  return {
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

