import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { buildSearchParams } from '../lib/search-utils';
import { retrieveMealsWithClient } from '../lib/retrieval/retrieval-engine';
import type { SearchParams } from '../app/types';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type LiveCase = {
  group: string;
  query: string;
  expectedMealType?: string;
  expectedCategory?: string;
  expectedCuisine?: string;
  minResults?: number;
  maxResults?: number;
  expectUsedVector?: boolean;
  warnIfZeroResults?: boolean;
  warnIfTopMealMissingAny?: string[];
  minUniqueRestaurantsInTop?: number;
  requireValidMealCards?: boolean;
  requireNoDuplicateIds?: boolean;
  paginationCheck?: {
    limit: number;
    minPage1Results: number;
    minPage2Results?: number;
    maxOverlapIds: number;
    minUniqueRestaurantsAcrossPages?: number;
  };
  userContext?: SearchParams['userContext'];
  expectLocationFilter?: {
    maxDistanceMiles: number;
    minDistanceAnnotated?: number;
  };
};

type RetrievalDebugInfo = {
  sql?: {
    deterministicTrace?: {
      source?: string;
      modernRpcCount?: number;
      legacyCount?: number;
      tableFallbackCount?: number;
      broadenedCount?: number;
    };
    deterministicCount?: number;
    deterministicAfterPostFilter?: number;
    deterministicThreshold?: number;
    semanticTriggered?: boolean;
    vectorCount?: number;
  };
  results?: {
    rankedCount?: number;
    returnedCount?: number;
  };
  location?: {
    requested?: boolean;
    radiusMiles?: number;
    source?: string;
    matchedRestaurantCount?: number;
    filteredOutCount?: number;
    returnedWithinRadius?: number;
    error?: string;
  };
};

