/**
 * Unified function to build SearchParams from various input formats
 * This ensures all search entry points use the same parameter shape
 */

import type { SearchParams } from '@/app/types';
import { createClient } from '@supabase/supabase-js';
import { normalizeSearchText } from '@/lib/query-normalization';

type BareRestaurantResolution = {
    canonicalName: string;
    restaurantId?: string;
    variants: string[];
};

const RESTAURANT_STOPWORDS = new Set([
    'the',
    'a',
    'an',
    'and',
    'of',
    'co',
    'company',
    'restaurant',
]);

const SINGLE_TOKEN_FOOD_TERMS = new Set([
    'burger',
    'burgers',
    'burrito',
    'burritos',
    'pizza',
    'pizzas',
    'taco',
    'tacos',
    'salad',
    'salads',
    'sandwich',
    'sandwiches',
    'smoothie',
    'smoothies',
    'bowl',
    'bowls',
    'wrap',
    'wraps',
    'chicken',
    'steak',
    'soup',
    'soups',
    'pasta',
    'sushi',
    'egg',
    'eggs',
    'fish',
    'salmon',
    'shrimp',
    'tuna',
    'cod',
    'tilapia',
    'mahi',
    'lobster',
    'crab',
    'tofu',
    'pork',
    'beef',
    'turkey',
    'omelet',
    'omelette',
    'bagel',
    'biscuit',
]);

const GENERIC_DISCOVERY_TERMS = new Set([
    ...SINGLE_TOKEN_FOOD_TERMS,
    'american',
    'asian',
    'barbecue',
    'bbq',
    'breakfast',
    'dinner',
    'gluten',
    'healthy',
    'italian',
    'lunch',
    'mediterranean',
    'mexican',
    'protein',
    'calorie',
    'calories',
    'carb',
    'carbs',
    'fat',
    'fats',
    'coffee',
    'drink',
    'drinks',
    'beverage',
    'beverages',
    'juice',
    'macro',
    'macros',
    'vegan',
    'vegetarian',
]);

