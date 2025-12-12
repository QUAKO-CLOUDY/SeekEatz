"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Mic, Plus, Minus } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { MealCard } from "./MealCard";
import type { UserProfile, Meal } from "../types";
import { getMealImageUrl } from "@/lib/image-utils";
import { useSessionActivity } from "../hooks/useSessionActivity";

type Props = {
  userProfile: UserProfile;
  onMealSelect: (meal: Meal) => void;
  favoriteMeals?: string[];
  onToggleFavorite?: (mealId: string, meal?: Meal) => void;
};

type Message = {
  id: string;
  type: "user" | "ai";
  content: string;
  meals?: Meal[];
  timestamp: Date;
};

const quickPrompts = [
  "🍽️ Lunch under 600 calories",
  "💪 High protein breakfast",
  "🥑 Low carb dinner",
  "🌱 Vegan options",
];

const macroAdjustments = [
  { label: "More Protein", icon: Plus },
  { label: "Less Carbs", icon: Minus },
  { label: "Less Fat", icon: Minus },
  { label: "Higher Cal", icon: Plus },
];

export function AIChat({ userProfile, onMealSelect, favoriteMeals = [], onToggleFavorite }: Props) {
  const userName = userProfile?.name || "Friend";
  const { updateActivity } = useSessionActivity();

  // Load messages from localStorage on mount
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('seekeatz_chat_messages');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Convert timestamp strings back to Date objects
          return parsed.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          }));
        } catch (e) {
          console.error('Failed to parse saved messages:', e);
        }
      }
    }
    return [
      {
        id: "1",
        type: "ai" as const,
        content:
          "Your personal meal finder is online. Tell me your calories, macros, or cravings and I'll do the rest.",
        timestamp: new Date(),
      },
    ];
  });
  
  const [inputValue, setInputValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Initialize visible meal counts from persisted messages (default to 5 for each message with meals)
  const [visibleMealCounts, setVisibleMealCounts] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('seekeatz_chat_messages');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const counts: Record<string, number> = {};
          parsed.forEach((msg: any) => {
            if (msg.meals && Array.isArray(msg.meals) && msg.meals.length > 5) {
              counts[msg.id] = 5; // Default to 5 for persisted messages too
            }
          });
          return counts;
        } catch (e) {
          // Ignore parse errors, will default to empty
        }
      }
    }
    return {};
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Check for pending chat message from quick chat buttons on home screen
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const pendingMessage = localStorage.getItem('seekeatz_pending_chat_message');
      if (pendingMessage) {
        localStorage.removeItem('seekeatz_pending_chat_message');
        // Small delay to ensure component is fully mounted and handleSendMessage is available
        const timer = setTimeout(() => {
          handleSendMessage(pendingMessage);
        }, 100);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      // Only persist if not the initial empty message
      if (messages.length > 1 || messages[0].id !== "1") {
        localStorage.setItem('seekeatz_chat_messages', JSON.stringify(messages));
      }
    }
  }, [messages]);

  // Convert API result to Meal type
  const convertToMeal = (item: any): Meal => {
    // Determine category from item data
    const category = item.category === 'Grocery' || item.category === 'Hot Bar' 
      ? 'grocery' as const 
      : 'restaurant' as const;

    const mealName = item.item_name || item.name || 'Unknown Item';
    const restaurantName = item.restaurant_name || 'Unknown Restaurant';
    
    // Use getMealImageUrl to ensure we always have a real food image
    const imageUrl = getMealImageUrl(
      mealName,
      restaurantName,
      item.image_url || item.image
    );

    // Handle fats - check multiple possible field names and nested structures
    const fats = item.fat_g ?? item.fats ?? item.fat ?? 
                 (item.nutrition_info?.fat_g) ?? 
                 (item.nutrition_info?.fats) ?? 
                 (item.nutrition_info?.fat) ?? 0;

    return {
      id: item.id || `meal-${Date.now()}-${Math.random()}`,
      name: mealName,
      restaurant: restaurantName,
      calories: item.calories || 0,
      protein: item.protein_g || 0,
      carbs: item.carbs_g || 0,
      fats: typeof fats === 'number' ? fats : 0,
      image: imageUrl,
      price: item.price || null, // Keep null for proper handling
      description: item.description || '',
      category: category,
      dietary_tags: item.dietary_tags || item.tags || [],
      rating: item.rating || undefined,
      distance: item.distance || undefined,
    };
  };

  const searchMeals = async (query: string, returnRawItems = false): Promise<Meal[] | { meals: Meal[], rawItems: any[] }> => {
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      
      const data = await res.json();
      
      // Normalize API response to always be an array
      let normalizedResults: any[] = [];
      
      if (Array.isArray(data)) {
        normalizedResults = data;
      } else if (data && typeof data === 'object' && Array.isArray(data.results)) {
        normalizedResults = data.results;
      }
      
      // Convert to Meal type
      const meals = normalizedResults.map(convertToMeal);
      
      // Return both if raw items are needed for filtering
      if (returnRawItems) {
        return { meals, rawItems: normalizedResults };
      }
      
      return meals;
    } catch (error) {
      console.error('Search failed:', error);
      return returnRawItems ? { meals: [], rawItems: [] } : [];
    }
  };

  // Helper to check if a meal is a full meal (not a single ingredient/item)
  const isFullMeal = (meal: Meal, item?: any): boolean => {
    // Check if category indicates a full meal
    if (item?.category) {
      const category = item.category.toLowerCase();
      // Signature Bowls are always full meals
      if (category.includes('signature') || category.includes('bowl')) {
        return true;
      }
      // Exclude single items: Protein, Base, Topping, Dressing, Side, Ingredient
      const singleItemCategories = ['protein', 'base', 'topping', 'dressing', 'side', 'ingredient'];
      if (singleItemCategories.some(cat => category.includes(cat))) {
        return false;
      }
    }
    
    // If calories are very low (< 150), it's likely a single ingredient/side
    if (meal.calories < 150) {
      return false;
    }
    
    // Default to true if we can't determine
    return true;
  };

  // Get user location if available
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

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
          console.warn('Geolocation error:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // Cache for 5 minutes
        }
      );
    }
  }, []);

  // Get meal history from localStorage
  const getMealHistory = (): any[] => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('seekeatz_logged_meals');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse meal history:', e);
        }
      }
    }
    return [];
  };

  const generateAIResponse = async (
    userMessage: string,
    conversationHistory: Message[] = []
  ): Promise<{ content: string; meals?: Meal[] }> => {
    try {
      // Build conversation history for context
      const historyMessages = conversationHistory.map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

      // Add current user message
      historyMessages.push({
        role: 'user',
        content: userMessage,
      });

      // Get meal history
      const mealHistory = getMealHistory();

      // Call the reasoning engine API
      const response = await fetch('/api/chat/reasoning/structured', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyMessages,
          userProfile: userProfile,
          mealHistory: mealHistory,
          favoriteMeals: favoriteMeals,
          location: userLocation,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        content: data.content || "I couldn't find exact matches. Try searching with different keywords.",
        meals: data.meals || [],
      };
    } catch (error) {
      console.error('Reasoning engine error:', error);
      
      // Fallback to original search method
      const searchResult = await searchMeals(userMessage, false);
      const allMeals = Array.isArray(searchResult) ? searchResult : [];
      
      return {
        content: allMeals.length > 0
          ? `I found ${allMeals.length} option${allMeals.length !== 1 ? "s" : ""} for you!`
          : "I couldn't find exact matches in the database. Try searching with different keywords or check back later as we add more meals.",
        meals: allMeals,
      };
    }
  };

  const handleSendMessage = async (text?: string) => {
    const messageText = text || inputValue.trim();
    if (!messageText) return;

    updateActivity(); // Update activity on chat message

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    // Add a loading message
    const loadingMessageId = (Date.now() + 1).toString();
    const loadingMessage: Message = {
      id: loadingMessageId,
      type: "ai",
      content: "Searching for meals...",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, loadingMessage]);

    try {
      // Get conversation history for context (last 10 messages)
      const conversationHistory = messages.slice(-10);
      const { content, meals } = await generateAIResponse(messageText, conversationHistory);
      
      // Remove loading message and add real response
      const newMessageId = (Date.now() + 2).toString();
      setMessages((prev) => {
        const filtered = prev.filter((msg) => msg.id !== loadingMessageId);
        return [
          ...filtered,
          {
            id: newMessageId,
            type: "ai" as const,
            content,
            meals,
            timestamp: new Date(),
          },
        ];
      });
      
      // Initialize visible count for this message to 5 (or total if less)
      if (meals && meals.length > 0) {
        setVisibleMealCounts((prev) => ({
          ...prev,
          [newMessageId]: Math.min(5, meals.length),
        }));
      }
    } catch (error) {
      console.error('Error generating AI response:', error);
      // Remove loading message and add error response
      setMessages((prev) => {
        const filtered = prev.filter((msg) => msg.id !== loadingMessageId);
        return [
          ...filtered,
          {
            id: (Date.now() + 2).toString(),
            type: "ai" as const,
            content: "Sorry, I encountered an error while searching. Please try again.",
            timestamp: new Date(),
          },
        ];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleVoiceInput = () => {
    setIsListening((prev) => !prev);
  };

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-background text-foreground">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-700 dark:from-cyan-600 dark:via-blue-600 dark:to-indigo-700 text-white p-5 shadow-lg shadow-cyan-500/20">
        <div className="flex items-center gap-3">
          <div className="size-12 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/50">
            <Sparkles className="size-6 text-white" />
          </div>
          <div>
            <h1 className="text-white font-semibold text-lg">AI Meal Assistant</h1>
            <p className="text-cyan-100 text-sm">
              The easiest way to seek great eatz.
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 pt-4 pb-6 pb-safe space-y-3 sm:space-y-4">
        {messages.map((message) => (
          <div key={message.id}>
            <div
              className={`flex ${
                message.type === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[65%] rounded-2xl px-4 py-3 ${
                  message.type === "user"
                    ? "bg-gradient-to-r from-teal-500 to-blue-500 text-white ml-auto shadow-lg shadow-teal-500/30"
                    : "bg-gradient-to-br from-card to-muted border border-border text-foreground"
                }`}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>
                <p className="text-[10px] mt-1 text-foreground/60">
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            {/* AI Meal Suggestions - Using MealCard component like HomeScreen */}
            {message.meals && message.meals.length > 0 && (() => {
              // Default to 5 for new messages, or use saved count
              const defaultCount = message.meals.length > 5 ? 5 : message.meals.length;
              const visibleCount = visibleMealCounts[message.id] ?? defaultCount;
              const visibleMeals = message.meals.slice(0, visibleCount);
              const hasMore = message.meals.length > visibleCount;
              
              return (
              <div className="mt-2 space-y-3">
                {visibleMeals.map((meal) => (
                  <MealCard
                    key={meal.id}
                    meal={meal}
                    isFavorite={favoriteMeals.includes(meal.id)}
                    onClick={() => {
                      updateActivity(); // Update activity on meal selection
                      onMealSelect(meal);
                    }}
                    onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(meal.id, meal) : undefined}
                    compact={true}
                  />
                ))}
                
                {/* Load More Button */}
                {hasMore && (
                  <div className="flex justify-center pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setVisibleMealCounts((prev) => ({
                          ...prev,
                          [message.id]: message.meals!.length,
                        }));
                      }}
                      className="rounded-full px-4 py-1.5 h-auto text-xs bg-muted/50 border-border text-foreground hover:border-cyan-500 hover:text-cyan-500 hover:bg-card transition-all"
                    >
                      Load more ({message.meals!.length - visibleCount} more)
                    </Button>
                  </div>
                )}
              </div>
              );
            })()}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts & Macro adjustments - Combined and compact */}
      <div className="px-3 py-1.5 bg-background border-t border-border">
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {quickPrompts.map((prompt) => (
            <Button
              key={prompt}
              variant="outline"
              size="sm"
              className="rounded-full h-6 text-[10px] whitespace-nowrap bg-muted border-border text-foreground hover:border-cyan-500 hover:text-cyan-300 hover:bg-card transition-all px-2.5 shrink-0"
              onClick={() => {
                updateActivity(); // Update activity on quick prompt click
                handleSendMessage(prompt);
              }}
            >
              {prompt}
            </Button>
          ))}
          {macroAdjustments.map((adjustment, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              className="rounded-full h-6 text-[10px] whitespace-nowrap bg-muted border-border text-foreground hover:border-cyan-500 hover:text-cyan-300 hover:bg-card transition-all px-2.5 shrink-0"
              onClick={() => {
                updateActivity(); // Update activity on macro adjustment click
                handleSendMessage(
                  `Show me meals with ${adjustment.label.toLowerCase()}`
                );
              }}
            >
              <adjustment.icon className="size-2.5 mr-1" />
              {adjustment.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 pb-safe bg-gradient-to-r from-cyan-900/10 dark:from-cyan-900/20 via-background to-blue-900/10 dark:to-blue-900/20 border-t border-border" style={{ paddingBottom: `calc(1rem + env(safe-area-inset-bottom, 0px) + 80px)` }}>
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask AI to find meals, macros, or cravings..."
              className="rounded-full pr-10 py-5 bg-muted/90 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-cyan-500/40 focus-visible:border-cyan-500"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleVoiceInput}
              className={`absolute right-1 top-1/2 -translate-y-1/2 rounded-full h-8 w-8 ${
                isListening
                  ? "bg-pink-500/20 text-pink-400"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mic className="size-4" />
            </Button>
          </div>
          <Button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim() || isLoading}
            className="rounded-full size-10 bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-md shadow-cyan-500/40 shrink-0 disabled:opacity-50"
          >
            {isLoading ? (
              <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="size-4 text-white" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
