/**
 * Search Intent Detection Utilities
 * Deterministic functions to extract explicit restaurant queries and macro filters from search text
 */

/**
 * Cleans up a restaurant query extracted by greedy regex
 * Trims trailing punctuation and common non-restaurant trailing words
 */
function cleanRestaurantQuery(raw: string): string {
  let cleaned = raw.trim().replace(/[,.!?]+$/, '');
  const trailingWords = [
    /\s+(with|and|but|or|for|that|which|where|when|please|thanks|thx|pls)(\s.*)?$/i,
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

  const trimmed = message.trim();
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

  const trimmed = message.trim();
  const result: {
    proteinMin?: number;
    proteinMax?: number;
    caloriesMin?: number;
    caloriesMax?: number;
    carbsMin?: number;
    carbsMax?: number;
    fatsMin?: number;
    fatsMax?: number;
  } = {};

  let hasAnyFilter = false;

  // Pattern: "at least Xg protein" or ">= Xg protein" or "over Xg protein" or "above Xg protein"
  const proteinMinPatterns = [
    /\b(at\s+least|minimum|min|>=|over|above)\s+(\d+)\s*(grams?\s+)?(protein|pro)\b/i,
    /\b(\d+)\s*(grams?\s+)?(protein|pro)\s+(at\s+least|minimum|min|or\s+more|\+|over|above)\b/i,
    /\b(\d+)\s*(g\+|grams?\+)\s+(protein|pro)\b/i,
    /\b(meals?|food|find\s+me|show\s+me|lunch|dinner|breakfast)\s+(with|over|above|at\s+least)\s+(\d+)\s*(grams?\s+)?(protein|pro)\b/i,
    /\b(\d+)\s*(g|grams?)\s+(protein|pro)\b/i, // Shorthand: "40g protein" (assumes minimum)
    /\b(\d+)\s+(protein|pro)\b/i, // Shorthand: "40 protein" (assumes minimum, no unit)
    /\bhigh[\s-]+protein\b/i, // "high protein" or "high-protein" -> assume min 30g
  ];
  for (const pattern of proteinMinPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      if (match[0].toLowerCase().match(/high[\s-]+protein/)) {
        result.proteinMin = 30;
      } else {
        const value = parseInt(match[2] || match[3] || match[1], 10);
        if (!isNaN(value) && value > 0 && value < 1000) {
          result.proteinMin = value;
        }
      }
      hasAnyFilter = true;
      break;
    }
  }

  // Pattern: "under X calories" or "<= X cal" or "below X calories"
  const caloriesMaxPatterns = [
    /\b(under|below|less\s+than|at\s+most|max|maximum|<=)\s+(\d+)\s*(calories?|cal)\b/i,
    /\b(\d+)\s*(calories?|cal)\s+(or\s+less|under|below|max)\b/i,
    /\b(meals?|food|find\s+me|show\s+me)\s+(under|below|less\s+than|at\s+most)\s+(\d+)\s*(calories?|cal)\b/i,
    /\b(meals?|food|find\s+me|show\s+me)\s+(\d+)\s*(calories?|cal)\b/i, // Shorthand: "meal under 600 cal"
    /\b(\d+)\s*(cal|calories?)\b/i, // Shorthand: "600 cal" or "600 calories" (assumes maximum if no other context)
    /\blow\s+(calorie|calories|cal)\b/i, // "low calorie" -> assume max 500
  ];
  for (const pattern of caloriesMaxPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      // Handle "low calorie" without a number
      if (match[0].toLowerCase().match(/\blow\s+(calorie|calories|cal)\b/)) {
        result.caloriesMax = 500;
        hasAnyFilter = true;
        break;
      }
      const value = parseInt(match[2] || match[3] || match[1], 10);
      if (!isNaN(value) && value >= 50 && value <= 5000) {
        const isMaxContext = match[0].toLowerCase().includes('under') ||
          match[0].toLowerCase().includes('below') ||
          match[0].toLowerCase().includes('less') ||
          match[0].toLowerCase().includes('max') ||
          match[0].toLowerCase().includes('at most');
        if (isMaxContext || !trimmed.match(/\b(at\s+least|minimum|min|>=|over|above)\s+(\d+)\s*(calories?|cal)\b/i)) {
          result.caloriesMax = value;
          hasAnyFilter = true;
          break;
        }
      }
    }
  }

  // Pattern: "at least X calories" or ">= X cal" or "over X calories" or "above X calories"
  const caloriesMinPatterns = [
    /\b(at\s+least|minimum|min|>=|over|above)\s+(\d+)\s*(calories?|cal)\b/i,
    /\b(meals?|food|find\s+me|show\s+me)\s+(with|over|above|at\s+least)\s+(\d+)\s*(calories?|cal)\b/i,
  ];
  for (const pattern of caloriesMinPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const value = parseInt(match[2] || match[3], 10);
      if (!isNaN(value) && value >= 50 && value <= 5000) {
        result.caloriesMin = value;
        hasAnyFilter = true;
        break;
      }
    }
  }

  // Pattern: "under Xg carbs" or "low carb"
  const carbsMaxPatterns = [
    /\b(under|below|less\s+than|at\s+most|max|maximum|<=)\s+(\d+)\s*(grams?\s+)?(carbs?|carbohydrates?)\b/i,
    /\b(meals?|food|find\s+me|show\s+me)\s+(under|below|less\s+than|at\s+most)\s+(\d+)\s*(grams?\s+)?(carbs?|carbohydrates?)\b/i,
    /\blow\s+carbs?\b/i, // "low carb" -> assume max 30g
  ];

  // Pattern: "over Xg carbs" or "above Xg carbs" or "at least Xg carbs" (for minimum)
  const carbsMinPatterns = [
    /\b(at\s+least|minimum|min|>=|over|above)\s+(\d+)\s*(grams?\s+)?(carbs?|carbohydrates?)\b/i,
    /\b(meals?|food|find\s+me|show\s+me)\s+(with|over|above|at\s+least)\s+(\d+)\s*(grams?\s+)?(carbs?|carbohydrates?)\b/i,
  ];
  for (const pattern of carbsMinPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const value = parseInt(match[2] || match[3] || match[1], 10);
      if (!isNaN(value) && value > 0 && value < 500) {
        result.carbsMin = value;
        hasAnyFilter = true;
        break;
      }
    }
  }
  for (const pattern of carbsMaxPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      if (match[0].toLowerCase().includes('low carb')) {
        result.carbsMax = 30;
      } else {
        const value = parseInt(match[2] || match[3] || match[1], 10);
        if (!isNaN(value) && value > 0 && value < 500) {
          result.carbsMax = value;
        }
      }
      hasAnyFilter = true;
      break;
    }
  }

  // Pattern: "under Xg fat" or "low fat"
  const fatsMaxPatterns = [
    /\b(under|below|less\s+than|at\s+most|max|maximum|<=)\s+(\d+)\s*(grams?\s+)?(fat|fats)\b/i,
    /\blow\s+fat\b/i, // "low fat" -> assume max 20g
  ];

  // Pattern: "over Xg fat" or "above Xg fat" or "at least Xg fat" (for minimum)
  const fatsMinPatterns = [
    /\b(at\s+least|minimum|min|>=|over|above)\s+(\d+)\s*(grams?\s+)?(fat|fats)\b/i,
    /\b(meals?|food|find\s+me|show\s+me)\s+(with|over|above|at\s+least)\s+(\d+)\s*(grams?\s+)?(fat|fats)\b/i,
  ];
  for (const pattern of fatsMinPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const value = parseInt(match[2] || match[3] || match[1], 10);
      if (!isNaN(value) && value > 0 && value < 200) {
        result.fatsMin = value;
        hasAnyFilter = true;
        break;
      }
    }
  }
  for (const pattern of fatsMaxPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      if (match[0].toLowerCase().includes('low fat')) {
        result.fatsMax = 20;
      } else {
        const value = parseInt(match[2] || match[3] || match[1], 10);
        if (!isNaN(value) && value > 0 && value < 200) {
          result.fatsMax = value;
        }
      }
      hasAnyFilter = true;
      break;
    }
  }

  return hasAnyFilter ? result : null;
}

