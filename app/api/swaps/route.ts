import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { type MacroGoals } from '@/utils/swap-rule-engine';
import {
  filterModifierCandidatesForMeal,
  getLinkedModifierCandidates,
  getModifierCandidates,
} from '@/utils/modifier-candidates';
import { normalizeMacros } from '@/lib/macro-utils';
import { generateHybridSwaps } from '@/utils/hybrid-swap-generator';
import { inferExtendedDishType } from '@/utils/dish-structure';
import { getApplicableSwaps, type SwapLibraryEntry } from '@/utils/global-swap-library';
import { filterCompatibleSwaps } from '@/utils/swap-compatibility-v2';

type SearchableMenuItem = {
  id: string;
  restaurant_name: string;
  name: string;
  category: string | null;
  macros: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fats?: number;
  } | null;
};

type SwapDelta = {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
};

const ZERO_DELTA: SwapDelta = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fats: 0,
};

const FRIED_LIKE_MEAL_PATTERN = /\b(fried|deep.?fried|crispy|battered|breaded|crunchy|tenders?|tenderloin)\b/i;
const CHICKEN_FINGER_LIKE_PATTERN = /\b(chicken\s*(fingers?|tenders?)|fingers?|tenders?|nuggets?|wings?)\b/i;
const DISALLOWED_SWAP_PHRASE_PATTERN =
  /\b(dip\s+instead\s+of\s+coating|dry\s+rub\s+instead\s+of\s+sauce)\b/i;

function withIfAvailable(label: string): string {
  if (/if available/i.test(label)) return label;
  return `${label} (if available)`;
}

function fallbackEffectFromSwapType(swapType: string): string {
  switch (swapType) {
    case 'higherProtein':
    case 'proteinUp':
      return 'Higher protein';
    case 'lowerCarbs':
    case 'carbDown':
      return 'Lower carbs';
    case 'lowerCalories':
    case 'calorieDown':
      return 'Lower calories';
    case 'fatDown':
      return 'Lower fat';
    default:
      return 'Recommended adjustment';
  }
}

function toNonNumericEffect(effect: string | undefined, fallback: string): string {
  if (!effect || typeof effect !== 'string') return fallback;

  const cleaned = effect
    .replace(/[+\-]?\d+(\.\d+)?\s*(g|cal|kcal)?/gi, '')
    .replace(/[↑↓]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,+/g, ',')
    .replace(/^,\s*|\s*,\s*$/g, '')
    .trim();

  return cleaned.length > 0 ? cleaned : fallback;
}

function isFriedLikeMeal(mealName: string): boolean {
  return FRIED_LIKE_MEAL_PATTERN.test(mealName);
}

function isGrilledInsteadOfFriedSwap(entry: { id?: string; label?: string }): boolean {
  return entry.id === 'cook-grilled' || /grilled instead of fried/i.test(entry.label ?? '');
}

function normalizeGenericEffectText(effect: string): string {
  if (/lighter preparation/i.test(effect)) {
    return 'Less calories';
  }
  return effect;
}

function hasDisallowedSwapPhrase(label: string, details?: string): boolean {
  const haystack = `${label || ''} ${details || ''}`;
  return DISALLOWED_SWAP_PHRASE_PATTERN.test(haystack);
}

function stringHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function rotateByOffset<T>(items: T[], offset: number): T[] {
  if (items.length === 0) return items;
  const normalized = ((offset % items.length) + items.length) % items.length;
  if (normalized === 0) return [...items];
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

function pickPrimaryImpactLabel(impactLabels: string[]): string {
  return impactLabels.find((label) =>
    /protein|calorie|carb|fat|lighter/i.test(label)
  ) ?? impactLabels[0] ?? 'Recommended adjustment';
}

type NonDbMappedSwap = {
  id: string;
  label: string;
  expectedEffect: string;
  estimatedDelta: SwapDelta;
  confidenceLabel: 'Likely available' | 'Ask if available';
  type: 'modify';
  swapType: 'neutral';
  details: string;
  modifierItemIds: string[];
  impactLabels: string[];
  source: 'global' | 'llm';
  deltaMacros: SwapDelta;
};

function mapHybridGlobalSwap(
  entry: {
    id: string;
    label: string;
    impactLabels: string[];
    details: string;
    estimatedDelta: SwapDelta;
    impactType?: 'deterministic' | 'heuristic';
  },
  index: number
): NonDbMappedSwap {
  const fallbackEffect = pickPrimaryImpactLabel(entry.impactLabels);
  return {
    id: `hybrid-global-${entry.id || index}`,
    label: withIfAvailable(entry.label),
    expectedEffect: normalizeGenericEffectText(toNonNumericEffect(fallbackEffect, 'Recommended adjustment')),
    estimatedDelta: entry.estimatedDelta ?? ZERO_DELTA,
    confidenceLabel: entry.impactType === 'deterministic' ? 'Likely available' : 'Ask if available',
    type: 'modify',
    swapType: 'neutral',
    details: entry.details || 'Global swap recommendation for this dish type.',
    modifierItemIds: [],
    impactLabels: entry.impactLabels ?? [],
    source: 'global',
    deltaMacros: entry.estimatedDelta ?? ZERO_DELTA,
  };
}

function mapHybridLlmSwap(
  entry: {
    id: string;
    label: string;
    impactLabels: string[];
    details: string;
    estimatedDelta: SwapDelta;
  },
  index: number
): NonDbMappedSwap {
  const fallbackEffect = pickPrimaryImpactLabel(entry.impactLabels);
  return {
    id: `hybrid-llm-${entry.id || index}`,
    label: withIfAvailable(entry.label),
    expectedEffect: normalizeGenericEffectText(toNonNumericEffect(fallbackEffect, 'Recommended adjustment')),
    estimatedDelta: entry.estimatedDelta ?? ZERO_DELTA,
    confidenceLabel: 'Ask if available',
    type: 'modify',
    swapType: 'neutral',
    details: entry.details || 'LLM-generated swap suggestion.',
    modifierItemIds: [],
    impactLabels: entry.impactLabels ?? [],
    source: 'llm',
    deltaMacros: entry.estimatedDelta ?? ZERO_DELTA,
  };
}

function scoreNonDbSwapCandidate(
  swap: NonDbMappedSwap,
  mealName: string,
  goals: MacroGoals
): number {
  let score = 0;
  const lowerLabel = (swap.label || '').toLowerCase();
  const lowerMealName = (mealName || '').toLowerCase();
  const friedLikeMeal = isFriedLikeMeal(mealName);
  const chickenFingerLikeMeal = CHICKEN_FINGER_LIKE_PATTERN.test(lowerMealName);

  if (swap.source === 'global') score += 30;
  if (swap.source === 'llm') score += 10;

  const grilledStyleSwap =
    /\b(grilled instead of fried|baked instead of fried|no breading)\b/.test(lowerLabel);
  if (grilledStyleSwap && friedLikeMeal) {
    score += 220;
  }
  if (grilledStyleSwap && chickenFingerLikeMeal) {
    score += 180;
  }

  if (/\b(sauce on the side|no sauce|light sauce|half bun|lettuce wrap|side salad instead of fries)\b/.test(lowerLabel)) {
    score += 45;
  }

  if (goals.higherProtein && swap.deltaMacros.protein > 0) score += 60;
  if (goals.lowerCalories && swap.deltaMacros.calories < 0) score += 60;
  if (goals.lowerCarbs && swap.deltaMacros.carbs < 0) score += 45;
  if (goals.lowerFat && swap.deltaMacros.fats < 0) score += 45;

  if (!goals.higherProtein && swap.deltaMacros.calories > 0) {
    score -= Math.min(45, Math.round(swap.deltaMacros.calories / 10));
  }

  if (swap.deltaMacros.calories < 0) {
    score += Math.min(40, Math.round(Math.abs(swap.deltaMacros.calories) / 12));
  }

  return score;
}

function dedupeSwapsByLabel<T extends { label: string }>(swaps: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const swap of swaps) {
    const key = (swap.label || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(swap);
  }
  return deduped;
}

function buildFallbackPoolForDish(dishType: string, mealName: string) {
  const includeGrilledSwap = dishType !== 'burger' && isFriedLikeMeal(mealName);

  if (dishType === 'breakfast' || dishType === 'breakfast_plate') {
    return [
      { id: 'fallback-breakfast-eggs', label: 'Egg whites instead of whole eggs', effect: 'Lighter protein choice' },
      { id: 'fallback-breakfast-fruit', label: 'Fruit instead of hash browns', effect: 'Lighter side option' },
      { id: 'fallback-breakfast-syrup', label: 'No syrup', effect: 'Lower added sugar' },
    ];
  }

  if (dishType === 'smoothie') {
    return [
      { id: 'fallback-smoothie-base', label: 'Unsweetened base instead of juice', effect: 'Lower added sugar' },
      { id: 'fallback-smoothie-size', label: 'Smaller size', effect: 'Lighter portion' },
      { id: 'fallback-smoothie-addin', label: 'Skip sugary add-ins', effect: 'Lighter ingredient mix' },
    ];
  }

  if (dishType === 'salad' || dishType === 'pasta' || dishType === 'pizza' || dishType === 'bowl') {
    const swaps = [
      { id: 'fallback-dressing-side', label: 'Dressing on the side', effect: 'Lighter sauce usage' },
      { id: 'fallback-half-portion', label: 'Half portion', effect: 'Lighter portion' },
      { id: 'fallback-veggie-swap', label: 'Extra veggies instead of dense add-ons', effect: 'Lighter ingredient swap' },
    ];
    if (includeGrilledSwap) {
      swaps.push({ id: 'fallback-grilled', label: 'Grilled instead of fried', effect: 'Less calories' });
    }
    return swaps;
  }

  if (dishType === 'burger') {
    return [
      { id: 'fallback-burger-half-bun', label: 'Half bun / open faced', effect: 'Lower carbs' },
      { id: 'fallback-burger-sauce-side', label: 'Sauce on the side', effect: 'Lighter sauce usage' },
      { id: 'fallback-burger-no-glaze', label: 'No sauce / no glaze', effect: 'Less calories' },
      { id: 'fallback-burger-side', label: 'Side salad instead of fries', effect: 'Lighter side option' },
    ];
  }

  const swaps = [
    { id: 'fallback-sauce-side', label: 'Sauce on the side', effect: 'Lighter sauce usage' },
    { id: 'fallback-side', label: 'Side salad instead of fries', effect: 'Lighter side option' },
  ];
  if (includeGrilledSwap) {
    swaps.push({ id: 'fallback-grilled', label: 'Grilled instead of fried', effect: 'Less calories' });
  }
  return swaps;
}

function mapGenericSwap(entry: { id: string; label: string; effect: string; details?: string }) {
  return {
    id: `generic-${entry.id}`,
    label: withIfAvailable(entry.label),
    expectedEffect: normalizeGenericEffectText(entry.effect),
    estimatedDelta: ZERO_DELTA,
    confidenceLabel: 'Ask if available' as const,
    type: 'modify' as const,
    swapType: 'neutral' as const,
    details: entry.details ?? 'General swap recommendation when restaurant-specific modifiers are unavailable.',
    modifierItemIds: [] as string[],
    impactLabels: ['Recommended adjustment'],
    source: 'global' as const,
    deltaMacros: ZERO_DELTA,
  };
}

function buildDishAwareGenericSwaps(mealName: string, restaurantName: string, maxSwaps: number) {
  const dishType = inferExtendedDishType(mealName);
  const candidateEntries = filterCompatibleSwaps(
    getApplicableSwaps(dishType),
    dishType,
    mealName
  ).filter((entry) => {
    if (dishType === 'burger' && isGrilledInsteadOfFriedSwap(entry)) {
      return false;
    }
    if (isGrilledInsteadOfFriedSwap(entry) && !isFriedLikeMeal(mealName)) {
      return false;
    }
    return true;
  });

  const rotationWindow = Math.floor(Date.now() / (1000 * 60 * 60 * 3)); // rotate every 3 hours
  const rotationSeed = `${restaurantName}|${mealName}|${rotationWindow}`;
  const rotatedCandidates = rotateByOffset(candidateEntries, stringHash(rotationSeed));

  const selected: SwapLibraryEntry[] = [];
  const usedCategories = new Set<string>();
  for (const entry of rotatedCandidates) {
    if (usedCategories.has(entry.category)) continue;
    usedCategories.add(entry.category);
    selected.push(entry);
    if (selected.length >= maxSwaps) break;
  }

  if (selected.length > 0) {
    return selected.map((entry) =>
      mapGenericSwap({
        id: entry.id,
        label: entry.label,
        effect: toNonNumericEffect(pickPrimaryImpactLabel(entry.impactLabels), 'Recommended adjustment'),
        details: entry.details,
      })
    );
  }

  const rotatedFallback = rotateByOffset(
    buildFallbackPoolForDish(dishType, mealName),
    stringHash(rotationSeed)
  ).slice(0, maxSwaps);

  return rotatedFallback.map((entry) => mapGenericSwap(entry));
}

/**
 * Swap endpoint v2: Hybrid Swap Engine
 * Returns modification suggestions (DB-backed + global + LLM fallback) and alternative menu items.
 * 
 * Response format:
 * {
 *   modifications: [...],  // Mixed DB + global + LLM swap suggestions
 *   alternatives: [...],   // DB-only alternate menu items (fallback)
 *   source: 'db' | 'global' | 'llm' | 'mixed'
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { restaurant_name, meal_id, meal_name, meal_macros, calorieCap, minProtein, maxCarbs, maxFat } = body;

    if (!restaurant_name) {
      return NextResponse.json(
        { error: 'restaurant_name is required' },
        { status: 400 }
      );
    }

    if (!meal_name) {
      return NextResponse.json(
        { error: 'meal_name is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // ========== PRIMARY: Hybrid Swap Engine v2 ==========
    // Step 1: Fetch modifier candidates from DB
    // Prefer explicit meal relations. Fall back to restaurant-wide inference only if no links exist.
    const linkedModifierCandidates = await getLinkedModifierCandidates(supabase, meal_id);
    const restaurantModifierCandidates = await getModifierCandidates(supabase, restaurant_name);
    const filteredRestaurantModifierCandidates = filterModifierCandidatesForMeal(meal_name, restaurantModifierCandidates);
    const modifierCandidates =
      linkedModifierCandidates.length > 0
        ? linkedModifierCandidates
        : filteredRestaurantModifierCandidates;

    // Log in dev
    if (process.env.NODE_ENV === 'development') {
      console.log('[swaps] Modifier candidates:', {
        restaurant_name,
        meal_id,
        meal_name,
        linkedCount: linkedModifierCandidates.length,
        restaurantWideCount: restaurantModifierCandidates.length,
        mealScopedCount: filteredRestaurantModifierCandidates.length,
        finalCount: modifierCandidates.length,
        source: linkedModifierCandidates.length > 0 ? 'relations' : 'restaurant_fallback',
        sampleNames: modifierCandidates.slice(0, 5).map(c => c.name),
      });
    }

    // Convert user_goals and constraints to MacroGoals format
    // Normalize fat: prefer fat (singular) from DB, fallback to fats (plural)
    const mealFat = meal_macros?.fat ?? meal_macros?.fats ?? 0;

    const macroGoals: MacroGoals = {
      lowerCalories: calorieCap ? (meal_macros?.calories || 0) > calorieCap : undefined,
      higherProtein: minProtein ? (meal_macros?.protein || 0) < minProtein : undefined,
      lowerCarbs: maxCarbs ? (meal_macros?.carbs || 0) > maxCarbs : undefined,
      lowerFat: maxFat ? mealFat > maxFat : undefined,
      calorieCap,
      minProtein,
      maxCarbs,
      maxFat,
    };

    // Normalize meal macros for hybrid engine
    const normalizedMealMacros = normalizeMacros(meal_macros) ?? {
      calories: meal_macros?.calories || 0,
      protein: meal_macros?.protein || 0,
      carbs: meal_macros?.carbs || 0,
      fats: mealFat,
    };

    // Generate modifications using Hybrid Swap Engine v2
    const hybridResult = await generateHybridSwaps(
      meal_name,
      normalizedMealMacros,
      macroGoals,
      restaurant_name,
      modifierCandidates
    );

    // Extract DB-backed modifications
    const modifications = hybridResult.modifications;

    // Validate DB-backed modifications (dev-only assertion)
    if (process.env.NODE_ENV === 'development') {
      const validModifications = modifications.filter(mod => {
        if (!mod.modifierItemIds || mod.modifierItemIds.length === 0) {
          console.warn('[swaps] Modification missing modifierItemIds:', mod.id);
          return false;
        }
        const allIdsValid = mod.modifierItemIds.every(id =>
          modifierCandidates.some(candidate => candidate.id === id)
        );
        if (!allIdsValid) {
          console.warn('[swaps] Modification has invalid modifierItemIds:', mod.id, mod.modifierItemIds);
          return false;
        }
        const delta = mod.estimatedDelta;
        if (isNaN(delta.calories) || isNaN(delta.protein) || isNaN(delta.carbs) || isNaN(delta.fats)) {
          console.warn('[swaps] Modification has NaN in deltaMacros:', mod.id, delta);
          return false;
        }
        return true;
      });

      if (validModifications.length !== modifications.length) {
        const invalidCount = modifications.length - validModifications.length;
        console.error(`[swaps] CRITICAL: ${invalidCount} DB modification(s) failed validation!`);
        throw new Error(`[swaps] ${invalidCount} modification(s) failed validation`);
      }
    }

    // ========== SECONDARY: Find DB-only alternate menu items ==========
    // Alternatives are ONLY returned as fallback when no good modifications exist
    // Alternatives must be: same restaurant, same dish type, and move toward user's constraints
    const alternatives: Array<{
      id: string;
      name: string;
      restaurant: string;
      calories: number;
      protein: number;
      carbs: number;
      fats: number;
    }> = [];

    // Only fetch alternatives if we have NO modifications AND no global/LLM swaps
    // Modifications + global swaps are always preferred over alternatives
    const totalHybridSwaps = modifications.length + hybridResult.globalSwaps.length + hybridResult.llmSwaps.length;
    const shouldFetchAlternatives = totalHybridSwaps === 0;

    // Only fetch alternatives if we have no modifications
    if (shouldFetchAlternatives) {
      // Fetch all menu items from the same restaurant
      const { data: allItems, error } = await supabase
        .from('menu_items')
        .select(`
          id,
          restaurant_name,
          name,
          category,
          macros
        `)
        .eq('restaurant_name', restaurant_name);

      if (!error && allItems) {
        // Filter to only full meals (not modifiers)
        // No dish type filtering - we just filter by constraints and exclude current meal
        const fullMeals = (allItems as SearchableMenuItem[]).filter((item) => {
          // Must have valid macros
          const macros = item.macros;
          if (!macros || typeof macros !== 'object') return false;

          const calories = typeof macros.calories === 'number' ? macros.calories : null;
          if (calories === null || calories < 150 || isNaN(calories)) return false; // Must be a real meal

          // Exclude the current meal
          if (meal_id && item.id === meal_id) return false;

          // Apply constraints if provided (alternatives must move toward user's constraints)
          // Normalize fat: prefer fat (singular) from DB, fallback to fats (plural)
          const itemFat = macros.fat ?? macros.fats ?? 0;

          if (calorieCap && calories > calorieCap) return false;
          if (minProtein && (macros.protein || 0) < minProtein) return false;
          if (maxCarbs && (macros.carbs || 0) > maxCarbs) return false;
          if (maxFat && itemFat > maxFat) return false;

          return true;
        });

        // Convert to alternative format (limit to 3-5)
        // Normalize fat: prefer fat (singular) from DB, fallback to fats (plural)
        // Meal object uses fats (plural) to match Meal type
        alternatives.push(...fullMeals.slice(0, 5).map((item) => {
          const itemFat = item.macros?.fat ?? item.macros?.fats ?? 0;
          return {
            id: item.id,
            name: item.name,
            restaurant: restaurant_name,
            calories: item.macros?.calories || 0,
            protein: item.macros?.protein || 0,
            carbs: item.macros?.carbs || 0,
            fats: itemFat, // Use "fats" (plural) to match Meal type
          };
        }));
      }
    }

    // ========== Map all swap types to unified response format ==========

    // 1. Map DB-backed modifications (existing shape)
    const mappedDBMods = modifications.map((mod, index) => ({
      id: mod.id || `mod-${index}`,
      label: mod.swapTitle,
      expectedEffect: toNonNumericEffect(
        mod.expectedEffect,
        fallbackEffectFromSwapType(mod.swapType)
      ),
      estimatedDelta: mod.estimatedDelta,
      confidenceLabel: mod.confidenceLabel,
      type: mod.type,
      swapType: mod.swapType,
      details: mod.details,
      modifierItemIds: mod.modifierItemIds,
      quantityConfig: mod.quantityConfig,
      impactLabels: [] as string[],
      source: 'db' as const,
      deltaMacros: {
        calories: mod.estimatedDelta.calories,
        protein: mod.estimatedDelta.protein,
        carbs: mod.estimatedDelta.carbs,
        fats: mod.estimatedDelta.fats,
      },
    })).filter((mod) => !hasDisallowedSwapPhrase(mod.label, mod.details));

    // Final validation for DB mods (production-safe)
    const validDBMods = mappedDBMods.filter(mod => {
      if (!mod.modifierItemIds || mod.modifierItemIds.length === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[swaps] Filtered out DB modification with no modifierItemIds:', mod.id);
        }
        return false;
      }
      const allIdsValid = mod.modifierItemIds.every(id =>
        modifierCandidates.some(candidate => candidate.id === id)
      );
      if (!allIdsValid) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[swaps] Filtered out DB modification with invalid modifierItemIds:', mod.id, mod.modifierItemIds);
        }
        return false;
      }
      return true;
    });

    // If DB-backed swaps exist, they are always the only swaps returned.
    // If none exist, use hybrid global/LLM swaps first, then fill with dish-aware generic fallbacks.
    const MAX_FINAL_SWAPS = 3;
    const hasDbSwaps = validDBMods.length > 0;
    const mappedHybridGlobal = hybridResult.globalSwaps
      .map((swap, index) => mapHybridGlobalSwap(swap, index))
      .filter((swap) => !hasDisallowedSwapPhrase(swap.label, swap.details));
    const mappedHybridLlm = hybridResult.llmSwaps
      .map((swap, index) => mapHybridLlmSwap(swap, index))
      .filter((swap) => !hasDisallowedSwapPhrase(swap.label, swap.details));

    const rankedHybridNonDb = dedupeSwapsByLabel(
      [...mappedHybridGlobal, ...mappedHybridLlm]
        .map((swap) => ({
          swap,
          score: scoreNonDbSwapCandidate(swap, meal_name, macroGoals),
        }))
        .sort((a, b) => b.score - a.score)
        .map(({ swap }) => swap)
    );

    const genericFallbackSwaps = hasDbSwaps
      ? []
      : buildDishAwareGenericSwaps(meal_name, restaurant_name, MAX_FINAL_SWAPS)
        .filter((swap) => !hasDisallowedSwapPhrase(swap.label, swap.details));

    const nonDbFinalPool = hasDbSwaps
      ? []
      : dedupeSwapsByLabel([...rankedHybridNonDb, ...genericFallbackSwaps]);

    const finalModifications = hasDbSwaps
      ? validDBMods.slice(0, MAX_FINAL_SWAPS)
      : nonDbFinalPool.slice(0, MAX_FINAL_SWAPS);

    let finalSource: 'db' | 'global' | 'llm' | 'mixed' = 'global';
    if (hasDbSwaps) {
      finalSource = 'db';
    } else {
      const nonDbSources = new Set(finalModifications.map((swap) => swap.source));
      if (nonDbSources.has('global') && nonDbSources.has('llm')) {
        finalSource = 'mixed';
      } else if (nonDbSources.has('llm')) {
        finalSource = 'llm';
      } else {
        finalSource = 'global';
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[swaps] Final response:', {
        dbMods: validDBMods.length,
        hybridGlobalCandidates: hybridResult.globalSwaps.length,
        hybridLlmCandidates: hybridResult.llmSwaps.length,
        rankedHybridSwaps: rankedHybridNonDb.length,
        genericFallbackSwaps: genericFallbackSwaps.length,
        finalTotal: finalModifications.length,
        source: finalSource,
      });
    }

    return NextResponse.json({
      modifications: finalModifications,
      alternatives: alternatives,
      source: finalSource,
    });
  } catch (error) {
    console.error('[swaps] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
