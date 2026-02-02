import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { generateSwapModifications, type MacroGoals } from '@/utils/swap-rule-engine';
import { getModifierCandidates } from '@/utils/modifier-candidates';
/**
 * Swap endpoint: Returns modification suggestions (PRIMARY) and alternative menu items (SECONDARY)
 * 
 * Response format:
 * {
 *   modifications: [...],  // Rule-based modification suggestions
 *   alternatives: [...]     // DB-only alternate menu items (fallback)
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { restaurant_name, meal_id, meal_name, meal_macros, user_goals, calorieCap, minProtein, maxCarbs, maxFat } = body;

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

    // ========== PRIMARY: Generate rule-based modifications ==========
    // Step 1: Fetch modifier candidates from DB (same restaurant only)
    const modifierCandidates = await getModifierCandidates(supabase, restaurant_name);
    
    // Log in dev
    if (process.env.NODE_ENV === 'development') {
      console.log('[swaps] Modifier candidates:', {
        restaurant_name,
        count: modifierCandidates.length,
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

    // Generate modifications using rule engine (DB-backed, async)
    const modifications = await generateSwapModifications(
      meal_name,
      meal_macros || {},
      macroGoals,
      restaurant_name,
      modifierCandidates
    );

    // Validate modifications (dev-only assertion)
    if (process.env.NODE_ENV === 'development') {
      const validModifications = modifications.filter(mod => {
        // Must have modifierItemIds
        if (!mod.modifierItemIds || mod.modifierItemIds.length === 0) {
          console.warn('[swaps] Modification missing modifierItemIds:', mod.id);
          return false;
        }

        // All modifierItemIds must exist in candidate list
        const allIdsValid = mod.modifierItemIds.every(id => 
          modifierCandidates.some(candidate => candidate.id === id)
        );
        if (!allIdsValid) {
          console.warn('[swaps] Modification has invalid modifierItemIds:', mod.id, mod.modifierItemIds);
          return false;
        }

        // DeltaMacros must be all numbers (no NaN)
        const delta = mod.estimatedDelta;
        if (isNaN(delta.calories) || isNaN(delta.protein) || isNaN(delta.carbs) || isNaN(delta.fats)) {
          console.warn('[swaps] Modification has NaN in deltaMacros:', mod.id, delta);
          return false;
        }

        return true;
      });

      if (validModifications.length !== modifications.length) {
        const invalidCount = modifications.length - validModifications.length;
        console.error(`[swaps] CRITICAL: ${invalidCount} modification(s) failed validation!`);
        // In dev, throw to catch regressions early
        throw new Error(`[swaps] ${invalidCount} modification(s) failed validation`);
      }
    }

    // ========== SECONDARY: Find DB-only alternate menu items ==========
    // Alternatives are ONLY returned as fallback when no good modifications exist
    // Alternatives must be: same restaurant, same dish type, and move toward user's constraints
    const alternatives: any[] = [];

    // Only fetch alternatives if we have NO modifications (true fallback scenario)
    // Modifications are always preferred over alternatives
    const shouldFetchAlternatives = modifications.length === 0;

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
        const fullMeals = allItems.filter((item: any) => {
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
        alternatives.push(...fullMeals.slice(0, 5).map((item: any) => {
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

    // Map modifications to response format
    // All modifications are DB-backed and validated (estimatedDelta is required)
    const mappedModifications = modifications.map((mod, index) => ({
      id: mod.id || `mod-${index}`,
      label: mod.swapTitle,
      expectedEffect: mod.expectedEffect,
      estimatedDelta: mod.estimatedDelta,
      confidenceLabel: mod.confidenceLabel,
      type: mod.type,
      swapType: mod.swapType, // Goal-aware type
      details: mod.details,
      modifierItemIds: mod.modifierItemIds, // Required, always present
      deltaMacros: {
        calories: mod.estimatedDelta.calories,
        protein: mod.estimatedDelta.protein,
        carbs: mod.estimatedDelta.carbs,
        fats: mod.estimatedDelta.fats, // Use "fats" (plural) to match Meal type
      },
    }));

    // Final validation: ensure all modifications are valid (production-safe)
    const validModifications = mappedModifications.filter(mod => {
      // modifierItemIds must exist and be non-empty
      if (!mod.modifierItemIds || mod.modifierItemIds.length === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[swaps] Filtered out modification with no modifierItemIds:', mod.id);
        }
        return false;
      }

      // All modifierItemIds must exist in candidate list
      const allIdsValid = mod.modifierItemIds.every(id => 
        modifierCandidates.some(candidate => candidate.id === id)
      );
      if (!allIdsValid) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[swaps] Filtered out modification with invalid modifierItemIds:', mod.id, mod.modifierItemIds);
        }
        return false;
      }

      return true;
    });

    // Dev assertion: all returned swaps must be valid
    if (process.env.NODE_ENV === 'development' && validModifications.length !== mappedModifications.length) {
      const invalidCount = mappedModifications.length - validModifications.length;
      console.error(`[swaps] CRITICAL: ${invalidCount} modification(s) filtered out due to invalid modifierItemIds!`);
    }

    return NextResponse.json({
      modifications: validModifications,
      alternatives: alternatives,
    });
  } catch (error) {
    console.error('[swaps] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
