/**
 * Hybrid Swap Generator (Orchestrator)
 * Main entry point for v2 swap engine.
 *
 * Pipeline:
 * 1. Calls existing DB-backed generateSwapModifications()
 * 2. Calls global swap library (dish type → compatible swaps → impact estimation)
 * 3. Merges & deduplicates (DB-backed swaps take priority)
 * 4. Limits output to configurable max (default 5), 1-per-category
 * 5. Optionally refines heuristic deltas via batched LLM call (ENABLE_SWAP_LLM_MACROS)
 * 6. Falls back to LLM swap generation if total swap count is 0
 */

import type { Macros } from '@/lib/macro-utils';
import type { ModifierCandidate } from './modifier-candidates';
import {
    generateSwapModifications,
    type SwapModification,
    type MacroGoals,
} from './swap-rule-engine';
import { getApplicableSwaps, type SwapLibraryEntry } from './global-swap-library';
import { filterCompatibleSwaps } from './swap-compatibility-v2';
import { estimateMacroImpact, type MacroImpactResult } from './macro-impact-estimator';
import { inferExtendedDishType } from './dish-structure';
import { generateLLMSwaps, refineMacrosViaLLM, type LLMSwapSuggestion } from './swap-llm-fallback';
import type { DishType } from './dish-compatibility';

// ---------- Types ----------

export interface GlobalSwapSuggestion {
    id: string;
    label: string;
    category: string;
    impactLabels: string[];
    details: string;
    impactType: 'deterministic' | 'heuristic';
    estimatedDelta: Macros;
    source: 'global';
}

export interface HybridSwapResult {
    /** DB-backed modification swaps (existing shape) */
    modifications: SwapModification[];
    /** New global swap suggestions */
    globalSwaps: GlobalSwapSuggestion[];
    /** LLM-generated swaps (only if fallback triggered) */
    llmSwaps: LLMSwapSuggestion[];
    /** Source indicator for observability */
    source: 'db' | 'global' | 'llm' | 'mixed';
}

// ---------- Configuration ----------

const MAX_TOTAL_SWAPS = 3; // Limit to 2-3 swaps for better UX
const MAX_GLOBAL_SWAPS = 5; // Max global swaps before DB+global merge

// ---------- Swap prioritization ----------

/**
 * Dish-type-specific category priority orders.
 * Lower index = higher priority for that dish type.
 * This ensures each dish type gets a DIFFERENT leading swap, not the same generic sauce swap.
 */
const DISH_CATEGORY_PRIORITY: Partial<Record<string, string[]>> = {
    burger: ['STRUCTURE_SWAP', 'SIDE_REPLACEMENT', 'SAUCE_REDUCTION', 'PROTEIN_SCALING', 'PORTION_CONTROL', 'COOKING_METHOD'],
    sub: ['STRUCTURE_SWAP', 'SAUCE_REDUCTION', 'SIDE_REPLACEMENT', 'PROTEIN_SCALING', 'PORTION_CONTROL', 'COOKING_METHOD'],
    salad: ['SAUCE_REDUCTION', 'PROTEIN_SCALING', 'PORTION_CONTROL', 'STRUCTURE_SWAP', 'SIDE_REPLACEMENT', 'COOKING_METHOD'],
    bowl: ['STRUCTURE_SWAP', 'PROTEIN_SCALING', 'SAUCE_REDUCTION', 'PORTION_CONTROL', 'SIDE_REPLACEMENT', 'COOKING_METHOD'],
    taco: ['STRUCTURE_SWAP', 'SAUCE_REDUCTION', 'PROTEIN_SCALING', 'SIDE_REPLACEMENT', 'PORTION_CONTROL', 'COOKING_METHOD'],
    wrap: ['STRUCTURE_SWAP', 'SAUCE_REDUCTION', 'PROTEIN_SCALING', 'SIDE_REPLACEMENT', 'PORTION_CONTROL', 'COOKING_METHOD'],
    pasta: ['STRUCTURE_SWAP', 'SAUCE_REDUCTION', 'PORTION_CONTROL', 'PROTEIN_SCALING', 'SIDE_REPLACEMENT', 'COOKING_METHOD'],
    pizza: ['SAUCE_REDUCTION', 'PORTION_CONTROL', 'STRUCTURE_SWAP', 'PROTEIN_SCALING', 'SIDE_REPLACEMENT', 'COOKING_METHOD'],
    smoothie: ['PORTION_CONTROL', 'SAUCE_REDUCTION', 'PROTEIN_SCALING', 'STRUCTURE_SWAP', 'SIDE_REPLACEMENT', 'COOKING_METHOD'],
    breakfast: ['SAUCE_REDUCTION', 'PORTION_CONTROL', 'SIDE_REPLACEMENT', 'PROTEIN_SCALING', 'STRUCTURE_SWAP', 'COOKING_METHOD'],
    breakfast_plate: ['SAUCE_REDUCTION', 'PORTION_CONTROL', 'SIDE_REPLACEMENT', 'PROTEIN_SCALING', 'STRUCTURE_SWAP', 'COOKING_METHOD'],
    generic: ['SIDE_REPLACEMENT', 'SAUCE_REDUCTION', 'PORTION_CONTROL', 'STRUCTURE_SWAP', 'PROTEIN_SCALING', 'COOKING_METHOD'],
};

