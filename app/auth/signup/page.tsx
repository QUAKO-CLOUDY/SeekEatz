"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

import { createClient } from "@/utils/supabase/client";
import { Label } from "@/app/components/ui/label";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { getGuestChatForMigration, getCurrentSessionId, clearGuestSessionFull } from "@/lib/guest-session";
import { claimAnonymousData } from "@/lib/claim-anon-data";

const THIRTY_MINUTES = 30 * 60 * 1000;

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🧠 Guard: if already logged in + onboarding done + last login < 30 min → skip this screen
  useEffect(() => {
    const checkExistingSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || typeof window === "undefined") return;

      const completed = localStorage.getItem("hasCompletedOnboarding") === "true" ||
                        localStorage.getItem("onboarded") === "true";
      const lastLoginStr = localStorage.getItem("seekEatz_lastLogin");
      const lastLogin = lastLoginStr ? Number(lastLoginStr) : 0;

      if (
        completed &&
        lastLogin &&
        Date.now() - lastLogin < THIRTY_MINUTES
      ) {
        router.replace("/home"); // TODO: change to your real main app route
      }
    };

    checkExistingSession();
  }, [router, supabase]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setIsLoading(true);

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setIsLoading(false);
        // Check if error is "user already registered" or similar
        const errorMessage = signUpError.message.toLowerCase();
        if (errorMessage.includes("already registered") || 
            errorMessage.includes("user already exists") ||
            errorMessage.includes("email address is already registered") ||
            errorMessage.includes("already been registered")) {
          setError("An account with this email already exists. Please sign in instead.");
          // Don't clear pending onboarding profile - user can use it when they sign in
          return;
        }
        setError(signUpError.message);
        return;
      }

      // Account created successfully
      if (signUpData.user) {
        const now = Date.now();
        const userId = signUpData.user.id;
        
        // Check if signup is from chat gate (should skip onboarding)
        const isFromChatGate = typeof window !== 'undefined' && 
          localStorage.getItem('seekeatz_signup_from_chat_gate') === 'true';
        
        // Load pending onboarding profile if it exists
        let profile = null;
        const pendingProfile = localStorage.getItem("pendingOnboardingProfile");
        if (pendingProfile) {
          try {
            profile = JSON.parse(pendingProfile);
            localStorage.removeItem("pendingOnboardingProfile");
          } catch (e) {
            console.warn("Failed to parse pending onboarding profile:", e);
          }
        }

        // If signing up from chat gate, mark onboarding as complete and redirect to chat
        if (isFromChatGate) {
          // Clear the flag
          if (typeof window !== 'undefined') {
            localStorage.removeItem('seekeatz_signup_from_chat_gate');
          }
          
          // Claim guest chat session and migrate messages to Supabase
          try {
            const { sessionId, messages: guestMessages } = getGuestChatForMigration();
            if (sessionId && guestMessages.length > 0) {
              // Upsert chat_sessions to claim the session
              const { error: sessionError } = await supabase
                .from('chat_sessions')
                .upsert({
                  session_id: sessionId,
                  user_id: userId,
                }, {
                  onConflict: 'session_id',
                });
              
              if (sessionError) {
                console.error('Failed to claim chat session:', sessionError);
              } else {
                // Insert all guest messages (excluding gate messages)
                const messagesToInsert = guestMessages
                  .filter(msg => !msg.isGateMessage)
                  .map(msg => ({
                    session_id: sessionId,
                    role: msg.role,
                    content: msg.content,
                    meal_data: msg.meals ? JSON.parse(JSON.stringify(msg.meals)) : null,
                    meal_search_context: msg.mealSearchContext ? JSON.parse(JSON.stringify(msg.mealSearchContext)) : null,
                  }));
                
                if (messagesToInsert.length > 0) {
                  const { error: messagesError } = await supabase
                    .from('messages')
                    .insert(messagesToInsert);
                  
                  if (messagesError) {
                    console.error('Failed to migrate guest messages:', messagesError);
                  } else {
                    console.log('Successfully migrated guest chat messages to Supabase');
                  }
                }
              }
            }
          } catch (migrationError) {
            console.error('Error migrating guest chat:', migrationError);
            // Don't block signup flow if migration fails
          }
          
          // Wait for the database trigger to create the profile (if trigger exists)
          // Then update it with additional data
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Mark onboarding as complete in database - update profile with additional fields
          try {
            // Map profile data to match database schema
            const profileData: any = {
              id: userId,
              email: signUpData.user.email,
              has_completed_onboarding: true, // User has account, so they have full access
              last_login: new Date(now).toISOString(),
              updated_at: new Date().toISOString(),
            };
            
            // Map user profile fields to database columns if profile exists
            if (profile) {
              if (profile.goal) profileData.goal = profile.goal;
              if (profile.diet_type) profileData.diet_type = profile.diet_type;
              if (profile.dietary_options) profileData.dietary_options = profile.dietary_options;
              if (profile.target_calories) profileData.calorie_goal = profile.target_calories;
              if (profile.target_protein_g) profileData.protein_goal = profile.target_protein_g;
              if (profile.target_carbs_g) profileData.carb_limit = profile.target_carbs_g;
              if (profile.target_fats_g) profileData.fat_limit = profile.target_fats_g;
              if (profile.preferredMealTypes) profileData.preferred_meal_types = profile.preferredMealTypes;
              if (profile.search_distance_miles) profileData.search_distance_miles = profile.search_distance_miles;
              // Store full profile as JSON for easy retrieval
              profileData.user_profile = profile;
            }
            
            // Try to update the profile (trigger should have created it)
            // Use upsert as fallback in case trigger doesn't exist
            const { error: profileError } = await supabase
              .from("profiles")
              .upsert(profileData, {
                onConflict: "id",
              });
            
            if (profileError) {
              // If it's an RLS error, the trigger might not exist - log but don't block
              if (profileError.message?.includes("row-level security")) {
                console.warn("RLS policy error - profile may be created by trigger. Error:", profileError.message);
                console.log("Note: Run supabase_profiles_auto_create_trigger.sql to auto-create profiles");
              } else {
                console.error("Error saving profile to Supabase:", profileError);
                // Don't block user flow - profile might still be created by trigger
              }
            } else {
              console.log("Profile saved successfully to Supabase with has_completed_onboarding=true");
            }
          } catch (profileErr: any) {
            console.error("Error saving profile:", profileErr);
            // Don't block user flow - profile might still be created by trigger
          }

          // Claim anonymous data (saved_meals, daily_logs, user_favorites)
          try {
            await claimAnonymousData();
          } catch (claimError) {
            console.error('Error claiming anonymous data:', claimError);
            // Don't block signup flow if claim fails
          }

          // Clear guest session data since user now has an account
          if (typeof window !== 'undefined') {
            try {
              clearGuestSessionFull(); // Clear all guest session data including trial count
            } catch (e) {
              console.warn('Failed to clear guest session data:', e);
            }
          }

          // Set onboarding completion flags
          if (typeof window !== 'undefined') {
            localStorage.setItem(`seekEatz_hasCompletedOnboarding_${userId}`, "true");
            localStorage.setItem("hasCompletedOnboarding", "true");
            localStorage.setItem("onboarded", "true");
            localStorage.setItem(`seekEatz_lastLogin_${userId}`, now.toString());
            localStorage.setItem("seekEatz_lastLogin", now.toString());
            
            if (profile) {
              localStorage.setItem("userProfile", JSON.stringify(profile));
            }
          }

          // Wait a moment for database and session to propagate
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Refresh router to ensure session is updated in all components
          router.refresh();
          
          // Wait a bit more for router refresh to complete
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Redirect directly to chat (skip onboarding)
          // Use window.location for a hard redirect to ensure fresh auth state
          window.location.href = "/chat";
          return;
        }

        // Claim guest chat session and migrate messages to Supabase (for normal signup flow too)
        try {
          const { sessionId, messages: guestMessages } = getGuestChatForMigration();
          if (sessionId && guestMessages.length > 0) {
            // Upsert chat_sessions to claim the session
            const { error: sessionError } = await supabase
              .from('chat_sessions')
              .upsert({
                session_id: sessionId,
                user_id: userId,
              }, {
                onConflict: 'session_id',
              });
            
            if (sessionError) {
              console.error('Failed to claim chat session:', sessionError);
            } else {
              // Insert all guest messages (excluding gate messages)
              const messagesToInsert = guestMessages
                .filter(msg => !msg.isGateMessage)
                .map(msg => ({
                  session_id: sessionId,
                  role: msg.role,
                  content: msg.content,
                  meal_data: msg.meals ? JSON.parse(JSON.stringify(msg.meals)) : null,
                  meal_search_context: msg.mealSearchContext ? JSON.parse(JSON.stringify(msg.mealSearchContext)) : null,
                }));
              
              if (messagesToInsert.length > 0) {
                const { error: messagesError } = await supabase
                  .from('messages')
                  .insert(messagesToInsert);
                
                if (messagesError) {
                  console.error('Failed to migrate guest messages:', messagesError);
                } else {
                  console.log('Successfully migrated guest chat messages to Supabase');
                }
              }
            }
          }
        } catch (migrationError) {
          console.error('Error migrating guest chat:', migrationError);
          // Don't block signup flow if migration fails
        }
        
        // Wait for the database trigger to create the profile (if trigger exists)
        // Then update it with additional data
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Normal signup flow: Save profile to Supabase
        // Note: has_completed_onboarding will be set to true after onboarding flow completes
        try {
          // Map profile data to match database schema
          const profileData: any = {
            id: userId,
            email: signUpData.user.email,
            last_login: new Date(now).toISOString(),
            updated_at: new Date().toISOString(),
          };
          
          // Map user profile fields to database columns if profile exists
          if (profile) {
            if (profile.goal) profileData.goal = profile.goal;
            if (profile.diet_type) profileData.diet_type = profile.diet_type;
            if (profile.dietary_options) profileData.dietary_options = profile.dietary_options;
            if (profile.target_calories) profileData.calorie_goal = profile.target_calories;
            if (profile.target_protein_g) profileData.protein_goal = profile.target_protein_g;
            if (profile.target_carbs_g) profileData.carb_limit = profile.target_carbs_g;
            if (profile.target_fats_g) profileData.fat_limit = profile.target_fats_g;
            if (profile.preferredMealTypes) profileData.preferred_meal_types = profile.preferredMealTypes;
            if (profile.search_distance_miles) profileData.search_distance_miles = profile.search_distance_miles;
            // Store full profile as JSON for easy retrieval
            profileData.user_profile = profile;
          }
          
          // Try to update the profile (trigger should have created it)
          // Use upsert as fallback in case trigger doesn't exist
          const { error: profileError } = await supabase
            .from("profiles")
            .upsert(profileData, {
              onConflict: "id",
            });
          
          if (profileError) {
            // If it's an RLS error, the trigger might not exist - log but don't block
            if (profileError.message?.includes("row-level security")) {
              console.warn("RLS policy error - profile may be created by trigger. Error:", profileError.message);
              console.log("Note: Run supabase_profiles_auto_create_trigger.sql to auto-create profiles");
            } else {
              console.error("Error saving profile to Supabase:", profileError);
              // Don't block user flow - profile might still be created by trigger
            }
          } else {
            console.log("Profile saved successfully to Supabase");
          }
        } catch (profileErr: any) {
          console.error("Error saving profile:", profileErr);
          // Don't block user flow - profile might still be created by trigger
        }

        // Claim anonymous data (saved_meals, daily_logs, user_favorites)
        try {
          await claimAnonymousData();
        } catch (claimError) {
          console.error('Error claiming anonymous data:', claimError);
          // Don't block signup flow if claim fails
        }

        // Clear guest session data since user now has an account
        if (typeof window !== 'undefined') {
          try {
            clearGuestSessionFull(); // Clear all guest session data including trial count
          } catch (e) {
            console.warn('Failed to clear guest session data:', e);
          }
        }

        // Set last login (onboarding will be marked complete after onboarding flow)
        localStorage.setItem(`seekEatz_lastLogin_${userId}`, now.toString());
        localStorage.setItem("seekEatz_lastLogin", now.toString());
        
        // Mark that onboarding questions are complete (but not full onboarding yet)
        localStorage.setItem("seekEatz_onboardingQuestionsComplete", "true");
        
        if (profile) {
          localStorage.setItem("userProfile", JSON.stringify(profile));
        }

        // Wait a moment for database to propagate
        await new Promise(resolve => setTimeout(resolve, 500));

        // Refresh router to ensure session is updated
        router.refresh();
        
        // Redirect to onboarding flow (skip welcome and auth, start with onboarding screens)
        router.replace("/onboarding");
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  // ⬇️ Everything below is *inside* the function now
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black mb-2">
            Create Account
          </h1>
          <p className="text-black">
            Sign up to get started with SeekEatz
          </p>
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
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-14 pl-12 pr-12 rounded-2xl bg-gray-50 border-gray-300 text-black placeholder:text-gray-400 focus:border-cyan-500 focus:ring-cyan-500/20"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-cyan-500 hover:text-cyan-600 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <div>
            <Label className="text-black mb-2 block">
              Confirm Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-500" />
              <Input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="h-14 pl-12 pr-12 rounded-2xl bg-gray-50 border-gray-300 text-black placeholder:text-gray-400 focus:border-cyan-500 focus:ring-cyan-500/20"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() =>
                  setShowConfirmPassword((prev) => !prev)
                }
                className="absolute right-4 top-1/2 -translate-y-1/2 text-cyan-500 hover:text-cyan-600 transition-colors"
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm">
              <div className="mb-2">{error}</div>
              {(error.includes("already exists") || error.includes("already registered")) && (
                <button
                  onClick={() => router.push("/auth/signin")}
                  className="text-cyan-600 hover:text-cyan-700 font-medium underline mt-2"
                >
                  Go to Sign In →
                </button>
              )}
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="h-14 rounded-full w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 border-0 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? "Creating Account..." : "Create Account"}
          </Button>
        </form>

        <p className="text-black text-sm text-center mt-6">
          Already have an account?{" "}
          <button
            onClick={() => router.push("/auth/signin")}
            className="text-cyan-600 hover:text-cyan-700 font-medium"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
