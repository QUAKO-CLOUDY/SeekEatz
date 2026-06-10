"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Crown, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { AuthProviders } from "@/app/components/AuthProviders";
import {
  type AppEntitlement,
  MONTHLY_PLAN_PRICE,
  YEARLY_PLAN_PRICE,
  getEntitlementPlanLabel,
  writeCachedEntitlement,
} from "@/lib/entitlements";
import { useAccountEntitlement } from "@/app/hooks/useAccountEntitlement";
import { bootstrapAccount } from "@/lib/bootstrap-account";
import { getFreeTierPlanDetails } from "@/lib/free-tier";
import { isRevenueCatConfigured } from "@/lib/billing/apple-products";
import {
  isNativeBillingBridgeAvailable,
  purchaseRevenueCatTier,
  reconcileRevenueCatEntitlement,
  restoreRevenueCatPurchases,
} from "@/lib/billing/revenuecat-client";
import { isNativeApp } from "@/lib/native-runtime";
import {
  WAITLIST_WELCOME_PATH,
  shouldShowWaitlistWelcomeScreen,
} from "@/lib/waitlist-welcome";
import { PREMIUM_PLAN_BENEFITS } from "@/lib/premium-benefits";

const PRIVACY_POLICY_URL = "https://seekeatz.com/legal/privacy";
const TERMS_OF_USE_URL =
  "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

function toUserFacingBillingError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("revenuecat is not fully configured yet")) {
    return "Purchases are temporarily unavailable right now. Please try again shortly.";
  }

  if (
    normalized.includes("no monthly package is available") ||
    normalized.includes("no yearly package is available")
  ) {
    return "Subscriptions are not available right now. Please try again shortly.";
  }

  return message;
}

