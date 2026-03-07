'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import LandingPage from './components/LandingPage';

/**
 * Root page: checks if the user is already signed in and has completed onboarding.
 * Returning authenticated users go directly to /chat.
 * Everyone else sees the landing page.
 */
export default function RootPage() {
  const router = useRouter();
  const [showLanding, setShowLanding] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkReturningUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const onboardingCompleted =
          localStorage.getItem('onboardingCompleted') === 'true' ||
          localStorage.getItem('hasCompletedOnboarding') === 'true';

        if (onboardingCompleted) {
          router.replace('/chat');
          return;
        }
      }

      // Not authenticated or hasn't completed onboarding → show landing page
      setShowLanding(true);
      setChecking(false);
    };

    checkReturningUser();
  }, [router]);

  if (checking && !showLanding) return null;

  return <LandingPage />;
}
