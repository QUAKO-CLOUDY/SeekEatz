/**
 * SeekEatz Filter Builder
 *
 * Translates a ParsedQuery into the parameter object for the
 * `search_menu_items` Supabase RPC function.
 *
 * Restaurant filtering uses p_restaurant_names TEXT[] (not UUIDs) because
 * restaurant_id is NULL on all existing menu_items rows. Filtering is done
 * on the restaurant_name TEXT column via LOWER() matching in the RPC.
 *
 * Resolution priority:
 *  1. Pre-resolved variants passed in options.restaurantVariants (from chat route)
 *  2. parsed.restaurantQuery → name lookup via ILIKE on restaurants table
 *  3. parsed.cuisineType → names for all restaurants of that cuisine
 *
 * Dietary filtering is NOT done in SQL (column not yet populated) — it
 * is returned as a post-filter callback for the retrieval engine to apply.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedQuery } from './query-parser';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RPCParams {
  p_min_calories?:        number;
  p_max_calories?:        number;
  p_min_protein?:         number;
  p_max_protein?:         number;
  p_max_carbs?:           number;
  p_min_carbs?:           number;
  p_max_fat?:             number;
  p_min_fat?:             number;
  p_normalized_category?: string;
  p_meal_type?:           string;
  p_restaurant_names?:    string[];   // matches restaurant_name TEXT column (not UUID)
  p_exclude_large:        boolean;
  p_limit:                number;
  p_offset:               number;
  p_name_keyword?:        string;     // dish/protein keyword e.g. 'steak', 'salmon'
  p_cuisine_types?:       string[];
  p_tags_any?:            string[];
  p_protein_sources?:     string[];
  p_exclude_terms?:       string[];
}

export interface FilterBuildResult {
  params: RPCParams;
  /** In-memory dietary filter (applied after SQL fetch) */
  dietaryKeywords?: string[];
  /** Whether any restaurant filter was successfully resolved */
  restaurantResolved: boolean;
  /** Resolved restaurant names for display */
  resolvedRestaurantNames?: string[];
}

// ─── Dietary keyword maps ─────────────────────────────────────────────────────
// Applied in-memory since dietary_tags column isn't populated yet

const DIETARY_KEYWORDS: Record<string, string[]> = {
  vegan: [
    'vegan', 'plant-based', 'plant based', 'beyond', 'impossible',
    'tofu', 'tempeh', 'falafel', 'meatless', 'meat-free',
  ],
  vegetarian: [
    'vegetarian', 'veggie', 'vegan', 'plant-based', 'meatless',
    'tofu', 'tempeh', 'falafel', 'beyond', 'impossible', 'meat-free',
    'egg', 'cheese', 'bean', 'lentil',
  ],
  gluten_free: ['gluten-free', 'gluten free', 'gf'],
  dairy_free: ['dairy-free', 'dairy free', 'no dairy', 'non-dairy'],
  paleo: ['paleo'],
  whole30: ['whole30', 'whole 30'],
  halal: ['halal'],
  kosher: ['kosher'],
  keto: ['keto'],
};

const SQL_ELIGIBLE_INCLUDE_TAGS = new Set([
  'grilled',
  'smoky',
  'spicy',
  'fresh',
  'sweet',
  'savory',
]);

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Builds the RPC parameter object from a ParsedQuery.
 *
 * @param options.restaurantVariants - Pre-resolved name variants (from chat route resolver).
 *   When provided, these are passed directly to p_restaurant_names without a DB lookup.
 */
