"use client";

import { useMemo } from "react";
import { Star, Heart, Flame, Beef, Wheat, Droplets } from "lucide-react";
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
  const regularMetricCardBase = "min-w-0 rounded-lg border p-1.5 text-center shadow-sm sm:rounded-xl sm:p-2";

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
            <div className={`${compactMetricCardBase} border-pink-400/70 bg-gradient-to-br from-pink-300 to-rose-300 dark:border-pink-500/30 dark:from-pink-500/20 dark:to-rose-500/20`}>
              <p className="text-black dark:text-pink-100 font-bold text-[10px] leading-tight">
                {meal.calories}
              </p>
              <p className="text-black dark:text-pink-100/80 text-[8px] leading-tight">
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
            <div className="min-w-0 rounded-lg border border-cyan-400/70 bg-gradient-to-br from-cyan-300 to-blue-300 px-1.5 py-1 text-center dark:border-cyan-400/30 dark:from-cyan-400/20 dark:to-blue-500/20">
              <p className="text-black dark:text-cyan-100 font-bold text-[10px] leading-tight">
                {meal.protein}g
              </p>
              <p className="text-black dark:text-cyan-100/80 text-[8px] leading-tight">
                pro
              </p>
            </div>

            {/* Carbs */}
            <div className="min-w-0 rounded-lg border border-green-400/70 bg-gradient-to-br from-green-300 to-emerald-300 px-1.5 py-1 text-center dark:border-green-400/30 dark:from-green-400/20 dark:to-emerald-500/20">
              <p className="text-black dark:text-green-100 font-bold text-[10px] leading-tight">
                {meal.carbs}g
              </p>
              <p className="text-black dark:text-green-100/80 text-[8px] leading-tight">
                carb
              </p>
            </div>

            {/* Fat */}
            <div className="min-w-0 rounded-lg border border-amber-400/70 bg-gradient-to-br from-amber-300 to-orange-300 px-1.5 py-1 text-center dark:border-amber-400/30 dark:from-amber-400/20 dark:to-orange-500/20">
              <p className="text-black dark:text-amber-100 font-bold text-[10px] leading-tight">
                {meal.fats}g
              </p>
              <p className="text-black dark:text-amber-100/80 text-[8px] leading-tight">
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
      className={`h-full flex flex-col bg-gradient-to-br from-card to-muted dark:from-gray-900 dark:to-gray-800 rounded-3xl shadow-xl hover:shadow-2xl transition-all cursor-pointer overflow-hidden hover:border-cyan-500/50 hover:scale-[1.02] group relative w-full ${isGrocery
        ? 'border-2 border-green-500/30'
        : 'border border-border'
        }`}
    >
      {/* Image Container */}
      <div
        className="relative w-full overflow-hidden rounded-t-3xl border-b border-border/60 bg-card"
        style={{
          aspectRatio: '16 / 9',
          padding: '16px'
        }}
      >
        {/* Restaurant Logo - Fills entire image area */}
        <div className="flex h-full w-full items-center justify-center rounded-2xl border border-border/70 bg-white p-3 shadow-sm dark:bg-gray-900">
          <img
            src={logoSrcWithCacheBust}
            alt={restaurantName}
            className="h-full w-full object-contain object-center"
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

        {meal.rating && (
          <div className="absolute bottom-3 left-3 flex items-center gap-2 z-10">
            <div className="bg-cyan-500/90 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1">
              <Star className="w-3 h-3 text-white fill-white" />
              <span className="text-white text-xs font-bold">{meal.rating}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-2.5 sm:p-4">
        <div className="mb-2.5 flex items-start gap-2 sm:mb-3 sm:gap-3">
          <div className="flex-1 min-w-0">
            <p className="mb-1 truncate text-[11px] font-medium leading-tight text-muted-foreground sm:text-base">
              {restaurantName}
            </p>
            <h3 className="mt-0.5 line-clamp-2 break-words text-sm font-semibold leading-tight text-foreground sm:text-lg">
              {meal.name}
            </h3>
            {meal.distance !== undefined && meal.distance !== null && (
              <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground sm:text-xs">{meal.distance.toFixed(1)} miles away</p>
            )}
          </div>
          {onToggleFavorite && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.();
              }}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground transition-colors hover:bg-muted/90 dark:bg-gray-900/90 dark:hover:bg-gray-800/90 sm:h-8 sm:w-8"
              aria-label={isFavorite ? "Remove from favorites" : "Save meal"}
            >
              <Heart
                className={`h-3.5 w-3.5 transition-colors sm:h-4 sm:w-4 ${isFavorite ? "fill-pink-500 text-pink-500" : ""}`}
              />
            </button>
          )}
        </div>

        <div className="mt-auto grid grid-cols-2 gap-1.5 text-[10px] min-[520px]:grid-cols-4 sm:ml-1 sm:gap-2 sm:text-xs">
          <div className={`${regularMetricCardBase} border-pink-400/70 bg-gradient-to-br from-pink-300 to-rose-300 dark:border-pink-500/30 dark:from-pink-500/20 dark:to-rose-500/20`}>
            <div className="mb-0.5 flex items-center justify-center sm:mb-1">
              <Flame className="h-2.5 w-2.5 text-black dark:text-pink-400 sm:h-3 sm:w-3" />
            </div>
            <p className="truncate text-[11px] font-bold leading-tight text-foreground sm:text-xs">{meal.calories}</p>
            <p className="text-[9px] leading-tight text-black dark:text-pink-100/80 sm:text-[10px]">cal</p>
            {!logReady ? (
              <p className="mt-0.5 text-[8px] leading-tight text-muted-foreground sm:text-[9px]">-</p>
            ) : remainingCalories !== null ? (
              <p className={`mt-0.5 truncate text-[8px] leading-tight sm:text-[9px] ${remainingCalories >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
                }`}>
                <span className="sm:hidden">{remainingCalories >= 0 ? '+' : ''}{remainingCalories}</span>
                <span className="hidden sm:inline">{remainingCalories >= 0 ? '+' : ''}{remainingCalories} left</span>
              </p>
            ) : null}
          </div>
          <div className="min-w-0 rounded-lg border border-cyan-400/70 bg-gradient-to-br from-cyan-300 to-blue-300 p-1.5 text-center dark:border-cyan-400/30 dark:from-cyan-400/20 dark:to-blue-500/20 sm:rounded-md sm:p-2">
            <div className="mb-0.5 flex items-center justify-center sm:mb-1">
              <Beef className="h-2.5 w-2.5 text-black dark:text-cyan-400 sm:h-3 sm:w-3" />
            </div>
            <p className="truncate text-[11px] font-bold leading-tight text-foreground sm:text-xs">{meal.protein}g</p>
            <p className="text-[9px] leading-tight text-black dark:text-cyan-100/80 sm:text-[10px]">pro</p>
          </div>
          <div className="min-w-0 rounded-lg border border-green-400/70 bg-gradient-to-br from-green-300 to-emerald-300 p-1.5 text-center dark:border-green-400/30 dark:from-green-400/20 dark:to-emerald-500/20 sm:rounded-md sm:p-2">
            <div className="mb-0.5 flex items-center justify-center sm:mb-1">
              <Wheat className="h-2.5 w-2.5 text-black dark:text-green-400 sm:h-3 sm:w-3" />
            </div>
            <p className="truncate text-[11px] font-bold leading-tight text-foreground sm:text-xs">{meal.carbs}g</p>
            <p className="text-[9px] leading-tight text-black dark:text-green-100/80 sm:text-[10px]">carb</p>
          </div>
          <div className="min-w-0 rounded-lg border border-amber-400/70 bg-gradient-to-br from-amber-300 to-orange-300 p-1.5 text-center dark:border-amber-400/30 dark:from-amber-400/20 dark:to-orange-500/20 sm:rounded-md sm:p-2">
            <div className="mb-0.5 flex items-center justify-center sm:mb-1">
              <Droplets className="h-2.5 w-2.5 text-black dark:text-amber-400 sm:h-3 sm:w-3" />
            </div>
            <p className="truncate text-[11px] font-bold leading-tight text-foreground sm:text-xs">{meal.fats}g</p>
            <p className="text-[9px] leading-tight text-black dark:text-amber-100/80 sm:text-[10px]">fat</p>
          </div>
        </div>
      </div>
    </div>
  );
}
