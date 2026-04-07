'use client';

import { Send, Copy, AlertCircle, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MealCard } from "./MealCard";
import type { Meal } from "../types";
import { copyToClipboard } from "@/lib/clipboard-utils";
import { createClient } from "@/utils/supabase/client";
import { useTheme } from "../contexts/ThemeContext";
import { useChat } from "../contexts/ChatContext";
import { getGuestSessionId, getGuestChatMessages, saveGuestChatMessages, touchGuestActivity, clearGuestSession } from "@/lib/guest-session";
import { getRestaurantLogoUrl } from "@/lib/image-utils";
import { getStoredLocation, storeLocation } from "@/lib/location";
import { UpgradeModal } from "./UpgradeModal";
import {
  diversifyMealsByRestaurant,
  type RestaurantDiversityHistory,
} from "@/lib/restaurant-diversity";

interface AIChatProps {
  userId?: string;
  userProfile?: any;
  favoriteMeals?: any[];
  onMealSelect?: (meal: any) => void;
  onToggleFavorite?: (mealId: string, meal?: any) => void;
  onSignInRequest?: () => void; // Callback to trigger sign-in flow
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meals?: Meal[]; // Parsed meals from <MEAL_CARDS>
  mealSearchContext?: {
    searchKey: string;
    nextOffset: number;
    hasMore: boolean;
    originalQuery?: string; // Store original query for pagination
    filters?: { [key: string]: any }; // Store original filters for pagination
  };
  isGateMessage?: boolean; // Flag for gate messages that need buttons
}

type QuickPromptSearchContext = NonNullable<ChatMessage['mealSearchContext']>;

interface ActiveQuickPromptState {
  promptText: string;
  startIndex: number;
  context?: QuickPromptSearchContext;
}

const CHAT_MEALS_PAGE_SIZE = 5;
const APPENDED_MEALS_DIVIDER_LABEL = "More meals";

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

