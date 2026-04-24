import { createClient } from '@/utils/supabase/server';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import type { Meal, SearchParams } from '@/app/types';
import { parseQuery, isSQLSufficient, type ParsedQuery } from './query-parser';
import { buildFilters, applyDietaryFilter, type RPCParams } from './filter-builder';
import {
  rankResults,
  mergeAndDeduplicate,
  interleaveByRestaurant,
  type RawResult,
} from './ranker';
import { ResponseFormatter } from './response-formatter';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateDistanceMiles } from '@/lib/distance-utils';
import { hasMacroConstraints, isSmoothieLikeText } from '@/lib/smoothie-search';

const DEFAULT_LIMIT = 5;
const DEFAULT_OFFSET = 0;
const MAX_RESULTS = 20;
const DETERMINISTIC_MIN_RESULTS = 8;
const RESTAURANT_MIN_RESULTS = 3;
const VECTOR_MATCH_COUNT = 25;
const VECTOR_THRESHOLD = 0.25;
const CUISINE_DISCOVERY_LIMIT = 80;
const CUISINE_DISCOVERY_TARGET = 40;
const CATEGORY_DISCOVERY_LIMIT = 140;
const CATEGORY_DISCOVERY_TARGET = 80;
const BROAD_CALORIE_DISCOVERY_LIMIT = 120;
const BROAD_CALORIE_DISCOVERY_TARGET = 60;
const BROAD_DISCOVERY_LIMIT = 180;
const BROAD_DISCOVERY_TARGET = 120;
const RESTAURANT_DIVERSITY_EXPANSION_PAGE_SIZE = 180;
const RESTAURANT_DIVERSITY_EXPANSION_MAX_PAGES = 4;
const RESTAURANT_DIVERSITY_UNIQUE_BUFFER = 4;
const MODIFIER_NAME_PATTERNS = [
  /\badd\b/,
  /\bextra\b/,
  /\bside\b/,
  /\bsauce\b/,
  /\bdressing\b/,
  /\btopping\b/,
  /\boption\b/,
  /\bchoose\b/,
  /\bsubstitute\b/,
  /\bupgrade\b/,
  /\badd\s+(?:chicken|shrimp|salmon|steak|protein|tofu)\b/,
  /\b(?:with|plus)\s+extra\b/,
];
const GENERIC_ADDON_NAMES = new Set([
  'chicken',
  'grilled chicken',
  'crispy chicken',
  'shrimp',
  'salmon',
  'steak',
  'beef',
  'tofu',
  'pork',
  'sausage',
  'meatballs',
  'broccoli',
  'spinach',
  'mushrooms',
  'meat sauce',
]);
const BREAKFAST_FOOD_PATTERNS = [
  /\bbreakfast\b/,
  /\begg\b/,
  /\bom(?:ele|e)tt?e\b/,
  /\bbagel\b/,
  /\bbiscuit\b/,
  /\bcroissant\b/,
  /\bpancake\b/,
  /\bwaffle\b/,
  /\btoast\b/,
  /\boatmeal\b/,
  /\boats\b/,
  /\bgranola\b/,
  /\byogurt\b/,
  /\bparfait\b/,
  /\bhash\b/,
  /\bbreakfast\s+bacon\b/,
  /\bbacon\s+(?:egg|breakfast)\b/,
  /\bbreakfast\s+sausage\b/,
  /\bsausage\s+(?:egg|breakfast)\b/,
  /\bfrittata\b/,
  /\bavocado toast\b/,
  /\bbreakfast\s+bowl\b/,
  /\bbreakfast\s+burrito\b/,
  /\bbreakfast\s+wrap\b/,
  /\bbreakfast\s+sandw(?:ich|hich)\b/,
  /\begg\s+sandwich\b/,
  /\bbagel\s+sandwich\b/,
  /\bbiscuit\s+sandwich\b/,
];
const BREAKFAST_STRICT_ANCHOR_PATTERNS = [
  /\bbreakfast\b/,
  /\bmcmuffin\b/,
  /\bmcgriddle\b/,
  /\bhash\s*brown\b/,
  /\benglish\s+muffin\b/,
  /\bbagel\b/,
  /\bbiscuit\b/,
  /\bcroissant\b/,
  /\bpancake\b/,
  /\bwaffle\b/,
  /\bfrench\s+toast\b/,
  /\boatmeal\b/,
  /\b(?:omelet|omelette|frittata)\b/,
];
const BURGER_LIKE_PATTERNS = /\b(cheeseburger|burger|smashburger|whopper|big\s+mac|quarter\s+pounder)\b/i;
const FAMILY_OR_CATERING_PATTERNS = [
  /\bcatering\b/,
  /\bfamily(?:\s|-)?size\b/,
  /\bfamily(?:\s|-)?pack\b/,
  /\bfamily(?:\s|-)?bundle\b/,
  /\bfamily(?:\s|-)?meal\b/,
  /\bfeeds?\s+\d+\b/,
  /\bserves?\s+\d+\b/,
  /\bparty(?:\s|-)?pack\b/,
  /\bparty(?:\s|-)?tray\b/,
  /\bgroup(?:\s|-)?pack\b/,
  /\bsharing\s+platter\b/,
  /\bmeal\s+for\s+\d+\b/,
];
const FAMILY_OR_CATERING_TAGS = new Set([
  'catering',
  'multi_serving',
  'sharing_platter',
]);

export interface RetrievalResult {
  meals: Meal[];
  totalCount: number;
  hasMore: boolean;
  nextOffset: number;
  searchKey: string;
  usedVector: boolean;
  parsedQuery: ParsedQuery;
  message?: string;
  debugInfo?: RetrievalDebugInfo;
}

export interface RetrievalDebugInfo {
  query: {
    raw: string;
    searchKey: string;
    limit: number;
    offset: number;
    restaurantVariants?: string[];
  };
  parser: {
    mealType?: string;
    category?: string;
    cuisine?: string;
    restaurantQuery?: string;
    proteinPreference: string[];
    includeTags: string[];
    excludeTags: string[];
    confidence: number;
    notes: string[];
    semanticQuery?: string;
  };
  sql: {
    rpcParams: RPCParams;
    deterministicTrace: DeterministicSearchTrace;
    deterministicThreshold: number;
    deterministicCount: number;
    deterministicAfterPostFilter: number;
    vectorCount: number;
    semanticTriggered: boolean;
  };
  results: {
    rankedCount: number;
    rankedRestaurantNames?: string[];
    returnedCount: number;
    returnedMealIds: string[];
    returnedRestaurantNames: string[];
    uniqueRestaurantsReturned: number;
    hasMore: boolean;
    nextOffset: number;
  };
  restaurantResolution: {
    restaurantResolved: boolean;
    resolvedRestaurantNames?: string[];
  };
  location?: {
    requested: boolean;
    radiusMiles?: number;
    source: 'disabled' | 'find_restaurants_near' | 'restaurants_table' | 'no_matches';
    matchedRestaurantCount: number;
    filteredOutCount: number;
    returnedWithinRadius: number;
    error?: string;
  };
}

interface DeterministicSearchTrace {
  skipped: boolean;
  source:
    | 'skipped'
    | 'search_meals_v2'
    | 'search_menu_items'
    | 'table_breakfast_fallback'
    | 'table_smoothie_fallback'
    | 'search_menu_items_broadened'
    | 'none';
  modernRpcCount: number;
  legacyCount: number;
  tableFallbackCount: number;
  broadenedCount: number;
  modernRpcError?: string;
  legacyError?: string;
  broadenedError?: string;
}

interface DeterministicSearchResult {
  results: RawResult[];
  trace: DeterministicSearchTrace;
}

interface PreparedSearchContext {
  effectiveParams: SearchParams;
  searchKey: string;
  originalParams: SearchParams;
}

interface RequestedLocation {
  lat: number;
  lng: number;
  radiusMiles: number;
}

