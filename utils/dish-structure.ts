/**
 * Dish Structure Detection
 * Extends the existing dish-compatibility inferDishType() with structural decomposition.
 * Maps each dish archetype to its expected structural components.
 *
 * Reuses inferDishType() from dish-compatibility.ts — does NOT duplicate keyword logic.
 */

import { inferDishType, type DishType } from './dish-compatibility';

// ---------- Extended dish type (adds smoothie & breakfast_plate) ----------

export type ExtendedDishType = DishType | 'smoothie' | 'breakfast_plate';

// ---------- Structural components ----------

export type DishComponent =
    | 'bun'
    | 'bread'
    | 'tortilla'
    | 'protein'
    | 'sauce'
    | 'side'
    | 'toppings'
    | 'base'         // rice, grains
    | 'greens'
    | 'dressing'
    | 'filling'
    | 'crust'
    | 'cheese'
    | 'base_liquid'  // smoothie base
    | 'fruit'
    | 'protein_powder'
    | 'eggs'
    | 'side_protein' // bacon, sausage
    | 'starch';      // hash browns, toast

export interface DishStructure {
    dishType: ExtendedDishType;
    components: DishComponent[];
}

// ---------- Structure Map ----------

const DISH_STRUCTURE_MAP: Record<ExtendedDishType, DishComponent[]> = {
    burger: ['bun', 'protein', 'sauce', 'side', 'toppings', 'cheese'],
    sub: ['bread', 'protein', 'sauce', 'toppings', 'cheese'],
    salad: ['greens', 'protein', 'dressing', 'toppings', 'cheese'],
    bowl: ['base', 'protein', 'sauce', 'toppings', 'cheese'],
    taco: ['tortilla', 'filling', 'sauce', 'toppings', 'cheese'],
    pizza: ['crust', 'sauce', 'cheese', 'toppings'],
    wrap: ['tortilla', 'filling', 'sauce', 'toppings'],
    pasta: ['base', 'protein', 'sauce', 'cheese'],
    breakfast: ['eggs', 'side_protein', 'starch', 'side'],
    smoothie: ['base_liquid', 'fruit', 'protein_powder'],
    breakfast_plate: ['eggs', 'side_protein', 'starch', 'side'],
    generic: ['protein', 'sauce', 'side'],
};

// ---------- Extended dish type detection ----------

/**
 * Detects the extended dish type from a meal name.
 * First checks for smoothie/breakfast_plate keywords, then falls back to
 * the existing inferDishType() from dish-compatibility.ts.
 */
export function inferExtendedDishType(mealName: string): ExtendedDishType {
    if (!mealName || typeof mealName !== 'string') {
        return 'generic';
    }

    const lower = mealName.toLowerCase();

    // Check extended types first (not covered by base inferDishType)
    if (/\b(smoothie|shake|protein shake|acai bowl|acaí)\b/i.test(lower)) {
        return 'smoothie';
    }
    if (/\b(breakfast plate|breakfast platter|eggs and|egg plate)\b/i.test(lower)) {
        return 'breakfast_plate';
    }

    // Fall back to existing inferDishType
    return inferDishType(mealName);
}

// ---------- Public API ----------

/**
 * Returns the structural decomposition of a dish given its name.
 * Uses keyword inference (no DB lookup needed).
 */
export function getDishStructure(mealName: string): DishStructure {
    const dishType = inferExtendedDishType(mealName);
    const components = DISH_STRUCTURE_MAP[dishType] || DISH_STRUCTURE_MAP.generic;

    return {
        dishType,
        components: [...components], // return copy
    };
}

/**
 * Checks if a dish has a specific structural component.
 */
export function dishHasComponent(mealName: string, component: DishComponent): boolean {
    const { components } = getDishStructure(mealName);
    return components.includes(component);
}
