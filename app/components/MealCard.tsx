"use client";

import { useMemo } from "react";
import { Star, Heart, Flame, Zap, TrendingUp } from "lucide-react";
import type { Meal, UserProfile } from "../types"; // Use shared types
import type { LoggedMeal } from "./LogScreen";
import { useNutrition } from "../contexts/NutritionContext";
import { getRestaurantLogoUrl } from "@/lib/image-utils";

type Props = {
  meal: Meal;
  isFavorite: boolean;
  onClick: () => void;
  showMatchScore?: boolean;
  onToggleFavorite?: () => void;
  compact?: boolean; // For chat view - smaller, more compact layout
  userProfile?: UserProfile; // Optional - for displaying remaining calories
  loggedMeals?: LoggedMeal[]; // Optional - for calculating remaining calories
};

export function MealCard({ meal, isFavorite, onClick, onToggleFavorite, compact = false, userProfile, loggedMeals = [] }: Props) {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const { targets, todaysTotals, isLoading: isNutritionLoading } = useNutrition();
  const shouldShowRemaining = userProfile !== undefined || loggedMeals.length > 0;

  const targetCalories = useMemo(() => {
    if (!shouldShowRemaining) return null;

    if (typeof targets?.targetCalories === 'number') {
      return targets.targetCalories;
    }

    if (targets?.targetCalories) {
      const parsedTargets = Number(targets.targetCalories);
      if (!Number.isNaN(parsedTargets)) {
        return parsedTargets;
      }
    }

    if (typeof userProfile?.target_calories === 'number') {
      return userProfile.target_calories;
    }

    const parsedProfile = Number(userProfile?.target_calories);
    return Number.isNaN(parsedProfile) ? null : parsedProfile;
  }, [shouldShowRemaining, targets?.targetCalories, userProfile?.target_calories]);

  const consumedCalories = useMemo(() => {
    if (!shouldShowRemaining) return null;

    if (typeof todaysTotals?.consumedCalories === 'number') {
      return Math.round(todaysTotals.consumedCalories);
    }

    const todaysMeals = loggedMeals.filter((loggedMeal) => loggedMeal.date === todayStr);
    return todaysMeals.reduce((sum, loggedMeal) => {
      const calories = Number(loggedMeal.meal.calories ?? 0);
      return sum + (Number.isNaN(calories) ? 0 : Math.round(calories));
    }, 0);
  }, [shouldShowRemaining, todaysTotals, loggedMeals, todayStr]);

  const logReady = shouldShowRemaining && !isNutritionLoading && targetCalories !== null && consumedCalories !== null;

  const caloriesRemainingFromLog = useMemo(() => {
    if (!logReady || targetCalories === null || consumedCalories === null) {
      return null;
    }

    return Math.round(targetCalories - consumedCalories);
  }, [logReady, targetCalories, consumedCalories]);

  // Per meal card: remainingIfEat = caloriesRemainingFromLog - meal.calories
  const remainingCalories = useMemo(() => {
    if (!logReady || caloriesRemainingFromLog === null) return null;

    // Get meal calories (ensure numeric)
    const mealCalories = Number(meal.calories ?? 0);
    const safeMealCalories = isNaN(mealCalories) ? 0 : Math.round(mealCalories);

    // Remaining if this meal is eaten
    const remainingIfEat = caloriesRemainingFromLog - safeMealCalories;

    // Dev log
    if (process.env.NODE_ENV === 'development' && logReady) {
      console.log('[calories]', {
        caloriesRemainingFromLog,
        selectedMealCalories: safeMealCalories,
        displayRemaining: remainingIfEat,
        mealName: meal.name
      });
    }

    return remainingIfEat;
  }, [logReady, caloriesRemainingFromLog, meal.calories, meal.name]);

  // Removed useEffect - using derived values only (no state updates based on dependencies)
  // Extract restaurant name (handle both restaurant_name from Supabase and restaurant from Meal type)
  const restaurantName = meal.restaurant_name || meal.restaurant || "Unknown";
  const compactRestaurantLabel = useMemo(() => {
    const normalized = restaurantName.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return { firstLine: "Unknown", secondLine: null as string | null };
    }

    const maxCharsPerLine = 12;

    if (normalized.length <= maxCharsPerLine) {
      return { firstLine: normalized, secondLine: null as string | null };
    }

    const words = normalized.split(' ');
    if (words.length === 1) {
      return { firstLine: normalized, secondLine: null as string | null };
    }

    let firstLine = "";
    let secondLine = "";

    for (const word of words) {
      const nextFirstLine = firstLine ? `${firstLine} ${word}` : word;
      if (nextFirstLine.length <= maxCharsPerLine || !firstLine) {
        firstLine = nextFirstLine;
        continue;
      }

      secondLine = secondLine ? `${secondLine} ${word}` : word;
    }

    return {
      firstLine,
      secondLine: secondLine || null,
    };
  }, [restaurantName]);

  const logoSrc = getRestaurantLogoUrl(restaurantName, meal.restaurantLogoUrl);
  const logoSrcWithCacheBust = `${logoSrc}?v=${meal.id}`;

  // Check if it's a grocery/hot bar item
  const category = meal.category as string | undefined;
  const isGrocery = category === 'grocery' ||
    category === 'Grocery' ||
    category === 'Hot Bar';
  const compactMetricCardBase = "min-w-0 rounded-xl border px-1.5 py-1.5 text-center shadow-sm";
  const remainingCaloriesLabel = remainingCalories === null
    ? null
    : remainingCalories >= 0
      ? `Leaves ${remainingCalories} cal`
      : `Over by ${Math.abs(remainingCalories)} cal`;
  const remainingStatusClasses = remainingCalories !== null && remainingCalories >= 0
    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
    : "border-red-400/25 bg-red-500/10 text-red-600 dark:text-red-300";
  const regularMetricCardBase = "rounded-lg border p-2 text-center shadow-sm";

  // Compact mode: horizontal layout matching reference image (340px × 75px)
  if (compact) {
    return (
      <div
        onClick={onClick}
        className="group relative min-h-[108px] w-full cursor-pointer overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-slate-50 to-white shadow-lg transition-all hover:border-cyan-500/40 hover:shadow-xl sm:max-w-[372px] dark:border-gray-700 dark:bg-gradient-to-br dark:from-gray-900 dark:via-gray-800 dark:to-gray-800"
      >
        <div className="flex h-full flex-col px-3.5 py-3">
          <h3 className="line-clamp-2 break-words pr-9 text-[14px] font-bold leading-[1.15] text-foreground">
            {meal.name}
          </h3>

          <div className="mt-2.5 grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
            {/* Left Logo - Restaurant Logo */}
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <img
                src={logoSrcWithCacheBust}
                alt={restaurantName}
                className="h-full w-full object-contain p-1.5"
                onError={(e) => {
                  const fallbackSrc = `/logos/default.png?v=${meal.id}`;
                  if (e.currentTarget.src.includes('/logos/default.png')) {
                    e.currentTarget.style.display = 'none';
                    return;
                  }

                  e.currentTarget.onerror = null;
                  e.currentTarget.src = fallbackSrc;
                }}
              />
            </div>

            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              {/* Restaurant */}
              <div className="w-[84px] flex-shrink-0">
                <p className={`text-[10px] font-medium leading-[1.1] tracking-[0.01em] text-slate-500 dark:text-slate-400 ${compactRestaurantLabel.secondLine ? '' : 'text-center'}`}>
                  <span className="block whitespace-normal break-normal">{compactRestaurantLabel.firstLine}</span>
                  {compactRestaurantLabel.secondLine && (
                    <span className="mt-0.5 block whitespace-normal break-normal">{compactRestaurantLabel.secondLine}</span>
                  )}
                </p>
              </div>

              {/* Right - Nutritional Boxes */}
              <div className="grid grid-cols-4 gap-1.5">
            {/* Calories */}
            <div className={`${compactMetricCardBase} border-pink-200 bg-pink-50/95 dark:border-pink-500/20 dark:bg-pink-500/10`}>
              <p className="text-pink-600 dark:text-pink-300 font-bold text-[10px] leading-tight">
                {meal.calories}
              </p>
              <p className="text-pink-500 dark:text-pink-300/80 text-[8px] leading-tight">
                cal
              </p>
              {!logReady ? (
                <p className="text-[7px] leading-tight text-muted-foreground">—</p>
              ) : remainingCalories !== null ? (
                <p className={`text-[7px] leading-tight ${remainingCalories >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
                  }`}>
                  {remainingCalories >= 0 ? '+' : ''}{remainingCalories}
                </p>
              ) : null}
            </div>

            {/* Protein */}
            <div className="min-w-0 rounded-lg bg-blue-100 px-1.5 py-1 text-center dark:bg-blue-900/30">
              <p className="text-blue-600 dark:text-blue-400 font-bold text-[10px] leading-tight">
                {meal.protein}g
              </p>
              <p className="text-blue-500 dark:text-blue-400 text-[8px] leading-tight">
                pro
              </p>
            </div>

            {/* Carbs */}
            <div className="min-w-0 rounded-lg bg-green-100 px-1.5 py-1 text-center dark:bg-green-900/30">
              <p className="text-green-600 dark:text-green-400 font-bold text-[10px] leading-tight">
                {meal.carbs}g
              </p>
              <p className="text-green-500 dark:text-green-400 text-[8px] leading-tight">
                carb
              </p>
            </div>

            {/* Fat */}
            <div className="min-w-0 rounded-lg bg-orange-100 px-1.5 py-1 text-center dark:bg-orange-900/30">
              <p className="text-orange-600 dark:text-orange-400 font-bold text-[10px] leading-tight">
                {meal.fats}g
              </p>
              <p className="text-orange-500 dark:text-orange-400 text-[8px] leading-tight">
                fat
              </p>
            </div>
              </div>
            </div>
          </div>

          {/* Favorite Button - Top Right (with space for nutritional boxes) */}
          {onToggleFavorite && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.();
              }}
              className="absolute right-2 top-2 z-10 rounded-full border border-border bg-background/85 p-1 backdrop-blur-md transition-colors hover:bg-muted/90 dark:bg-gray-900/85 dark:hover:bg-gray-800/90"
            >
              <Heart
                className={`w-3 h-3 transition-colors ${isFavorite ? "fill-pink-500 text-pink-500" : "text-muted-foreground"
                  }`}
              />
            </button>
          )}

        </div>
      </div>
    );
  }

  // Regular mode: vertical card layout for grid/list views
  return (
    <div
      onClick={onClick}
      className={`group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-xl bg-card shadow-md transition-all hover:border-cyan-500/40 hover:shadow-lg ${isGrocery
        ? 'border-2 border-green-500/30'
        : 'border border-border'
        }`}
    >
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <div className="mb-3 flex items-start gap-3">
          {onToggleFavorite && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.();
              }}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-background/80 text-muted-foreground transition-colors hover:bg-muted/90 dark:bg-gray-900/80 dark:hover:bg-gray-800/90"
              aria-label={isFavorite ? "Remove from favorites" : "Save meal"}
            >
              <Heart
                className={`h-4 w-4 transition-colors ${isFavorite ? "fill-pink-500 text-pink-500" : ""}`}
              />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <p className="mb-1 truncate text-xs font-medium text-muted-foreground sm:text-sm">
              {restaurantName}
            </p>
            <h3 className="mt-0.5 line-clamp-2 break-words text-base font-semibold leading-snug text-foreground sm:text-lg">
              {meal.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {meal.distance !== undefined && meal.distance !== null ? (
                <span>{meal.distance.toFixed(1)} mi</span>
              ) : null}
              {meal.rating ? (
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-cyan-400 text-cyan-400" />
                  {meal.rating}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {remainingCaloriesLabel ? (
          <div className={`mb-3 rounded-lg border px-3 py-2 ${remainingStatusClasses}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                After this meal
              </p>
              <p className="text-sm font-bold">{remainingCaloriesLabel}</p>
            </div>
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className={`${regularMetricCardBase} border-pink-200/80 bg-pink-50/90 dark:border-pink-500/20 dark:bg-pink-500/10`}>
            <div className="flex items-center justify-center mb-1">
              <Flame className="w-3 h-3 text-pink-500 dark:text-pink-300" />
            </div>
            <p className="text-foreground font-bold">{meal.calories}</p>
            <p className="text-pink-600 dark:text-pink-300/70 text-[10px]">cal</p>
            {!logReady ? (
              <p className="text-[9px] mt-0.5 text-muted-foreground">—</p>
            ) : null}
          </div>
          <div className="rounded-md border border-cyan-400/30 bg-gradient-to-br from-cyan-400/20 to-blue-500/20 p-2 text-center">
            <div className="flex items-center justify-center mb-1">
              <Zap className="w-3 h-3 text-cyan-400" />
            </div>
            <p className="text-foreground font-bold">{meal.protein}g</p>
            <p className="text-cyan-600 dark:text-cyan-300/70 text-[10px]">pro</p>
          </div>
          <div className="rounded-md border border-green-400/30 bg-gradient-to-br from-green-400/20 to-emerald-500/20 p-2 text-center">
            <div className="flex items-center justify-center mb-1">
              <TrendingUp className="w-3 h-3 text-green-400" />
            </div>
            <p className="text-foreground font-bold">{meal.carbs}g</p>
            <p className="text-green-600 dark:text-green-300/70 text-[10px]">carb</p>
          </div>
          <div className="rounded-md border border-amber-400/30 bg-gradient-to-br from-amber-400/20 to-orange-500/20 p-2 text-center">
            <div className="flex items-center justify-center mb-1">
              <div className="h-3 w-3 rounded-full bg-amber-400" />
            </div>
            <p className="text-foreground font-bold">{meal.fats}g</p>
            <p className="text-amber-600 dark:text-amber-300/70 text-[10px]">fat</p>
          </div>
        </div>
      </div>
    </div>
  );
}
