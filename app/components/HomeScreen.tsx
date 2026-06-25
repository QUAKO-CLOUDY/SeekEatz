"use client";

import Image from "next/image";
import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { createClient } from "@/utils/supabase/client";
import { MealCard } from "./MealCard";
import type { UserProfile, Meal } from "../types";
import { getRestaurantLogoUrl } from "@/lib/image-utils";
import { useSessionActivity } from "../hooks/useSessionActivity";
import { normalizeMacros } from "@/lib/macro-utils";
import { motion } from "framer-motion";
import { AnimatedNumber } from "./AnimatedNumber";
import { diversifyMealsByRestaurant } from "@/lib/restaurant-diversity";
import { getStoredLocation, ensureSearchLocation, resetPendingLocationRequest } from "@/lib/location";
import {
  buildNearbySearchRequestFields,
  persistNearbyCacheFromResponse,
} from "@/lib/nearby-search-client";
import type { NearbyCacheResponse } from "../types";
import { markInflightLoading, registerAppRequestReset } from "@/lib/app-suspend-recovery";
import { SearchRadiusSelect } from "./SearchRadiusSelect";
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
  calories: { label: "Calories", min: 350, max: 2000, step: 50 },
  protein: { label: "Protein", unit: "g", min: 0, max: 100, step: 5 },
  carbs: { label: "Carbs", unit: "g", min: 0, max: 100, step: 10 },
  fats: { label: "Fats", unit: "g", min: 0, max: 100, step: 5 },
};

const HOME_SEARCH_STATUS_MESSAGES = [
  "Scanning menus...",
  "Matching your macros...",
  "Ranking best fits...",
];

function formatMacroConstraint(type: MacroType, value: number, direction: Direction): string {
  const roundedValue = Math.round(value);
  const arrow = direction === "below" ? "↓" : "↑";

  if (type === "calories") {
    return `${arrow} ${roundedValue} calories`;
  }

  const unit = MACRO_CONFIG[type].unit ?? "";
  return `${arrow} ${roundedValue}${unit} ${MACRO_CONFIG[type].label.toLowerCase()}`;
}

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
  onUsageLimitReached?: () => void;
  isPremium?: boolean;
};

type SearchMealsResponse = {
  meals: Meal[];
  searchKey?: string;
  hasMore?: boolean;
  nextOffset?: number;
  message?: string;
};

  type ApiMealResult = {
    id?: string;
    item_name?: string;
    name?: string;
    restaurant_name?: string;
    category?: string;
    restaurantLogoUrl?: string;
    restaurant_logo_url?: string;
    logo_url?: string;
  macros?: unknown;
  calories?: number;
  protein?: number;
  protein_g?: number;
  carbs?: number;
  carbs_g?: number;
  fats?: number;
  fat?: number;
  fats_g?: number;
  fat_g?: number;
  price?: number | null;
  price_estimate?: number | null;
  description?: string;
  dietary_tags?: string[];
  tags?: string[];
  rating?: number;
  distance?: number;
};

type SearchApiResponse = {
  meals?: ApiMealResult[];
  results?: ApiMealResult[];
  searchKey?: string;
  hasMore?: boolean;
  nextOffset?: number;
  message?: string;
  usageLimit?: boolean;
  nearbyCache?: NearbyCacheResponse;
};

const NO_MORE_MEALS_MESSAGE =
  "There are no more meals that fit these constraints in our database. Please change the restrictions to get access to more mealcards.";
const HOME_MEALS_PAGE_SIZE = 4;
const MAX_HOME_SEARCH_PAGES = 20;
const APPENDED_MEALS_DIVIDER_LABEL = "More meals";
const DEFAULT_HOME_DISTANCE_MILES = 15;
const FREE_SEARCH_LIMIT_MESSAGE = "You've used your 2 free searches for the day. Please come back in 24 hours when your 2 searches reset.";

function createHomeSearchShuffleNonce(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}
const HOME_MACRO_VALUES_SESSION_KEY = "seekeatz_home_macro_values_v2";
const DEFAULT_HOME_MACRO_ENABLED: Record<MacroType, boolean> = {
  calories: true,
  protein: true,
  carbs: true,
  fats: true,
};

