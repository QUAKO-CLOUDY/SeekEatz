/**
 * Helper to calculate today's consumed calories and macros from logged meals
 */

import type { LoggedMeal } from '@/app/components/LogScreen';

export interface DailyTotals {
  consumedCalories: number;
  consumedProtein: number;
  consumedCarbs: number;
  consumedFats: number;
}

/**
 * Calculates today's totals from logged meals
 * @param loggedMeals - Array of logged meals
 * @param date - Optional date string (YYYY-MM-DD). Defaults to today
 * @returns DailyTotals object with consumed calories and macros
 */
export function getTodaysTotals(
  loggedMeals: LoggedMeal[],
  date?: string
): DailyTotals {
  // Default to today if no date provided
  const targetDate = date || new Date().toISOString().split('T')[0];

  // Filter meals for the target date
  const todaysMeals = loggedMeals.filter((log) => log.date === targetDate);

  // Sum up totals
  const totals = todaysMeals.reduce(
    (acc, log) => ({
      consumedCalories: acc.consumedCalories + (log.meal.calories || 0),
      consumedProtein: acc.consumedProtein + (log.meal.protein || 0),
      consumedCarbs: acc.consumedCarbs + (log.meal.carbs || 0),
      consumedFats: acc.consumedFats + (log.meal.fats || 0),
    }),
    {
      consumedCalories: 0,
      consumedProtein: 0,
      consumedCarbs: 0,
      consumedFats: 0,
    }
  );

  return totals;
}


