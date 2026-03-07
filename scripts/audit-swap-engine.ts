/**
 * Swap Engine Audit Script
 * Deep-checks swap quality, realism, and variety across 25+ meal types.
 *
 * Run with: npx tsx scripts/audit-swap-engine.ts
 */

import { getApplicableSwaps, GLOBAL_SWAP_LIBRARY } from '../utils/global-swap-library.js';
import { getDishStructure, inferExtendedDishType } from '../utils/dish-structure.js';
import { filterCompatibleSwaps } from '../utils/swap-compatibility-v2.js';
import { estimateMacroImpact } from '../utils/macro-impact-estimator.js';
import type { SwapLibraryEntry } from '../utils/global-swap-library.js';
import type { DishType } from '../utils/dish-compatibility.js';

// ---- Test Meals ----
const TEST_MEALS = [
    // Burgers
    { name: 'Double Double', restaurant: 'In-N-Out', macros: { calories: 670, protein: 37, carbs: 39, fats: 41 } },
    { name: 'Whopper', restaurant: 'Burger King', macros: { calories: 660, protein: 28, carbs: 49, fats: 40 } },
    { name: 'Classic Hamburger', restaurant: 'Five Guys', macros: { calories: 840, protein: 43, carbs: 39, fats: 55 } },
    { name: 'Crispy Chicken Sandwich', restaurant: 'Chick-fil-A', macros: { calories: 470, protein: 29, carbs: 42, fats: 19 } },
    // Salads
    { name: 'Chicken Caesar Salad', restaurant: 'Panera Bread', macros: { calories: 440, protein: 35, carbs: 22, fats: 25 } },
    { name: 'Southwest Salad', restaurant: 'Sweetgreen', macros: { calories: 530, protein: 30, carbs: 48, fats: 25 } },
    { name: 'Cobb Salad', restaurant: 'True Food Kitchen', macros: { calories: 580, protein: 32, carbs: 18, fats: 44 } },
    // Bowls
    { name: 'Burrito Bowl', restaurant: 'Chipotle', macros: { calories: 690, protein: 44, carbs: 50, fats: 27 } },
    { name: 'Protein Power Bowl', restaurant: 'CAVA', macros: { calories: 720, protein: 48, carbs: 52, fats: 30 } },
    { name: 'Grain Bowl', restaurant: 'Sweetgreen', macros: { calories: 620, protein: 28, carbs: 70, fats: 22 } },
    // Wraps
    { name: 'Grilled Chicken Wrap', restaurant: 'Chick-fil-A', macros: { calories: 450, protein: 35, carbs: 38, fats: 16 } },
    { name: 'Turkey Avocado Wrap', restaurant: 'Panera Bread', macros: { calories: 590, protein: 32, carbs: 58, fats: 26 } },
    // Sandwiches (subs)
    { name: 'Italian Sub', restaurant: 'Jersey Mike\'s', macros: { calories: 820, protein: 42, carbs: 65, fats: 45 } },
    { name: 'Tuna Sandwich', restaurant: 'Subway', macros: { calories: 480, protein: 30, carbs: 46, fats: 20 } },
    // Tacos / Burritos
    { name: 'Beef Taco', restaurant: 'Taco Bell', macros: { calories: 340, protein: 15, carbs: 30, fats: 18 } },
    { name: 'Chicken Burrito', restaurant: 'Chipotle', macros: { calories: 780, protein: 50, carbs: 85, fats: 24 } },
    // Pizza
    { name: 'Pepperoni Pizza', restaurant: 'Domino\'s', macros: { calories: 560, protein: 22, carbs: 68, fats: 22 } },
    { name: 'Margherita Pizza', restaurant: 'North Italia', macros: { calories: 480, protein: 18, carbs: 62, fats: 18 } },
    // Pasta
    { name: 'Spaghetti Bolognese', restaurant: 'Olive Garden', macros: { calories: 780, protein: 28, carbs: 95, fats: 30 } },
    { name: 'Fettuccine Alfredo', restaurant: 'Carrabba\'s', macros: { calories: 980, protein: 26, carbs: 90, fats: 58 } },
    // Breakfast
    { name: 'Breakfast Egg Plate', restaurant: 'Denny\'s', macros: { calories: 620, protein: 28, carbs: 35, fats: 40 } },
    { name: 'Pancakes', restaurant: 'IHOP', macros: { calories: 780, protein: 14, carbs: 110, fats: 30 } },
    // Fried items
    { name: 'Crispy Fried Chicken', restaurant: 'KFC', macros: { calories: 430, protein: 34, carbs: 16, fats: 26 } },
    // Smoothie
    { name: 'Berry Smoothie', restaurant: 'Jamba Juice', macros: { calories: 280, protein: 8, carbs: 60, fats: 2 } },
    // Generic / unknown
    { name: 'House Special', restaurant: 'Local Diner', macros: { calories: 700, protein: 35, carbs: 55, fats: 35 } },
];

// ---- Helpers ----

function banner(text: string) {
    const line = '─'.repeat(68);
    console.log(`\n┌${line}┐`);
    console.log(`│  ${text.padEnd(66)}│`);
    console.log(`└${line}┘`);
}

function warn(msg: string) {
    console.log(`  ⚠️  ${msg}`);
}

function pass(msg: string) {
    console.log(`  ✅ ${msg}`);
}

function fail(msg: string) {
    console.log(`  ❌ ${msg}`);
}

// ---- Tracking ----
let totalIssues = 0;
const swapLabelCounts: Record<string, number> = {};   // how many meals each swap label appears on
const categoryCountPerMeal: Record<string, Record<string, number>> = {}; // mealName → category → count

