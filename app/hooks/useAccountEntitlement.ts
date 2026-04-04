"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppEntitlement } from "@/lib/entitlements";
import {
  GUEST_ENTITLEMENT,
  readCachedEntitlement,
  writeCachedEntitlement,
} from "@/lib/entitlements";

export function useAccountEntitlement(enabled = true) {
  const [entitlement, setEntitlement] = useState<AppEntitlement>(() => readCachedEntitlement());
  const [isLoading, setIsLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return GUEST_ENTITLEMENT;
    }

    try {
      setIsLoading(true);
      const response = await fetch("/api/account/entitlement", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Entitlement request failed: ${response.status}`);
      }

      const nextEntitlement = (await response.json()) as AppEntitlement;
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
