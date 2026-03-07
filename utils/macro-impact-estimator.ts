/**
 * Macro Impact Estimator
 * Two-path estimation: deterministic (DB-backed) and heuristic (range-based).
 *
 * - Deterministic: exact delta when modifier candidates exist
 * - Heuristic: qualitative labels with range estimates when no DB data
 *
 * RULE: Never fabricate exact macro numbers for heuristic impacts.
 */

import type { Macros } from '@/lib/macro-utils';
import type { SwapLibraryEntry, HeuristicRange } from './global-swap-library';
import type { ModifierCandidate } from './modifier-candidates';

// ---------- Types ----------

export type ImpactType = 'deterministic' | 'heuristic';

export interface MacroImpactResult {
    impactType: ImpactType;
    /** Exact delta (only set for deterministic) */
    delta?: Macros;
    /** Range delta (only set for heuristic) */
    heuristicRange?: HeuristicRange;
    /** Mid-point estimate for heuristic path (best guess, clearly labeled as estimate) */
    estimatedDelta?: Macros;
    /** Human-readable labels like "Reduce calories", "Lower carbs" */
    impactLabels: string[];
}

// ---------- Internal helpers ----------

/**
 * Tries to find a modifier candidate whose name matches a keyword pattern.
 * Returns the first match, or null.
 */
function findModifierByKeywords(
    candidates: ModifierCandidate[],
    keywordPattern: RegExp
): ModifierCandidate | null {
    return candidates.find((c) => keywordPattern.test(c.name)) ?? null;
}

/**
 * Computes the mid-point of a heuristic range.
 */
function midPoint(range: [number, number]): number {
    return Math.round((range[0] + range[1]) / 2);
}

/**
 * Generates impact labels from a delta (positive = increase, negative = decrease).
 */
function labelsFromDelta(delta: Macros): string[] {
    const labels: string[] = [];
    if (delta.calories < -20) labels.push('Reduce calories');
    if (delta.calories > 20) labels.push('Higher calories');
    if (delta.protein > 5) labels.push('Higher protein');
    if (delta.protein < -5) labels.push('Lower protein');
    if (delta.carbs < -5) labels.push('Lower carbs');
    if (delta.carbs > 5) labels.push('Higher carbs');
    if (delta.fats < -3) labels.push('Reduce fat');
    if (delta.fats > 3) labels.push('Higher fat');
    return labels;
}

// ---------- Deterministic estimation ----------

/**
 * Attempts deterministic macro impact calculation using DB modifier candidates.
 *
 * For "replace" swaps (e.g., bun → lettuce wrap):
 *   - Looks for the "from" ingredient and "to" ingredient in candidates
 *   - Computes exact delta = to.macros - from.macros
 *
 * For "add" swaps:
 *   - Looks for the add-on item in candidates
 *   - Delta = item.macros
 *
 * For "remove" swaps:
 *   - Looks for the removed item in candidates
 *   - Delta = -item.macros
 */
function tryDeterministicEstimation(
    swap: SwapLibraryEntry,
    modifierCandidates: ModifierCandidate[]
): MacroImpactResult | null {
    if (modifierCandidates.length === 0) return null;

    // Structure swaps that involve replacement
    if (swap.id === 'struct-lettuce-wrap') {
        const bun = findModifierByKeywords(modifierCandidates, /\b(bun|bread|roll)\b/i);
        const lettuce = findModifierByKeywords(modifierCandidates, /\b(lettuce\s*wrap|lettuce)\b/i);
        if (bun && lettuce) {
            const delta: Macros = {
                calories: lettuce.macros.calories - bun.macros.calories,
                protein: lettuce.macros.protein - bun.macros.protein,
                carbs: lettuce.macros.carbs - bun.macros.carbs,
                fats: lettuce.macros.fats - bun.macros.fats,
            };
            return {
                impactType: 'deterministic',
                delta,
                impactLabels: labelsFromDelta(delta),
            };
        }
    }

    // Remove bun
    if (swap.id === 'struct-no-bun' || swap.id === 'struct-half-bun') {
        const bun = findModifierByKeywords(modifierCandidates, /\b(bun|bread|roll)\b/i);
        if (bun) {
            const factor = swap.id === 'struct-half-bun' ? 0.5 : 1;
            const delta: Macros = {
                calories: Math.round(-bun.macros.calories * factor),
                protein: Math.round(-bun.macros.protein * factor),
                carbs: Math.round(-bun.macros.carbs * factor),
                fats: Math.round(-bun.macros.fats * factor),
            };
            return {
                impactType: 'deterministic',
                delta,
                impactLabels: labelsFromDelta(delta),
            };
        }
    }

    // Protein add / double
    if (swap.id === 'protein-extra' || swap.id === 'protein-double') {
        const proteinItem = findModifierByKeywords(
            modifierCandidates,
            /\b(patty|chicken|steak|turkey|ham|egg|tofu|protein|beef|pork)\b/i
        );
        if (proteinItem) {
            const factor = swap.id === 'protein-double' ? 1 : 1; // both add one serving
            const delta: Macros = {
                calories: Math.round(proteinItem.macros.calories * factor),
                protein: Math.round(proteinItem.macros.protein * factor),
                carbs: Math.round(proteinItem.macros.carbs * factor),
                fats: Math.round(proteinItem.macros.fats * factor),
            };
            return {
                impactType: 'deterministic',
                delta,
                impactLabels: labelsFromDelta(delta),
            };
        }
    }

    // Sauce reduction — look for sauce/dressing in candidates
    if (swap.category === 'SAUCE_REDUCTION') {
        const sauceItem = findModifierByKeywords(
            modifierCandidates,
            /\b(sauce|mayo|aioli|ranch|dressing|ketchup|mustard|bbq|barbecue)\b/i
        );
        if (sauceItem) {
            let factor = 1;
            if (swap.id === 'sauce-light' || swap.id === 'sauce-drizzle') factor = 0.5;
            else if (swap.id === 'sauce-side') factor = 0.4; // people use less when it's on the side
            else if (swap.id === 'sauce-none') factor = 1;

            const delta: Macros = {
                calories: Math.round(-sauceItem.macros.calories * factor),
                protein: Math.round(-sauceItem.macros.protein * factor),
                carbs: Math.round(-sauceItem.macros.carbs * factor),
                fats: Math.round(-sauceItem.macros.fats * factor),
            };
            return {
                impactType: 'deterministic',
                delta,
                impactLabels: [...labelsFromDelta(delta), 'Reduce sauce calories'],
            };
        }
    }

    return null;
}

