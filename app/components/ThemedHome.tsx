'use client';
import { useTheme } from "../contexts/ThemeContext";
import { useState } from 'react';
import { Search, MapPin, TrendingUp, Flame, Zap, ArrowRight, Lightbulb, AlertCircle } from 'lucide-react';
import { MealCard } from './MealCard';
import { CircularProgress } from './CircularProgress';
import { mockMeals } from './mockData';

export function ThemedHome({ userProfile, onMealSelect, onOpenAI, favoriteMeals }: any) {
    const { resolvedTheme, setTheme, theme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'restaurant' | 'grocery'>('restaurant');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  // Default targets if userProfile is missing
  const targets = {
    cal: userProfile?.calorieTarget || 2000,
    pro: userProfile?.proteinTarget || 150,
    carbs: userProfile?.carbsTarget || 200,
    fats: userProfile?.fatsTarget || 65
  };

  const current = { cal: 845, pro: 62, carbs: 78, fats: 28 }; // Mock current data

  // Filter Logic
  const filteredMeals = mockMeals.filter(meal => {
    // If mocking, we assume all meals are 'restaurant' for now unless marked otherwise
    // Simple filter logic for MVP
    const matchesSearch = !searchQuery || meal.name.toLowerCase().includes(searchQuery.toLowerCase()) || meal.restaurant.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className={`flex-1 flex flex-col min-h-screen ${
  isDark ? "bg-gray-950 text-white" : "bg-gray-100 text-gray-900"
}`}>
      
      {/* 1. HERO SECTION (Progress Rings) */}
      <div className="bg-gradient-to-br from-gray-900 via-blue-900/20 to-gray-900 text-white px-6 pt-8 pb-6">
        <p className="text-gray-400 text-center mb-6">Hey there, let's eat smart today 👋</p>

        {/* Progress Rings Container */}
        <div className="relative h-48 w-full flex items-center justify-center mb-8">
           {/* Background Glow */}
           <div className="absolute w-40 h-40 bg-blue-500/20 blur-3xl rounded-full"></div>
           
           {/* Rings - Using absolute positioning to stack them */}
           <CircularProgress percentage={(current.cal / targets.cal) * 100} colorStart="#ec4899" size={180} strokeWidth={12} />
           <CircularProgress percentage={(current.pro / targets.pro) * 100} colorStart="#06b6d4" size={150} strokeWidth={12} />
           <CircularProgress percentage={(current.carbs / targets.carbs) * 100} colorStart="#22c55e" size={120} strokeWidth={12} />
           
           {/* Center Text */}
           <div className="absolute text-center">
             <p className="text-xs text-gray-400">Remaining</p>
             <p className="text-2xl font-bold text-white">{targets.cal - current.cal}</p>
             <p className="text-xs text-gray-500">kcal</p>
           </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          <div className="bg-gray-800/50 p-2 rounded-xl text-center border border-pink-500/20">
            <p className="text-pink-400 text-xs font-bold">Cal</p>
            <p className="text-white text-sm">{current.cal}</p>
          </div>
          <div className="bg-gray-800/50 p-2 rounded-xl text-center border border-cyan-500/20">
             <p className="text-cyan-400 text-xs font-bold">Pro</p>
             <p className="text-white text-sm">{current.pro}g</p>
          </div>
           <div className="bg-gray-800/50 p-2 rounded-xl text-center border border-green-500/20">
             <p className="text-green-400 text-xs font-bold">Carb</p>
             <p className="text-white text-sm">{current.carbs}g</p>
          </div>
           <div className="bg-gray-800/50 p-2 rounded-xl text-center border border-orange-500/20">
             <p className="text-orange-400 text-xs font-bold">Fat</p>
             <p className="text-white text-sm">{current.fats}g</p>
          </div>
        </div>

        {/* AI CTA Button */}
        <button 
          onClick={onOpenAI}
          className="w-full h-14 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20 hover:scale-[1.02] transition-transform"
        >
          Find My Meal <ArrowRight className="ml-2 w-5 h-5" />
        </button>
      </div>

      {/* 2. SEARCH & LIST SECTION */}
      <div className="bg-gray-950 px-4 py-6 rounded-t-3xl -mt-4 border-t border-gray-800">
        
        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search meals..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl py-4 pl-12 pr-4 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
          />
        </div>

        {/* Meal List */}
        <h3 className="text-white font-bold mb-4">Recommended for You</h3>
        <div className="space-y-4 pb-24">
          {filteredMeals.map(meal => (
             <MealCard key={meal.id} meal={meal} isFavorite={favoriteMeals?.includes(meal.id)} onClick={() => onMealSelect(meal)} />
          ))}
        </div>

      </div>
    </div>
  );
}