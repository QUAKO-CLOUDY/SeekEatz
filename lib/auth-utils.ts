import { createClient } from "@/utils/supabase/client";

const THIRTY_MINUTES_MS = 30 * 60 * 1000; // 30 minutes in milliseconds

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}

/**
 * Get current user
 */
export async function getCurrentUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Check if user has completed onboarding
 * Checks both Supabase profiles table and localStorage fallback
 * In development mode, always returns false to allow testing onboarding
 */
export async function hasCompletedOnboarding(userId?: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // In development, always treat onboarding as not completed
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    return false;
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    // Check localStorage for anonymous onboarding completion
    const localStorageFlag = localStorage.getItem("seekEatz_hasCompletedOnboarding");
    return localStorageFlag === "true";
  }

  const userIdToCheck = userId || user.id;

  // Check Supabase profiles table
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("has_completed_onboarding")
      .eq("id", userIdToCheck)
      .single();

    if (profile?.has_completed_onboarding) {
      return true;
    }
  } catch (error) {
    // Profiles table might not exist - fall through to localStorage
  }

  // Fallback to localStorage
  const localStorageFlag = localStorage.getItem(`seekEatz_hasCompletedOnboarding_${userIdToCheck}`);
  return localStorageFlag === "true";
}

/**
 * Get last login timestamp
 */
export async function getLastLogin(userId?: string): Promise<number | null> {
  if (typeof window === "undefined") return null;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userIdToCheck = userId || user?.id;

  if (userIdToCheck) {
    const lastLogin = localStorage.getItem(`seekEatz_lastLogin_${userIdToCheck}`);
    return lastLogin ? parseInt(lastLogin, 10) : null;
  }

  // Check anonymous lastLogin
  const anonymousLastLogin = localStorage.getItem("seekEatz_lastLogin");
  return anonymousLastLogin ? parseInt(anonymousLastLogin, 10) : null;
}

/**
 * Check if last login was within 30 minutes
 */
export async function isWithin30Minutes(userId?: string): Promise<boolean> {
  const lastLogin = await getLastLogin(userId);
  if (!lastLogin) return false;

  const now = Date.now();
  return (now - lastLogin) < THIRTY_MINUTES_MS;
}

/**
 * Update last login timestamp
 */
export async function updateLastLogin(userId?: string): Promise<void> {
  if (typeof window === "undefined") return;

  const now = Date.now();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userIdToCheck = userId || user?.id;

  if (userIdToCheck) {
    localStorage.setItem(`seekEatz_lastLogin_${userIdToCheck}`, now.toString());
    
    // Also try to update Supabase profiles table
    try {
      await supabase
        .from("profiles")
        .upsert({
          id: userIdToCheck,
          last_login: new Date(now).toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "id",
        });
    } catch (error) {
      console.warn("Could not update last_login in profiles table:", error);
    }
  } else {
    // Anonymous user
    localStorage.setItem("seekEatz_lastLogin", now.toString());
  }
}

/**
 * Set onboarding completion flag
 */
export async function setOnboardingComplete(userId: string, profile?: any): Promise<void> {
  const supabase = createClient();
  const now = Date.now();

  // Try to update profiles table
  try {
    await supabase
      .from("profiles")
      .upsert({
        id: userId,
        has_completed_onboarding: true,
        last_login: new Date(now).toISOString(),
        user_profile: profile,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "id",
      });
  } catch (error) {
    console.warn("Could not update profiles table, using localStorage:", error);
  }

  // Always set localStorage as fallback
  if (typeof window !== "undefined") {
    localStorage.setItem(`seekEatz_hasCompletedOnboarding_${userId}`, "true");
    localStorage.setItem(`seekEatz_lastLogin_${userId}`, now.toString());
    if (profile) {
      localStorage.setItem("userProfile", JSON.stringify(profile));
    }
    localStorage.setItem("hasCompletedOnboarding", "true");
    localStorage.setItem("seekEatz_lastLogin", now.toString());
  }
}

