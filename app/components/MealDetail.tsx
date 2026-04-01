"use client";

import { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Flame,
  Zap,
  TrendingUp,
  Plus,
  Heart,
  Share,
  Clock,
  MapPin,
  Sparkles,
  ChevronDown,
  X,
  Check,
  UtensilsCrossed,
  Beef,
  Wheat,
  Droplets,
  BottleWine,
  ArrowRightLeft
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AnimatedNumber } from './AnimatedNumber';
import type { Meal, UserProfile } from '../types';
import type { LoggedMeal } from './LogScreen';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { copyToClipboard } from '@/lib/clipboard-utils';
import { useTheme } from '../contexts/ThemeContext';
import { useNutrition } from '../contexts/NutritionContext';
import { calculateCalorieRemaining } from '@/utils/calorie-calculator';
import { getLogo } from '@/utils/logos';

// --- TYPES ---
type Props = {
  meal: Meal;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onBack: () => void;
  onLogMeal: (meal: Meal) => void;
  userProfile?: UserProfile;
  loggedMeals?: LoggedMeal[];
  isPremium?: boolean;
  onPremiumFeatureAttempt?: () => void;
};

type SwapQuantityConfig = {
  unitLabel: string;
  min: number;
  max: number;
  defaultQuantity: number;
};

type SwapOption = {
  id: string;
  label: string;
  modifierItemIds: string[];
  isModification?: boolean; // true = modification (edit this meal), false = alternative (different meal)
  quantityConfig?: SwapQuantityConfig;
  deltaMacros: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number; // Use "fats" (plural) to match Meal type
  };
};

type SauceItem = {
  id: string;
  name: string;
  macros: { calories: number; protein: number; carbs: number; fat: number };
};

type SauceSelectorProps = {
  sauces: SauceItem[];
  selectedSauceIds: string[];
  onToggleSauce: (id: string) => void;
  isLoading: boolean;
  disabled?: boolean;
};

// --- HELPER LOGIC ---
/** Converts delta macros into descriptive text (e.g., "more protein", "reduce calories") */
function getSwapDescription(delta: { calories: number; protein: number; carbs: number; fats: number }): string {
  const descriptions: string[] = [];
  
  // Prioritize the most impactful changes
  if (delta.protein > 0) {
    descriptions.push('more protein');
  }
  if (delta.calories < 0) {
    descriptions.push('reduce calories');
  }
  if (delta.carbs < 0) {
    descriptions.push('less carbs');
  }
  if (delta.fats < 0) {
    descriptions.push('less fats');
  }
  if (delta.protein < 0) {
    descriptions.push('less protein');
  }
  if (delta.calories > 0) {
    descriptions.push('more calories');
  }
  if (delta.carbs > 0) {
    descriptions.push('more carbs');
  }
  if (delta.fats > 0) {
    descriptions.push('more fats');
  }
  
  // If no changes, return a neutral message
  if (descriptions.length === 0) {
    return 'no macro change';
  }
  
  // Join with commas, with "and" before the last item if multiple
  if (descriptions.length === 1) {
    return descriptions[0];
  } else if (descriptions.length === 2) {
    return `${descriptions[0]} and ${descriptions[1]}`;
  } else {
    return `${descriptions.slice(0, -1).join(', ')}, and ${descriptions[descriptions.length - 1]}`;
  }
}

function formatSignedDelta(value: number, suffix: string): string {
  const roundedValue = Number.isInteger(value) ? value : Number(value.toFixed(1));
  return `${roundedValue > 0 ? '+' : ''}${roundedValue}${suffix}`;
}

function scaleSwapDelta(
  delta: SwapOption['deltaMacros'],
  quantity: number
): SwapOption['deltaMacros'] {
  if (quantity <= 1) {
    return delta;
  }

  return {
    calories: delta.calories * quantity,
    protein: delta.protein * quantity,
    carbs: delta.carbs * quantity,
    fats: delta.fats * quantity,
  };
}

function SwapDeltaSummary({ delta }: { delta: SwapOption['deltaMacros'] }) {
  const entries = [
    { key: 'calories', label: 'cal', value: delta.calories, tone: 'text-pink-600 dark:text-pink-300' },
    { key: 'protein', label: 'pro', value: delta.protein, suffix: 'g', tone: 'text-cyan-600 dark:text-cyan-300' },
    { key: 'carbs', label: 'carbs', value: delta.carbs, suffix: 'g', tone: 'text-green-600 dark:text-green-300' },
    { key: 'fats', label: 'fat', value: delta.fats, suffix: 'g', tone: 'text-amber-600 dark:text-amber-300' },
  ].filter((entry) => entry.value !== 0);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {entries.map((entry) => (
        <span
          key={entry.key}
          className={`rounded-full border border-border bg-background/70 px-2 py-1 text-[10px] font-semibold ${entry.tone}`}
        >
          {formatSignedDelta(entry.value, entry.suffix ?? '')} {entry.label}
        </span>
      ))}
    </div>
  );
}

function inferEggSwapMaxQuantity(mealName: string): number {
  const explicitEggCount = mealName.match(/\b(\d+)\s+eggs?\b/i);
  if (explicitEggCount) {
    const parsedCount = Number.parseInt(explicitEggCount[1], 10);
    return Math.min(Math.max(parsedCount, 1), 6);
  }

  if (/\bomelet|omelette|frittata\b/i.test(mealName)) {
    return 3;
  }

  if (/\+\s*eggs?\b/i.test(mealName) || /\bbenedict\b/i.test(mealName)) {
    return 2;
  }

  return 1;
}

function getSwapQuantityConfig(swapLabel: string, mealName: string): SwapQuantityConfig | undefined {
  if (/egg whites instead of whole eggs/i.test(swapLabel)) {
    return {
      unitLabel: 'egg',
      min: 1,
      max: inferEggSwapMaxQuantity(mealName),
      defaultQuantity: 1,
    };
  }

  return undefined;
}

