"use client";

import { useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_CHECK_INTERVAL = 60 * 1000; // Check every minute
const LAST_ACTIVITY_KEY = 'seekEatz_lastActivity';

/**
 * Hook to track user activity and handle session timeout
 * Clears session-based state (chat, home meals) on timeout
 * Preserves persistent data (favorites, logged meals, profile)
 */
export function useSessionActivity(onTimeout?: () => void) {
  const pathname = usePathname();
  const timeoutCheckRef = useRef<NodeJS.Timeout | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  // Update ref when callback changes
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  // Update last activity time
  const updateActivity = useCallback(() => {
    if (typeof window !== 'undefined') {
      const now = Date.now();
      localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());
    }
  }, []);

  // Initialize activity on mount if not set
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
      if (!lastActivity) {
        // First time - set current time
        updateActivity();
      }
    }
  }, [updateActivity]);

  // Check for timeout and handle logout
  const checkTimeout = useCallback(async () => {
    if (typeof window === 'undefined') return;

    const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!lastActivity) {
      // No activity recorded, set current time
      updateActivity();
      return;
    }

    const lastActivityTime = parseInt(lastActivity, 10);
    const now = Date.now();
    const timeSinceActivity = now - lastActivityTime;

    if (timeSinceActivity >= SESSION_TIMEOUT_MS) {
      // Session expired - clear session data and logout
      console.log('Session timeout detected, clearing session data...');
      
      // Clear session-based UI state
      try {
        // Chat is now stored in sessionStorage
        window.sessionStorage.removeItem('seekeatz_chat_messages');
        window.sessionStorage.removeItem('seekeatz_chat_lastActivityAt');
      } catch (e) {
        console.error('Failed to clear chat sessionStorage on session timeout:', e);
      }
      localStorage.removeItem('seekeatz_recommended_meals');
      localStorage.removeItem('seekeatz_has_searched');
      localStorage.removeItem('seekeatz_last_search_params');
      localStorage.removeItem('seekeatz_pending_chat_message');
      
      // Clear last activity to prevent immediate re-check
      localStorage.removeItem(LAST_ACTIVITY_KEY);

      // Logout user
      const supabase = createClient();
      await supabase.auth.signOut();

      // Call timeout callback if provided
      if (onTimeoutRef.current) {
        onTimeoutRef.current();
      }
    }
  }, [updateActivity]);

  // Update activity on pathname change (navigation)
  useEffect(() => {
    updateActivity();
  }, [pathname, updateActivity]);

  // Set up periodic timeout checks
  useEffect(() => {
    // Initial check
    checkTimeout();

    // Check periodically
    timeoutCheckRef.current = setInterval(() => {
      checkTimeout();
    }, ACTIVITY_CHECK_INTERVAL);

    // Check when window becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkTimeout();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timeoutCheckRef.current) {
        clearInterval(timeoutCheckRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkTimeout]);

  // Return function to manually update activity (for button clicks, etc.)
  return { updateActivity };
}

