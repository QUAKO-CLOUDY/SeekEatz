
// app/types.ts

import type { Macros } from '@/lib/macro-utils';

export type UserProfile = {
  // Core profile fields - match Supabase profiles table exactly
  id?: string; // Often needed
  full_name?: string;
  target_calories?: number; // Optional - can be undefined/null
  target_protein_g?: number; // Optional - can be undefined/null
  target_carbs_g?: number; // Optional - can be undefined/null
  target_fats_g?: number; // Optional - can be undefined/null
  diet_type?: string; // Single diet type selection
  dietary_options?: string[]; // Multi-select dietary restrictions/options
  search_distance_miles?: number; // Default search radius in miles (0.5, 1, 2, 5, or 10)
  preferredMealTypes?: string[]; // Optional array of preferred meal types
  goal?: 'lose-fat' | 'build-muscle' | 'maintain'; // Fitness goal: lose weight, build muscle, or maintain
  eat_out_frequency?: 'rarely' | '1-2' | '3-5' | '6-9' | '10-14' | '15-plus';
  social_skip_frequency?: 'never' | 'once-or-twice' | 'occasionally' | 'frequently' | 'all-the-time';
  eating_out_experiences?: Array<
    | 'checked-menus-before-going-out'
    | 'ordered-healthy-regretted'
    | 'spent-10-min-comparing'
    | 'logged-meal-uncertain-data'
    | 'felt-guilty-after-eating-out'
    | 'no-idea-what-fit-macros'
  >;
  macro_confidence_impact?: 'yes-significantly' | 'yes-somewhat' | 'not-sure' | 'probably-not' | 'no';
  gender?: 'male' | 'female';
  age?: number;
  height_ft?: number;
  height_in?: number;
  weight_lbs?: number;
  bmr?: number;
  activity_level?:
    | 'sedentary'
    | 'lightly-active'
    | 'moderately-active'
    | 'very-active'
    | 'extremely-active';
  daily_steps_range?:
    | 'under-5000'
    | '5000-7000'
    | '7000-10000'
    | '10000-15000'
    | '15000-20000'
    | '20000-plus';
  allergens?: string[];
};

export type Meal = {
  id: string;
  name: string;
  restaurant: string;
  restaurant_name?: string; // For MealCard logo logic (matches Supabase column name)
  restaurantLogoUrl?: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number; // "fats" (plural) as requested
  // Optional macros object for structured access (preferred)
  macros?: Macros;
  image: string;
  price?: number;
  description?: string;
  category?: 'restaurant' | 'grocery';
  prepTime?: number;
  distance?: number; // Defined as a NUMBER - calculated dynamically from coordinates
  ingredients?: string[];
  aiSwaps?: string[];
  rating?: number;
  tags?: string[];
  dietary_tags?: string[]; // For variable availability warnings
  matchScore?: number;
  matchReasons?: string[];
  searchMetadata?: {
    score?: number;
    confidence?: number;
    fallbackSource?: 'deterministic' | 'semantic';
  };
  // Restaurant location coordinates for distance calculation
  latitude?: number;
  longitude?: number;
};

export interface SearchParams {
  query: string;
  calorieCap?: number; // Legacy: max calories (use maxCalories instead)
  minCalories?: number;
  maxCalories?: number;
  minProtein?: number;
  maxProtein?: number;
  minCarbs?: number;
  maxCarbs?: number;
  minFat?: number; // Legacy: use minFats
  maxFat?: number; // Legacy: use maxFats
  minFats?: number;
  maxFats?: number;
  diet?: string;
  restaurant?: string; // Canonical restaurant name (for backward compatibility)
  restaurantId?: string; // UUID of restaurant (preferred when available)
  restaurantVariants?: string[]; // All restaurant_name variants for filtering (e.g., ["CAVA", "Cava"]) - from universal resolver
  explicitRestaurantQuery?: string; // Raw restaurant query from user (e.g., "cava" from "meals from cava")
  macroFilters?: {
    proteinMin?: number;
    caloriesMax?: number;
    carbsMax?: number;
    fatsMax?: number;
    proteinMax?: number;
    caloriesMin?: number;
    carbsMin?: number;
    fatsMin?: number;

  } | null;
  location?: string;
  userContext?: {
    userId?: string;
    [key: string]: unknown;
  };
  offset?: number;
  limit?: number;
  searchKey?: string;
  shuffleNonce?: string;
  excludedRestaurants?: string[];
  isPagination?: boolean;
  isHomepage?: boolean;
  calorieMode?: "UNDER" | "OVER";
  /** Frozen nearby restaurant matches — reused on pagination or client cache hits. */
  nearbyMatchesSnapshot?: Array<{
    restaurantId?: string;
    restaurantName: string;
    distanceMiles: number;
    latitude: number;
    longitude: number;
  }>;
  /** Client/server location bucket key: lat(2dp):lng(2dp):radius */
  nearbyContextKey?: string;
}

export type NearbyCacheResponse = {
  contextKey: string;
  fetchRadiusMiles: number;
  lat: number;
  lng: number;
  matches: NonNullable<SearchParams['nearbyMatchesSnapshot']>;
};
