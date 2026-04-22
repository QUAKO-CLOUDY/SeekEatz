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

function buildGenericFallbackSwaps() {
  return [
    {
      id: 'generic-swap-sauce-side',
      label: withIfAvailable('Sauce on the side'),
      expectedEffect: 'Lighter sauce usage',
      estimatedDelta: ZERO_DELTA,
      confidenceLabel: 'Ask if available' as const,
      type: 'modify' as const,
      swapType: 'neutral' as const,
      details: 'General swap recommendation when restaurant-specific modifiers are unavailable.',
      modifierItemIds: [] as string[],
      impactLabels: ['Recommended adjustment'],
      source: 'global' as const,
      deltaMacros: ZERO_DELTA,
    },
    {
      id: 'generic-swap-grilled',
      label: withIfAvailable('Grilled instead of fried'),
      expectedEffect: 'Lighter preparation',
      estimatedDelta: ZERO_DELTA,
      confidenceLabel: 'Ask if available' as const,
      type: 'modify' as const,
      swapType: 'neutral' as const,
      details: 'General swap recommendation when restaurant-specific modifiers are unavailable.',
      modifierItemIds: [] as string[],
      impactLabels: ['Recommended adjustment'],
      source: 'global' as const,
      deltaMacros: ZERO_DELTA,
    },
    {
      id: 'generic-swap-side',
      label: withIfAvailable('Side salad instead of fries'),
      expectedEffect: 'Lighter side option',
      estimatedDelta: ZERO_DELTA,
      confidenceLabel: 'Ask if available' as const,
      type: 'modify' as const,
      swapType: 'neutral' as const,
      details: 'General swap recommendation when restaurant-specific modifiers are unavailable.',
      modifierItemIds: [] as string[],
      impactLabels: ['Recommended adjustment'],
      source: 'global' as const,
      deltaMacros: ZERO_DELTA,
    },
  ];
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
    }));

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

    // 2. Map global swaps to same response shape (modifierItemIds = [], heuristic deltas)
    // Simplify impactLabels to show only the most important one
    const mappedGlobalSwaps = hybridResult.globalSwaps.map((gs) => {
      // Get the most impactful label (prioritize calorie/protein changes)
      const primaryLabel = gs.impactLabels.find(l => 
        l.toLowerCase().includes('calorie') || 
        l.toLowerCase().includes('protein')
      ) || gs.impactLabels[0] || '';
      
      return {
        id: gs.id,
        label: withIfAvailable(gs.label),
        expectedEffect: toNonNumericEffect(primaryLabel, 'Recommended adjustment'),
        estimatedDelta: ZERO_DELTA,
        confidenceLabel: gs.impactType === 'deterministic' ? 'Likely available' as const : 'Ask if available' as const,
        type: 'modify' as const,
        swapType: 'neutral' as const,
        details: gs.details,
        modifierItemIds: [] as string[], // Global swaps have no DB modifier IDs
        impactLabels: [primaryLabel], // Keep only the primary label
        source: 'global' as const,
        deltaMacros: ZERO_DELTA,
      };
    });

    // 3. Map LLM swaps to same response shape
    // Simplify impactLabels to show only the most important one
    const mappedLLMSwaps = hybridResult.llmSwaps.map((ls) => {
      // Get the most impactful label (prioritize calorie/protein changes)
      const primaryLabel = ls.impactLabels.find(l => 
        l.toLowerCase().includes('calorie') || 
        l.toLowerCase().includes('protein')
      ) || ls.impactLabels[0] || '';
      
      return {
        id: ls.id,
        label: withIfAvailable(ls.label),
        expectedEffect: toNonNumericEffect(primaryLabel, 'Recommended adjustment'),
        estimatedDelta: ZERO_DELTA,
        confidenceLabel: 'Ask if available' as const,
        type: 'modify' as const,
        swapType: 'neutral' as const,
        details: ls.details,
        modifierItemIds: [] as string[],
        impactLabels: [primaryLabel], // Keep only the primary label
        source: 'llm' as const,
        deltaMacros: ZERO_DELTA,
      };
    });

    // Combine all swap types into unified modifications array
    const allModifications = [...validDBMods, ...mappedGlobalSwaps, ...mappedLLMSwaps];
    
    // Limit to 2-3 swaps total (already limited by hybrid generator, but ensure here too)
    const MAX_FINAL_SWAPS = 3;
    let finalModifications = allModifications.slice(0, MAX_FINAL_SWAPS);
    if (finalModifications.length === 0) {
      finalModifications = buildGenericFallbackSwaps();
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[swaps] Final response:', {
        dbMods: validDBMods.length,
        globalSwaps: mappedGlobalSwaps.length,
        llmSwaps: mappedLLMSwaps.length,
        total: allModifications.length,
        finalTotal: finalModifications.length,
        source: hybridResult.source,
      });
    }

    return NextResponse.json({
      modifications: finalModifications,
      alternatives: alternatives,
      source: hybridResult.source,
    });
  } catch (error) {
    console.error('[swaps] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
