"use client";

import { Suspense, useState, FormEvent, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Label } from "@/app/components/ui/label";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { clearGuestSessionFull } from "@/lib/guest-session";
import { claimAnonymousData } from "@/lib/claim-anon-data";
import { AuthProviders } from "@/app/components/AuthProviders";
import { setDevFullAccess } from "@/lib/onboarding-flow";
import { bootstrapAccount } from "@/lib/bootstrap-account";
import { isFullAccessEmail } from "@/lib/full-access";
import type { UserProfile } from "@/app/types";
import {
  clearLoggedMealsStorageForUser,
  getLoggedMealsStorageKey,
} from "@/lib/logged-meals-storage";

/**
 * Resolves a promise but never hangs longer than `ms`. Used so flaky mobile
 * network calls during post-sign-in setup can't leave the button stuck on
 * "Signing in...". The session is already established at this point, so timing
 * out these non-critical side effects is safe.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T | null>([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function SignInPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/chat";
  const isMasterMode = searchParams.get("master") === "1";
  const isSwitchAccountMode = searchParams.get("switch") === "1";
  const shouldStartTutorial = searchParams.get("tutorial") === "1";
  const accountDeleted = searchParams.get("accountDeleted") === "1";
  const devMasterEmail =
    process.env.NEXT_PUBLIC_ENABLE_MASTER_LOGIN === "true"
      ? process.env.NEXT_PUBLIC_MASTER_LOGIN_EMAIL ?? ""
      : "";
  const [email, setEmail] = useState(() => devMasterEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetPasswordMessage, setResetPasswordMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  // "Sign up" must open the create-account screen first. After the account is
  // created, signup redirects to the premium screen (/upgrade?fromSignup=1),
  // which then routes into onboarding. Pointing this at /upgrade directly made
  // the subscription screen appear twice (once before and once after signup).
  const postSignupUpgradePath = "/upgrade?fromSignup=1";
  const signUpHref = `/auth/signup?redirectTo=${encodeURIComponent(postSignupUpgradePath)}&switch=1${shouldStartTutorial ? "&tutorial=1" : ""}${isMasterMode ? "&master=1" : ""}`;

  const resetSavedMealStorageForUser = (userId: string) => {
    if (typeof window === "undefined") return;

    clearLoggedMealsStorageForUser(userId);

    const keysToRemove = [
      "seekeatz_favorite_meals",
      "seekeatz_favorite_meals_data",
      "seekeatz_favorite_meals:guest",
      "seekeatz_favorite_meals_data:guest",
      `seekeatz_favorite_meals:${userId}`,
      `seekeatz_favorite_meals_data:${userId}`,
    ];

    keysToRemove.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(`seekeatz_favorite_meals:${userId}`, JSON.stringify([]));
    localStorage.setItem(`seekeatz_favorite_meals_data:${userId}`, JSON.stringify({}));
    localStorage.setItem(getLoggedMealsStorageKey(userId), JSON.stringify([]));
  };

  // Check if user is already authenticated - if so, redirect to requested destination
  // Also listen for auth state changes to redirect immediately on sign-in
  useEffect(() => {
    const supabase = createClient();
    
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user && isSwitchAccountMode) {
        await supabase.auth.signOut();
        return;
      }
      
      if (user && !isMasterMode && !isSwitchAccountMode) {
        // User is already signed in, redirect to destination
        router.replace(redirectTo);
      }
    };
    
    // Check immediately
    checkAuth();
    
    // Listen for auth state changes (e.g., when sign-in succeeds)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Sign-in successful - redirect to chat
        router.replace(redirectTo);
      }
    });
    
    return () => {
      subscription.unsubscribe();
    };
  }, [isMasterMode, isSwitchAccountMode, redirectTo, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetPasswordMessage(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setIsLoading(false);
        return;
      }

      if (data.user) {
        // Sign-in successful - update profile and navigate to destination
        const now = Date.now();
        const userId = data.user.id;
        
        // Clear session-based UI state on login
        if (typeof window !== 'undefined') {
          try {
            // Chat is now stored in sessionStorage
            
          } catch (e) {
            console.error('Failed to clear chat sessionStorage on login:', e);
          }
          localStorage.removeItem('seekeatz_recommended_meals');
          localStorage.removeItem('seekeatz_has_searched');
          localStorage.removeItem('seekeatz_last_search_params');
          localStorage.removeItem('seekeatz_pending_chat_message');
          localStorage.setItem('seekEatz_lastActivity', now.toString());
        }
        
        // Check for pending onboarding profile
        const pendingProfile = typeof window !== 'undefined' 
          ? localStorage.getItem("pendingOnboardingProfile")
          : null;
        
        let profile: Partial<UserProfile> | null = null;
        let didLoadExistingProfile = false;
        if (pendingProfile) {
          try {
            profile = JSON.parse(pendingProfile) as Partial<UserProfile>;
            localStorage.removeItem("pendingOnboardingProfile");
          } catch (e) {
            console.warn("Failed to parse pending onboarding profile:", e);
          }
        }
        
        // Check existing profile in database
        let hasCompletedOnboarding = false;
        try {
          const profileResult = await withTimeout(
            Promise.resolve(
              supabase
                .from("profiles")
                .select("has_completed_onboarding, user_profile")
                .eq("id", userId)
                .single(),
            ),
            6000,
          );
          const profileData = profileResult?.data;
          
          if (profileData) {
            didLoadExistingProfile = true;
            hasCompletedOnboarding = profileData.has_completed_onboarding === true;
            if (!profile && profileData.user_profile) {
              profile = profileData.user_profile as Partial<UserProfile>;
            }
          }
        } catch (error) {
          console.warn("Could not fetch existing profile:", error);
        }

        const isFreshAccount =
          shouldStartTutorial || (didLoadExistingProfile && !hasCompletedOnboarding && !profile);
        if (isFreshAccount) {
          resetSavedMealStorageForUser(userId);
        }
        
        // Claim anonymous data (saved_meals, daily_logs, user_favorites).
        // Bounded so a stalled request can't hang the sign-in button.
        try {
          await withTimeout(claimAnonymousData(), 6000);
        } catch (claimError) {
          console.error('Error claiming anonymous data:', claimError);
          // Don't block signin flow if claim fails
        }

        // Clear guest session data since user now has an account
        if (typeof window !== 'undefined') {
          try {
            clearGuestSessionFull(); // Clear all guest session data including trial count
          } catch (e) {
            console.warn('Failed to clear guest session data:', e);
          }
        }

        // Update localStorage
        localStorage.setItem(`seekEatz_lastLogin_${userId}`, now.toString());
        localStorage.setItem("seekEatz_lastLogin", now.toString());
        if (shouldStartTutorial) {
          localStorage.setItem("seekeatz_start_app_tutorial", "true");
          localStorage.removeItem(`seekeatz_app_tutorial_completed_${userId}`);
        }
        if (isFullAccessEmail(data.user.email)) {
          setDevFullAccess(true);
        }
        
        // Set onboarding flags if user has completed onboarding
        if (profile || hasCompletedOnboarding) {
          localStorage.setItem(`seekEatz_hasCompletedOnboarding_${userId}`, "true");
          localStorage.setItem("hasCompletedOnboarding", "true");
          localStorage.setItem("onboarded", "true");
          const profileForStorage: Partial<UserProfile> | null = profile
            ? {
              ...profile,
              full_name: profile.full_name ?? (data.user.user_metadata?.full_name as string | undefined),
            }
            : null;
          if (profileForStorage) {
            localStorage.setItem("userProfile", JSON.stringify(profileForStorage));
          }
          localStorage.removeItem("seekEatz_onboardingQuestionsComplete");
        }
        
        // Clear any saved last screen so user always goes to chat first after sign-in
        localStorage.removeItem("seekeatz_current_screen");
        localStorage.removeItem("seekeatz_nav_history");

        try {
          const profileForBootstrap: Partial<UserProfile> | undefined = profile
            ? {
              ...profile,
              full_name: profile.full_name ?? (data.user.user_metadata?.full_name as string | undefined),
            }
            : data.user.user_metadata?.full_name
              ? { full_name: data.user.user_metadata.full_name as string }
              : undefined;

          const bootstrapResult = await withTimeout(
            bootstrapAccount({
              profile: profileForBootstrap,
              hasCompletedOnboarding: !!(profile || hasCompletedOnboarding),
            }),
            6000,
          );

          if (bootstrapResult?.waitlistGrantApplied) {
            localStorage.setItem("seekeatz_waitlist_trial_activated", "true");
          }
        } catch (bootstrapError) {
          console.warn("Account bootstrap failed after sign-in:", bootstrapError);
        }
        
        // Refresh router to ensure session is updated in all components
        router.refresh();
        
        // Navigate to destination - the auth state change listener will unlock the session immediately
        router.push(redirectTo);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setResetPasswordMessage(null);

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Enter your email first, then tap Forgot password.");
      return;
    }

    try {
      setIsResettingPassword(true);
      const supabase = createClient();
      const redirectToReset = `${window.location.origin}/auth/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: redirectToReset,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setResetPasswordMessage("Password reset link sent. Check your email.");
    } catch {
      setError("Could not send reset link. Please try again.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black mb-2">Welcome Back</h1>
          <p className="text-black">Sign in to continue to SeekEatz</p>
        </div>

        {accountDeleted && (
          <div className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Your account has been deleted.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label className="text-black mb-2 block">Email</Label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-500" />
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-14 pl-12 rounded-2xl bg-gray-50 border-gray-300 text-black placeholder:text-gray-400 focus:border-cyan-500 focus:ring-cyan-500/20"
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <Label className="text-black mb-2 block">Password</Label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-500" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-14 pl-12 pr-12 rounded-2xl bg-gray-50 border-gray-300 text-black placeholder:text-gray-400 focus:border-cyan-500 focus:ring-cyan-500/20"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-cyan-500 hover:text-cyan-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="h-14 rounded-full w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 border-0 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </Button>

          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={isResettingPassword}
            className="w-full text-center text-sm font-medium text-cyan-600 transition-colors hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isResettingPassword ? "Sending reset link..." : "Forgot password?"}
          </button>
        </form>

        <AuthProviders
          oauthRedirectPath={redirectTo}
          className="mt-4"
          onBeforeRedirect={() => {
            if (shouldStartTutorial && typeof window !== "undefined") {
              localStorage.setItem("seekeatz_start_app_tutorial", "true");
            }
          }}
        />

        {resetPasswordMessage && (
          <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {resetPasswordMessage}
          </div>
        )}

        <p className="text-black text-sm text-center mt-6">
          Don&apos;t have an account?{" "}
          <button
            onClick={() => router.push(signUpHref)}
            className="text-cyan-600 hover:text-cyan-700 font-medium"
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInPageContent />
    </Suspense>
  );
}

