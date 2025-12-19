// app/types.ts

export type UserProfile = {
  // Core profile fields - match Supabase profiles table exactly
  full_name?: string;
  target_calories?: number; // Optional - can be undefined/null
  target_protein_g?: number; // Optional - can be undefined/null
  target_carbs_g?: number; // Optional - can be undefined/null
  target_fats_g?: number; // Optional - can be undefined/null
  diet_type?: string; // Single diet type selection
  dietary_options?: string[]; // Multi-select dietary restrictions/options
  search_distance_miles?: number; // Default search radius in miles (0.5, 1, 2, 5, or 10)
  preferredMealTypes?: string[]; // Optional array of preferred meal types
};

export type Meal = {
  id: string;
  name: string;
  restaurant: string;
  restaurant_name?: string; // For MealCard logo logic (matches Supabase column name)
  calories: number;
  protein: number;
  carbs: number;
  fats: number; // "fats" (plural) as requested
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
  // Restaurant location coordinates for distance calculation
  latitude?: number;
  longitude?: number;
};