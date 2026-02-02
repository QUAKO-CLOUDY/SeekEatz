/**
 * Shared macro normalization and validation utilities
 * Single source of truth for macro shape: { calories, protein, carbs, fats }
 */

export type Macros = {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
};

/**
 * Normalizes macro data from various input formats
 * Handles:
 * - JSON objects (from DB macros JSONB)
 * - Stringified JSON
 * - Objects with different key names (fat vs fats, protein_g vs protein, etc.)
 * - Missing keys (defaults to 0 only if truly missing, warns in dev)
 * 
 * @param input - Macro data in any format
 * @returns Normalized Macros object or null if invalid
 */
export function normalizeMacros(input: any): Macros | null {
  if (!input) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[normalizeMacros] Input is null/undefined');
    }
    return null;
  }

  // Handle stringified JSON
  let parsed: any = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[normalizeMacros] Failed to parse string input:', e);
      }
      return null;
    }
  }

  // Ensure it's an object
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[normalizeMacros] Input is not an object:', typeof parsed);
    }
    return null;
  }

  // Extract calories - required, must be > 0
  const calories = coerceToNumber(parsed.calories);
  if (calories === null || calories <= 0 || isNaN(calories)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[normalizeMacros] Invalid calories:', parsed.calories);
    }
    return null;
  }

  // Extract protein - required, must be >= 0
  const protein = coerceToNumber(parsed.protein ?? parsed.protein_g);
  if (protein === null || isNaN(protein) || protein < 0) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[normalizeMacros] Invalid protein:', parsed.protein, parsed.protein_g);
    }
    return null;
  }

  // Extract carbs - required, must be >= 0
  const carbs = coerceToNumber(parsed.carbs ?? parsed.carbs_g);
  if (carbs === null || isNaN(carbs) || carbs < 0) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[normalizeMacros] Invalid carbs:', parsed.carbs, parsed.carbs_g);
    }
    return null;
  }

  // Extract fats - prefer "fats" (plural), fallback to "fat" (singular)
  // Support: fats, fat, fats_g, fat_g
  const fatsValue = parsed.fats ?? parsed.fat ?? parsed.fats_g ?? parsed.fat_g;
  const fats = coerceToNumber(fatsValue);
  if (fats === null || isNaN(fats) || fats < 0) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[normalizeMacros] Invalid fats:', parsed.fats, parsed.fat, parsed.fats_g, parsed.fat_g);
    }
    return null;
  }

  // Warn if both fat and fats exist with different values (data inconsistency)
  if (typeof parsed.fat === 'number' && typeof parsed.fats === 'number' && parsed.fat !== parsed.fats) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[normalizeMacros] Macro mismatch: fat=', parsed.fat, 'fats=', parsed.fats, '. Using fats (plural) value.');
    }
  }

  return {
    calories,
    protein,
    carbs,
    fats,
  };
}

/**
 * Coerces a value to a number, handling strings and null/undefined
 * Returns null if value cannot be coerced to a valid number
 */
function coerceToNumber(value: any): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Validates that a meal object satisfies macro constraints
 * Supports both min (>=) and max (<=) constraints for each macro
 * 
 * @param macros - The meal's macros
 * @param constraints - Filter constraints
 * @returns true if meal satisfies all constraints
 */
export function satisfiesMacroConstraints(
  macros: Macros,
  constraints: {
    minCalories?: number;
    maxCalories?: number;
    minProtein?: number;
    maxProtein?: number;
    minCarbs?: number;
    maxCarbs?: number;
    minFats?: number;
    maxFats?: number;
  }
): boolean {
  // Calories constraints
  if (constraints.minCalories !== undefined && macros.calories < constraints.minCalories) {
    return false;
  }
  if (constraints.maxCalories !== undefined && macros.calories > constraints.maxCalories) {
    return false;
  }

  // Protein constraints
  if (constraints.minProtein !== undefined && macros.protein < constraints.minProtein) {
    return false;
  }
  if (constraints.maxProtein !== undefined && macros.protein > constraints.maxProtein) {
    return false;
  }

  // Carbs constraints
  if (constraints.minCarbs !== undefined && macros.carbs < constraints.minCarbs) {
    return false;
  }
  if (constraints.maxCarbs !== undefined && macros.carbs > constraints.maxCarbs) {
    return false;
  }

  // Fats constraints
  if (constraints.minFats !== undefined && macros.fats < constraints.minFats) {
    return false;
  }
  if (constraints.maxFats !== undefined && macros.fats > constraints.maxFats) {
    return false;
  }

  return true;
}

/**
 * Runtime assertion for development: ensures all meals in array satisfy constraints
 * Throws in development if any meal violates constraints
 */
export function assertMealsSatisfyConstraints(
  meals: Array<{ macros: Macros }>,
  constraints: Parameters<typeof satisfiesMacroConstraints>[1],
  context?: string
): void {
  if (process.env.NODE_ENV !== 'development') {
    return; // Only run in development
  }

  const violations: Array<{ meal: any; reason: string }> = [];

  for (const meal of meals) {
    if (!satisfiesMacroConstraints(meal.macros, constraints)) {
      const reasons: string[] = [];
      const m = meal.macros;

      if (constraints.minCalories !== undefined && m.calories < constraints.minCalories) {
        reasons.push(`calories ${m.calories} < min ${constraints.minCalories}`);
      }
      if (constraints.maxCalories !== undefined && m.calories > constraints.maxCalories) {
        reasons.push(`calories ${m.calories} > max ${constraints.maxCalories}`);
      }
      if (constraints.minProtein !== undefined && m.protein < constraints.minProtein) {
        reasons.push(`protein ${m.protein} < min ${constraints.minProtein}`);
      }
      if (constraints.maxProtein !== undefined && m.protein > constraints.maxProtein) {
        reasons.push(`protein ${m.protein} > max ${constraints.maxProtein}`);
      }
      if (constraints.minCarbs !== undefined && m.carbs < constraints.minCarbs) {
        reasons.push(`carbs ${m.carbs} < min ${constraints.minCarbs}`);
      }
      if (constraints.maxCarbs !== undefined && m.carbs > constraints.maxCarbs) {
        reasons.push(`carbs ${m.carbs} > max ${constraints.maxCarbs}`);
      }
      if (constraints.minFats !== undefined && m.fats < constraints.minFats) {
        reasons.push(`fats ${m.fats} < min ${constraints.minFats}`);
      }
      if (constraints.maxFats !== undefined && m.fats > constraints.maxFats) {
        reasons.push(`fats ${m.fats} > max ${constraints.maxFats}`);
      }

      violations.push({
        meal: meal,
        reason: reasons.join(', '),
      });
    }
  }

  if (violations.length > 0) {
    const errorMsg = `[assertMealsSatisfyConstraints] ${violations.length} meal(s) violate constraints${context ? ` in ${context}` : ''}:\n` +
      violations.map(v => `  - ${v.reason}`).join('\n');
    console.error(errorMsg);
    // In development, throw to catch regressions early
    throw new Error(errorMsg);
  }
}

