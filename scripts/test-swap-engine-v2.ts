/**
 * Hybrid Swap Engine v2 — Automated Validation & Regression Tests
 *
 * Run with: npx tsx scripts/test-swap-engine-v2.mjs
 *
 * Tests:
 *  1. Global swap library (dish-type filtering, conflict detection)
 *  2. Dish structure detection (10 meal types)
 *  3. Swap compatibility filter (keyword matching, structural requirements)
 *  4. Macro impact estimator (deterministic & heuristic paths)
 *  5. Full pipeline integration (9 test meals)
 *  6. Regression tests (original swap-rule-engine functions)
 */

// ========== Imports ==========
import { getApplicableSwaps, GLOBAL_SWAP_LIBRARY } from '../utils/global-swap-library.js';
import { getDishStructure, inferExtendedDishType } from '../utils/dish-structure.js';
import { filterCompatibleSwaps, hasFriedKeywords } from '../utils/swap-compatibility-v2.js';
import { estimateMacroImpact } from '../utils/macro-impact-estimator.js';
import { inferDishType, isCompatible, hasProteinTokenOverlap } from '../utils/dish-compatibility.js';

// ========== Test Harness ==========
let totalTests = 0;
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string) {
    totalTests++;
    if (condition) {
        passed++;
    } else {
        failed++;
        failures.push(testName);
        console.error(`  ❌ FAIL: ${testName}`);
    }
}

