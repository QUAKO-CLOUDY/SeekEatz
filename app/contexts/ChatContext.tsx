'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Meal } from '../types';
import { loadChatState, saveChatState, clearChatState, saveChatStateImmediate } from '@/lib/chatStorage';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meals?: Meal[];
  mealSearchContext?: {
    searchKey: string;
    nextOffset: number;
    hasMore: boolean;
    originalQuery?: string;
    filters?: { [key: string]: any };
  };
  isGateMessage?: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  visibleMealsCount: Record<string, number>;
  isLoading: boolean;
  lastActiveAt: number;
}

interface ChatContextValue extends ChatState {
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setVisibleMealsCount: (count: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;
  setIsLoading: (loading: boolean) => void;
  clearChat: () => void;
  updateActivity: () => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

const INACTIVITY_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutes
const INACTIVITY_CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds

export function ChatProvider({ children }: { children: React.ReactNode }) {
  // Initialize state from sessionStorage
  const [state, setState] = useState<ChatState>(() => {
    if (typeof window === 'undefined') {
      return {
        messages: [],
        visibleMealsCount: {},
        isLoading: false,
        lastActiveAt: Date.now(),
      };
    }

    const loaded = loadChatState();
    if (loaded) {
      // Check if state is expired
      const now = Date.now();
      if (now - loaded.lastActiveAt > INACTIVITY_TIMEOUT_MS) {
        // Expired - clear it
        clearChatState();
        return {
          messages: [],
          visibleMealsCount: {},
          isLoading: false,
          lastActiveAt: Date.now(),
        };
      }

      return {
        messages: loaded.messages,
        visibleMealsCount: loaded.visibleMealsCount,
        isLoading: false,
        lastActiveAt: loaded.lastActiveAt,
      };
    }

    return {
      messages: [],
      visibleMealsCount: {},
      isLoading: false,
      lastActiveAt: Date.now(),
    };
  });

  // Save state to sessionStorage whenever it changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    saveChatState({
      messages: state.messages,
      visibleMealsCount: state.visibleMealsCount,
      lastActiveAt: state.lastActiveAt,
    });
  }, [state.messages, state.visibleMealsCount, state.lastActiveAt]);

  // Activity tracking
  const updateActivity = useCallback(() => {
    setState(prev => ({
      ...prev,
      lastActiveAt: Date.now(),
    }));
  }, []);

  // Set up activity listeners
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const activityEvents: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    
    const handleActivity = () => {
      updateActivity();
    };

    // Throttle activity updates to avoid excessive state updates
    let throttleTimer: NodeJS.Timeout | null = null;
    const throttledHandleActivity = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        handleActivity();
        throttleTimer = null;
      }, 1000); // Update at most once per second
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, throttledHandleActivity, { passive: true });
    });

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, throttledHandleActivity);
      });
      if (throttleTimer) {
        clearTimeout(throttleTimer);
      }
    };
  }, [updateActivity]);

  // Inactivity check interval
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkInactivity = () => {
      setState(prev => {
        const now = Date.now();
        const timeSinceActivity = now - prev.lastActiveAt;

        if (timeSinceActivity > INACTIVITY_TIMEOUT_MS && prev.messages.length > 0) {
          // Clear chat due to inactivity
          clearChatState();
          return {
            messages: [],
            visibleMealsCount: {},
            isLoading: false,
            lastActiveAt: Date.now(),
          };
        }

        return prev;
      });
    };

    // Run check every 60 seconds
    const intervalId = window.setInterval(checkInactivity, INACTIVITY_CHECK_INTERVAL_MS);

    // Run initial check
    checkInactivity();

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  // State setters
  const setMessages = useCallback((messagesOrUpdater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setState(prev => ({
      ...prev,
      messages: typeof messagesOrUpdater === 'function' 
        ? messagesOrUpdater(prev.messages)
        : messagesOrUpdater,
    }));
    updateActivity();
  }, [updateActivity]);

  const setVisibleMealsCount = useCallback((countOrUpdater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
    setState(prev => ({
      ...prev,
      visibleMealsCount: typeof countOrUpdater === 'function'
        ? countOrUpdater(prev.visibleMealsCount)
        : countOrUpdater,
    }));
    updateActivity();
  }, [updateActivity]);

  const setIsLoading = useCallback((loading: boolean) => {
    setState(prev => ({
      ...prev,
      isLoading: loading,
    }));
  }, []);

  const clearChat = useCallback(() => {
    setState({
      messages: [],
      visibleMealsCount: {},
      isLoading: false,
      lastActiveAt: Date.now(),
    });
    clearChatState();
  }, []);

  const value: ChatContextValue = {
    ...state,
    setMessages,
    setVisibleMealsCount,
    setIsLoading,
    clearChat,
    updateActivity,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}

