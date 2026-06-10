"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { WaitlistWelcomeScreen } from "@/app/components/WaitlistWelcomeScreen";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import type { AppEntitlement } from "@/lib/entitlements";
import {
  clearWaitlistWelcomePending,
  hasPendingWaitlistWelcome,
  hasSeenWaitlistWelcome,
  markWaitlistWelcomeSeen,
  shouldShowWaitlistWelcomeScreen,
  startAppTutorialAfterWelcome,
} from "@/lib/waitlist-welcome";

function WaitlistWelcomePageContent() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<AppEntitlement | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadWelcomeState = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth/signin");
        return;
      }

      if (cancelled) {
        return;
      }

      setUserId(user.id);

      if (hasSeenWaitlistWelcome(user.id)) {
        clearWaitlistWelcomePending();
        router.replace("/chat");
        return;
      }

      if (!hasPendingWaitlistWelcome(user.id)) {
        try {
          const response = await authenticatedFetch("/api/account/entitlement", {
            method: "GET",
            cache: "no-store",
          });

          if (response.ok) {
            const entitlementPayload = (await response.json()) as AppEntitlement;
            if (!shouldShowWaitlistWelcomeScreen(user.id, entitlementPayload)) {
              router.replace("/chat");
              return;
            }
            setEntitlement(entitlementPayload);
            setIsReady(true);
            return;
          }
        } catch (error) {
          console.warn("Waitlist welcome entitlement check failed:", error);
        }

        router.replace("/chat");
        return;
      }

      try {
        const response = await authenticatedFetch("/api/account/entitlement", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Entitlement request failed: ${response.status}`);
        }

        const entitlementPayload = (await response.json()) as AppEntitlement;

        if (cancelled) {
          return;
        }

        setEntitlement(entitlementPayload);
        setIsReady(true);
      } catch (error) {
        console.warn("Waitlist welcome load failed:", error);
        if (!cancelled) {
          router.replace("/chat");
        }
      }
    };

    void loadWelcomeState();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleContinue = useCallback(() => {
    if (!userId) {
      return;
    }

    markWaitlistWelcomeSeen(userId);
    clearWaitlistWelcomePending();
    startAppTutorialAfterWelcome();
    router.replace("/chat");
  }, [router, userId]);

  if (!isReady || !entitlement) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" aria-label="Loading" />
      </div>
    );
  }

  return (
    <WaitlistWelcomeScreen onContinue={handleContinue} />
  );
}

export default function WaitlistWelcomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-500" aria-label="Loading" />
        </div>
      }
    >
      <WaitlistWelcomePageContent />
    </Suspense>
  );
}
