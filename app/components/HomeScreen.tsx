"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { Search, Loader2, MapPin } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { MealCard } from "./MealCard";
import type { UserProfile, Meal } from "../types";
import { getMealImageUrl } from "@/lib/image-utils";
import { useSessionActivity } from "../hooks/useSessionActivity";
import { normalizeMacros } from "@/lib/macro-utils";
import { canUseFeature, incrementUsage } from "@/lib/usage-gate";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AnimatedNumber } from "./AnimatedNumber";
import { diversifyMealsByRestaurant } from "@/lib/restaurant-diversity";
import { getStoredLocation, storeLocation } from "@/lib/location";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";

type MacroType = "calories" | "protein" | "carbs" | "fats";

type Direction = "above" | "below";

type MacroConfig = {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
};

const MACRO_CONFIG: Record<MacroType, MacroConfig> = {
  calories: { label: "Calories", min: 500, max: 2500, step: 50 },
  protein: { label: "Protein", unit: "g", min: 0, max: 100, step: 5 },
  carbs: { label: "Carbs", unit: "g", min: 0, max: 100, step: 10 },
  fats: { label: "Fats", unit: "g", min: 0, max: 100, step: 5 },
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

import type { LoggedMeal } from './LogScreen';

type Props = {
  userProfile: UserProfile;
  onMealSelect: (meal: Meal) => void;
  favoriteMeals: string[];
  onSearch?: () => void;
  onNavigateToChat?: (message?: string) => void;
  onToggleFavorite?: (mealId: string, meal?: Meal) => void;
  loggedMeals?: LoggedMeal[];
};

type SearchMealsResponse = {
  meals: Meal[];
  searchKey?: string;
  hasMore?: boolean;
  nextOffset?: number;
};

const NO_MORE_MEALS_MESSAGE =
  "There are no more meals that fit these constraints in our database. Please change the restrictions to get access to more mealcards.";
const HOME_MEALS_PAGE_SIZE = 4;

export function HomeScreen({ userProfile, onMealSelect, favoriteMeals = [], onToggleFavorite, loggedMeals = [] }: Props) {
  const { updateActivity } = useSessionActivity();
  const router = useRouter();
  
  // Display name fallback from auth metadata/email when profile name is empty
  const [authDisplayName, setAuthDisplayName] = useState<string | null>(null);
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (user) {
          const fromMeta = user.user_metadata?.full_name?.trim().split(/\s+/)[0];
          const fromEmail = user.email?.split("@")[0];
          setAuthDisplayName(fromMeta || fromEmail || null);
        }
      })
      .catch(() => {});
  }, []);

  // Prefer the saved profile name so Settings updates reflect immediately.
  const userName = (() => {
    const fromProfile = userProfile?.full_name?.trim();
    if (fromProfile) {
      const first = fromProfile.split(/\s+/)[0];
      return first || fromProfile;
    }
    if (authDisplayName) return authDisplayName;
    return "Friend";
  })();
  const [selectedCuisine] = useState<string | null>(null);
  const [macro, setMacro] = useState<MacroType>("calories");
  
  // Initialize with user profile targets, or defaults
  const [macroValues, setMacroValues] = useState<Record<MacroType, number>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('seekeatz_macro_values');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse saved macro values:', e);
        }
      }
    }
    return {
      calories: userProfile?.target_calories || 2000,
      protein: userProfile?.target_protein_g || 150,
      carbs: userProfile?.target_carbs_g || 200,
      fats: userProfile?.target_fats_g || 70,
    };
  });

  // Direction (above/below) for all macros: calories, protein, carbs, fats
  const [macroDirections, setMacroDirections] = useState<Record<MacroType, Direction>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('seekeatz_macro_directions');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            calories: parsed.calories || "below",
            protein: parsed.protein || "above",
            carbs: parsed.carbs || "above",
            fats: parsed.fats || "above",
          };
        } catch (e) {
          console.error('Failed to parse saved macro directions:', e);
        }
      }
    }
    return {
      calories: "below",
      protein: "above",
      carbs: "above",
      fats: "above",
    };
  });

  // Initialize enabled state for each macro filter (all enabled by default)
  const [macroEnabled, setMacroEnabled] = useState<Record<MacroType, boolean>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('seekeatz_macro_enabled');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse saved macro enabled state:', e);
        }
      }
    }
    // Default to all enabled
    return {
      calories: true,
      protein: true,
      carbs: true,
      fats: true,
    };
  });

  // State for which popover is open
  const [openPopover, setOpenPopover] = useState<MacroType | null>(null);

  // Load persisted meals and search state
  const [recommendedMeals, setRecommendedMeals] = useState<Meal[]>([]);
  const [allSearchMeals, setAllSearchMeals] = useState<Meal[]>([]);
  
  const [isLoadingMeals, setIsLoadingMeals] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Ref to track the main container for scroll position
  const containerRef = useRef<HTMLDivElement>(null);
  const mealsSectionRef = useRef<HTMLDivElement>(null);
  const hasRestoredScrollRef = useRef(false);
  
  // Prevent browser scroll restoration
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);
  
  // Load meals from localStorage on mount and whenever component becomes visible
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedMeals = localStorage.getItem('seekeatz_recommended_meals');
        if (savedMeals) {
          const parsed = JSON.parse(savedMeals);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRecommendedMeals(parsed);
          }
        }
        
        const savedHasSearched = localStorage.getItem('seekeatz_has_searched');
        if (savedHasSearched === 'true') {
          setHasSearched(true);
        }
      } catch (e) {
        console.error('Failed to load saved meals:', e);
      }
    }
  }, []); // Run on mount
  
  
  // Save scroll position continuously and on unmount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      if (typeof window !== 'undefined') {
        // Debounce scroll position saving
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          sessionStorage.setItem('seekeatz_home_scroll_position', container.scrollTop.toString());
        }, 100);
      }
    };
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      clearTimeout(scrollTimeout);
      container.removeEventListener('scroll', handleScroll);
      // Save final scroll position on unmount
      if (typeof window !== 'undefined' && container) {
        sessionStorage.setItem('seekeatz_home_scroll_position', container.scrollTop.toString());
      }
    };
  }, []);
  
  // Track last search parameters (including searchKey for pagination)
  const [lastSearchParams, setLastSearchParams] = useState<{
    macroValues: Record<MacroType, number>;
    macroDirections?: Record<"calories", Direction>;
    macroEnabled?: Record<MacroType, boolean>;
    selectedCuisine: string | null;
    distance?: number;
    searchKey?: string; // For pagination
    nextOffset?: number;
    hasMore?: boolean;
  } | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('seekeatz_last_search_params');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse last search params:', e);
        }
      }
    }
    return null;
  });
  const [loadMoreNotice, setLoadMoreNotice] = useState<string | null>(null);

  // Persist selected cuisine
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('seekeatz_selected_cuisine', JSON.stringify(selectedCuisine));
    }
  }, [selectedCuisine]);

  // Session-level distance override (temporary, not persisted to profile)
  const [homeDistanceOverride, setHomeDistanceOverride] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('seekeatz_home_distance_override');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse home distance override:', e);
        }
      }
    }
    return null;
  });

  // Get active distance: Home override if set, otherwise Settings default, otherwise 1 mile
  const activeDistance = homeDistanceOverride ?? userProfile.search_distance_miles ?? 1;

  const config = MACRO_CONFIG[macro];
  const currentValue = macroValues[macro];

  const handleMacroChange = (nextMacro: MacroType) => {
    // Open popover for direction selection instead of changing macro
    setOpenPopover(nextMacro);
    // Also set macro for the slider display
    setMacro(nextMacro);
  };

  const handleDirectionChange = (metric: MacroType, direction: Direction) => {
    setMacroDirections((prev) => {
      const updated = { ...prev, [metric]: direction };
      if (typeof window !== 'undefined') {
        localStorage.setItem('seekeatz_macro_directions', JSON.stringify(updated));
      }
      return updated;
    });
    setOpenPopover(null);
  };

  const handleToggleExclude = (metric: MacroType) => {
    setMacroEnabled((prev) => {
      const updated = { ...prev, [metric]: !prev[metric] };
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('seekeatz_macro_enabled', JSON.stringify(updated));
      }
      return updated;
    });
    // Close popover after toggle
    setOpenPopover(null);
  };

  const handleValueChange = (newValue: number) => {
    setMacroValues((prev) => {
      const updated = { ...prev, [macro]: newValue };
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('seekeatz_macro_values', JSON.stringify(updated));
      }
      return updated;
    });
  };

  // Note: We no longer auto-clear meals when preferences change.
  // Meals are only updated when the user explicitly clicks "Find meals that match this".

  // Convert API result to Meal type
  // API returns meals with normalized macros: calories, protein, carbs, fats
  const convertToMeal = (item: any): Meal => {
    const category = item.category === 'Grocery' || item.category === 'Hot Bar' 
      ? 'grocery' as const 
      : 'restaurant' as const;

    const mealName = item.item_name || item.name || 'Unknown Item';
    const restaurantName = item.restaurant_name || 'Unknown Restaurant';
    
    // Use getMealImageUrl to ensure we always have a real food image
    const imageUrl = getMealImageUrl(
      mealName,
      restaurantName,
      item.image_url || item.image
    );

    // Normalize macros from API response
    // API returns: { calories, protein, carbs, fats } (already normalized)
    // Also support legacy formats for backward compatibility
    const macrosData = item.macros || {
      calories: item.calories,
      protein: item.protein ?? item.protein_g,
      carbs: item.carbs ?? item.carbs_g,
      fats: item.fats ?? item.fat ?? item.fats_g ?? item.fat_g,
    };
    
    const normalizedMacros = normalizeMacros(macrosData);
    
    // If normalization fails, use fallback values (shouldn't happen with proper API)
    const calories = normalizedMacros?.calories ?? item.calories ?? 0;
    const protein = normalizedMacros?.protein ?? item.protein ?? item.protein_g ?? 0;
    const carbs = normalizedMacros?.carbs ?? item.carbs ?? item.carbs_g ?? 0;
    const fats = normalizedMacros?.fats ?? item.fats ?? item.fat ?? item.fats_g ?? item.fat_g ?? 0;

    return {
      id: item.id || `meal-${Date.now()}-${Math.random()}`,
      name: mealName,
      restaurant: restaurantName,
      restaurant_name: restaurantName, // Also set restaurant_name for logo logic
      calories,
      protein,
      carbs,
      fats,
      macros: normalizedMacros || undefined, // Include normalized macros object if available
      image: imageUrl,
      price: item.price ?? item.price_estimate ?? null,
      description: item.description || '',
      category: category,
      dietary_tags: item.dietary_tags || item.tags || [],
      rating: item.rating || undefined,
      distance: item.distance || undefined,
    };
  };

  const deduplicateHomeMeals = (meals: Meal[]): Meal[] => {
    const seen = new Set<string>();
    return meals.filter((meal) => {
      if (seen.has(meal.id)) {
        return false;
      }
      seen.add(meal.id);
      return true;
    });
  };

  const mealMatchesCuisine = (_meal: Meal, cuisineId: string | null): boolean => !cuisineId;

  // Diet filtering removed - all diet logic disabled
  // This function is kept for compatibility but returns meals unchanged
  const filterMealsByProfile = (meals: Meal[], profile: UserProfile): Meal[] => {
    // All diet filtering removed - return meals unchanged
    return meals;
  };

  // Get user location (if available)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(() => {
    const stored = getStoredLocation();
    return stored
      ? { latitude: stored.latitude, longitude: stored.longitude }
      : null;
  });

  // Request user location on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          storeLocation(position.coords.latitude, position.coords.longitude);
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.log('Location access denied or unavailable:', error.message);
          // Don't show error to user - radius filtering just won't work
        }
      );
    }
  }, []);

  const searchMeals = async (
    query: string, 
    distance?: number, 
    append = false,
    constraints: any = undefined, // Legacy parameter (deprecated)
    searchKey?: string,
    nextOffset?: number,
    filters?: {
      calories?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
      protein?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
      carbs?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
      fats?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
    },
    macroFilters?: {
      proteinMin?: number;
      proteinMax?: number;
      carbsMin?: number;
      carbsMax?: number;
      fatsMin?: number;
      fatsMax?: number;
      caloriesMax?: number;
      caloriesMin?: number;
    },
    calorieMode?: "UNDER" | "OVER"
  ): Promise<SearchMealsResponse> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout so loading doesn't hang

    try {
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 Search: query="${query}", radius=${distance} miles, hasLocation=${!!userLocation}`, constraints);
      }

      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          filters: filters,
          macroFilters: macroFilters || undefined,
          calorieMode: calorieMode || undefined,
          isHomepage: true,
          limit: 20,
          ...(searchKey ? { searchKey, isPagination: true, offset: nextOffset ?? 0 } : {}),
          userContext: {
            ...(distance ? { search_distance_miles: distance } : {}),
            ...(userProfile?.diet_type ? { diet_type: userProfile.diet_type } : {}),
            ...(userProfile?.dietary_options ? { dietary_options: userProfile.dietary_options } : {}),
            ...(userLocation ? {
              user_location_lat: userLocation.latitude,
              user_location_lng: userLocation.longitude,
            } : {}),
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      let data: any;
      try {
        data = await res.json();
      } catch (_) {
        throw new Error('Invalid response');
      }

      if (!res.ok) {
        console.error('Search API error:', res.status, data);
        const message = (data && typeof data === 'object' && data.message) ? String(data.message) : null;
        if (res.status === 504) throw new Error(message || 'Request timed out. Please try again.');
        if (res.status === 403 && (data as any)?.usageLimit) throw new Error(message || 'You\'ve reached the free usage limit. Sign up to continue.');
        throw new Error(message || 'Search failed. Please try again.');
      }
      
      let normalizedResults: any[] = [];
      let responseSearchKey: string | undefined;
      let hasMore: boolean = false;
      
      if (Array.isArray(data)) {
        normalizedResults = data;
      } else if (data && typeof data === 'object' && Array.isArray(data.meals)) {
        normalizedResults = data.meals;
        responseSearchKey = data.searchKey;
        hasMore = data.hasMore || false;
      } else if (data && typeof data === 'object' && Array.isArray(data.results)) {
        normalizedResults = data.results;
      }
      
      // Convert to Meal type
      const meals = normalizedResults.map(convertToMeal);
      
      // Filter to only full meals (exclude sides/ingredients)
      const fullMeals = meals.filter((meal: Meal) => {
        // Exclude very low calorie items (likely single ingredients)
        if (meal.calories < 150) return false;
        return true;
      });
      
      return {
        meals: fullMeals,
        searchKey: responseSearchKey,
        hasMore,
        nextOffset: typeof data?.nextOffset === 'number' ? data.nextOffset : undefined,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('timeout');
      }
      throw error;
    }
  };

  const handleFindMeals = async () => {
    setIsLoadingMeals(true);
    setHasSearched(true);
    setSearchError(null);
    setLoadMoreNotice(null);

    try {
      // Check if user can use the feature (gate check BEFORE searching)
      // Timeout after 8s so we never hang forever on auth/network
      const canUse = await Promise.race([
        canUseFeature('search'),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 8000)),
      ]);
      if (!canUse) {
        router.push('/chat');
        return;
      }

      updateActivity();
      setLastSearchParams(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('seekeatz_last_search_params');
      }

      const query = "find meals";
      const calorieMode = macroDirections.calories === "below" ? "UNDER" : "OVER";

      const filters: {
      calories?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
      protein?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
      carbs?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
      fats?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
    } = {};
    
    if (macroEnabled.calories) {
      filters.calories = {
        enabled: true,
        mode: calorieMode === "UNDER" ? "BELOW" : "ABOVE",
        value: macroValues.calories,
      };
    }
    if (macroEnabled.protein) {
      filters.protein = {
        enabled: true,
        mode: macroDirections.protein === "below" ? "BELOW" : "ABOVE",
        value: macroValues.protein,
      };
    }
    if (macroEnabled.carbs) {
      filters.carbs = {
        enabled: true,
        mode: macroDirections.carbs === "below" ? "BELOW" : "ABOVE",
        value: macroValues.carbs,
      };
    }
    if (macroEnabled.fats) {
      filters.fats = {
        enabled: true,
        mode: macroDirections.fats === "below" ? "BELOW" : "ABOVE",
        value: macroValues.fats,
      };
    }
    
    const macroFilters: {
      proteinMin?: number;
      proteinMax?: number;
      carbsMin?: number;
      carbsMax?: number;
      fatsMin?: number;
      fatsMax?: number;
      caloriesMax?: number;
      caloriesMin?: number;
    } = {};
    
    if (filters.calories?.enabled) {
      if (filters.calories.mode === "BELOW") macroFilters.caloriesMax = filters.calories.value;
      else macroFilters.caloriesMin = filters.calories.value;
    }
    if (filters.protein?.enabled) {
      if (filters.protein.mode === "BELOW") macroFilters.proteinMax = filters.protein.value;
      else macroFilters.proteinMin = filters.protein.value;
    }
    if (filters.carbs?.enabled) {
      if (filters.carbs.mode === "BELOW") macroFilters.carbsMax = filters.carbs.value;
      else macroFilters.carbsMin = filters.carbs.value;
    }
    if (filters.fats?.enabled) {
      if (filters.fats.mode === "BELOW") macroFilters.fatsMax = filters.fats.value;
      else macroFilters.fatsMin = filters.fats.value;
    }
    
      setRecommendedMeals([]);
      // Don't block on usage increment (timeout 3s) so search never hangs
      Promise.race([
        incrementUsage('search'),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]).catch(() => {});

      const mealsResult = await searchMeals(query, activeDistance, false, undefined, undefined, undefined, filters, macroFilters, calorieMode);
      const meals = mealsResult.meals || [];

      let filteredMeals = selectedCuisine
        ? meals.filter(meal => mealMatchesCuisine(meal, selectedCuisine))
        : meals;
      filteredMeals = filterMealsByProfile(filteredMeals, userProfile);

      // Build a single diversified ordering across the full valid pool.
      const diversifiedAll = diversifyMealsByRestaurant(filteredMeals);
      setAllSearchMeals(diversifiedAll);

      // Show the first page (4 cards) from the diversified list.
      const newMeals = diversifiedAll.slice(0, HOME_MEALS_PAGE_SIZE);
      setRecommendedMeals(newMeals);

      const searchParams = {
        macroValues: { ...macroValues },
        macroDirections: { ...macroDirections },
        selectedCuisine,
        distance: activeDistance,
        searchKey: mealsResult.searchKey,
        nextOffset: mealsResult.nextOffset,
        hasMore: mealsResult.hasMore ?? false,
      };
      setLastSearchParams(searchParams);
      if (typeof window !== 'undefined') {
        localStorage.setItem('seekeatz_recommended_meals', JSON.stringify(newMeals));
        localStorage.setItem('seekeatz_has_searched', 'true');
        localStorage.setItem('seekeatz_last_search_params', JSON.stringify(searchParams));
      }

      setTimeout(() => {
        mealsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      console.error('Find meals error:', err);
      setRecommendedMeals([]);
      const message = err instanceof Error && err.message === 'timeout'
        ? 'Request timed out. Please try again.'
        : 'Search failed. Please try again.';
      setSearchError(message);
    } finally {
      setIsLoadingMeals(false);
    }
  };

  const handleFindMoreMeals = async () => {
    updateActivity(); // Update activity on button click
    setIsLoadingMeals(true);
    setLoadMoreNotice(null);

    try {
      let workingPool = allSearchMeals;
      let searchState = lastSearchParams;
      let start = recommendedMeals.length;
      let next = workingPool.slice(start, start + HOME_MEALS_PAGE_SIZE);

      if (next.length === 0 && searchState?.hasMore && searchState.searchKey) {
        const calorieMode = macroDirections.calories === "below" ? "UNDER" : "OVER";
        const filters: {
          calories?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
          protein?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
          carbs?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
          fats?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
        } = {};

        if (macroEnabled.calories) {
          filters.calories = {
            enabled: true,
            mode: calorieMode === "UNDER" ? "BELOW" : "ABOVE",
            value: macroValues.calories,
          };
        }
        if (macroEnabled.protein) {
          filters.protein = {
            enabled: true,
            mode: macroDirections.protein === "below" ? "BELOW" : "ABOVE",
            value: macroValues.protein,
          };
        }
        if (macroEnabled.carbs) {
          filters.carbs = {
            enabled: true,
            mode: macroDirections.carbs === "below" ? "BELOW" : "ABOVE",
            value: macroValues.carbs,
          };
        }
        if (macroEnabled.fats) {
          filters.fats = {
            enabled: true,
            mode: macroDirections.fats === "below" ? "BELOW" : "ABOVE",
            value: macroValues.fats,
          };
        }

        const macroFilters: {
          proteinMin?: number;
          proteinMax?: number;
          carbsMin?: number;
          carbsMax?: number;
          fatsMin?: number;
          fatsMax?: number;
          caloriesMax?: number;
          caloriesMin?: number;
        } = {};

        if (filters.calories?.enabled) {
          if (filters.calories.mode === "BELOW") macroFilters.caloriesMax = filters.calories.value;
          else macroFilters.caloriesMin = filters.calories.value;
        }
        if (filters.protein?.enabled) {
          if (filters.protein.mode === "BELOW") macroFilters.proteinMax = filters.protein.value;
          else macroFilters.proteinMin = filters.protein.value;
        }
        if (filters.carbs?.enabled) {
          if (filters.carbs.mode === "BELOW") macroFilters.carbsMax = filters.carbs.value;
          else macroFilters.carbsMin = filters.carbs.value;
        }
        if (filters.fats?.enabled) {
          if (filters.fats.mode === "BELOW") macroFilters.fatsMax = filters.fats.value;
          else macroFilters.fatsMin = filters.fats.value;
        }

        const moreResult = await searchMeals(
          "find meals",
          searchState.distance ?? activeDistance,
          true,
          undefined,
          searchState.searchKey,
          searchState.nextOffset,
          filters,
          macroFilters,
          calorieMode
        );

        const appendedPool = diversifyMealsByRestaurant(
          deduplicateHomeMeals([
            ...workingPool,
            ...moreResult.meals,
          ])
        );

        workingPool = appendedPool;
        setAllSearchMeals(appendedPool);

        const updatedSearchState = {
          ...searchState,
          searchKey: moreResult.searchKey ?? searchState.searchKey,
          nextOffset: moreResult.nextOffset ?? searchState.nextOffset,
          hasMore: moreResult.hasMore ?? false,
        };
        setLastSearchParams(updatedSearchState);
        if (typeof window !== 'undefined') {
          localStorage.setItem('seekeatz_last_search_params', JSON.stringify(updatedSearchState));
        }

        start = recommendedMeals.length;
        next = workingPool.slice(start, start + HOME_MEALS_PAGE_SIZE);
      }

      if (next.length > 0) {
        const updatedMeals = [...recommendedMeals, ...next];
        setRecommendedMeals(updatedMeals);
        if (typeof window !== 'undefined') {
          localStorage.setItem('seekeatz_recommended_meals', JSON.stringify(updatedMeals));
        }
      } else if (!searchState?.hasMore) {
        setLoadMoreNotice(NO_MORE_MEALS_MESSAGE);
        if (typeof window !== 'undefined') {
          window.alert(NO_MORE_MEALS_MESSAGE);
        }
      }
    } finally {
      setIsLoadingMeals(false);
    }
  };

  const canLoadMoreMeals =
    recommendedMeals.length < allSearchMeals.length || Boolean(lastSearchParams?.hasMore);

  // Restore scroll position to specific meal card or saved position
  useEffect(() => {
    if (!containerRef.current || hasRestoredScrollRef.current || recommendedMeals.length === 0) return;
    
    const restoreScroll = () => {
      const container = containerRef.current;
      if (!container || typeof window === 'undefined') return;
      
      const lastClickedMealId = sessionStorage.getItem('seekeatz_last_clicked_meal_id');
      
      if (lastClickedMealId) {
        // Try to find and scroll to the specific meal card
        const mealElement = container.querySelector(`[data-meal-id="${lastClickedMealId}"]`);
        if (mealElement) {
          const containerRect = container.getBoundingClientRect();
          const mealRect = mealElement.getBoundingClientRect();
          const scrollTop = container.scrollTop;
          const targetScroll = scrollTop + mealRect.top - containerRect.top - 100; // 100px offset from top
          
          // Set scroll position immediately and multiple times to ensure it sticks on desktop
          container.scrollTop = targetScroll;
          requestAnimationFrame(() => {
            if (container) container.scrollTop = targetScroll;
            requestAnimationFrame(() => {
              if (container) container.scrollTop = targetScroll;
            });
          });
          
          hasRestoredScrollRef.current = true;
          sessionStorage.removeItem('seekeatz_last_clicked_meal_id');
          return;
        }
      }
      
      // Fallback: restore saved scroll position
      const savedScrollPosition = sessionStorage.getItem('seekeatz_home_scroll_position');
      if (savedScrollPosition) {
        const scrollY = parseFloat(savedScrollPosition);
        container.scrollTop = scrollY;
        // Set multiple times to ensure it sticks on desktop
        requestAnimationFrame(() => {
          if (container) container.scrollTop = scrollY;
          requestAnimationFrame(() => {
            if (container) container.scrollTop = scrollY;
          });
        });
        hasRestoredScrollRef.current = true;
      }
    };
    
    restoreScroll();
    const timeoutId = setTimeout(restoreScroll, 50);
    
    return () => clearTimeout(timeoutId);
  }, [recommendedMeals.length]);

  return (
    <div 
      ref={(el) => {
        containerRef.current = el;
        // Set initial scroll position immediately if we have one (before meals load)
        if (el && !hasRestoredScrollRef.current && typeof window !== 'undefined') {
          const savedScrollPosition = sessionStorage.getItem('seekeatz_home_scroll_position');
          if (savedScrollPosition && recommendedMeals.length === 0) {
            const scrollY = parseFloat(savedScrollPosition);
            el.scrollTop = scrollY;
            requestAnimationFrame(() => {
              if (el) el.scrollTop = scrollY;
            });
          }
        }
      }}
      className="w-full h-full bg-background text-foreground px-4 pb-safe flex flex-col overflow-y-auto relative"
      style={{ 
        paddingTop: `calc(0.75rem + env(safe-area-inset-top, 0px))`,
        paddingBottom: `calc(8rem + env(safe-area-inset-bottom, 0px))`,
        scrollBehavior: 'auto',
      }}
    >
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between mb-2 sm:mb-3">
        <div className="flex items-center">
          <img 
            src="/logos/seekeatz.png" 
            alt="Seekeatz Logo"
            className="h-20 sm:h-24 w-auto object-contain"
          />
        </div>
        <Select
          value={activeDistance.toString()}
          onValueChange={(value) => {
            const miles = Number(value);
            setHomeDistanceOverride(miles);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('seekeatz_home_distance_override', JSON.stringify(miles));
            }
          }}
        >
          <SelectTrigger className="h-7 w-auto min-w-[50px] sm:h-7 sm:min-w-[55px] px-1 sm:px-1.5 rounded-full border-border bg-muted/50 hover:bg-muted text-[10px] font-medium gap-0.5 opacity-90">
            <MapPin className="w-2.5 h-2.5 shrink-0" />
            <SelectValue className="text-[10px]">{activeDistance} mi</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 5, 10, 15, 20].map((distance) => (
              <SelectItem key={distance} value={distance.toString()}>
                {distance} {distance === 1 ? 'mile' : 'miles'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {/* Hero: greeting + tagline – userName from profile or auth (login/signup) */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mb-5 sm:mb-6 text-center"
      >
        <p className="text-sm sm:text-base mb-0.5 bg-gradient-to-r from-[#3A8BFF] via-[#4DDDF9] to-[#3A8BFF] bg-clip-text text-transparent font-medium">
          {getGreeting()}, <span className="font-semibold">{userName}</span>
        </p>
        <p className="text-lg sm:text-xl font-semibold bg-gradient-to-r from-[#3A8BFF] via-[#4DDDF9] to-[#3A8BFF] bg-clip-text text-transparent">
          Set your macros. We&apos;ll find the meals.
        </p>
      </motion.section>

      {/* Main content: plate only */}
      <main className="relative z-10 flex-1 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="w-full flex justify-center items-center py-6 sm:py-8"
        >
          <div className="relative overflow-visible">
            <PlateSelector
              macro={macro}
              value={currentValue}
              config={config}
            />
          </div>
        </motion.div>

        {/* Macro tabs */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
          className="mt-6 sm:mt-8 flex gap-2 sm:gap-5 flex-nowrap justify-center"
        >
          {(["calories", "protein", "carbs", "fats"] as MacroType[]).map(
            (type) => {
              const isActive = macro === type;
              const isPopoverOpen = openPopover === type;
              const isEnabled = macroEnabled[type];
              const isCalories = type === "calories";
              const currentDirection = macroDirections[type];
              
              return (
                <Popover
                  key={type}
                  open={isPopoverOpen}
                  onOpenChange={(open) => {
                    if (!open) {
                      setOpenPopover(null);
                    } else {
                      setOpenPopover(type);
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      onClick={() => handleMacroChange(type)}
                      className={`px-2.5 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-base font-medium transition-all relative flex-shrink-0 ${
                        isActive
                          ? "bg-gradient-to-r from-[#3A8BFF] to-[#4DDDF9] text-white shadow-md shadow-[#3A8BFF]/30"
                          : !isEnabled
                          ? "bg-slate-200/60 dark:bg-slate-700/40 text-muted-foreground border border-border/50 opacity-60"
                          : "bg-cyan-500/15 dark:bg-cyan-500/20 text-foreground border border-cyan-400/40 dark:border-cyan-400/30 hover:bg-cyan-500/25"
                      }`}
                    >
                      {MACRO_CONFIG[type].label}
                      {currentDirection === "above" && (
                        <span className="ml-0.5 sm:ml-1 text-xs opacity-75">↑</span>
                      )}
                      {currentDirection === "below" && (
                        <span className="ml-0.5 sm:ml-1 text-xs opacity-75">↓</span>
                      )}
                      {!isEnabled && (
                        <span className="ml-0.5 sm:ml-1 text-xs opacity-75">✕</span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent 
                    side="top" 
                    align="center"
                    className="w-auto p-2"
                    sideOffset={8}
                  >
                    <div className="flex flex-col gap-1">
                      {/* All macros: direction (Above/Below) + Exclude */}
                      <button
                        onClick={() => handleDirectionChange(type, "above")}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          currentDirection === "above"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-muted/80 text-foreground"
                        }`}
                      >
                        Above (≥)
                      </button>
                      <button
                        onClick={() => handleDirectionChange(type, "below")}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          currentDirection === "below"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-muted/80 text-foreground"
                        }`}
                      >
                        Below (≤)
                      </button>
                      <button
                        onClick={() => handleToggleExclude(type)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                          !isEnabled
                            ? "bg-destructive text-destructive-foreground"
                            : "bg-muted hover:bg-muted/80 text-foreground"
                        }`}
                      >
                        {isEnabled ? "Exclude" : "Include"}
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            }
          )}
        </motion.div>

        {/* Ruler slider – always visible */}
        <div className="mt-2 sm:mt-3 w-full max-w-md">
          <RulerSlider
            min={config.min}
            max={config.max}
            step={config.step}
            value={currentValue}
            onChange={handleValueChange}
          />
        </div>

        {/* CTA */}
        <motion.button
          type="button"
          onClick={handleFindMeals}
          disabled={isLoadingMeals}
          whileHover={!isLoadingMeals ? { scale: 1.02 } : {}}
          whileTap={!isLoadingMeals ? { scale: 0.98 } : {}}
          className="mt-3 sm:mt-4 w-full max-w-md h-12 sm:h-14 rounded-2xl bg-gradient-to-r from-[#3A8BFF] to-[#4DDDF9] text-white text-sm sm:text-base font-semibold flex items-center justify-center gap-2 shadow-lg shadow-[#3A8BFF]/30 hover:shadow-[#3A8BFF]/40 hover:opacity-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoadingMeals ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Finding Meals...
            </>
          ) : (
            "Find Meals That Match"
          )}
        </motion.button>
        {searchError && (
          <p className="mt-3 text-sm text-destructive text-center max-w-md mx-auto px-4">
            {searchError}
          </p>
        )}
      </main>

      {/* Recommended Meals Section */}
      {(hasSearched || recommendedMeals.length > 0) && (
        <section ref={mealsSectionRef} className="relative z-10 w-full mt-6 sm:mt-8 mb-24 bg-background">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 px-4 text-foreground">
            Recommended Meals
          </h2>
          
          {isLoadingMeals && recommendedMeals.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#4DDDF9]" />
            </div>
          ) : recommendedMeals.length > 0 ? (
            <>
              <div className="px-4 grid grid-cols-2 gap-3 sm:gap-4 items-stretch">
                {recommendedMeals.map((meal) => (
                  <div key={meal.id} data-meal-id={meal.id} className="h-full">
                    <MealCard
                      meal={meal}
                      isFavorite={favoriteMeals.includes(meal.id)}
                      userProfile={userProfile}
                      loggedMeals={loggedMeals}
                      onClick={() => {
                        // Save scroll position and meal ID before navigating to meal detail
                        if (containerRef.current && typeof window !== 'undefined') {
                          sessionStorage.setItem('seekeatz_home_scroll_position', containerRef.current.scrollTop.toString());
                          sessionStorage.setItem('seekeatz_last_clicked_meal_id', meal.id);
                        }
                        onMealSelect(meal);
                      }}
                      onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(meal.id, meal) : undefined}
                    />
                  </div>
                ))}
              </div>
              
              {/* Find More Meals Button */}
              <div className="mt-6 px-4 pb-24" style={{ paddingBottom: `calc(2rem + env(safe-area-inset-bottom, 0px))` }}>
                <button
                  onClick={handleFindMoreMeals}
                  disabled={isLoadingMeals || !canLoadMoreMeals}
                  className="w-full max-w-md mx-auto h-12 sm:h-14 rounded-2xl bg-muted border border-border text-sm sm:text-[15px] font-medium text-foreground flex items-center justify-center gap-2 hover:bg-muted/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingMeals ? (
                    <>
                      <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                      Finding More Meals...
                    </>
                  ) : !canLoadMoreMeals ? (
                    <>All matching meals shown</>
                  ) : (
                    <>
                      <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                      Find More Meals
                    </>
                  )}
                </button>
                {loadMoreNotice && (
                  <p className="mt-3 text-sm text-muted-foreground text-center max-w-md mx-auto">
                    {loadMoreNotice}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-12 px-4 pb-24" style={{ paddingBottom: `calc(3rem + env(safe-area-inset-bottom, 0px))` }}>
              <p className="text-muted-foreground">
                No meals found within {activeDistance} {activeDistance === 1 ? 'mile' : 'miles'}. Try adjusting your distance or macros.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

type PlateSelectorProps = {
  macro: MacroType;
  value: number;
  config: MacroConfig;
};

function PlateSelector({ macro, value, config }: PlateSelectorProps) {
  return (
    <div className="mt-0 sm:mt-1 relative">
      <div className="relative h-40 w-40 sm:h-52 sm:w-52 mx-auto flex items-center justify-center">
        {/* Plate: outer rim – raised edge like a real plate */}
        <div
          className="absolute inset-0 rounded-full dark:hidden"
          style={{
            background: 'linear-gradient(145deg, #f5f5f5 0%, #e8e8e8 40%, #d4d4d4 100%)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.9)',
            border: '3px solid rgba(255,255,255,0.9)',
          }}
        />
        {/* Dark mode plate */}
        <div
          className="absolute inset-0 rounded-full dark:block hidden"
          style={{
            background: 'linear-gradient(145deg, #475569 0%, #334155 40%, #1e293b 100%)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)',
            border: '3px solid rgba(255,255,255,0.15)',
          }}
        />
        {/* Inner well – recessed center (the “food” area) */}
        <div
          className="absolute inset-5 sm:inset-7 rounded-full dark:hidden"
          style={{
            background: 'linear-gradient(180deg, #fafafa 0%, #f0f0f0 100%)',
            boxShadow: 'inset 0 6px 20px rgba(0,0,0,0.12), inset 0 -2px 8px rgba(255,255,255,0.6)',
            border: '2px solid rgba(0,0,0,0.06)',
          }}
        />
        <div
          className="absolute inset-5 sm:inset-7 rounded-full hidden dark:block"
          style={{
            background: 'linear-gradient(180deg, #334155 0%, #1e293b 100%)',
            boxShadow: 'inset 0 6px 20px rgba(0,0,0,0.4), inset 0 -2px 8px rgba(255,255,255,0.03)',
            border: '2px solid rgba(255,255,255,0.06)',
          }}
        />
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center">
          <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-0.5 font-medium">
            {config.label}
          </span>
          <div className="flex items-baseline gap-1">
            <AnimatedNumber
              value={value}
              suffix={config.unit ? ` ${config.unit}` : ""}
              className="text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-slate-100 drop-shadow-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

type RulerSliderProps = {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (val: number) => void;
};

function RulerSlider({ min, max, step, value, onChange }: RulerSliderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<HTMLDivElement[]>([]);
  const scrollEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const transformUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUserScrollingRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const isHoveredRef = useRef(false);
  const lastScrollPositionRef = useRef<number>(0);
  
  const values = useMemo(() => {
    const arr: number[] = [];
    for (let v = min; v <= max; v += step) {
      arr.push(v);
    }
    return arr;
  }, [min, max, step]);

  // Update transforms only when needed (debounced, not continuous)
  const updateTransforms = () => {
    const container = containerRef.current;
    if (!container) return;
    
    const containerCenter = container.clientWidth / 2;
    const scrollLeft = container.scrollLeft;
    
    itemRefs.current.forEach((el, idx) => {
      if (!el) return;
      
      const elCenter = el.offsetLeft + el.offsetWidth / 2;
      const distanceFromCenter = (scrollLeft + containerCenter) - elCenter;
      
      // Normalize distance based on container width for curved effect
      const normalizedDistance = distanceFromCenter / (container.clientWidth * 0.5);
      const clampedDistance = Math.max(-1, Math.min(1, normalizedDistance));
      
      // Calculate properties for curved scale effect
      const absDist = Math.abs(clampedDistance);
      const scale = 0.5 + (1 - absDist) * 1.0; // Reduced to 1.0 max to prevent overlap
      const rotationY = clampedDistance * 35;
      const translateZ = (1 - absDist) * 60;
      const translateY = -absDist * absDist * 12;
      const opacity = 0.35 + (1 - absDist) * 0.65;
      
      // Apply transforms - use CSS transitions for smooth updates
      el.style.transform = `perspective(1000px) rotateY(${rotationY}deg) scale(${scale}) translateZ(${translateZ}px) translateY(${translateY}px)`;
      el.style.opacity = opacity.toString();
    });
  };

  // Debounced transform update - only runs when scroll position changes significantly
  const scheduleTransformUpdate = () => {
    if (transformUpdateTimeoutRef.current) {
      clearTimeout(transformUpdateTimeoutRef.current);
    }
    
    // Update immediately for responsive feel, but throttle rapid updates
    updateTransforms();
    
    transformUpdateTimeoutRef.current = setTimeout(() => {
      updateTransforms();
    }, 16); // ~60fps throttle
  };

  // scroll to current value on mount / macro change (only if not user scrolling)
  useEffect(() => {
    if (isUserScrollingRef.current || isProgrammaticScrollRef.current) return;
    
    const idx = values.indexOf(value);
    if (idx === -1) return;
    const container = containerRef.current;
    const el = itemRefs.current[idx];
    if (!container || !el) return;
    
      // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      if (!container || !el) return;
      isProgrammaticScrollRef.current = true;
      
      // Use getBoundingClientRect for precise positioning (same as handleScrollEnd)
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      
      // Calculate the center of the visible scroll container (where the arrow is)
      const containerCenterX = containerRect.left + containerRect.width / 2;
      
      // Calculate the element's center in screen coordinates
      const elCenterX = elRect.left + elRect.width / 2;
      
      // Calculate the offset needed to align centers
      const offsetX = elCenterX - containerCenterX;
      
      // Convert screen offset to scroll offset and apply
      const targetScroll = container.scrollLeft + offsetX;
      
      // Use scrollLeft directly for instant positioning
      container.scrollLeft = targetScroll;
      
      // Update transforms after scroll
      requestAnimationFrame(() => {
        updateTransforms();
      });
      
      // Reset flag after scroll completes
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 100);
    });
  }, [value, values]);

  // Initial transform update on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    // Wait for layout to settle
    requestAnimationFrame(() => {
      updateTransforms();
    });
  }, [values]);

  const findClosestValue = () => {
    const container = containerRef.current;
    if (!container) return null;
    
    // Get the container's bounding rect to find the true visual center (where the arrow is)
    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.left + containerRect.width / 2;

    let closestIdx = 0;
    let closestDist = Infinity;

    // Find the number closest to the arrow center
    // This works even when stopped exactly between two numbers
    itemRefs.current.forEach((el, idx) => {
      if (!el) return;
      // Get the element's absolute center position
      const elRect = el.getBoundingClientRect();
      const elCenter = elRect.left + elRect.width / 2;
      // Calculate distance from arrow center to number center
      const dist = Math.abs(elCenter - containerCenter);
      // Always find the closest one (handles ties by keeping the first closest found)
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = idx;
      }
    });

    return { idx: closestIdx, value: values[closestIdx] };
  };

  // Only called when scroll ends - no manual snapping during scroll
  const handleScrollEnd = () => {
    if (isProgrammaticScrollRef.current) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    // Always find the closest number to the arrow center
    // This handles cases where scroll stops exactly between two numbers
    const closest = findClosestValue();
    if (!closest) return;
    
    const el = itemRefs.current[closest.idx];
    if (!el) return;
    
    // Use getBoundingClientRect for precise positioning
    // This accounts for all transforms, padding, and positioning
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    
    // Calculate the center of the visible scroll container (where the arrow is)
    const containerCenterX = containerRect.left + containerRect.width / 2;
    
    // Calculate the element's center in screen coordinates
    const elCenterX = elRect.left + elRect.width / 2;
    
    // Calculate the offset needed to align centers
    // This is the difference in screen coordinates
    const offsetX = elCenterX - containerCenterX;
    
    // Convert screen offset to scroll offset and apply
    // We need to scroll by the offset amount to align the centers
    const targetScroll = container.scrollLeft + offsetX;
    
    // Snap instantly to exact position using scrollLeft for immediate positioning
    // This always snaps to the closest number, even if stopped between two numbers
    isProgrammaticScrollRef.current = true;
    container.scrollLeft = targetScroll;
    isProgrammaticScrollRef.current = false;
    
    // Update transforms immediately for visual feedback (synchronously, no RAF delay)
    updateTransforms();
    
    // Always update value to match the closest number (even if already correct, ensures sync)
    if (closest.value !== value) {
      onChange(closest.value);
    }
  };

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    
    // Mark that user is actively scrolling
    if (!isUserScrollingRef.current) {
      isUserScrollingRef.current = true;
      setIsScrolling(true);
    }
    
    // Update transforms during scroll (throttled)
    scheduleTransformUpdate();
    
    // Clear any pending scroll end handlers
    if (scrollEndTimeoutRef.current) {
      clearTimeout(scrollEndTimeoutRef.current);
      scrollEndTimeoutRef.current = null;
    }
    
    // Update last scroll position
    const currentPos = container.scrollLeft;
    lastScrollPositionRef.current = currentPos;
    
    // Use a very short timeout for immediate snap detection
    scrollEndTimeoutRef.current = setTimeout(() => {
      // Double-check that scroll position hasn't changed (handles momentum scrolling)
      const newPos = container.scrollLeft;
      if (Math.abs(newPos - lastScrollPositionRef.current) < 0.5) {
        // Scroll has truly stopped - snap immediately
        isUserScrollingRef.current = false;
        setIsScrolling(false);
        handleScrollEnd();
      } else {
        // Still scrolling, check again
        lastScrollPositionRef.current = newPos;
        scrollEndTimeoutRef.current = setTimeout(() => {
          isUserScrollingRef.current = false;
          setIsScrolling(false);
          handleScrollEnd();
        }, 5); // Very short second check
      }
    }, 10); // Very short initial delay (10ms)
  };

  const handleClick = (idx: number) => {
    const container = containerRef.current;
    const el = itemRefs.current[idx];
    if (!container || !el) return;
    
    isProgrammaticScrollRef.current = true;
    
    // Use getBoundingClientRect for precise positioning (same as handleScrollEnd)
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    
    // Calculate the center of the visible scroll container (where the arrow is)
    const containerCenterX = containerRect.left + containerRect.width / 2;
    
    // Calculate the element's center in screen coordinates
    const elCenterX = elRect.left + elRect.width / 2;
    
    // Calculate the offset needed to align centers
    const offsetX = elCenterX - containerCenterX;
    
    // Convert screen offset to scroll offset and apply
    const targetScroll = container.scrollLeft + offsetX;
    
    // Use scrollLeft directly for instant positioning
    container.scrollLeft = targetScroll;
    onChange(values[idx]);
    
    // Update transforms after scroll
    requestAnimationFrame(() => {
      updateTransforms();
    });
    
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 100);
  };

  // Handle wheel events - only prevent default when hovering over the component
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseEnter = () => {
      isHoveredRef.current = true;
    };

    const handleMouseLeave = () => {
      isHoveredRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      // Only handle wheel events when hovering over the component
      if (!isHoveredRef.current) {
        return; // Let the event bubble for normal page scrolling - DO NOT prevent default
      }

      // Check if this is primarily a vertical scroll (deltaY > deltaX)
      const isVerticalScroll = Math.abs(e.deltaY) > Math.abs(e.deltaX);
      
      if (isVerticalScroll) {
        // Check if the container can actually scroll in the direction we want
        const { scrollLeft, scrollWidth, clientWidth } = container;
        const canScrollLeft = scrollLeft > 0;
        const canScrollRight = scrollLeft < scrollWidth - clientWidth - 1;
        
        // Only prevent default if we can actually scroll the container
        // If at bounds, let the event bubble for normal page scrolling
        if ((e.deltaY < 0 && canScrollLeft) || (e.deltaY > 0 && canScrollRight)) {
          e.preventDefault();
          container.scrollLeft += e.deltaY;
          handleScroll();
        }
        // If at bounds, don't prevent default - let page scroll normally
      }
      // For horizontal scroll, don't prevent default - allow native behavior
    };

    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrollEndTimeoutRef.current) {
        clearTimeout(scrollEndTimeoutRef.current);
      }
      if (transformUpdateTimeoutRef.current) {
        clearTimeout(transformUpdateTimeoutRef.current);
      }
    };
  }, []);


  return (
    <div className="relative overflow-hidden" style={{ minHeight: '120px', height: '120px', paddingBottom: '8px' }}> {/* Fixed height to prevent layout shifts, padding for arrow */}
      {/* Curved background arc - old-time scale effect */}
      <div 
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[300%] h-24 sm:h-32 rounded-full border-2 border-border/30 opacity-40 z-0" 
        style={{ 
          transform: 'perspective(500px) rotateX(65deg) scaleY(0.25)',
          transformOrigin: 'center top',
        }} 
      />
      {/* Additional depth arc */}
      <div 
        className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 w-[250%] h-20 sm:h-28 rounded-full border border-[#4DDDF9]/15 opacity-30 z-0" 
        style={{ 
          transform: 'perspective(600px) rotateX(70deg) scaleY(0.2)',
          transformOrigin: 'center top',
        }} 
      />

      {/* Fixed center arrow indicator - points up to show selected number */}
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center">
        {/* Arrow point - clean design without shading */}
        <div 
          style={{
            width: 0,
            height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderBottom: '11px solid #4DDDF9',
          }}
        />
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="overflow-x-auto no-scrollbar px-4 sm:px-6 py-6 sm:py-8"
        style={{ 
          perspective: '800px',
          transformStyle: 'preserve-3d',
          scrollSnapType: 'none', // Disable CSS scroll snap - we handle it in JS for immediate control
          scrollBehavior: 'auto', // Use auto for native momentum (smooth causes issues)
          WebkitOverflowScrolling: 'touch', // Momentum scrolling on iOS
          overscrollBehavior: 'auto', // Allow scroll chaining when not at bounds
          // Prevent layout shifts
          contain: 'layout style paint',
        }}
      >
        <div 
          className="relative flex gap-5 sm:gap-6 items-center"
          style={{
            transformStyle: 'preserve-3d',
            minWidth: 'max-content', // Ensure proper width calculation
            height: '100%', // Fixed height to prevent shifts
            paddingRight: '50%', // Add padding to allow last item to scroll to center
            paddingLeft: '50%', // Add padding to allow first item to scroll to center
          }}
        >
          {values.map((val, idx) => {
            const isActive = val === value;
            
            return (
              <div
                key={val}
                ref={(el) => {
                  if (el) itemRefs.current[idx] = el;
                }}
                className="flex flex-col items-center cursor-pointer select-none"
                onClick={() => handleClick(idx)}
                style={{ 
                  scrollSnapAlign: 'center', // CSS scroll snap
                  scrollSnapStop: 'normal', // Allow momentum scrolling (changed from 'always')
                  willChange: 'transform', // Optimize for transforms
                  // Increased width and spacing to prevent overlap
                  minWidth: '52px',
                  width: '52px', // Increased from 48px for better spacing
                  flexShrink: 0,
                  height: '100%', // Fixed height
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  // Smooth transitions for transforms (not during active scroll)
                  transition: isScrolling ? 'none' : 'transform 0.2s ease-out, opacity 0.2s ease-out',
                }}
              >
                {/* tick with enhanced glow when active - use transform only, no height changes */}
                <div
                  className="w-[2px] rounded-full mb-2 sm:mb-3 relative dark:bg-white/30 bg-foreground/30"
                  style={{
                    height: '12px', // Fixed height to prevent layout shifts
                    transform: isActive ? 'scaleY(2.5)' : 'scaleY(1)', // Use transform, not height
                    backgroundColor: isActive ? '#4DDDF9' : undefined,
                    boxShadow: isActive ? '0 0 12px rgba(77,221,249,1)' : 'none',
                    willChange: 'transform',
                    transition: isScrolling ? 'none' : 'transform 0.2s ease-out, background-color 0.2s ease-out, box-shadow 0.2s ease-out',
                  }}
                />
                {/* number with enhanced styling - fixed size to prevent layout shifts */}
                <span
                  className={`font-bold ${isActive ? 'text-[#4DDDF9]' : 'text-muted-foreground'}`}
                  style={{
                    fontSize: isActive ? '1.05rem' : '0.75rem',
                    // Remove glow so numbers stay razor-sharp, especially on dark backgrounds.
                    textShadow: 'none',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                    willChange: 'font-size, color',
                    lineHeight: '1.2',
                    minHeight: '1.05rem',
                    display: 'inline-block',
                    transition: isScrolling
                      ? 'none'
                      : 'font-size 0.2s ease-out, color 0.2s ease-out',
                  }}
                >
                  {val}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
