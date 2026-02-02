"use client";

import * as React from "react";
import { Heart, Clock, Flame, Zap } from "lucide-react";
import { Badge } from "./ui/badge";
import { MealCard } from "./MealCard"; 
import type { Meal } from "../types"; // <--- IMPORT SHARED TYPES
import type { LoggedMeal } from "./LogScreen";

type Props = {
  favoriteMeals?: string[];
  favoriteMealsData?: Record<string, Meal>;
  loggedMeals?: LoggedMeal[];
  onMealSelect: (meal: Meal) => void;
  onToggleFavorite?: (mealId: string, meal?: Meal) => void;
};

export function Favorites({ 
  favoriteMeals = [], 
  favoriteMealsData = {},
  loggedMeals = [],
  onMealSelect, 
  onToggleFavorite 
}: Props) {
  // Get favorite meals - only from stored API meals
const favoriteMealsList: Meal[] = favoriteMeals
.map(id => favoriteMealsData[id])
.filter((meal): meal is Meal => meal !== undefined);

  
  // Get recent meals from logged meals (last 10, most recent first)
  const recentMeals = loggedMeals
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10)
    .map(loggedMeal => loggedMeal.meal);

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-background">
      {/* Header */}
      <div className="bg-gradient-to-br from-pink-900 via-rose-900/50 to-background text-white p-6 pb-8">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-gradient-to-br from-pink-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/50 ring-2 ring-white/10">
            <Heart className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Favorites</h1>
            <p className="text-pink-200/80 text-sm font-medium">Your saved and recent meals</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto -mt-4 bg-background rounded-t-3xl border-t border-white/5 relative z-10 pb-20 pb-safe">
        <div className="p-6 space-y-8">
          
          {/* Favorites Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Heart className="h-4 w-4 text-pink-500" />
              <h2 className="font-semibold text-lg">Saved Meals</h2>
            </div>
            
            {favoriteMealsList.length > 0 ? (
              <div className="space-y-3">
                {favoriteMealsList.map(meal => (
                  <MealCard
                    key={meal.id}
                    meal={meal}
                    isFavorite={true}
                    onClick={() => onMealSelect(meal)}
                    onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(meal.id, meal) : undefined}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed rounded-3xl bg-muted/30">
                <Heart className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground font-medium">No favorites yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Start saving meals you love</p>
              </div>
            )}
          </section>

          {/* Recent Meals Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-cyan-500" />
              <h2 className="font-semibold text-lg">Recent Meals</h2>
            </div>
            
            {recentMeals.length > 0 ? (
              <div className="space-y-3">
                {recentMeals.map(meal => (
                  <div
                    key={meal.id}
                    onClick={() => onMealSelect(meal)}
                    className="group flex gap-4 p-4 rounded-2xl border bg-card/50 hover:bg-card hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/10 transition-all cursor-pointer"
                  >
                    {meal.image && meal.image !== '/placeholder-food.jpg' && meal.image !== '' ? (
                      <img
                        src={meal.image}
                        alt={meal.name}
                        className="h-20 w-20 rounded-xl object-cover flex-shrink-0"
                        onError={(e) => {
                          // Fallback to default.png if meal image fails
                          e.currentTarget.src = '/logos/default.png';
                          e.currentTarget.onerror = null;
                        }}
                      />
                    ) : (
                      <img
                        src="/logos/default.png"
                        alt="Default meal"
                        className="h-20 w-20 rounded-xl object-cover flex-shrink-0"
                        onError={(e) => {
                          // Final fallback - hide image if default.png also fails
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                  <div className="flex-1 min-w-0 py-1">
                    <p className="font-medium text-foreground mb-1 truncate group-hover:text-cyan-500 transition-colors">
                      {meal.name}
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">{meal.restaurant}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Flame className="size-3" /> {meal.calories}
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap className="size-3" /> {meal.protein}g
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed rounded-3xl bg-muted/30">
                <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground font-medium">No recent meals</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Start logging meals to see them here</p>
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}