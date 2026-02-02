"use client";

import { useState, useEffect, useMemo } from "react";
import { Star, Heart, Flame, Zap, TrendingUp, AlertCircle, UtensilsCrossed } from "lucide-react";
import type { Meal, UserProfile } from "../types"; // Use shared types
import type { LoggedMeal } from "./LogScreen";
import { getLogo } from "@/utils/logos";

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
  
  // Determine if log data is ready (userProfile must exist)
  const logReady = userProfile !== undefined && userProfile !== null;
  
  // Calculate stable dependency key for today's meals (outside useMemo dependency array)
  const todaysMealsKey = useMemo(() => {
    if (!logReady) return '0-0';
    const todaysMeals = loggedMeals.filter(m => m.date === todayStr);
    const count = todaysMeals.length;
    const total = todaysMeals.reduce((sum, m) => {
      const cals = typeof m.meal.calories === 'number' ? m.meal.calories : parseFloat(m.meal.calories) || 0;
      return sum + (isNaN(cals) ? 0 : Math.round(cals));
    }, 0);
    return `${count}-${total}`;
  }, [loggedMeals, todayStr, logReady]);
  
  // Compute caloriesRemainingFromLog once (memoized) - base remaining from log data
  const caloriesRemainingFromLog = useMemo(() => {
    if (!logReady || !userProfile) return null;
    
    const targetCalories = typeof userProfile.target_calories === 'number' 
      ? userProfile.target_calories 
      : parseFloat(userProfile.target_calories as any) || 0;
    
    // Calculate today's consumed calories from log
    const todaysMeals = loggedMeals.filter(loggedMeal => loggedMeal.date === todayStr);
    const todaysConsumedCalories = todaysMeals.reduce((sum, loggedMeal) => {
      const calories = typeof loggedMeal.meal.calories === 'number' 
        ? loggedMeal.meal.calories 
        : (typeof loggedMeal.meal.calories === 'string' ? parseFloat(loggedMeal.meal.calories) : 0);
      return sum + (isNaN(calories) ? 0 : Math.round(calories));
    }, 0);
    
    // Base remaining: target - consumed
    return Math.round(targetCalories - todaysConsumedCalories);
  }, [logReady, userProfile?.target_calories, todaysMealsKey, todayStr]);
  
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
  const restaurantName = (meal as any).restaurant_name || meal.restaurant || "Unknown";
  
  // State to track logo source (with fallback to default.png)
  const [logoSrc, setLogoSrc] = useState(getLogo(restaurantName));
  const [logoVersion, setLogoVersion] = useState(Date.now().toString());
  
  // Reset logo src when meal changes and update version to bust cache
  useEffect(() => {
    const newLogoSrc = getLogo(restaurantName);
    setLogoSrc(newLogoSrc);
    // Update version to force browser to reload (especially useful in development)
    setLogoVersion(Date.now().toString());
  }, [meal.id, restaurantName]);

  // Add cache-busting query parameter to force browser to reload updated logos
  const logoSrcWithCacheBust = `${logoSrc}?v=${logoVersion}`;

  // Check for variable availability
  const hasVariableAvailability = meal.dietary_tags?.some(
    (tag: string) => tag === 'Location Varies' || tag === 'Seasonal'
  ) || false;

  // Check if it's a grocery/hot bar item
  const category = meal.category as string | undefined;
  const isGrocery = category === 'grocery' || 
                  category === 'Grocery' || 
                  category === 'Hot Bar';

  // Compact mode: horizontal layout matching reference image (340px × 75px)
  if (compact) {
    return (
      <div
        onClick={onClick}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl hover:shadow-2xl transition-all cursor-pointer overflow-hidden hover:border-cyan-500/50 group relative border border-gray-200 dark:border-gray-700"
        style={{
          width: '340px',
          height: '75px',
        }}
      >
        <div className="flex items-center h-full px-2.5 gap-2">
          {/* Left Logo - Restaurant Logo */}
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center overflow-hidden border border-gray-200 dark:border-gray-700">
            <img 
              src={logoSrcWithCacheBust} 
              alt={restaurantName}
              className="w-full h-full object-contain p-1"
              onError={(e) => {
                // Fallback to default.png if logo fails to load
                if (logoSrc !== '/logos/default.png') {
                  e.currentTarget.onerror = null; // Prevent infinite loop
                  setLogoSrc('/logos/default.png');
                } else {
                  // If default.png also fails, hide the image
                  e.currentTarget.style.display = 'none';
                }
              }}
            />
          </div>

          {/* Middle - Meal Name and Restaurant */}
          <div className="flex-1 min-w-0 flex flex-col justify-center pr-1.5">
            <h3 className="text-foreground text-sm font-bold leading-tight line-clamp-2 mb-0.5 break-words">
              {meal.name}
            </h3>
            <p className="text-muted-foreground text-[10px] truncate">
              {restaurantName}
            </p>
          </div>

          {/* Right - Nutritional Boxes */}
          <div className="flex-shrink-0 flex items-center gap-0.5 pr-7">
            {/* Calories */}
            <div className="bg-pink-100 dark:bg-pink-900/30 rounded-md px-1 py-0.5 text-center min-w-[40px]">
              <p className="text-pink-600 dark:text-pink-400 font-bold text-[10px] leading-tight">
                {meal.calories}
              </p>
              <p className="text-pink-500 dark:text-pink-400 text-[8px] leading-tight">
                cal
              </p>
              {!logReady ? (
                <p className="text-[7px] leading-tight text-muted-foreground">—</p>
              ) : remainingCalories !== null ? (
                <p className={`text-[7px] leading-tight ${
                  remainingCalories >= 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {remainingCalories >= 0 ? '+' : ''}{remainingCalories}
                </p>
              ) : null}
            </div>

            {/* Protein */}
            <div className="bg-blue-100 dark:bg-blue-900/30 rounded-md px-1 py-0.5 text-center min-w-[40px]">
              <p className="text-blue-600 dark:text-blue-400 font-bold text-[10px] leading-tight">
                {meal.protein}g
              </p>
              <p className="text-blue-500 dark:text-blue-400 text-[8px] leading-tight">
                pro
              </p>
            </div>

            {/* Carbs */}
            <div className="bg-green-100 dark:bg-green-900/30 rounded-md px-1 py-0.5 text-center min-w-[40px]">
              <p className="text-green-600 dark:text-green-400 font-bold text-[10px] leading-tight">
                {meal.carbs}g
              </p>
              <p className="text-green-500 dark:text-green-400 text-[8px] leading-tight">
                carb
              </p>
            </div>

            {/* Fat */}
            <div className="bg-orange-100 dark:bg-orange-900/30 rounded-md px-1 py-0.5 text-center min-w-[40px]">
              <p className="text-orange-600 dark:text-orange-400 font-bold text-[10px] leading-tight">
                {meal.fats}g
              </p>
              <p className="text-orange-500 dark:text-orange-400 text-[8px] leading-tight">
                fat
              </p>
            </div>
          </div>

          {/* Favorite Button - Top Right (with space for nutritional boxes) */}
          {onToggleFavorite && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.();
              }}
              className="absolute top-1 right-2 bg-background/80 dark:bg-gray-900/80 backdrop-blur-md rounded-full p-1 border border-border z-10 hover:bg-muted/90 dark:hover:bg-gray-800/90 transition-colors"
            >
              <Heart
                className={`w-3 h-3 transition-colors ${
                  isFavorite ? "fill-pink-500 text-pink-500" : "text-muted-foreground"
                }`}
              />
            </button>
          )}

          {/* Match Score Badge - Top Left */}
          {meal.matchScore && (
            <div className="absolute top-1 left-1 z-10">
              <div className="bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-lg">
                {meal.matchScore}%
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Regular mode: original vertical layout with image
  return (
    <div
      onClick={onClick}
      className={`bg-gradient-to-br from-card to-muted dark:from-gray-900 dark:to-gray-800 rounded-3xl shadow-xl hover:shadow-2xl transition-all cursor-pointer overflow-hidden hover:border-cyan-500/50 hover:scale-[1.02] group relative w-full ${
        isGrocery
          ? 'border-2 border-green-500/30'
          : 'border border-border'
      }`}
    >
      {/* Image Container */}
      <div 
        className="relative w-full overflow-hidden rounded-t-3xl bg-gradient-to-br from-muted to-muted/50"
        style={{
          aspectRatio: '16 / 9',
          padding: '16px'
        }}
      >
        {/* Restaurant Logo - Fills entire image area */}
        <div className="w-full h-full flex items-center justify-center">
          <img 
            src={logoSrcWithCacheBust} 
            alt={restaurantName}
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
              // Fallback to default.png if logo fails to load
              if (logoSrc !== '/logos/default.png') {
                e.currentTarget.onerror = null; // Prevent infinite loop
                setLogoSrc('/logos/default.png');
              } else {
                // If default.png also fails, hide the image
                e.currentTarget.style.display = 'none';
              }
            }}
          />
        </div>
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background dark:from-gray-950 via-background/20 dark:via-gray-950/20 to-transparent pointer-events-none" />
        
        {/* Match Badge */}
        {meal.matchScore && (
          <div className="absolute top-3 left-3 z-10">
            <div className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1 animate-in fade-in zoom-in">
              <span>{meal.matchScore}% Match</span>
            </div>
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite?.();
          }}
          className="absolute top-2 right-2 bg-background/80 dark:bg-gray-900/80 backdrop-blur-md rounded-full p-2 border border-border z-10 hover:bg-muted/90 dark:hover:bg-gray-800/90 transition-colors"
        >
          <Heart
            className={`w-5 h-5 transition-colors ${
              isFavorite ? "fill-pink-500 text-pink-500" : "text-muted-foreground"
            }`}
          />
        </button>

        {/* Grocery Badge */}
        {isGrocery && (
          <div className="absolute top-3 left-3 z-10">
            <div className="bg-green-500/90 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
              <span className="text-white text-[10px] font-medium">Buy & Assemble</span>
            </div>
          </div>
        )}

        {meal.rating && (
          <div className="absolute bottom-3 left-3 flex items-center gap-2 z-10">
            <div className="bg-cyan-500/90 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1">
              <Star className="w-3 h-3 text-white fill-white" />
              <span className="text-white text-xs font-bold">{meal.rating}</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0 pr-2">
            <h3 className="text-foreground mb-1 font-semibold line-clamp-2 break-words">{meal.name}</h3>
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-muted-foreground text-sm truncate">{meal.restaurant}</p>
              {hasVariableAvailability && (
                <div 
                  className="group/alert relative flex-shrink-0"
                  title="Availability depends on store location"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-yellow-400" />
                  <div className="hidden group-hover/alert:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-xs text-popover-foreground rounded whitespace-nowrap z-10 border border-border">
                    Availability depends on store location
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-popover"></div>
                  </div>
                </div>
              )}
            </div>
            {meal.distance !== undefined && meal.distance !== null && (
              <p className="text-muted-foreground mt-0.5 text-xs">{meal.distance.toFixed(1)} miles away</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="bg-gradient-to-br from-pink-500/20 to-rose-500/20 rounded-md p-2 text-center border border-pink-500/30">
            <div className="flex items-center justify-center mb-1">
              <Flame className="w-3 h-3 text-pink-400" />
            </div>
            <p className="text-foreground font-bold">{meal.calories}</p>
            <p className="text-pink-600 dark:text-pink-300/70 text-[10px]">cal</p>
            {!logReady ? (
              <p className="text-[9px] mt-0.5 text-muted-foreground">—</p>
            ) : remainingCalories !== null ? (
              <p className={`text-[9px] mt-0.5 ${
                remainingCalories >= 0 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {remainingCalories >= 0 ? '+' : ''}{remainingCalories} left
              </p>
            ) : null}
          </div>
          <div className="bg-gradient-to-br from-cyan-400/20 to-blue-500/20 rounded-md p-2 text-center border border-cyan-400/30">
            <div className="flex items-center justify-center mb-1">
              <Zap className="w-3 h-3 text-cyan-400" />
            </div>
            <p className="text-foreground font-bold">{meal.protein}g</p>
            <p className="text-cyan-600 dark:text-cyan-300/70 text-[10px]">pro</p>
          </div>
          <div className="bg-gradient-to-br from-green-400/20 to-emerald-500/20 rounded-md p-2 text-center border border-green-400/30">
            <div className="flex items-center justify-center mb-1">
              <TrendingUp className="w-3 h-3 text-green-400" />
            </div>
            <p className="text-foreground font-bold">{meal.carbs}g</p>
            <p className="text-green-600 dark:text-green-300/70 text-[10px]">carb</p>
          </div>
          <div className="bg-gradient-to-br from-amber-400/20 to-orange-500/20 rounded-md p-2 text-center border border-amber-400/30">
            <div className="flex items-center justify-center mb-1">
              <div className="w-3 h-3 rounded-full bg-amber-400" />
            </div>
            <p className="text-foreground font-bold">{meal.fats}g</p> 
            <p className="text-amber-600 dark:text-amber-300/70 text-[10px]">fat</p>
          </div>
        </div>
      </div>
    </div>
  );
}