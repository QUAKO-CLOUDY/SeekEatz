'use client';

import { Send, AlertCircle, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { MealCard } from "./MealCard";
import type { Meal, UserProfile, NearbyCacheResponse } from "../types";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { createClient } from "@/utils/supabase/client";
import { useTheme } from "../contexts/ThemeContext";
import { useChat } from "../contexts/ChatContext";
import { getGuestSessionId, getGuestChatMessages, saveGuestChatMessages, touchGuestActivity, clearGuestSession } from "@/lib/guest-session";
import { getRestaurantLogoUrl } from "@/lib/image-utils";
import { getStoredLocation, ensureSearchLocation, resetPendingLocationRequest } from "@/lib/location";
import {
  buildNearbySearchRequestFields,
  persistNearbyCacheFromResponse,
} from "@/lib/nearby-search-client";
import { markInflightLoading, registerAppRequestReset } from "@/lib/app-suspend-recovery";
import { extractMacroConstraintsFromText } from "@/lib/extractMacroConstraintsFromText";
import { UpgradeModal } from "./UpgradeModal";
import {
  diversifyMealsByRestaurant,
  type RestaurantDiversityHistory,
} from "@/lib/restaurant-diversity";
import { SearchRadiusSelect } from "./SearchRadiusSelect";
import { CHAT_PERSISTENCE_ENABLED } from "@/lib/chat-persistence";

interface AIChatProps {
  userId?: string;
  userProfile?: UserProfile;
  favoriteMeals?: string[];
  onMealSelect?: (meal: Meal) => void;
  onToggleFavorite?: (mealId: string, meal?: Meal) => void;
  onSignInRequest?: () => void;
  onUsageLimitReached?: () => void;
  isPremium?: boolean;
}

type PaginationFilters = Record<string, unknown>;

type MealSearchContext = {
  searchKey: string;
  nextOffset: number;
  hasMore: boolean;
  originalQuery?: string;
  filters?: PaginationFilters;
};

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meals?: Meal[]; // Parsed meals from <MEAL_CARDS>
  mealSearchContext?: MealSearchContext;
  isGateMessage?: boolean; // Flag for gate messages that need buttons
}

type QuickPromptSearchContext = NonNullable<ChatMessage['mealSearchContext']>;

type SearchResultItem = {
  id: string;
  item_name?: string;
  name?: string;
  restaurant_name?: string;
  restaurant?: string;
  calories?: number | null;
  protein?: number | null;
  protein_g?: number | null;
  carbs?: number | null;
  carbs_g?: number | null;
  fats?: number | null;
  fats_g?: number | null;
  fat_g?: number | null;
  image?: string;
  restaurantLogoUrl?: string;
  restaurant_logo_url?: string;
  logo_url?: string;
  description?: string | null;
  category?: string;
  dietary_tags?: string[] | null;
  price?: number | null;
  distance?: number;
  latitude?: number;
  longitude?: number;
};

type SearchApiResponse = {
  mode?: "meals" | "text";
  type?: "text";
  meals?: SearchResultItem[];
  hasMore?: boolean;
  nextOffset?: number;
  searchKey?: string;
  summary?: string;
  message?: string;
  nearbyCache?: NearbyCacheResponse;
  debugInfo?: unknown;
  error?: boolean | string;
  answer?: string;
};

type AuthUserResponse = Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["getUser"]>>;
type AuthTimeoutResponse = AuthUserResponse | { data: { user: null }; error: null };

interface ActiveQuickPromptState {
  promptText: string;
  startIndex: number;
  context?: QuickPromptSearchContext;
}

const CHAT_MEALS_PAGE_SIZE = 5;
const CHAT_MEALS_REDUCED_PAGE_SIZE = 2;
const CHAT_MEALS_REDUCED_PAGE_START_CLICK = 5; // 5th click and onward
const APPENDED_MEALS_DIVIDER_LABEL = "More meals";
const ROUTER_HISTORY_LIMIT = 8;
const DEFAULT_DISTANCE_MILES = 15;
const CHAT_DISTANCE_OVERRIDE_KEY = 'seekeatz_chat_distance_override';

function getChatGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

function getTimeOfDayBucket(hour: number): "morning" | "afternoon" | "evening" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

function getFirstName(fullName?: string | null): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0]?.trim();
  return first || null;
}

function buildWelcomeMessage(userProfile?: { full_name?: string } | null): string {
  const firstName = getFirstName(userProfile?.full_name);
  const intro = firstName
    ? `${getChatGreeting()}, ${firstName}.`
    : "Welcome to SeekEatz!";
  const promptOptions = [
    "What are you looking for today?",
    "What do you have in mind?",
    "What sounds good right now?",
    "Tell me what you're craving.",
  ];
  const rotationSeed = `${new Date().toISOString().slice(0, 10)}:${firstName ?? "guest"}`;
  const promptIndex = Array.from(rotationSeed).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0
  ) % promptOptions.length;

  return `${intro} ${promptOptions[promptIndex]}`;
}

function buildInputPlaceholder(now: Date = new Date()): string {
  const hour = now.getHours();
  const bucket = getTimeOfDayBucket(hour);
  const optionsByBucket: Record<"morning" | "afternoon" | "evening", string[]> = {
    morning: [
      "High protein breakfast under 500 calories",
      "Healthy coffee shop breakfast",
      "Low carb breakfast near me",
      "Breakfast with at least 30g protein",
    ],
    afternoon: [
      "High protein lunch under 700 calories",
      "Healthy lunch near me",
      "Low carb lunch from Chipotle",
      "Lunch with at least 40g protein",
    ],
    evening: [
      "High protein dinner under 800 calories",
      "Healthy dinner near me",
      "Low calorie takeout for tonight",
      "Dinner with at least 45g protein",
    ],
  };
  const options = optionsByBucket[bucket];
  const rotationSeed = `${now.toISOString().slice(0, 13)}:${bucket}`;
  const promptIndex = Array.from(rotationSeed).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0
  ) % options.length;

  return options[promptIndex];
}

function mapSearchItemToMeal(item: SearchResultItem): Meal {
  const mealName = item.item_name || item.name || "";
  const restaurantName = item.restaurant_name || item.restaurant || "";

  return {
    id: String(item.id ?? ""),
    name: mealName,
    restaurant: restaurantName,
    restaurant_name: item.restaurant_name || restaurantName,
    calories: item.calories ?? 0,
    protein: item.protein ?? item.protein_g ?? 0,
    carbs: item.carbs ?? item.carbs_g ?? 0,
    fats: item.fats ?? item.fats_g ?? item.fat_g ?? 0,
    image: getRestaurantLogoUrl(
      restaurantName,
      item.restaurantLogoUrl || item.restaurant_logo_url || item.logo_url
    ),
    restaurantLogoUrl: getRestaurantLogoUrl(
      restaurantName,
      item.restaurantLogoUrl || item.restaurant_logo_url || item.logo_url
    ),
    description: item.description || '',
    category: item.category === 'restaurant' || item.category === 'grocery'
      ? item.category
      : undefined,
    dietary_tags: item.dietary_tags || [],
    price: item.price ?? undefined,
    distance: item.distance,
    latitude: item.latitude,
    longitude: item.longitude,
  };
}

function deduplicateMealsById(meals: Meal[]): Meal[] {
  const seen = new Set<string>();
  return meals.filter((meal) => {
    if (seen.has(meal.id)) {
      return false;
    }
    seen.add(meal.id);
    return true;
  });
}

function buildMealHistory(
  messages: ChatMessage[],
  excludeMessageId?: string
): RestaurantDiversityHistory {
  const seenMealIds = new Set<string>();
  const restaurantExposure = new Map<string, number>();

  for (const message of messages) {
    if (message.id === excludeMessageId || !message.meals?.length) {
      continue;
    }

    for (const meal of message.meals) {
      seenMealIds.add(meal.id);
      const restaurantKey = (meal.restaurant_name || meal.restaurant || 'unknown')
        .trim()
        .toLowerCase();
      restaurantExposure.set(
        restaurantKey,
        (restaurantExposure.get(restaurantKey) ?? 0) + 1
      );
    }
  }

  return { seenMealIds, restaurantExposure };
}

function toRestaurantCycleKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

