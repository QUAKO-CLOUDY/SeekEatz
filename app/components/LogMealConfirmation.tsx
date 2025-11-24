"use client";

import { useState } from 'react';
import { X, Check, Plus } from 'lucide-react';
import { Button } from './ui/button';
import type { Meal } from './MealCard'; // Importing from MealCard to keep types consistent

type Props = {
  meal: Meal;
  onConfirm: (meal: Meal, appliedSwaps: string[]) => void;
  onCancel: () => void;
};

export function LogMealConfirmation({ meal, onConfirm, onCancel }: Props) {
  const [selectedSwaps, setSelectedSwaps] = useState<string[]>([]);

  // Define swap options with their macro adjustments
  // standardized 'fats' to 'fat' to match your Meal type
  const swapOptions = [
    { id: 'extra-protein', label: 'Add Extra Protein', protein: 15, calories: 75, fat: 0, carbs: 0 },
    { id: 'less-carbs', label: 'Reduce Carbs', carbs: -20, calories: -80, protein: 0, fat: 0 },
    { id: 'healthy-fats', label: 'Add Healthy Fats', fat: 10, calories: 90, protein: 0, carbs: 0 },
    { id: 'double-protein', label: 'Double Protein', protein: meal.protein, calories: meal.protein * 4, fat: 0, carbs: 0 },
  ];

  const toggleSwap = (swapId: string) => {
    setSelectedSwaps(prev =>
      prev.includes(swapId) ? prev.filter(id => id !== swapId) : [...prev, swapId]
    );
  };

  const handleConfirm = () => {
    // Calculate adjusted meal with selected swaps
    const adjustedMeal = { ...meal };
    
    selectedSwaps.forEach(swapId => {
      const swap = swapOptions.find(s => s.id === swapId);
      if (swap) {
        adjustedMeal.protein += swap.protein || 0;
        adjustedMeal.carbs += swap.carbs || 0;
        adjustedMeal.fats += swap.fat || 0;
        adjustedMeal.calories += swap.calories || 0;
      }
    });

    onConfirm(adjustedMeal, selectedSwaps);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center">
      <div className="w-full max-w-md bg-gradient-to-br from-gray-900 to-gray-800 border-t border-gray-700 rounded-t-3xl p-6 animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-lg font-semibold">Customize Your Meal</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            className="text-gray-400 hover:text-white hover:bg-white/10 rounded-full"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <p className="text-gray-400 mb-4 text-sm">Did you make any of these AI-suggested swaps?</p>

        {/* Swap Options */}
        <div className="space-y-2 mb-6">
          {swapOptions.map(swap => (
            <button
              key={swap.id}
              onClick={() => toggleSwap(swap.id)}
              className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                selectedSwaps.includes(swap.id)
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-500 shadow-lg shadow-cyan-500/20'
                  : 'bg-gray-800 border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selectedSwaps.includes(swap.id)
                    ? 'border-cyan-400 bg-cyan-500'
                    : 'border-gray-600'
                }`}>
                  {selectedSwaps.includes(swap.id) && (
                    <Check className="w-4 h-4 text-white" />
                  )}
                </div>
                <div className="text-left">
                  <p className="text-white font-medium">{swap.label}</p>
                  <p className="text-gray-400 text-xs">
                    {swap.protein ? `+${swap.protein}g protein ` : ''}
                    {swap.carbs ? `${swap.carbs}g carbs ` : ''}
                    {swap.fat ? `+${swap.fat}g fats ` : ''}
                    {' • '}
                    {swap.calories > 0 ? '+' : ''}{swap.calories} cal
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Preview of adjusted macros */}
        {selectedSwaps.length > 0 && (
          <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-2xl p-4 mb-6">
            <p className="text-purple-300 mb-2 text-sm font-medium">Updated Macros:</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-white font-bold">
                  {meal.calories + selectedSwaps.reduce((sum, id) => {
                    const swap = swapOptions.find(s => s.id === id);
                    return sum + (swap?.calories || 0);
                  }, 0)}
                </p>
                <p className="text-gray-400 text-xs">cal</p>
              </div>
              <div>
                <p className="text-white font-bold">
                  {meal.protein + selectedSwaps.reduce((sum, id) => {
                    const swap = swapOptions.find(s => s.id === id);
                    return sum + (swap?.protein || 0);
                  }, 0)}g
                </p>
                <p className="text-gray-400 text-xs">pro</p>
              </div>
              <div>
                <p className="text-white font-bold">
                  {meal.carbs + selectedSwaps.reduce((sum, id) => {
                    const swap = swapOptions.find(s => s.id === id);
                    return sum + (swap?.carbs || 0);
                  }, 0)}g
                </p>
                <p className="text-gray-400 text-xs">carbs</p>
              </div>
              <div>
                <p className="text-white font-bold">
                  {meal.fats + selectedSwaps.reduce((sum, id) => {
                    const swap = swapOptions.find(s => s.id === id);
                    return sum + (swap?.fat || 0);
                  }, 0)}g
                </p>
                <p className="text-gray-400 text-xs">fats</p>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            className="flex-1 h-12 rounded-full bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className="flex-1 h-12 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg shadow-green-500/30"
          >
            <Plus className="mr-2 w-5 h-5" />
            Log Meal
          </Button>
        </div>
      </div>
    </div>
  );
}