const CASES: LiveCase[] = [
  { group: 'Breakfast', query: 'breakfast sandwich', expectedMealType: 'breakfast', expectedCategory: 'breakfast_sandwich', minResults: 1, expectUsedVector: false, warnIfTopMealMissingAny: ['sandwich', 'egg', 'bagel', 'biscuit'], requireValidMealCards: true, requireNoDuplicateIds: true },
  { group: 'Breakfast', query: 'healthy breakfast sandwich', expectedMealType: 'breakfast', expectedCategory: 'breakfast_sandwich', minResults: 1, expectUsedVector: false, warnIfTopMealMissingAny: ['sandwich', 'egg', 'bagel', 'biscuit'], requireValidMealCards: true, requireNoDuplicateIds: true },
  { group: 'Breakfast', query: 'breakfast burrito', expectedMealType: 'breakfast', expectedCategory: 'burrito', minResults: 1, warnIfTopMealMissingAny: ['burrito'] },
  { group: 'Breakfast', query: 'egg breakfast wrap', expectedMealType: 'breakfast', expectedCategory: 'wrap', minResults: 1, warnIfTopMealMissingAny: ['wrap', 'egg'] },
  { group: 'Breakfast', query: 'breakfast near me under 500 calories', expectedMealType: 'breakfast', minResults: 1 },
  { group: 'Breakfast', query: 'savory breakfast', expectedMealType: 'breakfast', minResults: 1 },
  { group: 'QuickChat', query: 'Find me breakfast foods like breakfast sandwiches, burritos, omelets, bagels, pancakes, waffles, oatmeal, and toast', expectedMealType: 'breakfast', minResults: 1, requireValidMealCards: true, requireNoDuplicateIds: true, warnIfTopMealMissingAny: ['breakfast', 'egg', 'burrito', 'sandwich', 'bagel', 'pancake', 'waffle', 'toast', 'oatmeal'] },
  { group: 'QuickChat', query: 'Find me lunch', expectedMealType: 'lunch', minResults: 1, requireValidMealCards: true, requireNoDuplicateIds: true },
  { group: 'QuickChat', query: 'Find me dinner', expectedMealType: 'dinner', minResults: 1, requireValidMealCards: true, requireNoDuplicateIds: true },
  { group: 'QuickChat', query: 'Find me a low carb meal', minResults: 1, requireValidMealCards: true, requireNoDuplicateIds: true },
  { group: 'QuickChat', query: 'Find me a low fat meal', minResults: 1, requireValidMealCards: true, requireNoDuplicateIds: true },
  { group: 'QuickChat', query: 'Find me a meal under 1000 calories and over 650 calories', minResults: 1, requireValidMealCards: true, requireNoDuplicateIds: true, minUniqueRestaurantsInTop: 4, paginationCheck: { limit: 5, minPage1Results: 5, minPage2Results: 5, maxOverlapIds: 0, minUniqueRestaurantsAcrossPages: 8 } },

  { group: 'Macros', query: 'high protein lunch under 700 calories', expectedMealType: 'lunch', minResults: 1, expectUsedVector: false, requireValidMealCards: true, requireNoDuplicateIds: true, paginationCheck: { limit: 5, minPage1Results: 5, minPage2Results: 3, maxOverlapIds: 0, minUniqueRestaurantsAcrossPages: 6 } },
  { group: 'Macros', query: 'lunch under 500 calories', expectedMealType: 'lunch', minResults: 1 },
  { group: 'Macros', query: 'burger with over 35g protein', expectedCategory: 'burger', minResults: 1, expectUsedVector: false, warnIfTopMealMissingAny: ['burger'] },
  { group: 'Macros', query: 'low fat salad', expectedCategory: 'salad', minResults: 1, warnIfTopMealMissingAny: ['salad'] },
  { group: 'Macros', query: 'need a filling lunch with at least 40g protein', expectedMealType: 'lunch', minResults: 1 },
  { group: 'Macros', query: 'find me a light dinner under 600 calories', expectedMealType: 'dinner', minResults: 1 },

  { group: 'Cuisine', query: 'barbecue for dinner', expectedMealType: 'dinner', expectedCuisine: 'barbecue', minResults: 1, warnIfTopMealMissingAny: ['bbq', 'barbecue', 'brisket', 'ribs', 'smoked'] },
  { group: 'Cuisine', query: 'italian', expectedCuisine: 'italian', minResults: 1, minUniqueRestaurantsInTop: 4, requireValidMealCards: true, requireNoDuplicateIds: true, paginationCheck: { limit: 5, minPage1Results: 5, minPage2Results: 5, maxOverlapIds: 0, minUniqueRestaurantsAcrossPages: 8 } },
  { group: 'Cuisine', query: 'chinese food', expectedCuisine: 'asian', minResults: 1, minUniqueRestaurantsInTop: 3, requireValidMealCards: true, requireNoDuplicateIds: true, paginationCheck: { limit: 5, minPage1Results: 5, minPage2Results: 3, maxOverlapIds: 0, minUniqueRestaurantsAcrossPages: 5 } },
  { group: 'Cuisine', query: 'smoked meats for dinner', expectedMealType: 'dinner', expectedCuisine: 'barbecue', minResults: 1, warnIfTopMealMissingAny: ['bbq', 'barbecue', 'brisket', 'ribs', 'smoked'] },
  { group: 'Cuisine', query: 'southern barbecue lunch', expectedMealType: 'lunch', expectedCuisine: 'barbecue', minResults: 1 },
  { group: 'Cuisine', query: 'fresh mediterranean bowl', expectedCategory: 'bowl', expectedCuisine: 'mediterranean', minResults: 1, warnIfTopMealMissingAny: ['bowl', 'mediterranean', 'greek', 'falafel', 'shawarma'] },
  { group: 'Cuisine', query: 'greek lunch', expectedMealType: 'lunch', expectedCuisine: 'mediterranean', minResults: 1 },
  { group: 'Cuisine', query: 'italian pasta dinner', expectedMealType: 'dinner', expectedCategory: 'pasta', expectedCuisine: 'italian', minResults: 1, warnIfTopMealMissingAny: ['pasta', 'linguine', 'spaghetti', 'penne'] },
  { group: 'Cuisine', query: 'sushi for lunch', expectedMealType: 'lunch', expectedCuisine: 'asian', minResults: 1, warnIfTopMealMissingAny: ['sushi', 'roll', 'sashimi', 'nigiri', 'maki'] },
  { group: 'Cuisine', query: 'low carb from a Mexican place', expectedCuisine: 'mexican', minResults: 1, requireValidMealCards: true, requireNoDuplicateIds: true },

  { group: 'Protein', query: 'chicken bowl', expectedCategory: 'bowl', minResults: 1, warnIfTopMealMissingAny: ['chicken', 'bowl'], requireValidMealCards: true, requireNoDuplicateIds: true },
  { group: 'Protein', query: 'fish tacos for lunch', expectedMealType: 'lunch', expectedCategory: 'tacos', minResults: 1, warnIfTopMealMissingAny: ['fish', 'taco'] },
  { group: 'Protein', query: 'steak salad with high protein', expectedCategory: 'salad', minResults: 1, warnIfTopMealMissingAny: ['steak', 'salad'] },
  { group: 'Protein', query: 'turkey sandwich', expectedCategory: 'sandwich', minResults: 1, warnIfTopMealMissingAny: ['turkey', 'sandwich'] },
  { group: 'Protein', query: 'tofu bowl', expectedCategory: 'bowl', minResults: 1, warnIfTopMealMissingAny: ['tofu', 'bowl'] },
  { group: 'Protein', query: 'shrimp pasta under 900 calories', expectedCategory: 'pasta', warnIfZeroResults: true, warnIfTopMealMissingAny: ['shrimp', 'pasta'] },

  { group: 'Diet', query: 'vegan breakfast', expectedMealType: 'breakfast', warnIfZeroResults: true },
  { group: 'Diet', query: 'vegetarian burrito', expectedCategory: 'burrito', minResults: 1, warnIfTopMealMissingAny: ['burrito'] },
  { group: 'Diet', query: 'gluten free lunch', expectedMealType: 'lunch', minResults: 1 },
  { group: 'Diet', query: 'post workout meal with chicken', minResults: 1, warnIfTopMealMissingAny: ['chicken'] },
  { group: 'Diet', query: 'pre workout snack', expectedMealType: 'snack', minResults: 1 },

  { group: 'Modifiers', query: 'sandwich without mayo', expectedCategory: 'sandwich', minResults: 1, warnIfTopMealMissingAny: ['sandwich'] },
  { group: 'Modifiers', query: 'breakfast burrito without cheese', expectedMealType: 'breakfast', expectedCategory: 'burrito', minResults: 1, warnIfTopMealMissingAny: ['burrito'] },
  { group: 'Modifiers', query: 'something spicy for dinner', expectedMealType: 'dinner', minResults: 1 },
  { group: 'Modifiers', query: 'show me a grilled chicken bowl', expectedCategory: 'bowl', minResults: 1, warnIfTopMealMissingAny: ['chicken', 'bowl'] },

  { group: 'Restaurant', query: 'find me dinner at CAVA', expectedMealType: 'dinner', minResults: 1, requireValidMealCards: true, requireNoDuplicateIds: true, paginationCheck: { limit: 5, minPage1Results: 5, minPage2Results: 3, maxOverlapIds: 0, minUniqueRestaurantsAcrossPages: 1 } },
  { group: 'Restaurant', query: 'give me a healthy breakfast from First Watch', expectedMealType: 'breakfast', minResults: 1 },
  { group: 'Restaurant', query: 'something hearty from Chipotle', minResults: 1 },
  { group: 'Restaurant', query: 'fish tacos from Sweetgreen', expectedCategory: 'tacos', minResults: 1, warnIfTopMealMissingAny: ['fish', 'taco'] },
  { group: 'Restaurant', query: 'healthy options at Nekter Juice Bar', minResults: 1, requireValidMealCards: true, requireNoDuplicateIds: true },
  { group: 'Restaurant', query: 'healthy options at Jersey Mike\'s Subs', minResults: 1, requireValidMealCards: true, requireNoDuplicateIds: true },
  { group: 'Restaurant', query: 'healthy options at Raising Cane\'s', minResults: 1, requireValidMealCards: true, requireNoDuplicateIds: true },

  { group: 'Negative', query: 'unicorn lasagna smoothie', maxResults: 0 },
  { group: 'Negative', query: 'volcanic moon burger without oxygen', maxResults: 0 },
];

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY in environment.');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function buildParams(query: string): Promise<SearchParams> {
  return buildSearchParams({
    query,
    limit: 5,
    offset: 0,
  });
}