interface NearbyRestaurantRow {
  restaurant_id: string | null;
  restaurant_name: string | null;
  distance_miles: number | string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface NearbyRestaurantMatch {
  restaurantId?: string;
  restaurantName: string;
  distanceMiles: number;
  latitude?: number;
  longitude?: number;
}

interface NearbyFilterContext {
  requested: boolean;
  radiusMiles?: number;
  source: 'disabled' | 'find_restaurants_near' | 'restaurants_table' | 'no_matches';
  matches: NearbyRestaurantMatch[];
  byRestaurantId: Map<string, NearbyRestaurantMatch>;
  byRestaurantName: Map<string, NearbyRestaurantMatch>;
  filteredOutCount: number;
  error?: string;
}

interface BreakfastFallbackRow {
  id: string | number | null;
  name: string | null;
  restaurant_name: string | null;
  restaurant_id: string | null;
  category?: string | null;
  macros?: unknown;
  normalized_category?: string | null;
  meal_type?: string | null;
  item_type?: string | null;
  food_tags?: unknown;
  tags?: unknown;
  confidence_score?: number | string | null;
  description?: string | null;
  description_short?: string | null;
  price_estimate?: number | string | null;
  image_url?: string | null;
  allergens?: unknown;
  allergen_flags?: unknown;
  aliases?: unknown;
  is_available?: boolean | null;
  active_status?: boolean | null;
}

export async function retrieveMeals(
  rawSearchParams: SearchParams,
  options: {
    includeDebug?: boolean;
    userLocation?: { lat: number; lng: number };
    disableSemanticFallback?: boolean;
  } = {}
): Promise<RetrievalResult> {
  const prepared = prepareSearchContext(rawSearchParams);
  const searchParams = prepared.effectiveParams;
  const supabase = await createClient();
  return retrieveMealsWithClient(supabase, searchParams, prepared, options);
}

export async function retrieveMealsWithClient(
  supabase: SupabaseClient,
  searchParams: SearchParams,
  prepared: PreparedSearchContext = prepareSearchContext(searchParams),
  options: {
    includeDebug?: boolean;
    userLocation?: { lat: number; lng: number };
    disableSemanticFallback?: boolean;
  } = {}
): Promise<RetrievalResult> {
  const formatter = new ResponseFormatter(supabase);
  const requestedLocation = getRequestedLocation(searchParams, options.userLocation);
  const nearbyFilter = requestedLocation
    ? await resolveNearbyRestaurants(supabase, requestedLocation)
    : createDisabledNearbyFilter();

  const rawQuery = searchParams.query ?? '';
  const parsed = parseQuery(rawQuery);
  applySearchParamsOverrides(parsed, searchParams);

  if (shouldShortCircuitUnsupportedQuery(parsed)) {
    const shortCircuitHasMore = false;
    const shortCircuitNextOffset = 0;
    return {
      meals: [],
      totalCount: 0,
      hasMore: shortCircuitHasMore,
      nextOffset: shortCircuitNextOffset,
      searchKey: prepared.searchKey,
      usedVector: false,
      parsedQuery: parsed,
      message: 'No verified matches found for that request yet.',
      debugInfo: options.includeDebug
        ? {
            query: {
              raw: rawQuery,
              searchKey: prepared.searchKey,
              limit: Math.max(1, Math.min(searchParams.limit ?? DEFAULT_LIMIT, MAX_RESULTS)),
              offset: Math.max(0, searchParams.offset ?? DEFAULT_OFFSET),
              restaurantVariants: searchParams.restaurantVariants?.length
                ? searchParams.restaurantVariants
                : undefined,
            },
            parser: {
              mealType: parsed.mealType,
              category: parsed.normalizedCategory,
              cuisine: parsed.cuisineType,
              restaurantQuery: parsed.restaurantQuery,
              proteinPreference: parsed.proteinPreference,
              includeTags: parsed.includeTags,
              excludeTags: parsed.excludeTags,
              confidence: parsed.parserConfidence,
              notes: [...parsed.confidenceNotes, 'short_circuit:unsupported_terms_detected'],
              semanticQuery: parsed.semanticQuery,
            },
            sql: {
              rpcParams: {
                p_exclude_large: parsed.excludeLargePortions,
                p_limit: Math.max(1, Math.min(searchParams.limit ?? DEFAULT_LIMIT, MAX_RESULTS)),
                p_offset: Math.max(0, searchParams.offset ?? DEFAULT_OFFSET),
              },
              deterministicTrace: {
                skipped: true,
                source: 'skipped',
                modernRpcCount: 0,
                legacyCount: 0,
                tableFallbackCount: 0,
                broadenedCount: 0,
              },
              deterministicThreshold: 0,
              deterministicCount: 0,
              deterministicAfterPostFilter: 0,
              vectorCount: 0,
              semanticTriggered: false,
            },
            results: {
              rankedCount: 0,
              returnedCount: 0,
              returnedMealIds: [],
              returnedRestaurantNames: [],
              uniqueRestaurantsReturned: 0,
              hasMore: shortCircuitHasMore,
              nextOffset: shortCircuitNextOffset,
            },
            restaurantResolution: {
              restaurantResolved: false,
            },
            location: {
              requested: nearbyFilter.requested,
              radiusMiles: nearbyFilter.radiusMiles,
              source: nearbyFilter.source,
              matchedRestaurantCount: nearbyFilter.matches.length,
              filteredOutCount: nearbyFilter.filteredOutCount,
              returnedWithinRadius: 0,
              error: nearbyFilter.error,
            },
          }
        : undefined,
    };
  }

  const limit = Math.max(1, Math.min(searchParams.limit ?? DEFAULT_LIMIT, MAX_RESULTS));
  const offset = Math.max(0, searchParams.offset ?? DEFAULT_OFFSET);
  const restaurantVariants = searchParams.restaurantVariants?.length
    ? searchParams.restaurantVariants
    : undefined;
  const targetResultWindow = getTargetResultWindow(parsed, offset, limit);
  const baseCandidateLimit = getCandidateLimit(parsed, limit, restaurantVariants);
  // Keep candidate retrieval depth growing with pagination offset so "load more"
  // doesn't exhaust early when there are still matching meals deeper in the set.
  const candidateLimit = Math.max(
    baseCandidateLimit,
    targetResultWindow * 3,
    offset + limit + 40
  );
  const macroOnlyHomeFiltering = searchParams.isHomepage === true;

  const filterResult = await buildFilters(supabase, parsed, {
    limit: candidateLimit,
    offset: 0,
    restaurantVariants,
  });
  const effectiveFilterParams: RPCParams = macroOnlyHomeFiltering
    ? {
        ...filterResult.params,
        p_exclude_large: false,
        p_normalized_category: undefined,
        p_meal_type: undefined,
        p_name_keyword: undefined,
        p_protein_sources: undefined,
        p_exclude_terms: undefined,
      }
    : filterResult.params;
  const effectiveDietaryKeywords = macroOnlyHomeFiltering
    ? undefined
    : filterResult.dietaryKeywords;

  let deterministicSearch = await runDeterministicSearch(supabase, parsed, effectiveFilterParams);
  const deterministicResults = applyResolvedRestaurantFilter(
    applyNearbyRestaurantFilter(deterministicSearch.results, nearbyFilter),
    {
      restaurantId: searchParams.restaurantId,
      restaurantNames: filterResult.resolvedRestaurantNames,
    }
  );
  let deterministicFiltered = applyPostRetrievalFilters(
    deterministicResults,
    parsed,
    effectiveDietaryKeywords,
    { macroOnly: macroOnlyHomeFiltering }
  );

  const deterministicThreshold = parsed.restaurantQuery || restaurantVariants?.length
    ? RESTAURANT_MIN_RESULTS
    : DETERMINISTIC_MIN_RESULTS;

  let vectorResults: RawResult[] = [];
  let usedVector = false;

  if (effectiveDietaryKeywords?.length && deterministicFiltered.length < deterministicThreshold) {
    const dietaryFallbackResults = await runTableDietaryFallback(
      supabase,
      parsed,
      effectiveFilterParams,
      effectiveDietaryKeywords
    );
    const dietaryFallbackFiltered = applyPostRetrievalFilters(
      applyResolvedRestaurantFilter(
        applyNearbyRestaurantFilter(dietaryFallbackResults, nearbyFilter),
        {
          restaurantId: searchParams.restaurantId,
          restaurantNames: filterResult.resolvedRestaurantNames,
        }
      ),
      parsed,
      effectiveDietaryKeywords,
      { macroOnly: macroOnlyHomeFiltering }
    );

    deterministicFiltered = mergeAndDeduplicate(
      deterministicFiltered,
      dietaryFallbackFiltered,
      parsed,
      undefined
    );
  }

  if (macroOnlyHomeFiltering || isSmoothieQuery(parsed)) {
    const smoothieSupplementResults = await runSmoothieTableFallback(
      supabase,
      parsed,
      effectiveFilterParams,
      { supplemental: !isSmoothieQuery(parsed) }
    );

    if (smoothieSupplementResults.length > 0) {
      const smoothieSupplementFiltered = applyPostRetrievalFilters(
        applyResolvedRestaurantFilter(
          applyNearbyRestaurantFilter(smoothieSupplementResults, nearbyFilter),
          {
            restaurantId: searchParams.restaurantId,
            restaurantNames: filterResult.resolvedRestaurantNames,
          }
        ),
        parsed,
        effectiveDietaryKeywords,
        { macroOnly: macroOnlyHomeFiltering }
      );

      deterministicFiltered = mergeAndDeduplicate(
        deterministicFiltered,
        smoothieSupplementFiltered,
        parsed,
        undefined
      );
    }
  }

  if (
    shouldExpandRestaurantDiversityPool(parsed, restaurantVariants, filterResult.restaurantResolved) &&
    needsRestaurantDiversityExpansion(deterministicFiltered, offset, limit)
  ) {
    const diversityExpansion = await expandDeterministicResultsForRestaurantDiversity(
      supabase,
      deterministicSearch.trace.source,
      parsed,
      effectiveFilterParams,
      {
        restaurantId: searchParams.restaurantId,
        restaurantNames: filterResult.resolvedRestaurantNames,
      },
      nearbyFilter,
      effectiveDietaryKeywords,
      { macroOnly: macroOnlyHomeFiltering },
      {
        offset,
        limit,
        existingItems: deterministicFiltered,
      }
    );

    if (diversityExpansion.results.length > 0) {
      console.log('[RetrievalEngine] expanded deterministic pool for restaurant diversity', {
        addedResults: diversityExpansion.results.length,
        fetchedRowCount: diversityExpansion.fetchedRowCount,
        restaurantsBefore: countUniqueRestaurants(deterministicFiltered),
        restaurantsAfter: countUniqueRestaurants([
          ...deterministicFiltered,
          ...diversityExpansion.results,
        ]),
      });

      deterministicFiltered = dedupeRawResultsById([
        ...deterministicFiltered,
        ...diversityExpansion.results,
      ]);

      deterministicSearch = {
        ...deterministicSearch,
        trace: {
          ...deterministicSearch.trace,
          modernRpcCount:
            deterministicSearch.trace.source === 'search_meals_v2'
              ? diversityExpansion.fetchedRowCount
              : deterministicSearch.trace.modernRpcCount,
          legacyCount:
            deterministicSearch.trace.source === 'search_menu_items'
              ? diversityExpansion.fetchedRowCount
              : deterministicSearch.trace.legacyCount,
        },
      };
    }
  }

  const semanticFallbackTriggered =
    !options.disableSemanticFallback &&
    shouldUseSemanticFallback(parsed, deterministicFiltered.length, deterministicThreshold);

  if (semanticFallbackTriggered) {
    vectorResults = await runVectorSearch(supabase, parsed);
    vectorResults = applyResolvedRestaurantFilter(
      applyNearbyRestaurantFilter(vectorResults, nearbyFilter),
      {
        restaurantId: searchParams.restaurantId,
        restaurantNames: filterResult.resolvedRestaurantNames,
      }
    );
    vectorResults = applyPostRetrievalFilters(vectorResults, parsed, effectiveDietaryKeywords, {
      macroOnly: macroOnlyHomeFiltering,
    });
    usedVector = vectorResults.length > 0;
  }

  let ranked = mergeAndDeduplicate(
    deterministicFiltered,
    vectorResults,
    parsed,
    undefined
  );

  const isSingleRestaurantQuery =
    filterResult.restaurantResolved &&
    (filterResult.resolvedRestaurantNames?.length ?? 0) === 1;

  if (!isSingleRestaurantQuery) {
    ranked = interleaveByRestaurant(ranked);
  }

  ranked = rotateSmoothieDiscoveryResults(
    ranked,
    parsed,
    buildRotationSeed(searchParams.userContext?.userId, prepared.searchKey)
  );

  ranked = rotateBroadDiscoveryResults(
    ranked,
    parsed,
    buildRotationSeed(searchParams.userContext?.userId, prepared.searchKey),
    restaurantVariants
  );

  if (!macroOnlyHomeFiltering) {
    ranked = ranked.slice(0, targetResultWindow);
  }

  const totalCount = ranked.length;
  const paged = ranked.slice(offset, offset + limit);
  const formatterLocation = requestedLocation
    ? { lat: requestedLocation.lat, lng: requestedLocation.lng }
    : options.userLocation;
  const meals = await formatter.format(paged, formatterLocation);
  const hasMore = offset + limit < totalCount;
  const nextOffset = hasMore ? offset + limit : offset;

  const debugInfo: RetrievalDebugInfo | undefined = options.includeDebug
    ? {
        query: {
          raw: rawQuery,
          searchKey: prepared.searchKey,
          limit,
          offset,
          restaurantVariants,
        },
        parser: {
          mealType: parsed.mealType,
          category: parsed.normalizedCategory,
          cuisine: parsed.cuisineType,
          restaurantQuery: parsed.restaurantQuery,
          proteinPreference: parsed.proteinPreference,
          includeTags: parsed.includeTags,
          excludeTags: parsed.excludeTags,
          confidence: parsed.parserConfidence,
          notes: parsed.confidenceNotes,
          semanticQuery: parsed.semanticQuery,
        },
        sql: {
          rpcParams: effectiveFilterParams,
          deterministicTrace: deterministicSearch.trace,
          deterministicThreshold,
          deterministicCount: deterministicResults.length,
          deterministicAfterPostFilter: deterministicFiltered.length,
          vectorCount: vectorResults.length,
          semanticTriggered: semanticFallbackTriggered,
        },
        results: {
          rankedCount: ranked.length,
          rankedRestaurantNames: ranked.map((meal) => meal.restaurant_name),
          returnedCount: meals.length,
          returnedMealIds: meals.map((meal) => meal.id),
          returnedRestaurantNames: meals.map((meal) => meal.restaurant),
          uniqueRestaurantsReturned: new Set(meals.map((meal) => meal.restaurant.toLowerCase())).size,
          hasMore,
          nextOffset,
        },
        restaurantResolution: {
          restaurantResolved: filterResult.restaurantResolved,
          resolvedRestaurantNames: filterResult.resolvedRestaurantNames,
        },
        location: {
          requested: nearbyFilter.requested,
          radiusMiles: nearbyFilter.radiusMiles,
          source: nearbyFilter.source,
          matchedRestaurantCount: nearbyFilter.matches.length,
          filteredOutCount: nearbyFilter.filteredOutCount,
          returnedWithinRadius: meals.filter((meal) => meal.distance !== undefined).length,
          error: nearbyFilter.error,
        },
      }
    : undefined;

  return {
    meals,
    totalCount,
    hasMore,
    nextOffset,
    searchKey: prepared.searchKey,
    usedVector,
    parsedQuery: parsed,
    message: meals.length === 0 ? 'No verified matches found for that request yet.' : undefined,
    debugInfo,
  };
}

function getRequestedLocation(
  searchParams: SearchParams,
  optionLocation?: { lat: number; lng: number }
): RequestedLocation | undefined {
  const explicitLocationRequested =
    typeof searchParams.location === 'string' &&
    searchParams.location.trim().toLowerCase() === 'near me';

  if (!explicitLocationRequested) {
    return undefined;
  }

  const userContext = searchParams.userContext ?? {};
  const lat = optionLocation?.lat ?? normalizeNumber(userContext.user_location_lat);
  const lng = optionLocation?.lng ?? normalizeNumber(userContext.user_location_lng);
  const radiusMiles = normalizeNumber(userContext.search_distance_miles);

  if (lat === undefined || lng === undefined || radiusMiles === undefined || radiusMiles <= 0) {
    return undefined;
  }

  return { lat, lng, radiusMiles };
}

function createDisabledNearbyFilter(): NearbyFilterContext {
  return {
    requested: false,
    source: 'disabled',
    matches: [],
    byRestaurantId: new Map(),
    byRestaurantName: new Map(),
    filteredOutCount: 0,
  };
}

async function resolveNearbyRestaurants(
  supabase: SupabaseClient,
  location: RequestedLocation
): Promise<NearbyFilterContext> {
  const baseContext: NearbyFilterContext = {
    requested: true,
    radiusMiles: location.radiusMiles,
    source: 'no_matches',
    matches: [],
    byRestaurantId: new Map(),
    byRestaurantName: new Map(),
    filteredOutCount: 0,
  };

  try {
    const rpcResult = await supabase.rpc('find_restaurants_near', {
      lat: location.lat,
      lng: location.lng,
      radius_miles: location.radiusMiles,
    });

    if (!rpcResult.error && rpcResult.data) {
      const matches = normalizeNearbyMatches((rpcResult.data ?? []) as NearbyRestaurantRow[]);
      if (matches.length > 0) {
        return buildNearbyFilterContext(baseContext, 'find_restaurants_near', matches);
      }
    } else if (rpcResult.error) {
      baseContext.error = rpcResult.error.message;
    }
  } catch (error) {
    baseContext.error = error instanceof Error ? error.message : String(error);
  }

  try {
    const { data, error } = await supabase
      .from('restaurants')
      .select('id, name, latitude, longitude')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (error) {
      return {
        ...baseContext,
        error: baseContext.error ? `${baseContext.error}; ${error.message}` : error.message,
      };
    }

    const matches: NearbyRestaurantMatch[] = [];
    for (const restaurant of data ?? []) {
      const latitude = normalizeNumber(restaurant.latitude);
      const longitude = normalizeNumber(restaurant.longitude);
      if (latitude === undefined || longitude === undefined) {
        continue;
      }

      const distanceMiles = calculateDistanceMiles(
        { latitude: location.lat, longitude: location.lng },
        { latitude, longitude }
      );

      if (distanceMiles > location.radiusMiles) {
        continue;
      }

      matches.push({
        restaurantId: optionalString(restaurant.id),
        restaurantName: String(restaurant.name ?? '').trim(),
        distanceMiles,
        latitude,
        longitude,
      });
    }

    if (matches.length > 0) {
      return buildNearbyFilterContext(baseContext, 'restaurants_table', matches);
    }

    return baseContext;
  } catch (error) {
    return {
      ...baseContext,
      error: baseContext.error
        ? `${baseContext.error}; ${error instanceof Error ? error.message : String(error)}`
        : error instanceof Error
          ? error.message
          : String(error),
    };
  }
}

function normalizeNearbyMatches(rows: NearbyRestaurantRow[]): NearbyRestaurantMatch[] {
  const matches: NearbyRestaurantMatch[] = [];
  for (const row of rows) {
    const distanceMiles = normalizeNumber(row.distance_miles);
    const restaurantName = optionalString(row.restaurant_name);
    if (distanceMiles === undefined || !restaurantName) {
      continue;
    }

    matches.push({
      restaurantId: optionalString(row.restaurant_id),
      restaurantName,
      distanceMiles,
      latitude: normalizeNumber(row.latitude),
      longitude: normalizeNumber(row.longitude),
    });
  }
  return matches;
}

function buildNearbyFilterContext(
  context: NearbyFilterContext,
  source: NearbyFilterContext['source'],
  matches: NearbyRestaurantMatch[]
): NearbyFilterContext {
  const byRestaurantId = new Map<string, NearbyRestaurantMatch>();
  const byRestaurantName = new Map<string, NearbyRestaurantMatch>();

  for (const match of matches) {
    if (match.restaurantId) {
      byRestaurantId.set(match.restaurantId, match);
    }
    byRestaurantName.set(match.restaurantName.toLowerCase(), match);
  }

  return {
    ...context,
    source,
    matches,
    byRestaurantId,
    byRestaurantName,
  };
}

function applyNearbyRestaurantFilter(
  items: RawResult[],
  nearbyFilter: NearbyFilterContext
): RawResult[] {
  if (!nearbyFilter.requested) {
    return items;
  }

  if (nearbyFilter.matches.length === 0) {
    nearbyFilter.filteredOutCount += items.length;
    return [];
  }

  const filtered = items.filter((item) => {
    if (item.restaurant_id && nearbyFilter.byRestaurantId.has(item.restaurant_id)) {
      return true;
    }

    const restaurantName = item.restaurant_name?.trim().toLowerCase();
    return Boolean(restaurantName && nearbyFilter.byRestaurantName.has(restaurantName));
  });

  nearbyFilter.filteredOutCount += Math.max(0, items.length - filtered.length);
  return filtered;
}

function applyResolvedRestaurantFilter(
  items: RawResult[],
  options: {
    restaurantId?: string;
    restaurantNames?: string[];
  }
): RawResult[] {
  const allowedRestaurantId = options.restaurantId?.trim();
  const allowedRestaurantNames = new Set(
    (options.restaurantNames ?? [])
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean)
  );