function mapSearchItemToMeal(item: any): Meal {
  return {
    id: item.id,
    name: item.item_name || item.name,
    restaurant: item.restaurant_name,
    restaurant_name: item.restaurant_name,
    calories: item.calories ?? 0,
    protein: item.protein ?? item.protein_g ?? 0,
    carbs: item.carbs ?? item.carbs_g ?? 0,
    fats: item.fats ?? item.fats_g ?? item.fat_g ?? 0,
    image: getRestaurantLogoUrl(
      item.restaurant_name || item.restaurant || '',
      item.restaurantLogoUrl || item.restaurant_logo_url || item.logo_url
    ),
    restaurantLogoUrl: getRestaurantLogoUrl(
      item.restaurant_name || item.restaurant || '',
      item.restaurantLogoUrl || item.restaurant_logo_url || item.logo_url
    ),
    description: item.description || '',
    category: item.category || '',
    dietary_tags: item.dietary_tags || [],
    price: item.price || null,
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

function findLatestQuickPromptMealMessage(
  messages: ChatMessage[],
  promptText: string
): { message: ChatMessage; index: number } | null {
  const normalizedPrompt = promptText.trim().toLowerCase();

  for (let index = messages.length - 1; index >= 1; index -= 1) {
    const assistantMessage = messages[index];
    const previousMessage = messages[index - 1];

    if (
      assistantMessage.role === 'assistant' &&
      assistantMessage.mealSearchContext &&
      previousMessage?.role === 'user' &&
      previousMessage.content.trim().toLowerCase() === normalizedPrompt
    ) {
      return { message: assistantMessage, index };
    }
  }

  return null;
}

function buildQuickPromptMealHistory(
  messages: ChatMessage[],
  promptText: string,
  startIndex = 0
): RestaurantDiversityHistory {
  const normalizedPrompt = promptText.trim().toLowerCase();
  const seenMealIds = new Set<string>();
  const restaurantExposure = new Map<string, number>();

  for (let index = Math.max(1, startIndex + 1); index < messages.length; index += 1) {
    const assistantMessage = messages[index];
    const previousMessage = messages[index - 1];

    if (
      assistantMessage.role !== 'assistant' ||
      previousMessage?.role !== 'user' ||
      previousMessage.content.trim().toLowerCase() !== normalizedPrompt ||
      !assistantMessage.meals?.length
    ) {
      continue;
    }

    for (const meal of assistantMessage.meals) {
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

const CHAT_SCROLL_POSITION_KEY = 'seekeatz_chat_scroll_position';

export default function AIChat({ userId, userProfile, favoriteMeals, onMealSelect, onToggleFavorite, onSignInRequest }: AIChatProps) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { messages, visibleMealsCount, isLoading, setMessages, setVisibleMealsCount, setIsLoading, clearChat, updateActivity } = useChat();
  // Check if user is signed in (userId prop or check session)
  const [isSignedIn, setIsSignedIn] = useState(!!userId);
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const welcomeMessage = useMemo(
    () => buildWelcomeMessage(userProfile),
    [userProfile?.full_name]
  );
  const chatPlaceholder = useMemo(
    () => buildInputPlaceholder(new Date(new Date().setHours(currentHour))),
    [currentHour]
  );
  const [isLimitReached, setIsLimitReached] = useState(false); // kept for compatibility, but no longer used for gating
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const activeQuickPromptRef = useRef<ActiveQuickPromptState | null>(null);

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
        try { abortControllerRef.current.abort(); } catch (e) { /* ignore */ }
        abortControllerRef.current = null;
      }
    };
    const handleOffline = () => {
      console.log('[AIChat] Network went offline - resetting loading state');
      setIsLoading(false);
      if (abortControllerRef.current) {
        try { abortControllerRef.current.abort(); } catch (e) { /* ignore */ }
        abortControllerRef.current = null;
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkAuth = async () => {
      try {
        const supabase = createClient();
        // Retry logic for auth check — capped at 2 retries, 100ms delay, with per-call timeout
        const withAuthTimeout = (promise: Promise<any>, ms: number) =>
          Promise.race([promise, new Promise<any>(resolve => setTimeout(() => resolve({ data: { user: null }, error: null }), ms))]);

        let retries = 0;
        let user = null;

        while (retries < 2 && !user) {
          const { data: { user: fetchedUser }, error } = await withAuthTimeout(supabase.auth.getUser(), 3000);
          if (error && (error.message?.includes('Auth session missing') || error.name === 'AuthSessionMissingError')) {
            setIsSignedIn(false);
            setIsLimitReached(false);
            break;
          } else if (fetchedUser) {
            user = fetchedUser;
            setIsSignedIn(true);
            setIsLimitReached(false);
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
      } catch (error: any) {
        if (error?.message?.includes('Auth session missing') || error?.name === 'AuthSessionMissingError') {
          setIsSignedIn(false);
        } else {
          setIsSignedIn(false);
        }
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
        setIsLimitReached(false);

        // Remove gate messages immediately
        setMessages(prev => prev.filter(msg => !msg.isGateMessage));

        // Claim the current session (define inline to avoid dependency issues)
        const sessionId = currentSessionId;
        if (sessionId) {
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
  }, [currentSessionId, setMessages, setIsLoading]);
  // Local state - chat state is managed by ChatContext
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Safety: Reset isLoading on mount in case a previous in-flight request
  // was killed by a browser refresh (the finally block never ran).
  useEffect(() => {
    setIsLoading(false);
    // Also abort any lingering request (ref is reset on remount)
    abortControllerRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // User location state (for nearby meal filtering)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(() => {
    const stored = getStoredLocation();
    return stored
      ? { latitude: stored.latitude, longitude: stored.longitude }
      : null;
  });

  // Get user location on mount (if permission granted)
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          storeLocation(position.coords.latitude, position.coords.longitude);
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          // User denied location or error - silently fail (graceful fallback)
          console.log('Location access denied or unavailable:', error.message);
          setUserLocation(null);
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 300000, // Cache for 5 minutes
        }
      );
    }
  }, []);

  // Helper to record chat activity timestamps (alias for touchGuestActivity)
  const recordActivity = useCallback(() => {
    touchGuestActivity();
    updateActivity(); // Also update context activity
  }, [updateActivity]);


  // Track if Supabase chat persistence is available (avoid repeated RLS errors)
  const supabaseChatAvailable = useRef(true);

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
        // RLS policy likely missing — disable Supabase chat persistence to avoid repeated errors
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

  // Load messages from Supabase for authenticated users
  useEffect(() => {
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

  // Trial limits have been removed – always allow chat usage and clear any legacy gate messages.
  useEffect(() => {
    setIsLimitReached(false);
    setMessages(prev => prev.filter(msg => !msg.isGateMessage));
  }, [setMessages]);

  // Log to Supabase (only for authenticated users)
  const logChatMessage = useCallback(async (role: 'user' | 'assistant', content: string, meals?: any[], mealSearchContext?: any) => {
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
  }, [isSignedIn, userId, currentSessionId, ensureChatSessionOwned]);

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

  // Centralized chat reset (clears messages but NOT trial count)
  const resetChat = useCallback(() => {
    // Stop any in-flight requests
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch (e) {
        console.warn('Error aborting chat request:', e);
      } finally {
        abortControllerRef.current = null;
      }
    }

    // Clear state (using context)
    clearChat();
    setInputText('');
    setError(null);

    // Clear guest session (messages, but NOT trial count)
    clearGuestSession();
    // Rotate session ID
    setCurrentSessionId(getGuestSessionId());
  }, [clearChat]);

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
  }, [isMounted, messages.length, scrollToBottom]);

  // Mark component as mounted
  useEffect(() => {
    setIsMounted(true);
  }, []);

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
  }, [isMounted, messages.length, welcomeMessage]);

  useEffect(() => {
    if (!isMounted || messages.length !== 1) return;

    const [firstMessage] = messages;
    if (firstMessage.role !== 'assistant') return;
    if (!firstMessage.id.startsWith('assistant-initial-')) return;
    if (firstMessage.content === welcomeMessage) return;

    setMessages([{ ...firstMessage, content: welcomeMessage }]);
  }, [isMounted, messages, welcomeMessage]);

  useEffect(() => {
    if (messages.length === 0) {
      activeQuickPromptRef.current = null;
    }
  }, [messages.length]);

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
      // User is authenticated - immediately clear all guest restrictions
      setIsLimitReached(false);

      // Remove any gate messages (messages with isGateMessage: true)
      setMessages(prev => {
        const filtered = prev.filter(msg => !msg.isGateMessage);
        return filtered;
      });
    }
  }, [isSignedIn]);

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

  // Check if content contains <MEAL_CARDS> (even partially)
  const hasMealCards = (content: string): boolean => {
    return content.includes('<MEAL_CARDS>');
  };

  // Parse <MEAL_CARDS> from content and extract meals + pagination info
  const parseMealCards = (content: string): {
    cleanContent: string;
    meals: Meal[];
    mealSearchContext?: { searchKey: string; nextOffset: number; hasMore: boolean }
  } => {
    const mealCardsRegex = /<MEAL_CARDS>([\s\S]*?)<\/MEAL_CARDS>/;
    const match = content.match(mealCardsRegex);

    if (!match) {
      return { cleanContent: content, meals: [] };
    }

    try {
      const jsonStr = match[1].trim();
      console.log('[AIChat Debug] Parsing JSON from <MEAL_CARDS>:', jsonStr.substring(0, 500));
      const parsed = JSON.parse(jsonStr);
      const meals: Meal[] = parsed.meals || [];
      const hasMore = parsed.hasMore === true;
      const nextOffset = typeof parsed.nextOffset === 'number' ? parsed.nextOffset : 0;
      const searchKey = parsed.searchKey || '';

      console.log('[AIChat Debug] Parsed meals count:', meals.length, 'hasMore:', hasMore);

      // Remove the <MEAL_CARDS> block from content
      const cleanContent = content.replace(mealCardsRegex, '').trim();

      const mealSearchContext = hasMore && searchKey ? {
        searchKey,
        nextOffset,
        hasMore
      } : undefined;

      return { cleanContent, meals, mealSearchContext };
    } catch (err) {
      console.error('[AIChat Debug] Failed to parse MEAL_CARDS JSON:', err);
      console.error('[AIChat Debug] JSON string that failed:', match[1].substring(0, 500));
      // If parsing fails, just remove the block
      const cleanContent = content.replace(mealCardsRegex, '').trim();
      return { cleanContent, meals: [] };
    }
  };

  // Generate a short summary line based on user query and found meals
  const generateSummaryLine = (userQuery: string, mealCount: number): string => {
    const lowerQuery = userQuery.toLowerCase();

    // Extract restaurant name if mentioned
    const restaurantMatch = lowerQuery.match(/\b(chipotle|mcdonald|mcdonalds|subway|taco bell|pizza hut|domino|kfc|burger king|wendy|starbucks|dunkin|panera|olive garden|red lobster|outback|applebees|chilis|buffalo wild wings|panda express|papa johns|little caesars|jimmy johns|quiznos|arby|jack in the box|in-n-out|five guys|shake shack|whataburger|culvers|white castle|sonic|del taco|el pollo loco|qdoba|moe|baja fresh|rubio|baja|california pizza kitchen|cpk|p.f. chang|cheesecake factory|red robin|ihop|denny|waffle house|perkins|bob evans|cracker barrel|texas roadhouse|longhorn|outback|bonefish|flemings|ruth chris|mortons|capital grille|fogo de chao|brazilian steakhouse|benihana|hibachi|sushi|japanese|chinese|thai|vietnamese|indian|mexican|italian|greek|mediterranean|french|american|steakhouse|seafood|bbq|barbecue|grill|diner|cafe|restaurant)\b/i);
    const restaurantName = restaurantMatch ? restaurantMatch[1].charAt(0).toUpperCase() + restaurantMatch[1].slice(1) : null;

    // Extract meal type
    const hasLunch = lowerQuery.includes('lunch');
    const hasDinner = lowerQuery.includes('dinner');
    const hasBreakfast = lowerQuery.includes('breakfast');
    const mealType = hasBreakfast ? 'breakfast' : hasLunch ? 'lunch' : hasDinner ? 'dinner' : null;

    // Extract calorie constraint
    const calorieMatch = lowerQuery.match(/(?:under|below|less than|max|maximum|up to)\s*(\d+)\s*(?:calories?|cal)/i);
    const maxCalories = calorieMatch ? parseInt(calorieMatch[1]) : null;

    // Extract macro constraints
    const hasHighProtein = lowerQuery.match(/\b(high[\s-]?protein|(\d+)\+?\s*g?\s*protein|(\d+)\+?\s*grams?\s*protein)/i);
    const hasLowCarb = lowerQuery.match(/\b(low[\s-]?carb|low[\s-]?carbs|under\s*(\d+)\s*g?\s*carb)/i);
    const hasLowFat = lowerQuery.match(/\b(low[\s-]?fat|under\s*(\d+)\s*g?\s*fat)/i);
    // Diet logic removed - vegetarian/vegan filtering disabled

    // Build summary line
    let summary = '';

    if (restaurantName) {
      summary = `Here are ${mealCount} ${mealType ? mealType + ' ' : ''}options from ${restaurantName}.`;
    } else if (mealType && maxCalories) {
      summary = `Found ${mealCount} ${mealType} options under ${maxCalories} calories.`;
    } else if (mealType) {
      summary = `Here are ${mealCount} ${mealType} options near you.`;
    } else if (maxCalories) {
      summary = `Found ${mealCount} options under ${maxCalories} calories.`;
    } else if (hasHighProtein) {
      const proteinMatch = lowerQuery.match(/(\d+)\+?\s*g?\s*protein/i);
      const proteinAmount = proteinMatch ? proteinMatch[1] : '40';
      summary = `Found ${mealCount} high-protein options (${proteinAmount}g+ protein).`;
    } else if (hasLowCarb) {
      summary = `Found ${mealCount} low-carb options.`;
    } else if (hasLowFat) {
      summary = `Found ${mealCount} low-fat options.`;
    } else {
      summary = `Here are ${mealCount} options that match your request.`;
    }

    return summary;
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
    }
  ) => {
    const trimmedText = messageText.trim();
    if (!trimmedText) {
      return;
    }

    const quickPromptText = options?.quickPromptText?.trim();
    const quickPromptStartIndex = options?.quickPromptStartIndex ?? messages.length;
    const userVisibleText = options?.userVisibleText?.trim() || trimmedText;

    if (maybeHandleQueryGate()) {
      return;
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

    // Log chat submit event (fire-and-forget — NEVER block the send flow)
    if (isSignedIn) {
      logUsageEvent('chat_submit', {
        source: 'chat_composer',
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

    // Log user message to Supabase (fire-and-forget — never block the send flow)
    if (isSignedIn) {
      logChatMessage('user', trimmedText).catch(() => { });
    }

    // Add user message optimistically
    setMessages(prev => [...prev, userMessage]);

    // Clear input
    setInputText('');

    // Set loading
    setIsLoading(true);

    // Use try/finally to ensure loading is always set to false
    try {

      // Call API with new request format: { message, limit?, offset?, searchKey?, filters?, userContext? }
      let response: Response;
      try {
        response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: trimmedText,
            limit: 10, // Default limit
            offset: 0, // Default offset
            userContext: {
              search_distance_miles: userProfile?.search_distance_miles,
              diet_type: userProfile?.diet_type,
              dietary_options: userProfile?.dietary_options,
              userId: userId || currentSessionId,
              // Include location if available
              ...(userLocation ? {
                user_location_lat: userLocation.latitude,
                user_location_lng: userLocation.longitude,
              } : {}),
            }
          }),
          signal: abortController.signal,
        });
      } catch (fetchError: any) {
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
          } catch (parseError) {
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

          setShowUpgradeModal(true);
          setError(serverMessage || "You've used your 2 free AI searches for today. Upgrade to continue.");
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
          const jsonData = JSON.parse(rawResponseText);

          // Check for error flag or error field in response
          if (jsonData.error === true || jsonData.error) {
            // Log the full error response
            console.error('[AIChat] API returned error in JSON response:', jsonData);
            // Use server's message field if available, otherwise use answer or error field
            const serverErrorMessage = jsonData.message || jsonData.answer || jsonData.error || 'Chat request failed';
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

            // Convert to Meal format (prefer flattened fields from backend)
            const parsedMeals: Meal[] = (mealItems || []).map((item: any) => ({
              id: item.id,
              name: item.item_name || item.name,
              restaurant: item.restaurant_name,
              calories: item.calories ?? 0,
              protein: item.protein ?? item.protein_g ?? 0,
              carbs: item.carbs ?? item.carbs_g ?? 0,
              fats: item.fats ?? item.fats_g ?? item.fat_g ?? 0,
                image: getRestaurantLogoUrl(
                  item.restaurant_name || item.restaurant || '',
                  item.restaurantLogoUrl || item.restaurant_logo_url || item.logo_url
                ),
                restaurantLogoUrl: getRestaurantLogoUrl(
                  item.restaurant_name || item.restaurant || '',
                  item.restaurantLogoUrl || item.restaurant_logo_url || item.logo_url
                ),
              description: item.description || '',
              category: item.category || '',
              dietary_tags: item.dietary_tags || [],
              price: item.price || null,
            }));

            if (parsedMeals.length > 0) {
              console.log('[AIChat] First meal from /api/chat:', parsedMeals[0]);
            }

            const diversityHistory = buildMealHistory(messages);
            const diversifiedMeals = diversifyMealsByRestaurant(
              deduplicateMealsById(parsedMeals),
              undefined,
              diversityHistory
            );

            // Store original query and filters for pagination
            const mealSearchContext = hasMore && responseSearchKey ? {
              searchKey: responseSearchKey,
              nextOffset,
              hasMore,
              originalQuery: trimmedText, // Store original query for pagination
              filters: undefined // Can be extended if filters are passed
            } : undefined;

            // Generate summary: use server message if meals array is empty, otherwise use server summary or generate from actual meals.length
            // NEVER hardcode meal count - always use parsedMeals.length
            let summaryLine: string;
            if (parsedMeals.length === 0 && message) {
              // If no meals but we have a message (e.g., "No verified matches found..."), use that
              summaryLine = message;
            } else {
              // Use server summary if provided, otherwise generate from actual meals.length
              summaryLine = serverSummary || generateSummaryLine(trimmedText, diversifiedMeals.length);
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

            setMessages(prev => [...prev, assistantMessage]);
            handleSuccessfulQuery();

            // Log to Supabase — fire-and-forget, never block the UI while isLoading=true
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

            // Log to Supabase — fire-and-forget, never block the UI while isLoading=true
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
    if (isLoading) return;

    const activeQuickPrompt = activeQuickPromptRef.current;
    const normalizedPrompt = promptText.trim().toLowerCase();
    const userFacingText = visibleText?.trim() || promptText;
    const latestContext =
      activeQuickPrompt?.promptText.trim().toLowerCase() === normalizedPrompt
        ? activeQuickPrompt.context
        : undefined;

    if (!latestContext) {
      if (maybeHandleQueryGate()) return;
      sendMessage(promptText, {
        quickPromptText: promptText,
        quickPromptStartIndex: messages.length,
        userVisibleText: userFacingText,
      });
      return;
    }

    if (!latestContext.hasMore) {
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: userFacingText,
      };
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}-no-more`,
        role: 'assistant',
        content: 'There are no more new meals for this quick search. Try a different prompt or change your filters.',
      };
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      return;
    }

    setIsLoading(true);
    setError(null);

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userFacingText,
    };

    if (isSignedIn) {
      logChatMessage('user', promptText).catch(() => {});
      logUsageEvent('chat_submit', {
        source: 'quick_prompt',
        queryLength: promptText.length,
        repeatedQuickPrompt: true,
      }).catch(() => {});
    }

    setMessages((prev) => [...prev, userMessage]);

    try {
      const TARGET_QUICK_PROMPT_BATCH = 5;
      let workingContext = { ...latestContext };
      let unseenMeals: Meal[] = [];
      let workingResponseSearchKey = workingContext.searchKey;
      const diversityHistory = buildQuickPromptMealHistory(
        messages,
        promptText,
        activeQuickPrompt?.startIndex ?? 0
      );
      const seenMealIds = new Set(diversityHistory.seenMealIds ?? []);

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            searchKey: workingContext.searchKey,
            offset: workingContext.nextOffset,
            limit: 5,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to load more meals');
        }

        const searchData = await response.json();
        const fetchedMeals: Meal[] = Array.isArray(searchData.meals)
          ? searchData.meals.map(mapSearchItemToMeal)
          : [];

        const diversified = diversifyMealsByRestaurant(
          deduplicateMealsById(fetchedMeals),
          undefined,
          diversityHistory
        );

        for (const meal of diversified) {
          if (!seenMealIds.has(meal.id)) {
            unseenMeals.push(meal);
            seenMealIds.add(meal.id);
          }
        }

        unseenMeals = deduplicateMealsById(unseenMeals);

        workingContext = {
          searchKey: searchData.searchKey || workingContext.searchKey,
          nextOffset: searchData.nextOffset ?? workingContext.nextOffset,
          hasMore: searchData.hasMore ?? false,
          originalQuery: latestContext.originalQuery,
          filters: latestContext.filters,
        };
        workingResponseSearchKey = searchData.searchKey || workingResponseSearchKey;

        if (unseenMeals.length >= TARGET_QUICK_PROMPT_BATCH || !workingContext.hasMore) {
          break;
        }
      }

      unseenMeals = unseenMeals.slice(0, TARGET_QUICK_PROMPT_BATCH);

      const assistantMessage: ChatMessage = unseenMeals.length > 0
        ? {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: generateSummaryLine(promptText, unseenMeals.length),
            meals: unseenMeals,
            mealSearchContext: {
              searchKey: workingResponseSearchKey,
              nextOffset: workingContext.nextOffset,
              hasMore: workingContext.hasMore,
              originalQuery: latestContext.originalQuery ?? promptText,
              filters: latestContext.filters,
            },
          }
        : {
            id: `assistant-${Date.now()}-exhausted`,
            role: 'assistant',
            content: 'There are no more new meals for this quick search. Try a different prompt or change your filters.',
          };

      activeQuickPromptRef.current = {
        promptText,
        startIndex: activeQuickPrompt?.startIndex ?? messages.length,
        context: assistantMessage.mealSearchContext ?? {
          searchKey: '',
          nextOffset: 0,
          hasMore: false,
          originalQuery: latestContext.originalQuery ?? promptText,
          filters: latestContext.filters,
        },
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (isSignedIn) {
        logChatMessage(
          'assistant',
          assistantMessage.content,
          assistantMessage.meals,
          assistantMessage.mealSearchContext
        ).catch(() => {});
      }
    } catch (err) {
      console.error('Error advancing quick prompt search:', err);
      setError(err instanceof Error ? err.message : 'Failed to load more meals');
      setMessages((prev) => prev.filter((msg) => msg.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  // Load more meals for pagination
  const loadMoreMeals = async (messageId: string, context: { searchKey: string; nextOffset: number; hasMore: boolean; originalQuery?: string; filters?: { [key: string]: any } }) => {
    if (isLoading || !context.hasMore) return;

    // Record activity when user loads more meals
    recordActivity();

    setIsLoading(true);
    setError(null);

    try {
      // Call /api/search with only pagination parameters
      const requestBody = {
        searchKey: context.searchKey,
        offset: context.nextOffset,
        limit: 5,
      };

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Error ${response.status}: ${response.statusText}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch {
          if (errorText.trim()) errorMessage = errorText;
        }
        setError(errorMessage);
        return;
      }

      // Treat response as: { meals, hasMore, nextOffset, searchKey }
      const searchData = await response.json();

      if (!searchData.meals || !Array.isArray(searchData.meals)) {
        setError('Invalid response format from server');
        return;
      }

      // Convert search results to Meal format
      const newMeals: Meal[] = searchData.meals.map(mapSearchItemToMeal);

      // Append new meals to existing ones
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId && msg.meals) {
          const updatedMeals = deduplicateMealsById([...msg.meals, ...newMeals]);

          // Update visible count to show all meals (including newly loaded ones)
          setVisibleMealsCount(prevCount => ({
            ...prevCount,
            [messageId]: updatedMeals.length
          }));

          // Always persist the updated context (even if hasMore is false)
          return {
            ...msg,
            meals: updatedMeals,
            mealSearchContext: {
              searchKey: searchData.searchKey || context.searchKey,
              nextOffset: searchData.nextOffset ?? context.nextOffset,
              hasMore: searchData.hasMore ?? false,
              originalQuery: context.originalQuery,
              filters: context.filters
            }
          };
        }
        return msg;
      }));
    } catch (err) {
      console.error('Error loading more meals:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load more meals';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async (text: string) => {
    // Clipboard interaction only occurs in direct response to user actions
    // (e.g., onClick handlers that call handleCopy).
    try {
      const success = await copyToClipboard(text);
      if (!success) {
        console.warn("Clipboard copy failed or is not available in this environment.");
      }
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  // Quick prompt chips with display text and actual prompt text
  const quickPromptSeed = [
    {
      display: "🔥 Meal under 1000 calories",
      prompt: "Find me a meal under 1000 calories and over 650 calories",
      userVisibleText: "Finding meals under 1000 calories."
    },
    { display: "🌅 Breakfast", prompt: "Find me breakfast foods like breakfast sandwiches, burritos, omelets, bagels, pancakes, waffles, oatmeal, and toast" },
    { display: "🥗 Low carb meal", prompt: "Find me a low carb meal" },
    { display: "🫒 Low fat meal", prompt: "Find me a low fat meal" },
    { display: "🍽️ Find me lunch", prompt: "Find me lunch" },
    { display: "🍴 Find me dinner", prompt: "Find me dinner" }
  ];
  const quickPrompts = quickPromptSeed.map((item) => ({
    ...item,
    display: item.display.replace(/^[^\p{L}\p{N}]+/u, '').trim(),
  }));

  return (
    <div className={`flex flex-col h-full relative ${isDark ? 'bg-gray-950' : 'bg-gray-50'}`}>
      <div className={`p-4 shadow-sm border-b sticky top-0 z-10 ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
        <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
          SeekEatz <span className={`text-xs px-2 py-1 rounded-full align-middle ${isDark ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-600'}`}>Meal Search Concierge</span>
        </h1>
      </div>

      <div
        ref={messagesContainerRef}
        className="flex-1 space-y-4 overflow-y-auto p-4 pb-[calc(var(--app-nav-safe-offset)+10rem)]"
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

                return (
                  <div className="flex justify-start mb-2">
                    <div className="flex flex-col gap-3 w-full max-w-[95%]">
                      {mealsToShow.map((meal, index) => {
                        const isFavorite = favoriteMeals?.includes(meal.id) || false;
                        return (
                          <div key={meal.id}>
                            {index === CHAT_MEALS_PAGE_SIZE && (
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
                      disabled={isLoading}
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
                      setShowUpgradeModal(true);
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
                    Wait 24hrs for my free chats
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
      <div className={`fixed bottom-[calc(var(--app-nav-safe-offset)+var(--app-chat-composer-height)+0.2rem)] left-0 right-0 w-full z-20 pb-1.5 md:pb-2 transition-all duration-300 ${isDark ? 'bg-gray-900' : 'bg-white'} ${isAtBottom ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
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
      <div className={`fixed bottom-[var(--app-nav-safe-offset)] left-0 right-0 z-30 flex w-full items-center justify-center transition-all duration-300 ${isDark ? 'bg-gradient-to-t from-gray-950 via-gray-950/95 to-transparent' : 'bg-gradient-to-t from-white via-white/95 to-transparent'}`}>
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
        subtitle="Your free daily chats are up. Upgrade to premium to unlock full access."
        onClose={() => {
          setShowUpgradeModal(false);
          setError(null);
        }}
      />

    </div>
  );
}
