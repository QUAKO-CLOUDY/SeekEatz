"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppEntitlement } from "@/lib/entitlements";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import {
  GUEST_ENTITLEMENT,
  readCachedEntitlement,
  writeCachedEntitlement,
} from "@/lib/entitlements";

export function useAccountEntitlement(enabled = true) {
  const [entitlement, setEntitlement] = useState<AppEntitlement>(() => readCachedEntitlement());
  const [isLoading, setIsLoading] = useState(enabled);
  const entitlementRef = useRef(entitlement);

  useEffect(() => {
    entitlementRef.current = entitlement;
  }, [entitlement]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return GUEST_ENTITLEMENT;
    }

    try {
      setIsLoading(true);
      const response = await authenticatedFetch("/api/account/entitlement", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Entitlement request failed: ${response.status}`);
      }

      const nextEntitlement = (await response.json()) as AppEntitlement;

      const current = entitlementRef.current;

      // A transient unauthenticated response (e.g. a momentarily missing
      // session cookie inside the WebView) must NOT downgrade a user we already
      // know is signed in — otherwise a paying user can flicker back to "Free".
      if (!nextEntitlement.isAuthenticated && current.isAuthenticated) {
        return current;
      }

      // Same user, server came back "free" but we already unlocked premium
      // locally (RevenueCat reconcile). Keep premium until a successful server
      // read confirms the downgrade.
      if (
        nextEntitlement.isAuthenticated &&
        !nextEntitlement.hasPremiumAccess &&
        current.isAuthenticated &&
        current.userId === nextEntitlement.userId &&
        current.hasPremiumAccess
      ) {
        return current;
      }

      setEntitlement(nextEntitlement);
      writeCachedEntitlement(nextEntitlement);
      return nextEntitlement;
    } catch (error) {
      console.error("Failed to refresh entitlement:", error);
      return readCachedEntitlement();
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setEntitlement(GUEST_ENTITLEMENT);
      setIsLoading(false);
      return;
    }

    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, refresh]);

  return {
    entitlement,
    isLoading,
    refresh,
    setEntitlement,
  };
}