const planCards = [
  {
    id: "yearly",
    name: "Yearly",
    price: `$${YEARLY_PLAN_PRICE.toFixed(2)}/year`,
    description: "",
    details: "Full access to all features and updates year-round.",
    cta: "Purchase Yearly",
    badge: "Best value",
  },
  {
    id: "monthly",
    name: "Monthly",
    price: `$${MONTHLY_PLAN_PRICE.toFixed(2)}/month`,
    description: "Flexible monthly billing with full premium access.",
    cta: "Purchase Monthly",
  },
  {
    id: "free",
    name: "Free",
    price: "$0",
    description: "",
    details: getFreeTierPlanDetails(),
    cta: "Create Free Account",
  },
];
function UpgradePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFromSignup = searchParams.get("fromSignup") === "1";
  const isFromSignin = searchParams.get("fromSignin") === "1";
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [isRestoringPurchases, setIsRestoringPurchases] = useState(false);
  const [isCheckingPostAuth, setIsCheckingPostAuth] = useState(
    () => isFromSignup || isFromSignin,
  );
  const { entitlement, refresh, setEntitlement } = useAccountEntitlement(true);

  const applyEntitlement = useCallback(
    (next: AppEntitlement | null | undefined) => {
      if (!next) {
        return;
      }
      setEntitlement(next);
      writeCachedEntitlement(next);
    },
    [setEntitlement],
  );
  const isMasterMode = searchParams.get("master") === "1";
  const shouldStartTutorial = searchParams.get("tutorial") === "1";
  const postSignupUpgradePath = "/upgrade?fromSignup=1";
  const postAuthRedirect = "/upgrade?fromSignin=1";
  const encodedPostAuthRedirect = encodeURIComponent(postAuthRedirect);
  const encodedPostSignupUpgradePath = encodeURIComponent(postSignupUpgradePath);
  const signInHref = `/auth/signin?redirectTo=${encodedPostAuthRedirect}&switch=1${shouldStartTutorial ? "&tutorial=1" : ""}${isMasterMode ? "&master=1" : ""}`;
  const signUpHref = `/auth/signup?redirectTo=${encodedPostSignupUpgradePath}&switch=1${isMasterMode ? "&master=1" : ""}`;

  const routeAfterPlanSelection = useCallback(() => {
    // The intro onboarding slides are shown once before account creation, so
    // after a brand-new user picks a plan we go straight into the in-app
    // tutorial rather than repeating onboarding.
    if (typeof window !== "undefined" && (isFromSignup || shouldStartTutorial)) {
      localStorage.setItem("seekeatz_start_app_tutorial", "true");
      localStorage.removeItem("seekeatz_current_screen");
      localStorage.removeItem("seekeatz_nav_history");
    }

    router.push("/chat");
  }, [isFromSignup, shouldStartTutorial, router]);

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
        let alreadyPremium = false;
        let refreshedEntitlement: AppEntitlement | null = null;
        try {
          const bootstrapResult = await bootstrapAccount({
            hasCompletedOnboarding: getOnboardingFlag(),
          });
          refreshedEntitlement = bootstrapResult.entitlement;
          alreadyPremium = refreshedEntitlement.hasPremiumAccess === true;
          applyEntitlement(refreshedEntitlement);
        } catch (error) {
          console.warn("Upgrade bootstrap skipped:", error);
          refreshedEntitlement = (await refresh()) ?? null;
          alreadyPremium = refreshedEntitlement?.hasPremiumAccess === true;
        }

        // Reconcile against RevenueCat on load so a user who already owns an
        // active subscription (StoreKit "already subscribed") gets upgraded
        // without needing to purchase again.
        if (isNativeApp() && (isNativeBillingBridgeAvailable() || isRevenueCatConfigured())) {
          try {
            const reconciled = await reconcileRevenueCatEntitlement({
              appUserID: user.id,
              email: user.email ?? null,
            });
            const reconciledEntitlement = reconciled?.synced?.entitlement as
              | AppEntitlement
              | undefined;
            applyEntitlement(reconciledEntitlement);
            if (reconciledEntitlement?.hasPremiumAccess || reconciled?.premiumActive) {
              alreadyPremium = true;
            }
          } catch (error) {
            console.warn("Entitlement reconcile skipped:", error);
          }
        }

        // Post-auth users should never flash the paywall. Waitlist trial users
        // are sent to the one-time welcome screen; everyone else goes to chat.
        if (
          isFromSignup &&
          refreshedEntitlement &&
          shouldShowWaitlistWelcomeScreen(user.id, refreshedEntitlement)
        ) {
          router.replace(WAITLIST_WELCOME_PATH);
          return;
        }

        if (alreadyPremium && (isFromSignup || isFromSignin)) {
          router.replace("/chat");
          return;
        }
      }

      if (isFromSignup || isFromSignin) {
        setIsCheckingPostAuth(false);
      }
    };

    void loadUser();

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
  }, [applyEntitlement, getOnboardingFlag, refresh, router, isFromSignup, isFromSignin]);
  const nativeApp = isNativeApp();
  const iapReady = nativeApp
    ? isNativeBillingBridgeAvailable() || isRevenueCatConfigured()
    : isRevenueCatConfigured();

  const openExternalLegalUrl = useCallback((url: string) => {
    if (typeof window === "undefined") {
      return;
    }

    if (isNativeApp()) {
      const nativeBridge = (
        window as Window & {
          ReactNativeWebView?: { postMessage?: (message: string) => void };
        }
      ).ReactNativeWebView;

      if (nativeBridge?.postMessage) {
        nativeBridge.postMessage(
          JSON.stringify({
            type: "open_external_url",
            url,
          }),
        );
        return;
      }
    }

    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) {
      window.location.href = url;
    }
  }, []);

  const handlePurchase = useCallback(
    async (planId: "monthly" | "yearly") => {
      if (!authUserId) {
        return;
      }

      try {
        setBillingError(null);
        setBillingMessage(null);
        setPendingPlanId(planId);
        const purchase = await purchaseRevenueCatTier({
          tier: planId,
          appUserID: authUserId,
          email: authEmail,
        });
        // Update app state immediately from the synced entitlement so premium
        // unlocks without an app restart, then re-confirm against the server.
        applyEntitlement(purchase?.synced?.entitlement as AppEntitlement | undefined);
        await refresh();
        routeAfterPlanSelection();
      } catch (error) {
        // The user may already own this subscription ("already subscribed").
        // Reconcile from RevenueCat customerInfo before surfacing an error so
        // an existing active entitlement still upgrades the account.
        try {
          const reconciled = await reconcileRevenueCatEntitlement({
            appUserID: authUserId,
            email: authEmail,
          });
          const reconciledEntitlement = reconciled?.synced?.entitlement as
            | AppEntitlement
            | undefined;
          if (reconciledEntitlement?.hasPremiumAccess) {
            applyEntitlement(reconciledEntitlement);
            await refresh();
            routeAfterPlanSelection();
            return;
          }
        } catch (reconcileError) {
          console.warn("Reconcile after purchase error failed:", reconcileError);
        }

        const message =
          error instanceof Error ? error.message : "Purchase could not be completed.";
        setBillingError(toUserFacingBillingError(message));
      } finally {
        setPendingPlanId(null);
      }
    },
    [applyEntitlement, authEmail, authUserId, refresh, routeAfterPlanSelection],
  );

  const handleRestorePurchases = useCallback(async () => {
    if (!authUserId) {
      return;
    }

    try {
      setBillingError(null);
      setBillingMessage(null);
      setIsRestoringPurchases(true);
      const restore = await restoreRevenueCatPurchases({
        appUserID: authUserId,
        email: authEmail,
      });
      applyEntitlement(restore?.synced?.entitlement as AppEntitlement | undefined);
      const restored = await refresh();

      if (restored.hasPremiumAccess) {
        setBillingMessage("Purchases restored. Your premium access is active.");
      } else {
        setBillingMessage("No previous purchases were found on this Apple ID.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Restore purchases failed.";
      setBillingError(toUserFacingBillingError(message));
    } finally {
      setIsRestoringPurchases(false);
    }
  }, [applyEntitlement, authEmail, authUserId, refresh]);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(isSignedIn ? "/settings" : "/");
  }, [isSignedIn, router]);

  if (isCheckingPostAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-background text-foreground">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-start px-4 py-6 sm:px-6 sm:py-10">
        <button
          type="button"
          onClick={handleBack}
          className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background/90 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="rounded-[2rem] border border-border bg-card p-5 shadow-xl sm:p-8">
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
            <div className="rounded-2xl border border-border bg-background/80 p-5">
              <p className="text-base font-semibold leading-snug text-foreground">
                {isSignedIn
                  ? `Current plan: ${getEntitlementPlanLabel(entitlement)}`
                  : "Choose your plan and start finding meals instantly."}
              </p>
              {isSignedIn && entitlement.hasPremiumAccess ? (
                <div className="mt-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                  Premium active
                </div>
              ) : null}
              {isSignedIn ? (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {entitlement.hasPremiumAccess
                    ? entitlement.billingStatus === "trialing" && entitlement.trialExpiresAt
                      ? `Your waitlist free month is active through ${new Date(entitlement.trialExpiresAt).toLocaleDateString()}.`
                      : "Premium active."
                    : "Pick a plan below to unlock unlimited access."}
                </p>
              ) : null}
            </div>

            <div className="grid auto-rows-fr gap-4 md:grid-cols-3 md:items-stretch">
              {planCards.map((plan) => {
                const isCurrentPlan =
                  isSignedIn &&
                  entitlement.hasPremiumAccess &&
                  (plan.id === "monthly" || plan.id === "yearly") &&
                  entitlement.billingTier === plan.id;

                return (
                <div
                  key={plan.id}
                  className={`flex min-h-0 w-full flex-col self-stretch overflow-hidden rounded-[1.75rem] border p-4 sm:p-5 ${
                    isCurrentPlan
                      ? "border-emerald-400 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 shadow-lg shadow-emerald-100/70 ring-2 ring-emerald-400/40"
                      : plan.id === "free"
                      ? "border-border bg-background/80"
                      : plan.id === "yearly"
                        ? "border-cyan-300 bg-gradient-to-br from-cyan-50 via-white to-blue-50 shadow-lg shadow-cyan-100/70"
                        : "border-border bg-background/80"
                  }`}
                >
                  <div className="shrink-0 space-y-3">
                    {/* Same layout height on all cards: invisible copy reserves space on Free/Monthly */}
                    <div className="flex items-center justify-center">
                      {plan.badge ? (
                        <span className="inline-flex whitespace-nowrap rounded-full border border-cyan-400/50 bg-gradient-to-r from-cyan-500/20 via-cyan-400/15 to-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-cyan-900 shadow-sm ring-1 ring-cyan-500/25 dark:text-cyan-100">
                          {plan.badge}
                        </span>
                      ) : (
                        <span
                          className="invisible inline-flex whitespace-nowrap rounded-full border border-cyan-400/50 bg-gradient-to-r from-cyan-500/20 via-cyan-400/15 to-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-cyan-900 shadow-sm ring-1 ring-cyan-500/25 dark:text-cyan-100"
                          aria-hidden
                        >
                          {planCards.find((p) => p.badge)?.badge ?? "Best value"}
                        </span>
                      )}
                    </div>
                    <div className="flex min-h-[3.75rem] flex-col items-start justify-center gap-1 border-b border-border/60 pb-3">
                      <p className="min-w-0 text-base font-semibold leading-tight text-foreground">
                        {plan.name}
                      </p>
                      <p className="w-full break-words text-sm font-semibold leading-snug tracking-tight text-foreground tabular-nums">
                        {plan.price}
                      </p>
                    </div>
                    {plan.description && plan.id !== "monthly" ? (
                      <p className="text-sm text-muted-foreground">{plan.description}</p>
                    ) : null}
                  </div>

                  <div className="mt-4 flex min-h-0 flex-1 flex-col">
                    {plan.id === "monthly" || plan.id === "yearly" ? (
                      <>
                        {plan.id === "monthly" ? (
                          <p className="px-1 text-sm leading-6 text-muted-foreground">{plan.description}</p>
                        ) : plan.details ? (
                          <p className="px-1 text-sm leading-6 text-muted-foreground">{plan.details}</p>
                        ) : null}
                        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                          {PREMIUM_PLAN_BENEFITS.map((benefit) => (
                            <div key={benefit} className="flex items-center gap-3">
                              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-500">
                                <Check className="h-4 w-4" />
                              </span>
                              <span>{benefit}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm leading-relaxed text-muted-foreground">{plan.details}</p>
                    )}
                  </div>

                  <div className="mt-auto shrink-0 pt-6">
                    <button
                      type="button"
                      disabled={
                        isCurrentPlan
                          ? true
                          : plan.id === "free"
                          ? false
                          : isSignedIn
                            ? pendingPlanId !== null || (isNativeApp() && !iapReady)
                            : false
                      }
                      onClick={() => {
                        if (isCurrentPlan) {
                          return;
                        }
                        if (plan.id === "free") {
                          if (isSignedIn) {
                            routeAfterPlanSelection();
                            return;
                          }

                          router.push(
                            `/auth/signup?redirectTo=${encodedPostSignupUpgradePath}&switch=1&plan=free&method=email${isMasterMode ? "&master=1" : ""}`,
                          );
                          return;
                        }

                        if (!isSignedIn) {
                          router.push(`${signUpHref}&plan=${plan.id}`);
                          return;
                        }

                        if (plan.id === "monthly" || plan.id === "yearly") {
                          if (!isNativeApp()) {
                            setBillingError("Purchases are available only in the iOS app.");
                            return;
                          }
                          if (!iapReady) {
                            setBillingError("Purchases are temporarily unavailable right now. Please try again shortly.");
                            return;
                          }
                          void handlePurchase(plan.id);
                        }
                      }}
                      className={`w-full rounded-full px-5 py-4 text-base font-semibold text-white shadow-lg disabled:cursor-not-allowed ${
                        isCurrentPlan
                          ? "bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-emerald-500/25 disabled:opacity-100"
                          : "bg-gradient-to-r from-cyan-500 to-blue-600 shadow-cyan-500/25 disabled:opacity-50"
                      }`}
                    >
                      {isCurrentPlan
                        ? "Purchased"
                        : plan.id === "free"
                        ? isSignedIn
                          ? "Continue"
                          : plan.cta
                        : !isSignedIn
                          ? plan.cta
                          : pendingPlanId === plan.id
                            ? "Processing..."
                            : plan.cta}
                    </button>
                  </div>
                </div>
                );
              })}
            </div>

            {!isSignedIn ? (
              <>
                <AuthProviders
                  className="mt-2"
                  oauthRedirectPath={postSignupUpgradePath}
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

            {billingMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {billingMessage}
              </div>
            ) : null}

            {billingError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {billingError}
              </div>
            ) : null}

            {isSignedIn && isNativeApp() && !iapReady && !entitlement.hasPremiumAccess && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Subscriptions are temporarily unavailable. Please try again shortly.
              </div>
            )}

            {iapReady && !isNativeApp() && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                In-app purchases are unavailable on this device.
              </div>
            )}

            <div className="rounded-2xl border border-border bg-background/80 px-4 py-3">
              <div className="flex items-center justify-center gap-4 text-sm">
                <button
                  type="button"
                  onClick={() => openExternalLegalUrl(PRIVACY_POLICY_URL)}
                  className="font-medium text-cyan-700 underline underline-offset-2 hover:text-cyan-800"
                >
                  Privacy Policy
                </button>
                <button
                  type="button"
                  onClick={() => openExternalLegalUrl(TERMS_OF_USE_URL)}
                  className="font-medium text-cyan-700 underline underline-offset-2 hover:text-cyan-800"
                >
                  Terms of Use
                </button>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Auto-renewing subscription. Payment is charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless canceled at least 24 hours before the end of the current billing period.
            </p>
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

