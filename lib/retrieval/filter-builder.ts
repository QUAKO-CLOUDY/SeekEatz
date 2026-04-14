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
    'bean', 'lentil',
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
  if (parsed.mealType) params.p_meal_type = parsed.mealType;

  // ── Dish / protein keyword (name-based SQL filter) ────────────────────────
  // e.g. "steak dinner" → p_name_keyword = 'steak' so SQL filters name ILIKE '%steak%'
  const explicitDishKeyword = getExplicitDishKeyword(parsed);
  if (explicitDishKeyword) {
    params.p_name_keyword = explicitDishKeyword;
  } else if (!parsed.normalizedCategory && parsed.dishKeywords && parsed.dishKeywords.length > 0) {
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

type RestaurantNameRow = {
  restaurant_name?: string | null;
};

type RestaurantRow = {
  name?: string | null;
};

type DietaryFilterItem = {
  name?: string;
  description?: string;
};

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

function compactRestaurantLookup(value: string): string {
  return normalizeRestaurantLookup(value).replace(/\s+/g, '');
}

function restaurantTokens(value: string): string[] {
  return normalizeRestaurantLookup(value)
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'of',
  'co',
  'company',
  'restaurant',
  'grill',
  'cafe',
  'bar',
  'kitchen',
]);

async function buildRestaurantNameVariants(
  supabase: SupabaseClient,
  seeds: string[]
): Promise<string[]> {
  const uniqueSeeds = [...new Set(seeds.map((seed) => seed.trim()).filter(Boolean))];
  const variantSet = new Set<string>(uniqueSeeds);

  for (const seed of uniqueSeeds) {
    const { data } = await supabase
      .from('menu_items')
      .select('restaurant_name')
      .ilike('restaurant_name', `%${seed}%`)
      .limit(50);

    for (const row of (data ?? []) as Array<{ restaurant_name?: string | null }>) {
      if (row.restaurant_name) {
        variantSet.add(row.restaurant_name);
      }
    }
  }

  return [...variantSet];
}

async function resolveRestaurantNames(
  supabase: SupabaseClient,
  parsed: ParsedQuery
): Promise<ResolvedRestaurants> {
  const empty: ResolvedRestaurants = { names: [] };

  // Case 1: Specific restaurant query (e.g. "from chipotle", "only qdoba")
  if (parsed.restaurantQuery) {
    const q = parsed.restaurantQuery.trim();
    const qNorm = normalizeRestaurantLookup(q);
    const qCompact = compactRestaurantLookup(q);
    const qTokens = restaurantTokens(q);

    const { data: restaurants } = await supabase
      .from('restaurants')
      .select('name, aliases')
      .not('name', 'is', null);

    if (restaurants && restaurants.length > 0) {
      type Candidate = { name: string; aliases: string[]; score: number };
      const candidates: Candidate[] = [];

      for (const restaurant of restaurants as Array<{ name?: string | null; aliases?: string[] | null }>) {
        if (!restaurant.name) {
          continue;
        }

        const candidateNames = [restaurant.name, ...(restaurant.aliases ?? [])].filter(Boolean) as string[];
        let bestScore = 0;

        for (const candidateName of candidateNames) {
          const candidateNorm = normalizeRestaurantLookup(candidateName);
          const candidateCompact = compactRestaurantLookup(candidateName);
          const candidateTokens = restaurantTokens(candidateName);

          if (candidateNorm === qNorm) {
            bestScore = Math.max(bestScore, 1);
            continue;
          }

          if (
            candidateCompact.length >= 3 &&
            (candidateCompact === qCompact ||
              candidateCompact.includes(qCompact) ||
              qCompact.includes(candidateCompact))
          ) {
            bestScore = Math.max(bestScore, 0.98);
            continue;
          }

          const allQueryTokensMatch =
            qTokens.length > 0 &&
            qTokens.every((queryToken) => candidateTokens.includes(queryToken));

          if (allQueryTokensMatch) {
            bestScore = Math.max(bestScore, qTokens.length === 1 ? 0.84 : 0.92);
            continue;
          }

          const allCandidateTokensMatch =
            candidateTokens.length > 0 &&
            candidateTokens.every((candidateToken) => qTokens.includes(candidateToken));

          if (allCandidateTokensMatch) {
            bestScore = Math.max(bestScore, 0.88);
          }
        }

        if (bestScore > 0) {
          candidates.push({
            name: restaurant.name,
            aliases: restaurant.aliases ?? [],
            score: bestScore,
          });
        }
      }

      candidates.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
      const best = candidates[0];
      if (best) {
        const variants = await buildRestaurantNameVariants(
          supabase,
          [best.name, ...best.aliases, q]
        );
        return { names: variants };
      }
    }

    const { data: menuNames } = await supabase
      .from('menu_items')
      .select('restaurant_name')
      .ilike('restaurant_name', `%${q}%`)
      .limit(25);
    if (menuNames && menuNames.length > 0) {
      const names = menuNames
        .map((row: RestaurantNameRow) => row.restaurant_name)
        .filter((name): name is string => Boolean(name));
      return { names: [...new Set(names)] };
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
      return {
        names: restaurants
          .map((r: RestaurantRow) => r.name)
          .filter((name): name is string => Boolean(name)),
      };
    }
  }

  return empty;
}

