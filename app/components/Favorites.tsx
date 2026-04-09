"use client";

import * as React from "react";
import Image from "next/image";
import { Heart, Clock, Flame, Zap } from "lucide-react";
import type { Meal, UserProfile } from "../types";
import type { LoggedMeal } from "./LogScreen";
import { useNutrition } from "../contexts/NutritionContext";
import { getRestaurantLogoUrl } from "@/lib/image-utils";

type Props = {
  favoriteMeals?: string[];
  favoriteMealsData?: Record<string, Meal>;
  loggedMeals?: LoggedMeal[];
  userProfile?: UserProfile;
  onMealSelect: (meal: Meal) => void;
  onLogMeal?: (meal: Meal) => void;
  onToggleFavorite?: (mealId: string, meal?: Meal) => void;
};

type ActiveTab = "saved" | "recent";

type SavedMealRowProps = {
  meal: Meal;
  isFavorite: boolean;
  fitLabel: string | null;
  fitTone: "positive" | "negative" | "neutral";
  onOpen: () => void;
  onLog?: () => void;
  onToggleFavorite?: () => void;
};

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function SavedMealRow({
  meal,
  isFavorite,
  fitLabel,
  fitTone,
  onOpen,
  onLog,
  onToggleFavorite,
}: SavedMealRowProps) {
  const restaurantName = meal.restaurant_name || meal.restaurant || "Unknown";
  const logoSrc = getRestaurantLogoUrl(restaurantName, meal.restaurantLogoUrl);
  const [imageError, setImageError] = React.useState(false);
  const imageSrc = imageError ? "/logos/default.png" : logoSrc;
  const fitToneClass =
    fitTone === "positive"
      ? "text-emerald-500"
      : fitTone === "negative"
        ? "text-red-500"
        : "text-muted-foreground";

  return (
    <div
      onClick={onOpen}
      className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card/70 p-3 shadow-sm transition-all hover:border-cyan-500/30 hover:bg-card hover:shadow-lg hover:shadow-cyan-500/10"
    >
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-2 shadow-sm">
        <Image
          src={imageSrc}
          alt={restaurantName}
          width={56}
          height={56}
          unoptimized
          className="h-full w-full object-contain"
          onError={() => setImageError(true)}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-cyan-500">
              {meal.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">{restaurantName}</p>
          </div>

          {onToggleFavorite ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              className="rounded-full border border-border bg-background/80 p-1.5 text-muted-foreground transition-colors hover:bg-muted"
              aria-label={isFavorite ? "Remove saved meal" : "Save meal"}
            >
              <Heart className={`h-3.5 w-3.5 ${isFavorite ? "fill-pink-500 text-pink-500" : ""}`} />
            </button>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Flame className="h-3 w-3 text-pink-500" />
            {Math.round(Number(meal.calories) || 0)} cal
          </span>
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-cyan-400" />
            {Math.round(Number(meal.protein) || 0)}g protein
          </span>
          {fitLabel ? <span className={`font-medium ${fitToneClass}`}>{fitLabel}</span> : null}
        </div>
      </div>

      {onLog ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLog();
          }}
          className="h-9 flex-shrink-0 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-black shadow-md shadow-emerald-500/20 transition-colors hover:bg-emerald-400"
        >
          Log
        </button>
      ) : null}
    </div>
  );
}