// ---- Main audit ----
banner('SWAP ENGINE QUALITY AUDIT');

for (const meal of TEST_MEALS) {
    const dishType = inferExtendedDishType(meal.name) as DishType;
    const applicable = getApplicableSwaps(dishType);
    const compatible = filterCompatibleSwaps(applicable, dishType, meal.name);

    // Simulate the one-per-category selector (matches hybrid-swap-generator.ts logic)
    const usedCategories = new Set<string>();
    const selected: SwapLibraryEntry[] = [];
    for (const swap of compatible) {
        if (selected.length >= 5) break;
        if (usedCategories.has(swap.category)) continue;
        usedCategories.add(swap.category);
        selected.push(swap);
    }

    categoryCountPerMeal[meal.name] = {};
    for (const swap of selected) {
        // Track label frequency
        swapLabelCounts[swap.label] = (swapLabelCounts[swap.label] || 0) + 1;
        // Track category per meal
        categoryCountPerMeal[meal.name][swap.category] = (categoryCountPerMeal[meal.name][swap.category] || 0) + 1;
    }

    console.log(`\n📋  ${meal.name} (${restaurant(meal.restaurant)}) [${dishType}]`);

    if (selected.length === 0) {
        fail('No swaps generated!');
        totalIssues++;
        continue;
    }

    for (const swap of selected) {
        const impact = estimateMacroImpact(swap, meal.macros as any, []);

        // Reasonability check 1: impact labels must exist
        if (!impact.impactLabels || impact.impactLabels.length === 0) {
            fail(`"${swap.label}" — no impact labels`);
            totalIssues++;
            continue;
        }

        // Reasonability check 2: heuristic delta must not be NaN
        if (impact.estimatedDelta) {
            const d = impact.estimatedDelta;
            if (isNaN(d.calories) || isNaN(d.protein) || isNaN(d.carbs) || isNaN(d.fats)) {
                fail(`"${swap.label}" — NaN in estimated delta`);
                totalIssues++;
                continue;
            }
        }

        // Reasonability check 3: positive-impact swaps that are tagged "Reduce calories"
        // should not have positive estimated calorie deltas
        if (impact.impactLabels.includes('Reduce calories')) {
            const calDelta = impact.delta?.calories ?? impact.estimatedDelta?.calories ?? 0;
            if (calDelta > 0) {
                fail(`"${swap.label}" tagged "Reduce calories" but calDelta = ${calDelta}`);
                totalIssues++;
                continue;
            }
        }

        // Reasonability check 4: cooking method swaps should only appear on fried meals
        if (swap.category === 'COOKING_METHOD') {
            const hasFried = /\b(fried|crispy|battered|breaded|crunchy)\b/i.test(meal.name);
            if (!hasFried) {
                fail(`"${swap.label}" (COOKING_METHOD) appeared on non-fried meal "${meal.name}"`);
                totalIssues++;
                continue;
            }
        }

        // Reasonability check 5: bun swaps only for burger/sub
        if (['struct-lettuce-wrap', 'struct-no-bun', 'struct-half-bun'].includes(swap.id)) {
            if (!['burger', 'sub'].includes(dishType)) {
                fail(`"${swap.label}" (bun swap) appeared on dish type "${dishType}" (meal: "${meal.name}")`);
                totalIssues++;
                continue;
            }
        }

        const calStr = impact.estimatedDelta
            ? `${impact.estimatedDelta.calories > 0 ? '+' : ''}${impact.estimatedDelta.calories} cal`
            : 'no delta';
        console.log(`     ${impact.impactType === 'deterministic' ? '🎯' : '📊'} [${swap.category}] "${swap.label}" → ${impact.impactLabels.join(', ')} (${calStr})`);
    }

    // Reasonability check 6: duplicate category within same meal
    for (const [cat, count] of Object.entries(categoryCountPerMeal[meal.name])) {
        if (count > 1) {
            fail(`Category "${cat}" appeared ${count} times for "${meal.name}"`);
            totalIssues++;
        }
    }
}

// ---- Cross-meal variety analysis ----
banner('CROSS-MEAL VARIETY ANALYSIS');

const totalMeals = TEST_MEALS.length;
const REPEAT_THRESHOLD = 0.55; // flag if same swap appears on > 55% of meals

console.log('\n  Swap label frequency across all meals:\n');
const sortedLabels = Object.entries(swapLabelCounts).sort((a, b) => b[1] - a[1]);

let varietyIssues = 0;
for (const [label, count] of sortedLabels) {
    const pct = Math.round((count / totalMeals) * 100);
    const bar = '█'.repeat(Math.round(pct / 5));
    const flag = pct > REPEAT_THRESHOLD * 100;
    if (flag) {
        varietyIssues++;
        console.log(`  ❌ [${String(pct).padStart(3)}%] ${bar} "${label}"`);
    } else {
        console.log(`  ✅ [${String(pct).padStart(3)}%] ${bar} "${label}"`);
    }
}

totalIssues += varietyIssues;

// ---- Summary ----
banner('AUDIT SUMMARY');
console.log(`
  Meals audited:          ${totalMeals}
  Swap quality issues:    ${totalIssues - varietyIssues}
  Variety issues (>55%):  ${varietyIssues}
  Total issues:           ${totalIssues}
  Distinct swap labels:   ${Object.keys(swapLabelCounts).length}
`);

if (totalIssues > 0) {
    console.error(`\n❌ ${totalIssues} issue(s) found — see above for details.\n`);
    process.exit(1);
} else {
    console.log(`\n✅ All checks passed!\n`);
    process.exit(0);
}

function restaurant(r: string) {
    return r.length > 20 ? r.slice(0, 18) + '..' : r;
}
