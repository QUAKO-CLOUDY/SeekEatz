"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { OnboardingFlow } from "@/app/components/OnboardingFlow";

export default function OnboardingPage() {
  const router = useRouter();

  // Safety check: If authenticated user has already completed onboarding, redirect to chat
  // Only redirect authenticated users - signed-out users can always access onboarding
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // Only check and redirect if user is authenticated
      if (!user) {
        // Signed-out users can access onboarding - no redirect
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
          // Already completed - redirect to AI chatbot
          router.replace("/chat");
          return;
        }
      } catch (error) {
        // Profile might not exist yet, or table might not exist
        // Check localStorage as fallback (only for authenticated users)
        if (typeof window !== "undefined") {
          const localStorageFlag = localStorage.getItem(`seekEatz_hasCompletedOnboarding_${user.id}`);
          const onboardingCompleted = localStorage.getItem("onboardingCompleted") === "true";

          if (!isDev && (localStorageFlag === "true" || onboardingCompleted)) {
            // Completed according to localStorage - redirect to AI chatbot
            router.replace("/chat");
            return;
          }
        }
      }
    };

    checkOnboardingStatus();
  }, [router]);

  const handleComplete = () => {
    // OnboardingFlow handles completion and redirect internally
    // This is just a placeholder callback
  };

  return (
    <div className="min-h-screen bg-background">
      <OnboardingFlow onComplete={handleComplete} />
    </div>
  );
}

