"use client";

import { useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";

const LAST_ACTIVITY_KEY = "seekEatz_lastActivity";

/**
 * Track user activity timestamps without forcing sign-outs.
 * Professional mobile/web apps should preserve authenticated sessions.
 */
export function useSessionActivity() {
  const pathname = usePathname();

  const updateActivity = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!localStorage.getItem(LAST_ACTIVITY_KEY)) {
      updateActivity();
    }
  }, [updateActivity]);

  useEffect(() => {
    updateActivity();
  }, [pathname, updateActivity]);

  return { updateActivity };
}