function normalizeRestaurantLookup(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/&/g, 'and')
        .replace(/-/g, ' ')
        .replace(/['.,]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function restaurantTokens(value: string): string[] {
    return normalizeRestaurantLookup(value)
        .split(/\s+/)
        .filter((token) => token.length > 0 && !RESTAURANT_STOPWORDS.has(token));
}

function extractBareRestaurantCandidateText(queryText: string): string {
    return queryText
        .replace(/\b(under|below|less\s+than|at\s+most|max(?:imum)?|over|above|more\s+than|at\s+least|min(?:imum)?)\s+\d+\s*(?:calories?|cal|kcal|g|grams?|protein|pro|carbs?|carbohydrates?|fat|fats?)\b/gi, ' ')
        .replace(/\b\d+\s*(?:g|grams?)\s+(?:protein|pro|carbs?|fat|fats?)\b/gi, ' ')
        .replace(/\b\d+\s*(?:calories?|cal|kcal)\b/gi, ' ')
        .replace(/\b(?:high|low)\s+(?:protein|carb|carbs|calorie|calories|fat|fats)\b/gi, ' ')
        .replace(/\b(?:show|find|get|give|recommend|suggest|search|me|some|meals?|food|options?|items?|menu|from|at|for|with|please)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function compactRestaurantLookup(value: string): string {
    return normalizeRestaurantLookup(value).replace(/\s+/g, '');
}

async function resolveBareRestaurantFromDatabase(queryText: string): Promise<BareRestaurantResolution | undefined> {
    const candidateText = extractBareRestaurantCandidateText(queryText);
    const queryTokens = restaurantTokens(candidateText).filter(
        (token) => !GENERIC_DISCOVERY_TERMS.has(token)
    );

    if (queryTokens.length === 0) {
        return undefined;
    }

    if (queryTokens.length === 1 && GENERIC_DISCOVERY_TERMS.has(queryTokens[0])) {
        return undefined;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return undefined;
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: restaurants, error } = await supabase
        .from('restaurants')
        .select('id, name, aliases')
        .not('name', 'is', null);

    if (error || !restaurants?.length) {
        return undefined;
    }

    type Candidate = {
        id: string;
        name: string;
        score: number;
    };

    const queryNorm = normalizeRestaurantLookup(candidateText);
    const queryCompact = compactRestaurantLookup(candidateText);
    const candidates: Candidate[] = [];

    for (const restaurant of restaurants as Array<{ id?: string; name?: string; aliases?: string[] | null }>) {
        if (!restaurant.name) {
            continue;
        }

        const candidateNames = [restaurant.name, ...(restaurant.aliases ?? [])].filter(Boolean);
        let bestScore = 0;

        for (const candidateName of candidateNames) {
            const candidateNorm = normalizeRestaurantLookup(candidateName);
            const candidateCompact = compactRestaurantLookup(candidateName);
            const candidateTokens = restaurantTokens(candidateName);

            if (candidateNorm === queryNorm) {
                bestScore = Math.max(bestScore, 1);
                continue;
            }

            if (
                candidateCompact.length >= 3 &&
                (candidateCompact === queryCompact ||
                    queryCompact.includes(candidateCompact) ||
                    candidateCompact.includes(queryCompact))
            ) {
                bestScore = Math.max(bestScore, 0.98);
                continue;
            }

            const allQueryTokensMatch =
                queryTokens.length > 0 &&
                queryTokens.every((queryToken) => candidateTokens.includes(queryToken));

            if (allQueryTokensMatch) {
                const scoreBase = queryTokens.length === 1 ? 0.82 : 0.9;
                bestScore = Math.max(bestScore, scoreBase + 0.1 * (queryTokens.length / Math.max(candidateTokens.length, 1)));
            }

            const allCandidateTokensMatch =
                candidateTokens.length > 0 &&
                candidateTokens.every((candidateToken) => queryTokens.includes(candidateToken));

            if (allCandidateTokensMatch) {
                const extraQueryTokens = Math.max(queryTokens.length - candidateTokens.length, 0);
                bestScore = Math.max(bestScore, 0.94 - Math.min(extraQueryTokens * 0.03, 0.15));
            }
        }

        if (bestScore > 0) {
            candidates.push({
                id: restaurant.id ?? '',
                name: restaurant.name,
                score: bestScore,
            });
        }
    }

    candidates.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
    const match = candidates[0];

    if (!match) {
        return undefined;
    }

    const { data: menuNames } = await supabase
        .from('menu_items')
        .select('restaurant_name')
        .ilike('restaurant_name', `%${queryTokens[0]}%`)
        .limit(100);

    const canonicalNorm = normalizeRestaurantLookup(match.name);
    const canonicalTokens = restaurantTokens(match.name);
    const variants = new Set<string>([match.name]);

    for (const row of (menuNames ?? []) as Array<{ restaurant_name?: string | null }>) {
        const value = row.restaurant_name;
        if (!value) {
            continue;
        }

        const valueNorm = normalizeRestaurantLookup(value);
        const valueTokens = restaurantTokens(value);

        const exact = valueNorm === canonicalNorm;
        const tokenSubset =
            canonicalTokens.length > 0 &&
            canonicalTokens.every((token) => valueTokens.includes(token));

        if (exact || tokenSubset) {
            variants.add(value);
        }
    }

    return {
        canonicalName: match.name,
        restaurantId: match.id || undefined,
        variants: Array.from(variants),
    };
}

export interface SearchInput {
    // Query fields
    query?: string;
    message?: string; // Alias for query (from chat)

    // Constraint fields
    calorieCap?: number; // Legacy: max calories
    minCalories?: number;
    maxCalories?: number;
    minProtein?: number;
    maxProtein?: number;
    minCarbs?: number;
    maxCarbs?: number;
    minFat?: number; // Legacy
    maxFat?: number; // Legacy
    minFats?: number;
    maxFats?: number;

    // Filter fields
    restaurant?: string; // Canonical restaurant name
    restaurantId?: string; // UUID of restaurant (preferred when available)
    restaurantVariants?: string[]; // All restaurant_name variants for filtering
    location?: string; // 'near me' or undefined
    radius_miles?: number; // Legacy field name

    // Pagination fields
    limit?: number;
    offset?: number;
    searchKey?: string;
    shuffleNonce?: string;
    excludedRestaurants?: string[];
    isPagination?: boolean;

    // Location fields (legacy format)
    user_location_lat?: number;
    user_location_lng?: number;

    // User context (new format)
    userContext?: {
        search_distance_miles?: number;
        user_location_lat?: number;
        user_location_lng?: number;
        diet_type?: string;
        dietary_options?: string[];
        userId?: string;
    };

    // Homepage-specific fields (all macros support above/below + exclude when enabled: false)
    filters?: {
        calories?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
        protein?: { enabled: boolean; mode?: "BELOW" | "ABOVE"; value?: number; min?: number };
        carbs?: { enabled: boolean; mode?: "BELOW" | "ABOVE"; value?: number; min?: number };
        fats?: { enabled: boolean; mode?: "BELOW" | "ABOVE"; value?: number; min?: number };
    };
    macroFilters?: {
        proteinMin?: number;
        caloriesMax?: number;
        caloriesMin?: number;
        carbsMin?: number;
        carbsMax?: number;
        fatsMin?: number;
        fatsMax?: number;
        proteinMax?: number;
    };
    calorieMode?: "UNDER" | "OVER";
    isHomepage?: boolean;
}

/**
 * Builds normalized SearchParams from various input formats
 * Handles field name differences and legacy formats
 */
export async function buildSearchParams(input: SearchInput): Promise<SearchParams> {
    // Normalize query: prefer 'query', fallback to 'message'
    const query = input.query || input.message || '';
    const normalizedQuery = normalizeSearchText(query);
    const queryText = normalizedQuery.text.trim();
    const userContext = input.userContext || {};

    // Extract explicit restaurant query and macro filters from query text
    // Only extract if searchKey is NOT present (new search, not pagination)
    // If searchKey exists, preserve prior constraints from searchKey, don't re-infer
    const { extractExplicitRestaurant, extractMacroFilters } = await import('@/lib/search/intent');
    const { restaurantQuery } = extractExplicitRestaurant(queryText);
    const macroFilters = extractMacroFilters(queryText);
    const bareRestaurantCandidateText = extractBareRestaurantCandidateText(queryText);
    const shouldTryBareRestaurantResolution =
        !input.searchKey &&
        !input.restaurant &&
        !input.restaurantId &&
        !restaurantQuery &&
        bareRestaurantCandidateText.length >= 3 &&
        bareRestaurantCandidateText.split(/\s+/).filter(Boolean).length <= 8;

    let resolvedBareRestaurant:
        | {
            canonicalName: string;
            restaurantId?: string;
            variants: string[];
        }
        | undefined;

    if (shouldTryBareRestaurantResolution) {
        resolvedBareRestaurant = await resolveBareRestaurantFromDatabase(queryText);
    }

    // CRITICAL: Only set explicitRestaurantQuery if it exists AND searchKey is not present
    // If searchKey exists (pagination), preserve any prior explicit restaurant constraint encoded in searchKey
    const explicitRestaurantQuery = (!input.searchKey && restaurantQuery) ? restaurantQuery : undefined;

    const hasUserContextLocation =
        userContext.user_location_lat !== undefined &&
        userContext.user_location_lng !== undefined;
    const hasTopLevelLocation =
        input.user_location_lat !== undefined &&
        input.user_location_lng !== undefined;

    // Build normalized userContext
    const normalizedUserContext = {
        ...userContext,
        ...(input.radius_miles !== undefined && userContext.search_distance_miles === undefined
            ? { search_distance_miles: input.radius_miles }
            : {}),
        ...(hasUserContextLocation || hasTopLevelLocation ? {
            user_location_lat: userContext.user_location_lat ?? input.user_location_lat,
            user_location_lng: userContext.user_location_lng ?? input.user_location_lng,
        } : {}),
    };

    // Normalize location: only activate nearby search when explicitly requested.
    const hasExplicitNearMeInQuery = /\b(near\s+me|nearby|close\s+to\s+me|around\s+here|around\s+me|in\s+my\s+area|closest|within\s+\d+\s*(mile|miles|mi))\b/i.test(queryText);
    let location: string | undefined = undefined;
    if (
        input.location === 'near me' ||
        input.radius_miles !== undefined ||
        hasExplicitNearMeInQuery
    ) {
        location = 'near me';
    }

    // Merge macro filters: 
    // - For homepage: prioritize input.filters (new structured payload with enabled flags)
    // - For other sources: prioritize extracted filters, then input params
    let mergedMacroFilters: {
        proteinMin?: number;
        carbsMin?: number;
        fatsMin?: number;
        caloriesMax?: number;
        caloriesMin?: number;
        proteinMax?: number;
        carbsMax?: number;
        fatsMax?: number;
    } | null = null;

    if (input.isHomepage && (input.filters || input.macroFilters)) {
        // Homepage: prefer structured filters; fall back to macroFilters for any missing value
        const p = input.filters?.protein;
        const c = input.filters?.carbs;
        const f = input.filters?.fats;
        const val = (x: typeof p) => (x?.value ?? x?.min);
        const fromFilters = input.filters
            ? {
                caloriesMax: input.filters.calories?.enabled && input.filters.calories.mode === "BELOW"
                    ? input.filters.calories.value
                    : undefined,
                caloriesMin: input.filters.calories?.enabled && input.filters.calories.mode === "ABOVE"
                    ? input.filters.calories.value
                    : undefined,
                proteinMin: p?.enabled && (p.mode === "ABOVE" || !p.mode) ? (val(p) ?? undefined) : undefined,
                proteinMax: p?.enabled && p.mode === "BELOW" ? (val(p) ?? undefined) : undefined,
                carbsMin: c?.enabled && (c.mode === "ABOVE" || !c.mode) ? (val(c) ?? undefined) : undefined,
                carbsMax: c?.enabled && c.mode === "BELOW" ? (val(c) ?? undefined) : undefined,
                fatsMin: f?.enabled && (f.mode === "ABOVE" || !f.mode) ? (val(f) ?? undefined) : undefined,
                fatsMax: f?.enabled && f.mode === "BELOW" ? (val(f) ?? undefined) : undefined,
            }
            : null;
        const fallback = input.macroFilters || {};
        mergedMacroFilters = {
            caloriesMax: fromFilters?.caloriesMax ?? fallback.caloriesMax,
            caloriesMin: fromFilters?.caloriesMin ?? fallback.caloriesMin,
            proteinMin: fromFilters?.proteinMin ?? fallback.proteinMin,
            proteinMax: fromFilters?.proteinMax ?? fallback.proteinMax,
            carbsMin: fromFilters?.carbsMin ?? fallback.carbsMin,
            carbsMax: fromFilters?.carbsMax ?? fallback.carbsMax,
            fatsMin: fromFilters?.fatsMin ?? fallback.fatsMin,
            fatsMax: fromFilters?.fatsMax ?? fallback.fatsMax,
        };
    } else if (macroFilters) {
        // Non-homepage: merge extracted filters with input params
        mergedMacroFilters = {
            proteinMin: macroFilters.proteinMin ?? input.minProtein,
            caloriesMax: macroFilters.caloriesMax ?? input.maxCalories ?? input.calorieCap,
            carbsMax: macroFilters.carbsMax ?? input.maxCarbs,
            fatsMax: macroFilters.fatsMax ?? input.maxFats ?? input.maxFat,
            proteinMax: macroFilters.proteinMax ?? input.maxProtein,
            caloriesMin: macroFilters.caloriesMin ?? input.minCalories,
            carbsMin: macroFilters.carbsMin ?? input.minCarbs,
            fatsMin: macroFilters.fatsMin ?? input.minFats ?? input.minFat,
        };
    }

    // Build SearchParams with consistent shape
    // CRITICAL: Do NOT set restaurant/restaurantId unless explicitRestaurantQuery exists
    // (or if searchKey is present, preserve prior restaurant constraint from searchKey)
    const params: SearchParams = {
        query: resolvedBareRestaurant ? 'find meals' : queryText,
        calorieCap: input.calorieCap, // Legacy support
        minCalories: mergedMacroFilters?.caloriesMin ?? input.minCalories,
        maxCalories: mergedMacroFilters?.caloriesMax ?? input.maxCalories ?? input.calorieCap, // Support legacy calorieCap
        minProtein: mergedMacroFilters?.proteinMin ?? input.minProtein,
        maxProtein: mergedMacroFilters?.proteinMax ?? input.maxProtein,
        minCarbs: mergedMacroFilters?.carbsMin ?? input.minCarbs,
        maxCarbs: mergedMacroFilters?.carbsMax ?? input.maxCarbs,
        minFat: input.minFat, // Legacy support
        maxFat: mergedMacroFilters?.fatsMax ?? input.maxFat, // Legacy support
        minFats: mergedMacroFilters?.fatsMin ?? input.minFats ?? input.minFat, // Support legacy minFat
        maxFats: mergedMacroFilters?.fatsMax ?? input.maxFats ?? input.maxFat, // Support legacy maxFat
        restaurant: input.restaurant ?? resolvedBareRestaurant?.canonicalName, // Explicit input or resolved bare restaurant name
        restaurantId: input.restaurantId ?? resolvedBareRestaurant?.restaurantId,
        restaurantVariants: input.restaurantVariants ?? resolvedBareRestaurant?.variants,
        explicitRestaurantQuery, // Raw restaurant query from user (e.g., "cava")
        macroFilters: mergedMacroFilters,
        location: location,
        limit: input.limit ?? 5, // Default to 5
        offset: input.offset ?? 0, // Default to 0
        searchKey: input.searchKey,
        shuffleNonce: input.shuffleNonce,
        excludedRestaurants: input.excludedRestaurants,
        isPagination: input.isPagination ?? !!input.searchKey, // Auto-detect pagination
        userContext: Object.keys(normalizedUserContext).length > 0 ? normalizedUserContext : undefined,
        isHomepage: input.isHomepage ?? false,
        calorieMode: input.calorieMode,
    };

    return params;
}