// ---------- Proportional Clamping ----------

/**
 * Maximum proportion of the meal's macros that a heuristic delta can represent.
 * E.g., 0.40 means a swap can reduce at most 40% of the meal's calories.
 * This prevents impossible results like "-170 cal on a 140 cal meal".
 */
const MAX_DELTA_PROPORTION = 0.40;

/**
 * Clamps a heuristic delta so no single macro change exceeds MAX_DELTA_PROPORTION
 * of the meal's actual macros.
 *
 * Rules:
 * - Negative deltas (reductions) are clamped to -MAX_DELTA_PROPORTION * mealValue
 * - Positive deltas (additions) are clamped to +MAX_DELTA_PROPORTION * mealValue
 * - If meal macro is 0 or very small, delta is clamped to a small absolute max
 */
function clampDelta(rawDelta: Macros, mealMacros: Macros): Macros {
    function clampValue(raw: number, mealValue: number): number {
        if (mealValue <= 0) {
            // Meal has 0 or unknown value — use a small absolute cap
            return Math.max(-30, Math.min(30, raw));
        }
        const maxAbsDelta = Math.round(mealValue * MAX_DELTA_PROPORTION);
        if (raw < 0) {
            return Math.max(raw, -maxAbsDelta); // e.g., max(-200, -56) = -56
        } else {
            return Math.min(raw, maxAbsDelta);   // e.g., min(200, 56) = 56
        }
    }

    return {
        calories: clampValue(rawDelta.calories, mealMacros.calories),
        protein: clampValue(rawDelta.protein, mealMacros.protein),
        carbs: clampValue(rawDelta.carbs, mealMacros.carbs),
        fats: clampValue(rawDelta.fats, mealMacros.fats),
    };
}

// ---------- Public API ----------

/**
 * Estimates the macro impact of a global swap suggestion.
 *
 * 1. Tries deterministic path (DB-backed modifier candidates)
 * 2. Falls back to heuristic path (range-based estimates from swap library)
 *    with proportional clamping to prevent impossible values
 */
export function estimateMacroImpact(
    swap: SwapLibraryEntry,
    mealMacros: Macros,
    modifierCandidates: ModifierCandidate[]
): MacroImpactResult {
    // Path 1: Deterministic
    const deterministic = tryDeterministicEstimation(swap, modifierCandidates);
    if (deterministic) return deterministic;

    // Path 2: Heuristic (range-based) with proportional clamping
    const h = swap.heuristicDelta;
    const rawDelta: Macros = {
        calories: h.calories ? midPoint(h.calories) : 0,
        protein: h.protein ? midPoint(h.protein) : 0,
        carbs: h.carbs ? midPoint(h.carbs) : 0,
        fats: h.fats ? midPoint(h.fats) : 0,
    };

    // Clamp so deltas are proportional to meal size
    const estimatedDelta = clampDelta(rawDelta, mealMacros);

    return {
        impactType: 'heuristic',
        heuristicRange: h,
        estimatedDelta,
        impactLabels: swap.impactLabels, // use library-defined labels for heuristic
    };
}
