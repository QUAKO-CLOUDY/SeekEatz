/**
 * Global Swap Library
 * Universal restaurant modification suggestions organized by category.
 * Each entry is dish-type-aware with heuristic macro impact ranges.
 *
 * This is a STATIC, DETERMINISTIC library — no DB or LLM calls.
 */

import type { DishType } from './dish-compatibility';

// ---------- Types ----------

export type SwapCategory =
    | 'SAUCE_REDUCTION'
    | 'STRUCTURE_SWAP'
    | 'COOKING_METHOD'
    | 'PROTEIN_SCALING'
    | 'PORTION_CONTROL'
    | 'SIDE_REPLACEMENT';

export interface HeuristicRange {
    /** [min, max] — negative means reduction */
    calories?: [number, number];
    protein?: [number, number];
    carbs?: [number, number];
    fats?: [number, number];
}

export interface SwapLibraryEntry {
    id: string;
    label: string;
    category: SwapCategory;
    /** Dish types this swap can apply to */
    applicableDishTypes: ExtendedDishType[];
    /** Human-readable impact labels */
    impactLabels: string[];
    /** Heuristic macro delta ranges (used when no DB data exists) */
    heuristicDelta: HeuristicRange;
    /** IDs of swaps that conflict with this one */
    conflictsWith?: string[];
    /** Extra detail text shown to user */
    details: string;
    /** Keywords that must appear in the meal name for this swap to apply (optional) */
    requiresMealKeywords?: string[];
}

// Extended DishType list (adds smoothie & breakfast_plate to existing set)
export type ExtendedDishType = DishType | 'smoothie' | 'breakfast_plate';

// ---------- Library ----------

