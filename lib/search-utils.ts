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

    // Homepage-specific fields
    filters?: {
        calories?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
        protein?: { enabled: boolean; min: number };
        carbs?: { enabled: boolean; min: number };
        fats?: { enabled: boolean; min: number };
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

    // Extract explicit restaurant query and macro filters from query text
    // Only extract if searchKey is NOT present (new search, not pagination)
    // If searchKey exists, preserve prior constraints from searchKey, don't re-infer
    const { extractExplicitRestaurant, extractMacroFilters } = await import('@/lib/search/intent');
    const { restaurantQuery } = extractExplicitRestaurant(queryText);
    const macroFilters = extractMacroFilters(queryText);

    // CRITICAL: Only set explicitRestaurantQuery if it exists AND searchKey is not present
    // If searchKey exists (pagination), preserve any prior explicit restaurant constraint encoded in searchKey
    const explicitRestaurantQuery = (!input.searchKey && restaurantQuery) ? restaurantQuery : undefined;

    // Normalize location: convert 'near me' string or radius_miles to location field
    let location: string | undefined = undefined;
    if (input.location === 'near me' || input.radius_miles !== undefined) {
        location = 'near me';
    }

    // Extract location from userContext if available
    const userContext = input.userContext || {};
    const hasLocation = userContext.user_location_lat !== undefined &&
        userContext.user_location_lng !== undefined;

    // Build normalized userContext
    const normalizedUserContext = hasLocation ? {
        ...userContext,
        user_location_lat: userContext.user_location_lat ?? input.user_location_lat,
        user_location_lng: userContext.user_location_lng ?? input.user_location_lng,
        search_distance_miles: userContext.search_distance_miles ?? input.radius_miles,
        userId: userContext.userId,
    } : (input.user_location_lat && input.user_location_lng ? {
        user_location_lat: input.user_location_lat,
        user_location_lng: input.user_location_lng,
        search_distance_miles: input.radius_miles,
    } : userContext);

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

    if (input.isHomepage && input.filters) {
        // Homepage: use new structured filters with enabled flags
        // Only set values when enabled is true
        mergedMacroFilters = {
            proteinMin: input.filters.protein?.enabled ? input.filters.protein.min : undefined,
            carbsMin: input.filters.carbs?.enabled ? input.filters.carbs.min : undefined,
            fatsMin: input.filters.fats?.enabled ? input.filters.fats.min : undefined,
            caloriesMax: input.filters.calories?.enabled && input.filters.calories.mode === "BELOW"
                ? input.filters.calories.value
                : undefined,
            caloriesMin: input.filters.calories?.enabled && input.filters.calories.mode === "ABOVE"
                ? input.filters.calories.value
                : undefined,
            // No max values for protein/carbs/fats (they are always minimums on homepage)
            proteinMax: undefined,
            carbsMax: undefined,
            fatsMax: undefined,
        };
    } else if (input.isHomepage && input.macroFilters) {
        // Homepage: fallback to legacy macroFilters format
        mergedMacroFilters = {
            proteinMin: input.macroFilters.proteinMin,
            carbsMin: input.macroFilters.carbsMin,
            fatsMin: input.macroFilters.fatsMin,
            caloriesMax: input.macroFilters.caloriesMax,
            caloriesMin: input.macroFilters.caloriesMin,
            proteinMax: undefined,
            carbsMax: undefined,
            fatsMax: undefined,
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
