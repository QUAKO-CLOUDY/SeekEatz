"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronRight, MapPin, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { createClient } from "@/utils/supabase/client";
import { bootstrapAccount } from "@/lib/bootstrap-account";
import type { UserProfile } from "@/app/types";

type Props = {
  onComplete: () => void;
  initialStep?: number;
};

const TOTAL_STEPS = 3;
type ProgressDotsProps = {
  activeStep: number;
};

function ProgressDots({ activeStep }: ProgressDotsProps) {
  return (
    <div className="flex gap-2 justify-center mb-8">
      {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
        <div
          key={index}
          className={`h-2 w-12 rounded-full transition-all ${
            index === activeStep
              ? index === 0
                ? "bg-gradient-to-r from-teal-500 to-blue-500"
                : index === 1
                ? "bg-gradient-to-r from-purple-500 to-pink-500"
                : index === 2
                ? "bg-gradient-to-r from-orange-500 to-amber-500"
                : "bg-gradient-to-r from-green-500 to-emerald-500"
              : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

export function OnboardingFlow({ onComplete, initialStep = -1 }: Props) {
  const supabase = createClient();
  const [step, setStep] = useState(initialStep); // -1 = Welcome, 0-2 = onboarding slides


  if (step === -1) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-background to-blue-50 dark:from-slate-950 dark:via-background dark:to-slate-900" />
        <div className="absolute -top-24 right-[-4rem] h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute -bottom-24 left-[-4rem] h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />

        <div className="relative z-10 w-full max-w-md rounded-[2rem] border border-white/40 bg-white/90 p-8 text-center shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
          <div className="mx-auto mb-8 flex justify-center">
            <div className="relative h-24 w-24">
              <Image
                src="/logos/seekeatz.png"
                alt="SeekEatz logo"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600">
            Welcome to SeekEatz
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-foreground">
            Find meals that fit your goals before you order.
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Search restaurant menus with real nutrition data, smarter filters, and AI guidance built for eating out.
          </p>

          <Button
            onClick={() => setStep(0)}
            className="mt-10 h-14 w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-base font-semibold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-600 hover:to-blue-700"
          >
            Get Started
            <ChevronRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    );
  }

  // STEP 0: Eat Anywhere (First onboarding screen after welcome)
  if (step === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-background to-blue-50 dark:from-slate-950 dark:via-background dark:to-slate-900" />
        <div className="absolute -top-24 right-[-4rem] h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute -bottom-24 left-[-4rem] h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />

        <div className="relative z-10 w-full max-w-md rounded-[2rem] border border-white/40 bg-white/90 p-8 text-center shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-teal-500 to-blue-500 rounded-full blur-2xl opacity-20 animate-pulse" />
              <MapPin className="w-20 h-20 text-teal-500 relative" strokeWidth={1.5} />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-4">Eat Anywhere</h1>
          <p className="text-muted-foreground text-lg mb-12 leading-relaxed">
          Whether you&apos;re on the go, in a new city, or eating out locally, SeekEatz finds meals that fit your goals.
          </p>

          <ProgressDots activeStep={step} />

          <div className="flex gap-3">
            <Button
              onClick={() => setStep(1)}
              className="h-14 rounded-full bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 text-white shadow-lg shadow-teal-500/20 w-full text-lg"
            >
              Next
              <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // STEP 1: AI Menu Scraper
  if (step === 1) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-background to-blue-50 dark:from-slate-950 dark:via-background dark:to-slate-900" />
        <div className="absolute -top-24 right-[-4rem] h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute -bottom-24 left-[-4rem] h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />

        <div className="relative z-10 w-full max-w-md rounded-[2rem] border border-white/40 bg-white/90 p-8 text-center shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full blur-2xl opacity-20 animate-pulse" />
              <Sparkles className="w-20 h-20 text-purple-500 relative" strokeWidth={1.5} />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-4">AI Menu Scraper</h1>
          <p className="text-muted-foreground text-lg mb-12 leading-relaxed">
          Our AI scans restaurant menus and highlights the best meals for your calorie and macro goals.
          </p>

          <ProgressDots activeStep={step} />

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(0)}
              className="h-14 rounded-full border-muted-foreground/20 text-foreground hover:bg-muted flex-1"
            >
              Back
            </Button>
            <Button
              onClick={() => setStep(2)}
              className="h-14 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/20 flex-[2] text-lg"
            >
              Next
              <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // STEP 2: No Guesswork
  if (step === 2) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-background to-blue-50 dark:from-slate-950 dark:via-background dark:to-slate-900" />
        <div className="absolute -top-24 right-[-4rem] h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute -bottom-24 left-[-4rem] h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />

        <div className="relative z-10 w-full max-w-md rounded-[2rem] border border-white/40 bg-white/90 p-8 text-center shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full blur-2xl opacity-20 animate-pulse" />
              <ShieldCheck className="w-20 h-20 text-orange-500 relative" strokeWidth={1.5} />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-4">No Guesswork</h1>
          <p className="text-muted-foreground text-lg mb-12 leading-relaxed">
          SeekEatz pulls nutrition from real restaurant nutritional menus and databases, eliminating crowdsourced guesses, made up numbers, and AI hallucinations.
          </p>

          <ProgressDots activeStep={step} />

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="h-14 rounded-full border-muted-foreground/20 text-foreground hover:bg-muted flex-1"
            >
              Back
            </Button>
            <Button
              onClick={() => { void completeOnboarding(); }}
              className="h-14 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/20 flex-[2] text-lg"
            >
              Next
              <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  async function completeOnboarding() {
    try {
      const now = Date.now();
      
      // Try to get user, but treat AuthSessionMissingError as "no user" (signed-out preview)
      let user = null;
      try {
        const { data: { user: fetchedUser }, error: userError } = await supabase.auth.getUser();
        // Only treat as error if it's NOT AuthSessionMissingError (which is expected when signed out)
        if (userError && userError.message && !userError.message.includes('Auth session missing')) {
          console.warn("Auth error (non-session):", userError);
        }
        // If we got a user, use it; otherwise user stays null (signed-out preview)
        if (fetchedUser) {
          user = fetchedUser;
        }
      } catch (error: unknown) {
        // AuthSessionMissingError is expected when signed out - treat as no user
        if (
          error instanceof Error &&
          (error.message.includes('Auth session missing') || error.name === 'AuthSessionMissingError')
        ) {
          // This is expected for signed-out users - continue with guest preview
          console.log("No auth session (signed-out preview mode)");
        } else {
          console.warn("Unexpected auth error:", error);
        }
        // Continue with user = null (guest preview)
      }

      // ALWAYS set onboarding completion flags (for both signed-in and signed-out users)
      localStorage.setItem("hasCompletedOnboarding", "true");
      localStorage.setItem("onboarded", "true");
      localStorage.setItem("onboardingCompletedTimestamp", now.toString());
      localStorage.removeItem("seekEatz_onboardingQuestionsComplete");
      
      // Default to home once the app shell is reached after onboarding.
      localStorage.setItem("seekeatz_current_screen", "home");
      localStorage.setItem("seekeatz_nav_history", JSON.stringify(["home"]));

      // If we have a user, also update database and set user-specific flags
      if (user) {
        // Mark onboarding as complete in database
        try {
          // Load user profile from localStorage if it exists
          let userProfile: Partial<UserProfile> | null = null;
          try {
            const savedProfile = localStorage.getItem("userProfile");
            if (savedProfile) {
              userProfile = JSON.parse(savedProfile) as Partial<UserProfile>;
            }
          } catch (e) {
            console.warn("Failed to parse userProfile from localStorage:", e);
          }

          await bootstrapAccount({
            profile: userProfile,
            hasCompletedOnboarding: true,
          });
        } catch (error) {
          console.error("Error updating profile:", error);
        }

        // Set user-specific localStorage flags
        localStorage.setItem(`seekEatz_hasCompletedOnboarding_${user.id}`, "true");
        localStorage.setItem(`seekEatz_lastLogin_${user.id}`, now.toString());
        localStorage.setItem("seekEatz_lastLogin", now.toString());
      } else {
        // Signed-out user - set generic lastLogin
        localStorage.setItem("seekEatz_lastLogin", now.toString());
      }

      // Wait a moment to ensure all state is saved
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Notify parent that onboarding is complete
      onComplete();
    } catch (error) {
      console.error("Error completing onboarding:", error);
      // On error, still notify parent so it can decide how to handle navigation
      onComplete();
    }
  }

  return null;
}

