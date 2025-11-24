'use client';

import { useState } from 'react';
import { WelcomeScreenV2 } from './components/WelcomeScreenV2';
import { MicroOnboarding } from './components/MicroOnboarding';
import { SimplifiedOnboarding } from './components/SimplifiedOnboarding';
import { HomeScreen } from './components/HomeScreen';
import { MealDetail } from './components/MealDetail';
import { AIChat } from './components/AIChat'; // Ensure this file exists at app/components/AIChat.tsx
import { Favorites } from './components/Favorites';
import { Settings } from './components/Settings';
import { Navigation } from './components/Navigation';
import { ThemeProvider } from './contexts/ThemeContext';
import type { UserProfile, Meal } from './types'; // <--- THE IMPORTANT FIX

export default function Home() {
  const [showWelcome, setShowWelcome] = useState(true);
  const [showMicroOnboarding, setShowMicroOnboarding] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  
  const [currentScreen, setCurrentScreen] = useState<'home' | 'chat' | 'favorites' | 'settings'>('home'); 
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [favoriteMeals, setFavoriteMeals] = useState<string[]>([]);

  // Fix type compatibility issues
  const handleOnboardingComplete = (profile: UserProfile) => {
    setUserProfile(profile);
    setHasCompletedOnboarding(true);
  };

  const toggleFavorite = (mealId: string) => {
    setFavoriteMeals(prev => prev.includes(mealId) ? prev.filter(id => id !== mealId) : [...prev, mealId]);
  };

  const logMeal = (meal: Meal) => {
    // Placeholder log logic
    console.log("Logged meal:", meal);
  };

  // --- FULL SCREEN OVERLAYS ---
  
  if (showWelcome) {
    return <WelcomeScreenV2 onGetStarted={() => { setShowWelcome(false); setShowMicroOnboarding(true); }} />;
  }

  if (showMicroOnboarding) {
    return <MicroOnboarding onComplete={() => setShowMicroOnboarding(false)} />;
  }

  if (!hasCompletedOnboarding) {
    return <SimplifiedOnboarding onComplete={handleOnboardingComplete} />;
  }

  if (selectedMeal) {
    return (
      <MealDetail
        meal={selectedMeal}
        isFavorite={favoriteMeals.includes(selectedMeal.id)}
        onToggleFavorite={() => toggleFavorite(selectedMeal.id)}
        onBack={() => setSelectedMeal(null)}
        onLogMeal={() => { logMeal(selectedMeal); setSelectedMeal(null); }}
      />
    );
  }

  // --- MAIN APP LAYOUT ---
  
  return (
    <ThemeProvider>
      <div className="h-screen w-full bg-black text-white flex flex-col overflow-hidden relative">
        
        <div className="flex-1 overflow-y-auto scrollbar-hide w-full max-w-md mx-auto bg-gray-950 border-x border-gray-900">
          
          {/* 
             We check 'userProfile &&' before rendering to ensure 
             null is never passed to components expecting UserProfile 
          */}
          
          {currentScreen === 'home' && userProfile && (
            <HomeScreen 
              userProfile={userProfile} 
              onMealSelect={setSelectedMeal} 
              favoriteMeals={favoriteMeals} 
            />
          )}

          {currentScreen === 'chat' && userProfile && (
            <AIChat userProfile={userProfile} onMealSelect={setSelectedMeal} />
          )}

          {currentScreen === 'favorites' && (
            <Favorites favoriteMeals={favoriteMeals} onMealSelect={setSelectedMeal} onToggleFavorite={toggleFavorite} />
          )}

          {currentScreen === 'settings' && userProfile && (
            <Settings userProfile={userProfile} onUpdateProfile={setUserProfile} />
          )}

        </div>

        <div className="w-full max-w-md mx-auto bg-gray-900 border-t border-gray-800 z-50">
          <Navigation currentScreen={currentScreen} onNavigate={setCurrentScreen} />
        </div>
      </div>
    </ThemeProvider>
  );
}