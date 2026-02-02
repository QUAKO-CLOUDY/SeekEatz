'use client';

import { Send, Copy, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MealCard } from "./MealCard";
import type { Meal } from "../types";
import { copyToClipboard } from "@/lib/clipboard-utils";
import { createClient } from "@/utils/supabase/client";
import { useTheme } from "../contexts/ThemeContext";
import { useChat } from "../contexts/ChatContext";
import { canUseFeature, incrementUsage, hasReachedLimit as checkHasReachedLimit } from "@/lib/usage-gate";
import { getGuestSessionId, getGuestChatMessages, saveGuestChatMessages, touchGuestActivity, getCurrentSessionId, clearGuestSession, clearGuestSessionFull } from "@/lib/guest-session";

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

const CHAT_SCROLL_POSITION_KEY = 'seekeatz_chat_scroll_position';

export default function AIChat({ userId, userProfile, favoriteMeals, onMealSelect, onToggleFavorite, onSignInRequest }: AIChatProps) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { messages, visibleMealsCount, isLoading, setMessages, setVisibleMealsCount, setIsLoading, clearChat, updateActivity } = useChat();
  // Check if user is signed in (userId prop or check session)
  const [isSignedIn, setIsSignedIn] = useState(!!userId);
  const [isLimitReached, setIsLimitReached] = useState(false);
  
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
    const checkAuth = async () => {
      try {
        const supabase = createClient();
        // Retry logic for auth check (helps with timing after signup)
        let retries = 0;
        let user = null;
        
        while (retries < 5 && !user) {
          const { data: { user: fetchedUser }, error } = await supabase.auth.getUser();
          // AuthSessionMissingError is expected when signed out - treat as not signed in
          if (error && (error.message?.includes('Auth session missing') || error.name === 'AuthSessionMissingError')) {
            setIsSignedIn(false);
            setIsLimitReached(false); // Clear limit when no user
            break;
          } else if (fetchedUser) {
            user = fetchedUser;
            setIsSignedIn(true);
            setIsLimitReached(false); // Clear limit when user is authenticated
            // Remove any gate messages
            setMessages(prev => prev.filter(msg => !msg.isGateMessage));
            break;
          }
          
          // If no user and not a session missing error, retry after a short delay
          if (!fetchedUser && retries < 4) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          retries++;
        }
        
        // If still no user after retries, set to false
        if (!user) {
          setIsSignedIn(false);
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
    };
  }, [currentSessionId, setMessages]);
  // Local state - chat state is managed by ChatContext
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const chipsContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
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

  // Helper to record chat activity timestamps (alias for touchGuestActivity)
  const recordActivity = useCallback(() => {
    touchGuestActivity();
    updateActivity(); // Also update context activity
  }, [updateActivity]);


  // Ensure chat session is owned by authenticated user
  const ensureChatSessionOwned = useCallback(async (userId: string, sessionId: string) => {
    if (!sessionId) return;
    
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
        console.error('Failed to claim chat session:', sessionError);
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
            console.error('Failed to migrate guest messages:', messagesError);
          } else {
            // Clear guest messages from sessionStorage after successful migration
            saveGuestChatMessages([]);
          }
        }
      }
    } catch (error) {
      console.error('Error claiming chat session:', error);
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
  
  // Check trial limit on mount and when auth state changes
  useEffect(() => {
    const checkLimit = async () => {
      if (isSignedIn) {
        // User is signed in - remove all restrictions and gate messages
        setIsLimitReached(false);
        // Remove any gate messages that might be in the chat
        setMessages(prev => prev.filter(msg => !msg.isGateMessage));
        return;
      }
      
      // User is not signed in - check trial limit
      const limitReached = await checkHasReachedLimit();
      setIsLimitReached(limitReached);
      
      // Show gate message if limit reached and not already shown
      if (limitReached) {
        setMessages(prev => {
          const hasGateMessage = prev.some(msg => msg.isGateMessage);
          if (!hasGateMessage) {
            const gateMessage: ChatMessage = {
              id: `assistant-gate-${Date.now()}`,
              role: 'assistant',
              content: "You have ran out of your 3 free trial uses, please create an account to continue using the app for free.",
              isGateMessage: true
            };
            return [...prev, gateMessage];
          }
          return prev;
        });
      } else {
        // Limit not reached - remove any existing gate messages
        setMessages(prev => prev.filter(msg => !msg.isGateMessage));
      }
    };
    
    checkLimit();
  }, [isSignedIn, setMessages]);

  // Log to Supabase (only for authenticated users)
  const logChatMessage = useCallback(async (role: 'user' | 'assistant', content: string, meals?: any[], mealSearchContext?: any) => {
    if (!isSignedIn || !userId || !currentSessionId) return;
    
    try {
      // Ensure session is owned
      await ensureChatSessionOwned(userId, currentSessionId);
      
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
        console.error('Failed to log chat message to Supabase:', error);
      } else {
        // Update chat_sessions updated_at timestamp
        await supabase
          .from('chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('session_id', currentSessionId);
      }
    } catch (e) {
      console.error('Error logging chat message:', e);
    }
  }, [isSignedIn, userId, currentSessionId, ensureChatSessionOwned]);

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


  // Send message function
  const sendMessage = async (messageText: string) => {
    const trimmedText = messageText.trim();
    if (!trimmedText || isLoading) {
      return;
    }

    // If user is signed in, skip gate check entirely (unlimited access)
    if (!isSignedIn) {
      // Check if user can use the feature (gate check BEFORE sending)
      const canUse = await canUseFeature('chat');
      if (!canUse) {
        // Limit reached - show gate message if not already shown
        setIsLimitReached(true);
        setMessages(prev => {
          const hasGateMessage = prev.some(msg => msg.isGateMessage);
          if (!hasGateMessage) {
            const gateMessage: ChatMessage = {
              id: `assistant-gate-${Date.now()}`,
              role: 'assistant',
              content: "You have ran out of your 3 free trial uses, please create an account to continue using the app for free.",
              isGateMessage: true
            };
            return [...prev, gateMessage];
          }
          return prev;
        });
        setTimeout(() => scrollToBottom(), 100);
        return;
      }
    }

    // Touch activity when user sends a message
    touchGuestActivity();

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

      // Handle errors first - always read and log raw response body as text
      if (!response.ok) {
        // Always read response body as text first (before any parsing)
        let rawResponseText = '';
        try {
          rawResponseText = await response.text();
          // Log the raw response text immediately
          console.error(`[AIChat] /api/chat failed with status ${response.status}:`, rawResponseText || '(empty response body)');
        } catch (readError) {
          console.error('[AIChat] Failed to read error response body:', readError);
          rawResponseText = '(failed to read response body)';
        }
        
        // Default error message
        let errorMessage = `Error ${response.status}: ${response.statusText}`;
        let serverMessage = '';
        
        // Try to parse JSON error only after logging raw text
        if (rawResponseText && rawResponseText !== '(failed to read response body)') {
          try {
            const errorJson = JSON.parse(rawResponseText);
            // Use server's message field if available, otherwise fall back to answer or other fields
            serverMessage = errorJson.message || errorJson.answer || errorJson.error || '';
            errorMessage = serverMessage || errorJson.details || errorMessage;
            
            // Log parsed error JSON for debugging
            console.error('[AIChat] Parsed error JSON:', errorJson);
          } catch (parseError) {
            // Not JSON, use raw text if available
            if (rawResponseText.trim()) {
              errorMessage = rawResponseText.substring(0, 200);
              console.error('[AIChat] Error response is not JSON, using raw text:', rawResponseText.substring(0, 500));
            } else {
              console.error('[AIChat] Error response body is empty or unreadable');
            }
          }
        } else {
          console.error('[AIChat] Error response body could not be read');
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
              image: item.image_url || '/placeholder-food.jpg',
              description: item.description || '',
              category: item.category || '',
              dietary_tags: item.dietary_tags || [],
              price: item.price || null,
            }));
            
            if (parsedMeals.length > 0) {
              console.log('[AIChat] First meal from /api/chat:', parsedMeals[0]);
            }
            
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
              summaryLine = serverSummary || generateSummaryLine(trimmedText, parsedMeals.length);
            }
            
            const assistantMessage: ChatMessage = {
              id: assistantMessageId,
              role: 'assistant',
              content: summaryLine,
              meals: parsedMeals,
              mealSearchContext
            };
            
            setMessages(prev => [...prev, assistantMessage]);
            
            // Increment usage for guest users (only on successful response)
            if (!isSignedIn) {
              const newCount = await incrementUsage('chat');
              // Check if limit is now reached and update state immediately
              if (newCount >= 3) {
                setIsLimitReached(true);
                // Immediately show gate message after the response
                setMessages(prev => {
                  const hasGateMessage = prev.some(msg => msg.isGateMessage);
                  if (!hasGateMessage) {
                    const gateMessage: ChatMessage = {
                      id: `assistant-gate-${Date.now()}`,
                      role: 'assistant',
                      content: "You have ran out of your 3 free trial uses, please create an account to continue using the app for free.",
                      isGateMessage: true
                    };
                    return [...prev, gateMessage];
                  }
                  return prev;
                });
                // Scroll to bottom to show gate message
                setTimeout(() => scrollToBottom(), 100);
              }
            }
            
            // Log to Supabase (for authenticated users)
            if (isSignedIn) {
              await logChatMessage('assistant', summaryLine, parsedMeals, mealSearchContext);
              await logUsageEvent('chat_response', { 
                messageCount: parsedMeals.length,
                hasMeals: true 
              });
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
            
            setMessages(prev => [...prev, assistantMessage]);
            
            // Increment usage for guest users (only on successful response)
            if (!isSignedIn) {
              const newCount = await incrementUsage('chat');
              // Check if limit is now reached and update state immediately
              if (newCount >= 3) {
                setIsLimitReached(true);
                // Immediately show gate message after the response
                setMessages(prev => {
                  const hasGateMessage = prev.some(msg => msg.isGateMessage);
                  if (!hasGateMessage) {
                    const gateMessage: ChatMessage = {
                      id: `assistant-gate-${Date.now()}`,
                      role: 'assistant',
                      content: "You have ran out of your 3 free trial uses, please create an account to continue using the app for free.",
                      isGateMessage: true
                    };
                    return [...prev, gateMessage];
                  }
                  return prev;
                });
                // Scroll to bottom to show gate message
                setTimeout(() => scrollToBottom(), 100);
              }
            }
            
            // Log to Supabase (for authenticated users)
            if (isSignedIn) {
              await logChatMessage('assistant', textContent);
              await logUsageEvent('chat_response', { hasMeals: false });
            }
            
            return;
          }
          
          // Unknown JSON response format
          console.error('[AIChat] Unknown JSON response format:', jsonData);
          console.error('[AIChat] Raw response text was:', rawResponseText.substring(0, 500));
          setError('Unexpected response format from server');
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
      const newMeals: Meal[] = searchData.meals.map((item: any) => ({
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

      // Append new meals to existing ones
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId && msg.meals) {
          const updatedMeals = [...msg.meals, ...newMeals];
          
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
  const quickPrompts = [
    { display: "🔥 Meal under 1000 calories", prompt: "Find me a meal under 1000 calories" },
    { display: "🌅 Breakfast", prompt: "Find me breakfast" },
    { display: "🥗 Low carb meal", prompt: "Find me a low carb meal" },
    { display: "🫒 Low fat meal", prompt: "Find me a low fat meal" },
    { display: "🍽️ Find me lunch", prompt: "Find me lunch" },
    { display: "🍴 Find me dinner", prompt: "Find me dinner" }
  ];

  return (
    <div className={`flex flex-col h-full relative ${isDark ? 'bg-gray-950' : 'bg-gray-50'}`}>
      <div className={`p-4 shadow-sm border-b sticky top-0 z-10 ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
        <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
          SeekEatz <span className={`text-xs px-2 py-1 rounded-full align-middle ${isDark ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-600'}`}>Beta</span>
        </h1>
          </div>

      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 pb-[220px]"
      >
        {messages.map((m) => {
          return (
            <div key={m.id} className="mb-4" data-message-id={m.id}>
              {/* Message Bubble */}
              <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} mb-2`}>
                <div className={`${m.role === 'user' ? 'max-w-[85%]' : 'max-w-[75%]'} rounded-2xl ${m.role === 'user' ? 'p-4' : 'p-3'} shadow-sm ${
                    m.role === 'user' 
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-br-none' 
                      : isDark
                        ? 'bg-gray-800 text-gray-100 border border-gray-700 rounded-bl-none'
                        : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                  }`}>
                  <div className={`prose prose-sm max-w-none ${m.role === 'user' ? 'text-white' : isDark ? 'text-gray-100' : 'text-gray-800'}`}>
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
              
              {/* Gate Message Buttons (for free chat limit) - GUEST GATING BYPASS: Never show for authenticated users */}
              {m.role === 'assistant' && m.isGateMessage && !isSignedIn && (
                <div className="flex flex-col gap-2 justify-start mb-4">
                  <button
                    onClick={() => {
                      // Clear redirect timer if user clicks button
                      if ((window as any).__seekeatz_redirectTimer) {
                        clearTimeout((window as any).__seekeatz_redirectTimer);
                        delete (window as any).__seekeatz_redirectTimer;
                      }
                      // Set flag to indicate signup is from chat gate (to skip onboarding)
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('seekeatz_signup_from_chat_gate', 'true');
                      }
                      router.push('/auth/signup');
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm text-center"
                  >
                    Create account to continue
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
                    className={`px-4 py-2 border rounded-lg text-sm font-medium transition-all text-center ${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-200' : 'bg-white border-gray-300 hover:bg-gray-50 text-gray-700'}`}
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
             <div className={`border rounded-2xl p-4 shadow-sm text-sm flex items-center gap-2 ${isDark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-500'}`}>
                <div className={`animate-spin h-4 w-4 border-2 border-t-transparent rounded-full ${isDark ? 'border-blue-400' : 'border-blue-600'}`}></div>
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
      <div className={`fixed bottom-[125px] md:bottom-[152px] left-0 right-0 w-full z-20 pb-2 md:pb-3 transition-all duration-300 ${isDark ? 'bg-gray-900' : 'bg-white'} ${isAtBottom ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
        <div className="relative w-full px-4 md:px-6">
          {/* Left Arrow */}
          {showLeftArrow && (
            <button
              onClick={() => scrollChips('left')}
              className={`hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-30 h-8 w-8 rounded-full shadow-md items-center justify-center transition-colors ${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
              aria-label="Scroll left"
            >
              <ChevronLeft size={18} className={isDark ? 'text-gray-300' : 'text-gray-600'} />
            </button>
          )}
          
          {/* Right Arrow */}
          {showRightArrow && (
            <button
              onClick={() => scrollChips('right')}
              className={`hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-30 h-8 w-8 rounded-full shadow-md items-center justify-center transition-colors ${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
              aria-label="Scroll right"
            >
              <ChevronRight size={18} className={isDark ? 'text-gray-300' : 'text-gray-600'} />
            </button>
          )}

          <div 
            ref={chipsContainerRef}
            className="overflow-x-auto scrollbar-hide px-12 md:px-16 pt-2 md:pt-3"
            onScroll={updateArrowVisibility}
          >
            <div className="flex gap-1 md:gap-2 justify-center">
              {quickPrompts.map((item, index) => (
                <button
                  key={index}
                  onClick={() => sendQuickPrompt(item.prompt)}
                  disabled={isLoading || (isLimitReached && !isSignedIn)}
                  className={`flex-shrink-0 px-[6px] py-[6px] h-[18px] leading-[1px] md:px-[10px] md:py-[10px] md:h-[30px] md:leading-[2px] border rounded-full text-xs md:text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${isDark ? 'bg-gray-800 hover:bg-gray-700 active:bg-gray-600 border-gray-700 text-gray-200' : 'bg-gray-50 hover:bg-gray-100 active:bg-gray-200 border-gray-200 text-gray-700'}`}
                >
                  {item.display}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Input Bar */}
      <div className={`border-t fixed bottom-0 left-0 right-0 w-full mb-[60px] z-30 flex items-center justify-center transition-all duration-300 ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} ${isAtBottom ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
        <div className="w-full max-w-2xl p-2 md:p-4">
          <form onSubmit={onSubmit} className="flex items-center gap-2">
            <input
              type="text"
              className={`flex-1 py-2 px-3 md:p-4 rounded-xl focus:outline-none focus:ring-2 text-base ${isDark ? 'bg-gray-800 text-gray-100 placeholder:text-gray-500 focus:ring-blue-500' : 'bg-gray-100 text-gray-800 placeholder:text-gray-500 focus:ring-blue-600'} ${isLimitReached && !isSignedIn ? 'opacity-60 cursor-not-allowed' : ''}`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={isLimitReached && !isSignedIn ? "You've used your 3 free chats. Create an account to continue." : "Ask AI to find meals, macros, or cravings..."}
              disabled={isLoading || (isLimitReached && !isSignedIn)}
              autoComplete="off"
            />
            <button 
              type="submit" 
              disabled={!inputText.trim() || isLoading || (isLimitReached && !isSignedIn)} 
              className={`flex-shrink-0 p-1.5 md:p-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${isLimitReached && !isSignedIn ? 'cursor-not-allowed' : ''}`}
            >
              <Send size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
