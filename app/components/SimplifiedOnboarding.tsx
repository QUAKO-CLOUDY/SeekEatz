"use client";

import { useState } from 'react';
import { Button } from './ui/button';
import { ChevronRight, Target, Check } from 'lucide-react';
import type { UserProfile } from '../types';

type Props = {
  onComplete: (profile: UserProfile) => void;
};

// Define valid goal types based on your UserProfile interface
type GoalType = "lose-fat" | "build-muscle" | "maintain";

// Data for the requested UI with IDs matching your types
const goals = [
  { id: 'lose-fat', label: 'Lose Weight', icon: '📉' },      // ID matched to type
  { id: 'build-muscle', label: 'Build Muscle', icon: '💪' }, // ID matched to type
  { id: 'maintain', label: 'Stay Healthy', icon: '⚖️' },     // ID matched to type
  { id: 'performance', label: 'Athletic Performance', icon: '🏃' }, // Will map this to 'build-muscle'
];

export function SimplifiedOnboarding({ onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Logic to finish onboarding
  const handleFinish = async () => {
    setIsSubmitting(true);
    
    // Map the selected goal to a valid GoalType
    // If 'performance' is selected, we default to 'build-muscle' for the backend type
    let finalGoal: GoalType = 'maintain';
    if (goal === 'lose-fat') finalGoal = 'lose-fat';
    if (goal === 'build-muscle' || goal === 'performance') finalGoal = 'build-muscle';
    if (goal === 'maintain') finalGoal = 'maintain';

    const profile: UserProfile = {
      target_calories: 2000,
      target_protein_g: 150,
      target_carbs_g: 200,
      target_fats_g: 65,
      preferredMealTypes: []
    };

    // Save onboarding completion to localStorage
    const now = Date.now();
    localStorage.setItem("userProfile", JSON.stringify(profile));
    localStorage.setItem("hasCompletedOnboarding", "true");
    localStorage.setItem("macroMatch_lastLogin", now.toString());

    // Call the onComplete callback
    onComplete(profile);

    // Reset loading state
    setIsSubmitting(false);

    // Redirect to home - use window.location for reliable redirect
    setTimeout(() => {
      window.location.href = "/chat";
    }, 100);
  };

  // --- STEP 1: GOAL SELECTION ---
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

  // --- STEP 2: Basic Info (Optional) ---
  if (step === 2) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-teal-500 to-blue-600 rounded-3xl mb-4 shadow-lg shadow-teal-500/50">
              <Target className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-white mb-2 text-2xl font-bold">Almost there!</h1>
            <p className="text-gray-400">We're setting up your personalized meal recommendations.</p>
          </div>

          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 rounded-2xl p-6 mb-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center">
                  <Check className="w-5 h-5 text-teal-400" />
                </div>
                <div>
                  <div className="text-white font-medium">Goal Selected</div>
                  <div className="text-gray-400 text-sm">
                    {goals.find(g => g.id === goal)?.label || 'Your goal'}
                  </div>
                </div>
              </div>
              <div className="h-px bg-gray-700" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Check className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-white font-medium">Default Settings</div>
                  <div className="text-gray-400 text-sm">Balanced diet • 2000 calories</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-center mb-6">
            <div className="h-2 w-16 bg-gray-800 rounded-full" />
            <div className="h-2 w-16 bg-gradient-to-r from-teal-500 to-blue-600 rounded-full" />
          </div>

          <Button
            onClick={handleFinish}
            disabled={isSubmitting}
            className="h-14 rounded-full bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 shadow-lg shadow-teal-500/30 w-full disabled:opacity-50 text-white font-semibold text-lg"
          >
            {isSubmitting ? (
              <>
                <span className="inline-block animate-spin mr-2">⏳</span>
                Building Your Profile...
              </>
            ) : (
              <>
                Finish Setup
                <ChevronRight className="ml-2 w-5 h-5" />
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Fallback (shouldn't reach here)
  return null;
}