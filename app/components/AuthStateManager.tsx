'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useChat } from '@/app/contexts/ChatContext';
import { clearAllUserScopedItems } from '@/lib/storage';

/**
 * Central auth state manager that resets contexts on user change
 * Prevents cross-account data bleed
 */
export function AuthStateManager({ children }: { children: React.ReactNode }) {
  const { clearChat } = useChat();
  const prevUserIdRef = useRef<string | null>(null);
  const isSwitchingRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    // Initial check
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        prevUserIdRef.current = user.id;
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUserId = session?.user?.id || null;
      const prevUserId = prevUserIdRef.current;

      // Detect user change
      if (prevUserId !== currentUserId) {
        isSwitchingRef.current = true;

        // On logout: clear chat and non-scoped cached keys
        if (event === 'SIGNED_OUT' || !currentUserId) {
          clearChat();

          // Clear non-scoped sessionStorage keys (guest flags)
          if (typeof window !== 'undefined') {
            try {
              sessionStorage.removeItem('seekeatz_guest_chat_messages');
              sessionStorage.removeItem('seekeatz_guest_session_id');
              sessionStorage.removeItem('seekeatz_guest_activity');
            } catch (e) {
              console.warn('Failed to clear sessionStorage:', e);
            }
          }

          // Clear previous user's scoped items if we have their ID
          if (prevUserId) {
            clearAllUserScopedItems(prevUserId);
          }
        }

        // On login or user change: clear previous user's contexts + storage
        if (event === 'SIGNED_IN' || (currentUserId && prevUserId && prevUserId !== currentUserId)) {
          clearChat();

          // Clear previous user's scoped items
          if (prevUserId) {
            clearAllUserScopedItems(prevUserId);
          }
        }

        // Update ref
        prevUserIdRef.current = currentUserId;

        setTimeout(() => {
          isSwitchingRef.current = false;
        }, 100);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [clearChat]);

  return <>{children}</>;
}
