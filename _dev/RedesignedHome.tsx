"use client";

import { useState } from "react";
import {
  Search,
  Sparkles,
  TrendingUp,
  HelpCircle,
  MessageSquare,
} from "lucide-react";
import { Input } from "../app/components/ui/input";
import { Button } from "../app/components/ui/button";
import { Card } from "../app/components/ui/card";
import { MealCard } from "../app/components/MealCard";
import type { Meal } from "../app/types";
import { CircularProgress } from "../app/components/ui/circular-progress";
// Mock data removed - this is a dev-only component
// import { mockMeals } from "../app/components/mockData";

// Define UserProfile locally since we don't have an App.tsx file
export type UserProfile = {
  full_name?: string;
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fats_g: number;
};

type Props = {
  userProfile: UserProfile;
  onMealSelect: (meal: Meal) => void;
  onOpenAI: () => void;
  favoriteMeals: string[];
  onToggleFavorite?: (mealId: string, meal?: Meal) => void;
};

export function RedesignedHome({
  userProfile,
  onMealSelect,
  onOpenAI,
  favoriteMeals,
  onToggleFavorite,
}: Props) {
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showMacroTooltip, setShowMacroTooltip] = useState(false);

  // Mock current consumption
  const currentCalories = 0;
  const currentProtein = 0;
  const currentCarbs = 0;
  const currentFats = 0;

  const calorieProgress = (currentCalories / userProfile.target_calories) * 100;
  const proteinProgress = (currentProtein / userProfile.target_protein_g) * 100;
  const carbsProgress = (currentCarbs / userProfile.target_carbs_g) * 100;
  const fatsProgress = (currentFats / userProfile.target_fats_g) * 100;

  const handleSearchFocus = () => {
    setHasInteracted(true);
    onOpenAI();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-950">
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="px-4 pt-8 pb-6">
          {/* Large Search Bar */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                placeholder="AI finds meals that fit your goals"
                onClick={handleSearchFocus}
                readOnly
                className="h-14 pl-12 pr-4 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 text-white placeholder:text-gray-400 text-base cursor-pointer hover:border-teal-500/50 transition-colors"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-teal-500/20 to-blue-500/20 border border-teal-500/30">
                  <Sparkles className="w-3 h-3 text-teal-400" />
                  <span className="text-xs text-teal-300">AI</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Try: "Find me a high-protein lunch under 600 calories"
            </p>
          </div>

          {/* AI Chat Preview Card */}
          <Card
            onClick={onOpenAI}
            className="mb-6 bg-gradient-to-br from-blue-900/40 via-purple-900/30 to-pink-900/30 border-blue-500/30 p-5 cursor-pointer hover:border-blue-500/50 transition-all"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-teal-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-white mb-1 font-semibold">
                  AI Meal Assistant
                </h3>
                <p className="text-sm text-gray-300 leading-relaxed">
                  Hi! I'm your AI meal assistant. Type any calories, macros,
                  cravings, or foods you want and I'll scrape menus to find the
                  best options.
                </p>
              </div>
            </div>
            <Button className="w-full h-10 rounded-xl bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 shadow-lg shadow-teal-500/20">
              <MessageSquare className="w-4 h-4 mr-2" />
              Start Chatting
            </Button>
          </Card>

          {/* Today's Progress */}
          <Card className="mb-6 bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white mb-1 font-semibold">
                  Today's Progress
                </h3>
                <p className="text-sm text-gray-400">
                  Track your macros throughout the day
                </p>
              </div>
              <button
                onClick={() => setShowMacroTooltip(!showMacroTooltip)}
                className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center hover:border-teal-500/50 transition-colors"
              >
                <HelpCircle className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Macro Tooltip */}
            {showMacroTooltip && (
              <div className="mb-4 p-3 bg-blue-900/30 border border-blue-500/30 rounded-xl">
                <p className="text-xs text-gray-300 leading-relaxed mb-2">
                  <strong className="text-white">Macros</strong> are the
                  nutrients in food:
                </p>
                <ul className="space-y-1 text-xs text-gray-300 ml-2">
                  <li>
                    • <strong className="text-blue-300">Protein</strong> –
                    builds muscle, keeps you full
                  </li>
                  <li>
                    • <strong className="text-green-300">Carbs</strong> –
                    provides energy
                  </li>
                  <li>
                    • <strong className="text-orange-300">Fat</strong> –
                    supports hormones
                  </li>
                </ul>
              </div>
            )}

            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <div className="relative h-[60px] w-[60px] mx-auto">
                  <CircularProgress
                    percentage={calorieProgress}
                    max={100}
                    size={60}
                    strokeWidth={6}
                    colorStart="#f97316"
                    colorEnd="#ef4444"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">Calories</p>
                <p className="text-sm text-white">
                  {currentCalories}/{userProfile.target_calories}
                </p>
              </div>
              <div className="text-center">
                <div className="relative h-[60px] w-[60px] mx-auto">
                  <CircularProgress
                    percentage={proteinProgress}
                    max={100}
                    size={60}
                    strokeWidth={6}
                    colorStart="#3b82f6"
                    colorEnd="#06b6d4"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">Protein</p>
                <p className="text-sm text-white">
                  {currentProtein}g/{userProfile.target_protein_g}g
                </p>
              </div>
              <div className="text-center">
                <div className="relative h-[60px] w-[60px] mx-auto">
                  <CircularProgress
                    percentage={carbsProgress}
                    max={100}
                    size={60}
                    strokeWidth={6}
                    colorStart="#22c55e"
                    colorEnd="#10b981"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">Carbs</p>
                <p className="text-sm text-white">
                  {currentCarbs}g/{userProfile.target_carbs_g}g
                </p>
              </div>
              <div className="text-center">
                <div className="relative h-[60px] w-[60px] mx-auto">
                  <CircularProgress
                    percentage={fatsProgress}
                    max={100}
                    size={60}
                    strokeWidth={6}
                    colorStart="#a855f7"
                    colorEnd="#ec4899"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">Fat</p>
                <p className="text-sm text-white">
                  {currentFats}g/{userProfile.target_fats_g}g
                </p>
              </div>
            </div>
          </Card>

          {/* AI-Picked Meals Section - Only shows after interaction */}
          {hasInteracted && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-white">AI-Picked for Your Macros</h2>
                  <p className="text-sm text-gray-400">
                    Based on your goals and preferences
                  </p>
                </div>
                <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-teal-500/20 to-blue-500/20 border border-teal-500/30">
                  <Sparkles className="w-3 h-3 text-teal-400" />
                  <span className="text-xs text-teal-300">AI Match</span>
                </div>
              </div>

              {/* Macro Match Score Explanation */}
              <div className="mb-4 p-3 bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-blue-500/20 rounded-xl">
                <div className="flex items-start gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      <strong className="text-white">Macro Match Score:</strong>{" "}
                      Shows how well each meal fits your remaining macros.
                      Higher scores mean better matches for your daily targets.
                    </p>
                  </div>
                </div>
              </div>

              {/* Mock meals removed - this is a dev-only component */}
              <div className="space-y-3">
                <p className="text-gray-400 text-sm text-center py-4">
                  Mock meals removed - this is a dev-only component
                </p>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!hasInteracted && (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-gray-800 to-gray-900 rounded-full mb-4">
                <Sparkles className="w-8 h-8 text-gray-500" />
              </div>
              <h3 className="text-gray-400 mb-2">
                Ready to find your perfect meal?
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                Use the AI search above or chat to get personalized
                recommendations
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

