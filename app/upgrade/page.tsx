"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Crown } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { AuthProviders } from "@/app/components/AuthProviders";
import { MONTHLY_PLAN_PRICE, YEARLY_PLAN_PRICE, getEntitlementPlanLabel } from "@/lib/entitlements";
import { useAccountEntitlement } from "@/app/hooks/useAccountEntitlement";
import { bootstrapAccount } from "@/lib/bootstrap-account";
import { isRevenueCatConfigured } from "@/lib/billing/apple-products";
import {
  purchaseRevenueCatTier,
  restoreRevenueCatPurchases,
} from "@/lib/billing/revenuecat-client";
import { isNativeApp } from "@/lib/native-runtime";

const premiumBenefits = [
  "Unlimited searches",
  "Smarter, goal-based results",
  "Access to full database",
  "AI-powered swaps",
  "Save and log your meals",
];

const planCards = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    description: "2 free chats a day.",
    details: "Includes only 2 AI searches a day with no access to any of the premium features.",
    cta: "Create Free Account",
  },
  {
    id: "monthly",
    name: "Monthly",
    price: `$${MONTHLY_PLAN_PRICE.toFixed(2)}/month`,
    description: "Flexible monthly billing with full premium access.",
    cta: "Purchase Monthly",
  },
  {
    id: "yearly",
    name: "Yearly",
    price: `$${YEARLY_PLAN_PRICE.toFixed(2)}/year`,
    description: "",
    details: "Full access to all features and updates year-round.",
    cta: "Purchase Yearly",
    badge: "Best value",
  },
];

function UpgradePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [isRestoringPurchases, setIsRestoringPurchases] = useState(false);
  const { entitlement, refresh } = useAccountEntitlement(true);
  const isMasterMode = searchParams.get("master") === "1";
  const shouldStartTutorial = searchParams.get("tutorial") === "1";
  const postSignupOnboardingPath = "/onboarding?afterSignup=1";
  const postAuthRedirect = shouldStartTutorial ? "/chat" : "/upgrade";
  const encodedPostAuthRedirect = encodeURIComponent(postAuthRedirect);
  const encodedPostSignupOnboardingPath = encodeURIComponent(postSignupOnboardingPath);
  const signInHref = `/auth/signin?redirectTo=${encodedPostAuthRedirect}&switch=1${shouldStartTutorial ? "&tutorial=1" : ""}${isMasterMode ? "&master=1" : ""}`;
  const signUpHref = `/auth/signup?redirectTo=${encodedPostSignupOnboardingPath}&switch=1&tutorial=1${isMasterMode ? "&master=1" : ""}`;

  const getOnboardingFlag = useCallback(
    () =>
      typeof window !== "undefined" &&
      (localStorage.getItem("hasCompletedOnboarding") === "true" ||
        localStorage.getItem("onboarded") === "true"),
    [],
  );

  useEffect(() => {
    const supabase = createClient();

    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsSignedIn(!!user);
      setAuthUserId(user?.id ?? null);
      setAuthEmail(user?.email ?? null);
      if (user) {
        try {
          await bootstrapAccount({ hasCompletedOnboarding: getOnboardingFlag() });
          await refresh();
        } catch (error) {
          console.warn("Upgrade bootstrap skipped:", error);
        }
      }
    };

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(!!session?.user);
      setAuthUserId(session?.user?.id ?? null);
      setAuthEmail(session?.user?.email ?? null);
      if (session?.user) {
        void bootstrapAccount({ hasCompletedOnboarding: getOnboardingFlag() }).catch((error) => {
          console.warn("Upgrade bootstrap skipped:", error);
        });
        void refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [getOnboardingFlag, refresh]);
  const iapReady = isRevenueCatConfigured();

  const handlePurchase = useCallback(
    async (planId: "monthly" | "yearly") => {
      if (!authUserId) {
        return;
      }

      try {
        setBillingError(null);
        setPendingPlanId(planId);
        await purchaseRevenueCatTier({
          tier: planId,
          appUserID: authUserId,
          email: authEmail,
        });
        await refresh();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Purchase could not be completed.";
        setBillingError(message);
      } finally {
        setPendingPlanId(null);
      }
    },
    [authEmail, authUserId, refresh],
  );

  const handleRestorePurchases = useCallback(async () => {
    if (!authUserId) {
      return;
    }

    try {
      setBillingError(null);
      setIsRestoringPurchases(true);
      await restoreRevenueCatPurchases({
        appUserID: authUserId,
        email: authEmail,
      });
      await refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Restore purchases failed.";
      setBillingError(message);
    } finally {
      setIsRestoringPurchases(false);
    }
  }, [authEmail, authUserId, refresh]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-10">
        <div className="rounded-[2rem] border border-border bg-card p-8 shadow-xl">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25">
            <Crown className="h-7 w-7" />
          </div>

          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-500">
            SeekEatz Premium
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight">
            You&apos;re one step away from always knowing what to order.
          </h1>

          <div className="mt-8 space-y-3">
            <div className="rounded-2xl border border-border bg-background/80 p-4">
              <p className="text-sm font-semibold text-foreground">
                {isSignedIn
                  ? `Current plan: ${getEntitlementPlanLabel(entitlement)}`
                  : "Choose the plan that fits how often you use SeekEatz."}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {isSignedIn
                  ? entitlement.hasPremiumAccess
                    ? entitlement.billingStatus === "trialing" && entitlement.trialExpiresAt
                      ? `Your waitlist free month is active through ${new Date(entitlement.trialExpiresAt).toLocaleDateString()}.`
                      : "Premium is active on this account."
                    : "Pick a plan below to unlock unlimited access."
                  : "Your free daily chats are up. Upgrade to premium to unlock full access."}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {planCards.map((plan) => (
                <div
                  key={plan.id}
                  className={`flex h-full flex-col rounded-[1.75rem] border p-5 ${
                    plan.id === "free"
                      ? "border-border bg-background/80"
                      : plan.id === "yearly"
                        ? "border-cyan-300 bg-gradient-to-br from-cyan-50 via-white to-blue-50 shadow-lg shadow-cyan-100/70"
                        : "border-border bg-background/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-base font-semibold text-foreground">{plan.name}</p>
                        {plan.badge ? (
                          <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700">
                            {plan.badge}
                          </span>
                        ) : null}
                      </div>
                      {plan.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                      ) : null}
                    </div>
                    <p className="text-sm font-semibold text-foreground">{plan.price}</p>
                  </div>
                  {plan.id === "monthly" ? (
                    <div className="mt-5 space-y-3 text-sm text-muted-foreground">
                      {premiumBenefits.map((benefit) => (
                        <div key={benefit} className="flex items-center gap-3">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-500">
                            <Check className="h-4 w-4" />
                          </span>
                          <span>{benefit}</span>
                        </div>
                      ))}
                    </div>
                  ) : plan.id === "yearly" ? (
                    <div className="mt-7 px-1 text-sm leading-6 text-muted-foreground">
                      {plan.details}
                    </div>
                  ) : (
                    <div className="mt-7 px-1 text-sm leading-6 text-muted-foreground">
                      {plan.details}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={
                      plan.id === "free"
                        ? false
                        : isSignedIn
                          ? !iapReady ||
                            !isNativeApp() ||
                            entitlement.hasPremiumAccess ||
                            pendingPlanId !== null
                          : false
                    }
                    onClick={() => {
                      if (plan.id === "free") {
                        router.push(
                          `/auth/signup?redirectTo=${encodedPostSignupOnboardingPath}&switch=1&tutorial=1&plan=free&method=email${isMasterMode ? "&master=1" : ""}`,
                        );
                        return;
                      }

                      if (!isSignedIn) {
                        router.push(`${signUpHref}&plan=${plan.id}`);
                        return;
                      }

                      if (plan.id === "monthly" || plan.id === "yearly") {
                        void handlePurchase(plan.id);
                      }
                    }}
                    className={`w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50 ${
                      plan.id === "monthly" ? "mt-8" : "mt-6"
                    }`}
                  >
                    {plan.id === "free"
                      ? plan.cta
                      : entitlement.hasPremiumAccess
                      ? "Current plan active"
                      : !isSignedIn
                        ? plan.cta
                        : pendingPlanId === plan.id
                          ? "Processing..."
                          : iapReady && isNativeApp()
                          ? plan.cta
                          : "Finish purchase in the iOS app"}
                  </button>
                </div>
              ))}
            </div>

            {!isSignedIn ? (
              <>
                <AuthProviders
                  className="mt-2"
                  emailHref={signUpHref}
                  oauthRedirectPath={postSignupOnboardingPath}
                  onBeforeRedirect={() => {
                    if (typeof window !== "undefined") {
                      localStorage.setItem("seekeatz_start_app_tutorial", "true");
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => router.push(signInHref)}
                  className="w-full rounded-full border border-border bg-background px-5 py-4 text-base font-semibold text-foreground"
                >
                  I already have an account
                </button>
              </>
            ) : null}

            {isSignedIn && isNativeApp() && iapReady && !entitlement.hasPremiumAccess ? (
              <button
                type="button"
                onClick={() => void handleRestorePurchases()}
                disabled={isRestoringPurchases || pendingPlanId !== null}
                className="w-full rounded-full border border-border bg-background px-5 py-4 text-base font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRestoringPurchases ? "Restoring purchases..." : "Restore purchases"}
              </button>
            ) : null}

            {billingError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {billingError}
              </div>
            ) : null}

            {!iapReady && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Apple billing is not fully configured yet. Add the RevenueCat public SDK key and App Store product ids before enabling purchases.
              </div>
            )}

            {iapReady && !isNativeApp() && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Purchases run inside the iOS app shell. The web app keeps the upgrade UI and account state in sync, but billing is completed natively.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={null}>
      <UpgradePageContent />
    </Suspense>
  );
}
