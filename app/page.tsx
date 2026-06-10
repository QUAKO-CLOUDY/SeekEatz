'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { LaunchSplash } from './components/LaunchSplash';
import { resolveSigninDestination } from '@/lib/post-auth-routing';

const SPLASH_MIN_DURATION_MS = 3650;
const SPLASH_SEEN_KEY = 'seekeatz_has_seen_launch_splash_v1';

function readOnboardingCompleteFromLocal(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    localStorage.getItem('onboardingCompleted') === 'true' ||
    localStorage.getItem('hasCompletedOnboarding') === 'true' ||
    localStorage.getItem('onboarded') === 'true'
  );
}

function persistOnboardingComplete(userId?: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('onboardingCompleted', 'true');
  localStorage.setItem('hasCompletedOnboarding', 'true');
  localStorage.setItem('onboarded', 'true');
  if (userId) {
    localStorage.setItem(`seekEatz_hasCompletedOnboarding_${userId}`, 'true');
  }
}


function getInitialStatusText(): string {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('previewSplash') === '1') {
    return 'Splash preview mode';
  }

  return 'Loading your experience';
}
export default function RootPage() {
  const router = useRouter();
  const [statusText, setStatusText] = useState(getInitialStatusText);

  useEffect(() => {
    let isActive = true;

    const isSplashPreview =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('previewSplash') === '1';

    if (isSplashPreview) {
      return () => {
        isActive = false;
      };
    }

    const resolveLaunchRoute = async () => {
      const startedAt = Date.now();
      let destination = '/auth/signin';

      try {
        const supabase = createClient();
        const justLoggedOut = typeof window !== 'undefined' && window.location.search.includes('loggedOut=1');
        const hasSeenSplash = typeof window !== 'undefined' && localStorage.getItem(SPLASH_SEEN_KEY) === 'true';

        setStatusText('Checking your account');
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user && !justLoggedOut) {
          persistOnboardingComplete(user.id);
          destination = await resolveSigninDestination({
            fallbackRedirect: '/chat',
            isReturningUser: true,
          });
        } else {
          const hasCompletedOnboarding = readOnboardingCompleteFromLocal();

          if (!hasSeenSplash && !hasCompletedOnboarding) {
            destination = '/onboarding';
          } else if (!hasCompletedOnboarding) {
            destination = '/onboarding';
          } else {
            destination = '/auth/signin';
          }
        }

        if (typeof window !== 'undefined') {
          localStorage.setItem(SPLASH_SEEN_KEY, 'true');
        }
      } catch {
        destination = '/auth/signin';
      }

      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, SPLASH_MIN_DURATION_MS - elapsed);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }

      if (!isActive) return;

      setStatusText('Opening SeekEatz');
      router.replace(destination);
    };

    resolveLaunchRoute();

    return () => {
      isActive = false;
    };
  }, [router]);

  return <LaunchSplash statusText={statusText} />;
}

