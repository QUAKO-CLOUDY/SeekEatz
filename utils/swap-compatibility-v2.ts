/**
 * Swap Compatibility Filter v2
 * Filters global swap library entries based on dish structure, meal name keywords,
 * and conflict resolution.
 *
 * Extends the existing compatibility matrix (dish-compatibility.ts) with rules
 * specific to global swap entries.
 */

import type { SwapLibraryEntry } from './global-swap-library';
import type { DishType } from './dish-compatibility';
import { getDishStructure, type ExtendedDishType, type DishComponent } from './dish-structure';

// ---------- Component requirements per swap ----------
// Maps swap IDs to the dish component they require to make sense

const SWAP_REQUIRES_COMPONENT: Record<string, DishComponent> = {
    'struct-lettuce-wrap': 'bun',
    'struct-no-bun': 'bun',
    'struct-half-bun': 'bun',
    'struct-half-rice': 'base',
    'struct-extra-veg': 'base',
    'struct-half-pasta': 'base',
    'struct-no-tortilla': 'tortilla',
};

// ---------- Cooking method keyword matching ----------

const FRIED_KEYWORDS = /\b(fried|crispy|battered|breaded|crunchy|deep.?fried|pan.?fried)\b/i;

// ---------- Filtering ----------

/**
 * Filters a list of swap library entries to only those compatible with
 * the given dish type and meal name.
 *
 * Rules:
 * 1. Swap must list the dish type in its applicableDishTypes (or 'generic')
 * 2. If swap has requiresMealKeywords, at least one must appear in mealName
 * 3. If swap requires a structural component, the dish must have it
 * 4. Conflicts: if two swaps conflict, only the first (by library order) is kept
 */
export function filterCompatibleSwaps(
    swaps: SwapLibraryEntry[],
    dishType: DishType | ExtendedDishType,
    mealName: string
): SwapLibraryEntry[] {
    const { components } = getDishStructure(mealName);
    const lowerMealName = mealName.toLowerCase();

    // Phase 1: Filter by applicability
    const applicable = swaps.filter((swap) => {
        // Rule 1: Dish type match
        const dishTypeMatch =
            swap.applicableDishTypes.includes(dishType as DishType) ||
            swap.applicableDishTypes.includes('generic');
        if (!dishTypeMatch) return false;

        // Rule 2: Meal keyword requirement (cooking method swaps)
        if (swap.requiresMealKeywords && swap.requiresMealKeywords.length > 0) {
            const hasKeyword = swap.requiresMealKeywords.some((kw) =>
                lowerMealName.includes(kw.toLowerCase())
            );
            if (!hasKeyword) return false;
        }

        // Rule 3: Structural component requirement
        const requiredComponent = SWAP_REQUIRES_COMPONENT[swap.id];
        if (requiredComponent && !components.includes(requiredComponent)) {
            return false;
        }

        return true;
    });

    // Phase 2: Conflict resolution (first-wins)
    const selectedIds = new Set<string>();
    const result: SwapLibraryEntry[] = [];

    for (const swap of applicable) {
        // Check if this swap conflicts with any already selected
        const hasConflict =
            swap.conflictsWith?.some((conflictId) => selectedIds.has(conflictId)) ?? false;
        if (hasConflict) continue;

        selectedIds.add(swap.id);
        result.push(swap);
    }

    return result;
}

/**
 * Checks if a cooking-method swap is relevant for a given meal name.
 * Returns true if the meal name contains any fried/crispy/battered keywords.
 */
export function hasFriedKeywords(mealName: string): boolean {
    return FRIED_KEYWORDS.test(mealName);
}
