"use client";

import { ArrowLeft, Flame, Zap, Droplets, TrendingUp, Check, Plus, Heart } from 'lucide-react';
import type { Meal } from '../page';

type Props = {
  meal: Meal;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onBack: () => void;
  onLogMeal: () => void;
};

export function MealDetail({ meal, isFavorite, onToggleFavorite, onBack, onLogMeal }: Props) {
  if (!meal) return null;

  return (
    <div className="h-full bg-gray-950 text-white flex flex-col relative overflow-y-auto scrollbar-hide">
      
      {/* Header Image */}
      <div className="relative h-72 w-full shrink-0">
        <img 
          src={meal.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80'} 
          alt={meal.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/20 to-transparent"></div>
        
        <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
          <button 
            onClick={onBack}
            className="w-10 h-10 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/70 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={onToggleFavorite}
            className={`w-10 h-10 backdrop-blur-md rounded-full flex items-center justify-center transition ${isFavorite ? 'bg-pink-500/20 text-pink-500 border border-pink-500/50' : 'bg-black/50 text-white border border-transparent'}`}
          >
            <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>

        <div className="absolute bottom-0 left-0 p-6 w-full">
           <div className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30 mb-2 backdrop-blur-md">
             {meal.restaurant}
           </div>
           <h1 className="text-3xl font-bold text-white leading-tight">{meal.name}</h1>
        </div>
      </div>

      {/* Content Body */}
      <div className="px-6 py-6 space-y-8 pb-32">
        
        {/* Macro Grid */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-gray-900 border border-gray-800 p-3 rounded-2xl text-center">
            <Flame className="w-5 h-5 text-orange-500 mx-auto mb-1" />
            <div className="text-xl font-bold">{meal.calories}</div>
            <div className="text-xs text-gray-500">Cals</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 p-3 rounded-2xl text-center">
            <Zap className="w-5 h-5 text-blue-500 mx-auto mb-1" />
            <div className="text-xl font-bold">{meal.protein}g</div>
            <div className="text-xs text-gray-500">Pro</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 p-3 rounded-2xl text-center">
            <TrendingUp className="w-5 h-5 text-green-500 mx-auto mb-1" />
            <div className="text-xl font-bold">{meal.carbs}g</div>
            <div className="text-xs text-gray-500">Carbs</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 p-3 rounded-2xl text-center">
            <Droplets className="w-5 h-5 text-yellow-500 mx-auto mb-1" />
            {/* UPDATED: Plural 'fats' */}
            <div className="text-xl font-bold">{meal.fats}g</div>
            <div className="text-xs text-gray-500">Fats</div>
          </div>
        </div>

        {/* AI Analysis Section */}
        {meal.aiSwaps && meal.aiSwaps.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <span className="bg-purple-500/20 p-1 rounded text-purple-400">✨</span> 
              AI Modifications
            </h3>
            <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/20 rounded-2xl p-4">
              <ul className="space-y-3">
                {meal.aiSwaps.map((swap: string, i: number) => (
                  <li key={i} className="flex gap-3 text-sm text-gray-300">
                    <Check className="w-5 h-5 text-emerald-400 shrink-0" />
                    {swap}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Ingredients */}
        {meal.ingredients && meal.ingredients.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-bold text-lg">Ingredients</h3>
            <div className="flex flex-wrap gap-2">
              {meal.ingredients.map((ing: string, i: number) => (
                <span key={i} className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-full text-sm text-gray-300">
                  {ing}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {meal.description && (
          <div className="space-y-3">
            <h3 className="font-bold text-lg">Description</h3>
            <p className="text-gray-400 leading-relaxed">{meal.description}</p>
          </div>
        )}
      </div>

      {/* Log Meal Button */}
      <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-gray-950 via-gray-950 to-transparent">
        <button 
          onClick={onLogMeal}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-lg py-4 rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-transform active:scale-95"
        >
          <Plus className="w-6 h-6" />
          Log This Meal
        </button>
      </div>

    </div>
  );
}