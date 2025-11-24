"use client";

import { useState } from 'react';
import { Search, MapPin, Lightbulb, AlertCircle, ArrowRight } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { MealCard } from './MealCard';
import { CircularProgress } from './CircularProgress';
import { mockMeals } from '../data/mockData'; 
import type { UserProfile, Meal } from '../types'; 

// --- 1. THE MATCH ALGORITHM ---
// This runs instantly to rank meals based on user goals
function calculateMatchScore(meal: Meal, user: UserProfile): number {
  let score = 90; // Start with a high baseline

  // Penalty: If meal uses > 40% of daily calories
  if (meal.calories > (user.calorieTarget * 0.4)) score -= 15;

  // Penalty: If fat is too high for a cut (using plural 'fats')
  if (user.goal === 'lose-fat' && meal.fats > 30) score -= 10;

  // Bonus: High protein for muscle building
  if (user.goal === 'build-muscle' && meal.protein > 35) score += 5;

  // Bonus: Low carb for keto preference
  if (user.dietaryType === 'Keto' && meal.carbs < 15) score += 8;

  // Ensure score stays between 65 and 99 for realism
  return Math.max(65, Math.min(99, score));
}

type Props = {
  userProfile: UserProfile;
  onMealSelect: (meal: Meal) => void;
  favoriteMeals: string[];
  onOpenAI?: () => void;
};

const quickFilters = [
  { id: 'high-protein', label: 'High Protein', icon: '💪' },
  { id: 'under-1000', label: 'Under 1000 Calories', icon: '📉' },
  { id: 'low-carb', label: 'Low Carb', icon: '🥑' },
  { id: 'budget', label: 'Budget Friendly', icon: '💰' },
  { id: 'fast', label: 'Fast', icon: '⚡' },
  { id: 'nearby', label: 'Nearby', icon: '📍' },
];

export function HomeScreen({ 
  userProfile,
  onMealSelect, 
  favoriteMeals = [] 
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'restaurant' | 'grocery'>('restaurant');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  // Mock current consumption
  const currentCalories = 845;
  const currentProtein = 62;
  const currentCarbs = 78;
  const currentFats = 28;

  // Insight Logic
  const caloriePercentage = (currentCalories / userProfile.calorieTarget) * 100;
  let insightMessage = "Great start! You have plenty of room for more meals today.";
  let InsightIcon = Lightbulb;
  
  if (caloriePercentage > 100) {
    insightMessage = "You've exceeded your calorie goal. Consider a lighter meal.";
    InsightIcon = AlertCircle;
  }

  const toggleFilter = (filterId: string) => {
    setActiveFilters(prev =>
      prev.includes(filterId) ? prev.filter(f => f !== filterId) : [...prev, filterId]
    );
  };

  // --- 2. APPLY SCORES & FILTER ---
  const scoredMeals = mockMeals.map(meal => ({
    ...meal,
    matchScore: calculateMatchScore(meal, userProfile)
  }));

  const filteredMeals = scoredMeals.filter(meal => {
    const matchesCategory = meal.category === selectedCategory;
    const matchesSearch = searchQuery === '' || 
      meal.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      meal.restaurant.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesFilters = true;
    if (activeFilters.includes('high-protein')) matchesFilters = matchesFilters && meal.protein >= 30;
    if (activeFilters.includes('under-1000')) matchesFilters = matchesFilters && meal.calories < 1000;
    
    if (activeFilters.includes('nearby')) {
       const dist = meal.distance ?? 999; 
       matchesFilters = matchesFilters && dist < 5;
    }
    
    return matchesCategory && matchesSearch && matchesFilters;
  }).sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0)); // Sort highest score first

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-background overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-background via-muted/50 to-background px-6 pt-8 pb-6 flex flex-col justify-center">
          <div className="mb-8">
            <p className="text-muted-foreground text-center font-medium">Hey there, let's eat smart today 👋</p>
          </div>

          {/* Circular Progress Rings */}
          <div className="flex items-center justify-center mb-8 relative py-4">
            <div className="relative w-44 h-44 flex items-center justify-center">
              <CircularProgress percentage={(currentCalories / userProfile.calorieTarget) * 100} colorStart="#ec4899" colorEnd="#d946ef" size={176} strokeWidth={12} />
              <CircularProgress percentage={(currentProtein / userProfile.proteinTarget) * 100} colorStart="#06b6d4" colorEnd="#0ea5e9" size={152} strokeWidth={11} />
              <CircularProgress percentage={(currentCarbs / userProfile.carbsTarget) * 100} colorStart="#22c55e" colorEnd="#16a34a" size={130} strokeWidth={10} />
              <CircularProgress percentage={(currentFats / userProfile.fatsTarget) * 100} colorStart="#f59e0b" colorEnd="#f97316" size={110} strokeWidth={9} />
              
              <div className="absolute flex flex-col items-center justify-center z-10">
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider">Remaining</p>
                <p className="text-3xl font-bold text-foreground">{Math.max(0, userProfile.calorieTarget - currentCalories)}</p>
                <p className="text-muted-foreground text-xs">calories</p>
              </div>
            </div>
          </div>

          {/* Insight Card */}
          <div className="bg-blue-500/10 rounded-2xl p-4 border border-blue-500/20 mb-6 flex items-start gap-3">
            <InsightIcon className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-blue-700 dark:text-blue-300 text-sm font-medium">{insightMessage}</p>
          </div>

          <Button className="w-full h-12 rounded-full font-semibold shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 mb-6">
            Find My Meal <ArrowRight className="ml-2 w-4 h-4" />
          </Button>

          {/* Quick Filters */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {quickFilters.map(filter => (
              <button
                key={filter.id}
                onClick={() => toggleFilter(filter.id)}
                className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-full transition-all text-xs font-medium border ${
                  activeFilters.includes(filter.id)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                }`}
              >
                <span>{filter.icon}</span>
                <span className="truncate">{filter.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="bg-background pb-20">
          <div className="px-6 py-4 sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search meals..."
                className="pl-9 pr-4 rounded-full bg-muted border-transparent focus:bg-background focus:border-primary"
              />
            </div>
          </div>

          <div className="px-6 py-4 space-y-4">
            {filteredMeals.map(meal => (
              <MealCard
                key={meal.id}
                meal={meal}
                isFavorite={favoriteMeals.includes(meal.id)}
                onClick={() => onMealSelect(meal)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}