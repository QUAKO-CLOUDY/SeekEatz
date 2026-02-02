'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getUserTargets, type UserTargets } from '@/utils/user-targets';
import { getTodaysTotals, type DailyTotals } from '@/utils/daily-totals';
import type { LoggedMeal } from '@/app/components/LogScreen';

interface NutritionContextType {
  targets: UserTargets | null;
  todaysTotals: DailyTotals | null;
  loggedMeals: LoggedMeal[]; // Expose loggedMeals so components can use shared calculator
  isLoading: boolean;
  refreshTotals: (loggedMeals: LoggedMeal[]) => void;
  refreshTargets: (userId?: string) => Promise<void>;
  updateLoggedMeals: (meals: LoggedMeal[]) => void; // Method to update loggedMeals from parent components
}

const NutritionContext = createContext<NutritionContextType | undefined>(undefined);

interface NutritionProviderProps {
  children: ReactNode;
  userId?: string;
  loggedMeals?: LoggedMeal[]; // Make optional - will load from localStorage if not provided
}

export function NutritionProvider({ children, userId: propUserId, loggedMeals: propLoggedMeals }: NutritionProviderProps) {
  const [targets, setTargets] = useState<UserTargets | null>(null);
  const [todaysTotals, setTodaysTotals] = useState<DailyTotals | null>(null);
  const [loggedMeals, setLoggedMeals] = useState<LoggedMeal[]>(propLoggedMeals || []);
  const [userId, setUserId] = useState<string | undefined>(propUserId);
  const [isLoading, setIsLoading] = useState(true);

  // Load targets on mount and when userId changes
  const refreshTargets = async (targetUserId?: string) => {
    try {
      const userTargets = await getUserTargets(targetUserId || userId);
      setTargets(userTargets);
    } catch (error) {
      console.error('Failed to load user targets:', error);
      // Set defaults on error
      setTargets({
        targetCalories: 2000,
        targetProtein: 150,
        targetCarbs: 200,
        targetFats: 70,
      });
    }
  };

  // Calculate today's totals from logged meals
  const refreshTotals = (meals: LoggedMeal[]) => {
    const totals = getTodaysTotals(meals);
    setTodaysTotals(totals);
  };

  // Load loggedMeals from localStorage if not provided as prop
  useEffect(() => {
    if (typeof window !== 'undefined' && !propLoggedMeals) {
      try {
        const saved = localStorage.getItem('seekeatz_logged_meals');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setLoggedMeals(parsed);
          }
        }
      } catch (e) {
        console.error('Failed to parse loggedMeals from localStorage:', e);
      }
    } else if (propLoggedMeals) {
      setLoggedMeals(propLoggedMeals);
    }
  }, [propLoggedMeals]);

  // Load userId from localStorage if not provided as prop
  useEffect(() => {
    if (typeof window !== 'undefined' && !propUserId) {
      // Try to get userId from Supabase session
      const loadUserId = async () => {
        try {
          const { createClient } = await import('@/utils/supabase/client');
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            setUserId(user.id);
          }
        } catch (e) {
          console.warn('Could not load userId from Supabase:', e);
        }
      };
      loadUserId();
    } else if (propUserId) {
      setUserId(propUserId);
    }
  }, [propUserId]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await refreshTargets();
      refreshTotals(loggedMeals);
      setIsLoading(false);
    };
    if (typeof window !== 'undefined') {
      loadData();
    }
  }, [userId]); // Only reload when userId changes

  // Update totals when loggedMeals change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      refreshTotals(loggedMeals);
    }
  }, [loggedMeals]);

  // Method to update loggedMeals from parent components (like MainApp)
  const updateLoggedMeals = (meals: LoggedMeal[]) => {
    setLoggedMeals(meals);
    // Also save to localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('seekeatz_logged_meals', JSON.stringify(meals));
      } catch (e) {
        console.error('Failed to save loggedMeals to localStorage:', e);
      }
    }
  };

  // Listen for localStorage changes (in case loggedMeals are updated elsewhere)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'seekeatz_logged_meals' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setLoggedMeals(parsed);
          }
        } catch (e) {
          console.error('Failed to parse loggedMeals from storage event:', e);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <NutritionContext.Provider
      value={{
        targets,
        todaysTotals,
        loggedMeals,
        isLoading,
        refreshTotals,
        refreshTargets,
        updateLoggedMeals,
      }}
    >
      {children}
    </NutritionContext.Provider>
  );
}

export function useNutrition() {
  const context = useContext(NutritionContext);
  if (context === undefined) {
    throw new Error('useNutrition must be used within a NutritionProvider');
  }
  return context;
}

