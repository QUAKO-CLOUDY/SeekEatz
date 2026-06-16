'use client';

import { useState, useEffect, useMemo, useCallback, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { recordFunnelEvent } from '@/lib/telemetry/recordFunnelEvent';
import { Navigation, type Screen } from './Navigation';
import { HomeScreen } from './HomeScreen';
import { LogScreen } from './LogScreen';
import { Favorites } from './Favorites';
import { Settings } from './Settings';
import AIChat from './AIChat';
import { MealDetail } from './MealDetail';
import { SearchScreen } from './SearchScreen';
import { OnboardingFlow } from './OnboardingFlow';
import { UpgradeModal } from './UpgradeModal';
import { WaitlistTrialEndedModal } from './WaitlistTrialEndedModal';
import { AppTutorialOverlay, type AppTutorialStep } from './AppTutorialOverlay';
import type { UserProfile, Meal } from '../types';
import type { LoggedMeal } from './LogScreen';
import { useSessionActivity } from '../hooks/useSessionActivity';
import { useNutrition } from '../contexts/NutritionContext'; // Import to sync loggedMeals with context
import { hasDevFullAccess, setDevFullAccess } from '@/lib/onboarding-flow';
import {
  buildEntitlement,
  clearCachedEntitlement,
  writeCachedEntitlement,
  type AppEntitlement,
} from '@/lib/entitlements';
import { useAccountEntitlement } from '@/app/hooks/useAccountEntitlement';
import { isNativeApp } from '@/lib/native-runtime';
import { reconcileRevenueCatEntitlement } from '@/lib/billing/revenuecat-client';
import { hasPendingWaitlistWelcome } from '@/lib/waitlist-welcome';
import {
  markWaitlistTrialEndedPopupSeen,
  shouldShowWaitlistTrialEndedPopup,
} from '@/lib/waitlist-trial';
import { getBillingTierFromAppleProductId } from '@/lib/billing/app-store-sync';
import { bootstrapAccount } from '@/lib/bootstrap-account';
import { isFullAccessEmail } from '@/lib/full-access';
import {
  getLastResetDateStorageKey,
  getLoggedMealsStorageKey,
  migrateLegacyLoggedMealsStorage,
} from '@/lib/logged-meals-storage';
import { clearChatState } from '@/lib/chatStorage';
import { markInflightLoading, registerAppRequestReset, startAppSuspendRecovery } from '@/lib/app-suspend-recovery';

type View = 'main' | 'meal-detail';

type AppState = 'loading' | 'onboarding' | 'auth' | 'app';

type MainAppProps = {
  initialScreen?: Screen;
};

type PostLogChoiceState = {
  mealName: string;
  returnScreen: 'home' | 'chat';
};

const APP_TUTORIAL_STEPS: AppTutorialStep[] = [
  {
    screen: 'home',
    title: 'Find meals fast that fit',
    body: "Set your calories and macros. We'll show meals that match.",
    target: 'home-macro-tabs',
    buttonLabel: 'Next',
    placement: 'above',
    cardOffset: 220,
    initialDelayMs: 600,
  },
  {
    screen: 'log',
    title: 'Log your meals',
    body: 'Automatically or manually log meals to view your daily breakdown.',
    target: 'log-progress-ring',
    buttonLabel: 'Next',
    placement: 'above',
    cardOffset: 132,
    compactCard: true,
  },
  {
    screen: 'chat',
    title: 'Chat with our AI concierge',
    body: "Tell us what you want and we'll find the best options near you.",
    target: 'chat-input',
    buttonLabel: 'Next',
    spotlightPadding: 0,
  },
  {
    screen: 'favorites',
    title: 'Remember your favorites',
    body: 'Save meals you enjoy to come back to in the future.',
    target: 'favorites-heart',
    buttonLabel: 'Next',
    placement: 'below',
    spotlightShape: 'box',
    spotlightPadding: 6,
    cardOffset: 18,
    compactCard: true,
  },
  {
    screen: 'settings',
    title: 'Fit to you',
    body: 'Customize your profile and set your daily targets to your personal goals.',
    target: 'settings-edit-profile',
    buttonLabel: 'Finish',
  },
];

const ACTIVE_APP_USER_KEY = 'seekeatz_active_app_user_id';
const APP_LAST_FOREGROUND_KEY = 'seekeatz_last_foreground_at';
const QUERY_RESET_WINDOW_MS = 60 * 60 * 1000;

function clearHomeScreenCache(): void {
  if (typeof window === 'undefined') return;

  const localKeys = [
    'seekeatz_recommended_meals',
    'seekeatz_has_searched',
    'seekeatz_last_search_params',
    'seekeatz_macro_enabled',
    'seekeatz_macro_directions',
    'seekeatz_selected_cuisine',
  ];

  const sessionKeys = [
    'seekeatz_home_macro_values_v2',
    'seekeatz_home_distance_override',
    'seekeatz_chat_distance_override',
    'seekeatz_home_scroll_position',
    'seekeatz_last_clicked_meal_id',
  ];

  localKeys.forEach((key) => localStorage.removeItem(key));
  sessionKeys.forEach((key) => sessionStorage.removeItem(key));
}

function clearFreshQueryState(): void {
  if (typeof window === 'undefined') return;

  clearHomeScreenCache();
  clearChatState();
  localStorage.removeItem('seekeatz_pending_chat_message');
}

function syncActiveUserCache(userId: string | undefined): void {
  if (typeof window === 'undefined' || !userId) return;

  const lastActiveUserId = localStorage.getItem(ACTIVE_APP_USER_KEY);
  if (lastActiveUserId !== userId) {
    clearHomeScreenCache();
  }

  localStorage.setItem(ACTIVE_APP_USER_KEY, userId);
}

export function MainApp({ initialScreen = 'home' }: MainAppProps) {
  // ========== ALL HOOKS MUST BE DECLARED FIRST ==========

  // Router and Supabase client
  const router = useRouter();

  // Client ready check (stable boolean)
  const isClient = typeof window !== 'undefined';

  // Create stable Supabase client instance
  const supabase = useMemo(() => createClient(), []);

  // Hydration fix: Track if component is mounted on client
  const [isMounted, setIsMounted] = useState(false);

  // State machine for app flow
  const [appState, setAppState] = useState<AppState>('loading');

  // Use default values in useState initializers (no localStorage reads)
  // Navigation history stack to track screen navigation
  const [, setNavHistory] = useState<Screen[]>([initialScreen || 'home']);

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
    search_distance_miles: 15,
  });

  // Track current user ID
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | undefined>(undefined);
  const [hasHydratedCurrentUser, setHasHydratedCurrentUser] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showWaitlistTrialEndedModal, setShowWaitlistTrialEndedModal] = useState(false);
  const [postLogChoice, setPostLogChoice] = useState<PostLogChoiceState | null>(null);
  const [devFullAccess, setDevFullAccessState] = useState(false);
  const [isTutorialActive, setIsTutorialActive] = useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);
  const { entitlement, refresh: refreshEntitlement, setEntitlement } = useAccountEntitlement(isMounted);
  // Hide premium lock icons until we've finished resolving entitlement on
  // native. Prevents a brief flash of yellow locks while RevenueCat reconcile
  // is still in flight.
  const [entitlementResolved, setEntitlementResolved] = useState(() => !isNativeApp());

  // On startup (and whenever the signed-in user changes) reconcile the live
  // RevenueCat entitlement into Supabase so a paying user gets premium access
  // app-wide without having to open the Settings or Upgrade screen first.
  //
  // RevenueCat is treated as the source of truth on-device: if it reports an
  // active premium entitlement we unlock immediately, even if the server read
  // comes back as "free" (e.g. a transiently missing session cookie). This
  // guarantees a paying user is never locked out by a backend hiccup.
  useEffect(() => {
    if (!isMounted || !hasHydratedCurrentUser || !currentUserId) return;
    if (!isNativeApp()) {
      setEntitlementResolved(true);
      return;
    }

    setEntitlementResolved(false);
    let cancelled = false;
    (async () => {
      try {
        const { synced, premiumActive, premiumProductId } =
          await reconcileRevenueCatEntitlement({
            appUserID: currentUserId,
            email: currentUserEmail ?? null,
          });
        if (cancelled) return;

        const syncedEntitlement = synced?.entitlement as AppEntitlement | undefined;

        if (syncedEntitlement?.hasPremiumAccess) {
          setEntitlement(syncedEntitlement);
          writeCachedEntitlement(syncedEntitlement);
        } else if (premiumActive) {
          // RevenueCat says this user owns premium but the backend read did
          // not reflect it — trust RevenueCat and unlock locally.
          const premiumEntitlement = buildEntitlement({
            user: { id: currentUserId, email: currentUserEmail ?? undefined },
            profile: {
              has_completed_onboarding: true,
              subscription_tier: getBillingTierFromAppleProductId(premiumProductId),
              subscription_status: 'active',
            },
          });
          setEntitlement(premiumEntitlement);
          writeCachedEntitlement(premiumEntitlement);
        } else {
          await refreshEntitlement();
        }
      } catch (error) {
        console.warn('Startup entitlement reconcile skipped:', error);
      } finally {
        if (!cancelled) {
          setEntitlementResolved(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isMounted,
    hasHydratedCurrentUser,
    currentUserId,
    currentUserEmail,
    refreshEntitlement,
    setEntitlement,
  ]);

  useEffect(() => {
    if (!isMounted || !entitlementResolved || !currentUserId) {
      return;
    }

    if (
      typeof window !== "undefined" &&
      window.location.pathname === "/waitlist-welcome"
    ) {
      return;
    }

    if (hasPendingWaitlistWelcome(currentUserId)) {
      router.replace("/waitlist-welcome");
    }
  }, [currentUserId, entitlementResolved, isMounted, router]);

  const favoriteMealsStorageKey = currentUserId
    ? `seekeatz_favorite_meals:${currentUserId}`
    : 'seekeatz_favorite_meals:guest';
  const favoriteMealsDataStorageKey = currentUserId
    ? `seekeatz_favorite_meals_data:${currentUserId}`
    : 'seekeatz_favorite_meals_data:guest';
  const loggedMealsStorageKey = getLoggedMealsStorageKey(currentUserId ?? null);
  const lastResetDateStorageKey = getLastResetDateStorageKey(currentUserId ?? null);

  // Get updateLoggedMeals from NutritionContext to sync state
  // NutritionProvider is now at root layout level, so this should always work
  const { updateLoggedMeals, refreshTargets } = useNutrition();

  const applyLoggedMeals = useCallback((nextMeals: LoggedMeal[]) => {
    setLoggedMeals(nextMeals);

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(loggedMealsStorageKey, JSON.stringify(nextMeals));
      } catch (e) {
        console.error('Failed to save loggedMeals:', e);
      }
    }

    updateLoggedMeals(nextMeals);
  }, [loggedMealsStorageKey, updateLoggedMeals]);

  // Track session activity - updates on navigation and user interactions
  const { updateActivity } = useSessionActivity();

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return;

    const checkStaleStateAndReset = () => {
      const now = Date.now();
      const lastForegroundRaw = localStorage.getItem(APP_LAST_FOREGROUND_KEY);
      const lastForeground = lastForegroundRaw ? Number(lastForegroundRaw) : null;

      if (lastForeground && Number.isFinite(lastForeground) && now - lastForeground > QUERY_RESET_WINDOW_MS) {
        clearFreshQueryState();
      }

      localStorage.setItem(APP_LAST_FOREGROUND_KEY, now.toString());
    };

    checkStaleStateAndReset();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkStaleStateAndReset();
      }

      if (document.visibilityState === 'hidden') {
        localStorage.setItem(APP_LAST_FOREGROUND_KEY, Date.now().toString());
      }
    };

    const handlePageHide = () => {
      localStorage.setItem(APP_LAST_FOREGROUND_KEY, Date.now().toString());
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isMounted]);


  // Hydration fix: Mark component as mounted on client
  useEffect(() => {
    startTransition(() => {
      setIsMounted(true);
    });
    startAppSuspendRecovery();
  }, []);

  // Send unauthenticated users to the single (white) "Welcome Back" sign-in
  // page instead of an in-app auth screen.
  useEffect(() => {
    if (appState === 'auth') {
      router.replace('/auth/signin');
    }
  }, [appState, router]);

  useEffect(() => {
    if (!isMounted) return;
    startTransition(() => {
      setDevFullAccessState(hasDevFullAccess());
    });
  }, [isMounted, currentUserId]);

  useEffect(() => {
    if (!isMounted) return;

    const hydrateCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        syncActiveUserCache(user?.id);
        setCurrentUserId(user?.id);
        setCurrentUserEmail(user?.email);
      } catch {
        setCurrentUserId(undefined);
        setCurrentUserEmail(undefined);
      } finally {
        setHasHydratedCurrentUser(true);
      }
    };

    hydrateCurrentUser();
  }, [isMounted, supabase]);

  const isMasterAccount = isFullAccessEmail(currentUserEmail);
  const tutorialCompletionKey = currentUserId
    ? `seekeatz_app_tutorial_completed_${currentUserId}`
    : 'seekeatz_app_tutorial_completed_guest';
  const hasFullAccess = entitlement.hasPremiumAccess || isMasterAccount || devFullAccess;
  const isRestrictedAccount =
    !!currentUserId && !hasFullAccess && entitlementResolved;

  useEffect(() => {
    if (!isMounted) return;
    if (isMasterAccount) {
      setDevFullAccess(true);
      startTransition(() => {
        setDevFullAccessState(true);
      });
    }
  }, [isMasterAccount, isMounted]);

  useEffect(() => {
    if (!isMounted || appState !== 'app') return;
    if (typeof window === 'undefined') return;

    if (localStorage.getItem('seekeatz_start_app_tutorial') !== 'true') {
      return;
    }

    startTransition(() => {
      setIsTutorialActive(true);
      setTutorialStepIndex(0);
    });
  }, [appState, currentUserId, isMounted]);

  useEffect(() => {
    if (!isMounted || appState !== 'app' || !entitlementResolved || !currentUserId) {
      return;
    }

    if (shouldShowWaitlistTrialEndedPopup(currentUserId, entitlement)) {
      startTransition(() => {
        setShowWaitlistTrialEndedModal(true);
      });
    }
  }, [appState, currentUserId, entitlement, entitlementResolved, isMounted]);

  const handleWaitlistTrialEndedDismiss = useCallback(() => {
    if (currentUserId) {
      markWaitlistTrialEndedPopupSeen(currentUserId);
    }
    setShowWaitlistTrialEndedModal(false);
  }, [currentUserId]);

  useEffect(() => {
    if (!isTutorialActive) return;

    const nextStep = APP_TUTORIAL_STEPS[tutorialStepIndex];
    if (!nextStep) return;

    startTransition(() => {
      setCurrentView('main');
      setSelectedMeal(null);
    });

    if (currentScreen !== nextStep.screen) {
      startTransition(() => {
        setCurrentScreen(nextStep.screen);
        setNavHistory([nextStep.screen]);
      });

      if (typeof window !== 'undefined') {
        localStorage.setItem('seekeatz_current_screen', nextStep.screen);
        localStorage.setItem('seekeatz_nav_history', JSON.stringify([nextStep.screen]));
      }
    }
  }, [currentScreen, isTutorialActive, tutorialStepIndex]);

  useEffect(() => {
    if (!isMounted || !hasHydratedCurrentUser || typeof window === 'undefined') return;

    const parseFavoriteIds = (raw: string | null): string[] => {
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error('Failed to parse favoriteMeals:', e);
        return [];
      }
    };

    const parseFavoriteData = (raw: string | null): Record<string, Meal> => {
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, Meal> : {};
      } catch (e) {
        console.error('Failed to parse favoriteMealsData:', e);
        return {};
      }
    };

    if (!currentUserId) {
      startTransition(() => {
        setFavoriteMeals([]);
        setFavoriteMealsData({});
      });
      return;
    }

    const scopedFavorites = localStorage.getItem(favoriteMealsStorageKey);
    const scopedFavoriteData = localStorage.getItem(favoriteMealsDataStorageKey);

    startTransition(() => {
      setFavoriteMeals(parseFavoriteIds(scopedFavorites));
      setFavoriteMealsData(parseFavoriteData(scopedFavoriteData));
    });
  }, [favoriteMealsDataStorageKey, favoriteMealsStorageKey, hasHydratedCurrentUser, currentUserId, isMounted]);

  useEffect(() => {
    if (!isMounted || !isTutorialActive || typeof window === 'undefined') return;

    startTransition(() => {
      setFavoriteMeals([]);
      setFavoriteMealsData({});
    });

    localStorage.removeItem(favoriteMealsStorageKey);
    localStorage.removeItem(favoriteMealsDataStorageKey);

    if (!currentUserId) {
      localStorage.removeItem('seekeatz_favorite_meals');
      localStorage.removeItem('seekeatz_favorite_meals_data');
    }
  }, [
    favoriteMealsDataStorageKey,
    favoriteMealsStorageKey,
    currentUserId,
    isMounted,
    isTutorialActive,
  ]);

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined' || !isRestrictedAccount) return;

    startTransition(() => {
      setFavoriteMeals([]);
      setFavoriteMealsData({});
    });

    localStorage.removeItem(favoriteMealsStorageKey);
    localStorage.removeItem(favoriteMealsDataStorageKey);
    localStorage.removeItem('seekeatz_favorite_meals');
    localStorage.removeItem('seekeatz_favorite_meals_data');
    localStorage.removeItem('seekeatz_favorite_meals:guest');
    localStorage.removeItem('seekeatz_favorite_meals_data:guest');
  }, [favoriteMealsDataStorageKey, favoriteMealsStorageKey, isMounted, isRestrictedAccount]);

  // Load persisted local state after hydration and whenever account scope changes.
  useEffect(() => {
    if (!isMounted || !hasHydratedCurrentUser) return;

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
            startTransition(() => {
              setNavHistory(filteredHistory);
              setCurrentScreen(filteredHistory[filteredHistory.length - 1]);
            });
          }
        }
      } else {
        // Fallback to saved screen if no history
        const saved = localStorage.getItem('seekeatz_current_screen');
        if (saved && ['home', 'log', 'chat', 'favorites', 'settings'].includes(saved)) {
          startTransition(() => {
            setCurrentScreen(saved as Screen);
          });
        }
      }
    } catch (e) {
      console.error('Failed to parse navigation state:', e);
    }

    // Load user profile
    try {
      const saved = localStorage.getItem('userProfile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) {
          startTransition(() => {
            setUserProfile(parsed);
          });
        }
      }
    } catch (e) {
      console.error('Failed to parse userProfile:', e);
    }

    // Load logged meals and reset today's meals if it's a new day
    try {
      migrateLegacyLoggedMealsStorage(currentUserId ?? null);

      const saved = localStorage.getItem(loggedMealsStorageKey);
      const todayStr = new Date().toISOString().split('T')[0];
      const lastResetDate = localStorage.getItem(lastResetDateStorageKey);

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
            startTransition(() => {
              applyLoggedMeals(filteredMeals);
            });
            // Update last reset date to today
            localStorage.setItem(lastResetDateStorageKey, todayStr);
          } else {
            // Same day or first time - keep all meals including today's
            startTransition(() => {
              applyLoggedMeals(parsed);
            });
            // Set last reset date if not set
            if (!lastResetDate) {
              localStorage.setItem(lastResetDateStorageKey, todayStr);
            }
          }
        }
      } else {
        // No saved meals - set last reset date to today
        localStorage.setItem(lastResetDateStorageKey, todayStr);
      }
    } catch (e) {
      console.error('Failed to parse loggedMeals:', e);
    }
  }, [
    applyLoggedMeals,
    currentUserId,
    hasHydratedCurrentUser,
    isMounted,
    lastResetDateStorageKey,
    loggedMealsStorageKey,
  ]);

  // Initialize app state: Check localStorage for 'onboarded' and Supabase session
  useEffect(() => {
    if (!isMounted) return;

    const initializeApp = async () => {
      let isOnboarded = false;
      try {
      // Check localStorage for onboarding completion
      isOnboarded = typeof window !== 'undefined'
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
        } catch (error: unknown) {
          // AuthSessionMissingError is expected when signed out - treat as no user
          if (
            error instanceof Error &&
            (error.message.includes('Auth session missing') || error.name === 'AuthSessionMissingError')
          ) {
            // This is expected for signed-out users - break and continue with user = null
            break;
          }
          console.warn("Unexpected auth error in MainApp:", error);
        }
        retries++;
      }

      // Fallback: getUser() makes a network call that can fail transiently when
      // iOS reloads the WebView on resume. Never sign out a user who still has a
      // valid persisted session — trust the locally stored session in that case.
      if (!user) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            user = session.user;
          }
        } catch (sessionError) {
          console.warn("getSession fallback failed in MainApp:", sessionError);
        }
      }

      // Signed-in users should never repeat onboarding slides in the app shell.
      if (user) {
        setCurrentUserId(user.id);
        setCurrentUserEmail(user.email);

        if (typeof window !== 'undefined') {
          localStorage.setItem(`seekEatz_hasCompletedOnboarding_${user.id}`, "true");
          localStorage.setItem("hasCompletedOnboarding", "true");
          localStorage.setItem("onboarded", "true");
        }

        setAppState('app');
        return;
      }

      setCurrentUserId(undefined);
      setCurrentUserEmail(undefined);

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
                  const { data: { user: retryUser } } = await supabase.auth.getUser();
                  if (retryUser) {
                    setAppState('app');
                  } else {
                    setAppState('auth');
                  }
                } catch {
                  setAppState('auth');
                }
              }, 1000);
              // Keep users in auth while session propagation retries.
              return 'auth';
            }
          }
          // Onboarded but not authenticated - show auth
          return 'auth';
        } else {
          // Onboarded and authenticated - show app
          return 'app';
        }
      });
      } catch (err) {
        console.warn('initializeApp error, showing app:', err);
        setAppState(isOnboarded ? 'auth' : 'onboarding');
      }
    };

    initializeApp();
  }, [supabase, isMounted]);

  // Safety: if still loading after 5s (e.g. getUser/profile hung), force a visible state
  useEffect(() => {
    if (!isMounted || appState !== 'loading') return;
    const t = setTimeout(() => {
      setAppState((s) => {
        if (s !== 'loading') return s;
        const isOnboarded = typeof window !== 'undefined'
          ? localStorage.getItem('onboarded') === 'true' ||
            localStorage.getItem('hasCompletedOnboarding') === 'true'
          : false;
        return isOnboarded ? 'auth' : 'onboarding';
      });
    }, 5000);
    return () => clearTimeout(t);
  }, [isMounted, appState]);

  // Set up auth state change listener - this is the primary way we react to sign-in
  useEffect(() => {
    if (!isClient) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);

      if (event === 'SIGNED_IN' && session?.user) {
        syncActiveUserCache(session.user.id);
        setCurrentUserId(session.user.id);
        setCurrentUserEmail(session.user.email);
        const isMasterSession = isFullAccessEmail(session.user.email);
        if (isMasterSession) {
          setDevFullAccess(true);
          setDevFullAccessState(true);
        }
        try {
          const completedOnboarding =
            typeof window !== 'undefined' &&
            (localStorage.getItem('hasCompletedOnboarding') === 'true' ||
              localStorage.getItem('onboarded') === 'true');
          await bootstrapAccount({ hasCompletedOnboarding: completedOnboarding });
        } catch (bootstrapError) {
          console.warn('MainApp bootstrap skipped after sign-in:', bootstrapError);
        }
        await refreshEntitlement();
        // User just signed in - reload profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileData) {
          setUserProfile(profileData);
        }

        if (typeof window !== 'undefined') {
          localStorage.setItem(`seekEatz_hasCompletedOnboarding_${session.user.id}`, "true");
          localStorage.setItem("hasCompletedOnboarding", "true");
          localStorage.setItem("onboarded", "true");
        }

        setAppState('app');
      } else if (event === 'SIGNED_OUT') {
        // User signed out - reset to default profile
        setCurrentUserId(undefined);
        setCurrentUserEmail(undefined);
        setDevFullAccess(false);
        setDevFullAccessState(false);
        clearCachedEntitlement();
        setUserProfile({
          target_calories: 2000,
          target_protein_g: 150,
          target_carbs_g: 200,
          target_fats_g: 70,
          search_distance_miles: 15,
        });
        // Check if onboarded as guest
        const isOnboarded = typeof window !== 'undefined'
          ? localStorage.getItem('onboarded') === 'true' ||
          localStorage.getItem('hasCompletedOnboarding') === 'true'
          : false;
        setAppState(isOnboarded ? 'auth' : 'onboarding');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, isClient, refreshEntitlement]);

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

  // ========== ALL HOOKS END HERE - NOW HANDLERS AND CONDITIONAL RENDERS ==========

  // Handle onboarding completion
  const handleOnboardingComplete = async () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('onboarded', 'true');
      localStorage.setItem('hasCompletedOnboarding', 'true');
    }

    let shouldBypassUpgrade = hasFullAccess || isMasterAccount;
    if (!shouldBypassUpgrade) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        shouldBypassUpgrade = isFullAccessEmail(user?.email);
      } catch {
        shouldBypassUpgrade = false;
      }
    }

    if (shouldBypassUpgrade && typeof window !== 'undefined') {
      localStorage.setItem('seekeatz_start_app_tutorial', 'true');
      localStorage.removeItem(tutorialCompletionKey);
    }

    setAppState(shouldBypassUpgrade ? 'app' : 'auth');
    setCurrentScreen('home');
    setNavHistory(['home']);

    if (shouldBypassUpgrade) {
      router.push('/chat');
      return;
    }

    router.push('/upgrade?flow=onboarding&tutorial=1');
  };

  // Handle auth success (fallback, but onAuthStateChange should handle it)
  const handleTutorialNext = () => {
    if (tutorialStepIndex >= APP_TUTORIAL_STEPS.length - 1) {
      setIsTutorialActive(false);
      setTutorialStepIndex(0);

      if (typeof window !== 'undefined') {
        localStorage.setItem(tutorialCompletionKey, 'true');
        localStorage.removeItem('seekeatz_start_app_tutorial');
        localStorage.setItem('seekeatz_current_screen', 'settings');
        localStorage.setItem('seekeatz_nav_history', JSON.stringify(['settings']));
      }

      setCurrentScreen('settings');
      setNavHistory(['settings']);
      return;
    }

    setTutorialStepIndex((prev) => prev + 1);
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

  const renderedAppState: AppState = appState;

  // Show loading state
  if (renderedAppState === 'loading') {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="text-cyan-400 text-lg">Loading...</div>
      </div>
    );
  }

  // Show onboarding
  if (renderedAppState === 'onboarding') {
    return (
      <div className="min-h-screen bg-background">
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </div>
    );
  }

  // Unauthenticated: a redirect to /auth/signin is triggered by the effect
  // above. Render a loading placeholder while navigation happens.
  if (renderedAppState === 'auth') {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="text-cyan-400 text-lg">Loading...</div>
      </div>
    );
  }

  // If we reach here, appState is 'app' - render the main app UI
  const handleNavigate = (screen: Screen) => {
    // Update activity on navigation
    updateActivity();
    setPostLogChoice(null);

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
    if (currentUserId && !hasFullAccess) {
      setShowUpgradeModal(true);
      return;
    }

    updateActivity(); // Update activity on favorite toggle
    setFavoriteMeals((prev) => {
      const isCurrentlyFavorite = prev.includes(mealId);
      const updated = isCurrentlyFavorite
        ? prev.filter((id) => id !== mealId)
        : [...prev, mealId];
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(favoriteMealsStorageKey, JSON.stringify(updated));

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
            localStorage.setItem(favoriteMealsDataStorageKey, JSON.stringify(updatedData));
            return updatedData;
          });
        }
      }
      return updated;
    });
  };

  const handleLogMeal = (meal: Meal) => {
    if (currentUserId && !hasFullAccess) {
      setShowUpgradeModal(true);
      return;
    }

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
    applyLoggedMeals([...loggedMeals, loggedMeal]);

    if (currentUserId) {
      void recordFunnelEvent({
        supabase,
        userId: currentUserId,
        eventType: 'first_meal_logged',
        metadata: {
          meal_id: meal.id,
          meal_name: meal.name,
          restaurant: meal.restaurant ?? meal.restaurant_name,
          calories: meal.calories,
        },
      });
    }

    const returnScreen: 'home' | 'chat' = currentScreen === 'chat' ? 'chat' : 'home';
    setPostLogChoice({
      mealName: meal.name,
      returnScreen,
    });
  };

  const handleGoToLogAfterLog = () => {
    setPostLogChoice(null);
    handleNavigate('log');
  };

  const handleReturnAfterLog = () => {
    const destination = postLogChoice?.returnScreen ?? 'home';
    setPostLogChoice(null);
    handleNavigate(destination);
  };

  const renderPostLogChoiceSheet = () => {
    if (!postLogChoice) {
      return null;
    }

    return (
      <div
        className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/65 backdrop-blur-sm"
        onClick={() => setPostLogChoice(null)}
      >
        <div
          className="w-full max-w-md rounded-t-[2rem] border border-border bg-card p-6 pb-8 text-card-foreground shadow-2xl animate-in slide-in-from-bottom duration-300 ease-out"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-emerald-500">
            Meal Logged
          </p>
          <h2 className="mt-2 text-center text-2xl font-semibold leading-tight">
            Added to your daily tracker.
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            {postLogChoice.mealName}
          </p>
          <div className="mt-6 grid grid-cols-1 gap-3">
            <button
              type="button"
              onClick={handleGoToLogAfterLog}
              className="w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-cyan-500/25"
            >
              Go to log
            </button>
            <button
              type="button"
              onClick={handleReturnAfterLog}
              className="w-full rounded-full border border-border bg-background px-5 py-4 text-base font-semibold text-foreground"
            >
              Back to search
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleRemoveMeal = (id: string) => {
    applyLoggedMeals(loggedMeals.filter((meal) => meal.id !== id));
  };

  const handleUpdateLoggedMeal = (logId: string, meal: Meal) => {
    applyLoggedMeals(
      loggedMeals.map((log) => (log.id === logId ? { ...log, meal } : log))
    );
  };

  const handleUpdateProfile = (updates: Partial<UserProfile>) => {
    const nextProfile = { ...userProfile, ...updates };
    setUserProfile(nextProfile);

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('userProfile', JSON.stringify(nextProfile));
      } catch (e) {
        console.error('Failed to save userProfile:', e);
      }
    }

    void refreshTargets(currentUserId);
  };

  // Show meal detail if a meal is selected
  if (currentView === 'meal-detail' && selectedMeal) {
    return (
      <div className="flex h-[100dvh] flex-col bg-background">
        <MealDetail
          meal={selectedMeal}
          isFavorite={favoriteMeals.includes(selectedMeal.id)}
          onToggleFavorite={() => handleToggleFavorite(selectedMeal.id, selectedMeal)}
          onBack={handleBack}
          onLogMeal={handleLogMeal}
          isPremium={hasFullAccess}
          onPremiumFeatureAttempt={() => setShowUpgradeModal(true)}
        />
        {renderPostLogChoiceSheet()}
      </div>
    );
  }

  // Show search screen (full screen, no navigation)
  if (currentScreen === 'search') {
    return (
      <div className="flex h-[100dvh] flex-col bg-background">
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
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
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
            onUsageLimitReached={() => setShowUpgradeModal(true)}
            isPremium={hasFullAccess}
          />
        )}
        {currentView === 'meal-detail' && selectedMeal && (
          <MealDetail
            meal={selectedMeal}
            isFavorite={favoriteMeals.includes(selectedMeal.id)}
            onToggleFavorite={() => handleToggleFavorite(selectedMeal.id, selectedMeal)}
            onBack={() => setCurrentView('main')}
            onLogMeal={handleLogMeal}
            userProfile={userProfile}
            loggedMeals={loggedMeals}
            isPremium={hasFullAccess}
            onPremiumFeatureAttempt={() => setShowUpgradeModal(true)}
          />
        )}
        {currentScreen === 'log' && (
          <LogScreen
            userProfile={userProfile}
            loggedMeals={loggedMeals}
            onRemoveMeal={handleRemoveMeal}
            onAddMeal={handleLogMeal}
            onUpdateMeal={handleUpdateLoggedMeal}
            isReadOnly={!!currentUserId && !hasFullAccess}
            onLockedAction={() => setShowUpgradeModal(true)}
          />
        )}
        {currentScreen === 'chat' && (
          <AIChat
            userId={currentUserId}
            userProfile={userProfile}
            onMealSelect={handleMealSelect}
            favoriteMeals={favoriteMeals}
            onToggleFavorite={(mealId, meal) => handleToggleFavorite(mealId, meal)}
            onUsageLimitReached={() => setShowUpgradeModal(true)}
            onSignInRequest={() => router.push('/auth/signin')}
            isPremium={hasFullAccess}
          />
        )}
        {currentScreen === 'favorites' && (
          <Favorites
            favoriteMeals={favoriteMeals}
            favoriteMealsData={favoriteMealsData}
            loggedMeals={loggedMeals}
            userProfile={userProfile}
            onMealSelect={handleMealSelect}
            onLogMeal={handleLogMeal}
            onToggleFavorite={(mealId, meal) => handleToggleFavorite(mealId, meal)}
            isReadOnly={!!currentUserId && !hasFullAccess}
            onLockedAction={() => setShowUpgradeModal(true)}
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
        lockedScreens={{
          log: isRestrictedAccount,
          favorites: isRestrictedAccount,
        }}
      />

      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        subtitle="Premium is where SeekEatz becomes your decision system: unlimited searches, AI swaps, meal logging, and saved meals."
      />
      <WaitlistTrialEndedModal
        open={showWaitlistTrialEndedModal}
        onDismiss={handleWaitlistTrialEndedDismiss}
      />
      {renderPostLogChoiceSheet()}
      {isTutorialActive ? (
        <AppTutorialOverlay
          step={APP_TUTORIAL_STEPS[tutorialStepIndex]}
          stepIndex={tutorialStepIndex}
          totalSteps={APP_TUTORIAL_STEPS.length}
          onNext={handleTutorialNext}
        />
      ) : null}
    </div>
  );
}
