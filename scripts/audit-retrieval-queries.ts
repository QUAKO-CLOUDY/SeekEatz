import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { buildSearchParams } from '@/lib/search-utils';
import { retrieveMealsWithClient } from '@/lib/retrieval/retrieval-engine';
import type { Meal } from '@/app/types';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type QueryCase = {
  query: string;
  expectedRestaurant?: string;
  minResults?: number;
  maxCalories?: number;
  minProtein?: number;
  expectDiverseRestaurants?: boolean;
};

const QUERY_CASES: QueryCase[] = [
  { query: 'dominos', expectedRestaurant: "Domino's Pizza" },
  { query: "domino's pizza", expectedRestaurant: "Domino's Pizza" },
  { query: 'dominos under 900 calories', expectedRestaurant: "Domino's Pizza", maxCalories: 900 },
  { query: 'qdoba', expectedRestaurant: 'QDOBA Mexican Eats' },
  { query: 'QDOBA Mexican Eats', expectedRestaurant: 'QDOBA Mexican Eats' },
  { query: 'qdoba under 700 calories', expectedRestaurant: 'QDOBA Mexican Eats', maxCalories: 700 },
  { query: 'habit burger', expectedRestaurant: 'The Habit Burger & Grill' },
  { query: 'The Habit Burger & Grill', expectedRestaurant: 'The Habit Burger & Grill' },
  { query: 'The Habit Burger & Grill under 700 calories', expectedRestaurant: 'The Habit Burger & Grill', maxCalories: 700 },
  { query: 'huey magoos', expectedRestaurant: "Magoo's Chicken & Tenders" },
  { query: "Magoo's Chicken & Tenders", expectedRestaurant: "Magoo's Chicken & Tenders" },
  { query: 'magoos chicken tenders under 900 calories', expectedRestaurant: "Magoo's Chicken & Tenders", maxCalories: 900 },
  { query: 'cheba hut', expectedRestaurant: 'Cheba Hut' },
  { query: 'cheba hut under 900 calories', expectedRestaurant: 'Cheba Hut', maxCalories: 900 },
  { query: 'in-n-out burger', expectedRestaurant: 'In-N-Out Burger' },
  { query: 'In N Out under 700 calories', expectedRestaurant: 'In-N-Out Burger', maxCalories: 700 },
  { query: 'sonic drive-in', expectedRestaurant: 'Sonic Drive-In' },
  { query: 'sonic under 600 calories', expectedRestaurant: 'Sonic Drive-In', maxCalories: 600 },
  { query: 'tropical smoothie cafe', expectedRestaurant: 'Tropical Smoothie Cafe' },
  { query: 'tropical smoothie cafe under 700 calories', expectedRestaurant: 'Tropical Smoothie Cafe', maxCalories: 700 },
  { query: 'sweetgreen', expectedRestaurant: 'Sweetgreen' },
  { query: 'sweetgreen under 700 calories', expectedRestaurant: 'Sweetgreen', maxCalories: 700 },
  { query: 'sweetfin', expectedRestaurant: 'Sweetfin' },
  { query: 'sweetfin under 700 calories', expectedRestaurant: 'Sweetfin', maxCalories: 700 },
  { query: 'chopt creative salad', expectedRestaurant: 'Chopt Creative Salad Co.' },
  { query: 'salads from Chopt Creative Salad Co.', expectedRestaurant: 'Chopt Creative Salad Co.' },
  { query: 'CAVA', expectedRestaurant: 'CAVA' },
  { query: 'cava under 700 calories', expectedRestaurant: 'CAVA', maxCalories: 700 },
  { query: 'Chipotle Mexican Grill', expectedRestaurant: 'Chipotle Mexican Grill' },
  { query: 'chipotle under 700 calories', expectedRestaurant: 'Chipotle Mexican Grill', maxCalories: 700 },
  { query: 'Burger King', expectedRestaurant: 'Burger King' },
  { query: 'burger king under 600 calories', expectedRestaurant: 'Burger King', maxCalories: 600 },
  { query: 'Shake Shack', expectedRestaurant: 'Shake Shack' },
  { query: 'shake shack under 800 calories', expectedRestaurant: 'Shake Shack', maxCalories: 800 },
  { query: 'Nekter Juice Bar', expectedRestaurant: 'Nekter Juice Bar' },
  { query: 'nekter juice bar smoothies under 400 calories', expectedRestaurant: 'Nekter Juice Bar', maxCalories: 400 },
  { query: 'Playa Bowls', expectedRestaurant: 'Playa Bowls' },
  { query: 'playa bowls smoothies under 500 calories', expectedRestaurant: 'Playa Bowls', maxCalories: 500 },
  { query: 'Jamba', expectedRestaurant: 'Jamba' },
  { query: 'jamba smoothies under 400 calories', expectedRestaurant: 'Jamba', maxCalories: 400 },
  { query: 'Tazikis', expectedRestaurant: "Taziki's Mediterranean Cafe" },
  { query: 'tazikis under 700 calories', expectedRestaurant: "Taziki's Mediterranean Cafe", maxCalories: 700 },
  { query: 'WaBa Grill', expectedRestaurant: 'WaBa Grill' },
  { query: 'waba grill high protein under 700 calories', expectedRestaurant: 'WaBa Grill', maxCalories: 700, minProtein: 30 },
  { query: 'El Pollo Loco', expectedRestaurant: 'El Pollo Loco' },
  { query: 'el pollo loco under 700 calories', expectedRestaurant: 'El Pollo Loco', maxCalories: 700 },
  { query: 'Pollo Tropical', expectedRestaurant: 'Pollo Tropical' },
  { query: 'pollo tropical under 700 calories', expectedRestaurant: 'Pollo Tropical', maxCalories: 700 },
  { query: 'Smashburger', expectedRestaurant: 'Smashburger' },
  { query: 'smashburger under 800 calories', expectedRestaurant: 'Smashburger', maxCalories: 800 },
  { query: 'Tous les Jours', expectedRestaurant: 'Tous les Jours' },
  { query: 'tous les jours under 600 calories', expectedRestaurant: 'Tous les Jours', maxCalories: 600 },
  { query: "BJ's Restaurant & Brewhouse", expectedRestaurant: "BJ's Restaurant & Brewhouse" },
  { query: 'bjs restaurant under 900 calories', expectedRestaurant: "BJ's Restaurant & Brewhouse", maxCalories: 900 },
  { query: 'Pura Vida Miami', expectedRestaurant: 'Pura Vida Miami (South Florida)' },
  { query: 'pura vida under 700 calories', expectedRestaurant: 'Pura Vida Miami (South Florida)', maxCalories: 700 },
  { query: 'ProteinHouse', expectedRestaurant: 'ProteinHouse' },
  { query: 'protein house high protein under 700 calories', expectedRestaurant: 'ProteinHouse', maxCalories: 700, minProtein: 30 },
  { query: 'Original Pancake House', expectedRestaurant: 'The Original Pancake House' },
  { query: 'original pancake house under 900 calories', expectedRestaurant: 'The Original Pancake House', maxCalories: 900 },
  { query: 'pizza', expectDiverseRestaurants: true },
  { query: 'pizza under 800 calories', maxCalories: 800, expectDiverseRestaurants: true },
  { query: 'salad', expectDiverseRestaurants: true },
  { query: 'salads under 600 calories', maxCalories: 600, expectDiverseRestaurants: true },
  { query: 'burger', expectDiverseRestaurants: true },
  { query: 'burgers under 700 calories', maxCalories: 700, expectDiverseRestaurants: true },
  { query: 'bowl', expectDiverseRestaurants: true },
  { query: 'bowls under 700 calories', maxCalories: 700, expectDiverseRestaurants: true },
  { query: 'sandwich', expectDiverseRestaurants: true },
  { query: 'sandwiches under 700 calories', maxCalories: 700, expectDiverseRestaurants: true },
  { query: 'smoothies', expectDiverseRestaurants: true },
  { query: 'smoothies under 300 calories', maxCalories: 300, expectDiverseRestaurants: true },
  { query: 'protein smoothies', minProtein: 20, expectDiverseRestaurants: true },
  { query: 'tacos', expectDiverseRestaurants: true },
  { query: 'tacos under 700 calories', maxCalories: 700, expectDiverseRestaurants: true },
  { query: 'pasta', expectDiverseRestaurants: true },
  { query: 'pasta under 900 calories', maxCalories: 900, expectDiverseRestaurants: true },
  { query: 'breakfast sandwich', expectDiverseRestaurants: true },
  { query: 'breakfast sandwich under 600 calories', maxCalories: 600, expectDiverseRestaurants: true },
  { query: 'mexican', expectDiverseRestaurants: true },
  { query: 'mexican under 700 calories', maxCalories: 700, expectDiverseRestaurants: true },
  { query: 'italian', expectDiverseRestaurants: true },
  { query: 'italian under 900 calories', maxCalories: 900, expectDiverseRestaurants: true },
  { query: 'mediterranean', expectDiverseRestaurants: true },
  { query: 'mediterranean under 700 calories', maxCalories: 700, expectDiverseRestaurants: true },
  { query: 'asian', expectDiverseRestaurants: true },
  { query: 'asian under 700 calories', maxCalories: 700, expectDiverseRestaurants: true },
  { query: 'bbq', expectDiverseRestaurants: true },
  { query: 'bbq under 900 calories', maxCalories: 900, expectDiverseRestaurants: true },
  { query: 'high protein under 600 calories', maxCalories: 600, minProtein: 30, expectDiverseRestaurants: true },
  { query: 'high protein under 800 calories', maxCalories: 800, minProtein: 30, expectDiverseRestaurants: true },
  { query: 'low calorie meals', maxCalories: 500, expectDiverseRestaurants: true },
  { query: 'low carb high protein', minProtein: 30, expectDiverseRestaurants: true },
  { query: 'vegetarian meals', expectDiverseRestaurants: true },
  { query: 'vegan meals', expectDiverseRestaurants: true },
  { query: 'chicken under 600 calories', maxCalories: 600, expectDiverseRestaurants: true },
  { query: 'steak under 800 calories', maxCalories: 800, expectDiverseRestaurants: true },
  { query: 'salmon under 800 calories', maxCalories: 800, expectDiverseRestaurants: true },
  { query: 'shrimp under 700 calories', maxCalories: 700, expectDiverseRestaurants: true },
  { query: 'breakfast under 600 calories', maxCalories: 600, expectDiverseRestaurants: true },
];