function getOptionalLocationTestCases(): LiveCase[] {
  const lat = Number(process.env.SEARCH_TEST_LOCATION_LAT);
  const lng = Number(process.env.SEARCH_TEST_LOCATION_LNG);
  const radius = Number(process.env.SEARCH_TEST_RADIUS_MILES ?? 5);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius) || radius <= 0) {
    return [];
  }

  return [
    {
      group: 'Location',
      query: 'high protein lunch under 700 calories',
      minResults: 1,
      requireValidMealCards: true,
      requireNoDuplicateIds: true,
      userContext: {
        user_location_lat: lat,
        user_location_lng: lng,
        search_distance_miles: radius,
      },
      expectLocationFilter: {
        maxDistanceMiles: radius,
        minDistanceAnnotated: 1,
      },
    },
  ];
}

function containsAny(text: string, candidates: string[]) {
  const lower = text.toLowerCase();
  return candidates.some((candidate) => lower.includes(candidate.toLowerCase()));
}

function getDuplicateIds(meals: Array<{ id: string }>) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const meal of meals) {
    if (seen.has(meal.id)) {
      duplicates.add(meal.id);
    }
    seen.add(meal.id);
  }
  return [...duplicates];
}

function getInvalidMealCards(meals: Array<Record<string, unknown>>) {
  return meals.filter((meal) => {
    const id = String(meal.id ?? '').trim();
    const name = String(meal.name ?? '').trim();
    const restaurant = String(meal.restaurant ?? '').trim();
    const calories = Number(meal.calories ?? NaN);
    const protein = Number(meal.protein ?? NaN);
    const carbs = Number(meal.carbs ?? NaN);
    const fats = Number(meal.fats ?? NaN);

    return (
      !id ||
      !name ||
      !restaurant ||
      !Number.isFinite(calories) ||
      !Number.isFinite(protein) ||
      !Number.isFinite(carbs) ||
      !Number.isFinite(fats)
    );
  });
}