  if (!allowedRestaurantId && allowedRestaurantNames.size === 0) {
    return items;
  }

  return items.filter((item) => {
    if (allowedRestaurantId && item.restaurant_id === allowedRestaurantId) {
      return true;
    }

    const restaurantName = item.restaurant_name?.trim().toLowerCase();
    return Boolean(restaurantName && allowedRestaurantNames.has(restaurantName));
  });
}

async function expandDeterministicResultsForRestaurantDiversity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  source: DeterministicSearchTrace['source'],
  parsed: ParsedQuery,
  params: RPCParams,
  restaurantFilter: {
    restaurantId?: string;
    restaurantNames?: string[];
  },
  nearbyFilter: NearbyFilterContext,
  dietaryKeywords: string[] | undefined,
  filterOptions: {
    macroOnly?: boolean;
  },
  options: {
    offset: number;
    limit: number;
    existingItems: RawResult[];
  }
): Promise<{ results: RawResult[]; fetchedRowCount: number }> {
  if (source !== 'search_meals_v2' && source !== 'search_menu_items') {
    return { results: [], fetchedRowCount: 0 };
  }

  const requiredUniqueRestaurants = getRequiredUniqueRestaurantCount(
    options.offset,
    options.limit
  );
  const pageSize = Math.max(params.p_limit, RESTAURANT_DIVERSITY_EXPANSION_PAGE_SIZE);
  let aggregated = dedupeRawResultsById(options.existingItems);
  let fetchedRowCount = 0;

  for (let pageIndex = 0; pageIndex < RESTAURANT_DIVERSITY_EXPANSION_MAX_PAGES; pageIndex += 1) {
    if (countUniqueRestaurants(aggregated) >= requiredUniqueRestaurants) {
      break;
    }

    const pageOffset = pageIndex * pageSize;
    const pageParams: RPCParams = {
      ...params,
      p_limit: pageSize,
      p_offset: pageOffset,
    };

    const rpcResponse =
      source === 'search_meals_v2'
        ? await supabase.rpc('search_meals_v2', pageParams)
        : await supabase.rpc('search_menu_items', toLegacySearchParams(pageParams));

    if (rpcResponse.error) {
      console.warn('[RetrievalEngine] restaurant diversity expansion failed:', rpcResponse.error.message);
      break;
    }

    const pageResults = (rpcResponse.data ?? []) as RawResult[];
    if (pageResults.length === 0) {
      break;
    }

    fetchedRowCount += pageResults.length;

    const filteredPage = applyPostRetrievalFilters(
      applyResolvedRestaurantFilter(
        applyNearbyRestaurantFilter(pageResults, nearbyFilter),
        restaurantFilter
      ),
      parsed,
      dietaryKeywords,
      filterOptions
    );

    aggregated = dedupeRawResultsById([...aggregated, ...filteredPage]);

    if (pageResults.length < pageSize) {
      break;
    }
  }

  const existingIds = new Set(options.existingItems.map((item) => item.id));
  const additionalResults = aggregated.filter((item) => !existingIds.has(item.id));

  return {
    results: additionalResults,
    fetchedRowCount,
  };
}