/** Fallback priority when dish type is not in the map. */
const DEFAULT_CATEGORY_PRIORITY = ['SAUCE_REDUCTION', 'STRUCTURE_SWAP', 'SIDE_REPLACEMENT', 'PROTEIN_SCALING', 'PORTION_CONTROL', 'COOKING_METHOD'];

function getCategoryPriorityScore(category: string, dishType: string): number {
    const order = DISH_CATEGORY_PRIORITY[dishType] ?? DEFAULT_CATEGORY_PRIORITY;
    const idx = order.indexOf(category);
    return idx === -1 ? 99 : idx;
}

function swapPriorityScore(swap: SwapLibraryEntry, impact: MacroImpactResult, dishType: string): number {
    const categoryScore = getCategoryPriorityScore(swap.category, dishType);
    // Boost deterministic swaps (have real macro data)
    const determinismBonus = impact.impactType === 'deterministic' ? -0.5 : 0;
    return categoryScore + determinismBonus;
}


// ---------- Deduplication ----------

/**
 * Checks if a global swap is already covered by a DB-backed modification.
 * Prevents showing "Lettuce wrap instead of bun" as global swap when the
 * DB engine already produced "Swap bun for lettuce wrap".
 */
function isAlreadyCoveredByDBSwap(
    globalSwap: SwapLibraryEntry,
    dbMods: SwapModification[]
): boolean {
    if (dbMods.length === 0) return false;

    // Check by category overlap
    for (const mod of dbMods) {
        const modLabel = mod.swapTitle.toLowerCase();

        // Structure swaps: check if DB already handles bun/wrap
        if (globalSwap.category === 'STRUCTURE_SWAP') {
            if (
                (globalSwap.id.includes('lettuce') && modLabel.includes('lettuce')) ||
                (globalSwap.id.includes('bun') && (modLabel.includes('bun') || modLabel.includes('bread')))
            ) {
                return true;
            }
        }

        // Protein swaps: check if DB already handles protein add
        if (globalSwap.category === 'PROTEIN_SCALING') {
            if (mod.swapType === 'higherProtein') {
                return true;
            }
        }
    }

    return false;
}

// ---------- Public API ----------

/**
 * Main orchestrator: generates hybrid swap suggestions.
 *
 * @param mealName       - Name of the meal
 * @param mealMacros     - Current meal macros
 * @param macroGoals     - User's macro goals/constraints
 * @param restaurantName - Restaurant name
 * @param modifierCandidates - DB modifier candidates for this restaurant
 * @returns HybridSwapResult with DB, global, and optionally LLM swaps
 */
