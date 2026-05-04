"use client";

import { Suspense, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { OnboardingFlow } from "@/app/components/OnboardingFlow";

function OnboardingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPostSignupFlow = searchParams.get("afterSignup") === "1";
  const routeToPlanSelection = useCallback(() => {
    router.replace("/upgrade?flow=onboarding&tutorial=1");
  }, [router]);
  const routeToCreateAccount = useCallback(() => {
    const redirectTo = encodeURIComponent("/upgrade?fromSignup=1");
    router.replace(`/auth/signup?redirectTo=${redirectTo}&switch=1`);
  }, [router]);
  const routeToAppTutorial = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("seekeatz_start_app_tutorial", "true");
      localStorage.removeItem("seekeatz_current_screen");
      localStorage.removeItem("seekeatz_nav_history");
    }
    router.replace("/chat");
  }, [router]);

  // Safety check: If authenticated user has already completed onboarding, redirect to settings
  // Only redirect authenticated users - signed-out users can always access onboarding
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Only check and redirect if user is authenticated
      if (!user) {
        // Signed-out users can access onboarding - no redirect
        return;
      }

      if (isPostSignupFlow) {
        return;
      }

      // In development, always allow onboarding (don't redirect)
      const isDev = process.env.NODE_ENV === "development";
      if (isDev) {
        return;
      }

      // Check if onboarding is already complete in Supabase
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("has_completed_onboarding")
          .eq("id", user.id)
          .single();

        if (!isDev && profile?.has_completed_onboarding) {
          routeToPlanSelection();
          return;
        }
      } catch {
        // Profile might not exist yet, or table might not exist
        // Check localStorage as fallback (only for authenticated users)
        if (typeof window !== "undefined") {
          const localStorageFlag = localStorage.getItem(`seekEatz_hasCompletedOnboarding_${user.id}`);
          const onboardingCompleted = localStorage.getItem("onboardingCompleted") === "true";

          if (!isDev && (localStorageFlag === "true" || onboardingCompleted)) {
            routeToPlanSelection();
            return;
          }
        }
      }
    };

    checkOnboardingStatus();
  }, [isPostSignupFlow, routeToPlanSelection]);

  const handleComplete = async () => {
    if (isPostSignupFlow) {
      routeToAppTutorial();
      return;
    }

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        routeToCreateAccount();
        return;
      }
    } catch {
      routeToCreateAccount();
      return;
    }

    routeToPlanSelection();
  };

  return (
    <div className="min-h-screen bg-background">
      <OnboardingFlow onComplete={handleComplete} initialStep={-1} />
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingPageContent />
    </Suspense>
  );
}
