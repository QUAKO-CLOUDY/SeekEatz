"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Label } from "@/app/components/ui/label";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check if user is already authenticated - if so, redirect to chat
  // Also listen for auth state changes to redirect immediately on sign-in
  useEffect(() => {
    const supabase = createClient();
    
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // User is already signed in, redirect to chat
        router.replace("/chat");
      }
    };
    
    // Check immediately
    checkAuth();
    
    // Listen for auth state changes (e.g., when sign-in succeeds)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Sign-in successful - redirect to chat
        router.replace("/chat");
      }
    });
    
    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

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
            window.sessionStorage.removeItem('seekeatz_chat_messages');
            window.sessionStorage.removeItem('seekeatz_chat_lastActivityAt');
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
        
        // Update profile in database
        try {
          await supabase
            .from("profiles")
            .upsert({
              id: userId,
              last_login: new Date(now).toISOString(),
              has_completed_onboarding: profile ? true : (hasCompletedOnboarding ? true : undefined),
              user_profile: profile || undefined,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "id",
            });
        } catch (error) {
          console.warn("Could not update profile:", error);
        }

        // Update localStorage
        localStorage.setItem(`macroMatch_lastLogin_${userId}`, now.toString());
        localStorage.setItem("macroMatch_lastLogin", now.toString());
        
        // Set onboarding flags if user has completed onboarding
        if (profile || hasCompletedOnboarding) {
          localStorage.setItem(`macroMatch_hasCompletedOnboarding_${userId}`, "true");
          localStorage.setItem("hasCompletedOnboarding", "true");
          if (profile) {
            localStorage.setItem("userProfile", JSON.stringify(profile));
          }
          localStorage.removeItem("macroMatch_onboardingQuestionsComplete");
        }
        
        // Clear any saved last screen so user always goes to chat first after sign-in
        localStorage.removeItem("seekeatz_current_screen");
        localStorage.removeItem("seekeatz_nav_history");
        
        // Navigate to chat - the auth state change listener in MainApp will handle the rest
        router.push("/chat");
      }
    } catch (err) {
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
          Don't have an account?{" "}
          <button
            onClick={() => router.push("/auth/signup")}
            className="text-cyan-600 hover:text-cyan-700 font-medium"
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
}

