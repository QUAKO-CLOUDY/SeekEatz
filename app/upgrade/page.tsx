"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Crown } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { AuthProviders } from "@/app/components/AuthProviders";

const premiumBenefits = [
  "Unlimited AI searches",
  "Smarter results",
  "AI swaps",
  "Meal logging",
  "Saved meals",
];

export default function UpgradePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSignedIn, setIsSignedIn] = useState(false);
  const isMasterMode = searchParams.get("master") === "1";
  const signInHref = `/auth/signin?redirectTo=%2Fupgrade&switch=1${isMasterMode ? "&master=1" : ""}`;
  const signUpHref = `/auth/signup?redirectTo=%2Fupgrade&switch=1${isMasterMode ? "&master=1" : ""}`;

  useEffect(() => {
    const supabase = createClient();

    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsSignedIn(!!user);
    };

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(!!session?.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkoutUrl = useMemo(() => process.env.NEXT_PUBLIC_PREMIUM_CHECKOUT_URL?.trim() || "", []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-10">
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
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Keep the fast meal search flow, then unlock the tools that turn it into a daily system.
          </p>

          <div className="mt-8 space-y-3 rounded-[1.5rem] bg-muted/60 p-5">
            {premiumBenefits.map((benefit) => (
              <div key={benefit} className="flex items-center gap-3 text-sm">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-500">
                  <Check className="h-4 w-4" />
                </span>
                <span>{benefit}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 space-y-3">
            {isSignedIn ? (
              checkoutUrl ? (
                <a
                  href={checkoutUrl}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-cyan-500/25"
                >
                  Activate premium
                  <ArrowRight className="h-4 w-4" />
                </a>
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Your account is ready. Connect the premium checkout link next, then this button will take users straight to payment.
                </div>
              )
            ) : (
              <>
                <AuthProviders
                  className="mt-0"
                  emailHref={signUpHref}
                  oauthRedirectPath="/upgrade"
                />
                <button
                  type="button"
                  onClick={() => router.push(signInHref)}
                  className="w-full rounded-full border border-border bg-background px-5 py-4 text-base font-semibold text-foreground"
                >
                  I already have an account
                </button>
                <p className="px-2 text-center text-sm leading-6 text-muted-foreground">
                  Create your account first. After sign-in, you&apos;ll come right back here to activate premium.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