export async function generateHybridSwaps(
    mealName: string,
    mealMacros: Macros,
    macroGoals: MacroGoals,
    restaurantName: string,
    modifierCandidates: ModifierCandidate[]
): Promise<HybridSwapResult> {
    // Step 1: Run existing DB-backed swap engine
    const dbModifications = await generateSwapModifications(
        mealName,
        mealMacros,
        macroGoals,
        restaurantName,
        modifierCandidates
    );

    // Step 2: Get global swap suggestions
    const dishType = inferExtendedDishType(mealName) as DishType;
    const allGlobalSwaps = getApplicableSwaps(dishType);
    const compatibleGlobalSwaps = filterCompatibleSwaps(allGlobalSwaps, dishType, mealName);
    const shouldAllowGlobalProteinUpsell =
        macroGoals.higherProtein === true ||
        (typeof macroGoals.minProtein === 'number' && mealMacros.protein < macroGoals.minProtein) ||
        mealMacros.protein < 30;
    const goalFilteredGlobalSwaps = compatibleGlobalSwaps.filter((swap) => {
        const isProteinScalingCategory = swap.category === 'PROTEIN_SCALING';
        const isProteinUpsellLabel = /\b(add|extra).{0,20}\bprotein\b/i.test(swap.label);
        if (!shouldAllowGlobalProteinUpsell && (isProteinScalingCategory || isProteinUpsellLabel)) {
            return false;
        }
        return true;
    });

    // Step 3: Estimate impact and score each global swap
    const scoredGlobalSwaps = goalFilteredGlobalSwaps
        .filter((swap) => !isAlreadyCoveredByDBSwap(swap, dbModifications))
        .map((swap) => {
            const impact = estimateMacroImpact(swap, mealMacros, modifierCandidates);
            return { swap, impact, score: swapPriorityScore(swap, impact, dishType) };
        })
        .sort((a, b) => a.score - b.score);

    // Step 4: Select global swaps, enforcing max 1 per category for variety
    const remainingSlots = Math.max(0, MAX_TOTAL_SWAPS - dbModifications.length);
    const usedCategories = new Set<string>();

    // Track which categories are already covered by DB mods
    for (const dbMod of dbModifications) {
        if (dbMod.swapType === 'higherProtein') usedCategories.add('PROTEIN_SCALING');
        if (dbMod.swapType === 'lowerCalories' || dbMod.swapType === 'lowerCarbs') usedCategories.add('STRUCTURE_SWAP');
    }

    const selectedGlobal: typeof scoredGlobalSwaps = [];
    for (const scored of scoredGlobalSwaps) {
        if (selectedGlobal.length >= Math.min(remainingSlots, MAX_GLOBAL_SWAPS)) break;
        // Only allow 1 swap per category to ensure variety across meals
        if (usedCategories.has(scored.swap.category)) continue;
        usedCategories.add(scored.swap.category);
        selectedGlobal.push(scored);
    }

    // Step 5: Convert to GlobalSwapSuggestion format
    const globalSwaps: GlobalSwapSuggestion[] = selectedGlobal.map(({ swap, impact }) => ({
        id: `global-${swap.id}`,
        label: swap.label,
        category: swap.category,
        impactLabels: impact.impactLabels,
        details: swap.details,
        impactType: impact.impactType,
        estimatedDelta: impact.delta ?? impact.estimatedDelta ?? {
            calories: 0,
            protein: 0,
            carbs: 0,
            fats: 0,
        },
        source: 'global' as const,
    }));

    // Step 5b: Optionally refine heuristic deltas via batched LLM call
    const heuristicSwaps = globalSwaps.filter((gs) => gs.impactType === 'heuristic');
    if (heuristicSwaps.length > 0) {
        const refinedDeltas = await refineMacrosViaLLM(
            mealName,
            restaurantName,
            mealMacros,
            heuristicSwaps.map((gs) => gs.label)
        );

        if (refinedDeltas) {
            // Merge refined deltas back into globalSwaps
            for (const refined of refinedDeltas) {
                const match = globalSwaps.find(
                    (gs) => gs.label.toLowerCase() === refined.swapLabel.toLowerCase()
                );
                if (match) {
                    match.estimatedDelta = {
                        calories: refined.calories,
                        protein: refined.protein,
                        carbs: refined.carbs,
                        fats: refined.fats,
                    };
                    match.impactType = 'deterministic'; // Upgraded from heuristic
                }
            }

            if (process.env.NODE_ENV === 'development') {
                console.log('[hybrid-swap-generator] LLM macro refinement applied:', {
                    refinedCount: refinedDeltas.length,
                    labels: refinedDeltas.map((d) => `${d.swapLabel}: ${d.calories} cal (${d.reasoning})`),
                });
            }
        }
    }

    // Step 6: Determine source and optionally trigger LLM fallback
    let llmSwaps: LLMSwapSuggestion[] = [];
    let source: HybridSwapResult['source'] = 'mixed';

    const totalSwaps = dbModifications.length + globalSwaps.length;

    // Target 2-3 swaps total (prefer 2, allow 3 if needed)
    const targetSwapCount = 2;
    const maxSwapCount = 3;

    if (totalSwaps < targetSwapCount) {
        // Guarantee at least 2 swaps total: LLM fallback
        if (process.env.ENABLE_SWAP_LLM_FALLBACK === 'true') {
            const neededSwaps = Math.min(targetSwapCount - totalSwaps, maxSwapCount - totalSwaps);
            llmSwaps = await generateLLMSwaps(mealName, restaurantName, mealMacros, neededSwaps);
        }

        if (totalSwaps === 0) {
            source = llmSwaps.length > 0 ? 'llm' : 'mixed';
        } else {
            source = 'mixed';
        }
    } else if (dbModifications.length > 0 && globalSwaps.length === 0) {
        source = 'db';
    } else if (dbModifications.length === 0 && globalSwaps.length > 0) {
        source = 'global';
    }

    // Step 7: Rotate and limit final swaps based on meal and user profile
    // Create a simple hash from meal name for rotation
    const mealHash = mealName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // Create unified swap list with priority scoring
    type UnifiedSwap = {
        type: 'db' | 'global' | 'llm';
        swap: SwapModification | GlobalSwapSuggestion | LLMSwapSuggestion;
        priority: number;
    };
    
    const unifiedSwaps: UnifiedSwap[] = [
        ...dbModifications.map((swap, idx) => ({
            type: 'db' as const,
            swap,
            priority: idx + (macroGoals.lowerCalories && (swap.swapType === 'lowerCalories' || swap.swapType === 'calorieDown') ? -20 : 0) +
                     (macroGoals.higherProtein && swap.swapType === 'higherProtein' ? -20 : 0) +
                     (macroGoals.lowerCarbs && (swap.swapType === 'lowerCarbs' || swap.swapType === 'carbDown') ? -20 : 0)
        })),
        ...globalSwaps.map((swap, idx) => ({
            type: 'global' as const,
            swap,
            priority: idx + 100 // Global swaps have lower priority than DB swaps
        })),
        ...llmSwaps.map((swap, idx) => ({
            type: 'llm' as const,
            swap,
            priority: idx + 200 // LLM swaps have lowest priority
        }))
    ];
    
    // Sort by priority (lower = better)
    unifiedSwaps.sort((a, b) => a.priority - b.priority);
    
    // Apply rotation based on meal hash for variety
    const rotationOffset = mealHash % Math.max(1, unifiedSwaps.length);
    if (rotationOffset > 0 && unifiedSwaps.length > maxSwapCount) {
        // Only rotate if we have more swaps than needed
        const rotated = [...unifiedSwaps];
        rotated.push(...rotated.splice(0, rotationOffset));
        // Re-sort after rotation to maintain goal-based priority
        rotated.sort((a, b) => a.priority - b.priority);
        unifiedSwaps.splice(0, unifiedSwaps.length, ...rotated);
    }
    
    // Select top swaps up to maxSwapCount (3)
    const selectedSwaps = unifiedSwaps.slice(0, maxSwapCount);
    
    // Separate back into their types
    const finalDbMods: SwapModification[] = [];
    const finalGlobalSwaps: GlobalSwapSuggestion[] = [];
    const finalLlmSwaps: LLMSwapSuggestion[] = [];
    
    for (const { type, swap } of selectedSwaps) {
        if (type === 'db') {
            finalDbMods.push(swap as SwapModification);
        } else if (type === 'global') {
            finalGlobalSwaps.push(swap as GlobalSwapSuggestion);
        } else if (type === 'llm') {
            finalLlmSwaps.push(swap as LLMSwapSuggestion);
        }
    }

    // Dev logging
    if (process.env.NODE_ENV === 'development') {
        console.log('[hybrid-swap-generator] Result:', {
            mealName,
            dishType,
            restaurantName,
            dbModsCount: dbModifications.length,
            globalSwapsCount: globalSwaps.length,
            llmSwapsCount: llmSwaps.length,
            source,
            globalSwapLabels: globalSwaps.map((s) => `${s.label} (${s.estimatedDelta.calories} cal)`),
        });
    }

    return {
        modifications: finalDbMods,
        globalSwaps: finalGlobalSwaps,
        llmSwaps: finalLlmSwaps,
        source,
    };
}
