/**
 * Helper to get user's daily calorie and macro targets
 * Checks Supabase profiles table first, then falls back to localStorage
 */

import type { UserProfile } from '@/app/types';
import { createClient } from '@/utils/supabase/client';

export interface UserTargets {
  targetCalories: number;
  targetProtein?: number;
  targetCarbs?: number;
  targetFats?: number;
}

/**
 * Gets user targets from Supabase profiles table or localStorage
 * @param userId - Optional user ID. If not provided, checks localStorage only
 * @returns UserTargets object with calorie and macro targets
 */
export async function getUserTargets(userId?: string): Promise<UserTargets> {
  // Default values if nothing is found
  const defaults: UserTargets = {
    targetCalories: 2000,
    targetProtein: 150,
    targetCarbs: 200,
    targetFats: 70,
  };

  // Try Supabase first if userId is provided
  if (userId && typeof window !== 'undefined') {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('target_calories, target_protein_g, target_carbs_g, target_fats_g')
        .eq('id', userId)
        .single();

      if (!error && data) {
        return {
          targetCalories: data.target_calories ?? defaults.targetCalories,
          targetProtein: data.target_protein_g ?? defaults.targetProtein,
          targetCarbs: data.target_carbs_g ?? defaults.targetCarbs,
          targetFats: data.target_fats_g ?? defaults.targetFats,
        };
      }
    } catch (error) {
      console.warn('Failed to fetch targets from Supabase:', error);
      // Fall through to localStorage
    }
  }

  // Fallback to localStorage
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('userProfile');
      if (saved) {
        const profile: UserProfile = JSON.parse(saved);
        return {
          targetCalories: profile.target_calories ?? defaults.targetCalories,
          targetProtein: profile.target_protein_g ?? defaults.targetProtein,
          targetCarbs: profile.target_carbs_g ?? defaults.targetCarbs,
          targetFats: profile.target_fats_g ?? defaults.targetFats,
        };
      }
    } catch (error) {
      console.warn('Failed to parse userProfile from localStorage:', error);
    }
  }

  return defaults;
}


