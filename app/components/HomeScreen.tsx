"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { Search, Loader2, MapPin } from "lucide-react";
import { MealCard } from "./MealCard";
import type { UserProfile, Meal } from "../types";
import { getMealImageUrl } from "@/lib/image-utils";
import { useSessionActivity } from "../hooks/useSessionActivity";
import { normalizeMacros } from "@/lib/macro-utils";
import { canUseFeature, incrementUsage } from "@/lib/usage-gate";
import { useRouter } from "next/navigation";
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

const CUISINES = [
  { id: "mexican", label: "Mexican", icon: "🌮" },
  { id: "american", label: "American", icon: "🍔" },
  { id: "japanese", label: "Japanese", icon: "🍣" },
  { id: "thai", label: "Thai", icon: "🍜" },
  { id: "mediterranean", label: "Mediterranean", icon: "🥙" },
  { id: "greek", label: "Greek", icon: "🫒" },
  { id: "chinese", label: "Chinese", icon: "🥟" },
  { id: "indian", label: "Indian", icon: "🍛" },
  { id: "italian", label: "Italian", icon: "🍝" },
  { id: "vegan", label: "Vegan", icon: "🌱" },
];

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

export function HomeScreen({ userProfile, onMealSelect, favoriteMeals = [], onToggleFavorite, loggedMeals = [] }: Props) {
  const { updateActivity } = useSessionActivity();
  const router = useRouter();
  
  // Extract first name from user profile
  const getUserFirstName = () => {
    const name = userProfile?.full_name || "";
    if (!name) return "Friend";
    const firstName = name.trim().split(/\s+/)[0];
    return firstName || name;
  };

  const userName = getUserFirstName();
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('seekeatz_selected_cuisine');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
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

  // Initialize direction preferences (above/below for calories only)
  // Protein, carbs, fats are always minimums (no direction toggle)
  const [macroDirections, setMacroDirections] = useState<Record<"calories", Direction>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('seekeatz_macro_directions');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Only keep calories direction
          return { calories: parsed.calories || "below" };
        } catch (e) {
          console.error('Failed to parse saved macro directions:', e);
        }
      }
    }
    // Default to 'below' for calories
    return {
      calories: "below",
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
  
  const [isLoadingMeals, setIsLoadingMeals] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
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

  const handleDirectionChange = (direction: Direction) => {
    // Only calories has direction (above/below)
    setMacroDirections({ calories: direction });
    // Persist to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('seekeatz_macro_directions', JSON.stringify({ calories: direction }));
    }
    // Close popover after selection
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

  // Persist selected cuisine
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('seekeatz_selected_cuisine', JSON.stringify(selectedCuisine));
    }
  }, [selectedCuisine]);

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

  // Check if a meal matches the selected cuisine
  const mealMatchesCuisine = (meal: Meal, cuisineId: string | null): boolean => {
    if (!cuisineId) return true; // No filter if no cuisine selected
    
    const cuisine = CUISINES.find(c => c.id === cuisineId);
    if (!cuisine) return true;
    
    const cuisineLabel = cuisine.label.toLowerCase();
    const mealText = `${meal.name} ${meal.restaurant} ${meal.description || ''} ${(meal.dietary_tags || []).join(' ')}`.toLowerCase();
    
    // Check if cuisine name appears in meal text
    let matches = mealText.includes(cuisineLabel.toLowerCase());
    
    // Special case: Japanese cuisine should also match "sushi"
    if (cuisineId === "japanese" && !matches) {
      matches = mealText.includes("sushi");
    }
    
    return matches;
  };

  // Diet filtering removed - all diet logic disabled
  // This function is kept for compatibility but returns meals unchanged
  const filterMealsByProfile = (meals: Meal[], profile: UserProfile): Meal[] => {
    // All diet filtering removed - return meals unchanged
    return meals;
  };

  // Get user location (if available)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Request user location on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
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
    searchKey?: string, // Optional searchKey for pagination (undefined for new searches)
    filters?: {
      calories?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
      protein?: { enabled: boolean; min: number };
      carbs?: { enabled: boolean; min: number };
      fats?: { enabled: boolean; min: number };
    },
    macroFilters?: {
      proteinMin?: number;
      carbsMin?: number;
      fatsMin?: number;
      caloriesMax?: number;
      caloriesMin?: number;
    },
    calorieMode?: "UNDER" | "OVER"
  ): Promise<Meal[] | { meals: Meal[]; searchKey?: string; hasMore?: boolean }> => {
    try {
      // Log search parameters for debugging (dev only)
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 Search: query="${query}", radius=${distance} miles, hasLocation=${!!userLocation}`, constraints);
      }

      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query, 
          radius_miles: distance,
          // NEW: Structured filters payload (preferred format)
          filters: filters,
          // Legacy: Structured macroFilters payload (for backward compatibility)
          macroFilters: macroFilters || undefined,
          calorieMode: calorieMode || undefined,
          isHomepage: true, // Flag for homepage-specific logic
          // Only include searchKey for pagination (not for new searches)
          ...(searchKey ? { searchKey, isPagination: true } : {}),
          // Use new format: user_location_lat and user_location_lng
          ...(userLocation ? {
            user_location_lat: userLocation.latitude,
            user_location_lng: userLocation.longitude,
          } : {}),
        }),
      });
      
      const data = await res.json();
      
      // Normalize API response - return full response object if available
      let normalizedResults: any[] = [];
      let responseSearchKey: string | undefined;
      let hasMore: boolean = false;
      
      if (Array.isArray(data)) {
        normalizedResults = data;
      } else if (data && typeof data === 'object' && Array.isArray(data.meals)) {
        // New format: { meals, hasMore, nextOffset, searchKey }
        normalizedResults = data.meals;
        responseSearchKey = data.searchKey;
        hasMore = data.hasMore || false;
      } else if (data && typeof data === 'object' && Array.isArray(data.results)) {
        // Legacy format support
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
      
      // Return full response object if searchKey is present (for pagination)
      if (responseSearchKey || hasMore) {
        return {
          meals: fullMeals,
          searchKey: responseSearchKey,
          hasMore,
        };
      }
      
      // Return array for backward compatibility
      return fullMeals;
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  };

  const handleFindMeals = async () => {
    // Check if user can use the feature (gate check BEFORE searching)
    const canUse = await canUseFeature('search');
    if (!canUse) {
      // Limit reached - redirect to chat to show gate message
      router.push('/chat');
      return;
    }
    
    updateActivity(); // Update activity on button click
    setIsLoadingMeals(true);
    setHasSearched(true);
    
    // Clear pagination state when filters change (new search, not pagination)
    // This ensures old searchKey doesn't persist with new constraints
    setLastSearchParams(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('seekeatz_last_search_params');
    }
    
    // Build minimal query (no macro text - backend uses structured constraints)
    const cuisinePart = selectedCuisine 
      ? ` ${CUISINES.find(c => c.id === selectedCuisine)?.label.toLowerCase()}` 
      : "";
    const query = `find meals${cuisinePart}`.trim();
    
    // NEW SEMANTICS (locked in):
    // - Protein, Carbs, Fats are MINIMUMS (>=) - no direction toggle
    // - Calories is user-selectable: UNDER (<=) or OVER (>=) based on calorieMode
    const calorieMode = macroDirections.calories === "below" ? "UNDER" : "OVER";
    
    // Build structured filters payload with enabled flags
    const filters: {
      calories?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
      protein?: { enabled: boolean; min: number };
      carbs?: { enabled: boolean; min: number };
      fats?: { enabled: boolean; min: number };
    } = {};
    
    // Calories filter
    if (macroEnabled.calories) {
      filters.calories = {
        enabled: true,
        mode: calorieMode === "UNDER" ? "BELOW" : "ABOVE",
        value: macroValues.calories,
      };
    }
    
    // Protein, Carbs, Fats are always MINIMUMS (>=) when enabled
    if (macroEnabled.protein) {
      filters.protein = {
        enabled: true,
        min: macroValues.protein,
      };
    }
    if (macroEnabled.carbs) {
      filters.carbs = {
        enabled: true,
        min: macroValues.carbs,
      };
    }
    if (macroEnabled.fats) {
      filters.fats = {
        enabled: true,
        min: macroValues.fats,
      };
    }
    
    // Build legacy macroFilters payload for backward compatibility
    const macroFilters: {
      proteinMin?: number;
      carbsMin?: number;
      fatsMin?: number;
      caloriesMax?: number; // For UNDER mode
      caloriesMin?: number; // For OVER mode
    } = {};
    
    if (filters.protein?.enabled) {
      macroFilters.proteinMin = filters.protein.min;
    }
    if (filters.carbs?.enabled) {
      macroFilters.carbsMin = filters.carbs.min;
    }
    if (filters.fats?.enabled) {
      macroFilters.fatsMin = filters.fats.min;
    }
    
    // Calories: UNDER mode = max, OVER mode = min
    if (filters.calories?.enabled) {
      if (calorieMode === "UNDER") {
        macroFilters.caloriesMax = filters.calories.value;
      } else {
        macroFilters.caloriesMin = filters.calories.value;
      }
    }
    
    // Clear existing meals before new search (prevents stale results)
    setRecommendedMeals([]);
    
    // Increment usage for guest users (before making the API call)
    await incrementUsage('search');
    
    const mealsResult = await searchMeals(query, activeDistance, false, undefined, undefined, filters, macroFilters, calorieMode); // No searchKey for new search
    const meals = Array.isArray(mealsResult) ? mealsResult : mealsResult.meals || [];
    const searchKey = Array.isArray(mealsResult) ? undefined : mealsResult.searchKey;
    
    // Filter meals by selected cuisine if one is selected (client-side fallback)
    let filteredMeals = selectedCuisine 
      ? meals.filter(meal => mealMatchesCuisine(meal, selectedCuisine))
      : meals;
    
    // Diet filtering removed - filterMealsByProfile now returns meals unchanged
    filteredMeals = filterMealsByProfile(filteredMeals, userProfile);
    
    // Take first 3 meals
    const newMeals = filteredMeals.slice(0, 3);
    setRecommendedMeals(newMeals);
    
    // Save search parameters and results (including searchKey for pagination)
    const searchParams = {
      macroValues: { ...macroValues },
      macroDirections: { ...macroDirections },
      selectedCuisine,
      distance: activeDistance,
      searchKey, // Store for pagination
    };
    setLastSearchParams(searchParams);
    
    // Persist to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('seekeatz_recommended_meals', JSON.stringify(newMeals));
      localStorage.setItem('seekeatz_has_searched', 'true');
      localStorage.setItem('seekeatz_last_search_params', JSON.stringify(searchParams));
    }
    
    setIsLoadingMeals(false);
    
    // Scroll to meals section after a short delay to ensure it's rendered
    setTimeout(() => {
      mealsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleFindMoreMeals = async () => {
    updateActivity(); // Update activity on button click
    setIsLoadingMeals(true);
    
    // Build minimal query (no macro text - backend uses structured constraints)
    const cuisinePart = selectedCuisine 
      ? ` ${CUISINES.find(c => c.id === selectedCuisine)?.label.toLowerCase()}` 
      : "";
    const query = `find meals${cuisinePart}`.trim();
    
    // NEW SEMANTICS (locked in):
    // - Protein, Carbs, Fats are MINIMUMS (>=) - no direction toggle
    // - Calories is user-selectable: UNDER (<=) or OVER (>=) based on calorieMode
    const calorieMode = macroDirections.calories === "below" ? "UNDER" : "OVER";
    
    // Build structured filters payload with enabled flags (reuse from lastSearchParams if available)
    const filters: {
      calories?: { enabled: boolean; mode: "BELOW" | "ABOVE"; value: number };
      protein?: { enabled: boolean; min: number };
      carbs?: { enabled: boolean; min: number };
      fats?: { enabled: boolean; min: number };
    } = {};
    
    // Calories filter
    if (macroEnabled.calories) {
      filters.calories = {
        enabled: true,
        mode: calorieMode === "UNDER" ? "BELOW" : "ABOVE",
        value: macroValues.calories,
      };
    }
    
    // Protein, Carbs, Fats are always MINIMUMS (>=) when enabled
    if (macroEnabled.protein) {
      filters.protein = {
        enabled: true,
        min: macroValues.protein,
      };
    }
    if (macroEnabled.carbs) {
      filters.carbs = {
        enabled: true,
        min: macroValues.carbs,
      };
    }
    if (macroEnabled.fats) {
      filters.fats = {
        enabled: true,
        min: macroValues.fats,
      };
    }
    
    // Build legacy macroFilters payload for backward compatibility
    const macroFilters: {
      proteinMin?: number;
      carbsMin?: number;
      fatsMin?: number;
      caloriesMax?: number; // For UNDER mode
      caloriesMin?: number; // For OVER mode
    } = {};
    
    if (filters.protein?.enabled) {
      macroFilters.proteinMin = filters.protein.min;
    }
    if (filters.carbs?.enabled) {
      macroFilters.carbsMin = filters.carbs.min;
    }
    if (filters.fats?.enabled) {
      macroFilters.fatsMin = filters.fats.min;
    }
    
    // Calories: UNDER mode = max, OVER mode = min
    if (filters.calories?.enabled) {
      if (calorieMode === "UNDER") {
        macroFilters.caloriesMax = filters.calories.value;
      } else {
        macroFilters.caloriesMin = filters.calories.value;
      }
    }
    
    const mealsResult = await searchMeals(query, activeDistance, false, undefined, lastSearchParams?.searchKey, filters, macroFilters, calorieMode);
    const meals: Meal[] = Array.isArray(mealsResult) ? mealsResult : (mealsResult.meals || []);
    const responseSearchKey = Array.isArray(mealsResult) ? undefined : mealsResult.searchKey;
    
    // Update lastSearchParams with new searchKey if received
    if (responseSearchKey && lastSearchParams) {
      setLastSearchParams({ ...lastSearchParams, searchKey: responseSearchKey });
    }
    
    // Filter meals by selected cuisine if one is selected (client-side fallback)
    let filteredMeals: Meal[] = selectedCuisine 
      ? meals.filter((meal: Meal) => mealMatchesCuisine(meal, selectedCuisine))
      : meals;
    
    // Diet filtering removed - filterMealsByProfile now returns meals unchanged
    filteredMeals = filterMealsByProfile(filteredMeals, userProfile);
    
    // Get existing meal IDs to avoid duplicates
    const existingIds = new Set(recommendedMeals.map(m => m.id));
    
    // Filter out duplicates - fetch up to 15 results to have better chance of getting 3 unique ones
    const uniqueMeals = filteredMeals.filter((m: Meal) => !existingIds.has(m.id));
    
    // Shuffle and take 3 new meals for variety
    const shuffled = [...uniqueMeals].sort(() => Math.random() - 0.5);
    const newMeals = shuffled.slice(0, 3);
    
    if (newMeals.length > 0) {
      // Append new meals to existing list
      setRecommendedMeals(prev => [...prev, ...newMeals]);
    }
    
    setIsLoadingMeals(false);
  };

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
    
    // Try immediately, then retry after a short delay to ensure DOM is ready
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
            // Set multiple times to ensure it sticks
            requestAnimationFrame(() => {
              if (el) el.scrollTop = scrollY;
            });
          }
        }
      }}
      className="w-full h-full bg-background text-foreground px-4 pb-safe flex flex-col overflow-y-auto"
      style={{ 
        paddingTop: `calc(0.75rem + env(safe-area-inset-top, 0px))`,
        paddingBottom: `calc(8rem + env(safe-area-inset-bottom, 0px))`,
        // Prevent scroll restoration from browser
        scrollBehavior: 'auto'
      }}
    >
      {/* Top greeting & distance selector */}
      <header className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center">
          <img 
            src="/logos/seekeatz.png" 
            alt="Seekeatz Logo"
            className="h-12 sm:h-16 w-auto object-contain"
          />
        </div>
        <Select
          value={activeDistance.toString()}
          onValueChange={(value) => {
            const distance = Number(value);
            setHomeDistanceOverride(distance);
            // Persist to sessionStorage
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('seekeatz_home_distance_override', JSON.stringify(distance));
            }
            // Clear meals and refresh if we have existing results
            // IMPORTANT: DO NOT set seekeatz_pending_chat_message or trigger any chat messages here.
            // Radius changes should only update state and refresh meal results - never post to chat.
            if (hasSearched && recommendedMeals.length > 0) {
              setRecommendedMeals([]);
              setHasSearched(false);
              setLastSearchParams(null);
              if (typeof window !== 'undefined') {
                localStorage.removeItem('seekeatz_recommended_meals');
                localStorage.removeItem('seekeatz_has_searched');
                localStorage.removeItem('seekeatz_last_search_params');
              }
            }
          }}
        >
          <SelectTrigger className="h-7 w-auto min-w-[50px] sm:h-7 sm:min-w-[55px] px-1 sm:px-1.5 rounded-full border-border bg-muted/50 hover:bg-muted text-[10px] font-medium gap-0.5">
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

      {/* Cuisine row */}
      <section className="mb-4 sm:mb-5">
        <div className="flex justify-center overflow-x-auto no-scrollbar pb-1">
          <div className="flex gap-2 sm:gap-3">
            {CUISINES.map((cuisine) => {
              return (
                <button
                  key={cuisine.id}
                  onClick={() => {
                    // Show "Coming soon" - cuisine selection is disabled
                    // No action taken, but button remains clickable
                  }}
                  className="flex flex-col items-center flex-shrink-0 transition-opacity opacity-50 cursor-pointer hover:opacity-60"
                  title="Coming soon"
                >
                  <div
                    className="h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center border border-border/50 shadow-sm transition-all overflow-hidden bg-muted/30 grayscale"
                  >
                    <span className="text-xl sm:text-2xl leading-none opacity-70">{cuisine.icon}</span>
                  </div>
                  <span className="mt-1.5 sm:mt-2 text-[10px] sm:text-[11px] tracking-wide text-muted-foreground/60">
                    {cuisine.label}
                  </span>
                  <span className="mt-0.5 text-[9px] sm:text-[10px] text-muted-foreground/50">
                    Coming soon
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center">
        {/* Plate */}
        <PlateSelector
          macro={macro}
          value={currentValue}
          config={config}
        />

        {/* Macro tabs */}
        <div className="mt-6 sm:mt-8 flex gap-2 sm:gap-5 flex-nowrap justify-center">
          {(["calories", "protein", "carbs", "fats"] as MacroType[]).map(
            (type) => {
              const isActive = macro === type;
              const isPopoverOpen = openPopover === type;
              const isEnabled = macroEnabled[type];
              const isCalories = type === "calories";
              const currentDirection = isCalories ? macroDirections.calories : undefined;
              
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
                          ? "bg-gradient-to-r from-[#3A8BFF] to-[#4DDDF9] text-white shadow-lg shadow-[#3A8BFF]/40"
                          : !isEnabled
                          ? "bg-muted/50 text-muted-foreground border border-border/50 opacity-60"
                          : "bg-muted text-foreground border border-border hover:bg-muted/80"
                      }`}
                    >
                      {MACRO_CONFIG[type].label}
                      {isCalories && currentDirection === "above" && (
                        <span className="ml-0.5 sm:ml-1 text-xs opacity-75">↑</span>
                      )}
                      {isCalories && currentDirection === "below" && (
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
                      {isCalories ? (
                        // Calories: show direction toggle (ABOVE/BELOW)
                        <>
                          <button
                            onClick={() => handleDirectionChange("above")}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                              currentDirection === "above"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted hover:bg-muted/80 text-foreground"
                            }`}
                          >
                            Above (≥)
                          </button>
                          <button
                            onClick={() => handleDirectionChange("below")}
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
                        </>
                      ) : (
                        // Protein/Carbs/Fats: show exclude toggle only (always minimums)
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
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              );
            }
          )}
        </div>

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
        <button 
          onClick={handleFindMeals}
          disabled={isLoadingMeals}
          className="mt-3 sm:mt-4 w-full max-w-md h-11 sm:h-12 rounded-2xl bg-gradient-to-r from-[#3A8BFF] to-[#4DDDF9] text-sm sm:text-[15px] font-medium shadow-lg shadow-[#3A8BFF]/40 flex items-center justify-center gap-2 hover:shadow-xl hover:shadow-[#3A8BFF]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoadingMeals ? (
            <>
              <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
              Finding Meals...
            </>
          ) : (
            <>
              <Search className="w-4 h-4 sm:w-5 sm:h-5" />
              Find Meals That Match
            </>
          )}
        </button>
      </main>

      {/* Recommended Meals Section */}
      {(hasSearched || recommendedMeals.length > 0) && (
        <section ref={mealsSectionRef} className="w-full mt-6 sm:mt-8 mb-24">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 px-4 text-foreground">
            Recommended Meals
          </h2>
          
          {isLoadingMeals && recommendedMeals.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#4DDDF9]" />
            </div>
          ) : recommendedMeals.length > 0 ? (
            <>
              <div className="space-y-3 sm:space-y-4 px-4">
                {recommendedMeals.map((meal) => (
                  <div key={meal.id} data-meal-id={meal.id}>
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
                  disabled={isLoadingMeals}
                  className="w-full max-w-md mx-auto h-12 sm:h-14 rounded-2xl bg-muted border border-border text-sm sm:text-[15px] font-medium text-foreground flex items-center justify-center gap-2 hover:bg-muted/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingMeals ? (
                    <>
                      <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                      Finding More Meals...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                      Find More Meals
                    </>
                  )}
                </button>
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
    <div className="mt-0 sm:mt-1">
      <div className="relative h-40 w-40 sm:h-52 sm:w-52 mx-auto flex items-center justify-center">
        {/* Outer plate rim with depth */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white via-[#F5F5F5] to-[#E5E7EB] shadow-[0_25px_60px_rgba(15,23,42,0.7),0_8px_16px_rgba(0,0,0,0.15)] border-2 border-white/80" />
        
        {/* Plate rim highlight */}
        <div className="absolute inset-0 rounded-full border-[3px] border-white/60" />
        
        {/* Inner concave with depth */}
        <div className="absolute inset-4 sm:inset-6 rounded-full bg-gradient-to-br from-[#FAFAFA] via-[#F5F5F5] to-[#E5E7EB] shadow-[inset_0_8px_20px_rgba(0,0,0,0.15),inset_0_-4px_10px_rgba(255,255,255,0.8)]" />
        
        {/* Inner rim */}
        <div className="absolute inset-4 sm:inset-6 rounded-full border border-white/40" />
        
        {/* Subtle inner shadow for depth */}
        <div className="absolute inset-6 sm:inset-8 rounded-full bg-gradient-to-b from-transparent via-transparent to-[rgba(0,0,0,0.03)]" />
        
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center">
          <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-0.5 font-medium">
            {config.label}
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-slate-900 drop-shadow-sm">
              {value}
            </span>
            {config.unit && (
              <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-700 font-medium">{config.unit}</span>
            )}
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
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[300%] h-24 sm:h-32 rounded-full border-2 border-[#4DDDF9]/25 opacity-40 z-0" 
        style={{ 
          transform: 'perspective(500px) rotateX(65deg) scaleY(0.25)',
          transformOrigin: 'center top',
          background: 'radial-gradient(ellipse at center, rgba(77, 221, 249, 0.1) 0%, transparent 70%)',
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
                    fontSize: isActive ? '1.1rem' : '0.75rem', // Further reduced from 1.25rem to prevent overlap
                    textShadow: isActive 
                      ? '0 0 20px rgba(77, 221, 249, 0.8), 0 2px 8px rgba(0, 0, 0, 0.3)' 
                      : 'none',
                    willChange: 'font-size, color',
                    lineHeight: '1.2', // Fixed line height
                    minHeight: '1.1rem', // Reduced to match smaller font
                    display: 'inline-block', // Prevent layout shifts
                    transition: isScrolling ? 'none' : 'font-size 0.2s ease-out, color 0.2s ease-out, text-shadow 0.2s ease-out',
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
