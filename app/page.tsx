'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Only redirect authenticated users with completed onboarding
    // This only runs when landing on root /, not when manually visiting /get-started
    const checkReturningUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // Only redirect if user is authenticated
      if (user) {
        // Check localStorage flags for completed onboarding (only for authenticated users)
        const onboardingCompleted = 
          localStorage.getItem('onboardingCompleted') === 'true' ||
          localStorage.getItem('hasCompletedOnboarding') === 'true' ||
          localStorage.getItem('macroMatch_completedOnboarding') === 'true';

        if (onboardingCompleted) {
          // Authenticated user with completed onboarding - redirect to chat
          router.replace('/chat');
          return;
        }
      }

      // Default: redirect to get-started (for new users or signed-out users)
      router.replace('/get-started');
    };

    checkReturningUser();
  }, [router]);

  // Show nothing while checking (redirect will happen quickly)
  return null;
}