function shouldResolveCuisineRestaurants(rawQuery: string): boolean {
  return /\b(place|restaurant|spot|joint|cafe|grill|diner|from\s+a[n]?)\b/i.test(rawQuery);
}

function getExplicitDishKeyword(parsed: ParsedQuery): string | undefined {
  const raw = parsed.raw.toLowerCase();
  if (/\bacai\b/.test(raw)) return 'acai';
  if (/\bpitaya\b/.test(raw)) return 'pitaya';
  if (/\bsalmon\b/.test(raw)) return 'salmon';
  if (/\btuna\b/.test(raw)) return 'tuna';
  if (/\bcod\b/.test(raw)) return 'cod';
  if (/\btilapia\b/.test(raw)) return 'tilapia';
  if (/\bmahi(?:[\s-]?mahi)?\b/.test(raw)) return 'mahi';
  if (/\bcold\s+brew\b/.test(raw)) return 'cold brew';
  if (/\blatte\b/.test(raw)) return 'latte';
  if (/\bespresso\b/.test(raw)) return 'espresso';
  if (/\bmatcha\b/.test(raw)) return 'matcha';
  return undefined;
}

// ─── Post-filter helpers ──────────────────────────────────────────────────────

/**
 * Applies dietary keyword filter to in-memory result set.
 * Used when p_diet_type would be needed but dietary_tags column isn't populated.
 */
export function applyDietaryFilter(
  items: DietaryFilterItem[],
  dietaryKeywords: string[]
): DietaryFilterItem[] {
  if (!dietaryKeywords || dietaryKeywords.length === 0) return items;
  const lower = dietaryKeywords.map(k => k.toLowerCase());
  const vegetarianFilter = lower.includes('vegetarian') || lower.includes('veggie');
  const veganFilter = lower.includes('vegan');
  const meatPattern = /\b(chicken|steak|beef|pork|turkey|salmon|shrimp|fish|bacon|sausage|ham|lamb|meatballs?|pepperoni|prosciutto|tuna|crab|lobster)\b/i;
  const animalProductPattern = /\b(cheese|egg|eggs|dairy|cream|butter|milk|whey|yogurt|honey)\b/i;

  return items.filter(item => {
    const name = (item.name || '').toLowerCase();
    const desc = (item.description || '').toLowerCase();
    const haystack = `${name} ${desc}`;

    if ((vegetarianFilter || veganFilter) && meatPattern.test(haystack)) {
      return false;
    }

    if (veganFilter && animalProductPattern.test(haystack)) {
      return false;
    }

    return lower.some(kw => name.includes(kw) || desc.includes(kw));
  });
}