async function runDeterministicSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parsed: ParsedQuery,
  params: RPCParams
): Promise<DeterministicSearchResult> {
  if (!isSQLSufficient(parsed)) {
    return {
      results: [],
      trace: {
        skipped: true,
        source: 'skipped',
        modernRpcCount: 0,
        legacyCount: 0,
        tableFallbackCount: 0,
        broadenedCount: 0,
      },
    };
  }

  const modernRpc = await supabase.rpc('search_meals_v2', params);
  const modernResults = (modernRpc.data ?? []) as RawResult[];
  if (!modernRpc.error && modernResults.length > 0) {
    return {
      results: modernResults,
      trace: {
        skipped: false,
        source: 'search_meals_v2',
        modernRpcCount: modernResults.length,
        legacyCount: 0,
        tableFallbackCount: 0,
        broadenedCount: 0,
      },
    };
  }

  const legacyParams = toLegacySearchParams(params);
  const legacyRpc = await supabase.rpc('search_menu_items', legacyParams);
  const legacyResults = (legacyRpc.data ?? []) as RawResult[];

  if (legacyRpc.error) {
    console.error('[RetrievalEngine] deterministic RPC error:', {
      search_meals_v2: modernRpc.error?.message,
      search_menu_items: legacyRpc.error.message,
    });
    return {
      results: [],
      trace: {
        skipped: false,
        source: 'none',
        modernRpcCount: modernResults.length,
        legacyCount: legacyResults.length,
        tableFallbackCount: 0,
        broadenedCount: 0,
        modernRpcError: modernRpc.error?.message,
        legacyError: legacyRpc.error.message,
      },
    };
  }

  if (legacyResults.length > 0) {
    return {
      results: legacyResults,
      trace: {
        skipped: false,
        source: 'search_menu_items',
        modernRpcCount: modernResults.length,
        legacyCount: legacyResults.length,
        tableFallbackCount: 0,
        broadenedCount: 0,
        modernRpcError: modernRpc.error?.message,
      },
    };
  }

  const tableFallbackResults = await runTableCategoryFallback(supabase, parsed, params);
  if (tableFallbackResults.length > 0) {
    const tableFallbackSource = isSmoothieQuery(parsed)
      ? 'table_smoothie_fallback'
      : 'table_breakfast_fallback';
    return {
      results: tableFallbackResults,
      trace: {
        skipped: false,
        source: tableFallbackSource,
        modernRpcCount: modernResults.length,
        legacyCount: legacyResults.length,
        tableFallbackCount: tableFallbackResults.length,
        broadenedCount: 0,
        modernRpcError: modernRpc.error?.message,
      },
    };
  }

  const broadenedParams = buildBroadenedParams(params, parsed);
  if (!broadenedParams) {
    return {
      results: legacyResults,
      trace: {
        skipped: false,
        source: 'none',
        modernRpcCount: modernResults.length,
        legacyCount: legacyResults.length,
        tableFallbackCount: tableFallbackResults.length,
        broadenedCount: 0,
        modernRpcError: modernRpc.error?.message,
      },
    };
  }

  const broadenedLegacy = await supabase.rpc('search_menu_items', toLegacySearchParams(broadenedParams));
  const broadenedResults = (broadenedLegacy.data ?? []) as RawResult[];
  if (!broadenedLegacy.error && broadenedResults.length > 0) {
    return {
      results: broadenedResults,
      trace: {
        skipped: false,
        source: 'search_menu_items_broadened',
        modernRpcCount: modernResults.length,
        legacyCount: legacyResults.length,
        tableFallbackCount: tableFallbackResults.length,
        broadenedCount: broadenedResults.length,
        modernRpcError: modernRpc.error?.message,
      },
    };
  }

  return {
    results: legacyResults,
    trace: {
      skipped: false,
      source: 'none',
      modernRpcCount: modernResults.length,
      legacyCount: legacyResults.length,
      tableFallbackCount: tableFallbackResults.length,
      broadenedCount: broadenedResults.length,
      modernRpcError: modernRpc.error?.message,
      broadenedError: broadenedLegacy.error?.message,
    },
  };
}

async function runTableCategoryFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parsed: ParsedQuery,
  params: RPCParams
): Promise<RawResult[]> {
  const baseSelect = getMenuItemFallbackSelect();

  if (parsed.normalizedCategory === 'breakfast_sandwich') {
    const { data, error } = await supabase
      .from('menu_items')
      .select(baseSelect)
      .eq('meal_type', 'breakfast')
      .eq('item_type', 'meal')
      .or([
        'normalized_category.eq.breakfast_sandwich',
        'normalized_category.eq.sandwich',
        'name.ilike.%breakfast sandwich%',
        'name.ilike.%breakfast sandwhich%',
        'name.ilike.%egg sandwich%',
        'name.ilike.%bagel sandwich%',
        'name.ilike.%biscuit sandwich%',
      ].join(', '))
      .limit(params.p_limit);

    if (error) {
      console.error('[RetrievalEngine] breakfast_sandwich table fallback error:', error.message);
      return [];
    }

    return normalizeTableFallbackRows((data ?? []) as unknown as BreakfastFallbackRow[]);
  }

  if (isSmoothieQuery(parsed)) {
    return runSmoothieTableFallback(supabase, parsed, params);
  }

  return [];
}

async function runSmoothieTableFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parsed: ParsedQuery,
  params: RPCParams,
  options?: { supplemental?: boolean }
): Promise<RawResult[]> {
  const baseSelect = getMenuItemFallbackSelect();
  const smoothieCandidateLimit = options?.supplemental
    ? Math.max(params.p_limit * 4, 80)
    : Math.max(params.p_limit * 12, 180);

  let query = supabase
    .from('menu_items')
    .select(baseSelect)
    .eq('item_type', 'drink')
    .not('macros', 'is', null)
    .or([
      'normalized_category.ilike.%smoothie%',
      'category.ilike.%smoothie%',
      'name.ilike.%smoothie%',
      'name.ilike.%blend%',
    ].join(', '))
    .order('restaurant_name', { ascending: true })
    .order('id', { ascending: true })
    .limit(smoothieCandidateLimit);

  if (params.p_restaurant_names?.length) {
    query = query.in('restaurant_name', params.p_restaurant_names);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[RetrievalEngine] smoothie table fallback error:', error.message);
    return [];
  }

  return normalizeTableFallbackRows((data ?? []) as unknown as BreakfastFallbackRow[])
    .filter((item) => matchesSmoothieIntent(item))
    .filter((item) => satisfiesParsedMacroConstraints(item, parsed));
}

