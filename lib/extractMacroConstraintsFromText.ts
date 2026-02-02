/**
 * Extract Macro Constraints From Text
 * Authoritative macro constraint extraction from user queries
 * Returns constraint values that should always be applied when present
 */

export interface MacroConstraints {
  minCalories?: number;
  maxCalories?: number;
  minProtein?: number;
  maxProtein?: number;
  minCarbs?: number;
  maxCarbs?: number;
  minFats?: number;
  maxFats?: number;
}

/**
 * Extract macro constraints from query text
 * Supports comprehensive patterns for minimum/maximum constraints
 */
export function extractMacroConstraintsFromText(query: string): MacroConstraints {
  if (!query || typeof query !== 'string') {
    return {};
  }

  const trimmed = query.trim();
  const result: MacroConstraints = {};

  // ===== MINIMUM PROTEIN PATTERNS =====
  // "55g of protein or more" => minProtein=55
  // "protein 55g or more" => minProtein=55
  // "55g protein or more" => minProtein=55
  // "at least 55g protein" => minProtein=55
  // "55g of protein" => minProtein=55 (assume minimum)
  // "55g protein" => minProtein=55 (assume minimum)
  // "meals with 55g protein or more" => minProtein=55
  const proteinMinPatterns = [
    /\b(\d+)\s*(g|grams?)\s+of\s+protein\s+(or\s+more|or\s+higher|\+|plus)\b/i,
    /\bprotein\s+(\d+)\s*(g|grams?)\s+(or\s+more|or\s+higher|\+|plus)\b/i,
    /\b(\d+)\s*(g|grams?)\s+protein\s+(or\s+more|or\s+higher|\+|plus)\b/i,
    /\b(at\s+least|minimum|min|>=|over|above)\s+(\d+)\s*(g|grams?)\s+(of\s+)?protein\b/i,
    /\b(\d+)\s*(g|grams?)\s+(of\s+)?protein\s+(at\s+least|minimum|min)\b/i,
    /\bmeals?\s+(with|having)\s+(\d+)\s*(g|grams?)\s+(of\s+)?protein\s+(or\s+more|or\s+higher|\+|plus)\b/i,
    /\b(\d+)\s*(g|grams?)\s+(of\s+)?protein\b/i, // Default: assume minimum if no direction specified
    /\bhigh\s+protein\b/i, // "high protein" -> assume min 30g
  ];

  for (const pattern of proteinMinPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      if (match[0].toLowerCase().includes('high protein')) {
        result.minProtein = 30;
        break;
      }
      // Extract number from various capture groups
      const value = parseInt(match[1] || match[2] || match[3], 10);
      if (!isNaN(value) && value > 0 && value < 1000) {
        result.minProtein = value;
        break;
      }
    }
  }

  // ===== MAXIMUM PROTEIN PATTERNS =====
  // "55g protein or less" / "<= 55g protein" / "max 55g protein"
  const proteinMaxPatterns = [
    /\b(\d+)\s*(g|grams?)\s+(of\s+)?protein\s+(or\s+less|or\s+lower|max|maximum|at\s+most|<=)\b/i,
    /\b(under|below|less\s+than|max|maximum|at\s+most|<=)\s+(\d+)\s*(g|grams?)\s+(of\s+)?protein\b/i,
  ];

  for (const pattern of proteinMaxPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const value = parseInt(match[1] || match[2] || match[3], 10);
      if (!isNaN(value) && value > 0 && value < 1000) {
        result.maxProtein = value;
        break;
      }
    }
  }

  // ===== MAXIMUM CALORIES PATTERNS =====
  // "under 1000 calories" / "below 1000 cal" / "less than 1000 calories"
  const caloriesMaxPatterns = [
    /\b(under|below|less\s+than|max|maximum|at\s+most|<=)\s+(\d+)\s*(calories?|cal|kcal)\b/i,
    /\b(\d+)\s*(calories?|cal|kcal)\s+(or\s+less|or\s+lower|max|maximum|under|below)\b/i,
  ];

  for (const pattern of caloriesMaxPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const value = parseInt(match[2] || match[1], 10);
      if (!isNaN(value) && value >= 50 && value <= 5000) {
        result.maxCalories = value;
        break;
      }
    }
  }

  // ===== MINIMUM CALORIES PATTERNS =====
  // "at least 500 calories" / "over 500 cal"
  const caloriesMinPatterns = [
    /\b(at\s+least|minimum|min|>=|over|above)\s+(\d+)\s*(calories?|cal|kcal)\b/i,
    /\b(\d+)\s*(calories?|cal|kcal)\s+(or\s+more|or\s+higher|\+|plus|at\s+least)\b/i,
  ];

  for (const pattern of caloriesMinPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const value = parseInt(match[2] || match[1], 10);
      if (!isNaN(value) && value >= 50 && value <= 5000) {
        result.minCalories = value;
        break;
      }
    }
  }

  // ===== MINIMUM CARBS PATTERNS =====
  const carbsMinPatterns = [
    /\b(at\s+least|minimum|min|>=|over|above)\s+(\d+)\s*(g|grams?)\s+(of\s+)?(carbs?|carbohydrates?)\b/i,
    /\b(\d+)\s*(g|grams?)\s+(of\s+)?(carbs?|carbohydrates?)\s+(or\s+more|or\s+higher|\+|plus|at\s+least)\b/i,
    /\b(carbs?|carbohydrates?)\s+(\d+)\s*(g|grams?)\s+(or\s+more|or\s+higher|\+|plus)\b/i,
  ];

  for (const pattern of carbsMinPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const value = parseInt(match[2] || match[1] || match[3], 10);
      if (!isNaN(value) && value > 0 && value < 500) {
        result.minCarbs = value;
        break;
      }
    }
  }

  // ===== MAXIMUM CARBS PATTERNS =====
  // "under 40g carbs" / "below 50g carbohydrates" / "max 30g carbs" / "less than 40g carbs"
  const carbsMaxPatterns = [
    /\b(under|below|less\s+than|max|maximum|at\s+most|<=)\s+(\d+)\s*(g|grams?)\s+(of\s+)?(carbs?|carbohydrates?)\b/i,
    /\b(\d+)\s*(g|grams?)\s+(of\s+)?(carbs?|carbohydrates?)\s+(or\s+less|or\s+lower|max|maximum|under|below)\b/i,
    /\blow\s+carbs?\b/i, // "low carb" -> assume max 30g
  ];

  for (const pattern of carbsMaxPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      if (match[0].toLowerCase().includes('low carb')) {
        result.maxCarbs = 30;
        break;
      }
      const value = parseInt(match[2] || match[1] || match[3], 10);
      if (!isNaN(value) && value > 0 && value < 500) {
        result.maxCarbs = value;
        break;
      }
    }
  }

  // ===== MINIMUM FATS PATTERNS =====
  const fatsMinPatterns = [
    /\b(at\s+least|minimum|min|>=|over|above)\s+(\d+)\s*(g|grams?)\s+(of\s+)?(fat|fats)\b/i,
    /\b(\d+)\s*(g|grams?)\s+(of\s+)?(fat|fats)\s+(or\s+more|or\s+higher|\+|plus|at\s+least)\b/i,
    /\b(fat|fats)\s+(\d+)\s*(g|grams?)\s+(or\s+more|or\s+higher|\+|plus)\b/i,
  ];

  for (const pattern of fatsMinPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const value = parseInt(match[2] || match[1] || match[3], 10);
      if (!isNaN(value) && value > 0 && value < 200) {
        result.minFats = value;
        break;
      }
    }
  }

  // ===== MAXIMUM FATS PATTERNS =====
  // "under 20g fat" / "below 25g fat" / "max 15g fat" / "less than 20g fat"
  const fatsMaxPatterns = [
    /\b(under|below|less\s+than|max|maximum|at\s+most|<=)\s+(\d+)\s*(g|grams?)\s+(of\s+)?(fat|fats)\b/i,
    /\b(\d+)\s*(g|grams?)\s+(of\s+)?(fat|fats)\s+(or\s+less|or\s+lower|max|maximum|under|below)\b/i,
    /\blow\s+fat\b/i, // "low fat" -> assume max 20g
  ];

  for (const pattern of fatsMaxPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      if (match[0].toLowerCase().includes('low fat')) {
        result.maxFats = 20;
        break;
      }
      const value = parseInt(match[2] || match[1] || match[3], 10);
      if (!isNaN(value) && value > 0 && value < 200) {
        result.maxFats = value;
        break;
      }
    }
  }

  return result;
}

/**
 * Check if any constraints were extracted
 */
export function hasConstraints(constraints: MacroConstraints): boolean {
  return Object.keys(constraints).length > 0;
}