async function main() {
  const supabase = getSupabaseClient();
  let failures = 0;
  let warnings = 0;
  const groupStats = new Map<string, { total: number; failures: number; warnings: number }>();

  const liveCases = [...CASES, ...getOptionalLocationTestCases()];

  for (const testCase of liveCases) {
    const searchParams = await buildParams(testCase.query);
    if (testCase.userContext) {
      searchParams.userContext = testCase.userContext;
    }
    const result = await retrieveMealsWithClient(supabase, searchParams, undefined, { includeDebug: true });
    const debugInfo = (result.debugInfo ?? {}) as RetrievalDebugInfo;
    const mealNames = result.meals.map((meal) => `${meal.name} @ ${meal.restaurant}`).slice(0, 3);
    const uniqueRestaurantsInTop = new Set(
      result.meals.map((meal) => meal.restaurant.toLowerCase())
    ).size;
    const topMealSummary = result.meals[0]
      ? `${result.meals[0].name} ${result.meals[0].description ?? ''} ${result.meals[0].restaurant}`
      : '';

    const stats = groupStats.get(testCase.group) ?? { total: 0, failures: 0, warnings: 0 };
    stats.total += 1;
    groupStats.set(testCase.group, stats);

    console.log(`\n[retrieval-live:${testCase.group}] ${testCase.query}`);
    console.log({
      parsedMealType: result.parsedQuery.mealType,
      parsedCategory: result.parsedQuery.normalizedCategory,
      parsedCuisine: result.parsedQuery.cuisineType,
      results: result.meals.length,
      usedVector: result.usedVector,
      deterministicSource: debugInfo.sql?.deterministicTrace?.source,
      deterministicCount: debugInfo.sql?.deterministicCount,
      afterPostFilter: debugInfo.sql?.deterministicAfterPostFilter,
      vectorCount: debugInfo.sql?.vectorCount,
      semanticTriggered: debugInfo.sql?.semanticTriggered,
      topMeals: mealNames,
      uniqueRestaurantsInTop,
      locationFilter: debugInfo.location,
    });

    if (testCase.expectedMealType && result.parsedQuery.mealType !== testCase.expectedMealType) {
      console.error(`FAIL mealType: expected ${testCase.expectedMealType}, got ${result.parsedQuery.mealType ?? 'undefined'}`);
      failures += 1;
      stats.failures += 1;
    }

    if (testCase.expectedCategory && result.parsedQuery.normalizedCategory !== testCase.expectedCategory) {
      console.error(`FAIL category: expected ${testCase.expectedCategory}, got ${result.parsedQuery.normalizedCategory ?? 'undefined'}`);
      failures += 1;
      stats.failures += 1;
    }

    if (testCase.expectedCuisine && result.parsedQuery.cuisineType !== testCase.expectedCuisine) {
      console.error(`FAIL cuisine: expected ${testCase.expectedCuisine}, got ${result.parsedQuery.cuisineType ?? 'undefined'}`);
      failures += 1;
      stats.failures += 1;
    }

    if (testCase.minResults !== undefined && result.meals.length < testCase.minResults) {
      console.error(`FAIL minResults: expected at least ${testCase.minResults}, got ${result.meals.length}`);
      failures += 1;
      stats.failures += 1;
    }

    if (testCase.maxResults !== undefined && result.meals.length > testCase.maxResults) {
      console.error(`FAIL maxResults: expected at most ${testCase.maxResults}, got ${result.meals.length}`);
      failures += 1;
      stats.failures += 1;
    }

    if (testCase.expectUsedVector !== undefined && result.usedVector !== testCase.expectUsedVector) {
      console.error(`FAIL usedVector: expected ${testCase.expectUsedVector}, got ${result.usedVector}`);
      failures += 1;
      stats.failures += 1;
    }

    if (testCase.requireValidMealCards) {
      const invalidCards = getInvalidMealCards(result.meals as Array<Record<string, unknown>>);
      if (invalidCards.length > 0) {
        console.error(`FAIL meal cards: found ${invalidCards.length} invalid meal card(s)`);
        failures += 1;
        stats.failures += 1;
      }
    }

    if (testCase.requireNoDuplicateIds) {
      const duplicateIds = getDuplicateIds(result.meals);
      if (duplicateIds.length > 0) {
        console.error(`FAIL duplicate cards: duplicate ids in page: ${duplicateIds.join(', ')}`);
        failures += 1;
        stats.failures += 1;
      }
    }

    if (testCase.warnIfZeroResults && result.meals.length === 0) {
      console.warn(`WARN zero results for data-sensitive case: "${testCase.query}"`);
      warnings += 1;
      stats.warnings += 1;
    }

    if (testCase.warnIfTopMealMissingAny && result.meals.length > 0 && !containsAny(topMealSummary, testCase.warnIfTopMealMissingAny)) {
      console.warn(`WARN top meal may be semantically weak: expected one of [${testCase.warnIfTopMealMissingAny.join(', ')}], got "${result.meals[0].name}"`);
      warnings += 1;
      stats.warnings += 1;
    }

    if (
      testCase.minUniqueRestaurantsInTop !== undefined &&
      uniqueRestaurantsInTop < testCase.minUniqueRestaurantsInTop
    ) {
      console.error(
        `FAIL restaurant variety: expected at least ${testCase.minUniqueRestaurantsInTop} unique restaurants in top ${result.meals.length}, got ${uniqueRestaurantsInTop}`
      );
      failures += 1;
      stats.failures += 1;
    }

    if (testCase.paginationCheck) {
      const page1Params = await buildParams(testCase.query);
      page1Params.limit = testCase.paginationCheck.limit;
      page1Params.offset = 0;
      const page1 = await retrieveMealsWithClient(supabase, page1Params, undefined, { includeDebug: true });

      const page2Params: SearchParams = {
        ...page1Params,
        offset: testCase.paginationCheck.limit,
        searchKey: page1.searchKey,
        isPagination: true,
      };
      const page2 = await retrieveMealsWithClient(supabase, page2Params, undefined, { includeDebug: true });

      const page1Ids = new Set(page1.meals.map((meal) => meal.id));
      const page2Ids = new Set(page2.meals.map((meal) => meal.id));
      const overlapIds = [...page1Ids].filter((id) => page2Ids.has(id));
      const uniqueRestaurantsAcrossPages = new Set(
        [...page1.meals, ...page2.meals].map((meal) => meal.restaurant.toLowerCase())
      ).size;

      console.log({
        paginationQuery: testCase.query,
        page1Count: page1.meals.length,
        page2Count: page2.meals.length,
        overlapIds,
        uniqueRestaurantsAcrossPages,
      });

      if (page1.meals.length < testCase.paginationCheck.minPage1Results) {
        console.error(`FAIL pagination page1: expected at least ${testCase.paginationCheck.minPage1Results}, got ${page1.meals.length}`);
        failures += 1;
        stats.failures += 1;
      }

      if (
        testCase.paginationCheck.minPage2Results !== undefined &&
        page2.meals.length < testCase.paginationCheck.minPage2Results
      ) {
        console.error(`FAIL pagination page2: expected at least ${testCase.paginationCheck.minPage2Results}, got ${page2.meals.length}`);
        failures += 1;
        stats.failures += 1;
      }

      if (overlapIds.length > testCase.paginationCheck.maxOverlapIds) {
        console.error(
          `FAIL pagination overlap: expected at most ${testCase.paginationCheck.maxOverlapIds} overlapping ids, got ${overlapIds.length}`
        );
        failures += 1;
        stats.failures += 1;
      }

      if (
        testCase.paginationCheck.minUniqueRestaurantsAcrossPages !== undefined &&
        uniqueRestaurantsAcrossPages < testCase.paginationCheck.minUniqueRestaurantsAcrossPages
      ) {
        console.error(
          `FAIL pagination variety: expected at least ${testCase.paginationCheck.minUniqueRestaurantsAcrossPages} unique restaurants across pages, got ${uniqueRestaurantsAcrossPages}`
        );
        failures += 1;
        stats.failures += 1;
      }
    }

    if (testCase.expectLocationFilter) {
      const locationDebug = debugInfo.location;
      if (!locationDebug?.requested) {
        console.error('FAIL location filter: expected requested=true in debug info');
        failures += 1;
        stats.failures += 1;
      }

      const annotatedDistances = result.meals
        .map((meal) => meal.distance)
        .filter((distance): distance is number => typeof distance === 'number');

      if (
        testCase.expectLocationFilter.minDistanceAnnotated !== undefined &&
        annotatedDistances.length < testCase.expectLocationFilter.minDistanceAnnotated
      ) {
        console.error(
          `FAIL location annotations: expected at least ${testCase.expectLocationFilter.minDistanceAnnotated}, got ${annotatedDistances.length}`
        );
        failures += 1;
        stats.failures += 1;
      }

      const outsideRadius = annotatedDistances.filter(
        (distance) => distance > testCase.expectLocationFilter!.maxDistanceMiles + 0.05
      );
      if (outsideRadius.length > 0) {
        console.error(
          `FAIL location radius: found ${outsideRadius.length} meal(s) beyond ${testCase.expectLocationFilter.maxDistanceMiles} miles`
        );
        failures += 1;
        stats.failures += 1;
      }
    }
  }

  console.log('\n[retrieval-live] Group summary');
  for (const [group, stats] of groupStats.entries()) {
    console.log({
      group,
      total: stats.total,
      failures: stats.failures,
      warnings: stats.warnings,
    });
  }

  if (warnings > 0) {
    console.warn(`\nRetrieval live verification completed with ${warnings} warning(s).`);
  }

  if (failures > 0) {
    console.error(`\nRetrieval live verification failed with ${failures} issue(s).`);
    process.exit(1);
  }

  console.log(`\nRetrieval live verification passed for ${liveCases.length} queries.`);
}

main().catch((error) => {
  console.error('[retrieval-live] fatal error:', error);
  process.exit(1);
});