export async function buildFilters(
  supabase: SupabaseClient,
  parsed: ParsedQuery,
  options: { limit?: number; offset?: number; restaurantVariants?: string[] } = {}
): Promise<FilterBuildResult> {
  const { limit = 40, offset = 0 } = options;

  const params: RPCParams = {
    p_exclude_large: parsed.excludeLargePortions,
    p_limit:         limit,
    p_offset:        offset,
  };

  // ── Macro filters ─────────────────────────────────────────────────────────
  if (parsed.minCalories !== undefined) params.p_min_calories = parsed.minCalories;
  if (parsed.maxCalories !== undefined) params.p_max_calories = parsed.maxCalories;
  if (parsed.minProtein  !== undefined) params.p_min_protein  = parsed.minProtein;
  if (parsed.maxProtein  !== undefined) params.p_max_protein  = parsed.maxProtein;
  if (parsed.maxCarbs    !== undefined) params.p_max_carbs    = parsed.maxCarbs;
  if (parsed.minCarbs    !== undefined) params.p_min_carbs    = parsed.minCarbs;
  if (parsed.maxFat      !== undefined) params.p_max_fat      = parsed.maxFat;
  if (parsed.minFat      !== undefined) params.p_min_fat      = parsed.minFat;

  // ── Category / meal type ──────────────────────────────────────────────────
  if (parsed.normalizedCategory) params.p_normalized_category = parsed.normalizedCategory;
  if (parsed.mealType)           params.p_meal_type           = parsed.mealType;

  // ── Dish / protein keyword (name-based SQL filter) ────────────────────────
  // e.g. "steak dinner" → p_name_keyword = 'steak' so SQL filters name ILIKE '%steak%'
  if (!parsed.normalizedCategory && parsed.dishKeywords && parsed.dishKeywords.length > 0) {
    params.p_name_keyword = parsed.dishKeywords[0];
  }

  if (parsed.cuisineOrStyle.length > 0) {
    params.p_cuisine_types = parsed.cuisineOrStyle;
  }

  const sqlEligibleTags = parsed.includeTags.filter((tag) => SQL_ELIGIBLE_INCLUDE_TAGS.has(tag));
  if (sqlEligibleTags.length > 0) {
    params.p_tags_any = sqlEligibleTags;
  }

  if (parsed.proteinPreference.length > 0) {
    params.p_protein_sources = parsed.proteinPreference;
  }

  if (parsed.excludeTags.length > 0) {
    params.p_exclude_terms = parsed.excludeTags;
  }

  // ── Restaurant / cuisine resolution ──────────────────────────────────────
  let restaurantResolved = false;
  let resolvedRestaurantNames: string[] | undefined;

  // Priority 1: pre-resolved variants from the chat route (most reliable)
  if (options.restaurantVariants && options.restaurantVariants.length > 0) {
    params.p_restaurant_names = options.restaurantVariants;
    resolvedRestaurantNames   = options.restaurantVariants;
    restaurantResolved        = true;
  } else {
    // Priority 2 & 3: resolve via DB lookup
    const resolved = await resolveRestaurantNames(supabase, parsed);
    if (resolved.names.length > 0) {
      params.p_restaurant_names = resolved.names;
      resolvedRestaurantNames   = resolved.names;
      restaurantResolved        = true;
    }
  }

  // ── Dietary keywords for post-filter ─────────────────────────────────────
  const dietaryKeywords = parsed.dietType
    ? DIETARY_KEYWORDS[parsed.dietType]
    : undefined;

  return {
    params,
    dietaryKeywords,
    restaurantResolved,
    resolvedRestaurantNames,
  };
}

// ─── Restaurant name resolver ─────────────────────────────────────────────────
// Returns restaurant_name values (as stored in menu_items.restaurant_name).
// We deliberately avoid UUIDs because restaurant_id is NULL on all existing rows.

interface ResolvedRestaurants {
  names: string[];
}

async function resolveRestaurantNames(
  supabase: SupabaseClient,
  parsed: ParsedQuery
): Promise<ResolvedRestaurants> {
  const empty: ResolvedRestaurants = { names: [] };

  // Case 1: Specific restaurant query (e.g. "from chipotle", "only qdoba")
  if (parsed.restaurantQuery) {
    const q = parsed.restaurantQuery.trim();

    // Fetch matching restaurant names from the restaurants table
    const { data: restaurants } = await supabase
      .from('restaurants')
      .select('name')
      .ilike('name', `%${q}%`)
      .limit(5);

    if (restaurants && restaurants.length > 0) {
      return { names: restaurants.map((r: any) => r.name as string) };
    }

    // Fuzzy fallback: try matching each significant word individually
    const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    for (const word of words) {
      const { data: fuzzy } = await supabase
        .from('restaurants')
        .select('name')
        .ilike('name', `%${word}%`)
        .limit(5);
      if (fuzzy && fuzzy.length > 0) {
        return { names: fuzzy.map((r: any) => r.name as string) };
      }
    }

    // Last resort: also search menu_items.restaurant_name directly
    // (handles cases where the restaurants table doesn't have the entry)
    const { data: menuNames } = await supabase
      .from('menu_items')
      .select('restaurant_name')
      .ilike('restaurant_name', `%${q}%`)
      .limit(1);
    if (menuNames && menuNames.length > 0) {
      return { names: [menuNames[0].restaurant_name as string] };
    }

    return empty;
  }

  // Case 2: Cuisine type filter only when the user explicitly asks for a restaurant/place
  if (parsed.cuisineType && shouldResolveCuisineRestaurants(parsed.raw)) {
    const { data: restaurants } = await supabase
      .from('restaurants')
      .select('name')
      .eq('cuisine_type', parsed.cuisineType)
      .limit(50);

    if (restaurants && restaurants.length > 0) {
      return { names: restaurants.map((r: any) => r.name as string) };
    }
  }

  return empty;
}

function shouldResolveCuisineRestaurants(rawQuery: string): boolean {
  return /\b(place|restaurant|spot|joint|cafe|grill|diner|from\s+a[n]?)\b/i.test(rawQuery);
}

// ─── Post-filter helpers ──────────────────────────────────────────────────────

/**
 * Applies dietary keyword filter to in-memory result set.
 * Used when p_diet_type would be needed but dietary_tags column isn't populated.
 */
export function applyDietaryFilter(
  items: any[],
  dietaryKeywords: string[]
): any[] {
  if (!dietaryKeywords || dietaryKeywords.length === 0) return items;
  const lower = dietaryKeywords.map(k => k.toLowerCase());
  return items.filter(item => {
    const name = (item.name || '').toLowerCase();
    const desc = (item.description || '').toLowerCase();
    return lower.some(kw => name.includes(kw) || desc.includes(kw));
  });
}