async function runTableDietaryFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parsed: ParsedQuery,
  params: RPCParams,
  dietaryKeywords: string[]
): Promise<RawResult[]> {
  const keywordClauses = dietaryKeywords
    .flatMap((keyword) => {
      const escaped = keyword.replace(/,/g, ' ').trim();
      if (!escaped) {
        return [];
      }
      return [
        `name.ilike.%${escaped}%`,
        `description.ilike.%${escaped}%`,
        `description_short.ilike.%${escaped}%`,
      ];
    });

  if (keywordClauses.length === 0) {
    return [];
  }

  let query = supabase
    .from('menu_items')
    .select(getMenuItemFallbackSelect())
    .eq('item_type', 'meal')
    .not('macros', 'is', null)
    .or(keywordClauses.join(', '))
    .order('restaurant_name', { ascending: true })
    .order('id', { ascending: true })
    .limit(Math.max(params.p_limit * 2, 240));

  if (params.p_restaurant_names?.length) {
    query = query.in('restaurant_name', params.p_restaurant_names);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[RetrievalEngine] dietary table fallback error:', error.message);
    return [];
  }

  return normalizeTableFallbackRows((data ?? []) as unknown as BreakfastFallbackRow[])
    .filter((item) => satisfiesParsedMacroConstraints(item, parsed));
}

function getMenuItemFallbackSelect(): string {
  return [
    'id',
    'name',
    'restaurant_name',
    'restaurant_id',
    'category',
    'macros',
    'normalized_category',
    'meal_type',
    'item_type',
    'food_tags',
    'tags',
    'confidence_score',
    'description',
    'description_short',
    'price_estimate',
    'image_url',
    'allergens',
    'allergen_flags',
    'aliases',
    'is_available',
    'active_status',
  ].join(', ');
}

function normalizeTableFallbackRows(rows: BreakfastFallbackRow[]): RawResult[] {
  return rows
    .filter((item) => item.is_available !== false && item.active_status !== false)
    .map((item) => ({
      id: String(item.id ?? ''),
      name: String(item.name ?? ''),
      restaurant_name: String(item.restaurant_name ?? ''),
      restaurant_id: String(item.restaurant_id ?? ''),
      macros: normalizeMacros(item as unknown as Record<string, unknown>),
      normalized_category: optionalString(item.normalized_category ?? item.category),
      meal_type: optionalString(item.meal_type),
      item_type: optionalString(item.item_type),
      food_tags: normalizeTextArray(item.tags) ?? normalizeTextArray(item.food_tags),
      confidence_score: normalizeNumber(item.confidence_score) ?? 0.8,
      description: optionalString(item.description_short ?? item.description),
      price: normalizeNumber(item.price_estimate),
      image_url: optionalString(item.image_url),
      allergens: normalizeTextArray(item.allergen_flags) ?? normalizeTextArray(item.allergens),
    }));
}

function satisfiesParsedMacroConstraints(item: RawResult, parsed: ParsedQuery): boolean {
  const calories = item.macros?.calories ?? 0;
  const protein = item.macros?.protein ?? 0;
  const carbs = item.macros?.carbs ?? 0;
  const fat = item.macros?.fat ?? 0;

  if (parsed.minCalories !== undefined && calories < parsed.minCalories) return false;
  if (parsed.maxCalories !== undefined && calories > parsed.maxCalories) return false;
  if (parsed.minProtein !== undefined && protein < parsed.minProtein) return false;
  if (parsed.maxProtein !== undefined && protein > parsed.maxProtein) return false;
  if (parsed.minCarbs !== undefined && carbs < parsed.minCarbs) return false;
  if (parsed.maxCarbs !== undefined && carbs > parsed.maxCarbs) return false;
  if (parsed.minFat !== undefined && fat < parsed.minFat) return false;
  if (parsed.maxFat !== undefined && fat > parsed.maxFat) return false;

  return true;
}

function toLegacySearchParams(params: RPCParams) {
  return {
    p_min_calories: params.p_min_calories,
    p_max_calories: params.p_max_calories,
    p_min_protein: params.p_min_protein,
    p_max_protein: params.p_max_protein,
    p_max_carbs: params.p_max_carbs,
    p_min_carbs: params.p_min_carbs,
    p_max_fat: params.p_max_fat,
    p_min_fat: params.p_min_fat,
    p_normalized_category: params.p_normalized_category,
    p_meal_type: params.p_meal_type,
    p_restaurant_names: params.p_restaurant_names,
    p_exclude_large: params.p_exclude_large,
    p_limit: params.p_limit,
    p_offset: params.p_offset,
    p_name_keyword: params.p_name_keyword,
  };
}

async function runVectorSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parsed: ParsedQuery
): Promise<RawResult[]> {
  try {
    const textToEmbed = parsed.semanticQuery || parsed.raw;
    if (!textToEmbed || textToEmbed.trim().length < 3) {
      return [];
    }

    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: textToEmbed,
    });

    const { data, error } = await supabase.rpc('match_menu_items', {
      query_embedding: embedding,
      match_threshold: VECTOR_THRESHOLD,
      match_count: VECTOR_MATCH_COUNT,
    });

    if (error) {
      console.error('[RetrievalEngine] vector search error:', error.message);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return (data as Array<Record<string, unknown>>).map((item) => ({
      id: String(item.id ?? ''),
      name: String(item.name ?? ''),
      restaurant_name: String(item.restaurant_name ?? ''),
      restaurant_id: String(item.restaurant_id ?? ''),
      macros: normalizeMacros(item),
      normalized_category: optionalString(item.normalized_category),
      meal_type: optionalString(item.meal_type),
      item_type: optionalString(item.item_type),
      food_tags: normalizeTextArray(item.food_tags),
      confidence_score: normalizeNumber(item.confidence_score) ?? 0.7,
      description: optionalString(item.description),
      price: normalizeNumber(item.price_estimate ?? item.price),
      image_url: optionalString(item.image_url),
      allergens: normalizeTextArray(item.allergens),
      similarity: normalizeNumber(item.similarity) ?? undefined,
    }));
  } catch (error) {
    console.error('[RetrievalEngine] vector search exception:', error);
    return [];
  }
}

function applyPostRetrievalFilters(
  items: RawResult[],
  parsed: ParsedQuery,
  dietaryKeywords?: string[],
  options: {
    macroOnly?: boolean;
  } = {}
): RawResult[] {
  let filtered = applyPostRetrievalFiltersInternal(
    items,
    parsed,
    dietaryKeywords,
    false,
    options.macroOnly === true
  );

  if (
    filtered.length === 0 &&
    shouldRelaxRestaurantMealType(parsed)
  ) {
    filtered = applyPostRetrievalFiltersInternal(
      items,
      parsed,
      dietaryKeywords,
      true,
      options.macroOnly === true
    );
  }

  if (
    filtered.length === 0 &&
    shouldRelaxSpecificMealType(parsed)
  ) {
    filtered = applyPostRetrievalFiltersInternal(
      items,
      parsed,
      dietaryKeywords,
      true,
      options.macroOnly === true
    );
  }

  const smoothieQuery = isSmoothieQuery(parsed);

  const ranked = rankResults(filtered, parsed);

  if (!smoothieQuery) {
    return ranked;
  }

  const explicitSmoothies = ranked.filter((item) => hasExplicitSmoothieSignals(item));
  const inferredSmoothies = ranked.filter((item) => !hasExplicitSmoothieSignals(item));

  return [...explicitSmoothies, ...inferredSmoothies];
}

function applyPostRetrievalFiltersInternal(
  items: RawResult[],
  parsed: ParsedQuery,
  dietaryKeywords: string[] | undefined,
  relaxMealType: boolean,
  macroOnly: boolean
): RawResult[] {
  let filtered = items;
  const smoothieQuery = isSmoothieQuery(parsed);
  const strictSmoothieOnly = isStrictSmoothieOnlyQuery(parsed);

  if (macroOnly) {
    return filtered.filter((item) => satisfiesParsedMacroConstraints(item, parsed));
  }

  if (dietaryKeywords?.length) {
    filtered = applyDietaryFilter(filtered, dietaryKeywords) as RawResult[];
  }

  filtered = filtered.filter((item) => {
    const smoothieItem = strictSmoothieOnly
      ? hasStrictSmoothieSignals(item)
      : matchesSmoothieIntent(item);

    if (smoothieQuery && !smoothieItem) {
      return false;
    }

    if (item.item_type && item.item_type !== 'meal' && !smoothieItem) {
      return false;
    }

    if (!smoothieItem && isLikelyModifierLikeResult(item, parsed)) {
      return false;
    }

    if (isCateringOrFamilyStyleResult(item)) {
      return false;
    }

    if (!matchesMealType(item, parsed, relaxMealType)) {
      return false;
    }

    if (requiresStrictBreakfastFoodFiltering(parsed) && !looksLikeBreakfastFood(item)) {
      return false;
    }

    if (!satisfiesParsedMacroConstraints(item, parsed)) {
      return false;
    }

    if (!matchesRequestedCategory(item, parsed)) {
      return false;
    }

    if (!matchesSpecificDishAnchors(item, parsed)) {
      return false;
    }

    if (!matchesCuisineOrStyle(item, parsed)) {
      return false;
    }

    if (!matchesProteinPreference(item, parsed)) {
      return false;
    }

    if (!matchesExcludedTerms(item, parsed)) {
      return false;
    }

    return true;
  });
  return filtered;
}

function isSmoothieQuery(parsed: ParsedQuery): boolean {
  if (isAcaiBowlQuery(parsed)) {
    return false;
  }

  return (
    parsed.normalizedCategory === 'smoothie' ||
    parsed.categories.includes('smoothie') ||
    isSmoothieLikeText(parsed.raw)
  );
}

function isStrictSmoothieOnlyQuery(parsed: ParsedQuery): boolean {
  const raw = parsed.raw.toLowerCase();
  const asksForSmoothie = /\bsmoothies?\b/.test(raw);
  if (!asksForSmoothie) {
    return false;
  }

  return !/\b(shakes?|acai|pitaya|juice|juices|drink|drinks)\b/.test(raw);
}

