'use client';

import { Send, Copy, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MealCard } from "./MealCard";
import type { Meal } from "../types";
import { copyToClipboard } from "@/lib/clipboard-utils";
import { createClient } from "@/utils/supabase/client";

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
  };
  isGateMessage?: boolean; // Flag for gate messages that need buttons
}

const CHAT_STORAGE_KEY = 'seekeatz_chat_messages';
const LAST_ACTIVITY_KEY = 'seekeatz_chat_lastActivityAt';
const FREE_CHAT_COUNT_KEY = 'seekeatz_free_chat_count';
const FREE_CHAT_COUNT_KEY_LOCAL = 'seekeatz_free_chat_count_local'; // localStorage fallback
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FREE_CHATS = 3; // Allow 3 free chats, block on 4th attempt

export default function AIChat({ userId, userProfile, favoriteMeals, onMealSelect, onToggleFavorite, onSignInRequest }: AIChatProps) {
  const router = useRouter();
  // Check if user is signed in (userId prop or check session)
  const [isSignedIn, setIsSignedIn] = useState(!!userId);
  const [hasReachedLimit, setHasReachedLimit] = useState(false);
  
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        // AuthSessionMissingError is expected when signed out - treat as not signed in
        if (error && (error.message?.includes('Auth session missing') || error.name === 'AuthSessionMissingError')) {
          setIsSignedIn(false);
        } else {
          setIsSignedIn(!!user);
        }
      } catch (error: any) {
        // AuthSessionMissingError is expected when signed out - treat as not signed in
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsSignedIn(!!session?.user);
    });
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);
  // Local state - no useChat hook
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    // Load messages from sessionStorage on mount
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const storage = window.sessionStorage;

      // Check last activity for inactivity timeout
      const lastActivityRaw = storage.getItem(LAST_ACTIVITY_KEY);
      if (lastActivityRaw) {
        const lastActivity = parseInt(lastActivityRaw, 10);
        if (!Number.isNaN(lastActivity)) {
          const now = Date.now();
          if (now - lastActivity > INACTIVITY_TIMEOUT_MS) {
            // Inactive for too long - clear any stale chat data
            storage.removeItem(CHAT_STORAGE_KEY);
            storage.removeItem(LAST_ACTIVITY_KEY);
            return [];
          }
        }
      }

      const saved = storage.getItem(CHAT_STORAGE_KEY);
      if (!saved) return [];

      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (e) {
      console.error('Failed to load chat messages from sessionStorage:', e);
    }

    return [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const chipsContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  // Track visible meals count per message (for "5 max initially" feature)
  const [visibleMealsCount, setVisibleMealsCount] = useState<Record<string, number>>({});
  
  // User location state (for nearby meal filtering)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  
  // Get user location on mount (if permission granted)
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
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

  // Helper to record chat activity timestamps
  const recordActivity = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    } catch (e) {
      console.error('Failed to record chat activity in sessionStorage:', e);
    }
  }, []);

  // Clears anonymous free chat usage (used on sign-in, sign-out, inactivity reset)
  const resetTrialCount = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      // Clear both the current storage keys and legacy keys if they exist
      window.sessionStorage.removeItem(FREE_CHAT_COUNT_KEY);
      window.localStorage.removeItem(FREE_CHAT_COUNT_KEY_LOCAL);
      // Also clear legacy "freeChatCount" key if it exists
      window.sessionStorage.removeItem("freeChatCount");
      window.localStorage.removeItem("freeChatCount");
    } catch (e) {
      console.warn("Failed to reset trial count", e);
    }
  }, []);

  // Free chat count helpers (for signed-out users only)
  const getFreeChatCount = useCallback((): number => {
    if (typeof window === 'undefined') return 0;
    try {
      // Try sessionStorage first, then localStorage as fallback
      const sessionCount = window.sessionStorage.getItem(FREE_CHAT_COUNT_KEY);
      if (sessionCount) {
        const count = parseInt(sessionCount, 10);
        if (!Number.isNaN(count)) {
          // Sync to localStorage as fallback
          window.localStorage.setItem(FREE_CHAT_COUNT_KEY_LOCAL, count.toString());
          return count;
        }
      }
      // Fallback to localStorage
      const localCount = window.localStorage.getItem(FREE_CHAT_COUNT_KEY_LOCAL);
      if (localCount) {
        const count = parseInt(localCount, 10);
        if (!Number.isNaN(count)) {
          // Sync back to sessionStorage
          window.sessionStorage.setItem(FREE_CHAT_COUNT_KEY, count.toString());
          return count;
        }
      }
      return 0;
    } catch (e) {
      console.error('Failed to get free chat count:', e);
      return 0;
    }
  }, []);

  const setFreeChatCount = useCallback((count: number) => {
    if (typeof window === 'undefined') return;
    try {
      // Store in both sessionStorage and localStorage
      window.sessionStorage.setItem(FREE_CHAT_COUNT_KEY, count.toString());
      window.localStorage.setItem(FREE_CHAT_COUNT_KEY_LOCAL, count.toString());
    } catch (e) {
      console.error('Failed to set free chat count:', e);
    }
  }, []);

  const incrementFreeChatCount = useCallback(() => {
    const current = getFreeChatCount();
    const newCount = current + 1;
    setFreeChatCount(newCount);
    return newCount;
  }, [getFreeChatCount, setFreeChatCount]);

  // Alias for clarity when user signs in
  const resetFreeChatCount = useCallback(() => {
    resetTrialCount();
  }, [resetTrialCount]);

  // Check if user has reached the free chat limit
  const hasReachedFreeChatLimit = useCallback((): boolean => {
    if (isSignedIn) return false; // Signed-in users have no limit
    return getFreeChatCount() >= MAX_FREE_CHATS;
  }, [isSignedIn, getFreeChatCount]);

  // Log to Supabase (only for authenticated users)
  const logChatMessage = useCallback(async (role: 'user' | 'assistant', content: string, conversationId?: string) => {
    if (!isSignedIn || !userId) return;
    
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          user_id: userId,
          role,
          content,
          conversation_id: conversationId,
        });
      
      if (error) {
        console.error('Failed to log chat message to Supabase:', error);
      }
    } catch (e) {
      console.error('Error logging chat message:', e);
    }
  }, [isSignedIn, userId]);

  const logUsageEvent = useCallback(async (eventType: 'chat_submit' | 'chat_response' | 'limit_hit', metadata?: any) => {
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
      'vegetarian', 'vegan', 'gluten', 'keto', 'paleo'
    ];
    const lowerQuery = query.toLowerCase();
    return mealKeywords.some(keyword => lowerQuery.includes(keyword));
  }, []);

  // Centralized chat reset
  // NOTE: This does NOT clear the free chat count - that persists for anonymous users
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

    // Clear state
    setMessages([]);
    setInputText('');
    setIsLoading(false);
    setError(null);

    // Clear session storage keys related to chat (but NOT free chat count)
    if (typeof window !== 'undefined') {
      try {
        const storage = window.sessionStorage;
        storage.removeItem(CHAT_STORAGE_KEY);
        storage.removeItem(LAST_ACTIVITY_KEY);
        // Do NOT remove FREE_CHAT_COUNT_KEY or FREE_CHAT_COUNT_KEY_LOCAL here
        // Anonymous users should keep their trial count across navigation
      } catch (e) {
        console.error('Failed to clear chat sessionStorage:', e);
      }
    }
  }, []);

  // Auto-scroll
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Helper function to scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  }, []);
  
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Mark component as mounted
  useEffect(() => {
    setIsMounted(true);
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
        content: 'What can I help you find today?'
      };
      setMessages([initialMessage]);
    }
  }, [isMounted, messages.length]);

  // Persist messages to sessionStorage whenever they change
  useEffect(() => {
    if (!isMounted) return;

    try {
      if (messages.length > 0) {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
        }
      } else {
        // Only clear if explicitly cleared (not on initial mount)
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(CHAT_STORAGE_KEY);
        }
      }
    } catch (e) {
      console.error('Failed to save chat messages to sessionStorage:', e);
    }
  }, [messages, isMounted]);

  // Inactivity timer - clear chat after 30 minutes of inactivity
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkInactivity = () => {
      try {
        const lastActivityRaw = window.sessionStorage.getItem(LAST_ACTIVITY_KEY);
        if (!lastActivityRaw) return;

        const lastActivity = parseInt(lastActivityRaw, 10);
        if (Number.isNaN(lastActivity)) return;

         const now = Date.now();
         if (now - lastActivity > INACTIVITY_TIMEOUT_MS && messages.length > 0) {
           resetChat();
           // Do NOT reset free chat count on inactivity - it should persist for anonymous users
         }
      } catch (e) {
        console.error('Failed to check chat inactivity:', e);
      }
    };

    // Run an initial check and then every 30 seconds
    checkInactivity();
    const intervalId = window.setInterval(checkInactivity, 30 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [messages.length, resetChat]);

  // Handle auth state changes
  // NOTE: Anonymous state (SIGNED_OUT) should persist - do NOT clear chat or trial count
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setIsSignedIn(!!session?.user);
      if (event === 'SIGNED_IN' && session?.user) {
        // User signed in - reset free chat count (unlimited for signed-in users)
        // Optionally clear chat for a clean slate after account creation
        resetFreeChatCount();
        // Note: We could also call resetChat() here if we want a clean slate after sign-in
        // For now, keeping chat history after sign-in
      }
      // Do NOT call resetChat() or resetTrialCount() on SIGNED_OUT
      // Anonymous users should keep their chat messages and trial count across navigation
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [resetFreeChatCount]);

  // Check scroll position for arrow visibility
  const updateArrowVisibility = () => {
    const container = chipsContainerRef.current;
    if (!container) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = container;
    setShowLeftArrow(scrollLeft > 10);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  // Update arrow visibility on mount and resize
  useEffect(() => {
    // Initial check after render
    const timer = setTimeout(() => {
      updateArrowVisibility();
    }, 100);
    
    // Also check on resize
    const handleResize = () => {
      setTimeout(() => updateArrowVisibility(), 50);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

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

  // Scroll chips left/right
  const scrollChips = (direction: 'left' | 'right') => {
    const container = chipsContainerRef.current;
    if (!container) return;
    
    const scrollAmount = 250;
    const targetScroll = direction === 'left' 
      ? container.scrollLeft - scrollAmount
      : container.scrollLeft + scrollAmount;
    
    container.scrollTo({
      left: targetScroll,
      behavior: 'smooth'
    });
  };

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
    const hasVegetarian = lowerQuery.includes('vegetarian') || lowerQuery.includes('veggie');
    
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
    } else if (hasVegetarian) {
      summary = `Found ${mealCount} vegetarian options.`;
    } else {
      summary = `Here are ${mealCount} options that match your request.`;
    }
    
    return summary;
  };

  // Check limit on mount and when auth state changes
  // Also ensure gate message exists if limit is reached
  useEffect(() => {
    if (!isSignedIn) {
      const currentCount = getFreeChatCount();
      const limitReached = currentCount >= MAX_FREE_CHATS;
      setHasReachedLimit(limitReached);
      
      // Ensure gate message exists if limit is reached
      if (limitReached) {
        setMessages(prev => {
          const hasGateMessage = prev.some(msg => msg.isGateMessage && msg.role === 'assistant');
          if (!hasGateMessage) {
            const gateMessage: ChatMessage = {
              id: `assistant-gate-${Date.now()}`,
              role: 'assistant',
              content: "**Create an account to keep going**\n\nYou've used your 3 free chats. Create an account or sign in to continue using SeekEatz for free.",
              isGateMessage: true
            };
            return [...prev, gateMessage];
          }
          return prev;
        });
        // Scroll to bottom to show gate message
        setTimeout(() => scrollToBottom(), 100);
      }
    } else {
      setHasReachedLimit(false);
    }
  }, [isSignedIn, getFreeChatCount, scrollToBottom]);

  // Send message function
  const sendMessage = async (messageText: string) => {
    const trimmedText = messageText.trim();
    if (!trimmedText || isLoading) {
      return;
    }

    // Check free chat limit BEFORE sending (only for signed-out users)
    if (!isSignedIn && hasReachedFreeChatLimit()) {
      // Limit reached - show limit message and disable input
      setHasReachedLimit(true);
      
      // Remove any user message that might have been added optimistically
      // (shouldn't happen since we check before, but just in case)
      
      // Show limit message bubble (only once)
      setMessages(prev => {
        // Check if limit message already exists
        const hasLimitMessage = prev.some(msg => msg.isGateMessage && msg.role === 'assistant');
        if (hasLimitMessage) {
          return prev; // Don't add duplicate
        }
        
        const assistantMessageId = `assistant-limit-${Date.now()}`;
        const limitMessage: ChatMessage = {
          id: assistantMessageId,
          role: 'assistant',
          content: "**Create an account to keep going**\n\nYou've used your 3 free chats. Create an account or sign in to continue using SeekEatz for free!",
          isGateMessage: true
        };
        
        return [...prev, limitMessage];
      });
      
      // Scroll to bottom to show gate message and buttons
      setTimeout(() => scrollToBottom(), 100);

      // Log limit hit event (if signed in, though this shouldn't happen)
      if (isSignedIn) {
        await logUsageEvent('limit_hit', { message: trimmedText });
      }

      // Auto-redirect after delay (unless user clicks button immediately)
      const redirectTimer = setTimeout(() => {
        router.push('/auth/signin');
      }, 1200); // 1.2 seconds delay

      // Store timer so we can clear it if user clicks button
      (window as any).__seekeatz_redirectTimer = redirectTimer;

      return;
    }

    // Record activity when user sends a message
    recordActivity();

    // Log chat submit event (for authenticated users)
    if (isSignedIn) {
      await logUsageEvent('chat_submit', { message: trimmedText });
    }

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Clear error
    setError(null);

    // Create user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedText
    };

    // Log user message to Supabase (if authenticated)
    if (isSignedIn) {
      await logChatMessage('user', trimmedText);
    }

    // Add user message optimistically
    setMessages(prev => [...prev, userMessage]);
    
    // Clear input
    setInputText('');
    
    // Set loading
    setIsLoading(true);

    // Use try/finally to ensure loading is always set to false
    try {

      // Prepare messages array for API (all previous messages + new user message)
      const apiMessages = [...messages, userMessage].map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Call API with AbortSignal
      let response: Response;
      try {
        response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: apiMessages,
            userId,
            userContext: {
              ...userProfile,
              // Include location if available
              ...(userLocation ? {
                user_location_lat: userLocation.latitude,
                user_location_lng: userLocation.longitude,
              } : {}),
            }
          }),
          signal: abortController.signal,
        });
      } catch (fetchError) {
        // Handle abort
        if (abortController.signal.aborted) {
          console.log('Request was aborted');
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

      // Handle errors first - read as text to safely parse
      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (readError) {
          console.error('Failed to read error response:', readError);
          errorText = '(failed to read response body)';
        }
        
        let errorMessage = `Error ${response.status}: ${response.statusText}`;
        
        // Try to parse JSON error
        if (errorText && errorText !== '(failed to read response body)') {
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorJson.message || errorJson.details || errorMessage;
          } catch {
            // Not JSON, use raw text if available
            if (errorText.trim()) {
              errorMessage = errorText.substring(0, 200);
            }
          }
        }

        console.error('API Error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText || '(empty)',
          url: response.url
        });

        setError(errorMessage || 'Chat request failed');
        
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
          console.error('Failed to read JSON response body:', readError);
          setError('Failed to read response from server');
          setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
          return;
        }
        
        try {
          const jsonData = JSON.parse(rawResponseText);
          
          if (jsonData.error) {
            console.error('API returned error in JSON:', jsonData);
            setError(jsonData.error || 'Chat request failed');
            setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
            return;
          }
          
          // Handle meal response format
          if (jsonData.type === 'meals') {
            const { meals: mealItems = [], summary, hasMore, nextOffset, searchKey: responseSearchKey } = jsonData;
            
            // Convert to Meal format (prefer flattened fields from backend)
            const parsedMeals: Meal[] = (mealItems || []).map((item: any) => ({
              id: item.id,
              name: item.item_name || item.name,
              restaurant: item.restaurant_name,
              calories: item.calories ?? 0,
              protein: item.protein ?? item.protein_g ?? 0,
              carbs: item.carbs ?? item.carbs_g ?? 0,
              fats: item.fats ?? item.fats_g ?? item.fat_g ?? 0,
              image: item.image_url || '/placeholder-food.jpg',
              description: item.description || '',
              category: item.category || '',
              dietary_tags: item.dietary_tags || [],
              price: item.price || null,
            }));
            
            if (parsedMeals.length > 0) {
              console.log('[AIChat] First meal from /api/chat:', parsedMeals[0]);
            }
            
            const mealSearchContext = hasMore && responseSearchKey ? {
              searchKey: responseSearchKey,
              nextOffset,
              hasMore
            } : undefined;
            
            // Add assistant message with meals
            const summaryLine = summary || generateSummaryLine(trimmedText, parsedMeals.length);
            const assistantMessage: ChatMessage = {
              id: assistantMessageId,
              role: 'assistant',
              content: summaryLine,
              meals: parsedMeals,
              mealSearchContext
            };
            
            setMessages(prev => [...prev, assistantMessage]);
            
            // Increment free chat count for signed-out users (only on successful response)
            if (!isSignedIn) {
              const newCount = incrementFreeChatCount();
              // Check if limit is now reached and update state
              if (newCount >= MAX_FREE_CHATS) {
                setHasReachedLimit(true);
              }
            }
            
            // Log to Supabase (for authenticated users)
            if (isSignedIn) {
              await logChatMessage('assistant', summaryLine);
              await logUsageEvent('chat_response', { 
                messageCount: parsedMeals.length,
                hasMeals: true 
              });
            }
            
            return; // Done with meal response
          }
          
          // Handle text response format
          if (jsonData.type === 'text' && jsonData.message) {
            const assistantMessage: ChatMessage = {
              id: assistantMessageId,
              role: 'assistant',
              content: jsonData.message
            };
            
            setMessages(prev => [...prev, assistantMessage]);
            
            // Increment free chat count for signed-out users (only on successful response)
            if (!isSignedIn) {
              const newCount = incrementFreeChatCount();
              // Check if limit is now reached and update state
              if (newCount >= MAX_FREE_CHATS) {
                setHasReachedLimit(true);
              }
            }
            
            // Log to Supabase (for authenticated users)
            if (isSignedIn) {
              await logChatMessage('assistant', jsonData.message);
              await logUsageEvent('chat_response', { hasMeals: false });
            }
            
            return;
          }
          
          // Unknown JSON response format
          console.error('Unknown JSON response format:', jsonData);
          setError('Unexpected response format from server');
          setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
          return;
        } catch (jsonError) {
          console.error('Failed to parse JSON response:', jsonError);
          setError('Invalid response format from server');
          setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
          return;
        }
      }
      
      // For text/streaming responses, process as stream
      // Process streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        console.error('No response body reader available');
        setError('No response body received');
        setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
        return;
      }

      let assistantContent = '';
      let isCardResponse = false;

      // Add empty assistant message with placeholder for card responses
      // (assistantMessageId is already defined above)
      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        meals: []
      }]);

      // Read stream - AI SDK toTextStreamResponse returns plain text chunks
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Decode chunk and append to content
          const chunk = decoder.decode(value, { stream: true });
          assistantContent += chunk;

        // Check if this is a card response (detect <MEAL_CARDS> early)
        // Once we detect it, never show the raw content
        if (!isCardResponse && hasMealCards(assistantContent)) {
          isCardResponse = true;
          // Update message to show placeholder and mark as card response
          // Clear any content that might have streamed before detection
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, content: 'Finding options...', meals: [] }
              : msg
          ));
        }

        // For card responses, never update visible content during streaming
        // We'll parse and update after streaming finishes
        if (!isCardResponse) {
          // Normal response - update content as it streams
          // But check if it suddenly becomes a card response
          if (hasMealCards(assistantContent)) {
            // Switch to card response mode
            isCardResponse = true;
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, content: 'Finding options...', meals: [] }
                : msg
            ));
          } else {
            // Normal streaming - update content
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, content: assistantContent }
                : msg
            ));
          }
        }
        }
      } catch (streamError) {
        // Handle abort
        if (abortController.signal.aborted) {
          console.log('Stream reading was aborted');
          return;
        }
        console.error('Stream reading error:', streamError);
        // If we got some content before the error, try to use it
        if (!assistantContent.trim()) {
          const errorMessage = streamError instanceof Error ? streamError.message : 'Failed to read response stream';
          setError(errorMessage);
          setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
          return;
        }
        // Otherwise continue with whatever content we have
      }

      // After streaming finishes, parse the final content from raw buffer
      // DEBUG: Log raw buffer to check for <MEAL_CARDS>
      const hasMealCardsStart = assistantContent.includes('<MEAL_CARDS>');
      const hasMealCardsEnd = assistantContent.includes('</MEAL_CARDS>');
      const startIndex = assistantContent.indexOf('<MEAL_CARDS>');
      const endIndex = assistantContent.indexOf('</MEAL_CARDS>');
      
      console.log('[AIChat Debug] Raw buffer check:', {
        hasStart: hasMealCardsStart,
        hasEnd: hasMealCardsEnd,
        startIndex,
        endIndex,
        bufferLength: assistantContent.length,
        preview: assistantContent.substring(0, 200) + '...'
      });
      
      const { cleanContent, meals, mealSearchContext } = parseMealCards(assistantContent);
      
      // Check if this is a card response (either detected during streaming or found at the end)
      const hasCards = meals.length > 0;
      const wasCardResponse = isCardResponse || hasCards || hasMealCardsStart;
      
      console.log('[AIChat Debug] Parsing result:', {
        wasCardResponse,
        isCardResponse,
        hasCards,
        mealsCount: meals.length,
        cleanContentLength: cleanContent.length,
        hasMore: mealSearchContext?.hasMore
      });
      
      if (wasCardResponse && hasCards) {
        // Card response: replace placeholder/content with summary line
        const summaryLine = generateSummaryLine(trimmedText, meals.length);
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, content: summaryLine, meals, mealSearchContext }
            : msg
        ));
        
        // Increment free chat count for signed-out users (only on successful response)
        if (!isSignedIn) {
          incrementFreeChatCount();
        }
        
        // Log to Supabase (for authenticated users)
        if (isSignedIn) {
          await logChatMessage('assistant', summaryLine);
          await logUsageEvent('chat_response', { 
            messageCount: meals.length,
            hasMeals: true 
          });
        }
      } else if (wasCardResponse) {
        // Card response detected but no meals found - show clean content without JSON
        const finalContent = cleanContent || 'I couldn\'t find matches for that within your saved menus. Want me to loosen the filters?';
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, content: finalContent, meals: [] }
            : msg
        ));
        
        // Increment free chat count for signed-out users (only on successful response)
        if (!isSignedIn) {
          incrementFreeChatCount();
        }
        
        // Log to Supabase (for authenticated users)
        if (isSignedIn) {
          await logChatMessage('assistant', finalContent);
          await logUsageEvent('chat_response', { hasMeals: false });
        }
      } else {
        // Normal response - update with final clean content (no cards)
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, content: cleanContent }
            : msg
        ));
        
        // Increment free chat count for signed-out users (only on successful response)
        if (!isSignedIn) {
          incrementFreeChatCount();
        }
        
        // Log to Supabase (for authenticated users)
        if (isSignedIn) {
          await logChatMessage('assistant', cleanContent);
          await logUsageEvent('chat_response', { hasMeals: false });
        }
      }

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
      
      // Remove user message on error
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
    } finally {
      // Always set loading to false, regardless of success or error
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Handle form submit
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
    sendMessage(inputText);
  };

  // Handle quick prompt
  const sendQuickPrompt = (promptText: string) => {
    sendMessage(promptText);
  };

  // Load more meals for pagination
  const loadMoreMeals = async (messageId: string, context: { searchKey: string; nextOffset: number; hasMore: boolean }) => {
    if (isLoading || !context.hasMore) return;

    // Record activity when user loads more meals
    recordActivity();

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchKey: context.searchKey,
          offset: context.nextOffset,
          limit: 5,
        }),
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

      const searchData = await response.json();
      
      if (searchData.type === 'meals' && searchData.meals) {
        // Convert search results to Meal format
        const newMeals: Meal[] = (searchData.meals || []).map((item: any) => ({
          id: item.id,
          name: item.item_name || item.name,
          restaurant: item.restaurant_name,
          calories: item.calories ?? 0,
          protein: item.protein ?? item.protein_g ?? 0,
          carbs: item.carbs ?? item.carbs_g ?? 0,
          fats: item.fats ?? item.fats_g ?? item.fat_g ?? 0,
          image: item.image_url || '/placeholder-food.jpg',
          description: item.description || '',
          category: item.category || '',
          dietary_tags: item.dietary_tags || [],
          price: item.price || null,
        }));

        // Append new meals to existing ones and update context
        setMessages(prev => prev.map(msg => {
          if (msg.id === messageId && msg.meals) {
            const updatedMeals = [...msg.meals, ...newMeals];
            // Update visible count to show all meals (including newly loaded ones)
            setVisibleMealsCount(prevCount => ({
              ...prevCount,
              [messageId]: updatedMeals.length
            }));
            
            return {
              ...msg,
              meals: updatedMeals,
              mealSearchContext: searchData.hasMore ? {
                searchKey: searchData.searchKey,
                nextOffset: searchData.nextOffset,
                hasMore: searchData.hasMore
              } : undefined
            };
          }
          return msg;
        }));
      }
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
  const quickPrompts = [
    { display: "Find me a meal under 1000 calories", prompt: "Find me a meal under 1000 calories" },
    { display: "🍽️ Find me lunch under 600 calories", prompt: "Find me lunch under 600 calories" },
    { display: "💪 High-protein meal (40g+ protein)", prompt: "High-protein meal (40g+ protein)" },
    { display: "🥗 Low-carb meal (under 30g carbs)", prompt: "Low-carb meal (under 30g carbs)" },
    { display: "🫒 Low-fat meal (under 20g fat)", prompt: "Low-fat meal (under 20g fat)" },
    { display: "🌱 Vegetarian meal under 700 calories", prompt: "Vegetarian meal under 700 calories" },
    { display: "🌅 Healthy breakfast under 500 calories", prompt: "Healthy breakfast under 500 calories" },
    { display: "📍 Show me the best option near me right now", prompt: "Show me the best option near me right now" }
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      <div className="p-4 bg-white shadow-sm border-b sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-800">
          SeekEatz <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full align-middle">Beta</span>
        </h1>
          </div>

      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 pb-[220px]"
      >
        {messages.map((m) => {
          return (
            <div key={m.id} className="mb-4">
              {/* Message Bubble */}
              <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} mb-2`}>
                <div className={`${m.role === 'user' ? 'max-w-[85%]' : 'max-w-[75%]'} rounded-2xl ${m.role === 'user' ? 'p-4' : 'p-3'} shadow-sm ${
                    m.role === 'user' 
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-br-none' 
                      : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                  }`}>
                  <div className={`prose prose-sm max-w-none ${m.role === 'user' ? 'text-white' : 'text-gray-800'}`}>
                    <ReactMarkdown>{m.content}</ReactMarkdown>
        </div>
                </div>
              </div>

              {/* Meal Cards (only for assistant messages with meals) */}
              {/* Enforce 5 meal cards max for initial response */}
              {m.role === 'assistant' && m.meals && m.meals.length > 0 && (() => {
                // Determine how many meals to show for this message
                const visibleCount = visibleMealsCount[m.id] ?? 5; // Default to 5, or use stored count
                const mealsToShow = m.meals.slice(0, visibleCount);
                const hasMoreMeals = m.meals.length > visibleCount;
                
                return (
                  <div className="flex justify-start mb-2">
                    <div className="flex flex-col gap-3 w-full max-w-[95%]">
                      {mealsToShow.map((meal) => {
                        const isFavorite = favoriteMeals?.includes(meal.id) || false;
                        return (
                          <MealCard
                            key={meal.id}
                            meal={meal}
                            isFavorite={isFavorite}
                            onClick={() => onMealSelect?.(meal)}
                            onToggleFavorite={() => onToggleFavorite?.(meal.id, meal)}
                            compact={true}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              
              {/* Load More Meals Button */}
              {/* Show button if there are more meals to show (either in state or from API) */}
              {m.role === 'assistant' && m.meals && (() => {
                const visibleCount = visibleMealsCount[m.id] ?? 5;
                const hasMoreInState = m.meals.length > visibleCount;
                const hasMoreFromAPI = m.mealSearchContext?.hasMore;
                return hasMoreInState || hasMoreFromAPI;
              })() && (
                <div className="flex justify-start mb-4">
                  <button
                    onClick={() => {
                      if (!m.meals) return;
                      
                      const visibleCount = visibleMealsCount[m.id] ?? 5;
                      
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
              
              {/* Gate Message Buttons (for free chat limit) */}
              {m.role === 'assistant' && m.isGateMessage && (
                <div className="flex flex-col gap-2 justify-start mb-4">
                  <button
                    onClick={() => {
                      // Clear redirect timer if user clicks button
                      if ((window as any).__seekeatz_redirectTimer) {
                        clearTimeout((window as any).__seekeatz_redirectTimer);
                        delete (window as any).__seekeatz_redirectTimer;
                      }
                      router.push('/auth/signup');
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm text-center"
                  >
                    Create Account / Get Started
                  </button>
                  <button
                    onClick={() => {
                      // Clear redirect timer if user clicks button
                      if ((window as any).__seekeatz_redirectTimer) {
                        clearTimeout((window as any).__seekeatz_redirectTimer);
                        delete (window as any).__seekeatz_redirectTimer;
                      }
                      router.push('/auth/signin');
                    }}
                    className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-all text-center"
                  >
                    I already have an account
                  </button>
                </div>
              )}
              </div>
              );
        })}

        {isLoading && (
          <div className="flex justify-start mb-4">
             <div className="bg-white border rounded-2xl p-4 shadow-sm text-gray-500 text-sm flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                Thinking...
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
      <div className={`bg-white fixed bottom-[125px] md:bottom-[152px] left-0 right-0 w-full z-20 pb-0 transition-all duration-300 ${isAtBottom ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
        <div className="relative">
          {/* Left Arrow */}
          {showLeftArrow && (
            <button
              onClick={() => scrollChips('left')}
              className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-30 h-8 w-8 rounded-full bg-white border border-gray-200 shadow-md items-center justify-center hover:bg-gray-50 transition-colors"
              aria-label="Scroll left"
            >
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
          )}
          
          {/* Right Arrow */}
          {showRightArrow && (
            <button
              onClick={() => scrollChips('right')}
              className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-30 h-8 w-8 rounded-full bg-white border border-gray-200 shadow-md items-center justify-center hover:bg-gray-50 transition-colors"
              aria-label="Scroll right"
            >
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          )}

          <div 
            ref={chipsContainerRef}
            className="overflow-x-auto scrollbar-hide px-2 md:px-4 pt-2 md:pt-3 pb-0"
            onScroll={updateArrowVisibility}
          >
            <div className="flex gap-1 md:gap-2">
              {quickPrompts.map((item, index) => (
                <button
                  key={index}
                  onClick={() => sendQuickPrompt(item.prompt)}
                  disabled={isLoading || hasReachedLimit}
                  className="flex-shrink-0 px-[6px] py-[6px] h-[18px] leading-[1px] md:px-[10px] md:py-[10px] md:h-[30px] md:leading-[2px] bg-gray-50 hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-full text-xs md:text-sm text-gray-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {item.display}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Input Bar */}
      <div className={`bg-white border-t fixed bottom-0 left-0 right-0 w-full mb-[60px] z-30 flex items-center justify-center transition-all duration-300 ${isAtBottom ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
        <div className="w-full max-w-2xl p-2 md:p-4">
          <form onSubmit={onSubmit} className="flex items-center gap-2">
          <input
            type="text"
            className={`flex-1 py-2 px-3 md:p-4 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 text-base text-gray-800 ${hasReachedLimit ? 'opacity-60 cursor-not-allowed' : ''}`}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={hasReachedLimit ? "You've reached the 3 free chats limit. You'll be directed to sign in or create a quick account to keep using SeekEatz for free." : "Ask AI to find meals, macros, or cravings..."}
            disabled={isLoading || hasReachedLimit}
            autoComplete="off"
          />
          <button 
            type="submit" 
            disabled={!inputText.trim() || isLoading || hasReachedLimit} 
            className={`flex-shrink-0 p-1.5 md:p-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${hasReachedLimit ? 'cursor-not-allowed' : ''}`}
          >
            <Send size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}
