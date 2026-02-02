import { useMemo } from 'react';
import type { UserProfile } from '../types';
import type { LoggedMeal } from '../components/LogScreen';
import { calculateCalorieRemaining } from '@/utils/calorie-calculator';

/**
 * Shared hook for calorie tracking calculations
 * Provides a single source of truth for calorie remaining calculations
 * Uses the shared calculateCalorieRemaining utility
 */
export function useCalorieTracking(
  userProfile: UserProfile,
  loggedMeals: LoggedMeal[],
  selectedDate?: string
) {
  // Use the shared calculator function (single source of truth)
  const result = useMemo(() => {
    return calculateCalorieRemaining(userProfile, loggedMeals, selectedDate);
  }, [userProfile, loggedMeals, selectedDate]);

  // Default to today if no date provided
  const targetDate = selectedDate || new Date().toISOString().split('T')[0];

  return {
    ...result,
    selectedDate: targetDate,
  };
}

