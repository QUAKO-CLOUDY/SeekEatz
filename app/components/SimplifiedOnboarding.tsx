"use client";

import { useState } from 'react';
import { Button } from './ui/button';
import { ChevronRight, Target, Check } from 'lucide-react';
import type { UserProfile } from '../types';

type Props = {
  onComplete: (profile: UserProfile) => void;
};

// Data for the requested UI
const goals = [
  { id: 'lose-weight', label: 'Lose Weight', icon: '📉' },
  { id: 'build-muscle', label: 'Build Muscle', icon: '💪' },
  { id: 'stay-healthy', label: 'Stay Healthy', icon: '⚖️' },
  { id: 'performance', label: 'Athletic Performance', icon: '🏃' },
];

export function SimplifiedOnboarding({ onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Logic to finish onboarding (Used in Step 2 later)
  const handleFinish = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      onComplete({
        goal: goal || 'maintain',
        dietaryType: 'Balanced',
        allergens: [],
        calorieTarget: 2000,
        proteinTarget: 150,
        carbsTarget: 200,
        fatsTarget: 65,
        name: "Guest",
        nutritionGoals: [goal],
        preferredCuisines: [],
        preferredMealTypes: [],
        eatingStyles: [],
        dietaryPreferences: [],
        activityLevel: 'moderately-active',
        trainingStyle: 'hybrid'
      });
    }, 1000);
  };

  // --- STEP 1: GOAL SELECTION (Your Figma Design) ---
  if (step === 1) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-teal-500 to-blue-600 rounded-3xl mb-4 shadow-lg shadow-teal-500/50">
              <Target className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-white mb-2 text-2xl font-bold">What's your main goal?</h1>
            <p className="text-gray-400">This helps us find meals that match your needs.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-8">
            {goals.map(g => {
              const isSelected = goal === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => setGoal(g.id)}
                  className={`relative p-6 rounded-2xl transition-all ${
                    isSelected
                      ? 'bg-gradient-to-r from-teal-500 to-blue-600 shadow-lg shadow-teal-500/30 scale-[1.02]'
                      : 'bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 hover:border-teal-500/50'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-4xl mb-2">{g.icon}</div>
                    <div className={`font-medium ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                      {g.label}
                    </div>
                  </div>
                  {isSelected && (
                    <div className="absolute top-3 right-3 w-6 h-6 bg-white rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-teal-500" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 justify-center mb-6">
            <div className="h-2 w-16 bg-gradient-to-r from-teal-500 to-blue-600 rounded-full" />
            <div className="h-2 w-16 bg-gray-800 rounded-full" />
            <div className="h-2 w-16 bg-gray-800 rounded-full" />
            <div className="h-2 w-16 bg-gray-800 rounded-full" />
            <div className="h-2 w-16 bg-gray-800 rounded-full" />
          </div>

          <Button
            onClick={() => setStep(2)}
            disabled={!goal}
            className="h-14 rounded-full bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 shadow-lg shadow-teal-500/30 w-full disabled:opacity-50 text-white font-semibold text-lg"
          >
            Continue
            <ChevronRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </div>
    );
  }

  // --- STEP 2: Placeholder for next screen (Prevent crash) ---
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
      <div className="max-w-md w-full">
        <h2 className="text-white text-xl mb-4">Step 2: Processing Goal...</h2>
        <Button onClick={handleFinish} className="w-full h-14 rounded-full bg-primary text-white">
          {isSubmitting ? 'Building Profile...' : 'Finish Setup'}
        </Button>
      </div>
    </div>
  );
}