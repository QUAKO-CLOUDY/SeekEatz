// app/types.ts

export type UserProfile = {
  goal: 'lose-fat' | 'maintain' | 'build-muscle';
  dietaryType: string;
  allergens: string[];
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatsTarget: number;
  // Optional fields for flexibility
  name?: string;
  nutritionGoals?: string[];
  preferredCuisines?: string[];
  preferredMealTypes?: string[];
  eatingStyles?: string[];
  dietaryPreferences?: string[];
  activityLevel?: string;
  trainingStyle?: string;
};

export type Meal = {
  id: string;
  name: string;
  restaurant: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number; // "fats" (plural) as requested
  image: string;
  price?: number;
  description?: string;
  category?: 'restaurant' | 'grocery';
  prepTime?: number;
  distance?: number; // Defined as a NUMBER
  ingredients?: string[];
  aiSwaps?: string[];
  rating?: number;
  tags?: string[];
  matchScore?: number;
};