export const GLOBAL_SWAP_LIBRARY: SwapLibraryEntry[] = [
    // ========== SAUCE_REDUCTION ==========
    // NOTE: These are ordered so dish-specific swaps appear before generic ones.
    // filterCompatibleSwaps + one-per-category selection takes the first matching entry.

    // Dish-specific: drizzle for salads, bowls, pasta, pizza
    {
        id: 'sauce-drizzle',
        label: 'Dressing on the side',
        category: 'SAUCE_REDUCTION',
        applicableDishTypes: ['salad', 'bowl', 'pasta', 'pizza'],
        impactLabels: ['Reduce calories', 'Reduce fat'],
        heuristicDelta: { calories: [-80, -40], fats: [-8, -3] },
        conflictsWith: ['sauce-none', 'sauce-side'],
        details: 'Dressing or sauce on the side so you control how much you use',
    },
    // Dish-specific: dip-instead-of-coating for burger/sub (more precise than "light sauce")
    {
        id: 'dip-instead-of-coating',
        label: 'Dip instead of coating',
        category: 'SAUCE_REDUCTION',
        applicableDishTypes: ['burger', 'sub', 'wrap'],
        impactLabels: ['Reduce calories', 'Reduce fat'],
        heuristicDelta: { calories: [-80, -30], fats: [-7, -3] },
        conflictsWith: ['sauce-none', 'sauce-light'],
        details: 'Dip on the side instead of coating the item',
    },
    // Generic: sauce on the side (taco, wrap, sub, bowl, pasta not covered above)
    {
        id: 'sauce-side',
        label: 'Sauce on the side',
        category: 'SAUCE_REDUCTION',
        applicableDishTypes: ['taco'],
        impactLabels: ['Reduce calories', 'Reduce fat'],
        heuristicDelta: { calories: [-80, -30], fats: [-8, -3] },
        conflictsWith: ['sauce-light', 'sauce-none'],
        details: 'Sauce on the side lets you control how much you use',
    },
    // Fallback generic sauce swap — only reached if no dish-specific swap fired
    {
        id: 'sauce-light',
        label: 'Light sauce',
        category: 'SAUCE_REDUCTION',
        applicableDishTypes: ['burger', 'sub', 'bowl', 'taco', 'wrap', 'pasta', 'salad'],
        impactLabels: ['Reduce calories', 'Reduce fat'],
        heuristicDelta: { calories: [-60, -30], fats: [-5, -2] },
        conflictsWith: ['dip-instead-of-coating', 'sauce-drizzle', 'sauce-side'],
        details: 'Ask for light sauce to cut calories and fat',
    },
    {
        id: 'sauce-none',
        label: 'No sauce / no glaze',
        category: 'SAUCE_REDUCTION',
        applicableDishTypes: ['burger', 'sub', 'bowl', 'taco', 'wrap', 'pasta', 'salad'],
        impactLabels: ['Reduce calories', 'Reduce fat', 'Reduce sugar'],
        heuristicDelta: { calories: [-120, -40], fats: [-10, -3] },
        conflictsWith: ['sauce-light', 'sauce-side'],
        details: 'Skip the sauce entirely for maximum calorie savings',
    },

    // ========== STRUCTURE_SWAP ==========
    {
        id: 'struct-lettuce-wrap',
        label: 'Lettuce wrap instead of bun',
        category: 'STRUCTURE_SWAP',
        applicableDishTypes: ['burger', 'sub', 'generic'],
        impactLabels: ['Lower carbs', 'Reduce calories'],
        heuristicDelta: { calories: [-150, -100], carbs: [-25, -15] },
        conflictsWith: ['struct-no-bun', 'struct-half-bun'],
        details: 'Replace the bun with lettuce wrap to cut carbs',
    },
    {
        id: 'struct-no-bun',
        label: 'No bun (protein style)',
        category: 'STRUCTURE_SWAP',
        applicableDishTypes: ['burger', 'generic'],
        impactLabels: ['Lower carbs', 'Reduce calories'],
        heuristicDelta: { calories: [-150, -120], carbs: [-30, -20] },
        conflictsWith: ['struct-lettuce-wrap', 'struct-half-bun'],
        details: 'Remove the bun entirely',
    },
    {
        id: 'struct-half-bun',
        label: 'Half bun / open faced',
        category: 'STRUCTURE_SWAP',
        applicableDishTypes: ['burger', 'sub', 'generic'],
        impactLabels: ['Lower carbs', 'Reduce calories'],
        heuristicDelta: { calories: [-75, -50], carbs: [-15, -10] },
        conflictsWith: ['struct-lettuce-wrap', 'struct-no-bun'],
        details: 'Half the bun, half the carbs',
    },
    {
        id: 'struct-half-rice',
        label: 'Half rice',
        category: 'STRUCTURE_SWAP',
        applicableDishTypes: ['bowl', 'taco', 'generic'],
        impactLabels: ['Lower carbs', 'Reduce calories'],
        heuristicDelta: { calories: [-110, -80], carbs: [-22, -15] },
        details: 'Half the rice for fewer carbs',
    },
    {
        id: 'struct-extra-veg',
        label: 'Extra vegetables instead of rice',
        category: 'STRUCTURE_SWAP',
        applicableDishTypes: ['bowl', 'taco', 'generic'],
        impactLabels: ['Lower carbs', 'Reduce calories'],
        heuristicDelta: { calories: [-150, -100], carbs: [-35, -25] },
        conflictsWith: ['struct-half-rice'],
        details: 'Sub veggies for rice to cut carbs significantly',
    },
    {
        id: 'struct-half-pasta',
        label: 'Half pasta',
        category: 'STRUCTURE_SWAP',
        applicableDishTypes: ['pasta', 'generic'],
        impactLabels: ['Lower carbs', 'Reduce calories'],
        heuristicDelta: { calories: [-150, -100], carbs: [-30, -20] },
        details: 'Half the pasta portion for fewer carbs',
    },
    {
        id: 'struct-no-tortilla',
        label: 'Bowl instead of burrito (no tortilla)',
        category: 'STRUCTURE_SWAP',
        applicableDishTypes: ['taco', 'wrap', 'generic'],
        impactLabels: ['Lower carbs', 'Reduce calories'],
        heuristicDelta: { calories: [-120, -80], carbs: [-25, -15] },
        details: 'Skip the tortilla for a burrito bowl style',
    },

    // ========== COOKING_METHOD ==========
    {
        id: 'cook-grilled',
        label: 'Grilled instead of fried',
        category: 'COOKING_METHOD',
        applicableDishTypes: ['burger', 'sub', 'bowl', 'salad', 'wrap', 'taco', 'generic'],
        impactLabels: ['Reduce calories', 'Reduce fat', 'Lighter preparation'],
        heuristicDelta: { calories: [-150, -80], fats: [-12, -6] },
        requiresMealKeywords: ['fried', 'crispy', 'battered', 'breaded', 'crunchy'],
        details: 'Swap fried preparation for grilled to reduce fat and calories',
    },
    {
        id: 'cook-baked',
        label: 'Baked instead of fried',
        category: 'COOKING_METHOD',
        applicableDishTypes: ['burger', 'sub', 'bowl', 'salad', 'wrap', 'taco', 'generic'],
        impactLabels: ['Reduce calories', 'Reduce fat', 'Lighter preparation'],
        heuristicDelta: { calories: [-120, -60], fats: [-10, -5] },
        conflictsWith: ['cook-grilled'],
        requiresMealKeywords: ['fried', 'crispy', 'battered', 'breaded', 'crunchy'],
        details: 'Swap fried for baked preparation',
    },
    {
        id: 'cook-no-breading',
        label: 'No breading',
        category: 'COOKING_METHOD',
        applicableDishTypes: ['burger', 'sub', 'bowl', 'salad', 'wrap', 'taco', 'generic'],
        impactLabels: ['Reduce calories', 'Lower carbs'],
        heuristicDelta: { calories: [-100, -50], carbs: [-15, -8] },
        requiresMealKeywords: ['breaded', 'crispy', 'battered', 'crunchy', 'fried'],
        details: 'Remove the breading to save calories and carbs',
    },
    {
        id: 'cook-dry-rub',
        label: 'Dry rub instead of sauce',
        category: 'COOKING_METHOD',
        applicableDishTypes: ['burger', 'sub', 'bowl', 'taco', 'wrap', 'generic'],
        impactLabels: ['Reduce calories', 'Reduce fat', 'Reduce sauce calories'],
        heuristicDelta: { calories: [-80, -30], fats: [-6, -2] },
        conflictsWith: ['sauce-none'],
        requiresMealKeywords: ['glazed', 'sauced', 'bbq', 'barbecue', 'honey', 'teriyaki', 'buffalo', 'wing', 'ribs', 'pulled', 'smoked'],
        details: 'Dry rub gives flavor without the sauce calories',
    },

    // ========== PROTEIN_SCALING ==========
    {
        id: 'protein-extra',
        label: 'Add extra protein',
        category: 'PROTEIN_SCALING',
        applicableDishTypes: ['burger', 'sub', 'bowl', 'salad', 'wrap', 'taco', 'pasta'],
        impactLabels: ['Higher protein'],
        heuristicDelta: { calories: [80, 200], protein: [15, 30] },
        conflictsWith: ['protein-double'],
        details: 'Add an extra serving of protein',
    },
    {
        id: 'protein-double',
        label: 'Double protein',
        category: 'PROTEIN_SCALING',
        applicableDishTypes: ['burger', 'sub', 'bowl', 'salad', 'wrap', 'taco'],
        impactLabels: ['Higher protein'],
        heuristicDelta: { calories: [150, 350], protein: [25, 50] },
        conflictsWith: ['protein-extra'],
        details: 'Double the protein for serious macros',
    },

    // ========== PORTION_CONTROL ==========
    {
        id: 'portion-half',
        label: 'Half portion',
        category: 'PORTION_CONTROL',
        applicableDishTypes: ['pasta', 'bowl', 'salad'],
        impactLabels: ['Reduce calories', 'Smaller portion'],
        heuristicDelta: { calories: [-300, -150], protein: [-15, -8], carbs: [-25, -12], fats: [-10, -5] },
        details: 'Half portion cuts everything roughly in half',
    },
    {
        id: 'portion-skip-side',
        label: 'Skip the side',
        category: 'PORTION_CONTROL',
        // Only for items that typically come with fries/chips
        applicableDishTypes: ['burger', 'sub', 'wrap', 'taco'],
        impactLabels: ['Reduce calories', 'Smaller portion'],
        heuristicDelta: { calories: [-250, -100], carbs: [-20, -10], fats: [-10, -4] },
        details: 'Skip fries or chips that come with the meal',
    },

    // ========== SIDE_REPLACEMENT ==========
    {
        id: 'side-salad',
        label: 'Side salad instead of fries',
        category: 'SIDE_REPLACEMENT',
        applicableDishTypes: ['burger', 'sub', 'wrap', 'taco'],
        impactLabels: ['Reduce calories', 'Reduce fat'],
        heuristicDelta: { calories: [-250, -150], fats: [-15, -8] },
        conflictsWith: ['side-grilled-veg', 'side-fruit', 'portion-skip-side'],
        details: 'Swap fries for a side salad',
    },
    {
        id: 'side-grilled-veg',
        label: 'Grilled vegetables instead of fries',
        category: 'SIDE_REPLACEMENT',
        applicableDishTypes: ['burger', 'sub', 'wrap', 'taco'],
        impactLabels: ['Reduce calories', 'Reduce fat'],
        heuristicDelta: { calories: [-230, -130], fats: [-14, -7] },
        conflictsWith: ['side-salad', 'side-fruit', 'portion-skip-side'],
        details: 'Swap fries for grilled vegetables',
    },
    {
        id: 'side-fruit',
        label: 'Fruit instead of chips',
        category: 'SIDE_REPLACEMENT',
        // Only subs and wraps commonly come with chips/crisps as a default side.
        // 'generic' intentionally removed to prevent this from appearing on bagels,
        // bowls, smoothies, pizzas, etc. that would never be served with chips.
        applicableDishTypes: ['sub', 'wrap'],
        impactLabels: ['Reduce calories', 'Reduce fat'],
        heuristicDelta: { calories: [-150, -80], fats: [-10, -5] },
        conflictsWith: ['side-salad', 'side-grilled-veg', 'portion-skip-side'],
        details: 'Swap the chips side for fresh fruit to cut fat and calories',
    },

    // ========== BREAKFAST-SPECIFIC SWAPS ==========
    {
        id: 'breakfast-egg-whites',
        label: 'Egg whites instead of whole eggs',
        category: 'SAUCE_REDUCTION', // treat as a component swap
        applicableDishTypes: ['breakfast', 'breakfast_plate'],
        impactLabels: ['Reduce calories', 'Reduce fat'],
        heuristicDelta: { calories: [-80, -40], fats: [-8, -4], protein: [-2, 0] },
        details: 'Egg whites cut fat and calories while keeping protein',
    },
    {
        id: 'breakfast-fruit-side',
        label: 'Fresh fruit instead of hash browns',
        category: 'SIDE_REPLACEMENT',
        applicableDishTypes: ['breakfast', 'breakfast_plate'],
        impactLabels: ['Lower carbs', 'Reduce fat', 'Reduce calories'],
        heuristicDelta: { calories: [-150, -80], fats: [-10, -5], carbs: [-10, -5] },
        details: 'Swap hash browns for fresh fruit to save calories and fat',
    },
    {
        id: 'breakfast-no-syrup',
        label: 'No syrup / syrup on the side',
        category: 'SAUCE_REDUCTION',
        applicableDishTypes: ['breakfast'],
        impactLabels: ['Reduce calories', 'Reduce sugar'],
        heuristicDelta: { calories: [-120, -60], carbs: [-30, -15] },
        details: 'Skip or limit syrup to reduce sugar and calories significantly',
    },
    {
        id: 'breakfast-skip-bacon',
        label: 'Skip the bacon or sausage',
        category: 'PORTION_CONTROL',
        applicableDishTypes: ['breakfast', 'breakfast_plate'],
        impactLabels: ['Reduce calories', 'Reduce fat'],
        heuristicDelta: { calories: [-150, -80], fats: [-12, -6] },
        details: 'Skipping processed meats cuts significant fat and sodium',
    },

    // ========== SMOOTHIE-SPECIFIC SWAPS ==========
    {
        id: 'smoothie-smaller-size',
        label: 'Small size instead of large',
        category: 'PORTION_CONTROL',
        applicableDishTypes: ['smoothie'],
        impactLabels: ['Reduce calories', 'Smaller portion'],
        heuristicDelta: { calories: [-120, -60], carbs: [-20, -10], protein: [-5, -2] },
        details: 'Downsize to a small to significantly cut calories',
    },
    {
        id: 'smoothie-no-sweetener',
        label: 'No added sugar / no honey',
        category: 'SAUCE_REDUCTION',
        applicableDishTypes: ['smoothie'],
        impactLabels: ['Reduce calories', 'Reduce sugar'],
        heuristicDelta: { calories: [-80, -40], carbs: [-20, -10] },
        details: 'Skip added sweeteners — the fruit already provides natural sugar',
    },
    {
        id: 'smoothie-protein-boost',
        label: 'Add protein powder',
        category: 'PROTEIN_SCALING',
        applicableDishTypes: ['smoothie'],
        impactLabels: ['Higher protein'],
        heuristicDelta: { calories: [100, 150], protein: [20, 25] },
        details: 'Add a scoop of protein powder to boost protein content',
    },
];

// ---------- Accessor ----------

/**
 * Returns all swap library entries applicable to a given dish type.
 * 'generic' entries are ONLY included when the dish type is 'generic' itself,
 * ensuring dish-specific results for known types.
 */
export function getApplicableSwaps(dishType: DishType | ExtendedDishType): SwapLibraryEntry[] {
    return GLOBAL_SWAP_LIBRARY.filter(
        (entry) => entry.applicableDishTypes.includes(dishType as DishType)
    );
}

/**
 * Returns all swap library entries for a given category.
 */
export function getSwapsByCategory(category: SwapCategory): SwapLibraryEntry[] {
    return GLOBAL_SWAP_LIBRARY.filter((entry) => entry.category === category);
}
