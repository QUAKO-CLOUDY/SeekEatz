/**
 * Swap Rule Engine: Generates modification suggestions based on dish type, macro goals, and restaurant
 * This is the PRIMARY source of swap suggestions - NOT alternate menu items
 * 
 * DB-BACKED: All swaps must reference real modifier items from menu_items table
 */

import { normalizeMacros, type Macros } from '@/lib/macro-utils';
import type { ModifierCandidate } from './modifier-candidates';
import {
  inferDishType,
  inferIngredientType,
  isCompatible,
  hasProteinTokenOverlap,
  type DishType,
} from './dish-compatibility';

// Import extractDishType - need to check if it's exported or recreate it
// For now, we'll recreate a simple version

export interface SwapModification {
  id: string;
  swapTitle: string;
  expectedEffect: string; // e.g., "↓ carbs, ↓ calories"
  estimatedDelta: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number; // Use "fats" (plural) to match Meal type
  };
  confidenceLabel: 'Likely available' | 'Ask if available';
  type: 'remove' | 'replace' | 'add' | 'modify';
  swapType: 'higherProtein' | 'lowerCalories' | 'lowerCarbs' | 'macroDown' | 'macroUp' | 'carbDown' | 'fatDown' | 'proteinUp' | 'calorieDown' | 'calorieUp' | 'neutral'; // Goal-aware type
  details: string; // Additional context for the swap
  modifierItemIds: string[]; // REQUIRED: modifier item IDs from DB (must exist in menu_items)
}

export interface MacroGoals {
  lowerCalories?: boolean;
  higherProtein?: boolean;
  lowerCarbs?: boolean;
  lowerFat?: boolean;
  calorieCap?: number;
  minProtein?: number;
  maxCarbs?: number;
  maxFat?: number;
}

/**
 * Dish taxonomy mapping: dishType → { keywords[] }
 */
const DISH_TAXONOMY: Record<string, { keywords: string[] }> = {
  burgers: {
    keywords: ['burger', 'burgers', 'whopper', 'big mac', 'cheeseburger', 'hamburger']
  },
  sandwiches: {
    keywords: ['sandwich', 'sandwiches', 'sandwhich', 'sandwiche', 'sub', 'subs', 'hoagie', 'hoagies', 'hero', 'heroes']
  },
  bowls: {
    keywords: ['bowl', 'bowls']
  },
  burritos: {
    keywords: ['burrito', 'burritos']
  },
  salads: {
    keywords: ['salad', 'salads', 'caesar', 'cobb', 'garden salad']
  },
  pizza: {
    keywords: ['pizza', 'pizzas', 'pie', 'pies']
  },
};

/**
 * Detects dish type from meal name
 */
function detectDishType(mealName: string): string | null {
  const lowerName = mealName.toLowerCase();
  
  for (const [dishType, { keywords }] of Object.entries(DISH_TAXONOMY)) {
    for (const keyword of keywords) {
      const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(lowerName)) {
        return dishType;
      }
    }
  }
  
  return null;
}

// Old dish-type-specific functions removed - now using DB-backed swaps only

/**
 * Generates higher protein swap (single add-on item)
 * Finds best protein add-on candidate from modifierCandidates
 * Applies compatibility filtering to prevent weird swaps (e.g., shrimp on burger)
 */