function matchesSmoothieIntent(item: RawResult): boolean {
  const name = (item.name ?? '').toLowerCase();
  const description = (item.description ?? '').toLowerCase();
  const normalizedCategory = (item.normalized_category ?? '').toLowerCase();
  const itemType = (item.item_type ?? '').toLowerCase();
  const explicitSignals = [name, description].join(' ');

  if (name.includes('bowl') || description.includes('bowl') || normalizedCategory.includes('bowl')) {
    return false;
  }

  if (itemType && itemType !== 'drink') {
    return false;
  }

  const hasExplicitSmoothieSignal = hasExplicitSmoothieSignals(item);
  const hasShakeSignal = /\b(shake|shakes|malt|malts)\b/i.test(explicitSignals);
  const hasSmoothieCategory = normalizedCategory === 'smoothie';
  const hasMealSignals = /\b(toast|salad|sandwich|wrap|burrito|taco|pizza|pasta|burger|omelet|omelette|eggs?)\b/i.test(explicitSignals);
  const hasCoffeeSignals = /\b(latte|cold\s+brew|coffee|espresso|americano|cappuccino|macchiato)\b/i.test(explicitSignals);

  if (hasShakeSignal && !hasExplicitSmoothieSignal) {
    return false;
  }

  if (hasExplicitSmoothieSignal) {
    return true;
  }

  return hasSmoothieCategory && !hasMealSignals && !hasCoffeeSignals;
}

function hasExplicitSmoothieSignals(item: RawResult): boolean {
  const explicitSignals = `${item.name ?? ''} ${item.description ?? ''}`;
  return /\b(smoothie|smoothies|blend|blended)\b/i.test(explicitSignals);
}

function hasStrictSmoothieSignals(item: RawResult): boolean {
  if (hasExplicitSmoothieSignals(item)) {
    return true;
  }

  const normalizedCategory = (item.normalized_category ?? '').toLowerCase();
  const itemType = (item.item_type ?? '').toLowerCase();
  if (normalizedCategory !== 'smoothie') {
    return false;
  }

  if (itemType && itemType !== 'drink') {
    return false;
  }

  const haystack = `${item.name ?? ''} ${item.description ?? ''}`.toLowerCase();
  if (/\b(juice|juices|coffee|latte|espresso|americano|cappuccino|macchiato|cold brew|tea|refresher)\b/i.test(haystack)) {
    return false;
  }

  return true;
}

export function applyRetrievalGuardrailsForTesting(
  items: RawResult[],
  parsed: ParsedQuery,
  dietaryKeywords?: string[]
): RawResult[] {
  return applyPostRetrievalFilters(items, parsed, dietaryKeywords);
}

function matchesMealType(item: RawResult, parsed: ParsedQuery, relaxMealType = false): boolean {
  const strictBreakfastRequest = isStrictBreakfastRequest(parsed);

  if (!parsed.mealTypes.length) {
    if (strictBreakfastRequest) {
      return looksLikeBreakfastFood(item);
    }
    return true;
  }

  const itemMealType = (item.meal_type ?? '').toLowerCase();
  if (!itemMealType) {
    if (parsed.mealTypes.some((value) => value.toLowerCase() === 'drink')) {
      return looksLikeDrinkItem(item);
    }
    if (strictBreakfastRequest) {
      return looksLikeBreakfastFood(item);
    }
    return true;
  }

  if (itemMealType === 'all_day') {
    if (parsed.mealTypes.some((value) => value.toLowerCase() === 'drink')) {
      return looksLikeDrinkItem(item);
    }
    if (strictBreakfastRequest) {
      return looksLikeBreakfastFood(item);
    }
    return true;
  }

  const requested = new Set(parsed.mealTypes.map((value) => value.toLowerCase()));
  if (requested.has('drink')) {
    return looksLikeDrinkItem(item);
  }
  if (requested.has(itemMealType)) {
    return true;
  }

  if (requested.has('breakfast') && itemMealType === 'brunch') {
    return true;
  }

  if (requested.has('brunch') && itemMealType === 'breakfast') {
    return true;
  }

  if (requested.has('breakfast') && looksLikeBreakfastFood(item)) {
    return true;
  }

  if (
    relaxMealType &&
    parsed.restaurantQuery &&
    !requested.has('breakfast') &&
    (itemMealType === 'breakfast' || itemMealType === 'brunch')
  ) {
    return true;
  }

  if (relaxMealType && hasSpecificDishSignals(parsed)) {
    if (requested.has('lunch') && (itemMealType === 'dinner' || itemMealType === 'brunch')) {
      return true;
    }

    if (requested.has('dinner') && (itemMealType === 'lunch' || itemMealType === 'brunch')) {
      return true;
    }
  }

  return false;
}

function looksLikeBreakfastFood(item: RawResult): boolean {
  const haystack = buildHaystack(item);
  const category = (item.normalized_category ?? '').toLowerCase();
  const hasStrictBreakfastAnchor = BREAKFAST_STRICT_ANCHOR_PATTERNS.some((pattern) => pattern.test(haystack));
  const hasBreakfastSandwichAnchor =
    /\b(egg|sausage|bacon|ham)\b/i.test(haystack) &&
    /\b(sandw(?:ich|hich)|bagel|biscuit|croissant|muffin)\b/i.test(haystack);

  if (category === 'burger' || BURGER_LIKE_PATTERNS.test(haystack)) {
    return false;
  }

  if (/\bsandw(?:ich|hich)\b/i.test(haystack) && !hasStrictBreakfastAnchor && !hasBreakfastSandwichAnchor) {
    return false;
  }

  if (BREAKFAST_FOOD_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return true;
  }

  return (
    category === 'breakfast_sandwich' ||
    ((/\b(acai|pitaya|smoothie)\b/i.test(haystack) || /\bbowl\b/i.test(haystack)) &&
      /\bbowl\b/i.test(haystack) &&
      /\b(acai|pitaya|smoothie)\b/i.test(haystack))
  );
}

function looksLikeDrinkItem(item: RawResult): boolean {
  const haystack = buildHaystack(item);
  const normalizedCategory = (item.normalized_category ?? '').toLowerCase();
  const itemType = (item.item_type ?? '').toLowerCase();

  if (
    /\b(platter|sandwich|burger|taco|burrito|salad|pasta|wings|omelette|omelet|waffle|pancake|soup)\b/i.test(haystack)
  ) {
    return false;
  }

  if (normalizedCategory === 'smoothie' || normalizedCategory === 'coffee') {
    return true;
  }

  if (
    /\b(coffee|latte|espresso|americano|cappuccino|macchiato|mocha|matcha|cold brew|tea|juice|smoothie|shake|lemonade|refresher)\b/i.test(haystack)
  ) {
    return true;
  }

  return itemType === 'drink' && /\b(oz|iced|hot|brew)\b/i.test(haystack);
}

function isAcaiBowlQuery(parsed: ParsedQuery): boolean {
  const raw = parsed.raw.toLowerCase();
  return parsed.normalizedCategory === 'bowl' && /\b(acai|pitaya|smoothie)\s+bowl\b/i.test(raw);
}

function shouldRelaxRestaurantMealType(parsed: ParsedQuery): boolean {
  if (!parsed.restaurantQuery || !parsed.mealTypes.length) {
    return false;
  }

  return !parsed.mealTypes.every((mealType) => mealType.toLowerCase() === 'breakfast');
}

function shouldRelaxSpecificMealType(parsed: ParsedQuery): boolean {
  if (!parsed.mealTypes.length) {
    return false;
  }

  if (parsed.mealTypes.every((mealType) => mealType.toLowerCase() === 'breakfast')) {
    return false;
  }

  return hasSpecificDishSignals(parsed);
}

function hasSpecificDishSignals(parsed: ParsedQuery): boolean {
  return Boolean(
    parsed.normalizedCategory ||
    parsed.proteinPreference.length > 0 ||
    parsed.cuisineOrStyle.length > 0 ||
    parsed.includeTags.includes('post_workout') ||
    parsed.includeTags.includes('pre_workout')
  );
}

function requiresStrictBreakfastFoodFiltering(parsed: ParsedQuery): boolean {
  return isStrictBreakfastRequest(parsed);
}

function isStrictBreakfastRequest(parsed: ParsedQuery): boolean {
  const mealTypes = parsed.mealTypes.map((mealType) => mealType.toLowerCase());
  if (mealTypes.length > 0) {
    const hasBreakfastIntent = mealTypes.includes('breakfast') || mealTypes.includes('brunch');
    return hasBreakfastIntent && mealTypes.every((mealType) => mealType === 'breakfast' || mealType === 'brunch');
  }

  return /\bbreakfast\b/i.test(parsed.raw);
}

function matchesRequestedCategory(item: RawResult, parsed: ParsedQuery): boolean {
  if (!parsed.normalizedCategory || parsed.normalizedCategory === 'entree') {
    return true;
  }

  const category = (item.normalized_category ?? '').toLowerCase();
  const haystack = buildHaystack(item);

  if (parsed.normalizedCategory === 'breakfast_sandwich') {
    return category === 'breakfast_sandwich' || category === 'sandwich' || looksLikeBreakfastFood(item);
  }

  if (parsed.normalizedCategory === 'tacos') {
    return category === 'tacos' || category === 'taco' || /\btacos?\b/i.test(haystack);
  }

  if (category === parsed.normalizedCategory) {
    return true;
  }

  return (parsed.dishKeywords ?? []).some((keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
  });
}

function matchesSpecificDishAnchors(item: RawResult, parsed: ParsedQuery): boolean {
  const haystack = buildHaystack(item);
  const raw = parsed.raw.toLowerCase();

  if (/\bacai\b/.test(raw) && !/\bacai\b/.test(haystack)) {
    return false;
  }

  if (/\bpitaya\b/.test(raw) && !/\bpitaya\b/.test(haystack)) {
    return false;
  }

  return true;
}

