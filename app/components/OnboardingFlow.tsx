"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, MapPin, Sparkles, Map, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { createClient } from "@/utils/supabase/client";

type Props = {
  onComplete: () => void;
};

const TOTAL_STEPS = 4;

export function OnboardingFlow({ onComplete }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(0); // Step 0 = Eat Anywhere, Step 1 = AI Menu Scraper, Step 2 = No Guesswork, Step 3 = Location

  // Location state
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);

  // Progress dots component
  const ProgressDots = () => {
    return (
      <div className="flex gap-2 justify-center mb-8">
        {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
          <div
            key={index}
            className={`h-2 w-12 rounded-full transition-all ${
              index === step
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
  };

  // STEP 0: Eat Anywhere (First onboarding screen after account creation)
  if (step === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />
        
        <div className="w-full max-w-md text-center relative z-10">
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-teal-500 to-blue-500 rounded-full blur-2xl opacity-20 animate-pulse" />
              <MapPin className="w-20 h-20 text-teal-500 relative" strokeWidth={1.5} />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-4">Eat Anywhere</h1>
          <p className="text-muted-foreground text-lg mb-12 leading-relaxed">
          Whether you’re at a restaurant, in a new city, or eating out nearby, SeekEatz finds meals that fit your goals.
          </p>

          <ProgressDots />

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
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />
        
        <div className="w-full max-w-md text-center relative z-10">
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

          <ProgressDots />

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
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />
        
        <div className="w-full max-w-md text-center relative z-10">
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full blur-2xl opacity-20 animate-pulse" />
              <ShieldCheck className="w-20 h-20 text-orange-500 relative" strokeWidth={1.5} />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-4">No Guesswork</h1>
          <p className="text-muted-foreground text-lg mb-12 leading-relaxed">
          SeekEatz pulls nutrition from real restaurant sources when available — no crowdsourced guesses, no made-up macros.
          </p>

          <ProgressDots />

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="h-14 rounded-full border-muted-foreground/20 text-foreground hover:bg-muted flex-1"
            >
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
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

  // STEP 3: Location Permission (Last step before app access)
  const handleLocationRequest = async () => {
    setIsRequestingLocation(true);

    try {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            // Success - location granted
            console.log("Location granted:", position.coords);
            
            // Save location if needed (optional)
            // You can store lat/lng in Supabase or localStorage if needed
            
            // Complete onboarding and redirect
            await completeOnboarding();
          },
          async (error) => {
            // User denied or error occurred - still proceed
            console.log("Location denied or error:", error);
            
            // Complete onboarding anyway
            await completeOnboarding();
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          }
        );
      } else {
        // Geolocation not supported - proceed anyway
        console.log("Geolocation not supported");
        await completeOnboarding();
      }
    } catch (error) {
      console.error("Error requesting location:", error);
      // Still complete onboarding
      await completeOnboarding();
    } finally {
      setIsRequestingLocation(false);
    }
  };

  const handleSkipLocation = async () => {
    await completeOnboarding();
  };

  const completeOnboarding = async () => {
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
      } catch (error: any) {
        // AuthSessionMissingError is expected when signed out - treat as no user
        if (error?.message?.includes('Auth session missing') || error?.name === 'AuthSessionMissingError') {
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
      
      // Clear any saved last screen so user always goes to chat first after onboarding
      localStorage.removeItem("seekeatz_current_screen");
      localStorage.removeItem("seekeatz_nav_history");

      // If we have a user, also update database and set user-specific flags
      if (user) {
        // Mark onboarding as complete in database
        try {
          // Load user profile from localStorage if it exists
          let userProfile = null;
          try {
            const savedProfile = localStorage.getItem("userProfile");
            if (savedProfile) {
              userProfile = JSON.parse(savedProfile);
            }
          } catch (e) {
            console.warn("Failed to parse userProfile from localStorage:", e);
          }

          const profileData: any = {
            id: user.id,
            has_completed_onboarding: true, // Mark onboarding as complete
            last_login: new Date(now).toISOString(),
            updated_at: new Date().toISOString(),
          };

          // Include user profile data if available
          if (userProfile) {
            if (userProfile.goal) profileData.goal = userProfile.goal;
            if (userProfile.diet_type) profileData.diet_type = userProfile.diet_type;
            if (userProfile.dietary_options) profileData.dietary_options = userProfile.dietary_options;
            if (userProfile.target_calories) profileData.calorie_goal = userProfile.target_calories;
            if (userProfile.target_protein_g) profileData.protein_goal = userProfile.target_protein_g;
            if (userProfile.target_carbs_g) profileData.carb_limit = userProfile.target_carbs_g;
            if (userProfile.target_fats_g) profileData.fat_limit = userProfile.target_fats_g;
            if (userProfile.preferredMealTypes) profileData.preferred_meal_types = userProfile.preferredMealTypes;
            if (userProfile.search_distance_miles) profileData.search_distance_miles = userProfile.search_distance_miles;
            // Store full profile as JSON for easy retrieval
            profileData.user_profile = userProfile;
          }
          
          const { error: profileError } = await supabase
            .from("profiles")
            .upsert(profileData, {
              onConflict: "id",
            });
          
          if (profileError) {
            console.error("Could not update profile:", profileError);
          } else {
            console.log("Profile updated successfully after onboarding with has_completed_onboarding=true");
          }
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

      // Call onComplete callback
      onComplete();

      // Always redirect to chat after onboarding completion (for both signed-in and signed-out users)
      // Signed-out users will get guest trial access (3 uses), signed-in users get full access
      router.push("/chat");
    } catch (error) {
      console.error("Error completing onboarding:", error);
      // Always try to redirect to chat - the app will handle auth check
      // Don't redirect to signin on error, let the chat page handle it
      window.location.href = "/chat";
    }
  };

  if (step === 3) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />
        
        <div className="w-full max-w-md text-center relative z-10">
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full blur-2xl opacity-20 animate-pulse" />
              <Map className="w-20 h-20 text-green-500 relative" strokeWidth={1.5} />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-4">Use your location</h1>
          <p className="text-muted-foreground text-lg mb-12 leading-relaxed">
          Let SeekEatz use your location to find nearby restaurants and recommend the best meals nearby.
          </p>

          <ProgressDots />

          <div className="space-y-3">
            <Button
              onClick={handleLocationRequest}
              disabled={isRequestingLocation}
              className="h-14 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-lg shadow-green-500/20 w-full text-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isRequestingLocation ? "Requesting..." : "Allow Location"}
            </Button>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                disabled={isRequestingLocation}
                className="h-14 rounded-full border-muted-foreground/20 text-foreground hover:bg-muted flex-1 disabled:opacity-50"
              >
                Back
              </Button>
              <button
                onClick={handleSkipLocation}
                disabled={isRequestingLocation}
                className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors disabled:opacity-50 flex-1"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}