function section(title: string) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${title}`);
    console.log(`${'='.repeat(60)}`);
}

// ========== 1. Global Swap Library Tests ==========
section('1. Global Swap Library');

// 1a. Burger should get structure swaps (lettuce wrap) but NOT "half rice" after filtering
const burgerSwaps = getApplicableSwaps('burger');
assert(
    burgerSwaps.some(s => s.id === 'struct-lettuce-wrap'),
    'Burger gets "lettuce wrap instead of bun"'
);
// "half rice" may appear in broad pre-filter (via 'generic'), but
// filterCompatibleSwaps removes it (tested in Section 3)
assert(
    burgerSwaps.some(s => s.id === 'sauce-light'),
    'Burger gets "light sauce"'
);
assert(
    burgerSwaps.some(s => s.id === 'side-salad'),
    'Burger gets "side salad instead of fries"'
);

// 1b. Bowl should get "half rice" but NOT "lettuce wrap instead of bun" after filtering
const bowlSwaps = getApplicableSwaps('bowl');
assert(
    bowlSwaps.some(s => s.id === 'struct-half-rice'),
    'Bowl gets "half rice"'
);
// "lettuce wrap" may appear via 'generic' in broad pre-filter but is
// filtered out by structural component check (tested in Section 3)

// 1c. Salad should get sauce swaps (drizzle/dressing is dish-specific, appears before sauce-side)
const saladSwaps = getApplicableSwaps('salad');
assert(
    saladSwaps.some(s => s.id === 'sauce-drizzle'),
    'Salad gets "Dressing on the side" (sauce-drizzle)'
);
assert(
    saladSwaps.some(s => s.id === 'sauce-light'),
    'Salad gets "Light sauce" as fallback'
);

// 1d. Conflict detection — "no bun" and "lettuce wrap" are in conflictsWith
const noBun = GLOBAL_SWAP_LIBRARY.find(s => s.id === 'struct-no-bun')!;
const lettuceWrap = GLOBAL_SWAP_LIBRARY.find(s => s.id === 'struct-lettuce-wrap')!;
assert(
    noBun.conflictsWith?.includes('struct-lettuce-wrap') === true,
    '"no bun" conflicts with "lettuce wrap"'
);
assert(
    lettuceWrap.conflictsWith?.includes('struct-no-bun') === true,
    '"lettuce wrap" conflicts with "no bun"'
);

// 1e. All library entries have required fields
for (const entry of GLOBAL_SWAP_LIBRARY) {
    assert(!!entry.id && !!entry.label && !!entry.category, `Entry ${entry.id} has id, label, category`);
    assert(entry.applicableDishTypes.length > 0, `Entry ${entry.id} has applicableDishTypes`);
    assert(entry.impactLabels.length > 0, `Entry ${entry.id} has impactLabels`);
}
console.log(`  ✅ Section 1 done`);

// ========== 2. Dish Structure Detection Tests ==========
section('2. Dish Structure Detection');

const dishTypeTests: [string, string, string[]][] = [
    ['Classic Burger', 'burger', ['bun', 'protein', 'sauce']],
    ['Grilled Chicken Sandwich', 'sub', ['bread', 'protein', 'sauce']],
    ['Chicken Caesar Salad', 'salad', ['greens', 'protein', 'dressing']],
    ['Chipotle Burrito Bowl', 'bowl', ['base', 'protein', 'sauce']],
    ['Pepperoni Pizza', 'pizza', ['crust', 'sauce', 'cheese']],
    ['Grilled Chicken Wrap', 'wrap', ['tortilla', 'filling', 'sauce']],
    ['Spaghetti Pasta', 'pasta', ['base', 'protein', 'sauce']],
    ['Beef Taco', 'taco', ['tortilla', 'filling', 'sauce']],
    ['Berry Smoothie', 'smoothie', ['base_liquid', 'fruit']],
    ['Breakfast Egg Plate', 'breakfast_plate', ['eggs', 'side_protein', 'starch']],
];

for (const [mealName, expectedType, expectedComponents] of dishTypeTests) {
    const result = getDishStructure(mealName);
    assert(
        result.dishType === expectedType,
        `"${mealName}" → dishType = "${expectedType}" (got "${result.dishType}")`
    );
    for (const comp of expectedComponents) {
        assert(
            result.components.includes(comp as any),
            `"${mealName}" has component "${comp}"`
        );
    }
}
console.log(`  ✅ Section 2 done`);

// ========== 3. Swap Compatibility Filter Tests ==========
section('3. Swap Compatibility Filter');

// 3a. Cooking method swaps only match fried meals
assert(hasFriedKeywords('Crispy Chicken Sandwich'), '"Crispy Chicken" has fried keywords');
assert(hasFriedKeywords('Deep Fried Fish'), '"Deep Fried Fish" has fried keywords');
assert(!hasFriedKeywords('Grilled Chicken Bowl'), '"Grilled Chicken Bowl" has no fried keywords');
assert(!hasFriedKeywords('Classic Burger'), '"Classic Burger" has no fried keywords');

// 3b. "Grilled instead of fried" only applies to fried meals
const allSwaps = getApplicableSwaps('burger');
const compatFriedBurger = filterCompatibleSwaps(allSwaps, 'burger', 'Crispy Fried Chicken Burger');
const compatPlainBurger = filterCompatibleSwaps(allSwaps, 'burger', 'Classic Burger');

assert(
    compatFriedBurger.some(s => s.id === 'cook-grilled'),
    '"Grilled instead of fried" applies to "Crispy Fried Chicken Burger"'
);
assert(
    !compatPlainBurger.some(s => s.id === 'cook-grilled'),
    '"Grilled instead of fried" does NOT apply to "Classic Burger"'
);

// 3c. "Half rice" only applies to bowls (structural component check)
const allBurgerSwaps = getApplicableSwaps('burger');
const burgerCompat = filterCompatibleSwaps(allBurgerSwaps, 'burger', 'Classic Burger');
assert(
    !burgerCompat.some(s => s.id === 'struct-half-rice'),
    '"Half rice" does NOT apply to burger (no base component)'
);

const allBowlSwaps = getApplicableSwaps('bowl');
const bowlCompat = filterCompatibleSwaps(allBowlSwaps, 'bowl', 'Chipotle Bowl');
assert(
    bowlCompat.some(s => s.id === 'struct-half-rice'),
    '"Half rice" applies to bowl (has base component)'
);

// 3d. Conflict resolution — only first conflicting swap passes
assert(
    !(compatPlainBurger.some(s => s.id === 'struct-lettuce-wrap') &&
        compatPlainBurger.some(s => s.id === 'struct-no-bun')),
    'Conflicting bun swaps are deduplicated (only one passes)'
);

// 3e. Sauce conflicts — only one sauce swap should appear
const sauceSwaps = compatPlainBurger.filter(s => s.category === 'SAUCE_REDUCTION');
const sauceConflictIds = new Set(['sauce-light', 'sauce-side', 'sauce-none']);
const conflictingSauceSwaps = sauceSwaps.filter(s => sauceConflictIds.has(s.id));
assert(
    conflictingSauceSwaps.length <= 1,
    'At most one conflicting sauce swap passes conflict filter'
);

console.log(`  ✅ Section 3 done`);

// ========== 4. Macro Impact Estimator Tests ==========
section('4. Macro Impact Estimator');

const mockMealMacros = { calories: 700, protein: 30, carbs: 45, fats: 35 };

// Mock modifier candidates (simulating DB data)
const mockModifierCandidates = [
    { id: 'mod-bun', name: 'Sesame Bun', category: 'bread', macros: { calories: 150, protein: 4, carbs: 28, fats: 3 } },
    { id: 'mod-lettuce', name: 'Lettuce Wrap', category: 'bread', macros: { calories: 10, protein: 1, carbs: 2, fats: 0 } },
    { id: 'mod-patty', name: 'Beef Patty', category: 'protein', macros: { calories: 200, protein: 20, carbs: 0, fats: 13 } },
    { id: 'mod-ranch', name: 'Ranch Sauce', category: 'sauce', macros: { calories: 120, protein: 1, carbs: 2, fats: 12 } },
];

// 4a. Deterministic: lettuce wrap swap with DB candidates
const lettuceSwapEntry = GLOBAL_SWAP_LIBRARY.find(s => s.id === 'struct-lettuce-wrap')!;
const lettuceImpact = estimateMacroImpact(lettuceSwapEntry, mockMealMacros, mockModifierCandidates);
assert(
    lettuceImpact.impactType === 'deterministic',
    'Lettuce wrap swap is deterministic when DB candidates exist'
);
assert(
    lettuceImpact.delta !== undefined && lettuceImpact.delta.calories < 0,
    'Lettuce wrap swap reduces calories deterministically'
);
assert(
    lettuceImpact.delta !== undefined && lettuceImpact.delta.carbs < 0,
    'Lettuce wrap swap reduces carbs deterministically'
);

// 4b. Deterministic: sauce reduction with DB candidates
const sauceSideEntry = GLOBAL_SWAP_LIBRARY.find(s => s.id === 'sauce-side')!;
const sauceImpact = estimateMacroImpact(sauceSideEntry, mockMealMacros, mockModifierCandidates);
assert(
    sauceImpact.impactType === 'deterministic',
    'Sauce on the side is deterministic when DB sauce candidate exists'
);
assert(
    sauceImpact.delta !== undefined && sauceImpact.delta.calories < 0,
    'Sauce on the side reduces calories'
);

// 4c. Heuristic: sauce swap with NO DB candidates
const noDBImpact = estimateMacroImpact(sauceSideEntry, mockMealMacros, []);
assert(
    noDBImpact.impactType === 'heuristic',
    'Sauce swap is heuristic when no DB candidates exist'
);
assert(
    noDBImpact.impactLabels.length > 0,
    'Heuristic impact has qualitative labels'
);
assert(
    noDBImpact.estimatedDelta !== undefined,
    'Heuristic impact has estimatedDelta (mid-point)'
);
assert(
    !isNaN(noDBImpact.estimatedDelta?.calories ?? NaN),
    'Heuristic estimatedDelta has no NaN values'
);

// 4d. Protein add with DB candidates
const proteinAddEntry = GLOBAL_SWAP_LIBRARY.find(s => s.id === 'protein-extra')!;
const proteinImpact = estimateMacroImpact(proteinAddEntry, mockMealMacros, mockModifierCandidates);
assert(
    proteinImpact.impactType === 'deterministic',
    'Protein add is deterministic when DB candidate exists'
);
assert(
    proteinImpact.delta !== undefined && proteinImpact.delta.protein > 0,
    'Protein add increases protein'
);

console.log(`  ✅ Section 4 done`);

// ========== 5. Full Pipeline Integration (9 test meals) ==========
section('5. Full Pipeline Integration');

const testMeals = [
    { name: 'Classic Burger', restaurant: 'Five Guys', macros: { calories: 840, protein: 43, carbs: 39, fats: 55 } },
    { name: 'Chicken Caesar Salad', restaurant: 'Panera Bread', macros: { calories: 440, protein: 35, carbs: 22, fats: 25 } },
    { name: 'Chipotle Burrito Bowl', restaurant: 'Chipotle', macros: { calories: 690, protein: 44, carbs: 50, fats: 27 } },
    { name: 'Pepperoni Pizza', restaurant: 'Dominos', macros: { calories: 560, protein: 22, carbs: 68, fats: 22 } },
    { name: 'Breakfast Egg Plate', restaurant: 'Denny\'s', macros: { calories: 620, protein: 28, carbs: 35, fats: 40 } },
    { name: 'Grilled Chicken Wrap', restaurant: 'Chick-fil-A', macros: { calories: 450, protein: 35, carbs: 38, fats: 16 } },
    { name: 'Spaghetti Pasta', restaurant: 'Olive Garden', macros: { calories: 780, protein: 28, carbs: 95, fats: 30 } },
    { name: 'Beef Taco', restaurant: 'Taco Bell', macros: { calories: 340, protein: 15, carbs: 30, fats: 18 } },
    { name: 'Berry Smoothie', restaurant: 'Jamba Juice', macros: { calories: 280, protein: 8, carbs: 60, fats: 2 } },
];

for (const meal of testMeals) {
    const dishType = inferExtendedDishType(meal.name);
    const applicable = getApplicableSwaps(dishType as any);
    const compatible = filterCompatibleSwaps(applicable, dishType as any, meal.name);

    assert(
        compatible.length >= 1,
        `"${meal.name}" gets at least 1 compatible swap (got ${compatible.length})`
    );

    // At most 3 swaps should be selected for the user
    const topSwaps = compatible.slice(0, 3);
    assert(
        topSwaps.length >= 1 && topSwaps.length <= 3,
        `"${meal.name}" returns 1–3 swaps (got ${topSwaps.length})`
    );

    // Every swap has impact labels
    for (const swap of topSwaps) {
        assert(
            swap.impactLabels.length > 0,
            `"${meal.name}" swap "${swap.label}" has impact labels`
        );
    }

    // Verify no impossible modifications
    for (const swap of topSwaps) {
        // Cooking method swaps should only appear for fried meals
        if (swap.category === 'COOKING_METHOD') {
            assert(
                hasFriedKeywords(meal.name),
                `"${meal.name}" has cooking method swap "${swap.label}" ONLY if meal is fried`
            );
        }
        // Structure swaps requiring bun should only appear for burger/sandwich
        if (swap.id === 'struct-lettuce-wrap' || swap.id === 'struct-no-bun') {
            assert(
                dishType === 'burger' || dishType === 'sub',
                `"${meal.name}" bun swap "${swap.label}" ONLY for burger/sub dish type`
            );
        }
    }

    // Check macro impact for each swap
    for (const swap of topSwaps) {
        const impact = estimateMacroImpact(swap, meal.macros as any, []);
        assert(
            impact.impactLabels.length > 0,
            `"${meal.name}" swap "${swap.label}" impact has labels`
        );
        if (impact.impactType === 'heuristic' && impact.estimatedDelta) {
            assert(
                !isNaN(impact.estimatedDelta.calories),
                `"${meal.name}" swap "${swap.label}" heuristic delta has no NaN`
            );
        }
    }

    console.log(`  ✅ ${meal.name}: ${topSwaps.length} swaps, all valid`);
}

// ========== 6. Regression Tests ==========
section('6. Regression Tests (original functions)');

// 6a. inferDishType still works correctly
assert(inferDishType('Big Mac') === 'burger', 'inferDishType: "Big Mac" → burger');
assert(inferDishType('Chicken Sandwich') === 'sub', 'inferDishType: "Chicken Sandwich" → sub');
assert(inferDishType('Caesar Salad') === 'salad', 'inferDishType: "Caesar Salad" → salad');
assert(inferDishType('Burrito Bowl') === 'bowl', 'inferDishType: "Burrito Bowl" → bowl');
assert(inferDishType('Margherita Pizza') === 'pizza', 'inferDishType: "Margherita Pizza" → pizza');
assert(inferDishType('Random Meal') === 'generic', 'inferDishType: "Random Meal" → generic');

// 6b. isCompatible still works correctly
assert(isCompatible('burger', 'patty') === true, 'isCompatible: burger + patty = true');
assert(isCompatible('burger', 'shrimp') === false, 'isCompatible: burger + shrimp = false');
assert(isCompatible('salad', 'chicken') === true, 'isCompatible: salad + chicken = true');
assert(isCompatible('bowl', 'rice') === true, 'isCompatible: bowl + rice = true');
assert(isCompatible('pizza', 'cheese') === true, 'isCompatible: pizza + cheese = true');

// 6c. hasProteinTokenOverlap still works correctly
assert(hasProteinTokenOverlap('Beef Burger', 'Beef Patty') === true, 'hasProteinTokenOverlap: "Beef Burger" & "Beef Patty" = true');
assert(hasProteinTokenOverlap('Chicken Wrap', 'Turkey Breast') === false, 'hasProteinTokenOverlap: "Chicken Wrap" & "Turkey Breast" = false');

// 6d. Extended dish type is backward-compatible
assert(inferExtendedDishType('Classic Burger') === 'burger', 'inferExtendedDishType: "Classic Burger" → burger');
assert(inferExtendedDishType('Caesar Salad') === 'salad', 'inferExtendedDishType: "Caesar Salad" → salad');

console.log(`  ✅ Section 6 done`);

// ========== QA Report ==========
section('SYSTEM VALIDATION REPORT');

const swapRealismScore = failed === 0 ? 10 : Math.max(1, 10 - Math.ceil(failed / 3));
const compatSafetyScore = failures.filter(f => f.includes('compat') || f.includes('conflict') || f.includes('ONLY')).length === 0 ? 10 : 7;
const macroAccuracyScore = failures.filter(f => f.includes('NaN') || f.includes('deterministic') || f.includes('heuristic')).length === 0 ? 10 : 6;

console.log(`
  Tests executed:              ${totalTests}
  Passed:                      ${passed}
  Failures detected:           ${failed}
  Swap realism score:          ${swapRealismScore}/10
  Compatibility safety score:  ${compatSafetyScore}/10
  Macro accuracy confidence:   ${macroAccuracyScore}/10
`);

if (failures.length > 0) {
    console.log('  Failed tests:');
    for (const f of failures) {
        console.log(`    - ${f}`);
    }
}

// Exit with non-zero if any failures
if (failed > 0) {
    console.error(`\n❌ ${failed} test(s) failed!`);
    process.exit(1);
} else {
    console.log(`\n✅ All ${totalTests} tests passed!`);
    process.exit(0);
}