function matchesCuisineOrStyle(item: RawResult, parsed: ParsedQuery): boolean {
  if (!parsed.cuisineOrStyle.length) {
    return true;
  }

  const haystack = buildHaystack(item);
  const normalizedCategory = (item.normalized_category ?? '').toLowerCase();

  if (parsed.cuisineOrStyle.length) {
    const hasCuisineMatch = parsed.cuisineOrStyle.some((term) => {
      return getCuisineAliases(term).some((alias) => haystack.includes(alias) || normalizedCategory === alias);
    });

    if (!hasCuisineMatch) {
      return false;
    }
  }

  return true;
}

function matchesProteinPreference(item: RawResult, parsed: ParsedQuery): boolean {
  if (!parsed.proteinPreference.length) {
    return true;
  }

  const haystack = buildHaystack(item);
  return parsed.proteinPreference.some((term) =>
    getProteinAliases(term).some((alias) => haystack.includes(alias))
  );
}

function matchesExcludedTerms(item: RawResult, parsed: ParsedQuery): boolean {
  if (!parsed.excludeTags.length) {
    return true;
  }

  const haystack = buildHaystack(item);
  return !parsed.excludeTags.some((term) => haystack.includes(term.replace(/_/g, ' ').toLowerCase()));
}

function buildHaystack(item: RawResult): string {
  return [
    item.name,
    item.description,
    item.restaurant_name,
    item.normalized_category,
    item.meal_type,
    ...(item.food_tags ?? []),
    ...(item.allergens ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/_/g, ' ')
    .toLowerCase();
}

function isLikelyModifierLikeResult(item: RawResult, parsed: ParsedQuery): boolean {
  const name = item.name.trim().toLowerCase();
  const description = (item.description ?? '').trim().toLowerCase();
  const haystack = `${name} ${description}`.replace(/_/g, ' ');
  const calories = item.macros?.calories ?? 0;
  const hasMealSignals = Boolean(
    item.normalized_category ||
    item.meal_type ||
    parsed.categories.length ||
    parsed.mealTypes.length ||
    parsed.cuisineOrStyle.length
  );

  if (MODIFIER_NAME_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return true;
  }

  if (GENERIC_ADDON_NAMES.has(name) && calories <= 350) {
    return true;
  }

  if (
    !hasMealSignals &&
    calories > 0 &&
    calories <= 350 &&
    name.split(/\s+/).length <= 3
  ) {
    return true;
  }

  return false;
}

function isCateringOrFamilyStyleResult(item: RawResult): boolean {
  const haystack = buildHaystack(item);

  if ((item.food_tags ?? []).some((tag) => FAMILY_OR_CATERING_TAGS.has(tag.toLowerCase()))) {
    return true;
  }

  return FAMILY_OR_CATERING_PATTERNS.some((pattern) => pattern.test(haystack));
}

function shouldUseSemanticFallback(
  parsed: ParsedQuery,
  deterministicCount: number,
  threshold: number
): boolean {
  if (isSmoothieQuery(parsed)) {
    return false;
  }

  if (hasStrictDishAnchor(parsed) && deterministicCount > 0) {
    return false;
  }

  if (deterministicCount >= threshold) {
    return false;
  }

  const semanticQuery = parsed.semanticQuery?.trim() ?? '';
  if (semanticQuery.length < 3) {
    return false;
  }

  return true;
}

function hasStrictDishAnchor(parsed: ParsedQuery): boolean {
  return /\b(acai|pitaya)\b/i.test(parsed.raw);
}

function isCuisineDiscoveryQuery(
  parsed: ParsedQuery,
  restaurantVariants?: string[]
): boolean {
  return Boolean(
    parsed.cuisineOrStyle.length > 0 &&
    !parsed.restaurantQuery &&
    !(restaurantVariants?.length) &&
    parsed.categories.length === 0 &&
    parsed.mealTypes.length === 0 &&
    parsed.proteinPreference.length === 0
  );
}

function isBroadCalorieCapDiscoveryQuery(parsed: ParsedQuery): boolean {
  return Boolean(
    parsed.maxCalories !== undefined &&
    parsed.minCalories === undefined &&
    parsed.minProtein === undefined &&
    parsed.maxProtein === undefined &&
    parsed.maxCarbs === undefined &&
    parsed.minCarbs === undefined &&
    parsed.maxFat === undefined &&
    parsed.minFat === undefined &&
    !parsed.restaurantQuery &&
    parsed.categories.length === 0 &&
    parsed.mealTypes.length === 0 &&
    parsed.cuisineOrStyle.length === 0 &&
    parsed.proteinPreference.length === 0
  );
}

function isCategoryDiscoveryQuery(
  parsed: ParsedQuery,
  restaurantVariants?: string[]
): boolean {
  return Boolean(
    parsed.categories.length > 0 &&
    !parsed.restaurantQuery &&
    !(restaurantVariants?.length) &&
    parsed.cuisineOrStyle.length === 0
  );
}

function isBroadDiscoveryQuery(
  parsed: ParsedQuery,
  restaurantVariants?: string[]
): boolean {
  return Boolean(
    !parsed.restaurantQuery &&
    !(restaurantVariants?.length) &&
    parsed.categories.length === 0 &&
    parsed.cuisineOrStyle.length === 0 &&
    parsed.proteinPreference.length === 0
  );
}

function getCandidateLimit(
  parsed: ParsedQuery,
  limit: number,
  restaurantVariants?: string[]
): number {
  if (isCuisineDiscoveryQuery(parsed, restaurantVariants)) {
    return Math.max(limit * 10, CUISINE_DISCOVERY_LIMIT);
  }

  if (isBroadCalorieCapDiscoveryQuery(parsed)) {
    return Math.max(limit * 12, BROAD_CALORIE_DISCOVERY_LIMIT);
  }

  if (isCategoryDiscoveryQuery(parsed, restaurantVariants)) {
    return Math.max(limit * 14, CATEGORY_DISCOVERY_LIMIT);
  }

  if (isBroadDiscoveryQuery(parsed, restaurantVariants)) {
    return Math.max(limit * 18, BROAD_DISCOVERY_LIMIT);
  }

  return Math.max(limit * 3, 24);
}

function shouldExpandRestaurantDiversityPool(
  parsed: ParsedQuery,
  restaurantVariants?: string[],
  restaurantResolved = false
): boolean {
  if (parsed.restaurantQuery || restaurantResolved || restaurantVariants?.length) {
    return false;
  }

  if (isSmoothieQuery(parsed)) {
    return false;
  }

  return true;
}

function needsRestaurantDiversityExpansion(
  items: RawResult[],
  offset: number,
  limit: number
): boolean {
  if (items.length < limit) {
    return false;
  }

  return countUniqueRestaurants(items) < getRequiredUniqueRestaurantCount(offset, limit);
}

function getRequiredUniqueRestaurantCount(offset: number, limit: number): number {
  return Math.max(limit, offset + limit + RESTAURANT_DIVERSITY_UNIQUE_BUFFER);
}

function countUniqueRestaurants(items: RawResult[]): number {
  return new Set(
    items
      .map((item) => item.restaurant_name?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value))
  ).size;
}

function dedupeRawResultsById(items: RawResult[]): RawResult[] {
  const seenIds = new Set<number | string>();
  const deduped: RawResult[] = [];

  for (const item of items) {
    if (seenIds.has(item.id)) {
      continue;
    }

    seenIds.add(item.id);
    deduped.push(item);
  }

  return deduped;
}

function getTargetResultWindow(
  parsed: ParsedQuery,
  offset: number,
  limit: number
): number {
  if (isCuisineDiscoveryQuery(parsed)) {
    return Math.max(offset + limit + 20, CUISINE_DISCOVERY_TARGET);
  }

  if (isBroadCalorieCapDiscoveryQuery(parsed)) {
    return Math.max(offset + limit + 30, BROAD_CALORIE_DISCOVERY_TARGET);
  }

  if (isCategoryDiscoveryQuery(parsed)) {
    return Math.max(offset + limit + 30, CATEGORY_DISCOVERY_TARGET);
  }

  if (isBroadDiscoveryQuery(parsed)) {
    return Math.max(offset + limit + 40, BROAD_DISCOVERY_TARGET);
  }

  return Math.max(offset + limit + 8, 20);
}