const EXPECTED_QUERY_COUNT = 100;
const DEFAULT_LIMIT = 8;

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/['.,\-]/g, '')
    .replace(/\b(co|company|restaurant|grill|cafe|bar|kitchen|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function macroValue(meal: Meal, field: 'calories' | 'protein'): number {
  return Number(meal[field] ?? meal.macros?.[field] ?? 0);
}

function validateCase(testCase: QueryCase, meals: Meal[], rankedRestaurantNames: string[] = []) {
  const failures: string[] = [];
  const minResults = testCase.minResults ?? 1;

  if (meals.length < minResults) {
    failures.push(`expected at least ${minResults} meal card(s), got ${meals.length}`);
    return failures;
  }

  if (testCase.expectedRestaurant) {
    const expected = normalizeName(testCase.expectedRestaurant);
    const wrongRestaurants = meals
      .map((meal) => meal.restaurant)
      .filter((restaurant) => normalizeName(restaurant) !== expected);

    if (wrongRestaurants.length > 0) {
      failures.push(`expected only ${testCase.expectedRestaurant}, got ${Array.from(new Set(wrongRestaurants)).join(', ')}`);
    }
  }

  if (testCase.maxCalories !== undefined) {
    const violations = meals.filter((meal) => macroValue(meal, 'calories') > testCase.maxCalories!);
    if (violations.length > 0) {
      failures.push(
        `calorie cap ${testCase.maxCalories} violated by ${violations
          .slice(0, 3)
          .map((meal) => `${meal.name} (${macroValue(meal, 'calories')})`)
          .join(', ')}`
      );
    }
  }

  if (testCase.minProtein !== undefined) {
    const violations = meals.filter((meal) => macroValue(meal, 'protein') < testCase.minProtein!);
    if (violations.length > 0) {
      failures.push(
        `protein floor ${testCase.minProtein} violated by ${violations
          .slice(0, 3)
          .map((meal) => `${meal.name} (${macroValue(meal, 'protein')})`)
          .join(', ')}`
      );
    }
  }

  if (testCase.expectDiverseRestaurants && meals.length > 1) {
    const restaurants = meals.map((meal) => normalizeName(meal.restaurant));
    const uniqueRestaurants = new Set(restaurants);
    const availableUniqueRestaurants = new Set(
      rankedRestaurantNames.map((restaurant) => normalizeName(restaurant)).filter(Boolean)
    );
    const expectedUniqueRestaurants = Math.min(
      meals.length,
      DEFAULT_LIMIT,
      availableUniqueRestaurants.size || meals.length
    );

    if (uniqueRestaurants.size < expectedUniqueRestaurants) {
      failures.push(
        `expected restaurant variety before repeats, got ${uniqueRestaurants.size}/${meals.length} unique restaurants; available=${availableUniqueRestaurants.size}`
      );
    }
  }

  return failures;
}

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function main() {
  if (QUERY_CASES.length !== EXPECTED_QUERY_COUNT) {
    throw new Error(`Expected ${EXPECTED_QUERY_COUNT} query cases, found ${QUERY_CASES.length}`);
  }

  const supabase = createSupabaseClient();
  const failures: string[] = [];
  let totalMealsReturned = 0;
  let semanticFallbackAttempts = 0;

  for (const testCase of QUERY_CASES) {
    const searchParams = await buildSearchParams({
      query: testCase.query,
      limit: DEFAULT_LIMIT,
      offset: 0,
    });
    const result = await retrieveMealsWithClient(supabase, searchParams, undefined, {
      includeDebug: true,
      disableSemanticFallback: true,
    });
    const caseFailures = validateCase(
      testCase,
      result.meals,
      result.debugInfo?.results.rankedRestaurantNames
    );

    totalMealsReturned += result.meals.length;
    if (result.debugInfo?.sql.semanticTriggered) {
      semanticFallbackAttempts += 1;
    }

    if (caseFailures.length > 0) {
      failures.push(
        [
          `QUERY "${testCase.query}"`,
          `resolved=${searchParams.restaurant ?? 'none'}`,
          `returned=${result.meals.length}`,
          `restaurants=${Array.from(new Set(result.meals.map((meal) => meal.restaurant))).join(', ') || 'none'}`,
          `failures=${caseFailures.join('; ')}`,
        ].join(' | ')
      );
    }
  }

  console.log(`Queries audited: ${QUERY_CASES.length}`);
  console.log(`Total meal cards returned: ${totalMealsReturned}`);
  console.log(`Semantic fallback attempts: ${semanticFallbackAttempts}`);
  console.log(`Failures: ${failures.length}`);

  for (const failure of failures) {
    console.log(`FAIL ${failure}`);
  }

  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[audit-retrieval-queries] fatal error:', error);
  process.exit(1);
});