export default function AIChat({ userId, userProfile, favoriteMeals, onMealSelect, onToggleFavorite, onSignInRequest, onUsageLimitReached, isPremium = false }: AIChatProps) {
  void onSignInRequest;
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { messages, visibleMealsCount, isLoading, setMessages, setVisibleMealsCount, setIsLoading, clearChat, updateActivity } = useChat();
  // Check if user is signed in (userId prop or check session)
  const [isSignedIn, setIsSignedIn] = useState(!!userId);
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const welcomeMessage = useMemo(
    () => buildWelcomeMessage(userProfile),
    [userProfile]
  );
  const chatPlaceholder = useMemo(
    () => buildInputPlaceholder(new Date(new Date().setHours(currentHour))),
    [currentHour]
  );
  const [distanceOverride, setDistanceOverride] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(CHAT_DISTANCE_OVERRIDE_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse chat distance override:', e);
        }
      }
    }
    return null;
  });
  const activeDistance = distanceOverride ?? userProfile?.search_distance_miles ?? DEFAULT_DISTANCE_MILES;

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const openUpgradeModal = useCallback(() => {
    if (isPremium) {
      return;
    }
    if (onUsageLimitReached) {
      onUsageLimitReached();
      return;
    }
    setShowUpgradeModal(true);
  }, [isPremium, onUsageLimitReached]);
  const activeQuickPromptRef = useRef<ActiveQuickPromptState | null>(null);
  const quickPromptSeenRestaurantsRef = useRef<Map<string, Set<string>>>(new Map());

  // Current session ID (stable per tab)
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return getGuestSessionId();
  });

  // Update isSignedIn when userId prop changes
  useEffect(() => {
    setIsSignedIn(!!userId);
  }, [userId]);

  useEffect(() => {
    if (isSignedIn) {
      setShowUpgradeModal(false);
      return;
    }

    if (typeof window !== 'undefined' && localStorage.getItem('seekeatz_force_upgrade_modal') === 'true') {
      localStorage.removeItem('seekeatz_force_upgrade_modal');
      setShowUpgradeModal(true);
    }
  }, [isSignedIn]);

  useEffect(() => {
    // Network change detection: reset stuck loading state when going online/offline
    const handleOnline = () => {
      console.log('[AIChat] Network came online - resetting loading state');
      setIsLoading(false);
      if (abortControllerRef.current) {
        try { abortControllerRef.current.abort(); } catch { /* ignore */ }
        abortControllerRef.current = null;
      }
    };
    const handleOffline = () => {
      console.log('[AIChat] Network went offline - resetting loading state');
      setIsLoading(false);
      if (abortControllerRef.current) {
        try { abortControllerRef.current.abort(); } catch { /* ignore */ }
        abortControllerRef.current = null;
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkAuth = async () => {
      try {
        const supabase = createClient();
        // Retry logic for auth check - capped at 2 retries, 100ms delay, with per-call timeout
        const withAuthTimeout = (promise: Promise<AuthUserResponse>, ms: number): Promise<AuthTimeoutResponse> =>
          Promise.race([
            promise,
            new Promise<{ data: { user: null }; error: null }>((resolve) =>
              setTimeout(() => resolve({ data: { user: null }, error: null }), ms)
            ),
          ]);

        let retries = 0;
        let user = null;

        while (retries < 2 && !user) {
          const { data: { user: fetchedUser }, error } = await withAuthTimeout(supabase.auth.getUser(), 3000);
          if (error && (error.message?.includes('Auth session missing') || error.name === 'AuthSessionMissingError')) {
            setIsSignedIn(false);
            break;
          } else if (fetchedUser) {
            user = fetchedUser;
            setIsSignedIn(true);
            setMessages(prev => prev.filter(msg => !msg.isGateMessage));
            break;
          }

          if (!fetchedUser && retries < 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          retries++;
        }

        if (!user) {
          setIsSignedIn(false);
        }
      } catch {
        setIsSignedIn(false);
      }
    };
    checkAuth();

    // Listen for auth changes
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const isAuthenticated = !!session?.user;
      setIsSignedIn(isAuthenticated);

      if (event === 'SIGNED_IN' && session?.user) {
        // User signed in - immediately clear guest restrictions
        // Remove gate messages immediately
        setMessages(prev => prev.filter(msg => !msg.isGateMessage));

        // Claim the current session (define inline to avoid dependency issues)
        const sessionId = currentSessionId;
        if (CHAT_PERSISTENCE_ENABLED && sessionId) {
          try {
            const supabaseClient = createClient();
            await supabaseClient
              .from('chat_sessions')
              .upsert({
                session_id: sessionId,
                user_id: session.user.id,
              }, {
                onConflict: 'session_id',
              });
          } catch (error) {
            console.error('Error claiming chat session on sign in:', error);
          }
        }
      }

      if (event === 'SIGNED_OUT') {
        // On sign out: clear chat and rotate session ID (but NOT trial count)
        clearChat();
        clearGuestSession();
        setCurrentSessionId(getGuestSessionId());
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [clearChat, currentSessionId, setMessages, setIsLoading]);
  // Local state - chat state is managed by ChatContext
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [loadMoreDividerBreakpoints, setLoadMoreDividerBreakpoints] = useState<Record<string, number[]>>({});
  const [loadMoreClickCounts, setLoadMoreClickCounts] = useState<Record<string, number>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadingStartedAtRef = useRef<number | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const resetChatRequestState = useCallback((reason: string) => {
    console.log(`[AIChat] resetChatRequestState (${reason})`);
    resetPendingLocationRequest();
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {
        // ignore
      }
      abortControllerRef.current = null;
    }
    loadingStartedAtRef.current = null;
    setIsLoading(false);
  }, [setIsLoading]);

  // Safety: Reset isLoading on mount in case a previous in-flight request
  // was killed by a browser refresh (the finally block never ran).
  useEffect(() => {
    resetPendingLocationRequest();
    setIsLoading(false);
    // Also abort any lingering request (ref is reset on remount)
    abortControllerRef.current = null;
    loadingStartedAtRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Central suspend/resume recovery (visibility, heartbeat, native events).
  useEffect(() => {
    return registerAppRequestReset(resetChatRequestState);
  }, [resetChatRequestState]);

  // Watchdog: if loading exceeds the request timeout, force-reset even without
  // visibility events (common in native WebView shells).
  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const loadingAge = loadingStartedAtRef.current
        ? Date.now() - loadingStartedAtRef.current
        : 0;
      if (loadingAge >= 46000) {
        setError('Request timed out. Please try again.');
        resetChatRequestState('loading-watchdog');
      }
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isLoading, resetChatRequestState]);

  // User location state (for nearby meal filtering)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(() => {
    const stored = getStoredLocation();
    return stored
      ? { latitude: stored.latitude, longitude: stored.longitude }
      : null;
  });


  // Helper to record chat activity timestamps (alias for touchGuestActivity)
  const recordActivity = useCallback(() => {
    touchGuestActivity();
    updateActivity(); // Also update context activity
  }, [updateActivity]);


  // Track if Supabase chat persistence is available (avoid repeated RLS errors)
  const supabaseChatAvailable = useRef(CHAT_PERSISTENCE_ENABLED);

  // Ensure chat session is owned by authenticated user
  const ensureChatSessionOwned = useCallback(async (userId: string, sessionId: string) => {
    if (!sessionId || !supabaseChatAvailable.current) return;

    try {
      const supabase = createClient();

      // Upsert chat_sessions to claim the session
      const { error: sessionError } = await supabase
        .from('chat_sessions')
        .upsert({
          session_id: sessionId,
          user_id: userId,
        }, {
          onConflict: 'session_id',
        });

      if (sessionError) {
        // RLS policy likely missing - disable Supabase chat persistence to avoid repeated errors
        console.warn('Chat session persistence unavailable (RLS policy may be missing). Chat will work without server persistence.');
        supabaseChatAvailable.current = false;
        return;
      }

      // Migrate guest messages from sessionStorage to Supabase
      const guestMessages = getGuestChatMessages();
      if (guestMessages.length > 0) {
        const messagesToInsert = guestMessages
          .filter(msg => !msg.isGateMessage) // Don't migrate gate messages
          .map(msg => ({
            session_id: sessionId,
            role: msg.role,
            content: msg.content,
            meal_data: msg.meals ? JSON.parse(JSON.stringify(msg.meals)) : null,
            meal_search_context: msg.mealSearchContext ? JSON.parse(JSON.stringify(msg.mealSearchContext)) : null,
          }));

        if (messagesToInsert.length > 0) {
          const { error: messagesError } = await supabase
            .from('messages')
            .insert(messagesToInsert);

          if (messagesError) {
            console.warn('Guest message migration skipped (RLS policy may be missing).');
          } else {
            // Clear guest messages from sessionStorage after successful migration
            saveGuestChatMessages([]);
          }
        }
      }
    } catch (error) {
      console.warn('Chat session persistence unavailable:', error);
      supabaseChatAvailable.current = false;
    }
  }, []);

  // Load messages from Supabase for authenticated users (optional; off by default)
  useEffect(() => {
    if (!CHAT_PERSISTENCE_ENABLED) return;

    const loadMessagesFromSupabase = async () => {
      if (!isSignedIn || !userId || !currentSessionId) return;

      try {
        // First ensure the session is owned
        await ensureChatSessionOwned(userId, currentSessionId);

        const supabase = createClient();

        // Load messages from the session
        const { data: messagesData, error: messagesError } = await supabase
          .from('messages')
          .select('*')
          .eq('session_id', currentSessionId)
          .order('created_at', { ascending: true });

        if (messagesError) {
          console.error('Failed to load messages from Supabase:', messagesError);
          return;
        }

        if (messagesData && messagesData.length > 0) {
          // Convert Supabase messages to ChatMessage format
          const loadedMessages: ChatMessage[] = messagesData.map(msg => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            meals: msg.meal_data ? (Array.isArray(msg.meal_data) ? msg.meal_data : []) : undefined,
            mealSearchContext: msg.meal_search_context || undefined,
            isGateMessage: false
          }));

          setMessages(loadedMessages);
        }
      } catch (error) {
        console.error('Error loading messages from Supabase:', error);
      }
    };

    if (isSignedIn && userId && currentSessionId) {
      loadMessagesFromSupabase();
    }
  }, [isSignedIn, userId, currentSessionId, ensureChatSessionOwned, setMessages]);

  // Trial limits have been removed - always allow chat usage and clear any legacy gate messages.
  useEffect(() => {
    setMessages(prev => prev.filter(msg => !msg.isGateMessage));
  }, [setMessages]);

  // Log to Supabase (only for authenticated users)
  const logChatMessage = useCallback(
    async (
      role: 'user' | 'assistant',
      content: string,
      meals?: Meal[],
      mealSearchContext?: MealSearchContext
    ) => {
      if (!CHAT_PERSISTENCE_ENABLED) return;
      if (!isSignedIn || !userId || !currentSessionId || !supabaseChatAvailable.current) return;

      try {
        // Ensure session is owned
        await ensureChatSessionOwned(userId, currentSessionId);
        if (!supabaseChatAvailable.current) return; // May have been disabled by ensureChatSessionOwned

        const supabase = createClient();
        const { error } = await supabase
          .from('messages')
          .insert({
            session_id: currentSessionId,
            role,
            content,
            meal_data: meals ? JSON.parse(JSON.stringify(meals)) : null,
            meal_search_context: mealSearchContext ? JSON.parse(JSON.stringify(mealSearchContext)) : null,
          });

        if (error) {
          console.warn('Chat message logging skipped (RLS policy may be missing).');
        } else {
          // Update chat_sessions updated_at timestamp
          await supabase
            .from('chat_sessions')
            .update({ updated_at: new Date().toISOString() })
            .eq('session_id', currentSessionId);
        }
      } catch (e) {
        console.warn('Chat message logging unavailable:', e);
      }
    },
    [isSignedIn, userId, currentSessionId, ensureChatSessionOwned]
  );

  const logUsageEvent = useCallback(async (eventType: 'chat_submit' | 'chat_response' | 'limit_hit', metadata?: Record<string, unknown>) => {
    if (!isSignedIn || !userId) return;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('usage_events')
        .insert({
          user_id: userId,
          event_type: eventType,
          metadata: metadata || null,
        });

      if (error) {
        console.error('Failed to log usage event to Supabase:', error);
      }
    } catch (e) {
      console.error('Error logging usage event:', e);
    }
  }, [isSignedIn, userId]);

  // Detect meal intent (same logic as backend)
  const isMealIntentQuery = useCallback((query: string): boolean => {
    const mealKeywords = [
      'find me', 'find', 'show me', 'show', 'give me', 'give', 'recommend', 'recommendation',
      'lunch', 'dinner', 'breakfast', 'meal', 'meals', 'options', 'option',
      'calories', 'calorie', 'cal', 'cals',
      'protein', 'carbs', 'carb', 'fat', 'fats',
      'under', 'below', 'less than', 'over', 'above', 'more than',
      'high', 'low', 'maximum', 'max', 'minimum', 'min',
      // Diet keywords removed - diet filtering disabled
    ];
    const lowerQuery = query.toLowerCase();
    return mealKeywords.some(keyword => lowerQuery.includes(keyword));
  }, []);

  const requestLocationForMealSearch = useCallback(async (shouldRequestLocation: boolean) => {
    if (!shouldRequestLocation) {
      return userLocation;
    }

    if (userLocation) {
      return userLocation;
    }

    const location = await ensureSearchLocation();
    if (!location) {
      return null;
    }

    const nextLocation = {
      latitude: location.latitude,
      longitude: location.longitude,
    };
    setUserLocation(nextLocation);
    return nextLocation;
  }, [userLocation]);

  // Auto-scroll
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Helper function to scroll to bottom with smooth behavior (for new messages)
  const scrollToBottom = useCallback((instant: boolean = false) => {
    const container = messagesContainerRef.current;
    const endRef = messagesEndRef.current;

    if (container) {
      if (instant) {
        // Instant scroll - directly set scrollTop for immediate positioning
        // This prevents showing the top before scrolling down
        // Use double requestAnimationFrame to ensure layout is complete
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (container) {
              container.scrollTop = container.scrollHeight;
            }
          });
        });
      } else if (endRef) {
        // Smooth scroll for new messages
        setTimeout(() => {
          endRef.scrollIntoView({ behavior: "smooth" });
        }, 50);
      }
    }
  }, []);

  // Track previous message count to detect new messages
  const previousMessageCountRef = useRef(0);
  const isInitialMountRef = useRef(true);

  // Scroll to bottom when new messages are added (smooth scroll)
  // Only if user was already near the bottom, or if it's a brand new chat
  useEffect(() => {
    // Skip on initial mount - let the restore scroll effect handle it
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      previousMessageCountRef.current = messages.length;
      return;
    }

    const currentMessageCount = messages.length;
    const previousMessageCount = previousMessageCountRef.current;

    // Only scroll if new messages were added
    if (currentMessageCount > previousMessageCount) {
      // Only auto-scroll if user was at bottom (they want to see new messages)
      if (isAtBottom) {
        scrollToBottom(false);
      }
    }

    previousMessageCountRef.current = currentMessageCount;
  }, [messages.length, scrollToBottom, isAtBottom]);

  // Track if we've restored scroll position to prevent restoring multiple times
  const hasRestoredScrollRef = useRef(false);

  // Scroll to last user message, then smoothly scroll to bottom
  useEffect(() => {
    if (isMounted && messages.length > 0 && !hasRestoredScrollRef.current) {
      const container = messagesContainerRef.current;
      if (container) {
        // Find the last user message
        const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');

        if (lastUserMessage) {
          // Wait for DOM to be ready, then scroll to last user message
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (container) {
                // Find the message element by data attribute
                const messageElement = container.querySelector(`[data-message-id="${lastUserMessage.id}"]`) as HTMLElement;

                if (messageElement) {
                  // Calculate scroll position to show the message
                  // Get positions relative to the container
                  const containerScrollTop = container.scrollTop;
                  const containerRect = container.getBoundingClientRect();
                  const messageRect = messageElement.getBoundingClientRect();

                  // Calculate where the message currently is relative to container's viewport
                  const messageTopRelativeToContainer = messageRect.top - containerRect.top + containerScrollTop;

                  // Scroll to show the message (center it in viewport)
                  const containerHeight = container.clientHeight;
                  const messageHeight = messageRect.height;
                  const scrollToPosition = messageTopRelativeToContainer - (containerHeight / 2) + (messageHeight / 2);

                  // Scroll to the last user message (instant)
                  container.scrollTop = Math.max(0, scrollToPosition);

                  // Then smoothly scroll to bottom after a short delay
                  setTimeout(() => {
                    scrollToBottom(false); // Use smooth scroll
                    hasRestoredScrollRef.current = true;
                  }, 300); // Small delay to let user see their last message
                } else {
                  // Message element not found, just scroll to bottom
                  scrollToBottom(false);
                  hasRestoredScrollRef.current = true;
                }
              }
            });
          });
        } else {
          // No user messages, just scroll to bottom for new chats
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scrollToBottom(false);
              hasRestoredScrollRef.current = true;
            });
          });
        }
      }
    }
  }, [isMounted, messages, scrollToBottom]);

  // Mark component as mounted
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const updatePointerMode = (event?: MediaQueryListEvent) => {
      setIsCoarsePointer(event ? event.matches : mediaQuery.matches);
    };

    updatePointerMode();
    mediaQuery.addEventListener('change', updatePointerMode);

    return () => {
      mediaQuery.removeEventListener('change', updatePointerMode);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const updateKeyboardState = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const keyboardDelta = window.innerHeight - viewportHeight;
      setIsKeyboardOpen(keyboardDelta > 140);
    };

    window.visualViewport.addEventListener('resize', updateKeyboardState);
    window.visualViewport.addEventListener('scroll', updateKeyboardState);
    updateKeyboardState();

    return () => {
      window.visualViewport?.removeEventListener('resize', updateKeyboardState);
      window.visualViewport?.removeEventListener('scroll', updateKeyboardState);
    };
  }, []);

  const isTypingMode = isKeyboardOpen || (isInputFocused && isCoarsePointer);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('seekeatz:chat-keyboard', { detail: { open: isTypingMode } })
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent('seekeatz:chat-keyboard', { detail: { open: false } })
      );
    };
  }, [isTypingMode]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const nextHour = new Date().getHours();
      setCurrentHour((prevHour) => (prevHour === nextHour ? prevHour : nextHour));
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  // Add initial welcome message when chat is first opened (no messages)
  // This will also add it after a chat reset when messages become empty
  useEffect(() => {
    if (!isMounted) return;

    // Only add initial message if there are no messages
    // If messages were loaded from sessionStorage, they won't be empty
    if (messages.length === 0) {
      const initialMessage: ChatMessage = {
        id: `assistant-initial-${Date.now()}`,
        role: 'assistant',
        content: welcomeMessage
      };
      setMessages([initialMessage]);
    }
  }, [isMounted, messages.length, setMessages, welcomeMessage]);

  useEffect(() => {
    if (!isMounted || messages.length !== 1) return;

    const [firstMessage] = messages;
    if (firstMessage.role !== 'assistant') return;
    if (!firstMessage.id.startsWith('assistant-initial-')) return;
    if (firstMessage.content === welcomeMessage) return;

    setMessages([{ ...firstMessage, content: welcomeMessage }]);
  }, [isMounted, messages, setMessages, welcomeMessage]);

  useEffect(() => {
    if (messages.length === 0) {
      activeQuickPromptRef.current = null;
      quickPromptSeenRestaurantsRef.current.clear();
    }
  }, [messages.length]);

  useEffect(() => {
    const liveMessageIds = new Set(messages.map((message) => message.id));

    setLoadMoreDividerBreakpoints((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([messageId]) => liveMessageIds.has(messageId))
      );
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });

    setLoadMoreClickCounts((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([messageId]) => liveMessageIds.has(messageId))
      );
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [messages]);

  // Persist messages to guest session (only for guests, authenticated users use Supabase)
  useEffect(() => {
    if (!isMounted || isSignedIn) return; // Only persist for guests

    try {
      if (messages.length > 0) {
        if (typeof window !== 'undefined') {
          // Save to guest session
          const guestMessages = messages.map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            meals: msg.meals,
            mealSearchContext: msg.mealSearchContext,
            isGateMessage: msg.isGateMessage
          }));
          saveGuestChatMessages(guestMessages);
        }
      } else {
        // Only clear if explicitly cleared (not on initial mount)
        if (typeof window !== 'undefined') {
          saveGuestChatMessages([]);
        }
      }
    } catch (e) {
      console.error('Failed to save chat messages:', e);
    }
  }, [messages, isMounted, isSignedIn]);

  // Note: visibleMealsCount persistence and inactivity checking are now handled by ChatContext


  // Clear gate when user is authenticated
  useEffect(() => {
    if (isSignedIn) {
      // Remove any gate messages (messages with isGateMessage: true)
      setMessages(prev => {
        const filtered = prev.filter(msg => !msg.isGateMessage);
        return filtered;
      });
    }
  }, [isSignedIn, setMessages]);

  // Check if user is at bottom of scroll
  const checkIfAtBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    // Consider at bottom if within 50px of bottom
    const threshold = 50;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < threshold;
    setIsAtBottom(isNearBottom);
  };

  // Set up scroll listener
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // Initial check
    checkIfAtBottom();

    // Listen for scroll events
    container.addEventListener('scroll', checkIfAtBottom);

    return () => {
      container.removeEventListener('scroll', checkIfAtBottom);
    };
  }, [messages]);

  // Generate a short summary line based on user query and found meals
  const formatMacroConstraintPhrases = (userQuery: string): string[] => {
    const constraints = extractMacroConstraintsFromText(userQuery);
    const phrases: string[] = [];
    const lowerQuery = userQuery.toLowerCase();
    const isLowCarbIntent = /\blow carb\b/.test(lowerQuery);

    if (constraints.minCalories !== undefined) phrases.push(`at least ${constraints.minCalories} calories`);
    if (constraints.maxCalories !== undefined) phrases.push(`under ${constraints.maxCalories} calories`);
    if (constraints.minProtein !== undefined) phrases.push(`at least ${constraints.minProtein}g protein`);
    if (constraints.maxProtein !== undefined) phrases.push(`under ${constraints.maxProtein}g protein`);
    if (constraints.minCarbs !== undefined) phrases.push(`at least ${constraints.minCarbs}g carbs`);
    if (constraints.maxCarbs !== undefined && !isLowCarbIntent) phrases.push(`under ${constraints.maxCarbs}g carbs`);
    if (constraints.minFats !== undefined) phrases.push(`at least ${constraints.minFats}g fat`);
    if (constraints.maxFats !== undefined) phrases.push(`under ${constraints.maxFats}g fat`);

    return phrases;
  };

  const applyMacroConstraintGuard = (meals: Meal[], userQuery: string): Meal[] => {
    const constraints = extractMacroConstraintsFromText(userQuery);
    const hasConstraints = Object.keys(constraints).length > 0;

    if (!hasConstraints) {
      return meals;
    }

    return meals.filter((meal) => {
      const calories = Number(meal.calories) || 0;
      const protein = Number(meal.protein) || 0;
      const carbs = Number(meal.carbs) || 0;
      const fats = Number(meal.fats) || 0;

      if (constraints.minCalories !== undefined && calories < constraints.minCalories) return false;
      if (constraints.maxCalories !== undefined && calories > constraints.maxCalories) return false;
      if (constraints.minProtein !== undefined && protein < constraints.minProtein) return false;
      if (constraints.maxProtein !== undefined && protein > constraints.maxProtein) return false;
      if (constraints.minCarbs !== undefined && carbs < constraints.minCarbs) return false;
      if (constraints.maxCarbs !== undefined && carbs > constraints.maxCarbs) return false;
      if (constraints.minFats !== undefined && fats < constraints.minFats) return false;
      if (constraints.maxFats !== undefined && fats > constraints.maxFats) return false;

      return true;
    });
  };

  const generateSummaryLine = (
    userQuery: string,
    mealCount: number,
    variantSeed?: string
  ): string => {
    const lowerQuery = userQuery.toLowerCase();
    const hasLunch = lowerQuery.includes('lunch');
    const hasDinner = lowerQuery.includes('dinner');
    const hasBreakfast = lowerQuery.includes('breakfast');
    const mealType = hasBreakfast ? 'breakfast' : hasLunch ? 'lunch' : hasDinner ? 'dinner' : null;

    const restaurantMatch = lowerQuery.match(/\b(chipotle|mcdonald|mcdonalds|subway|taco bell|pizza hut|domino|kfc|burger king|wendy|starbucks|dunkin|panera|olive garden|red lobster|outback|applebees|chilis|buffalo wild wings|panda express|papa johns|little caesars|jimmy johns|quiznos|arby|jack in the box|in-n-out|five guys|shake shack|whataburger|culvers|white castle|sonic|del taco|el pollo loco|qdoba|moe|baja fresh|rubio|baja|california pizza kitchen|cpk|p\.f\. chang|cheesecake factory|red robin|ihop|denny|waffle house|perkins|bob evans|cracker barrel|texas roadhouse|longhorn|bonefish|flemings|ruth chris|mortons|capital grille|fogo de chao|benihana|hibachi|sushi|japanese|chinese|thai|vietnamese|indian|mexican|italian|greek|mediterranean|french|american|steakhouse|seafood|bbq|barbecue|grill|diner|cafe|restaurant)\b/i);
    const restaurantName = restaurantMatch
      ? restaurantMatch[1].charAt(0).toUpperCase() + restaurantMatch[1].slice(1)
      : null;

    const constraintPhrases = formatMacroConstraintPhrases(userQuery);
    const constraintsClause = constraintPhrases.length > 0 ? ` with ${constraintPhrases.join(' and ')}` : '';
    const restaurantClause = restaurantName ? ` from ${restaurantName}` : '';
    const optionNoun = mealType ? `${mealType} options` : 'options';
    const isLowCarbIntent = /\blow carb\b/.test(lowerQuery);

    if (mealCount === 0) {
      if (isLowCarbIntent) {
        return `No low carb meals${restaurantClause} found yet.`;
      }
      if (constraintPhrases.length > 0) {
        return `No meals found${constraintsClause}${restaurantClause} yet.`;
      }
      return `No ${optionNoun}${restaurantClause} matched that request yet.`;
    }

    if (isLowCarbIntent) {
      const lowCarbTemplates = [
        `Try these low carb meals${restaurantClause}.`,
        `Here are low carb meals${restaurantClause}.`,
        `Low carb meal options${restaurantClause}.`,
        `These low carb meals${restaurantClause} match your request.`
      ];
      const seedBase =
        userQuery.split('')
          .reduce((acc, char) => acc + char.charCodeAt(0), 0) + mealCount;
      const variant =
        (variantSeed || '').split('')
          .reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const seed = seedBase + variant;
      return lowCarbTemplates[seed % lowCarbTemplates.length];
    }

    const templates = [
      `These ${optionNoun}${constraintsClause}${restaurantClause} match your request.`,
      `${mealCount} ${optionNoun}${constraintsClause}${restaurantClause} are ready.`,
      `Try these ${optionNoun}${constraintsClause}${restaurantClause}.`,
      `${optionNoun.charAt(0).toUpperCase() + optionNoun.slice(1)}${constraintsClause}${restaurantClause}.`
    ];

    const seedBase =
      userQuery.split('')
        .reduce((acc, char) => acc + char.charCodeAt(0), 0) + mealCount;
    const variant =
      (variantSeed || '').split('')
        .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const seed = seedBase + variant;
    return templates[seed % templates.length];
  };

  const maybeHandleQueryGate = () => {
    return showUpgradeModal;
  };

  const handleSuccessfulQuery = () => {
    return;
  };


  // Send message function
  const sendMessage = async (
    messageText: string,
    options?: {
      quickPromptText?: string;
      quickPromptStartIndex?: number;
      userVisibleText?: string;
      quickPromptNonce?: string;
      quickPromptKey?: string;
      quickPromptExcludedRestaurants?: string[];
    }
  ) => {
    const trimmedText = messageText.trim();
    if (!trimmedText) {
      return;
    }

    const quickPromptText = options?.quickPromptText?.trim();
    const quickPromptStartIndex = options?.quickPromptStartIndex ?? messages.length;
    const userVisibleText = options?.userVisibleText?.trim() || trimmedText;
    const quickPromptNonce = options?.quickPromptNonce?.trim();
    const quickPromptKey = options?.quickPromptKey?.trim().toLowerCase();
    const quickPromptExcludedRestaurants = (options?.quickPromptExcludedRestaurants ?? [])
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);

    if (maybeHandleQueryGate()) {
      return;
    }

    if (isLoading) {
      resetChatRequestState('send-retry');
    }

    if (quickPromptText) {
      activeQuickPromptRef.current = {
        promptText: quickPromptText,
        startIndex: quickPromptStartIndex,
      };
    } else {
      activeQuickPromptRef.current = null;
    }

    // Touch activity when user sends a message
    touchGuestActivity();

    // Log chat submit event (fire-and-forget - NEVER block the send flow)
    if (isSignedIn) {
      logUsageEvent('chat_submit', {
        source: 'chat_composer',
        queryText: trimmedText,
        queryLength: trimmedText.length,
        isMealIntent: isMealIntentQuery(trimmedText),
      }).catch(() => { });
    }

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Safety timeout to prevent UI hanging forever
    const timeoutId = setTimeout(() => {
      // Only abort if this is still the active request
      if (abortControllerRef.current === abortController) {
        // Pass reason to distinguish timeout from manual cancel
        abortController.abort(new Error('REQUEST_TIMEOUT'));
      }
    }, 45000); // 45 seconds max

    // Clear error
    setError(null);

    // Create user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userVisibleText
    };

    // Log user message to Supabase (fire-and-forget - never block the send flow)
    if (isSignedIn) {
      logChatMessage('user', trimmedText).catch(() => { });
    }

    // Add user message optimistically
    setMessages(prev => [...prev, userMessage]);

    // Clear input
    setInputText('');

    // Set loading
    loadingStartedAtRef.current = Date.now();
    markInflightLoading(true);
    setIsLoading(true);

    // Use try/finally to ensure loading is always set to false
    try {

      // Call API with new request format: { message, limit?, offset?, searchKey?, filters?, userContext? }
      let response: Response;
      try {
        const routerHistory = messages
          .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
          .map((entry) => ({
            role: entry.role,
            content: entry.content?.trim() ?? '',
          }))
          .filter((entry) => entry.content.length > 0)
          .slice(-ROUTER_HISTORY_LIMIT);

        const isMealIntent = isMealIntentQuery(trimmedText);
        const shouldRequestLocation = isMealIntent;
        const resolvedLocation = await Promise.race([
          requestLocationForMealSearch(shouldRequestLocation),
          new Promise<typeof userLocation>((resolve) => {
            const timer = window.setTimeout(() => resolve(null), 8000);
            abortController.signal.addEventListener(
              'abort',
              () => {
                window.clearTimeout(timer);
                resolve(null);
              },
              { once: true }
            );
          }),
        ]);

        const nearbyFields =
          isMealIntent && resolvedLocation
            ? buildNearbySearchRequestFields(
                resolvedLocation.latitude,
                resolvedLocation.longitude,
                activeDistance,
              )
            : {};

        response = await authenticatedFetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: trimmedText,
            history: routerHistory,
            quickPromptNonce,
            excludedRestaurants: quickPromptExcludedRestaurants.length > 0 ? quickPromptExcludedRestaurants : undefined,
            limit: CHAT_MEALS_PAGE_SIZE,
            offset: 0, // Default offset
            ...nearbyFields,
            userContext: {
              diet_type: userProfile?.diet_type,
              dietary_options: userProfile?.dietary_options,
              userId: userId || currentSessionId,
              ...(isMealIntent ? {
                search_distance_miles: activeDistance,
                ...(resolvedLocation ? {
                  user_location_lat: resolvedLocation.latitude,
                  user_location_lng: resolvedLocation.longitude,
                } : {}),
              } : {}),
            }
          }),
          signal: abortController.signal,
        });
      } catch (fetchError: unknown) {
        // Handle abort
        if (abortController.signal.aborted) {
          console.log('Request was aborted');
          // If aborted due to timeout, show error pointing to long delay
          if (abortController.signal.reason?.message === 'REQUEST_TIMEOUT') {
            setError('Request timed out. The server took too long to respond.');
            setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
          }
          return;
        }
        console.error('Fetch error:', fetchError);
        const errorMessage = fetchError instanceof Error ? fetchError.message : 'Failed to connect to server';
        setError(errorMessage);
        setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
        return;
      }

      // Helper function to generate unique message IDs
      const makeMessageId = () => {
        return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      };

      // Define assistantMessageId early for use in all response paths
      const assistantMessageId = makeMessageId();

      // Handle errors first - always read and log raw response body as text
      if (!response.ok) {
        // Always read response body as text first (before any parsing)
        let rawResponseText = '';
        try {
          rawResponseText = await response.text();
        } catch (readError) {
          console.error('[AIChat] Failed to read error response body:', readError);
          rawResponseText = '(failed to read response body)';
        }

        // Default error message
        let errorMessage = `Error ${response.status}: ${response.statusText}`;
        let serverMessage = '';

        // Check for usage limit in error response
        let isUsageLimitError = response.status === 403;

        // Try to parse JSON error only after logging raw text
        if (rawResponseText && rawResponseText !== '(failed to read response body)') {
          try {
            const errorJson = JSON.parse(rawResponseText);
            // Use server's message field if available, otherwise fall back to answer or other fields
            serverMessage = errorJson.message || errorJson.answer || errorJson.error || '';
            errorMessage = serverMessage || errorJson.details || errorMessage;

            // Check for explicit usage limit flag or message content
            if (errorJson.usageLimit === true || (serverMessage && serverMessage.toLowerCase().includes('usage limit'))) {
              isUsageLimitError = true;
            }

            // Log parsed error JSON for debugging
            if (!isUsageLimitError) {
              console.error('[AIChat] Parsed error JSON:', errorJson);
            }
          } catch {
            // Not JSON, use raw text if available
            if (rawResponseText.trim()) {
              errorMessage = rawResponseText.substring(0, 200);
              if (!isUsageLimitError) {
                console.error('[AIChat] Error response is not JSON, using raw text:', rawResponseText.substring(0, 500));
              }
            } else {
              if (!isUsageLimitError) {
                console.error('[AIChat] Error response body is empty or unreadable');
              }
            }
          }
        } else {
          if (!isUsageLimitError) {
            console.error('[AIChat] Error response body could not be read');
          }
        }

        // Only log the initial error if it's NOT a usage limit error (403 or flagged)
        if (!isUsageLimitError) {
          console.error(`[AIChat] /api/chat failed with status ${response.status}:`, rawResponseText || '(empty response body)');
        }

        if (isUsageLimitError) {
          setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));

          if (isPremium) {
            console.warn('[AIChat] Unexpected usage limit response for premium user');
            setError('Search failed. Please try again.');
          } else {
            openUpgradeModal();
            setError("You've used your 2 free searches for the day. Please come back in 24 hours when your 2 searches reset.");
          }
          return;
        }

        // Use server's message field for UI if available, otherwise use fallback
        const uiErrorMessage = serverMessage || errorMessage || 'Chat request failed';
        setError(uiErrorMessage);

        // Remove user message on error
        setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
        return;
      }

      // For successful responses, check content type first before consuming body
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');

      if (isJson) {
        // JSON response (meal mode) - read as text then parse
        let rawResponseText = '';
        try {
          rawResponseText = await response.text();
        } catch (readError) {
          console.error('[AIChat] Failed to read JSON response body:', readError);
          // Log the error details
          console.error('[AIChat] Read error details:', {
            name: readError instanceof Error ? readError.name : 'Unknown',
            message: readError instanceof Error ? readError.message : String(readError),
            stack: readError instanceof Error ? readError.stack : undefined
          });
          setError('Failed to read response from server');
          setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
          return;
        }

        try {
          const jsonData: SearchApiResponse = JSON.parse(rawResponseText);

          // Check for error flag or error field in response
          if (jsonData.error === true || jsonData.error) {
            // Log the full error response
            console.error('[AIChat] API returned error in JSON response:', jsonData);
            // Use server's message field if available, otherwise use answer or error field
            const serverErrorMessage =
              (typeof jsonData.message === 'string' && jsonData.message) ||
              (typeof jsonData.answer === 'string' && jsonData.answer) ||
              (typeof jsonData.error === 'string' && jsonData.error) ||
              'Chat request failed';
            setError(serverErrorMessage);
            setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
            return;
          }

          // Add debug log: log received keys and meals length
          console.log('[AIChat] Received response keys:', Object.keys(jsonData));
          console.log('[AIChat] Received data.meals?.length:', jsonData.meals?.length);
          if (process.env.NODE_ENV === 'development' && jsonData.debugInfo) {
            console.log('[AIChat] Retrieval debug info:', jsonData.debugInfo);
          }

          // Handle meal response format: treat ANY response with meals array (even if empty) as meal results
          // Response shape: { mode?: "meals", meals, hasMore, nextOffset, searchKey, summary?, message? }
          // Empty meals array is still a meal response (may have a message explaining why)
          if (jsonData.meals !== undefined && Array.isArray(jsonData.meals)) {
            const { meals: mealItems = [], hasMore, nextOffset, searchKey: responseSearchKey, summary: serverSummary, message } = jsonData;

            if (jsonData.nearbyCache) {
              persistNearbyCacheFromResponse(jsonData.nearbyCache);
            }

            // Convert to Meal format (prefer flattened fields from backend)
            const parsedMeals: Meal[] = mealItems.map(mapSearchItemToMeal);
            const constrainedMeals = applyMacroConstraintGuard(parsedMeals, trimmedText);

            if (parsedMeals.length > 0) {
              console.log('[AIChat] First meal from /api/chat:', parsedMeals[0]);
            }

            if (parsedMeals.length !== constrainedMeals.length) {
              console.warn('[AIChat] Client constraint guard removed meals that missed constraints:', {
                before: parsedMeals.length,
                after: constrainedMeals.length,
                query: trimmedText,
              });
            }

            const diversityHistory = buildMealHistory(messages);
            const diversifiedMeals = diversifyMealsByRestaurant(
              deduplicateMealsById(constrainedMeals),
              undefined,
              diversityHistory
            );

            // Store original query and filters for pagination
            const mealSearchContext = hasMore && responseSearchKey ? {
              searchKey: responseSearchKey,
              nextOffset: nextOffset ?? 0,
              hasMore,
              originalQuery: trimmedText, // Store original query for pagination
              filters: undefined // Can be extended if filters are passed
            } : undefined;

            let summaryLine: string;
            if (message) {
              summaryLine = message;
            } else {
              const summaryQueryText = quickPromptText ? userVisibleText : trimmedText;
              const hasMacroPhrases = formatMacroConstraintPhrases(summaryQueryText).length > 0;
              summaryLine = hasMacroPhrases
                ? generateSummaryLine(summaryQueryText, diversifiedMeals.length, quickPromptNonce)
                : (serverSummary || generateSummaryLine(summaryQueryText, diversifiedMeals.length, quickPromptNonce));
            }

            const assistantMessage: ChatMessage = {
              id: assistantMessageId,
              role: 'assistant',
              content: summaryLine,
              meals: diversifiedMeals,
              mealSearchContext
            };

            if (quickPromptText) {
              activeQuickPromptRef.current = {
                promptText: quickPromptText,
                startIndex: quickPromptStartIndex,
                context: mealSearchContext ?? {
                  searchKey: '',
                  nextOffset: 0,
                  hasMore: false,
                  originalQuery: trimmedText,
                  filters: undefined,
                },
              };
            }

            if (quickPromptText && quickPromptKey) {
              const seenRestaurants =
                quickPromptSeenRestaurantsRef.current.get(quickPromptKey) ?? new Set<string>();
              for (const meal of diversifiedMeals) {
                const restaurantKey = toRestaurantCycleKey(meal.restaurant_name || meal.restaurant);
                if (restaurantKey) {
                  seenRestaurants.add(restaurantKey);
                }
              }
              if (diversifiedMeals.length === 0 && quickPromptExcludedRestaurants.length > 0) {
                seenRestaurants.clear();
              }
              quickPromptSeenRestaurantsRef.current.set(quickPromptKey, seenRestaurants);
            }

            setMessages(prev => [...prev, assistantMessage]);
            handleSuccessfulQuery();

            // Log to Supabase - fire-and-forget, never block the UI while isLoading=true
            if (isSignedIn) {
              logChatMessage('assistant', summaryLine, diversifiedMeals, mealSearchContext).catch(() => { });
              logUsageEvent('chat_response', { messageCount: parsedMeals.length, hasMeals: true }).catch(() => { });
            }

            return; // Done with meal response
          }

          // Handle text response format from nutrition intent: { mode: "text", answer: string }
          // Only treat as text if mode is "text" AND meals array is undefined/missing (empty array still counts as meal response)
          if ((jsonData.mode === 'text' || jsonData.type === 'text') && (jsonData.answer || jsonData.message) && jsonData.meals === undefined) {
            const textContent = jsonData.answer || jsonData.message || '';
            const assistantMessage: ChatMessage = {
              id: assistantMessageId,
              role: 'assistant',
              content: textContent
            };

            if (quickPromptText) {
              activeQuickPromptRef.current = null;
            }

            setMessages(prev => [...prev, assistantMessage]);
            handleSuccessfulQuery();

            // Log to Supabase - fire-and-forget, never block the UI while isLoading=true
            if (isSignedIn) {
              logChatMessage('assistant', textContent).catch(() => { });
              logUsageEvent('chat_response', { hasMeals: false }).catch(() => { });
            }

            return;
          }

          // Unknown JSON response format
          console.error('[AIChat] Unknown JSON response format:', jsonData);
          console.error('[AIChat] Raw response text was:', rawResponseText.substring(0, 500));
          setError('Unexpected response format from server');
          if (quickPromptText) {
            activeQuickPromptRef.current = null;
          }
          setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
          return;
        } catch (jsonError) {
          // Log the parse error and the raw text that failed to parse
          console.error('[AIChat] Failed to parse JSON response:', jsonError);
          console.error('[AIChat] Raw response text that failed to parse:', rawResponseText || '(no text available)');
          console.error('[AIChat] Parse error details:', {
            name: jsonError instanceof Error ? jsonError.name : 'Unknown',
            message: jsonError instanceof Error ? jsonError.message : String(jsonError),
            stack: jsonError instanceof Error ? jsonError.stack : undefined
          });
          setError('Invalid response format from server');
          if (quickPromptText) {
            activeQuickPromptRef.current = null;
          }
          setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
          return;
        }
      }

      // Streaming responses are no longer used - nutrition questions return JSON
      // If we get here, it's an unexpected response format
      // Try to read the response body to see what we got
      let nonJsonText = '';
      try {
        nonJsonText = await response.text();
        console.error('[AIChat] Unexpected non-JSON response from /api/chat. Content-Type:', contentType);
        console.error('[AIChat] Response body:', nonJsonText || '(empty)');
      } catch (readError) {
        console.error('[AIChat] Could not read non-JSON response body:', readError);
      }
      setError('Unexpected response format from server');
      if (quickPromptText) {
        activeQuickPromptRef.current = null;
      }
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
      return;

    } catch (err) {
      // Handle abort - don't show error for aborted requests
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Request was aborted');
        return;
      }

      console.error('Error sending message:', err);
      console.error('Error details:', {
        name: err instanceof Error ? err.name : 'Unknown',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });

      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage || 'An unexpected error occurred');
      if (quickPromptText) {
        activeQuickPromptRef.current = null;
      }

      // Remove user message on error
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
    } finally {
      // Clear safety timeout
      clearTimeout(timeoutId);
      // Always set loading to false, regardless of success or error
      // Only clear loading state if this is still the active request
      if (abortControllerRef.current === abortController) {
        loadingStartedAtRef.current = null;
        markInflightLoading(false);
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  // Handle form submit
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    sendMessage(inputText);
  };

  // Handle quick prompt
  const sendQuickPrompt = async (promptText: string, visibleText?: string) => {
    if (isLoading) {
      resetChatRequestState('quick-prompt-retry');
    }

    const userFacingText = visibleText?.trim() || promptText;
    const quickPromptKey = promptText.trim().toLowerCase();
    const seenRestaurants =
      quickPromptSeenRestaurantsRef.current.get(quickPromptKey) ?? new Set<string>();
    if (!quickPromptSeenRestaurantsRef.current.has(quickPromptKey)) {
      quickPromptSeenRestaurantsRef.current.set(quickPromptKey, seenRestaurants);
    }
    const quickPromptNonce =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

    if (maybeHandleQueryGate()) return;
    sendMessage(promptText, {
      quickPromptText: promptText,
      quickPromptStartIndex: messages.length,
      userVisibleText: userFacingText,
      quickPromptNonce,
      quickPromptKey,
      quickPromptExcludedRestaurants: Array.from(seenRestaurants),
    });
  };

  // Load more meals for pagination
  const loadMoreMeals = async (messageId: string, context: MealSearchContext) => {
    if (!context.hasMore) return;
    if (isLoading) {
      resetChatRequestState('load-more-retry');
    }

    // Record activity when user loads more meals
    recordActivity();

    loadingStartedAtRef.current = Date.now();
    markInflightLoading(true);
    setIsLoading(true);
    setError(null);

    try {
      const existingMeals =
        messages.find((message) => message.id === messageId)?.meals ?? [];
      const seenMealIds = new Set(existingMeals.map((meal) => meal.id));
      const appendedMeals: Meal[] = [];
      const clickNumber = (loadMoreClickCounts[messageId] ?? 0) + 1;
      const targetBatchSize =
        clickNumber >= CHAT_MEALS_REDUCED_PAGE_START_CLICK
          ? CHAT_MEALS_REDUCED_PAGE_SIZE
          : CHAT_MEALS_PAGE_SIZE;

      let workingContext: MealSearchContext = { ...context };
      const MAX_ATTEMPTS = 6;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        if (!workingContext.hasMore) {
          break;
        }

        const requestBody = {
          searchKey: workingContext.searchKey,
          offset: workingContext.nextOffset,
          limit: CHAT_MEALS_PAGE_SIZE,
          isPagination: true,
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        let response: Response;
        try {
          response = await authenticatedFetch('/api/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `Error ${response.status}: ${response.statusText}`;
          let isUsageLimitError = response.status === 403;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.message || errorJson.error || errorMessage;
            if (errorJson.usageLimit === true) {
              isUsageLimitError = true;
            }
          } catch {
            if (errorText.trim()) errorMessage = errorText;
          }
          if (isUsageLimitError && !isPremium) {
            openUpgradeModal();
          }
          setError(errorMessage);
          return;
        }

        const searchData = await response.json();
        const fetchedMeals: Meal[] = Array.isArray(searchData.meals)
          ? searchData.meals.map(mapSearchItemToMeal)
          : [];

        for (const meal of fetchedMeals) {
          if (!seenMealIds.has(meal.id)) {
            appendedMeals.push(meal);
            seenMealIds.add(meal.id);
          }
        }

        workingContext = {
          searchKey: searchData.searchKey || workingContext.searchKey,
          nextOffset: searchData.nextOffset ?? workingContext.nextOffset,
          hasMore: searchData.hasMore ?? false,
          originalQuery: context.originalQuery,
          filters: context.filters,
        };

        if (appendedMeals.length >= CHAT_MEALS_PAGE_SIZE) {
          break;
        }

        if (appendedMeals.length >= targetBatchSize) {
          break;
        }
      }

      const batchMeals = appendedMeals.slice(0, targetBatchSize);

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId || !msg.meals) {
            return msg;
          }

          const updatedMeals = deduplicateMealsById([...msg.meals, ...batchMeals]);

          setVisibleMealsCount((prevCount) => ({
            ...prevCount,
            [messageId]: updatedMeals.length,
          }));

          return {
            ...msg,
            meals: updatedMeals,
            mealSearchContext: {
              searchKey: workingContext.searchKey,
              nextOffset: workingContext.nextOffset,
              hasMore: workingContext.hasMore,
              originalQuery: context.originalQuery,
              filters: context.filters,
            },
          };
        })
      );

      if (batchMeals.length > 0) {
        const breakpointIndex = existingMeals.length;
        setLoadMoreDividerBreakpoints((prev) => {
          const current = prev[messageId] ?? [];
          if (current.includes(breakpointIndex)) {
            return prev;
          }
          return {
            ...prev,
            [messageId]: [...current, breakpointIndex].sort((a, b) => a - b),
          };
        });
      }

      setLoadMoreClickCounts((prev) => ({
        ...prev,
        [messageId]: clickNumber,
      }));
    } catch (err) {
      console.error('Error loading more meals:', err);
      const errorMessage =
        err instanceof Error && err.name === 'AbortError'
          ? 'Request timed out. Please try again.'
          : err instanceof Error
            ? err.message
            : 'Failed to load more meals';
      setError(errorMessage);
    } finally {
      loadingStartedAtRef.current = null;
      markInflightLoading(false);
      setIsLoading(false);
    }
  };

  // Quick prompt chips with display text and actual prompt text
  const quickPromptSeed = [
    {
      display: "Meal under 1000 calories",
      prompt: "Find me a meal under 1000 calories and over 500 calories",
      userVisibleText: "Finding meals under 1000 calories."
    },
    { display: "Breakfast", prompt: "Find me breakfast options",
      userVisibleText: "Finding breakfast near you." },
    { display: "Low carb meal", prompt: "Find me a low carb meal" },
    { display: "Low fat meal", prompt: "Find me a low fat meal" },
    { display: "Find me lunch", prompt: "Find me lunch" },
    { display: "Find me dinner", prompt: "Find me dinner" }
  ];
  const quickPrompts = quickPromptSeed.map((item) => ({
    ...item,
    display: item.display.replace(/^[^\p{L}\p{N}]+/u, '').trim(),
  }));

  return (
    <div className={`flex flex-col h-full relative ${isDark ? 'bg-gray-950' : 'bg-gray-50'}`}>
      <header className="relative z-10 flex items-center justify-between gap-2 p-4 shadow-sm border-b border-border sticky top-0 bg-background text-foreground">
        <h1 className="min-w-0 truncate text-xl font-bold text-foreground">
          SeekEatz <span className={`text-xs px-2 py-1 rounded-full align-middle ${isDark ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-600'}`}>Meal Search Concierge</span>
        </h1>
        <SearchRadiusSelect
          value={activeDistance}
          onValueChange={(miles) => {
            setDistanceOverride(miles);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem(CHAT_DISTANCE_OVERRIDE_KEY, JSON.stringify(miles));
            }
          }}
        />
      </header>

      <div
        ref={messagesContainerRef}
        className="flex-1 space-y-4 overflow-y-auto p-4"
        style={{
          paddingBottom: isTypingMode
            ? 'calc(env(safe-area-inset-bottom, 0px) + 6.25rem)'
            : 'calc(var(--app-nav-safe-offset) + 10rem)',
        }}
      >
        {messages.map((m) => {
          return (
            <div key={m.id} className="mb-4" data-message-id={m.id}>
              {/* Message Bubble */}
              <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} mb-2`}>
                <div className={`${m.role === 'user' ? 'max-w-[85%]' : 'max-w-[78%]'}`}>
                  {m.role === 'assistant' && (
                    <div className={`mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${isDark ? 'text-cyan-300/80' : 'text-cyan-700/80'}`}>
                      SeekEatz AI
                    </div>
                  )}
                  <div className={`rounded-2xl ${m.role === 'user' ? 'p-4' : 'p-3.5'} shadow-sm ${m.role === 'user'
                    ? 'rounded-br-none border border-cyan-500/20 bg-gradient-to-br from-sky-600 via-cyan-600 to-blue-700 text-white shadow-cyan-900/20'
                    : isDark
                      ? 'bg-gradient-to-br from-slate-900 via-gray-900 to-gray-800 text-gray-100 border border-cyan-900/40 rounded-bl-none shadow-black/20'
                      : 'bg-gradient-to-br from-cyan-50 via-white to-slate-50 text-gray-800 border border-cyan-100 rounded-bl-none shadow-cyan-100/70'
                    }`}>
                    <div className={`prose prose-sm max-w-none prose-p:my-0 prose-headings:my-0 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 ${m.role === 'user' ? 'text-white prose-strong:text-white prose-li:text-white prose-a:text-white' : isDark ? 'text-gray-100 prose-strong:text-white prose-li:text-gray-100' : 'text-gray-800 prose-strong:text-gray-900 prose-li:text-gray-700'}`}>
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>

              {/* Meal Cards (only for assistant messages with meals) */}
              {/* Enforce 5 meal cards max for initial response */}
              {m.role === 'assistant' && m.meals && m.meals.length > 0 && (() => {
                // Determine how many meals to show for this message
                const visibleCount = visibleMealsCount[m.id] ?? CHAT_MEALS_PAGE_SIZE;
                const mealsToShow = m.meals.slice(0, visibleCount);
                const dividerBreakpoints = loadMoreDividerBreakpoints[m.id] ?? [];

                return (
                  <div className="flex justify-start mb-2">
                    <div className="flex flex-col gap-3 w-full max-w-[95%]">
                      {mealsToShow.map((meal, index) => {
                        const isFavorite = favoriteMeals?.includes(meal.id) || false;
                        return (
                          <div key={meal.id}>
                            {dividerBreakpoints.includes(index) && (
                              <div className="flex items-center gap-3 py-2">
                                <div className="h-px flex-1 bg-border" />
                                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                  {APPENDED_MEALS_DIVIDER_LABEL}
                                </span>
                                <div className="h-px flex-1 bg-border" />
                              </div>
                            )}
                            <MealCard
                              meal={meal}
                              isFavorite={isFavorite}
                              onClick={() => onMealSelect?.(meal)}
                              onToggleFavorite={() => onToggleFavorite?.(meal.id, meal)}
                              compact={true}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Load More Meals Button */}
              {/* Show button if there are more meals to show (either in state or from API) */}
              {m.role === 'assistant' && m.meals && (() => {
                const visibleCount = visibleMealsCount[m.id] ?? CHAT_MEALS_PAGE_SIZE;
                const hasMoreInState = m.meals.length > visibleCount;
                const hasMoreFromAPI = m.mealSearchContext?.hasMore;
                return hasMoreInState || hasMoreFromAPI;
              })() && (
                  <div className="flex justify-start mb-4">
                    <button
                      onClick={() => {
                        if (!m.meals) return;

                        const visibleCount = visibleMealsCount[m.id] ?? CHAT_MEALS_PAGE_SIZE;

                        // If we have more meals in state, show them all
                        if (m.meals.length > visibleCount) {
                          setVisibleMealsCount(prev => ({
                            ...prev,
                            [m.id]: m.meals!.length // Show all meals we have (non-null assertion safe after check)
                          }));
                        }

                        // If mealSearchContext has more, load them from API
                        if (m.mealSearchContext?.hasMore) {
                          loadMoreMeals(m.id, m.mealSearchContext);
                        }
                      }}
                      disabled={showUpgradeModal}
                      className="px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-400 text-white rounded-lg text-xs font-medium transition-all disabled:cursor-not-allowed"
                    >
                      {isLoading ? 'Loading...' : 'Load more meals'}
                    </button>
                  </div>
                )}

              {/* Gate Message Buttons (for free chat limit) - GUEST GATING BYPASS: Never show for authenticated users */}
              {m.role === 'assistant' && m.isGateMessage && !isSignedIn && (
                <div className="flex flex-col gap-2 justify-start mb-4">
                  <button
                    onClick={() => {
                      openUpgradeModal();
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm text-center"
                  >
                    Upgrade to Premium
                  </button>
                  <button
                    onClick={() => {
                      setError(null);
                      setMessages((prev) => prev.filter((message) => message.id !== m.id));
                    }}
                    className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all text-center ${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-200' : 'bg-white border-gray-300 hover:bg-gray-50 text-gray-700'}`}
                  >
                    Wait 24 hours for my free chats
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start mb-4">
            <div className="max-w-[78%]">
              <div className={`mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${isDark ? 'text-cyan-300/80' : 'text-cyan-700/80'}`}>
                SeekEatz AI
              </div>
              <div className={`border rounded-2xl rounded-bl-none p-4 shadow-sm text-sm flex items-center gap-2 ${isDark ? 'bg-gradient-to-br from-slate-900 via-gray-900 to-gray-800 border-cyan-900/40 text-gray-300' : 'bg-gradient-to-br from-cyan-50 via-white to-slate-50 border-cyan-100 text-gray-600'}`}>
                <div className={`animate-spin h-4 w-4 border-2 border-t-transparent rounded-full ${isDark ? 'border-blue-400' : 'border-blue-600'}`}></div>
                Thinking...
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center text-red-500 text-sm mb-4">
            <AlertCircle size={16} className="mr-2" />
            {error}
            <button
              onClick={() => setError(null)}
              className="underline ml-2"
            >
              Dismiss
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompt Chips */}
      <div className={`fixed bottom-[calc(var(--app-nav-safe-offset)+var(--app-chat-composer-height)+0.2rem)] left-1/2 w-full max-w-md -translate-x-1/2 z-20 pb-1.5 md:max-w-2xl md:pb-2 lg:max-w-4xl xl:max-w-5xl transition-all duration-300 ${isDark ? 'bg-gray-900' : 'bg-gray-50'} ${isAtBottom && !isTypingMode ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
        <div className="relative w-full max-w-3xl mx-auto px-3 md:px-4">
          <div className={`rounded-[1.1rem] border px-2.5 py-1.5 shadow-lg backdrop-blur-xl ${isDark ? 'border-gray-800 bg-gray-900/92 shadow-black/20' : 'border-gray-200 bg-white/92 shadow-gray-200/80'}`}>
            <p className={`mb-0.5 px-1 text-[9px] font-semibold uppercase tracking-[0.11em] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Try a quick search
            </p>
          <div
            className="overflow-x-auto scrollbar-hide px-0.5"
          >
            <div className="flex w-max min-w-full gap-1.5 justify-start">
              {quickPrompts.map((item, index) => (
                <button
                  key={index}
                  onClick={() => sendQuickPrompt(item.prompt, item.userVisibleText)}
                  disabled={showUpgradeModal}
                  className={`flex-shrink-0 rounded-full border px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${isDark ? 'bg-gray-800 hover:bg-gray-700 active:bg-gray-600 border-gray-700 text-gray-200' : 'bg-gray-50 hover:bg-gray-100 active:bg-gray-200 border-gray-200 text-gray-700'}`}
                >
                  {item.display}
                </button>
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Input Bar */}
      <div className={`fixed ${isTypingMode ? 'bottom-[env(safe-area-inset-bottom,0px)]' : 'bottom-[var(--app-nav-safe-offset)]'} left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 items-center justify-center transition-all duration-300 md:max-w-2xl lg:max-w-4xl xl:max-w-5xl ${isDark ? 'bg-gradient-to-t from-gray-950 via-gray-950/95 to-transparent' : 'bg-gradient-to-t from-gray-50 via-gray-50/95 to-transparent'}`}>
        <div className="w-full max-w-3xl px-3 pb-3 md:px-4 md:pb-4">
          <form
            onSubmit={onSubmit}
            data-tutorial-target="chat-input"
            className={`flex items-center gap-2 rounded-[1.75rem] border px-2 py-2 shadow-xl backdrop-blur-xl ${isDark
              ? 'border-gray-800 bg-gray-900/92 shadow-black/25'
              : 'border-gray-200 bg-white/92 shadow-gray-200/80'
              }`}
          >
            <button
              type="button"
              onClick={() => {
                if (confirm('Clear all chat messages?')) {
                  clearChat();
                  setInputText('');
                  clearGuestSession();
                  setCurrentSessionId(getGuestSessionId());
                }
              }}
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border transition-all ${isDark
                ? 'border-gray-700 bg-gray-800/90 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                }`}
              title="Clear chat"
            >
              <Trash2 size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
            <input
              type="text"
              className={`flex-1 bg-transparent px-2 py-2 text-[15px] outline-none focus:outline-none ${isDark
                ? 'text-gray-100 placeholder:text-gray-500'
                : 'text-gray-800 placeholder:text-gray-400'
                } ${showUpgradeModal ? 'opacity-60 cursor-not-allowed' : ''}`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              placeholder={showUpgradeModal ? "Upgrade to keep searching." : chatPlaceholder}
              disabled={showUpgradeModal}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || showUpgradeModal}
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 transition-all hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed ${showUpgradeModal ? 'cursor-not-allowed' : ''}`}
            >
              <Send size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
          </form>
        </div>
      </div>

      <UpgradeModal
        open={showUpgradeModal}
        subtitle="Your 2 free searches are used up. Upgrade to premium to unlock unlimited AI chat queries, quick searches, AI swaps, logging, saved meals and profile updating."
        onClose={() => {
          setShowUpgradeModal(false);
          setError(null);
        }}
      />

    </div>
  );
}