function stableHash(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function buildRotationSeed(userId: string | undefined, searchKey: string): string {
  return `${userId || 'guest'}|${searchKey}`;
}

function rotateSmoothieDiscoveryResults(
  items: RawResult[],
  parsed: ParsedQuery,
  seed: string
): RawResult[] {
  if (!isSmoothieQuery(parsed) || hasParsedMacroConstraints(parsed) || items.length <= 1) {
    return items;
  }

  const maxShiftWindow = Math.min(items.length, 24);
  const shift = stableHash(`${seed}|smoothie`) % maxShiftWindow;

  if (shift === 0) {
    return items;
  }

  return [...items.slice(shift), ...items.slice(0, shift)];
}

function rotateBroadDiscoveryResults(
  items: RawResult[],
  parsed: ParsedQuery,
  seed: string,
  restaurantVariants?: string[]
): RawResult[] {
  if (!isBroadDiscoveryQuery(parsed, restaurantVariants) || items.length <= 1) {
    return items;
  }

  const maxShiftWindow = Math.min(items.length, 24);
  const shift = stableHash(seed) % maxShiftWindow;

  if (shift === 0) {
    return items;
  }

  return [...items.slice(shift), ...items.slice(0, shift)];
}

function hasParsedMacroConstraints(parsed: ParsedQuery): boolean {
  return hasMacroConstraints({
    minCalories: parsed.minCalories,
    maxCalories: parsed.maxCalories,
    minProtein: parsed.minProtein,
    maxProtein: parsed.maxProtein,
    minCarbs: parsed.minCarbs,
    maxCarbs: parsed.maxCarbs,
    minFat: parsed.minFat,
    maxFat: parsed.maxFat,
  });
}

function shouldShortCircuitUnsupportedQuery(parsed: ParsedQuery): boolean {
  const hasUnsupportedTerms = parsed.confidenceNotes.includes('unsupported_terms_detected');
  const hasConflictingCategories = parsed.confidenceNotes.includes('conflicting_categories');

  if (!hasUnsupportedTerms && !hasConflictingCategories) {
    return false;
  }

  if (parsed.restaurantQuery) {
    return false;
  }

  if (hasConflictingCategories) {
    return true;
  }

  if (parsed.cuisineOrStyle.length > 0) {
    return false;
  }

  if (parsed.mealTypes.length > 0 || parsed.maxCalories !== undefined || parsed.minCalories !== undefined) {
    return false;
  }

  if (
    parsed.minProtein !== undefined ||
    parsed.maxProtein !== undefined ||
    parsed.minCarbs !== undefined ||
    parsed.maxCarbs !== undefined ||
    parsed.minFat !== undefined ||
    parsed.maxFat !== undefined
  ) {
    return false;
  }

  const structuredSignalCount =
    parsed.categories.length +
    parsed.cuisineOrStyle.length +
    parsed.proteinPreference.length +
    parsed.includeTags.length +
    parsed.dietaryFlags.length;

  if (structuredSignalCount <= 1) {
    return true;
  }

  return parsed.parserConfidence < 0.55 && structuredSignalCount <= 2;
}

function getProteinAliases(term: string): string[] {
  const normalized = term.toLowerCase();

  if (normalized === 'fish') {
    return [
      'fish',
      'salmon',
      'tuna',
      'cod',
      'tilapia',
      'mahi',
      'mahi mahi',
      'steelhead',
      'trout',
      'halibut',
      'snapper',
      'sea bass',
    ];
  }

  return [normalized];
}

function getCuisineAliases(term: string): string[] {
  const normalized = term.replace(/_/g, ' ').toLowerCase();

  if (normalized === 'mediterranean') {
    return ['mediterranean', 'greek', 'falafel', 'shawarma', 'gyro', 'hummus', 'pita', 'kebab'];
  }

  if (normalized === 'asian') {
    return ['asian', 'chinese', 'japanese', 'thai', 'korean', 'vietnamese', 'sushi', 'ramen', 'pho'];
  }

  if (normalized === 'sushi') {
    return ['sushi', 'maki', 'nigiri', 'sashimi', 'roll'];
  }

  return [normalized];
}

function buildBroadenedParams(params: RPCParams, parsed: ParsedQuery): RPCParams | null {
  if (parsed.normalizedCategory === 'breakfast_sandwich') {
    return {
      ...params,
      p_normalized_category: 'sandwich',
      p_name_keyword: params.p_name_keyword ?? 'sandwich',
    };
  }

  if (parsed.normalizedCategory === 'tacos') {
    return {
      ...params,
      p_normalized_category: undefined,
      p_name_keyword: params.p_name_keyword ?? 'taco',
      p_protein_sources: undefined,
    };
  }

  if (parsed.cuisineOrStyle.includes('asian') && parsed.raw.toLowerCase().includes('sushi')) {
    return {
      ...params,
      p_normalized_category: undefined,
      p_name_keyword: params.p_name_keyword ?? 'sushi',
      p_cuisine_types: ['asian'],
    };
  }

  if (parsed.proteinPreference.length > 0) {
    return {
      ...params,
      p_protein_sources: undefined,
      p_name_keyword: params.p_name_keyword ?? parsed.proteinPreference[0],
    };
  }

  return null;
}

function prepareSearchContext(searchParams: SearchParams): PreparedSearchContext {
  if (searchParams.searchKey && searchParams.isPagination) {
    const originalParams = decodeSearchKey(searchParams.searchKey);
    if (originalParams) {
      return {
        effectiveParams: {
          ...originalParams,
          offset: searchParams.offset ?? originalParams.offset ?? DEFAULT_OFFSET,
          limit: searchParams.limit ?? originalParams.limit ?? DEFAULT_LIMIT,
          searchKey: searchParams.searchKey,
          isPagination: true,
        },
        searchKey: searchParams.searchKey,
        originalParams,
      };
    }
  }

  const shouldRandomizeSmoothies =
    isSmoothieLikeText(searchParams.query ?? '') &&
    !hasMacroConstraints(searchParams);

  const originalParams: SearchParams = {
    ...searchParams,
    ...(shouldRandomizeSmoothies
      ? {
          shuffleNonce:
            globalThis.crypto?.randomUUID?.() ??
            `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        }
      : {}),
    offset: DEFAULT_OFFSET,
    limit: searchParams.limit ?? DEFAULT_LIMIT,
    isPagination: false,
  };

  return {
    effectiveParams: searchParams,
    searchKey: encodeSearchKey(originalParams),
    originalParams,
  };
}

function encodeSearchKey(params: SearchParams): string {
  return Buffer.from(JSON.stringify(params), 'utf8').toString('base64url');
}

function decodeSearchKey(searchKey: string): SearchParams | null {
  try {
    const decoded = Buffer.from(searchKey, 'base64url').toString('utf8');
    return JSON.parse(decoded) as SearchParams;
  } catch (error) {
    console.warn('[RetrievalEngine] invalid searchKey payload:', error);
    return null;
  }
}

function normalizeMacros(item: Record<string, unknown>) {
  const macrosValue = item.macros;
  if (macrosValue && typeof macrosValue === 'object' && !Array.isArray(macrosValue)) {
    const macrosRecord = macrosValue as Record<string, unknown>;
    return {
      calories: normalizeNumber(macrosRecord.calories) ?? 0,
      protein: normalizeNumber(macrosRecord.protein) ?? 0,
      carbs: normalizeNumber(macrosRecord.carbs) ?? 0,
      fat: normalizeNumber(macrosRecord.fat) ?? 0,
    };
  }

  return {
    calories: normalizeNumber(item.calories) ?? 0,
    protein: normalizeNumber(item.protein_g ?? item.protein) ?? 0,
    carbs: normalizeNumber(item.carbs_g ?? item.carbs) ?? 0,
    fat: normalizeNumber(item.fat_g ?? item.fat ?? item.fats) ?? 0,
  };
}

function normalizeTextArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry : String(entry ?? '')))
    .map((entry) => entry.trim())
    .filter(Boolean);

  return normalized.length ? normalized : undefined;
}

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function applySearchParamsOverrides(parsed: ParsedQuery, sp: SearchParams): void {
  if (sp.maxCalories !== undefined) parsed.maxCalories = sp.maxCalories;
  if (sp.minCalories !== undefined) parsed.minCalories = sp.minCalories;
  if (sp.calorieCap !== undefined && parsed.maxCalories === undefined) {
    parsed.maxCalories = sp.calorieCap;
  }

  if (sp.minProtein !== undefined) parsed.minProtein = sp.minProtein;
  if (sp.maxProtein !== undefined) parsed.maxProtein = sp.maxProtein;
  if (sp.maxCarbs !== undefined) parsed.maxCarbs = sp.maxCarbs;
  if (sp.minCarbs !== undefined) parsed.minCarbs = sp.minCarbs;

  const maxFat = sp.maxFats ?? sp.maxFat;
  const minFat = sp.minFats ?? sp.minFat;
  if (maxFat !== undefined) parsed.maxFat = maxFat;
  if (minFat !== undefined) parsed.minFat = minFat;

  if (sp.macroFilters) {
    const macroFilters = sp.macroFilters;
    if (macroFilters.caloriesMax !== undefined && parsed.maxCalories === undefined) parsed.maxCalories = macroFilters.caloriesMax;
    if (macroFilters.caloriesMin !== undefined && parsed.minCalories === undefined) parsed.minCalories = macroFilters.caloriesMin;
    if (macroFilters.proteinMin !== undefined && parsed.minProtein === undefined) parsed.minProtein = macroFilters.proteinMin;
    if (macroFilters.proteinMax !== undefined && parsed.maxProtein === undefined) parsed.maxProtein = macroFilters.proteinMax;
    if (macroFilters.carbsMax !== undefined && parsed.maxCarbs === undefined) parsed.maxCarbs = macroFilters.carbsMax;
    if (macroFilters.carbsMin !== undefined && parsed.minCarbs === undefined) parsed.minCarbs = macroFilters.carbsMin;
    if (macroFilters.fatsMax !== undefined && parsed.maxFat === undefined) parsed.maxFat = macroFilters.fatsMax;
    if (macroFilters.fatsMin !== undefined && parsed.minFat === undefined) parsed.minFat = macroFilters.fatsMin;
  }

  if (sp.restaurant && !parsed.restaurantQuery) {
    parsed.restaurantQuery = sp.restaurant;
  }

  if (sp.diet && !parsed.dietType) {
    parsed.dietType = sp.diet;
  }

  const hasNewStructuredFields =
    parsed.maxCalories !== undefined ||
    parsed.minCalories !== undefined ||
    parsed.minProtein !== undefined ||
    parsed.maxProtein !== undefined ||
    parsed.maxCarbs !== undefined ||
    parsed.minCarbs !== undefined ||
    parsed.maxFat !== undefined ||
    parsed.minFat !== undefined ||
    Boolean(parsed.restaurantQuery);

  if (hasNewStructuredFields) {
    parsed.hasStructuredFilters = true;
  }
}

export async function searchHandler(
  searchParams: SearchParams,
  options: {
    includeDebug?: boolean;
    userLocation?: { lat: number; lng: number };
  } = {}
): Promise<{
  meals: Meal[];
  totalCount: number;
  hasMore: boolean;
  nextOffset: number;
  searchKey: string;
  message?: string;
  debugInfo?: RetrievalDebugInfo;
}> {
  const result = await retrieveMeals(searchParams, {
    includeDebug: options.includeDebug ?? process.env.NODE_ENV === 'development',
    userLocation: options.userLocation,
  });

  return {
    meals: result.meals,
    totalCount: result.totalCount,
    hasMore: result.hasMore,
    nextOffset: result.nextOffset,
    searchKey: result.searchKey,
    message: result.message,
    debugInfo: result.debugInfo,
  };
}