function SauceSelector({
  sauces,
  selectedSauceIds,
  onToggleSauce,
  isLoading,
  disabled = false,
}: SauceSelectorProps) {
  const selectedSauces = sauces.filter((sauce) => selectedSauceIds.includes(sauce.id));
  const triggerLabel = selectedSauces.length === 0
    ? 'Select sauces'
    : `${selectedSauces.length} sauce${selectedSauces.length === 1 ? '' : 's'} selected`;

  if (isLoading) {
    return <div className="text-center py-3 text-muted-foreground text-sm">Loading sauces...</div>;
  }

  if (sauces.length === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="w-full flex items-center justify-between rounded-2xl border border-border bg-muted/40 px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed"
        >
          <div>
            <p className="font-medium">Sauces</p>
            <p className="text-xs text-muted-foreground">
              {triggerLabel}
            </p>
          </div>
          <div className="text-right">
            {selectedSauces.length > 0 && (
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                +{selectedSauces.reduce((sum, sauce) => sum + (sauce.macros.calories || 0), 0)} cal
              </p>
            )}
            <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl border-border bg-card p-3">
        <div className="space-y-2">
          <div className="px-1 pb-1">
            <p className="text-sm font-semibold text-card-foreground">Sauces</p>
            <p className="text-xs text-muted-foreground">Select any sauces to add their macros to this meal.</p>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
            {sauces.map((sauce) => {
              const isSelected = selectedSauceIds.includes(sauce.id);
              return (
                <button
                  key={sauce.id}
                  type="button"
                  onClick={() => onToggleSauce(sauce.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition-all ${
                    isSelected
                      ? 'border-amber-500/60 bg-amber-500/15'
                      : 'border-border bg-muted/30 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{sauce.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {sauce.macros.protein || 0}g protein, {sauce.macros.carbs || 0}g carbs, {sauce.macros.fat || 0}g fat
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        {sauce.macros.calories || 0} cal
                      </span>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                        isSelected ? 'border-amber-500 bg-amber-500 text-white' : 'border-border text-transparent'
                      }`}>
                        <Check className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MealDetail({
  meal,
  isFavorite,
  onToggleFavorite,
  onBack,
  onLogMeal,
  userProfile,
  loggedMeals = [],
  isPremium = false,
  onPremiumFeatureAttempt,
}: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  // Modal States
  const [showLogModal, setShowLogModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  // Selected Meal Context - Single source of truth for swaps
  const [selectedMealSwaps, setSelectedMealSwaps] = useState<SwapOption[]>([]);
  const [isLoadingSwaps, setIsLoadingSwaps] = useState(false);
  const [selectedSwapIds, setSelectedSwapIds] = useState<string[]>([]);
  const [selectedSwapQuantities, setSelectedSwapQuantities] = useState<Record<string, number>>({});

  // Restaurant sauces - only for this meal's restaurant
  const [restaurantSauces, setRestaurantSauces] = useState<SauceItem[]>([]);
  const [isLoadingSauces, setIsLoadingSauces] = useState(false);
  const [selectedSauceIds, setSelectedSauceIds] = useState<string[]>([]);

  // Manual Form State
  const [manualName, setManualName] = useState('');
  const [manualCals, setManualCals] = useState('');
  const [manualPro, setManualPro] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFats, setManualFats] = useState('');

  if (!meal) return null;

  // State for similar meals
  const [similarMeals, setSimilarMeals] = useState<Meal[]>([]);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);

  // Mock Data / Logic
  const rating = (meal as any).rating || 4.8;
  // Use calculated distance from meal if available, otherwise don't show
  const distance = meal.distance !== undefined && meal.distance !== null
    ? `${meal.distance.toFixed(1)} mi`
    : null;
  // Only show prepTime if we have real data, otherwise show nothing or "Nearby"
  const prepTime = meal.prepTime ? `${meal.prepTime} min` : null;
  const locationLabel = distance ? null : (meal.latitude && meal.longitude ? "Nearby" : null);
  // Get user goals and today's consumed totals from the shared nutrition context.
  const { targets, todaysTotals, isLoading: isLogLoading } = useNutrition();

  const hasMealDetailTargets =
    userProfile !== undefined ||
    (!isLogLoading && targets !== null);
  const logReady = hasMealDetailTargets;
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Extract stable primitives for memoization (not objects/arrays)
  const dailyTargetCalories = useMemo(() => {
    if (typeof userProfile?.target_calories === 'number') {
      return userProfile.target_calories;
    }

    if (userProfile?.target_calories) {
      const parsedUserTargetCalories = Number(userProfile.target_calories);
      if (!Number.isNaN(parsedUserTargetCalories)) {
        return parsedUserTargetCalories;
      }
    }

    return typeof targets?.targetCalories === 'number'
      ? targets.targetCalories
      : (typeof targets?.targetCalories === 'string' ? parseFloat(targets.targetCalories) : 0) || 2000;
  }, [targets?.targetCalories, userProfile?.target_calories]);

  const todaysConsumedTotals = useMemo(() => {
    if (loggedMeals.length > 0) {
      return loggedMeals.reduce((totals, loggedMeal) => {
        if (loggedMeal.date !== todayStr) {
          return totals;
        }

        return {
          calories: totals.calories + Math.round(Number(loggedMeal.meal.calories) || 0),
          protein: totals.protein + (Number(loggedMeal.meal.protein) || 0),
          carbs: totals.carbs + (Number(loggedMeal.meal.carbs) || 0),
          fats: totals.fats + (Number(loggedMeal.meal.fats) || 0),
        };
      }, { calories: 0, protein: 0, carbs: 0, fats: 0 });
    }

    return {
      calories: Math.round(Number(todaysTotals?.consumedCalories) || 0),
      protein: Number(todaysTotals?.consumedProtein) || 0,
      carbs: Number(todaysTotals?.consumedCarbs) || 0,
      fats: Number(todaysTotals?.consumedFats) || 0,
    };
  }, [
    loggedMeals,
    todayStr,
    todaysTotals?.consumedCalories,
    todaysTotals?.consumedProtein,
    todaysTotals?.consumedCarbs,
    todaysTotals?.consumedFats,
  ]);

  // Memoize calorieCalc with stable primitives only (not objects/arrays)
  const calorieCalc = useMemo(() => {
    const userProfileForCalc: UserProfile = {
      target_calories: dailyTargetCalories,
      target_protein_g: targets?.targetProtein ?? 150,
      target_carbs_g: targets?.targetCarbs ?? 200,
      target_fats_g: targets?.targetFats ?? 70,
      search_distance_miles: 10, // Default value, not used in calculator
    };
    // Calculate todaysRemainingCalories directly from primitives
    const todaysRemainingCalories = dailyTargetCalories - todaysConsumedTotals.calories;
    return {
      targetCalories: dailyTargetCalories,
      todaysConsumedCalories: todaysConsumedTotals.calories,
      todaysRemainingCalories,
      remainingIfEatMeal: (mealCalories: number) => dailyTargetCalories - (todaysConsumedTotals.calories + mealCalories),
    };
  }, [dailyTargetCalories, todaysConsumedTotals.calories]);

  // Fetch swaps ONCE when meal is selected - Single source of truth
  useEffect(() => {
    const fetchMealSwaps = async () => {
      if (!meal.restaurant_name && !meal.restaurant) {
        setSelectedMealSwaps([]);
        return;
      }

      setIsLoadingSwaps(true);
      // Reset selected swap IDs when meal changes
      setSelectedSwapIds([]);
      setSelectedSwapQuantities({});

      try {
        const res = await fetch('/api/swaps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurant_name: meal.restaurant_name || meal.restaurant,
            meal_id: meal.id,
            meal_name: meal.name,
            meal_macros: {
              calories: meal.calories,
              protein: meal.protein,
              carbs: meal.carbs,
              fats: meal.fats // Use "fats" (plural) to match Meal type
            },
            calorieCap: targets?.targetCalories,
            minProtein: targets?.targetProtein,
            maxCarbs: undefined, // Could add if we track this
            maxFat: undefined, // Could add if we track this
            user_goals: {} // Legacy format, kept for compatibility
          }),
        });

        const data = await res.json();

        // API now returns { modifications: [...], alternatives: [...] }
        // Modifications are PRIMARY (edits to THIS meal)
        // Alternatives are SECONDARY (only shown if no modifications exist)
        const allSwaps: SwapOption[] = [];

        // Add modifications first (PRIMARY - edits to this meal)
        if (data.modifications && Array.isArray(data.modifications) && data.modifications.length > 0) {
          const modSwaps: SwapOption[] = data.modifications.map((mod: any) => ({
            id: mod.id || `mod::${meal.id}::${mod.label || mod.swapTitle || 'Modification'}`,
            label: mod.label || mod.swapTitle || 'Modification',
            expectedEffect: mod.expectedEffect,
            confidenceLabel: mod.confidenceLabel,
            modifierItemIds: mod.modifierItemIds || [],
            isModification: true, // Mark as modification
            quantityConfig: getSwapQuantityConfig(mod.label || mod.swapTitle || 'Modification', meal.name),
            deltaMacros: {
              calories: mod.deltaMacros?.calories ?? mod.estimatedDelta?.calories ?? 0,
              protein: mod.deltaMacros?.protein ?? mod.estimatedDelta?.protein ?? 0,
              carbs: mod.deltaMacros?.carbs ?? mod.estimatedDelta?.carbs ?? 0,
              fats: mod.deltaMacros?.fats ?? mod.estimatedDelta?.fats ?? 0, // Use "fats" (plural) to match Meal type
            }
          }));
          allSwaps.push(...modSwaps);
        }

        // Add alternatives ONLY if no modifications exist (true fallback)
        if (allSwaps.length === 0 && data.alternatives && Array.isArray(data.alternatives) && data.alternatives.length > 0) {
          const altSwaps: SwapOption[] = data.alternatives.map((alt: any) => ({
            id: alt.id || `alt::${meal.id}::${alt.name || 'Alternative'}`,
            label: `Try ${alt.name} instead`,
            modifierItemIds: [],
            isModification: false, // Mark as alternative
            deltaMacros: {
              calories: alt.calories - meal.calories,
              protein: alt.protein - meal.protein,
              carbs: alt.carbs - meal.carbs,
              fats: alt.fats - meal.fats
            }
          }));
          allSwaps.push(...altSwaps);
        }

        setSelectedMealSwaps(allSwaps);
      } catch (error) {
        console.error('Failed to fetch meal swaps:', error);
        setSelectedMealSwaps([]);
      } finally {
        setIsLoadingSwaps(false);
      }
    };

    fetchMealSwaps();
  }, [
    meal.id,
    meal.restaurant_name,
    meal.restaurant,
    meal.name,
    meal.calories,
    meal.protein,
    meal.carbs,
    meal.fats,
    targets?.targetCalories,
    targets?.targetProtein,
  ]);

  // Filter selectedSwapIds to only include valid swap IDs when selectedMealSwaps changes
  useEffect(() => {
    const validSwapIds = new Set(selectedMealSwaps.map(s => s.id));
    setSelectedSwapIds(prev => prev.filter(id => validSwapIds.has(id)));
    setSelectedSwapQuantities(prev =>
      Object.fromEntries(
        Object.entries(prev).filter(([id]) => validSwapIds.has(id))
      )
    );
  }, [selectedMealSwaps]);

  // Fetch similar meals from the same restaurant
  useEffect(() => {
    const fetchSimilarMeals = async () => {
      if (!meal.restaurant) return;

      setIsLoadingSimilar(true);
      try {
        // Search for meals from the same restaurant
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: meal.restaurant }),
        });

        const data = await res.json();
        let normalizedResults: any[] = [];

        if (Array.isArray(data)) {
          normalizedResults = data;
        } else if (data && typeof data === 'object' && Array.isArray(data.results)) {
          normalizedResults = data.results;
        }

        // Convert to Meal type and filter
        const allMeals = normalizedResults.map((item: any) => {
          // Handle fats - normalize fat/fats consistently
          // Prefer fat (singular) from DB, fallback to fats (plural)
          // Also check _g suffixed variants for compatibility
          const fats = item.fat ?? item.fats ??
            item.fat_g ?? item.fats_g ??
            (item.nutrition_info?.fat) ??
            (item.nutrition_info?.fats) ??
            (item.nutrition_info?.fat_g) ??
            (item.nutrition_info?.fats_g) ?? 0;

          const restaurantName = item.restaurant_name || 'Unknown Restaurant';
          const mealName = item.item_name || item.name || 'Unknown Item';

          return {
            id: item.id || `${restaurantName}::${mealName}`,
            name: mealName,
            restaurant: restaurantName,
            calories: item.calories || 0,
            protein: item.protein_g || 0,
            carbs: item.carbs_g || 0,
            fats: typeof fats === 'number' ? fats : 0,
            image: item.image_url || item.image || '',
            description: item.description || '',
            category: item.category === 'Grocery' || item.category === 'Hot Bar' ? 'grocery' as const : 'restaurant' as const,
          };
        });

        // Filter to same restaurant, exclude current meal, and take 3-5
        const similar = allMeals
          .filter((m: Meal) =>
            m.restaurant.toLowerCase() === meal.restaurant.toLowerCase() &&
            m.id !== meal.id &&
            m.calories >= 150 // Only full meals
          )
          .slice(0, 5);

        setSimilarMeals(similar);
      } catch (error) {
        console.error('Failed to fetch similar meals:', error);
        setSimilarMeals([]);
      } finally {
        setIsLoadingSimilar(false);
      }
    };

    fetchSimilarMeals();
  }, [meal.id, meal.restaurant]);

  // Fetch sauces for this meal's restaurant (only when meal has a restaurant)
  useEffect(() => {
    const restaurant = meal.restaurant_name || meal.restaurant;
    if (!restaurant?.trim()) {
      setRestaurantSauces([]);
      setSelectedSauceIds([]);
      return;
    }
    setSelectedSauceIds([]);
    setIsLoadingSauces(true);
    fetch(`/api/sauces?restaurant=${encodeURIComponent(restaurant)}`)
      .then((res) => res.json())
      .then((data: { sauces?: SauceItem[] }) => {
        setRestaurantSauces(Array.isArray(data.sauces) ? data.sauces : []);
      })
      .catch(() => setRestaurantSauces([]))
      .finally(() => setIsLoadingSauces(false));
  }, [meal.id, meal.restaurant_name, meal.restaurant]);

  // Sum of selected sauces' macros (for effective totals)
  const sauceMacrosSum = useMemo(() => {
    return selectedSauceIds.reduce(
      (acc, id) => {
        const s = restaurantSauces.find((x) => x.id === id);
        if (!s) return acc;
        return {
          calories: acc.calories + (s.macros.calories || 0),
          protein: acc.protein + (s.macros.protein || 0),
          carbs: acc.carbs + (s.macros.carbs || 0),
          fats: acc.fats + (s.macros.fat ?? 0),
        };
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }, [selectedSauceIds, restaurantSauces]);

  const selectedSwapDeltaSum = useMemo(() => {
    return selectedSwapIds.reduce(
      (acc, id) => {
        const swap = selectedMealSwaps.find((option) => option.id === id);
        if (!swap) return acc;
        const quantity = selectedSwapQuantities[id] ?? swap.quantityConfig?.defaultQuantity ?? 1;
        const scaledDelta = scaleSwapDelta(swap.deltaMacros, quantity);

        return {
          calories: acc.calories + (scaledDelta.calories || 0),
          protein: acc.protein + (scaledDelta.protein || 0),
          carbs: acc.carbs + (scaledDelta.carbs || 0),
          fats: acc.fats + (scaledDelta.fats || 0),
        };
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }, [selectedSwapIds, selectedMealSwaps, selectedSwapQuantities]);

  // Effective macros = base meal + selected swap deltas + selected sauces
  const effectiveMacros = useMemo(() => {
    return {
      calories: Math.max(0, meal.calories + selectedSwapDeltaSum.calories + sauceMacrosSum.calories),
      protein: Math.max(0, meal.protein + selectedSwapDeltaSum.protein + sauceMacrosSum.protein),
      carbs: Math.max(0, (meal.carbs || 0) + selectedSwapDeltaSum.carbs + sauceMacrosSum.carbs),
      fats: Math.max(0, (meal.fats || 0) + selectedSwapDeltaSum.fats + sauceMacrosSum.fats),
    };
  }, [meal.calories, meal.protein, meal.carbs, meal.fats, selectedSwapDeltaSum, sauceMacrosSum]);

  // "Left after this meal" = target - logged today - effective meal (updates with swaps and sauces)
  const leftAfterThisMeal = useMemo(() => {
    const targetCal = dailyTargetCalories;
    const targetPro = userProfile?.target_protein_g ?? targets?.targetProtein ?? 150;
    const targetCarb = userProfile?.target_carbs_g ?? targets?.targetCarbs ?? 200;
    const targetFat = userProfile?.target_fats_g ?? targets?.targetFats ?? 70;
    return {
      calories: Math.round(targetCal - todaysConsumedTotals.calories - effectiveMacros.calories),
      protein: Math.round(targetPro - todaysConsumedTotals.protein - effectiveMacros.protein),
      carbs: Math.round(targetCarb - todaysConsumedTotals.carbs - effectiveMacros.carbs),
      fats: Math.round(targetFat - todaysConsumedTotals.fats - effectiveMacros.fats),
    };
  }, [dailyTargetCalories, todaysConsumedTotals, targets, effectiveMacros]);

  const totalMacros = effectiveMacros.protein + effectiveMacros.carbs + effectiveMacros.fats;
  const pPercent = totalMacros > 0 ? Math.round((effectiveMacros.protein / totalMacros) * 100) : 0;
  const cPercent = totalMacros > 0 ? Math.round((effectiveMacros.carbs / totalMacros) * 100) : 0;
  const fPercent = totalMacros > 0 ? Math.round((effectiveMacros.fats / totalMacros) * 100) : 0;

  // Compute directly from stable primitives (use effective calories for "if you eat this")
  const mealCaloriesNum = effectiveMacros.calories;
  const todaysRemainingNum = logReady ? Number(calorieCalc?.todaysRemainingCalories ?? 0) : 0;
  const calsAfter = logReady ? Math.round(todaysRemainingNum - mealCaloriesNum) : null;
  const calsRemaining = logReady ? todaysRemainingNum : null;

  const toggleSauceSelection = (sauceId: string) => {
    setSelectedSauceIds((prev) => (
      prev.includes(sauceId)
        ? prev.filter((id) => id !== sauceId)
        : [...prev, sauceId]
    ));
  };

  // Dev log
  if (process.env.NODE_ENV === 'development' && logReady) {
    console.log('[calorieCalc]', { todaysRemainingNum, mealCaloriesNum, calsAfter });
  }

  // Keep for compatibility with existing code
  const targetCalories = calorieCalc.targetCalories;
  const todaysConsumedCalories = calorieCalc.todaysConsumedCalories;

  // --- HANDLERS ---
  const toggleSwap = (id: string) => {
    if (!isPremium) {
      onPremiumFeatureAttempt?.();
      return;
    }

    // Only allow toggling swaps that exist in selectedMealSwaps
    const swap = selectedMealSwaps.find(s => s.id === id);
    if (!swap) return;

    setSelectedSwapIds(prev => {
      const isRemoving = prev.includes(id);
      if (isRemoving) {
        setSelectedSwapQuantities(current => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        return prev.filter(x => x !== id);
      }

      if (swap.quantityConfig) {
        setSelectedSwapQuantities(current => ({
          ...current,
          [id]: current[id] ?? swap.quantityConfig!.defaultQuantity,
        }));
      }

      return [...prev, id];
    });
  };

  const updateSwapQuantity = (id: string, quantity: number) => {
    const swap = selectedMealSwaps.find(option => option.id === id);
    if (!swap?.quantityConfig) {
      return;
    }

    const nextQuantity = Math.min(
      swap.quantityConfig.max,
      Math.max(swap.quantityConfig.min, quantity)
    );

    setSelectedSwapQuantities(prev => ({
      ...prev,
      [id]: nextQuantity,
    }));
  };

  const handleConfirmLog = () => {
    if (!isPremium) {
      onPremiumFeatureAttempt?.();
      return;
    }

    // Final macros = base meal + selected swaps + selected sauces (use effectiveMacros)
    const finalMacros = { ...effectiveMacros };

    // Get selected swaps with full information
    const selectedSwapsData = selectedSwapIds
      .map(id => selectedMealSwaps.find(s => s.id === id))
      .filter(Boolean)
      .map(swap => ({
        id: swap!.id,
        label: swap!.label,
        quantity: selectedSwapQuantities[swap!.id] ?? swap!.quantityConfig?.defaultQuantity ?? 1,
        modifierItemIds: swap!.modifierItemIds
      }));

    // Get all selected modifier IDs (flattened)
    const selectedModifierIds = selectedSwapsData.flatMap(swap => swap.modifierItemIds);

    // Create modified meal object with final macros (base + swaps + sauces)
    const modifiedMeal: Meal = {
      ...meal,
      calories: finalMacros.calories,
      protein: finalMacros.protein,
      carbs: finalMacros.carbs,
      fats: finalMacros.fats,
    };

    // Build log entry payload for debugging
    const logEntry = {
      baseMeal: {
        id: meal.id,
        name: meal.name,
        restaurant: meal.restaurant_name || meal.restaurant
      },
      selectedSwaps: selectedSwapsData,
      selectedModifierIds: selectedModifierIds,
      finalMacros: finalMacros
    };

    // Debug log when confirming log (should match MainApp debug log)
    // Note: We don't have access to loggedMeals here, so we log what we can
    console.log('[MealDetail] Confirming log with swaps:', {
      baseMealCalories: meal.calories,
      finalMealCalories: modifiedMeal.calories,
      swapsApplied: selectedSwapsData.length,
      logEntry,
    });

    // Pass modified meal to parent (with swaps applied)
    onLogMeal(modifiedMeal);

    setShowLogModal(false);
    setSelectedSwapIds([]);
    setSelectedSwapQuantities({});
    setSelectedSauceIds([]);
  };

  const handleManualSubmit = () => {
    // Just close for now, logically would pass data to parent
    setShowManualModal(false);
    setManualName(''); setManualCals(''); setManualPro(''); setManualCarbs(''); setManualFats('');
  };

  const handleShare = async () => {
    // Create share text with meal information
    const shareText = `${meal.name} from ${meal.restaurant}\n` +
      `${meal.calories} cal • ${meal.protein}g protein • ${meal.carbs || 0}g carbs • ${meal.fats || 0}g fats`;

    const success = await copyToClipboard(shareText);

    if (success) {
      // You could show a toast notification here
      // For now, we'll just log success
      console.log('✅ Meal information copied to clipboard');
    } else {
      // You could show an error toast here
      console.error('❌ Failed to copy meal information');
    }
  };

  const isManualValid = manualName && manualCals;

  return (
    <div className="h-full w-full bg-background text-foreground flex flex-col relative overflow-hidden font-sans">
      {/* --- MOBILE-FIRST CONTAINER --- */}
      <div className={`max-w-lg mx-auto shadow-2xl h-full w-full flex flex-col ${isDark ? 'bg-gray-950' : 'bg-white'}`}>
        {/* --- SCROLLABLE CONTENT --- */}
        <div className="flex-1 overflow-y-auto scrollbar-hide pb-6 pb-safe">

          {/* TOP BAR: Back, Favorite, Share (no header image) */}
          <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-background/95 backdrop-blur border-b border-border">
            <button onClick={onBack} className="w-10 h-10 rounded-full flex items-center justify-center border border-border bg-muted/50 hover:bg-muted">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <div className="flex gap-2">
              <button onClick={onToggleFavorite} className={`w-10 h-10 rounded-full flex items-center justify-center border ${isFavorite ? 'bg-pink-500/20 text-pink-500 border-pink-500/50' : 'border-border bg-muted/50 hover:bg-muted'}`}>
                <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
              </button>
              <button onClick={handleShare} className="w-10 h-10 rounded-full flex items-center justify-center border border-border bg-muted/50 hover:bg-muted" aria-label="Share meal information">
                <Share className="w-4 h-4 text-foreground" />
              </button>
            </div>
          </div>

          {/* MAIN CONTENT */}
          <div className="px-5 pt-4 space-y-6">

            {/* TITLE & INFO: Restaurant bigger/bold, dish name smaller underneath */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h1 className="text-foreground text-2xl font-bold leading-tight">{meal.restaurant_name || meal.restaurant}</h1>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <p className="text-muted-foreground text-base font-medium leading-tight">{meal.name}</p>
                </div>
                <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                  {distance && (
                    <>
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {distance} away
                      </div>
                    </>
                  )}
                  {prepTime && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-border"></span>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {prepTime} pickup
                      </div>
                    </>
                  )}
                  {locationLabel && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-border"></span>
                      <span>{locationLabel}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Restaurant logo — larger square box to the far right, fills extra whitespace without overlapping text */}
              <div className="flex-shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-muted/80 border border-border flex items-center justify-center overflow-hidden shadow-sm">
                <img
                  src={getLogo(meal.restaurant_name || meal.restaurant || '')}
                  alt={meal.restaurant_name || meal.restaurant || ''}
                  className="w-full h-full object-contain p-2"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = '/logos/default.png';
                  }}
                />
              </div>
            </div>

            {/* MACROS CARD */}
            <div className="bg-card border border-border p-5 rounded-3xl shadow-lg relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-500/10 blur-3xl rounded-full pointer-events-none"></div>

              <div className="mb-4">
                <p className="text-card-foreground text-sm font-semibold">Nutritional Information</p>
              </div>

              {/* Calories - larger, more visible */}
              <div className="mb-5">
                <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-2xl p-4 text-center w-full">
                  <Flame className="w-5 h-5 text-pink-400 mx-auto mb-2" />
                  <p className="text-card-foreground text-2xl font-bold leading-none mb-1">
                    <AnimatedNumber value={effectiveMacros.calories} />
                  </p>
                  <p className="text-pink-600 dark:text-pink-400 text-sm font-semibold uppercase tracking-wide">Calories</p>
                  {selectedSauceIds.length > 0 && (
                    <p className="text-pink-500/70 text-xs mt-1">meal + sauces</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-4 border-t border-border/50">
                <div className="text-center">
                  <div className="h-3 w-full bg-muted rounded-full mb-2.5 overflow-hidden">
                    <motion.div
                      layout
                      style={{ width: `${pPercent}%` }}
                      className="h-full bg-cyan-500 rounded-full"
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    />
                  </div>
                  <p className="text-cyan-600 dark:text-cyan-400 font-bold text-lg">
                    <AnimatedNumber value={effectiveMacros.protein} suffix="g" />
                  </p>
                  <p className="text-muted-foreground text-xs font-medium">Protein ({pPercent}%)</p>
                </div>
                <div className="text-center">
                  <div className="h-3 w-full bg-muted rounded-full mb-2.5 overflow-hidden">
                    <motion.div
                      layout
                      style={{ width: `${cPercent}%` }}
                      className="h-full bg-emerald-500 rounded-full"
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    />
                  </div>
                  <p className="text-emerald-600 dark:text-emerald-400 font-bold text-lg">
                    <AnimatedNumber value={effectiveMacros.carbs} suffix="g" />
                  </p>
                  <p className="text-muted-foreground text-xs font-medium">Carbs ({cPercent}%)</p>
                </div>
                <div className="text-center">
                  <div className="h-3 w-full bg-muted rounded-full mb-2.5 overflow-hidden">
                    <motion.div
                      layout
                      style={{ width: `${fPercent}%` }}
                      className="h-full bg-amber-500 rounded-full"
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    />
                  </div>
                  <p className="text-amber-600 dark:text-amber-400 font-bold text-lg">
                    <AnimatedNumber value={effectiveMacros.fats} suffix="g" />
                  </p>
                  <p className="text-muted-foreground text-xs font-medium">Fats ({fPercent}%)</p>
                </div>
              </div>
            </div>

            {/* IMPACT AFTER THIS MEAL - Card grid with animated numbers */}
            <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/80 dark:to-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
              <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 border-b border-slate-200/80 dark:border-slate-700/80">
                <div className="w-10 h-10 rounded-xl bg-primary/15 dark:bg-primary/25 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-foreground font-bold text-base tracking-tight">After this meal</h3>
                  <p className="text-muted-foreground text-xs mt-0.5">If you log this meal, here’s what you’d have left for the day.</p>
                </div>
              </div>
              {!logReady ? (
                <p className="text-muted-foreground text-sm px-5 py-6">Load your goals to see remaining.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 p-4">
                  <motion.div
                    className="rounded-2xl bg-white dark:bg-slate-800/60 border border-orange-200/60 dark:border-orange-500/20 p-4 shadow-sm flex flex-col items-center gap-1"
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <Flame className="w-6 h-6 text-orange-500 dark:text-orange-400 mb-1" />
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Calories left</span>
                    <span className={`text-xl font-bold ${leftAfterThisMeal.calories < 0 ? 'text-red-500 dark:text-red-400' : 'text-foreground'}`}>
                      <AnimatedNumber value={leftAfterThisMeal.calories} showOverWhenNegative className={leftAfterThisMeal.calories < 0 ? 'text-red-500 dark:text-red-400' : ''} />
                    </span>
                  </motion.div>
                  <motion.div
                    className="rounded-2xl bg-white dark:bg-slate-800/60 border border-cyan-200/60 dark:border-cyan-500/20 p-4 shadow-sm flex flex-col items-center gap-1"
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <Beef className="w-6 h-6 text-cyan-500 dark:text-cyan-400 mb-1" />
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Protein left</span>
                    <span className={`text-xl font-bold ${leftAfterThisMeal.protein < 0 ? 'text-red-500 dark:text-red-400' : 'text-foreground'}`}>
                      <AnimatedNumber value={leftAfterThisMeal.protein} suffix="g" showOverWhenNegative className={leftAfterThisMeal.protein < 0 ? 'text-red-500 dark:text-red-400' : ''} />
                    </span>
                  </motion.div>
                  <motion.div
                    className="rounded-2xl bg-white dark:bg-slate-800/60 border border-emerald-200/60 dark:border-emerald-500/20 p-4 shadow-sm flex flex-col items-center gap-1"
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <Wheat className="w-6 h-6 text-emerald-500 dark:text-emerald-400 mb-1" />
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Carbs left</span>
                    <span className={`text-xl font-bold ${leftAfterThisMeal.carbs < 0 ? 'text-red-500 dark:text-red-400' : 'text-foreground'}`}>
                      <AnimatedNumber value={leftAfterThisMeal.carbs} suffix="g" showOverWhenNegative className={leftAfterThisMeal.carbs < 0 ? 'text-red-500 dark:text-red-400' : ''} />
                    </span>
                  </motion.div>
                  <motion.div
                    className="rounded-2xl bg-white dark:bg-slate-800/60 border border-amber-200/60 dark:border-amber-500/20 p-4 shadow-sm flex flex-col items-center gap-1"
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <Droplets className="w-6 h-6 text-amber-500 dark:text-amber-400 mb-1" />
                    <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Fats left</span>
                    <span className={`text-xl font-bold ${leftAfterThisMeal.fats < 0 ? 'text-red-500 dark:text-red-400' : 'text-foreground'}`}>
                      <AnimatedNumber value={leftAfterThisMeal.fats} suffix="g" showOverWhenNegative className={leftAfterThisMeal.fats < 0 ? 'text-red-500 dark:text-red-400' : ''} />
                    </span>
                  </motion.div>
                </div>
              )}
            </div>

            {/* SAUCES - Restaurant-specific; selection updates macros and Log to Tracker */}
            {restaurantSauces.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
                    <BottleWine className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-foreground font-medium">Sauces</p>
                </div>
                <p className="text-muted-foreground text-xs mb-2">Add sauces to include their calories and macros in your log.</p>
                <SauceSelector
                  sauces={restaurantSauces}
                  selectedSauceIds={selectedSauceIds}
                  onToggleSauce={toggleSauceSelection}
                  isLoading={isLoadingSauces}
                />
                {selectedSauceIds.length > 0 && (
                  <p className="text-amber-600 dark:text-amber-400 text-xs mt-2">
                    +{sauceMacrosSum.calories} Calories from sauces. Log to tracker to reflect the updated total.
                  </p>
                )}
              </div>
            )}

            {/* SUGGESTED SWAPS - Uses selectedMealSwaps (same as log modal) */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-lg flex items-center justify-center">
                  <ArrowRightLeft className="w-4 h-4 text-white" />
                </div>
                <p className="text-foreground font-medium">Suggested Swaps</p>
              </div>
              <div className="space-y-2">
                {isLoadingSwaps ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">Loading swaps...</div>
                ) : selectedMealSwaps.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No swaps available for this restaurant item.
                  </div>
                ) : (
                  selectedMealSwaps.map((swap) => {
                    const isSelected = selectedSwapIds.includes(swap.id);
                    const quantity = selectedSwapQuantities[swap.id] ?? swap.quantityConfig?.defaultQuantity ?? 1;
                    const delta = scaleSwapDelta(swap.deltaMacros, quantity);
                    return (
                      <div
                        key={swap.id}
                        className={`bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border rounded-2xl p-4 ${isSelected ? 'border-indigo-500/50 bg-indigo-500/20' : 'border-indigo-500/30'
                          }`}
                      >
                        <p className="text-foreground/80 text-sm font-medium leading-snug">{swap.label}</p>
                        <p className="text-muted-foreground text-xs mt-1 capitalize">
                          {getSwapDescription(delta)}
                        </p>
                        {swap.quantityConfig && isSelected && quantity > 1 && (
                          <p className="text-indigo-600 dark:text-indigo-300 text-[11px] mt-2 font-medium">
                            Applied to {quantity} {swap.quantityConfig.unitLabel}{quantity === 1 ? '' : 's'}
                          </p>
                        )}
                        <SwapDeltaSummary delta={delta} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* SIMILAR OPTIONS - Only show if no modifications/alternatives exist */}
            {similarMeals.length > 0 && selectedMealSwaps.length === 0 && (
              <div className="mb-6">
                <p className="text-foreground text-sm font-semibold mb-3">Similar Options</p>
                {isLoadingSimilar ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">Loading similar meals...</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    {similarMeals.map(similar => (
                      <div
                        key={similar.id}
                        className="bg-gradient-to-br from-card to-muted dark:from-gray-900 dark:to-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all cursor-pointer overflow-hidden hover:border-cyan-500/50 hover:scale-[1.02] group relative border border-border"
                        onClick={() => {
                          // Navigate to meal detail - would need to be handled by parent
                          window.location.href = `#meal-${similar.id}`;
                        }}
                      >
                        {/* Image Container */}
                        <div
                          className="relative w-full overflow-hidden rounded-t-2xl bg-gradient-to-br from-muted to-muted/50"
                          style={{
                            aspectRatio: '16 / 9',
                            padding: '10px'
                          }}
                        >
                          {/* Meal Image */}
                          {similar.image && similar.image !== '/placeholder-food.jpg' && similar.image !== '' ? (
                            <div className="w-full h-full flex items-center justify-center">
                              <img
                                src={similar.image}
                                alt={similar.name}
                                className="w-full h-full object-contain object-center"
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'contain',
                                  objectPosition: 'center',
                                  display: 'block',
                                  maxWidth: '100%',
                                  maxHeight: '100%'
                                }}
                                onError={(e) => {
                                  // Fallback to default.png if meal image fails
                                  e.currentTarget.src = '/logos/default.png';
                                  e.currentTarget.onerror = null;
                                }}
                              />
                            </div>
                          ) : (
                            /* Fallback to default.png if no meal image */
                            <div className="w-full h-full flex items-center justify-center">
                              <img
                                src="/logos/default.png"
                                alt="Default meal"
                                className="w-full h-full object-contain object-center"
                                style={{ maxWidth: '100%', maxHeight: '100%' }}
                                onError={(e) => {
                                  // Final fallback - hide image if default.png also fails
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          {/* Gradient overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-background dark:from-gray-950 via-background/20 dark:via-gray-950/20 to-transparent pointer-events-none" />
                        </div>

                        <div className="p-2.5">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0 pr-1">
                              <h3 className="text-foreground mb-0.5 font-semibold text-xs line-clamp-2 break-words leading-tight">{similar.name}</h3>
                              <div className="flex items-center gap-1 min-w-0">
                                <p className="text-muted-foreground text-[10px] truncate">{similar.restaurant}</p>
                              </div>
                              {similar.distance !== undefined && similar.distance !== null && (
                                <p className="text-muted-foreground mt-0.5 text-[9px]">{similar.distance.toFixed(1)} mi</p>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-1 text-[9px]">
                            <div className="bg-gradient-to-br from-pink-500/20 to-rose-500/20 rounded-md p-1 text-center border border-pink-500/30">
                              <div className="flex items-center justify-center mb-0.5">
                                <Flame className="w-2 h-2 text-pink-400" />
                              </div>
                              <p className="text-foreground font-bold text-[10px]">{similar.calories}</p>
                              <p className="text-pink-600 dark:text-pink-300/70 text-[8px]">cal</p>
                            </div>
                            <div className="bg-gradient-to-br from-cyan-400/20 to-blue-500/20 rounded-md p-1 text-center border border-cyan-400/30">
                              <div className="flex items-center justify-center mb-0.5">
                                <Zap className="w-2 h-2 text-cyan-400" />
                              </div>
                              <p className="text-foreground font-bold text-[10px]">{similar.protein}g</p>
                              <p className="text-cyan-600 dark:text-cyan-300/70 text-[8px]">pro</p>
                            </div>
                            <div className="bg-gradient-to-br from-green-400/20 to-emerald-500/20 rounded-md p-1 text-center border border-green-400/30">
                              <div className="flex items-center justify-center mb-0.5">
                                <TrendingUp className="w-2 h-2 text-green-400" />
                              </div>
                              <p className="text-foreground font-bold text-[10px]">{similar.carbs}g</p>
                              <p className="text-green-600 dark:text-green-300/70 text-[8px]">carb</p>
                            </div>
                            <div className="bg-gradient-to-br from-amber-400/20 to-orange-500/20 rounded-md p-1 text-center border border-amber-400/30">
                              <div className="flex items-center justify-center mb-0.5">
                                <div className="w-2 h-2 rounded-full bg-amber-400" />
                              </div>
                              <p className="text-foreground font-bold text-[10px]">{similar.fats}g</p>
                              <p className="text-amber-300/70 text-[8px]">fat</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* --- ACTION BUTTONS (Inside scrollable content, only visible when scrolled to bottom) --- */}
            <div className="mt-4 mb-8 space-y-3" style={{ height: '96px' }}>
              <button
                onClick={() => {
                  if (!isPremium) {
                    onPremiumFeatureAttempt?.();
                    return;
                  }
                  setShowLogModal(true);
                }}
                className="w-full bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-[#020617] font-bold text-sm py-4 rounded-2xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <Plus className="w-3.5 h-3.5" />
                {effectiveMacros.calories !== meal.calories
                  ? `Log to Daily Tracker • ${effectiveMacros.calories} cal`
                  : 'Log to Daily Tracker'}
              </button>

              <button
                onClick={() => setShowManualModal(true)}
                className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-sm py-4 rounded-2xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                Add Meal Manually
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* --- LOG MODAL (CUSTOMIZE) --- */}
      {showLogModal && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-gradient-to-br from-card to-muted border-t border-border rounded-t-3xl p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-card-foreground font-semibold">Customize Your Meal</h2>
              <button onClick={() => {
                setShowLogModal(false);
                setSelectedSwapIds([]);
                setSelectedSwapQuantities({});
                setSelectedSauceIds([]);
              }} className="text-muted-foreground hover:text-foreground p-2">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-muted-foreground text-sm mb-4">
              {selectedMealSwaps.length > 0 && selectedMealSwaps[0]?.isModification !== false
                ? 'Customize this meal with these modifications:'
                : 'Alternative options:'}
            </p>

            {/* Sauces in modal - same as on card */}
            <div className="relative mb-4">
              {!isPremium && restaurantSauces.length > 0 && (
                <button
                  type="button"
                  onClick={() => onPremiumFeatureAttempt?.()}
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-sm"
                >
                  <div className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25">
                    Unlock premium tools
                  </div>
                </button>
              )}

              {restaurantSauces.length > 0 && (
                <div className={isPremium ? '' : 'pointer-events-none blur-[2px] opacity-60'}>
                  <SauceSelector
                    sauces={restaurantSauces}
                    selectedSauceIds={selectedSauceIds}
                    onToggleSauce={toggleSauceSelection}
                    isLoading={isLoadingSauces}
                    disabled={!isPremium}
                  />
                </div>
              )}
            </div>

            <div className="relative space-y-2 mb-6">
              {!isPremium && (
                <button
                  type="button"
                  onClick={() => onPremiumFeatureAttempt?.()}
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-sm"
                >
                  <div className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25">
                    Unlock premium tools
                  </div>
                </button>
              )}

              <div className={isPremium ? '' : 'pointer-events-none blur-[2px] opacity-60'}>
                {isLoadingSwaps ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">Loading swaps...</div>
                ) : selectedMealSwaps.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No swaps available for this restaurant item.
                  </div>
                ) : (
                  selectedMealSwaps.map(swap => {
                    const isSelected = selectedSwapIds.includes(swap.id);
                    const quantity = selectedSwapQuantities[swap.id] ?? swap.quantityConfig?.defaultQuantity ?? 1;
                    const delta = scaleSwapDelta(swap.deltaMacros, quantity);
                    return (
                      <div
                        key={swap.id}
                        className={`rounded-2xl border transition-all ${isSelected
                          ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-500 shadow-lg shadow-cyan-500/20'
                          : 'bg-muted border-border hover:border-border/80'
                          }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSwap(swap.id)}
                          className="w-full flex items-center justify-between p-4"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-cyan-400 bg-cyan-500' : 'border-border'}`}>
                              {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <div className="text-left">
                              <p className="text-card-foreground text-sm font-medium">{swap.label}</p>
                              <p className="text-muted-foreground text-xs capitalize">
                                {getSwapDescription(delta)}
                              </p>
                              <SwapDeltaSummary delta={delta} />
                            </div>
                          </div>
                        </button>

                        {isSelected && swap.quantityConfig && swap.quantityConfig.max > 1 && (
                          <div className="flex items-center justify-between border-t border-cyan-500/20 px-4 pb-4 pt-3">
                            <div>
                              <p className="text-card-foreground text-xs font-medium">Adjust {swap.quantityConfig.unitLabel} count</p>
                              <p className="text-muted-foreground text-[11px]">
                                Update the logged macro change for {quantity} {swap.quantityConfig.unitLabel}{quantity === 1 ? '' : 's'}.
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => updateSwapQuantity(swap.id, quantity - 1)}
                                disabled={quantity <= swap.quantityConfig.min}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                -
                              </button>
                              <div className="min-w-[70px] rounded-full border border-border bg-background px-3 py-1 text-center text-xs font-semibold text-foreground">
                                {quantity} {swap.quantityConfig.unitLabel}{quantity === 1 ? '' : 's'}
                              </div>
                              <button
                                type="button"
                                onClick={() => updateSwapQuantity(swap.id, quantity + 1)}
                                disabled={quantity >= swap.quantityConfig.max}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Live Macro Preview (meal + swaps + sauces) */}
            {(selectedSwapIds.length > 0 || selectedSauceIds.length > 0) && (
              <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-2xl p-4 mb-6">
                <p className="text-purple-300 text-xs mb-2 uppercase font-bold">Updated Macros</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-card-foreground font-bold">{effectiveMacros.calories}</p>
                    <p className="text-muted-foreground text-[10px]">cal</p>
                  </div>
                  <div>
                    <p className="text-card-foreground font-bold">{effectiveMacros.protein}g</p>
                    <p className="text-muted-foreground text-[10px]">pro</p>
                  </div>
                  <div>
                    <p className="text-card-foreground font-bold">{effectiveMacros.carbs}g</p>
                    <p className="text-muted-foreground text-[10px]">carbs</p>
                  </div>
                  <div>
                    <p className="text-card-foreground font-bold">{effectiveMacros.fats}g</p>
                    <p className="text-muted-foreground text-[10px]">fats</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => {
                setShowLogModal(false);
                setSelectedSwapIds([]);
                setSelectedSwapQuantities({});
                setSelectedSauceIds([]);
              }} className="flex-1 h-12 rounded-full bg-muted border border-border text-foreground font-medium hover:bg-muted/80">
                Cancel
              </button>
              <button onClick={isPremium ? handleConfirmLog : () => onPremiumFeatureAttempt?.()} className="flex-1 h-12 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium shadow-lg shadow-green-500/30 flex items-center justify-center">
                <Plus className="mr-2 w-5 h-5" />
                {isPremium ? 'Log Meal' : 'Unlock to log'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MANUAL ADD MODAL --- */}
      {showManualModal && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-gradient-to-br from-card to-muted border-t border-border rounded-t-3xl p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-card-foreground font-semibold">Add Meal Manually</h2>
              <button onClick={() => setShowManualModal(false)} className="text-muted-foreground hover:text-foreground p-2">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-foreground/80 text-xs mb-1.5 block ml-1">Meal Name</label>
                <input
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="e.g. Grilled Chicken Salad"
                  className="w-full h-12 rounded-xl bg-muted/50 border border-border text-foreground px-4 placeholder:text-muted-foreground focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-foreground/80 text-xs mb-1.5 block ml-1">Calories</label>
                <input
                  type="number"
                  value={manualCals}
                  onChange={e => setManualCals(e.target.value)}
                  placeholder="500"
                  className="w-full h-12 rounded-xl bg-muted/50 border border-border text-foreground px-4 placeholder:text-muted-foreground focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-foreground/80 text-xs mb-1.5 block ml-1">Protein (g)</label>
                  <input type="number" value={manualPro} onChange={e => setManualPro(e.target.value)} placeholder="30" className="w-full h-12 rounded-xl bg-muted/50 border border-border text-foreground px-3 placeholder:text-muted-foreground focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="text-foreground/80 text-xs mb-1.5 block ml-1">Carbs (g)</label>
                  <input type="number" value={manualCarbs} onChange={e => setManualCarbs(e.target.value)} placeholder="40" className="w-full h-12 rounded-xl bg-muted/50 border border-border text-foreground px-3 placeholder:text-muted-foreground focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="text-foreground/80 text-xs mb-1.5 block ml-1">Fats (g)</label>
                  <input type="number" value={manualFats} onChange={e => setManualFats(e.target.value)} placeholder="15" className="w-full h-12 rounded-xl bg-muted/50 border border-border text-foreground px-3 placeholder:text-muted-foreground focus:outline-none focus:border-cyan-500" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowManualModal(false)} className="flex-1 h-12 rounded-full bg-muted border border-border text-foreground font-medium hover:bg-muted/80">
                Cancel
              </button>
              <button
                onClick={handleManualSubmit}
                disabled={!isManualValid}
                className={`flex-1 h-12 rounded-full font-medium shadow-lg flex items-center justify-center transition-all ${isManualValid ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-cyan-500/30 hover:shadow-cyan-500/50' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
              >
                <Check className="mr-2 w-5 h-5" />
                Add Meal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animation Style */}
      <style jsx>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}
