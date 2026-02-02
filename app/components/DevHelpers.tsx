"use client";

import { useEffect } from "react";

/**
 * Development-only helper utilities attached to window
 * Only available in development mode for testing/debugging
 */
export function DevHelpers() {
  useEffect(() => {
    if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
      // Reset onboarding completion flags and reload
      (window as any).resetOnboarding = () => {
        localStorage.removeItem("onboardingCompleted");
        localStorage.removeItem("hasCompletedOnboarding");
        
        // Remove user-specific flags
        const keys = Object.keys(localStorage);
        keys.forEach((key) => {
          if (key.includes("hasCompletedOnboarding") || key.includes("completedOnboarding")) {
            localStorage.removeItem(key);
          }
        });
        
        console.log("✅ Onboarding flags cleared. Reloading...");
        window.location.reload();
      };

      // Log helper info
      console.log(
        "%c🔧 Dev Helpers Available",
        "color: #0ea5e9; font-weight: bold; font-size: 14px;"
      );
      console.log("Run `window.resetOnboarding()` in console to reset onboarding");
    }

    // Cleanup on unmount (development only)
    return () => {
      if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
        delete (window as any).resetOnboarding;
      }
    };
  }, []);

  return null; // This component doesn't render anything
}
