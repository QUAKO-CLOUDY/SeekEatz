'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Navigation, type Screen } from './Navigation';
import { HomeScreen } from './HomeScreen';
import { LogScreen } from './LogScreen';
import { Favorites } from './Favorites';
import { Settings } from './Settings';
import AIChat from './AIChat';
import { MealDetail } from './MealDetail';
import { SearchScreen } from './SearchScreen';
import { OnboardingFlow } from './OnboardingFlow';
import { AuthScreen } from './AuthScreen';
import type { UserProfile, Meal } from '../types';
import type { LoggedMeal } from './LogScreen';
import { useSessionActivity } from '../hooks/useSessionActivity';
import { useNutrition } from '../contexts/NutritionContext'; // Import to sync loggedMeals with context

type View = 'main' | 'meal-detail';

type AppState = 'loading' | 'onboarding' | 'auth' | 'app';

type MainAppProps = {
  initialScreen?: Screen;
};

export function MainApp({ initialScreen = 'home' }: MainAppProps) {
  // ========== ALL HOOKS MUST BE DECLARED FIRST ==========
  
  // Router and Supabase client
  const router = useRouter();
  const pathname = usePathname();
  
  // Client ready check (stable boolean) - must be defined before isChatRoute
  const isClient = typeof window !== 'undefined';
  
  // Create stable Supabase client reference (not recreated every render)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!supabaseRef.current) {
    supabaseRef.current = createClient();
  }
  const supabase = supabaseRef.current;
  
  // Check if we're on the /chat route (robust pathname check)
  // Normalize pathname: remove trailing slashes and query strings for comparison
  // Handle /chat, /chat/, /chat?foo=bar, etc.
  // Only compute on client-side to avoid hydration mismatches
  const normalizedPathname = isClient && pathname 
    ? pathname.replace(/\/$/, '').split('?')[0] 
    : '';
  const isChatRoute = normalizedPathname === '/chat' || initialScreen === 'chat';
  
  // Hydration fix: Track if component is mounted on client
  const [isMounted, setIsMounted] = useState(false);
  
  // State machine for app flow
  const [appState, setAppState] = useState<AppState>('loading');
  
  // Use default values in useState initializers (no localStorage reads)
  // Navigation history stack to track screen navigation
  const [navHistory, setNavHistory] = useState<Screen[]>([initialScreen || 'home']);
  
  // Current screen - use default value from prop
  const [currentScreen, setCurrentScreen] = useState<Screen>(initialScreen);
  
  const [currentView, setCurrentView] = useState<View>('main');
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  
  // Use default values (empty array/object) - will be populated from localStorage in useEffect
  const [favoriteMeals, setFavoriteMeals] = useState<string[]>([]);
  const [favoriteMealsData, setFavoriteMealsData] = useState<Record<string, Meal>>({});
  const [loggedMeals, setLoggedMeals] = useState<LoggedMeal[]>([]);

  // Default user profile - will be populated from localStorage in useEffect
  const [userProfile, setUserProfile] = useState<UserProfile>({
    target_calories: 2000,
    target_protein_g: 150,
    target_carbs_g: 200,
    target_fats_g: 70,
    search_distance_miles: 10,
  });

  // Track current user ID
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  
  // Get updateLoggedMeals from NutritionContext to sync state
  // NutritionProvider is now at root layout level, so this should always work
  const { updateLoggedMeals } = useNutrition();

  // Session timeout handler - redirects to login on timeout
  const handleSessionTimeout = () => {
    setAppState('auth');
  };

  // Track session activity - updates on navigation and user interactions
  const { updateActivity } = useSessionActivity(handleSessionTimeout);

  // Hydration fix: Mark component as mounted on client
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Load all localStorage state on mount (only after component is mounted on client)
  // Consolidated into single effect for better performance
  useEffect(() => {
    if (!isMounted) return;

    // Load navigation history and current screen
    try {
      const savedHistory = localStorage.getItem('seekeatz_nav_history');
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Validate and filter to only include valid Screen values
          const validScreens: Screen[] = ['home', 'log', 'chat', 'favorites', 'settings', 'search'];
          const filteredHistory = parsed.filter((screen): screen is Screen => 
            typeof screen === 'string' && validScreens.includes(screen as Screen)
          ) as Screen[];
          
          if (filteredHistory.length > 0) {
            setNavHistory(filteredHistory);
            setCurrentScreen(filteredHistory[filteredHistory.length - 1]);
          }
        }
      } else {
        // Fallback to saved screen if no history
        const saved = localStorage.getItem('seekeatz_current_screen');
        if (saved && ['home', 'log', 'chat', 'favorites', 'settings'].includes(saved)) {
          setCurrentScreen(saved as Screen);
        }
      }
    } catch (e) {
      console.error('Failed to parse navigation state:', e);
    }

    // Load favorite meals
    try {
      const saved = localStorage.getItem('seekeatz_favorite_meals');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setFavoriteMeals(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to parse favoriteMeals:', e);
    }

    // Load favorite meals data
    try {
      const saved = localStorage.getItem('seekeatz_favorite_meals_data');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) {
          setFavoriteMealsData(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to parse favoriteMealsData:', e);
    }

    // Load user profile
    try {
      const saved = localStorage.getItem('userProfile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) {
          setUserProfile(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to parse userProfile:', e);
    }

    // Load logged meals and reset today's meals if it's a new day
    try {
      const saved = localStorage.getItem('seekeatz_logged_meals');
      const todayStr = new Date().toISOString().split('T')[0];
      const lastResetDate = localStorage.getItem('seekeatz_last_reset_date');
      
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // If it's a new day, filter out all meals from today's date (reset today's log)
          // Keep all historical meals (dates before today)
          if (lastResetDate && lastResetDate !== todayStr) {
            // It's a new day - remove all meals from today's date to reset today's log
            // Keep all meals from dates before today (historical data)
            const filteredMeals = parsed.filter((log: LoggedMeal) => {
              // Keep meals from dates before today (historical)
              return log.date < todayStr;
            });
            setLoggedMeals(filteredMeals);
            // Update last reset date to today
            localStorage.setItem('seekeatz_last_reset_date', todayStr);
          } else {
            // Same day or first time - keep all meals including today's
            setLoggedMeals(parsed);
            // Set last reset date if not set
            if (!lastResetDate) {
              localStorage.setItem('seekeatz_last_reset_date', todayStr);
            }
          }
        }
      } else {
        // No saved meals - set last reset date to today
        localStorage.setItem('seekeatz_last_reset_date', todayStr);
      }
    } catch (e) {
      console.error('Failed to parse loggedMeals:', e);
    }
  }, [isMounted]);

  // Initialize app state: Check localStorage for 'onboarded' and Supabase session
  useEffect(() => {
    if (!isMounted) return;
    
    const initializeApp = async () => {
      // Check localStorage for onboarding completion
      const isOnboarded = typeof window !== 'undefined' 
        ? localStorage.getItem('onboarded') === 'true' ||
          localStorage.getItem('hasCompletedOnboarding') === 'true'
        : false;

      // Check Supabase session - retry if not found initially (session might still be propagating)
      // Treat AuthSessionMissingError as "no user" (signed-out preview mode)
      let user = null;
      let retries = 0;
      while (retries < 3 && !user) {
        try {
          const { data: { user: fetchedUser }, error } = await supabase.auth.getUser();
          if (fetchedUser && !error) {
            user = fetchedUser;
            break;
          }
          // If error is AuthSessionMissingError, treat as no user (expected for signed-out users)
          if (error && (error.message?.includes('Auth session missing') || error.name === 'AuthSessionMissingError')) {
            // This is expected for signed-out users - break and continue with user = null
            break;
          }
          // Wait a bit before retrying (only if we didn't get a user and it's not a session missing error)
          if (!fetchedUser && retries < 2) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (error: any) {
          // AuthSessionMissingError is expected when signed out - treat as no user
          if (error?.message?.includes('Auth session missing') || error?.name === 'AuthSessionMissingError') {
            // This is expected for signed-out users - break and continue with user = null
            break;
          }
          console.warn("Unexpected auth error in MainApp:", error);
        }
        retries++;
      }
      
      // If we have a user but no onboarding flag, check the database
      if (user && !isOnboarded) {
        setCurrentUserId(user.id); // Track current user ID
        try {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("has_completed_onboarding")
            .eq("id", user.id)
            .single();
          
          if (profileData?.has_completed_onboarding) {
            // Set localStorage flags
            if (typeof window !== 'undefined') {
              localStorage.setItem(`seekEatz_hasCompletedOnboarding_${user.id}`, "true");
              localStorage.setItem("hasCompletedOnboarding", "true");
            }
            // User is onboarded - show app
            setAppState('app');
            return;
          }
        } catch (error) {
          console.warn("Could not check onboarding status:", error);
        }
      }
      
      // Track user ID if user exists
      if (user) {
        setCurrentUserId(user.id);
      } else {
        setCurrentUserId(undefined);
      }

      // Only set state if we haven't already been set by auth state change listener
      // This prevents overriding a successful sign-in
      setAppState((currentState) => {
        // If auth state change listener already set us to 'app', don't override
        if (currentState === 'app') {
          return currentState;
        }
        
        if (!isOnboarded) {
          // Not onboarded - show onboarding
          return 'onboarding';
        } else if (!user) {
          // Onboarded but not authenticated
          // If we're on the /chat route, allow preview access (don't show auth screen)
          // The AIChat component will handle the free chat limit and redirect to /auth/signin if needed
          if (isChatRoute) {
            // Allow chat preview - show app UI, AIChat will handle limit logic
            return 'app';
          }
          
          // If onboarding was just completed (recent localStorage flag), give session time to propagate
          // Check if onboardingCompleted flag was set very recently (within last 5 seconds)
          const onboardingTimestamp = typeof window !== 'undefined' 
            ? localStorage.getItem('onboardingCompletedTimestamp')
            : null;
          
          if (onboardingTimestamp) {
            const timestamp = parseInt(onboardingTimestamp, 10);
            const timeSinceOnboarding = Date.now() - timestamp;
            // If onboarding was completed less than 5 seconds ago, wait a bit more for session
            if (timeSinceOnboarding < 5000) {
              // Wait a bit and retry getting user
              setTimeout(async () => {
                try {
                  const { data: { user: retryUser }, error: retryError } = await supabase.auth.getUser();
                  if (retryUser) {
                    setAppState('app');
                  } else {
                    // If error is AuthSessionMissingError, treat as no user (expected for signed-out)
                    // Only show auth screen if NOT on chat route
                    if (!isChatRoute && retryError && !retryError.message?.includes('Auth session missing')) {
                      setAppState('auth');
                    } else {
                      // On chat route or session missing (signed-out preview) - show app
                      setAppState('app');
                    }
                  }
                } catch (error: any) {
                  // AuthSessionMissingError is expected when signed out - show app for preview
                  if (error?.message?.includes('Auth session missing') || error?.name === 'AuthSessionMissingError') {
                    setAppState('app');
                  } else {
                    // Other errors - only show auth if NOT on chat route
                    if (!isChatRoute) {
                      setAppState('auth');
                    } else {
                      setAppState('app');
                    }
                  }
                }
              }, 1000);
              // Return current state while waiting
              return currentState || 'app';
            }
          }
          // Onboarded but not authenticated - show auth (unless on chat route)
          // On chat route, allow preview access
          return isChatRoute ? 'app' : 'auth';
        } else {
          // Onboarded and authenticated - show app
          return 'app';
        }
      });
    };

    initializeApp();
  }, [supabase, isMounted, isChatRoute]);

  // Set up auth state change listener - this is the primary way we react to sign-in
  useEffect(() => {
    if (!isClient) return;
    
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);
      
      if (event === 'SIGNED_IN' && session?.user) {
        // User logged in - check onboarding status and switch to app view
        const userId = session.user.id;
        setCurrentUserId(userId); // Track current user ID
        
        // Check if user has completed onboarding
        const isOnboarded = typeof window !== 'undefined' 
          ? localStorage.getItem('onboarded') === 'true' ||
            localStorage.getItem('hasCompletedOnboarding') === 'true' ||
            localStorage.getItem(`seekEatz_hasCompletedOnboarding_${userId}`) === 'true'
          : false;
        
        // If not onboarded in localStorage, check database
        if (!isOnboarded) {
          try {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("has_completed_onboarding")
              .eq("id", userId)
              .single();
            
            if (profileData?.has_completed_onboarding) {
              // Set localStorage flags
              if (typeof window !== 'undefined') {
                localStorage.setItem(`seekEatz_hasCompletedOnboarding_${userId}`, "true");
                localStorage.setItem("hasCompletedOnboarding", "true");
              }
              // User is onboarded - show app immediately
              setAppState('app');
              return;
            } else {
              // User not onboarded - show onboarding
              setAppState('onboarding');
              return;
            }
          } catch (error) {
            console.warn("Could not check onboarding status:", error);
            // If we can't check, assume not onboarded
            setAppState('onboarding');
            return;
          }
        }
        
        // User is onboarded - switch to app view immediately
        setAppState('app');
      } else if (event === 'SIGNED_OUT') {
        // User logged out
        setCurrentUserId(undefined); // Clear user ID
        // If on chat route, ALWAYS allow preview access (don't show auth screen)
        // The AIChat component will handle the free chat limit and redirect to /auth/signin if needed
        if (isChatRoute) {
          setAppState('app');
        } else {
          // Not on chat route - show auth screen
          setAppState('auth');
        }
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Session refreshed - make sure we're showing app if user is authenticated
        const userId = session.user.id;
        const isOnboarded = typeof window !== 'undefined' 
          ? localStorage.getItem('onboarded') === 'true' ||
            localStorage.getItem('hasCompletedOnboarding') === 'true' ||
            localStorage.getItem(`seekEatz_hasCompletedOnboarding_${userId}`) === 'true'
          : false;
        
        if (isOnboarded) {
          setAppState('app');
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, isClient, isChatRoute]);

  // Safety guard: If on chat route, never allow appState to be 'auth'
  useEffect(() => {
    if (isChatRoute && appState === 'auth') {
      // Force app state for chat preview access
      setAppState('app');
    }
  }, [isChatRoute, appState]);

  useEffect(() => {
    console.log('MainApp mounted, current screen:', currentScreen);
  }, [currentScreen]);

  // Handle browser back/forward navigation (swipe gestures) - use same logic as handleBack
  useEffect(() => {
    const handlePopState = () => {
      // When user swipes back, use the same handleBack logic
      if (currentView === 'meal-detail') {
        setCurrentView('main');
        setSelectedMeal(null);
      } else if (currentScreen === 'search') {
        // Navigate to home and update history
        setNavHistory((prev) => {
          const newHistory: Screen[] = [...prev, 'home'];
          const limited = newHistory.slice(-10);
          if (typeof window !== 'undefined') {
            localStorage.setItem('seekeatz_nav_history', JSON.stringify(limited));
            localStorage.setItem('seekeatz_current_screen', 'home');
          }
          return limited;
        });
        setCurrentScreen('home');
      } else {
        // Go back in navigation history
        setNavHistory((prev) => {
          if (prev.length > 1) {
            const newHistory = [...prev];
            newHistory.pop(); // Remove current screen
            const previousScreen = newHistory[newHistory.length - 1];
            
            // Update current screen to previous
            setCurrentScreen(previousScreen);
            if (typeof window !== 'undefined') {
              localStorage.setItem('seekeatz_current_screen', previousScreen);
              localStorage.setItem('seekeatz_nav_history', JSON.stringify(newHistory));
            }
            return newHistory;
          }
          return prev;
        });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [currentView, currentScreen]);

  // Save user profile to localStorage when it changes (only after mounted)
  useEffect(() => {
    if (!isMounted) return;
    try {
      localStorage.setItem('userProfile', JSON.stringify(userProfile));
    } catch (e) {
      console.error('Failed to save userProfile:', e);
    }
  }, [userProfile, isMounted]);

  // Save logged meals to localStorage and sync with NutritionContext when they change (only after mounted)
  useEffect(() => {
    if (!isMounted) return;
    try {
      localStorage.setItem('seekeatz_logged_meals', JSON.stringify(loggedMeals));
      // Sync with NutritionContext
      updateLoggedMeals(loggedMeals);
    } catch (e) {
      console.error('Failed to save loggedMeals:', e);
    }
  }, [loggedMeals, isMounted, updateLoggedMeals]);

  // ========== ALL HOOKS END HERE - NOW HANDLERS AND CONDITIONAL RENDERS ==========

  // Handle onboarding completion
  const handleOnboardingComplete = () => {
    // Save onboarding flag
    if (typeof window !== 'undefined') {
      localStorage.setItem('onboarded', 'true');
      localStorage.setItem('hasCompletedOnboarding', 'true');
    }
    // Move to auth screen
    setAppState('auth');
  };

  // Handle auth success (fallback, but onAuthStateChange should handle it)
  const handleAuthSuccess = () => {
    setAppState('app');
  };

  // ========== CONDITIONAL RENDERS (after all hooks) ==========

  // Hydration fix: Don't render localStorage-dependent UI until mounted
  if (!isMounted) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="text-cyan-400 text-lg">Loading...</div>
      </div>
    );
  }

  // Show loading state
  if (appState === 'loading') {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="text-cyan-400 text-lg">Loading...</div>
      </div>
    );
  }

  // Show onboarding
  if (appState === 'onboarding') {
    return (
      <div className="min-h-screen bg-background">
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </div>
    );
  }

  // Show auth screen (but NEVER on /chat route - always show app for preview)
  if (appState === 'auth') {
    // If we're on the /chat route, force app state to allow preview access
    // This should never happen due to logic above, but add safety check
    if (isChatRoute) {
      // Force app state for chat preview
      setAppState('app');
      // Return null briefly while state updates, then will render app
      return null;
    }
    return <AuthScreen onSuccess={handleAuthSuccess} />;
  }

  // If we reach here, appState is 'app' - render the main app UI

  const handleNavigate = (screen: Screen) => {
    // Update activity on navigation
    updateActivity();
    
    // Only add to history if it's a different screen
    if (screen !== currentScreen) {
      setNavHistory((prev) => {
        const newHistory = [...prev, screen];
        // Limit history to last 10 entries
        const limited = newHistory.slice(-10);
        if (typeof window !== 'undefined') {
          localStorage.setItem('seekeatz_nav_history', JSON.stringify(limited));
        }
        return limited;
      });
    }
    setCurrentScreen(screen);
    setCurrentView('main');
    setSelectedMeal(null);
    // Save current screen to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('seekeatz_current_screen', screen);
    }
  };

  const handleMealSelect = (meal: Meal) => {
    updateActivity(); // Update activity on meal selection
    setSelectedMeal(meal);
    setCurrentView('meal-detail');
  };

  const handleBack = () => {
    if (currentView === 'meal-detail') {
      // If on meal detail, go back to main view
      setCurrentView('main');
      setSelectedMeal(null);
    } else if (currentScreen === 'search') {
      // If on search, go to home
      handleNavigate('home');
    } else {
      // Otherwise, go back in navigation history
      setNavHistory((prev) => {
        if (prev.length > 1) {
          const newHistory = [...prev];
          newHistory.pop(); // Remove current screen
          const previousScreen = newHistory[newHistory.length - 1];
          
          // Update current screen to previous
          setCurrentScreen(previousScreen);
          if (typeof window !== 'undefined') {
            localStorage.setItem('seekeatz_current_screen', previousScreen);
            localStorage.setItem('seekeatz_nav_history', JSON.stringify(newHistory));
          }
          return newHistory;
        }
        // If no history, stay on current screen
        return prev;
      });
    }
  };

  const handleToggleFavorite = (mealId: string, meal?: Meal) => {
    updateActivity(); // Update activity on favorite toggle
    setFavoriteMeals((prev) => {
      const isCurrentlyFavorite = prev.includes(mealId);
      const updated = isCurrentlyFavorite
        ? prev.filter((id) => id !== mealId)
        : [...prev, mealId];
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('seekeatz_favorite_meals', JSON.stringify(updated));
        
        // Also store/remove meal data
        if (meal) {
          setFavoriteMealsData((prevData) => {
            const updatedData = isCurrentlyFavorite
              ? (() => {
                  const newData = { ...prevData };
                  delete newData[mealId];
                  return newData;
                })()
              : { ...prevData, [mealId]: meal };
            localStorage.setItem('seekeatz_favorite_meals_data', JSON.stringify(updatedData));
            return updatedData;
          });
        }
      }
      return updated;
    });
  };

  const handleLogMeal = (meal: Meal) => {
    updateActivity(); // Update activity on meal logging
    
    // Debug log
    const todayStr = new Date().toISOString().split('T')[0];
    const todayMeals = loggedMeals.filter(log => log.date === todayStr);
    const todaysConsumed = todayMeals.reduce((sum, log) => sum + log.meal.calories, 0);
    const targetCalories = userProfile?.target_calories || 0;
    const remainingIfEatMeal = targetCalories - (todaysConsumed + meal.calories);
    
    console.log('[MainApp] Logging meal:', {
      targetCalories,
      todaysConsumedCalories: todaysConsumed,
      mealCalories: meal.calories,
      remainingIfEatMeal,
    });
    
    const loggedMeal: LoggedMeal = {
      id: `log-${Date.now()}-${Math.random()}`,
      meal,
      timestamp: new Date().toISOString(),
      date: todayStr,
    };
    setLoggedMeals((prev) => [...prev, loggedMeal]);
    setCurrentView('main');
    setSelectedMeal(null);
    handleNavigate('log');
  };

  const handleRemoveMeal = (id: string) => {
    setLoggedMeals((prev) => prev.filter((meal) => meal.id !== id));
  };

  const handleUpdateProfile = (updates: Partial<UserProfile>) => {
    setUserProfile((prev) => ({ ...prev, ...updates }));
  };

  // Show meal detail if a meal is selected
  if (currentView === 'meal-detail' && selectedMeal) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <MealDetail
          meal={selectedMeal}
          isFavorite={favoriteMeals.includes(selectedMeal.id)}
          onToggleFavorite={() => handleToggleFavorite(selectedMeal.id, selectedMeal)}
          onBack={handleBack}
          onLogMeal={handleLogMeal}
        />
      </div>
    );
  }

  // Show search screen (full screen, no navigation)
  if (currentScreen === 'search') {
    return (
      <div className="flex flex-col h-screen bg-background">
        <SearchScreen
          onMealSelect={handleMealSelect}
          onBack={handleBack}
        />
      </div>
    );
  }

  // Main app with navigation
  console.log('MainApp rendering, screen:', currentScreen, 'view:', currentView);
  
  // NutritionProvider is now at root layout level, so we don't need to wrap here
  // However, we can still pass props to update it if needed via context methods
  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
        <div className="flex-1 relative h-full overflow-hidden">
          {currentScreen === 'home' && (
            <HomeScreen
              userProfile={userProfile}
              onMealSelect={handleMealSelect}
              favoriteMeals={favoriteMeals}
              loggedMeals={loggedMeals}
              onSearch={() => handleNavigate('search')}
              onNavigateToChat={(message) => {
                if (message && typeof window !== 'undefined') {
                  localStorage.setItem('seekeatz_pending_chat_message', message);
                }
                handleNavigate('chat');
              }}
              onToggleFavorite={(mealId, meal) => handleToggleFavorite(mealId, meal)}
            />
          )}
          {currentView === 'meal-detail' && selectedMeal && (
            <MealDetail
              meal={selectedMeal}
              isFavorite={favoriteMeals.includes(selectedMeal.id)}
              onToggleFavorite={() => handleToggleFavorite(selectedMeal.id, selectedMeal)}
              onBack={() => setCurrentView('main')}
              onLogMeal={handleLogMeal}
            />
          )}
          {currentScreen === 'log' && (
            <LogScreen
              userProfile={userProfile}
              loggedMeals={loggedMeals}
              onRemoveMeal={handleRemoveMeal}
            />
          )}
          {currentScreen === 'chat' && (
            <AIChat
              userId={currentUserId}
              userProfile={userProfile}
              onMealSelect={handleMealSelect}
              favoriteMeals={favoriteMeals}
              onToggleFavorite={(mealId, meal) => handleToggleFavorite(mealId, meal)}
              onSignInRequest={() => router.push('/auth/signin')}
            />
          )}
          {currentScreen === 'favorites' && (
            <Favorites
              favoriteMeals={favoriteMeals}
              favoriteMealsData={favoriteMealsData}
              loggedMeals={loggedMeals}
              onMealSelect={handleMealSelect}
              onToggleFavorite={(mealId, meal) => handleToggleFavorite(mealId, meal)}
            />
          )}
          {currentScreen === 'settings' && (
            <Settings
              userProfile={userProfile}
              onUpdateProfile={handleUpdateProfile}
            />
          )}
        </div>
        
        <Navigation
          currentScreen={currentScreen}
          onNavigate={handleNavigate}
        />
      </div>
  );
}

