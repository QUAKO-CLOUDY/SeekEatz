'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * TEMPORARY: Pre-launch lockdown — all visitors go to /waitlist.
 * TODO: After launch, restore the original auth-check logic that sends
 * authenticated users to /chat and new users to /get-started or /onboarding.
 */
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/waitlist');
  }, [router]);

  return null;
}
