/**
 * Unified function to build SearchParams from various input formats
 * This ensures all search entry points use the same parameter shape
 */

import type { SearchParams } from '@/app/types';

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
    const queryText = query.trim();
    const userContext = input.userContext || {};

    // Extract explicit restaurant query and macro filters from query text
    // Only extract if searchKey is NOT present (new search, not pagination)
    // If searchKey exists, preserve prior constraints from searchKey, don't re-infer
    const { extractExplicitRestaurant, extractMacroFilters } = await import('@/lib/search/intent');
    const { restaurantQuery } = extractExplicitRestaurant(queryText);
    const macroFilters = extractMacroFilters(queryText);

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

    // Normalize location: activate nearby search for either legacy radius_miles or normalized userContext distance.
    let location: string | undefined = undefined;
    if (
        input.location === 'near me' ||
        input.radius_miles !== undefined ||
        normalizedUserContext.search_distance_miles !== undefined
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
        query: queryText,
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
        restaurant: input.restaurant, // Only set if explicitly provided (from searchKey or prior resolution)
        restaurantId: input.restaurantId, // Only set if explicitly provided
        restaurantVariants: input.restaurantVariants, // Only set if explicitly provided
        explicitRestaurantQuery, // Raw restaurant query from user (e.g., "cava")
        macroFilters: mergedMacroFilters,
        location: location,
        limit: input.limit ?? 5, // Default to 5
        offset: input.offset ?? 0, // Default to 0
        searchKey: input.searchKey,
        isPagination: input.isPagination ?? !!input.searchKey, // Auto-detect pagination
        userContext: Object.keys(normalizedUserContext).length > 0 ? normalizedUserContext : undefined,
        isHomepage: input.isHomepage ?? false,
        calorieMode: input.calorieMode,
    };

    return params;
}