function snapMacroValue(type: MacroType, rawValue: number): number {
  const { min, max, step } = MACRO_CONFIG[type];
  const clamped = Math.min(max, Math.max(min, rawValue));
  const snapped = min + Math.round((clamped - min) / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

function buildDefaultMacroValues(userProfile: UserProfile): Record<MacroType, number> {
  void userProfile;
  return {
    calories: 1000,
    protein: 50,
    carbs: 50,
    fats: 50,
  };
}

function getInitialMacroValues(userProfile: UserProfile): Record<MacroType, number> {
  const defaults = buildDefaultMacroValues(userProfile);

  if (typeof window === "undefined") {
    return defaults;
  }

  const saved = sessionStorage.getItem(HOME_MACRO_VALUES_SESSION_KEY);
  if (!saved) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(saved) as Partial<Record<MacroType, number>>;
    return {
      calories: snapMacroValue("calories", parsed.calories ?? defaults.calories),
      protein: snapMacroValue("protein", parsed.protein ?? defaults.protein),
      carbs: snapMacroValue("carbs", parsed.carbs ?? defaults.carbs),
      fats: snapMacroValue("fats", parsed.fats ?? defaults.fats),
    };
  } catch (error) {
    console.error("Failed to parse saved macro values:", error);
    return defaults;
  }
}

export function HomeScreen({ userProfile, onMealSelect, favoriteMeals = [], onToggleFavorite, loggedMeals = [], onUsageLimitReached, isPremium = false }: Props) {
  const { updateActivity } = useSessionActivity();
  
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
  
  // Keep macro changes for the current app session, but always start new sessions at a centered 1000 calories.
  const [macroValues, setMacroValues] = useState<Record<MacroType, number>>(() =>
    getInitialMacroValues(userProfile)
  );

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

  // Include all macro filters by default. User exclusions are still persisted once changed.
  const [macroEnabled, setMacroEnabled] = useState<Record<MacroType, boolean>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('seekeatz_macro_enabled');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            calories: parsed.calories !== false,
            protein: parsed.protein !== false,
            carbs: parsed.carbs !== false,
            fats: parsed.fats !== false,
          };
        } catch (e) {
          console.error('Failed to parse saved macro enabled state:', e);
        }
      }
    }
    return DEFAULT_HOME_MACRO_ENABLED;
  });

  // State for which popover is open
  const [openPopover, setOpenPopover] = useState<MacroType | null>(null);

  // Load persisted meals and search state
  const [recommendedMeals, setRecommendedMeals] = useState<Meal[]>([]);
  const [allSearchMeals, setAllSearchMeals] = useState<Meal[]>([]);
  
  const [isLoadingMeals, setIsLoadingMeals] = useState(false);
  const [loadingStatusIndex, setLoadingStatusIndex] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Ref to track the main container for scroll position
  const containerRef = useRef<HTMLDivElement>(null);
  const mealsSectionRef = useRef<HTMLDivElement>(null);
  const hasRestoredScrollRef = useRef(false);
  const homeSearchAbortRef = useRef<AbortController | null>(null);
  const isLoadingMealsRef = useRef(isLoadingMeals);

  useEffect(() => {
    isLoadingMealsRef.current = isLoadingMeals;
  }, [isLoadingMeals]);

  const resetHomeSearchState = useCallback((reason: string) => {
    console.log(`[HomeScreen] resetHomeSearchState (${reason})`);
    resetPendingLocationRequest();
    if (homeSearchAbortRef.current) {
      try {
        homeSearchAbortRef.current.abort();
      } catch {
        // ignore
      }
      homeSearchAbortRef.current = null;
    }
    setIsLoadingMeals(false);
  }, []);

  useEffect(() => {
    return registerAppRequestReset((reason) => {
      resetHomeSearchState(reason);
    });
  }, [resetHomeSearchState]);
  
  // Prevent browser scroll restoration
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    if (!isLoadingMeals) {
      setLoadingStatusIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setLoadingStatusIndex((current) => (current + 1) % HOME_SEARCH_STATUS_MESSAGES.length);
    }, 1400);

    return () => window.clearInterval(intervalId);
  }, [isLoadingMeals]);
  
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
    
    let scrollTimeout: ReturnType<typeof setTimeout>;
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

  // Keep home aligned with the rest of the app when the profile distance is missing.
  const activeDistance = homeDistanceOverride ?? userProfile.search_distance_miles ?? DEFAULT_HOME_DISTANCE_MILES;

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
      if (typeof window !== "undefined") {
        sessionStorage.setItem(HOME_MACRO_VALUES_SESSION_KEY, JSON.stringify(updated));
      }
      return updated;
    });
  };

  // Note: We no longer auto-clear meals when preferences change.
  // Meals are only updated when the user explicitly clicks "Find meals that match this".

  // Convert API result to Meal type
  // API returns meals with normalized macros: calories, protein, carbs, fats
  const convertToMeal = (item: ApiMealResult): Meal => {
    const category = item.category === 'Grocery' || item.category === 'Hot Bar' 
      ? 'grocery' as const 
      : 'restaurant' as const;

    const mealName = item.item_name || item.name || 'Unknown Item';
    const restaurantName = item.restaurant_name || 'Unknown Restaurant';
    
    const imageUrl = getRestaurantLogoUrl(
      restaurantName,
      item.restaurantLogoUrl || item.restaurant_logo_url || item.logo_url
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
      restaurantLogoUrl: imageUrl,
      price: item.price ?? item.price_estimate ?? undefined,
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
  const filterMealsByProfile = (meals: Meal[], _profile: UserProfile): Meal[] => {
    void _profile;
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

  const buildEmptyStateMessage = (distance: number, constraintSummary?: string): string => {
    if (constraintSummary) {
      return userLocation
        ? `No meals found for ${constraintSummary} within ${distance} ${distance === 1 ? 'mile' : 'miles'}. Try relaxing your macros or increasing the radius.`
        : `No meals found for ${constraintSummary}. Enable location or relax your macros.`;
    }

    return userLocation
      ? `No meals found within ${distance} ${distance === 1 ? 'mile' : 'miles'}. Try increasing the radius.`
      : 'No meals found. Enable location or adjust your search filters.';
  };

  const requestLocationForNearbySearch = useCallback(async () => {
    if (userLocation) {
      return userLocation;
    }

    const location = await ensureSearchLocation();
    if (!location) {
      return null;
    }

    const nextLocation = {
      latitude: location.latitude,
      longitude: location.longitude,
    };
    setUserLocation(nextLocation);
    return nextLocation;
  }, [userLocation]);


  const searchMeals = async (
    query: string, 
    distance?: number, 
    _append = false,
    constraints: unknown = undefined, // Legacy parameter (deprecated)
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
    calorieMode?: "UNDER" | "OVER",
    locationOverride?: { latitude: number; longitude: number } | null
  ): Promise<SearchMealsResponse> => {
    void _append;
    if (homeSearchAbortRef.current) {
      try {
        homeSearchAbortRef.current.abort();
      } catch {
        // ignore
      }
    }
    const controller = new AbortController();
    homeSearchAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout so loading doesn't hang
    const effectiveLocation = locationOverride ?? userLocation;

    try {
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 Search: query="${query}", radius=${distance} miles, hasLocation=${!!effectiveLocation}`, constraints);
      }

      const nearbyFields =
        effectiveLocation && distance && !searchKey
          ? buildNearbySearchRequestFields(
              effectiveLocation.latitude,
              effectiveLocation.longitude,
              distance,
            )
          : {};

      const res = await authenticatedFetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          ...(distance ? { radius_miles: distance } : {}),
          ...(effectiveLocation ? { location: 'near me' } : {}),
          filters: filters,
          macroFilters: macroFilters || undefined,
          calorieMode: calorieMode || undefined,
          isHomepage: true,
          limit: HOME_MEALS_PAGE_SIZE,
          ...(searchKey
            ? { searchKey, isPagination: true, offset: nextOffset ?? 0 }
            : { shuffleNonce: createHomeSearchShuffleNonce() }),
          ...nearbyFields,
          ...(effectiveLocation ? {
            user_location_lat: effectiveLocation.latitude,
            user_location_lng: effectiveLocation.longitude,
          } : {}),
          userContext: {
            ...(distance ? { search_distance_miles: distance } : {}),
            ...(userProfile?.diet_type ? { diet_type: userProfile.diet_type } : {}),
            ...(userProfile?.dietary_options ? { dietary_options: userProfile.dietary_options } : {}),
            ...(effectiveLocation ? {
              user_location_lat: effectiveLocation.latitude,
              user_location_lng: effectiveLocation.longitude,
            } : {}),
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      let data: SearchApiResponse | ApiMealResult[];
      try {
        data = await res.json();
      } catch {
        throw new Error('Invalid response');
      }

      if (!res.ok) {
        console.error('Search API error:', res.status, data);
        const message = !Array.isArray(data) && data?.message ? String(data.message) : null;
        if (res.status === 504) throw new Error(message || 'Request timed out. Please try again.');
        if (res.status === 403 && !Array.isArray(data) && data?.usageLimit) {
          const usageError = new Error(FREE_SEARCH_LIMIT_MESSAGE);
          (usageError as Error & { usageLimit?: boolean }).usageLimit = true;
          throw usageError;
        }
        throw new Error(message || 'Search failed. Please try again.');
      }
      
      let normalizedResults: ApiMealResult[] = [];
      let responseSearchKey: string | undefined;
      let hasMore: boolean = false;
      const responseMessage = !Array.isArray(data) && typeof data?.message === 'string' ? data.message : undefined;
      const responseNextOffset = !Array.isArray(data) && typeof data?.nextOffset === 'number' ? data.nextOffset : undefined;
      
      if (Array.isArray(data)) {
        normalizedResults = data;
      } else if (data && typeof data === 'object' && Array.isArray(data.meals)) {
        normalizedResults = data.meals;
        responseSearchKey = data.searchKey;
        hasMore = data.hasMore || false;
      } else if (data && typeof data === 'object' && Array.isArray(data.results)) {
        normalizedResults = data.results;
      }
      
      // Trust server-side radius filtering; avoid double-filtering by distance on the client.
      const meals = normalizedResults.map(convertToMeal);

      if (!Array.isArray(data) && data?.nearbyCache) {
        persistNearbyCacheFromResponse(data.nearbyCache);
      }
      
      return {
        meals,
        searchKey: responseSearchKey,
        hasMore,
        nextOffset: responseNextOffset,
        message: responseMessage,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (homeSearchAbortRef.current === controller) {
        homeSearchAbortRef.current = null;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('timeout');
      }
      throw error;
    }
  };

  const buildActiveMacroSearchFilters = () => {
    const calorieMode: "UNDER" | "OVER" = macroDirections.calories === "below" ? "UNDER" : "OVER";

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

    return { calorieMode, filters, macroFilters };
  };

  const handleFindMeals = async () => {
    if (isLoadingMeals) {
      resetHomeSearchState('find-meals-retry');
    }
    markInflightLoading(true);
    setIsLoadingMeals(true);
    setHasSearched(true);
    setSearchError(null);
    setLoadMoreNotice(null);

    try {
      updateActivity();
      setLastSearchParams(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('seekeatz_last_search_params');
      }

      const resolvedLocation = await requestLocationForNearbySearch();
      const query = "find meals";
      const { calorieMode, filters, macroFilters } = buildActiveMacroSearchFilters();

      setRecommendedMeals([]);
      let mealsResult = await searchMeals(
        query,
        activeDistance,
        false,
        undefined,
        undefined,
        undefined,
        filters,
        macroFilters,
        calorieMode,
        resolvedLocation,
      );

      let filteredMeals = selectedCuisine
        ? mealsResult.meals.filter((meal) => mealMatchesCuisine(meal, selectedCuisine))
        : mealsResult.meals;
      filteredMeals = filterMealsByProfile(filteredMeals, userProfile);

      let pagesFetched = 0;
      while (
        filteredMeals.length < HOME_MEALS_PAGE_SIZE &&
        mealsResult.hasMore &&
        mealsResult.searchKey &&
        pagesFetched < MAX_HOME_SEARCH_PAGES
      ) {
        pagesFetched += 1;
        const moreResult = await searchMeals(
          query,
          activeDistance,
          true,
          undefined,
          mealsResult.searchKey,
          mealsResult.nextOffset,
          filters,
          macroFilters,
          calorieMode,
          resolvedLocation,
        );

        let nextPageMeals = selectedCuisine
          ? moreResult.meals.filter((meal) => mealMatchesCuisine(meal, selectedCuisine))
          : moreResult.meals;
        nextPageMeals = filterMealsByProfile(nextPageMeals, userProfile);

        if (nextPageMeals.length === 0) {
          break;
        }

        const previousCount = filteredMeals.length;
        filteredMeals = deduplicateHomeMeals([...filteredMeals, ...nextPageMeals]);
        mealsResult = {
          ...mealsResult,
          searchKey: moreResult.searchKey ?? mealsResult.searchKey,
          nextOffset: moreResult.nextOffset ?? mealsResult.nextOffset,
          hasMore: moreResult.hasMore ?? false,
          message: mealsResult.message ?? moreResult.message,
        };

        if (filteredMeals.length === previousCount) {
          break;
        }
      }

      const diversifiedAll = diversifyMealsByRestaurant(filteredMeals);
      setAllSearchMeals(diversifiedAll);

      const newMeals = diversifiedAll.slice(0, HOME_MEALS_PAGE_SIZE);
      setRecommendedMeals(newMeals);

      const searchParams = {
        macroValues: { ...macroValues },
        macroDirections: { ...macroDirections },
        macroEnabled: { ...macroEnabled },
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

      if (newMeals.length === 0) {
        setSearchError(
          mealsResult.message ||
          buildEmptyStateMessage(activeDistance, resultsConstraintSummary || undefined)
        );
      } else if (mealsResult.message) {
        setLoadMoreNotice(mealsResult.message);
      }

      setTimeout(() => {
        mealsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      console.error('Find meals error:', err);
      setRecommendedMeals([]);
      if (err instanceof Error && (err as Error & { usageLimit?: boolean }).usageLimit) {
        if (!isPremium) {
          onUsageLimitReached?.();
          setSearchError(FREE_SEARCH_LIMIT_MESSAGE);
        } else {
          setSearchError('Search failed. Please try again.');
        }
        return;
      }

      const message = err instanceof Error && err.message === 'timeout'
        ? 'Request timed out. Please try again.'
        : 'Search failed. Please try again.';
      setSearchError(message);
    } finally {
      markInflightLoading(false);
      setIsLoadingMeals(false);
    }
  };

  const handleFindMoreMeals = async () => {
    if (isLoadingMeals) {
      resetHomeSearchState('load-more-retry');
    }
    updateActivity();
    markInflightLoading(true);
    setIsLoadingMeals(true);
    setLoadMoreNotice(null);

    try {
      let workingPool = allSearchMeals;
      const searchState = lastSearchParams;
      let workingSearchState = searchState
        ? {
            searchKey: searchState.searchKey,
            nextOffset: searchState.nextOffset,
            hasMore: searchState.hasMore,
            distance: searchState.distance,
          }
        : null;

      let start = recommendedMeals.length;
      let next = workingPool.slice(start, start + HOME_MEALS_PAGE_SIZE);
      const { calorieMode, filters, macroFilters } = buildActiveMacroSearchFilters();

      let loadMorePagesFetched = 0;
      while (
        next.length < HOME_MEALS_PAGE_SIZE &&
        workingSearchState?.hasMore &&
        workingSearchState.searchKey &&
        loadMorePagesFetched < MAX_HOME_SEARCH_PAGES
      ) {
        loadMorePagesFetched += 1;
        const moreResult = await searchMeals(
          "find meals",
          workingSearchState.distance ?? activeDistance,
          true,
          undefined,
          workingSearchState.searchKey,
          workingSearchState.nextOffset,
          filters,
          macroFilters,
          calorieMode
        );

        let appendedMeals = selectedCuisine
          ? moreResult.meals.filter((meal) => mealMatchesCuisine(meal, selectedCuisine))
          : moreResult.meals;
        appendedMeals = filterMealsByProfile(appendedMeals, userProfile);

        workingPool = deduplicateHomeMeals([...workingPool, ...appendedMeals]);
        setAllSearchMeals(workingPool);

        workingSearchState = {
          ...workingSearchState,
          searchKey: moreResult.searchKey ?? workingSearchState.searchKey,
          nextOffset: moreResult.nextOffset ?? workingSearchState.nextOffset,
          hasMore: moreResult.hasMore ?? false,
        };

        const updatedSearchState = {
          ...(searchState ?? {
            macroValues: { ...macroValues },
            macroDirections: { ...macroDirections },
            macroEnabled: { ...macroEnabled },
            selectedCuisine,
          }),
          distance: workingSearchState.distance ?? activeDistance,
          searchKey: workingSearchState.searchKey,
          nextOffset: workingSearchState.nextOffset,
          hasMore: workingSearchState.hasMore,
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
      } else if (!workingSearchState?.hasMore) {
        setLoadMoreNotice(NO_MORE_MEALS_MESSAGE);
        if (typeof window !== 'undefined') {
          window.alert(NO_MORE_MEALS_MESSAGE);
        }
      }
    } catch (err) {
      console.error('Find more meals error:', err);
      if (err instanceof Error && (err as Error & { usageLimit?: boolean }).usageLimit) {
        if (!isPremium) {
          onUsageLimitReached?.();
          setSearchError(FREE_SEARCH_LIMIT_MESSAGE);
        } else {
          setSearchError('Failed to load more meals. Please try again.');
        }
        return;
      }
      const message = err instanceof Error && err.message === 'timeout'
        ? 'Request timed out. Please try again.'
        : 'Failed to load more meals. Please try again.';
      setSearchError(message);
    } finally {
      markInflightLoading(false);
      setIsLoadingMeals(false);
    }
  };
  const canLoadMoreMeals =
    recommendedMeals.length < allSearchMeals.length || Boolean(lastSearchParams?.hasMore);
  const shouldShowInlineSearchError =
    Boolean(searchError) && !(hasSearched && recommendedMeals.length === 0);


  const resultsConstraintSummary = useMemo(() => {
    const searchMacroValues = lastSearchParams?.macroValues ?? macroValues;
    const searchMacroEnabled = lastSearchParams?.macroEnabled ?? macroEnabled;
    const searchMacroDirections = (lastSearchParams?.macroDirections as Partial<Record<MacroType, Direction>> | undefined) ?? macroDirections;

    const orderedTypes: MacroType[] = ["calories", "protein", "carbs", "fats"];
    const parts = orderedTypes
      .filter((type) => searchMacroEnabled?.[type] !== false)
      .map((type) => {
        const value = searchMacroValues?.[type];
        const direction = searchMacroDirections?.[type] ?? "below";

        if (typeof value !== "number") {
          return null;
        }

        return formatMacroConstraint(type, value, direction);
      })
      .filter((part): part is string => Boolean(part));

    return parts.join(" / ");
  }, [lastSearchParams, macroDirections, macroEnabled, macroValues]);

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
      className="relative flex h-full w-full flex-col overflow-y-auto bg-background px-3 pb-safe text-foreground sm:px-4"
      style={{ 
        paddingTop: `calc(0.75rem + env(safe-area-inset-top, 0px))`,
        paddingBottom: `calc(var(--app-nav-safe-offset) + 2rem)`,
        scrollBehavior: 'auto',
      }}
    >
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between mb-2 sm:mb-3">
        <div className="flex items-center">
          <Image
            src="/logos/seekeatz.png"
            alt="Seekeatz Logo"
            width={160}
            height={96}
            className="h-20 sm:h-24 w-auto object-contain"
          />
        </div>
        <SearchRadiusSelect
          value={activeDistance}
          onValueChange={(miles) => {
            setHomeDistanceOverride(miles);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('seekeatz_home_distance_override', JSON.stringify(miles));
            }
            setRecommendedMeals([]);
            setAllSearchMeals([]);
            setSearchError(null);
            setLoadMoreNotice(null);
          }}
        />
      </header>

      {/* Hero: greeting + tagline – userName from profile or auth (login/signup) */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mb-4 sm:mb-5 text-center"
      >
        <p className="bg-gradient-to-r from-[#0369A1] via-[#0891B2] to-[#1D4ED8] bg-clip-text text-base font-bold tracking-tight text-transparent sm:text-lg">
          {getGreeting()}, <span className="font-bold">{userName}</span>
        </p>
      </motion.section>

      {/* Main content: unified search system */}
      <main className="relative z-10 flex-1 flex flex-col items-center">
        <motion.section
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-3xl rounded-[2rem] border border-border/70 bg-card/80 px-4 py-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-md sm:px-8 sm:py-7"
        >
          <div className="flex flex-col items-center text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:text-xs">
              Build Your Search
            </p>
            <p className="mt-1 text-sm text-muted-foreground sm:text-[15px]">
              Set your calorie target, choose your macros, then find matching meals.
            </p>
          </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="w-full flex justify-center items-center pt-4 pb-4 sm:pt-5 sm:pb-5"
        >
          <div className="relative overflow-visible p-3">
            <PlateSelector
              value={currentValue}
              config={config}
              isLoading={isLoadingMeals}
            />
          </div>
        </motion.div>

        {/* Macro tabs */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
          data-tutorial-target="home-macro-tabs"
          className="mx-auto flex w-fit max-w-full flex-wrap justify-center gap-2 sm:gap-4"
        >
          {(["calories", "protein", "carbs", "fats"] as MacroType[]).map(
            (type) => {
              const isActive = macro === type;
              const isPopoverOpen = openPopover === type;
              const isEnabled = macroEnabled[type];
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
                          : "bg-gradient-to-r from-[#3A8BFF]/85 to-[#4DDDF9]/85 text-white border border-cyan-300/70 shadow-sm shadow-[#3A8BFF]/20 hover:from-[#3A8BFF] hover:to-[#4DDDF9]"
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
        <div className="mt-3 sm:mt-4 w-full max-w-md mx-auto">
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
          whileHover={!isLoadingMeals ? { scale: 1.02 } : {}}
          whileTap={!isLoadingMeals ? { scale: 0.98 } : {}}
          className="mt-4 sm:mt-5 w-full max-w-md mx-auto h-12 sm:h-14 rounded-2xl bg-gradient-to-r from-[#3A8BFF] to-[#4DDDF9] text-white text-sm sm:text-base font-semibold flex items-center justify-center gap-2 shadow-lg shadow-[#3A8BFF]/30 hover:shadow-[#3A8BFF]/40 hover:opacity-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
        {isLoadingMeals && (
          <motion.p
            key={loadingStatusIndex}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mt-3 text-center text-sm font-medium text-muted-foreground"
          >
            {HOME_SEARCH_STATUS_MESSAGES[loadingStatusIndex]}
          </motion.p>
        )}
        {shouldShowInlineSearchError && (
          <p className="mt-3 text-sm text-destructive text-center max-w-md mx-auto px-4">
            {searchError}
          </p>
        )}
        </motion.section>
      </main>

      {/* Recommended Meals Section */}
      {(hasSearched || recommendedMeals.length > 0) && (
        <section ref={mealsSectionRef} className="relative z-10 w-full mt-6 sm:mt-8 mb-24 bg-background">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="mb-6 px-4"
          >
            <div className="flex items-center gap-3 pb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Meals matched to
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="mx-auto max-w-2xl rounded-2xl border border-border/70 bg-card px-4 py-3 text-center shadow-sm sm:px-6">
              <p className="text-sm sm:text-base font-semibold leading-relaxed text-foreground">
                {resultsConstraintSummary || "Your current macro targets"}
              </p>
            </div>
          </motion.div>
          
          {isLoadingMeals && recommendedMeals.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#4DDDF9]" />
            </div>
          ) : recommendedMeals.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-3 px-2 sm:gap-5 sm:px-4">
                {recommendedMeals.map((meal, index) => (
                  <React.Fragment key={meal.id}>
                    {index === HOME_MEALS_PAGE_SIZE && (
                      <div className="col-span-2 flex items-center gap-3 pt-3 pb-1">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                          {APPENDED_MEALS_DIVIDER_LABEL}
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div data-meal-id={meal.id} className="h-full">
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
                  </React.Fragment>
                ))}
              </div>
              
              {/* Find More Meals Button */}
              <div className="mt-6 px-4 pb-24" style={{ paddingBottom: `calc(2rem + env(safe-area-inset-bottom, 0px))` }}>
                <button
                  onClick={handleFindMoreMeals}
                  disabled={!canLoadMoreMeals}
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
                {searchError ?? buildEmptyStateMessage(activeDistance, resultsConstraintSummary || undefined)}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

type PlateSelectorProps = {
  value: number;
  config: MacroConfig;
  isLoading?: boolean;
};

function PlateSelector({ value, config, isLoading = false }: PlateSelectorProps) {
  return (
    <div className="mt-0 sm:mt-1 relative">
      <div
        className="relative h-40 w-40 sm:h-52 sm:w-52 mx-auto flex items-center justify-center"
      >
        <motion.div
          animate={isLoading ? { rotate: 360 } : { rotate: 0 }}
          transition={isLoading ? { duration: 1.15, repeat: Infinity, ease: "linear" } : { duration: 0.35, ease: "easeOut" }}
          className="absolute inset-0"
          style={{ transformOrigin: "50% 50%" }}
        >
        {/* Plate: outer rim – raised edge like a real plate */}
        <div
          className="absolute inset-0 rounded-full dark:hidden"
          style={{
            background: 'radial-gradient(circle at 34% 28%, rgba(255,255,255,0.98) 0%, rgba(243,244,246,0.98) 32%, rgba(219,223,230,1) 68%, rgba(186,192,201,1) 100%)',
            boxShadow: '0 16px 42px rgba(15,23,42,0.16), 0 6px 18px rgba(15,23,42,0.08), inset 0 2px 1px rgba(255,255,255,0.95), inset 0 -6px 12px rgba(148,163,184,0.25)',
            border: '3px solid rgba(255,255,255,0.94)',
          }}
        />
        {/* Dark mode plate */}
        <div
          className="absolute inset-0 rounded-full dark:block hidden"
          style={{
            background: 'radial-gradient(circle at 35% 28%, rgba(100,116,139,0.96) 0%, rgba(71,85,105,0.98) 36%, rgba(30,41,59,1) 74%, rgba(15,23,42,1) 100%)',
            boxShadow: '0 16px 44px rgba(2,6,23,0.42), inset 0 2px 1px rgba(255,255,255,0.08), inset 0 -8px 14px rgba(15,23,42,0.45)',
            border: '3px solid rgba(255,255,255,0.15)',
          }}
        />
        <div
          className="absolute inset-[10px] sm:inset-[14px] rounded-full dark:hidden"
          style={{
            border: '1.5px solid rgba(255,255,255,0.75)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
          }}
        />
        <div
          className="absolute inset-[10px] sm:inset-[14px] rounded-full hidden dark:block"
          style={{
            border: '1.5px solid rgba(255,255,255,0.08)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        />
        {/* Inner well – recessed center (the “food” area) */}
        <div
          className="absolute inset-5 sm:inset-7 rounded-full dark:hidden"
          style={{
            background: 'radial-gradient(circle at 50% 32%, rgba(255,255,255,0.98) 0%, rgba(249,250,251,0.98) 44%, rgba(234,237,242,0.98) 100%)',
            boxShadow: 'inset 0 10px 22px rgba(148,163,184,0.18), inset 0 -3px 10px rgba(255,255,255,0.72)',
            border: '2px solid rgba(148,163,184,0.14)',
          }}
        />
        <div
          className="absolute inset-5 sm:inset-7 rounded-full hidden dark:block"
          style={{
            background: 'radial-gradient(circle at 50% 32%, rgba(71,85,105,0.82) 0%, rgba(30,41,59,0.96) 58%, rgba(15,23,42,1) 100%)',
            boxShadow: 'inset 0 10px 22px rgba(2,6,23,0.42), inset 0 -3px 10px rgba(255,255,255,0.03)',
            border: '2px solid rgba(255,255,255,0.06)',
          }}
        />
        {isLoading && (
          <div className="absolute inset-[8px] sm:inset-[12px] rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,transparent_248deg,rgba(37,99,235,0.10)_302deg,rgba(8,145,178,0.22)_326deg,rgba(77,221,249,0.34)_344deg,transparent_360deg)]" />
        )}
        {isLoading && (
          <div className="absolute inset-[18px] sm:inset-[24px] rounded-full border border-[#0891B2]/18" />
        )}
        {isLoading && (
          <div className="absolute inset-[28px] sm:inset-[38px] rounded-full border border-[#2563EB]/14" />
        )}
        </motion.div>
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
  const arrowRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const tickRefs = useRef<Array<HTMLDivElement | null>>([]);
  const scrollEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transformUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const getArrowCenterInContainer = useCallback((container: HTMLDivElement): number => {
    const arrowEl = arrowRef.current;
    if (!arrowEl) return container.clientWidth / 2;

    const containerRect = container.getBoundingClientRect();
    const arrowRect = arrowEl.getBoundingClientRect();
    return (arrowRect.left + arrowRect.width / 2) - containerRect.left;
  }, []);

  const getTickAnchorCenter = useCallback((idx: number): number | null => {
    const itemEl = itemRefs.current[idx];
    if (!itemEl) return null;

    const tickEl = tickRefs.current[idx];
    if (!tickEl) return itemEl.offsetLeft + itemEl.offsetWidth / 2;

    return itemEl.offsetLeft + tickEl.offsetLeft + tickEl.offsetWidth / 2;
  }, []);

  const getTickVisualCenterX = useCallback((idx: number): number | null => {
    const tickEl = tickRefs.current[idx];
    if (!tickEl) return null;
    const tickRect = tickEl.getBoundingClientRect();
    return tickRect.left + tickRect.width / 2;
  }, []);

  const updateTransforms = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerCenter = getArrowCenterInContainer(container);
    const scrollLeft = container.scrollLeft;

    itemRefs.current.forEach((el, idx) => {
      if (!el) return;

      const elCenter = getTickAnchorCenter(idx) ?? (el.offsetLeft + el.offsetWidth / 2);
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
  }, [getArrowCenterInContainer, getTickAnchorCenter]);

  // Debounced transform update - only runs when scroll position changes significantly
  const scheduleTransformUpdate = useCallback(() => {
    if (transformUpdateTimeoutRef.current) {
      clearTimeout(transformUpdateTimeoutRef.current);
    }

    // Update immediately for responsive feel, but throttle rapid updates
    updateTransforms();
    
    transformUpdateTimeoutRef.current = setTimeout(() => {
      updateTransforms();
    }, 16); // ~60fps throttle
  }, [updateTransforms]);

  const alignIndexToArrow = useCallback((idx: number, emitValue = false) => {
    const container = containerRef.current;
    const el = itemRefs.current[idx];
    if (!container || !el) return;

    isProgrammaticScrollRef.current = true;

    // First pass: logical center alignment.
    const arrowCenterInContainer = getArrowCenterInContainer(container);
    const elCenter = getTickAnchorCenter(idx) ?? (el.offsetLeft + el.offsetWidth / 2);
    container.scrollLeft = elCenter - arrowCenterInContainer;
    updateTransforms();

    // Second pass: visual correction using rendered tick center (accounts for perspective).
    requestAnimationFrame(() => {
      const arrowEl = arrowRef.current;
      const activeContainer = containerRef.current;
      if (!arrowEl || !activeContainer) {
        isProgrammaticScrollRef.current = false;
        return;
      }

      const tickVisualCenterX = getTickVisualCenterX(idx);
      if (tickVisualCenterX !== null) {
        const arrowRect = arrowEl.getBoundingClientRect();
        const arrowVisualCenterX = arrowRect.left + arrowRect.width / 2;
        const correction = tickVisualCenterX - arrowVisualCenterX;
        if (Math.abs(correction) > 0.2) {
          activeContainer.scrollLeft += correction;
          updateTransforms();
        }
      }

      if (emitValue && values[idx] !== value) {
        onChange(values[idx]);
      }

      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    });
  }, [getArrowCenterInContainer, getTickAnchorCenter, getTickVisualCenterX, onChange, updateTransforms, value, values]);

  // scroll to current value on mount / macro change (only if not user scrolling)
  const centerIndex = useCallback((idx: number) => {
    if (isUserScrollingRef.current || isProgrammaticScrollRef.current) return;
    alignIndexToArrow(idx, false);
  }, [alignIndexToArrow]);

  useEffect(() => {
    const idx = values.indexOf(value);
    if (idx === -1) return;
    centerIndex(idx);
  }, [centerIndex, value, values]);

  // Initial transform update on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    // Wait for layout to settle
    requestAnimationFrame(() => {
      updateTransforms();
    });
  }, [updateTransforms, values]);

  const findClosestValue = useCallback(() => {
    const container = containerRef.current;
    if (!container) return null;
    
    const arrowCenterInContainer = getArrowCenterInContainer(container);
    const contentCenter = container.scrollLeft + arrowCenterInContainer;

    let closestIdx = 0;
    let closestDist = Infinity;

    const arrowEl = arrowRef.current;
    const arrowRect = arrowEl?.getBoundingClientRect();
    const arrowVisualCenterX = arrowRect ? arrowRect.left + arrowRect.width / 2 : null;

    // Find closest by visual tick center when available.
    itemRefs.current.forEach((el, idx) => {
      if (!el) return;
      const tickVisualCenterX = getTickVisualCenterX(idx);
      const dist = arrowVisualCenterX !== null && tickVisualCenterX !== null
        ? Math.abs(tickVisualCenterX - arrowVisualCenterX)
        : Math.abs((getTickAnchorCenter(idx) ?? (el.offsetLeft + el.offsetWidth / 2)) - contentCenter);
      // Always find the closest one (handles ties by keeping the first closest found)
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = idx;
      }
    });

    return { idx: closestIdx, value: values[closestIdx] };
  }, [getArrowCenterInContainer, getTickAnchorCenter, getTickVisualCenterX, values]);

  // Only called when scroll ends - no manual snapping during scroll
  const handleScrollEnd = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    // Always find the closest number to the arrow center
    // This handles cases where scroll stops exactly between two numbers
    const closest = findClosestValue();
    if (!closest) return;
    
    alignIndexToArrow(closest.idx, true);
  }, [alignIndexToArrow, findClosestValue]);

  const scheduleSnapToClosest = useCallback((delayMs = 80) => {
    if (snapTimeoutRef.current) {
      clearTimeout(snapTimeoutRef.current);
      snapTimeoutRef.current = null;
    }

    snapTimeoutRef.current = setTimeout(() => {
      handleScrollEnd();
    }, delayMs);
  }, [handleScrollEnd]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Ignore programmatic alignment scroll events to avoid snap-feedback loops.
    if (isProgrammaticScrollRef.current) {
      scheduleTransformUpdate();
      return;
    }
    
    // Mark that user is actively scrolling
    if (!isUserScrollingRef.current) {
      isUserScrollingRef.current = true;
      setIsScrolling(true);
    }
    
    // Update transforms during scroll (throttled)
    scheduleTransformUpdate();
    
    if (scrollEndTimeoutRef.current) {
      clearTimeout(scrollEndTimeoutRef.current);
      scrollEndTimeoutRef.current = null;
    }
    
    // Update last scroll position
    const currentPos = container.scrollLeft;
    lastScrollPositionRef.current = currentPos;
    
    // Short timeout to detect end of momentum scrolling.
    scrollEndTimeoutRef.current = setTimeout(() => {
      // Double-check that scroll position hasn't changed (handles momentum scrolling)
      const newPos = container.scrollLeft;
      if (Math.abs(newPos - lastScrollPositionRef.current) < 0.5) {
        // Scroll has truly stopped - snap immediately
        isUserScrollingRef.current = false;
        setIsScrolling(false);
        scheduleSnapToClosest(0);
      } else {
        // Still scrolling, check again
        lastScrollPositionRef.current = newPos;
        scrollEndTimeoutRef.current = setTimeout(() => {
          isUserScrollingRef.current = false;
          setIsScrolling(false);
          scheduleSnapToClosest(0);
        }, 12);
      }
    }, 24);
  }, [scheduleSnapToClosest, scheduleTransformUpdate]);

  const handleClick = (idx: number) => {
    alignIndexToArrow(idx, true);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseEnter = () => {
      isHoveredRef.current = true;
    };

    const handleMouseLeave = () => {
      isHoveredRef.current = false;
    };
    const handlePointerRelease = () => {
      scheduleSnapToClosest(40);
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
    container.addEventListener('pointerup', handlePointerRelease);
    container.addEventListener('touchend', handlePointerRelease, { passive: true });

    return () => {
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('pointerup', handlePointerRelease);
      container.removeEventListener('touchend', handlePointerRelease);
    };
  }, [handleScroll, scheduleSnapToClosest]);

  useEffect(() => {
    return () => {
      if (scrollEndTimeoutRef.current) {
        clearTimeout(scrollEndTimeoutRef.current);
      }
      if (snapTimeoutRef.current) {
        clearTimeout(snapTimeoutRef.current);
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
      <div
        ref={arrowRef}
        className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex w-[14px] flex-col items-center"
      >
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
          contain: 'layout style paint',
        }}
      >
        <div 
          className="relative flex gap-5 sm:gap-6 items-center"
          style={{
            transformStyle: 'preserve-3d',
            minWidth: 'max-content',
            height: '100%',
            paddingRight: '50%',
            paddingLeft: '50%',
          }}
        >
          {values.map((val, idx) => {
            const isActive = val === value;
            
            return (
              <div
                key={val}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                className="flex flex-col items-center cursor-pointer select-none"
                onClick={() => handleClick(idx)}
                style={{ 
                  scrollSnapAlign: 'center', // CSS scroll snap
                  scrollSnapStop: 'normal', // Allow momentum scrolling (changed from 'always')
                  willChange: 'transform',
                  minWidth: '52px',
                  width: '52px',
                  flexShrink: 0,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: isScrolling ? 'none' : 'transform 0.2s ease-out, opacity 0.2s ease-out',
                }}
              >
                <div
                  ref={(el) => {
                    tickRefs.current[idx] = el;
                  }}
                  className="w-[2px] rounded-full mb-2 sm:mb-3 relative dark:bg-white/30 bg-foreground/30"
                  style={{
                    height: '12px',
                    transform: isActive ? 'scaleY(2.5)' : 'scaleY(1)',
                    backgroundColor: isActive ? '#4DDDF9' : undefined,
                    boxShadow: isActive ? '0 0 12px rgba(77,221,249,1)' : 'none',
                    willChange: 'transform',
                    transition: isScrolling ? 'none' : 'transform 0.2s ease-out, background-color 0.2s ease-out, box-shadow 0.2s ease-out',
                  }}
                />
                <span
                  className={`font-bold ${isActive ? 'text-[#4DDDF9]' : 'text-muted-foreground'}`}
                  style={{
                    fontSize: isActive ? '1.05rem' : '0.75rem',
                    textShadow: 'none',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                    fontVariantNumeric: 'tabular-nums',
                    willChange: 'font-size, color',
                    lineHeight: '1.2',
                    minHeight: '1.05rem',
                    display: 'inline-block',
                    width: '100%',
                    textAlign: 'center',
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