function generateHigherProteinSwap(
  mealName: string,
  mealMacros: any,
  goals: MacroGoals,
  modifierCandidates: ModifierCandidate[]
): SwapModification | null {
  if (!goals.higherProtein && !goals.minProtein) {
    return null;
  }

  // Step 1: Determine dish type
  const dishType = inferDishType(mealName);

  // Step 2: Find protein add-on candidates with compatibility filtering
  const proteinPattern = /patty|chicken|steak|turkey|ham|egg|tofu|shrimp|protein|beef|pork/i;
  let proteinCandidates = modifierCandidates.filter(candidate => 
    proteinPattern.test(candidate.name) &&
    candidate.macros.protein > 0 &&
    candidate.macros.calories <= 400 // Cap calories add <= 400
  );

  // Step 3: Apply compatibility filter
  const compatibleCandidates: ModifierCandidate[] = [];
  const rejectedCandidates: Array<{ name: string; reason: string }> = [];

  for (const candidate of proteinCandidates) {
    const { type: ingredientType, confidence } = inferIngredientType(candidate.name);
    
    // Check compatibility
    if (isCompatible(dishType, ingredientType)) {
      compatibleCandidates.push(candidate);
    } else {
      // Fallback: token overlap check (only for high-confidence ingredient types)
      if (confidence >= 0.7 && hasProteinTokenOverlap(mealName, candidate.name)) {
        // Special case: if meal name and modifier share protein keywords, allow it
        // But still reject shrimp/fish/tuna for burgers
        if (dishType === 'burger' && (ingredientType === 'shrimp' || /shrimp|fish|tuna/i.test(candidate.name))) {
          rejectedCandidates.push({
            name: candidate.name,
            reason: `shrimp/fish incompatible with burger`,
          });
          continue;
        }
        compatibleCandidates.push(candidate);
      } else {
        rejectedCandidates.push({
          name: candidate.name,
          reason: `ingredient type '${ingredientType}' not compatible with dish type '${dishType}'`,
        });
      }
    }
  }

  // Log rejected candidates in dev
  if (process.env.NODE_ENV === 'development' && rejectedCandidates.length > 0) {
    console.log('[swap-rule-engine] Rejected protein candidates:', {
      mealName,
      dishType,
      rejected: rejectedCandidates,
    });
  }

  // Step 4: If no compatible candidates, return null
  if (compatibleCandidates.length === 0) {
    return null;
  }

  // Use compatible candidates for scoring
  proteinCandidates = compatibleCandidates;

  // Score candidates by protein increase per calories (protein/calories)
  const scoredCandidates = proteinCandidates.map(candidate => ({
    candidate,
    score: candidate.macros.calories > 0 
      ? candidate.macros.protein / candidate.macros.calories 
      : 0,
    proteinIncrease: candidate.macros.protein,
  }));

  // Sort by score (highest first), then by protein increase
  scoredCandidates.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 0.001) {
      return b.score - a.score;
    }
    return b.proteinIncrease - a.proteinIncrease;
  });

  const bestCandidate = scoredCandidates[0].candidate;

  // Dev assertion: burger should never have shrimp/fish/tuna
  if (process.env.NODE_ENV === 'development' && dishType === 'burger') {
    const { type: ingredientType } = inferIngredientType(bestCandidate.name);
    if (ingredientType === 'shrimp' || /shrimp|fish|tuna/i.test(bestCandidate.name)) {
      const errorMsg = `[swap-rule-engine] CRITICAL: Burger swap includes shrimp/fish! ` +
        `Meal: ${mealName}, Candidate: ${bestCandidate.name}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  // Build label
  let label = `Add ${bestCandidate.name}`;
  if (/patty/i.test(bestCandidate.name)) {
    label = 'Add extra patty';
  } else if (/chicken/i.test(bestCandidate.name)) {
    label = `Add ${bestCandidate.name}`;
  }

  return {
    id: `protein-add-${bestCandidate.id}`,
    swapTitle: label,
    expectedEffect: `↑ ${bestCandidate.macros.protein}g protein`,
    estimatedDelta: {
      calories: bestCandidate.macros.calories,
      protein: bestCandidate.macros.protein,
      carbs: bestCandidate.macros.carbs,
      fats: bestCandidate.macros.fats,
    },
    confidenceLabel: 'Likely available',
    type: 'add',
    swapType: 'higherProtein',
    details: `Add ${bestCandidate.name} to increase protein`,
    modifierItemIds: [bestCandidate.id],
  };
}

/**
 * Generates lower calories/carbs swap (remove or replace bun-like item)
 */
function generateLowerCaloriesSwap(
  mealMacros: any,
  goals: MacroGoals,
  modifierCandidates: ModifierCandidate[]
): SwapModification | null {
  const wantsLowerCalories = goals.lowerCalories || (goals.calorieCap && (mealMacros?.calories || 0) > (goals.calorieCap || 0));
  const wantsLowerCarbs = goals.lowerCarbs || (goals.maxCarbs && (mealMacros?.carbs || 0) > (goals.maxCarbs || 0));

  if (!wantsLowerCalories && !wantsLowerCarbs) {
    return null;
  }

  // Find bun/tortilla/wrap candidates
  const bunPattern = /bun|bread|roll|tortilla|wrap|bagel|croissant/i;
  const bunCandidates = modifierCandidates.filter(candidate => 
    bunPattern.test(candidate.name)
  );

  // Find lettuce wrap candidate
  const lettucePattern = /lettuce wrap|lettuce|wrap lettuce|greens wrap/i;
  const lettuceCandidates = modifierCandidates.filter(candidate =>
    lettucePattern.test(candidate.name)
  );

  // Prefer replace: bun -> lettuce wrap (requires both candidates)
  if (bunCandidates.length > 0 && lettuceCandidates.length > 0) {
    const bunCandidate = bunCandidates[0]; // Take first match
    const lettuceCandidate = lettuceCandidates[0]; // Take first match

    const deltaCalories = lettuceCandidate.macros.calories - bunCandidate.macros.calories;
    const deltaCarbs = lettuceCandidate.macros.carbs - bunCandidate.macros.carbs;
    const deltaProtein = lettuceCandidate.macros.protein - bunCandidate.macros.protein;
    const deltaFats = lettuceCandidate.macros.fats - bunCandidate.macros.fats;

    // Only propose if it actually reduces calories/carbs
    if (deltaCalories < 0 || deltaCarbs < 0) {
      const effects: string[] = [];
      if (deltaCalories < 0) effects.push(`↓ ${Math.abs(deltaCalories)} cal`);
      if (deltaCarbs < 0) effects.push(`↓ ${Math.abs(deltaCarbs)}g carbs`);

      return {
        id: `replace-bun-${bunCandidate.id}-${lettuceCandidate.id}`,
        swapTitle: 'Swap bun for lettuce wrap',
        expectedEffect: effects.join(', '),
        estimatedDelta: {
          calories: deltaCalories,
          protein: deltaProtein,
          carbs: deltaCarbs,
          fats: deltaFats,
        },
        confidenceLabel: 'Likely available',
        type: 'replace',
        swapType: wantsLowerCarbs ? 'lowerCarbs' : 'lowerCalories',
        details: `Replace ${bunCandidate.name} with ${lettuceCandidate.name}`,
        modifierItemIds: [bunCandidate.id, lettuceCandidate.id],
      };
    }
  }

  // Fallback: remove bun (if bun candidate exists)
  if (bunCandidates.length > 0) {
    const bunCandidate = bunCandidates[0];

    const effects: string[] = [];
    if (bunCandidate.macros.calories > 0) effects.push(`↓ ${bunCandidate.macros.calories} cal`);
    if (bunCandidate.macros.carbs > 0) effects.push(`↓ ${bunCandidate.macros.carbs}g carbs`);

    return {
      id: `remove-bun-${bunCandidate.id}`,
      swapTitle: `Remove ${bunCandidate.name}`,
      expectedEffect: effects.join(', '),
      estimatedDelta: {
        calories: -bunCandidate.macros.calories,
        protein: -bunCandidate.macros.protein,
        carbs: -bunCandidate.macros.carbs,
        fats: -bunCandidate.macros.fats,
      },
      confidenceLabel: 'Likely available',
      type: 'remove',
      swapType: wantsLowerCarbs ? 'lowerCarbs' : 'lowerCalories',
      details: `Remove ${bunCandidate.name} to reduce calories/carbs`,
      modifierItemIds: [bunCandidate.id],
    };
  }

  return null;
}

/**
 * Main function to generate swap modifications based on dish type and goals
 * DB-BACKED: Only returns swaps that reference real modifier items from DB
 * Returns at most 2 modifications (one protein-focused, one calorie/carbs reduction)
 * Applies compatibility filtering to prevent weird swaps
 */
export async function generateSwapModifications(
  mealName: string,
  mealMacros: any,
  goals: MacroGoals,
  restaurantName: string,
  modifierCandidates: ModifierCandidate[]
): Promise<SwapModification[]> {
  if (!restaurantName || !modifierCandidates || modifierCandidates.length === 0) {
    // No modifiers available - return empty
    if (process.env.NODE_ENV === 'development') {
      console.log('[swap-rule-engine] No modifier candidates available');
    }
    return [];
  }

  const modifications: SwapModification[] = [];

  // Goal ordering:
  // 1. If minProtein is set or higherProtein true -> attempt protein swap first
  // 2. Always attempt lowerCalories swap if calorieCap exists and meal exceeds cap OR user explicitly wants lower calories
  // 3. If both exist, return two

  // Generate higher protein swap (with compatibility filtering)
  const proteinSwap = generateHigherProteinSwap(mealName, mealMacros, goals, modifierCandidates);
  if (proteinSwap) {
    modifications.push(proteinSwap);
  }

  // Generate lower calories/carbs swap
  const calorieSwap = generateLowerCaloriesSwap(mealMacros, goals, modifierCandidates);
  if (calorieSwap) {
    modifications.push(calorieSwap);
  }

  // Return at most 2 modifications
  const result = modifications.slice(0, 2);

  // Log in dev
  if (process.env.NODE_ENV === 'development') {
    const dishType = inferDishType(mealName);
    console.log('[swap-rule-engine] Generated swaps:', {
      mealName,
      dishType,
      restaurantName,
      modifierCandidatesCount: modifierCandidates.length,
      proteinSwap: proteinSwap ? { name: proteinSwap.swapTitle, itemIds: proteinSwap.modifierItemIds } : null,
      calorieSwap: calorieSwap ? { name: calorieSwap.swapTitle, itemIds: calorieSwap.modifierItemIds } : null,
      finalModsCount: result.length,
    });

    // Dev assertion: burger should never have shrimp/fish/tuna in any swap
    if (dishType === 'burger') {
      const hasShrimp = result.some(mod => 
        /shrimp|fish|tuna/i.test(mod.swapTitle) || 
        mod.modifierItemIds.some(id => {
          const candidate = modifierCandidates.find(c => c.id === id);
          return candidate && /shrimp|fish|tuna/i.test(candidate.name);
        })
      );
      if (hasShrimp) {
        const errorMsg = `[swap-rule-engine] CRITICAL: Burger swaps include shrimp/fish/tuna! ` +
          `Meal: ${mealName}, Swaps: ${result.map(m => m.swapTitle).join(', ')}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    }
  }

  return result;
}