export function Favorites({ 
  favoriteMeals = [], 
  favoriteMealsData = {},
  loggedMeals = [],
  userProfile,
  onMealSelect, 
  onLogMeal,
  onToggleFavorite 
}: Props) {
  const [activeTab, setActiveTab] = React.useState<ActiveTab>("saved");
  const { targets, todaysTotals, isLoading: isNutritionLoading } = useNutrition();

  const favoriteMealsList: Meal[] = React.useMemo(
    () => favoriteMeals
      .map(id => favoriteMealsData[id])
      .filter((meal): meal is Meal => meal !== undefined),
    [favoriteMeals, favoriteMealsData]
  );

  const recentMealLogs = React.useMemo(
    () => [...loggedMeals]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10),
    [loggedMeals]
  );

  const todayStr = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const targetCalories = parseNumber(targets?.targetCalories) ?? parseNumber(userProfile?.target_calories);
  const consumedCalories = typeof todaysTotals?.consumedCalories === "number"
    ? Math.round(todaysTotals.consumedCalories)
    : loggedMeals
      .filter((loggedMeal) => loggedMeal.date === todayStr)
      .reduce((sum, loggedMeal) => sum + Math.round(Number(loggedMeal.meal.calories) || 0), 0);

  const getFitContext = (meal: Meal) => {
    if (isNutritionLoading || targetCalories === null) {
      return { label: null, tone: "neutral" as const };
    }

    const mealCalories = Math.round(Number(meal.calories) || 0);
    const caloriesAfterMeal = targetCalories - consumedCalories - mealCalories;

    if (caloriesAfterMeal >= 0) {
      return { label: `Leaves ${caloriesAfterMeal} cal`, tone: "positive" as const };
    }

    return { label: `Over by ${Math.abs(caloriesAfterMeal)} cal`, tone: "negative" as const };
  };

  const tabs: Array<{ id: ActiveTab; label: string; count: number }> = [
    { id: "saved", label: "Saved", count: favoriteMealsList.length },
    { id: "recent", label: "Recent", count: recentMealLogs.length },
  ];

  const savedContent = favoriteMealsList.length > 0 ? (
    <div className="space-y-3">
      {favoriteMealsList.map(meal => {
        const fitContext = getFitContext(meal);
        return (
          <SavedMealRow
            key={meal.id}
            meal={meal}
            isFavorite={true}
            fitLabel={fitContext.label}
            fitTone={fitContext.tone}
            onOpen={() => onMealSelect(meal)}
            onLog={onLogMeal ? () => onLogMeal(meal) : undefined}
            onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(meal.id, meal) : undefined}
          />
        );
      })}
    </div>
  ) : (
    <div
      className="text-center py-12 border-2 border-dashed rounded-3xl bg-muted/30"
      data-tutorial-target="favorites-empty-state"
    >
      <Heart className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
      <p className="text-muted-foreground font-medium">No saved meals yet</p>
      <p className="text-xs text-muted-foreground/60 mt-1">Start saving meals you love</p>
    </div>
  );

  const recentContent = recentMealLogs.length > 0 ? (
    <div className="space-y-3">
      {recentMealLogs.map(loggedMeal => {
        const fitContext = getFitContext(loggedMeal.meal);
        return (
          <SavedMealRow
            key={loggedMeal.id}
            meal={loggedMeal.meal}
            isFavorite={favoriteMeals.includes(loggedMeal.meal.id)}
            fitLabel={fitContext.label}
            fitTone={fitContext.tone}
            onOpen={() => onMealSelect(loggedMeal.meal)}
            onLog={onLogMeal ? () => onLogMeal(loggedMeal.meal) : undefined}
            onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(loggedMeal.meal.id, loggedMeal.meal) : undefined}
          />
        );
      })}
    </div>
  ) : (
    <div className="text-center py-12 border-2 border-dashed rounded-3xl bg-muted/30">
      <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
      <p className="text-muted-foreground font-medium">No recent meals</p>
      <p className="text-xs text-muted-foreground/60 mt-1">Start logging meals to see them here</p>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-background">
      {/* Header */}
      <div className="bg-gradient-to-br from-pink-900 via-rose-900/50 to-background text-white p-6 pb-8">
        <div className="flex items-center gap-4">
          <div
            className="h-12 w-12 bg-gradient-to-br from-pink-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/50 ring-2 ring-white/10"
            data-tutorial-target="favorites-heart"
          >
            <Heart className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Saved Meals</h1>
            <p className="text-pink-200/80 text-sm font-medium">
              {favoriteMealsList.length} saved - {recentMealLogs.length} recent
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 -mt-4 flex-1 overflow-y-auto rounded-t-3xl border-t border-white/5 bg-background pb-safe" style={{ paddingBottom: "calc(var(--app-nav-safe-offset) + 1rem)" }}>
        <div className="p-6">
          <div className="mb-5 grid grid-cols-2 rounded-xl border border-border bg-muted/40 p-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={isActive}
                >
                  {tab.label} <span className="text-xs opacity-70">({tab.count})</span>
                </button>
              );
            })}
          </div>

          {activeTab === "saved" ? savedContent : recentContent}
        </div>
      </div>
    </div>
  );
}
