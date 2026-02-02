/**
 * Shared calculator for calorie remaining calculations
 * Single source of truth used by LogScreen, MealCard, and MealDetail
 */

import type { UserProfile } from '@/app/types';
import type { LoggedMeal } from '@/app/components/LogScreen';
import { getTodaysTotals } from './daily-totals';

export interface CalorieCalculationResult {
  targetCalories: number;
  todaysConsumedCalories: number;
  todaysRemainingCalories: number;
  remainingIfEatMeal: (mealCalories: number) => number;
}

/**
 * Calculates calorie remaining values from user profile and logged meals
 * This is the SINGLE SOURCE OF TRUTH for calorie calculations
 * 
 * @param userProfile - User profile with target calories
 * @param loggedMeals - Array of logged meals
 * @param selectedDate - Optional date string (YYYY-MM-DD). Defaults to today
 * @returns CalorieCalculationResult with all calculated values
 */
export function calculateCalorieRemaining(
  userProfile: UserProfile,
  loggedMeals: LoggedMeal[],
  selectedDate?: string
): CalorieCalculationResult {
  // Default to today if no date provided
  const targetDate = selectedDate || new Date().toISOString().split('T')[0];

  // Get target calories from user profile
  const targetCalories = userProfile?.target_calories 
    ? (typeof userProfile.target_calories === 'number' 
        ? userProfile.target_calories 
        : Number(userProfile.target_calories) || 0)
    : 0;

  // Calculate today's consumed calories using shared daily totals function
  const todaysTotals = getTodaysTotals(loggedMeals, targetDate);
  const todaysConsumedCalories = todaysTotals.consumedCalories;

  // Calculate remaining calories for the selected date
  const todaysRemainingCalories = targetCalories - todaysConsumedCalories;

  /**
   * Calculate remaining calories if a specific meal were eaten
   * @param mealCalories - The calories in the meal being considered
   * @returns The remaining calories after eating this meal (can be negative if over target)
   */
  const remainingIfEatMeal = (mealCalories: number): number => {
    return targetCalories - (todaysConsumedCalories + mealCalories);
  };

  // Single debug log in the shared calculator (to avoid log spam)
  // Shows: targets, todaysConsumed, remainingBefore, remainingAfterMeal (with example meal)
  const exampleMealCalories = 500; // Example for debug log
  const exampleRemainingAfterMeal = remainingIfEatMeal(exampleMealCalories);
  console.log('[calorie-calculator] Daily totals calculation:', {
    date: targetDate,
    targetCalories,
    todaysConsumedCalories,
    remainingBefore: todaysRemainingCalories,
    remainingAfterMeal: exampleRemainingAfterMeal, // Example with 500 cal meal
    loggedMealsCount: loggedMeals.filter(log => log.date === targetDate).length,
  });

  return {
    targetCalories,
    todaysConsumedCalories,
    todaysRemainingCalories,
    remainingIfEatMeal,
  };
}

