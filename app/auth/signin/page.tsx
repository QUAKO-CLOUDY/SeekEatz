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

function SignInPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/chat";
  const isMasterMode = searchParams.get("master") === "1";
  const isSwitchAccountMode = searchParams.get("switch") === "1";
  const shouldStartTutorial = searchParams.get("tutorial") === "1";
  const devMasterEmail =
    process.env.NEXT_PUBLIC_ENABLE_MASTER_LOGIN === "true"
      ? process.env.NEXT_PUBLIC_MASTER_LOGIN_EMAIL ?? ""
      : "";
  const [email, setEmail] = useState(() => devMasterEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const encodedRedirectTo = encodeURIComponent(redirectTo);
  const upgradeHref = `/upgrade?redirectTo=${encodedRedirectTo}${shouldStartTutorial ? "&tutorial=1" : ""}${isMasterMode ? "&master=1" : ""}`;

  // Check if user is already authenticated - if so, redirect to chat
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
        // User is already signed in, redirect to chat
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
        // Sign-in successful - update profile and navigate to chat
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
        
        let profile = null;
        if (pendingProfile) {
          try {
            profile = JSON.parse(pendingProfile);
            localStorage.removeItem("pendingOnboardingProfile");
          } catch (e) {
            console.warn("Failed to parse pending onboarding profile:", e);
          }
        }
        
        // Check existing profile in database
        let hasCompletedOnboarding = false;
        try {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("has_completed_onboarding, user_profile")
            .eq("id", userId)
            .single();
          
          if (profileData) {
            hasCompletedOnboarding = profileData.has_completed_onboarding === true;
            if (!profile && profileData.user_profile) {
              profile = profileData.user_profile;
            }
          }
        } catch (error) {
          console.warn("Could not fetch existing profile:", error);
        }
        
        // Claim anonymous data (saved_meals, daily_logs, user_favorites)
        try {
          await claimAnonymousData();
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

        // Update profile in database - ensure profile row exists with all required fields
        try {
          const profileData: Record<string, unknown> = {
            id: userId,
            email: data.user.email, // Include email field
            last_login: new Date(now).toISOString(),
            updated_at: new Date().toISOString(),
          };

          // Set has_completed_onboarding if user has completed onboarding
          if (profile || hasCompletedOnboarding) {
            profileData.has_completed_onboarding = true;
          }

          // Include profile data if available
          if (profile) {
            profileData.user_profile = profile;
            // Also map individual fields if needed
            if (profile.goal) profileData.goal = profile.goal;
            if (profile.diet_type) profileData.diet_type = profile.diet_type;
            if (profile.dietary_options) profileData.dietary_options = profile.dietary_options;
            if (profile.target_calories) profileData.calorie_goal = profile.target_calories;
            if (profile.target_protein_g) profileData.protein_goal = profile.target_protein_g;
            if (profile.target_carbs_g) profileData.carb_limit = profile.target_carbs_g;
            if (profile.target_fats_g) profileData.fat_limit = profile.target_fats_g;
            if (profile.preferredMealTypes) profileData.preferred_meal_types = profile.preferredMealTypes;
            if (profile.search_distance_miles) profileData.search_distance_miles = profile.search_distance_miles;
          }

          await supabase
            .from("profiles")
            .upsert(profileData, {
              onConflict: "id",
            });
        } catch (error) {
          console.error("Could not update profile:", error);
          // Don't block navigation even if profile update fails
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
          if (profile) {
            localStorage.setItem("userProfile", JSON.stringify(profile));
          }
          localStorage.removeItem("seekEatz_onboardingQuestionsComplete");
        }
        
        // Clear any saved last screen so user always goes to chat first after sign-in
        localStorage.removeItem("seekeatz_current_screen");
        localStorage.removeItem("seekeatz_nav_history");

        try {
          const bootstrapResult = await bootstrapAccount({
            profile,
            hasCompletedOnboarding: !!(profile || hasCompletedOnboarding),
          });

          if (bootstrapResult.waitlistGrantApplied) {
            localStorage.setItem("seekeatz_waitlist_trial_activated", "true");
          }
        } catch (bootstrapError) {
          console.warn("Account bootstrap failed after sign-in:", bootstrapError);
        }
        
        // Refresh router to ensure session is updated in all components
        router.refresh();
        
        // Navigate to chat - the auth state change listener will unlock the chat immediately
        router.push(redirectTo);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black mb-2">Welcome Back</h1>
          <p className="text-black">Sign in to continue to SeekEatz</p>
        </div>

        <AuthProviders
          mode="signin"
          oauthRedirectPath={redirectTo}
          className="mb-6"
          onBeforeRedirect={() => {
            if (shouldStartTutorial && typeof window !== "undefined") {
              localStorage.setItem("seekeatz_start_app_tutorial", "true");
            }
          }}
        />

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
        </form>

        <p className="text-black text-sm text-center mt-6">
          Don&apos;t have an account?{" "}
          <button
            onClick={() => router.push(upgradeHref)}
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

