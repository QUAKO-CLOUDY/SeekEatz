"use client";

import { Suspense, useState, useRef, FormEvent, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

import { createClient } from "@/utils/supabase/client";
import { Label } from "@/app/components/ui/label";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { getGuestChatForMigration, clearGuestSessionFull } from "@/lib/guest-session";
import { claimAnonymousData } from "@/lib/claim-anon-data";
import { AuthProviders } from "@/app/components/AuthProviders";
import { bootstrapAccount } from "@/lib/bootstrap-account";
import { resolveSignupDestination } from "@/lib/post-auth-routing";
import { getFreeTierSignupDescription } from "@/lib/free-tier";
import type { UserProfile } from "@/app/types";
import {
  clearLoggedMealsStorageForUser,
  getLoggedMealsStorageKey,
} from "@/lib/logged-meals-storage";
import { CHAT_PERSISTENCE_ENABLED } from "@/lib/chat-persistence";

const THIRTY_MINUTES = 30 * 60 * 1000;
const EMAIL_OTP_LENGTH = 6;

type PendingOnboardingProfile = {
  goal?: string;
  diet_type?: string;
  dietary_options?: string[];
  target_calories?: number;
  target_protein_g?: number;
  target_carbs_g?: number;
  target_fats_g?: number;
  preferredMealTypes?: string[];
  search_distance_miles?: number;
  [key: string]: unknown;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const redirectTo = searchParams.get("redirectTo") || "/upgrade?fromSignup=1";
  const isMasterMode = searchParams.get("master") === "1";
  const isSwitchAccountMode = searchParams.get("switch") === "1";
  const shouldStartTutorial = searchParams.get("tutorial") === "1";
  const emailOnly = searchParams.get("method") === "email";
  const selectedPlan = searchParams.get("plan");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OTP verification state
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(
    Array.from({ length: EMAIL_OTP_LENGTH }, () => "")
  );
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetSavedMealStorageForUser = (userId: string) => {
    if (typeof window === "undefined") return;

    clearLoggedMealsStorageForUser(userId);

    const keysToRemove = [
      "seekeatz_favorite_meals",
      "seekeatz_favorite_meals_data",
      "seekeatz_favorite_meals:guest",
      "seekeatz_favorite_meals_data:guest",
      `seekeatz_favorite_meals:${userId}`,
      `seekeatz_favorite_meals_data:${userId}`,
    ];

    keysToRemove.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(`seekeatz_favorite_meals:${userId}`, JSON.stringify([]));
    localStorage.setItem(`seekeatz_favorite_meals_data:${userId}`, JSON.stringify({}));
    localStorage.setItem(getLoggedMealsStorageKey(userId), JSON.stringify([]));
  };

  // 🧠 Guard: if already logged in + onboarding done + last login < 30 min → skip this screen
  useEffect(() => {
    const checkExistingSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || typeof window === "undefined" || isMasterMode) return;

      if (isSwitchAccountMode) {
        await supabase.auth.signOut();
        return;
      }

      const completed = localStorage.getItem("hasCompletedOnboarding") === "true" ||
        localStorage.getItem("onboarded") === "true";
      const lastLoginStr = localStorage.getItem("seekEatz_lastLogin");
      const lastLogin = lastLoginStr ? Number(lastLoginStr) : 0;

      if (
        completed &&
        lastLogin &&
        Date.now() - lastLogin < THIRTY_MINUTES
      ) {
        router.replace(redirectTo);
      }
    };

    checkExistingSession();
  }, [isMasterMode, isSwitchAccountMode, redirectTo, router, supabase]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const fullName = `${normalizedFirstName} ${normalizedLastName}`.trim();

    if (!normalizedFirstName || !normalizedLastName) {
      setError("Please enter your first and last name.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setIsLoading(true);

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            first_name: normalizedFirstName,
            last_name: normalizedLastName,
          },
        },
      });

      if (signUpError) {
        setIsLoading(false);
        // Check if error is "user already registered" or similar
        const errorMessage = signUpError.message.toLowerCase();
        if (errorMessage.includes("already registered") ||
          errorMessage.includes("user already exists") ||
          errorMessage.includes("email address is already registered") ||
          errorMessage.includes("already been registered")) {
          setError("An account with this email already exists. Please sign in instead.");
          // Don't clear pending onboarding profile - user can use it when they sign in
          return;
        }
        setError(signUpError.message);
        return;
      }

      // Account created successfully
      if (signUpData.user) {
        // Supabase returns a user with empty identities for existing emails
        // (when email confirmation is disabled) — detect this and show signin link
        if (!signUpData.user.identities || signUpData.user.identities.length === 0) {
          setIsLoading(false);
          setError("An account with this email already exists. Please sign in instead.");
          return;
        }

        // Signup successful — Supabase sends OTP email automatically
        // Show OTP verification screen
        setIsLoading(false);
        setShowOtpScreen(true);
        setOtpDigits(Array.from({ length: EMAIL_OTP_LENGTH }, () => ""));
        setOtpError(null);
        startResendCooldown();
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Something went wrong. Please try again."));
      setIsLoading(false);
    }
  };

  // Start 60s cooldown for resend button
  const startResendCooldown = () => {
    setResendCooldown(60);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          if (resendTimerRef.current) clearInterval(resendTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, []);

  // Handle OTP digit input
  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste: distribute digits across inputs
      const digits = value.replace(/\D/g, "").slice(0, EMAIL_OTP_LENGTH).split("");
      const newOtpDigits = [...otpDigits];
      digits.forEach((digit, i) => {
        if (index + i < EMAIL_OTP_LENGTH) newOtpDigits[index + i] = digit;
      });
      setOtpDigits(newOtpDigits);
      // Focus the next empty input or the last one
      const nextIndex = Math.min(index + digits.length, EMAIL_OTP_LENGTH - 1);
      otpInputRefs.current[nextIndex]?.focus();
      return;
    }

    if (!/^\d?$/.test(value)) return; // Only allow single digit

    const newOtpDigits = [...otpDigits];
    newOtpDigits[index] = value;
    setOtpDigits(newOtpDigits);

    // Auto-focus next input
    if (value && index < EMAIL_OTP_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  // Handle backspace in OTP input
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  // Verify OTP and complete signup
  const handleVerifyOtp = async () => {
    const otpCode = otpDigits.join('');
    if (otpCode.length !== EMAIL_OTP_LENGTH) {
      setOtpError(`Please enter the full ${EMAIL_OTP_LENGTH}-digit code.`);
      return;
    }

    setIsLoading(true);
    setOtpError(null);

    try {
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otpCode,
        type: 'signup',
      });

      if (verifyError) {
        setOtpError(verifyError.message);
        setIsLoading(false);
        return;
      }

      if (!verifyData.user) {
        setOtpError("Verification failed. Please try again.");
        setIsLoading(false);
        return;
      }

      // OTP verified — now run all post-signup logic
      const now = Date.now();
      const userId = verifyData.user.id;
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      // New accounts should always start with clean local app state.
      resetSavedMealStorageForUser(userId);

      // Check if signup is from chat gate
      const isFromChatGate = typeof window !== 'undefined' &&
        localStorage.getItem('seekeatz_signup_from_chat_gate') === 'true';

      // Load pending onboarding profile if it exists
      let profile: PendingOnboardingProfile | null = null;
      const pendingProfile = localStorage.getItem("pendingOnboardingProfile");
      if (pendingProfile) {
        try {
          profile = JSON.parse(pendingProfile) as PendingOnboardingProfile;
          localStorage.removeItem("pendingOnboardingProfile");
        } catch (e) {
          console.warn("Failed to parse pending onboarding profile:", e);
        }
      }

      // Clear chat gate flag
      if (isFromChatGate && typeof window !== 'undefined') {
        localStorage.removeItem('seekeatz_signup_from_chat_gate');
      }

      // Migrate guest chat messages to Supabase (only when persistence is enabled)
      if (CHAT_PERSISTENCE_ENABLED) {
      try {
        const { sessionId, messages: guestMessages } = getGuestChatForMigration();
        if (sessionId && guestMessages.length > 0) {
          const { error: sessionError } = await supabase
            .from('chat_sessions')
            .upsert({ session_id: sessionId, user_id: userId }, { onConflict: 'session_id' });

          if (!sessionError) {
            const messagesToInsert = guestMessages
              .filter(msg => !msg.isGateMessage)
              .map(msg => ({
                session_id: sessionId,
                role: msg.role,
                content: msg.content,
                meal_data: msg.meals ? JSON.parse(JSON.stringify(msg.meals)) : null,
                meal_search_context: msg.mealSearchContext ? JSON.parse(JSON.stringify(msg.mealSearchContext)) : null,
              }));

            if (messagesToInsert.length > 0) {
              await supabase.from('messages').insert(messagesToInsert);
            }
          }
        }
      } catch (migrationError) {
        console.warn('Guest chat migration skipped:', migrationError);
      }
      }

      // Wait for auth/profile propagation before bootstrap.
      await new Promise(resolve => setTimeout(resolve, 500));

      const profileForBootstrap: Partial<UserProfile> = {
        ...(profile ? profile as Partial<UserProfile> : {}),
        full_name: fullName,
      };

      localStorage.setItem("userProfile", JSON.stringify(profileForBootstrap));

      // Claim anonymous data
      try {
        await claimAnonymousData();
      } catch (claimError) {
        console.warn('Anonymous data claim skipped:', claimError);
      }

      // Clear guest session
      if (typeof window !== 'undefined') {
        try { clearGuestSessionFull(); } catch { /* noop */ }
      }

      // Set localStorage flags
      localStorage.setItem(`seekEatz_lastLogin_${userId}`, now.toString());
      localStorage.setItem("seekEatz_lastLogin", now.toString());
      localStorage.setItem(`seekEatz_hasCompletedOnboarding_${userId}`, "true");
      localStorage.setItem("hasCompletedOnboarding", "true");
      localStorage.setItem("onboarded", "true");
      localStorage.setItem("seekeatz_start_app_tutorial", "true");
      localStorage.removeItem(`seekeatz_app_tutorial_completed_${userId}`);
      localStorage.setItem(
        "userProfile",
        JSON.stringify({
          ...(profile ? profile as Partial<UserProfile> : {}),
          full_name: fullName,
        }),
      );

      let bootstrapResult: Awaited<ReturnType<typeof bootstrapAccount>> | null = null;

      try {
        bootstrapResult = await bootstrapAccount({
          profile: profileForBootstrap,
          hasCompletedOnboarding: true,
        });
      } catch (bootstrapError) {
        console.warn("Account bootstrap failed after signup:", bootstrapError);
      }

      const destination = await resolveSignupDestination({
        userId,
        fallbackRedirect: redirectTo,
        bootstrapResult,
      });

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 500));
      router.refresh();
      await new Promise(resolve => setTimeout(resolve, 300));

      // Navigate with the app router so native shells keep control.
      router.replace(destination);
      router.refresh();
    } catch (err: unknown) {
      setOtpError(getErrorMessage(err, "Verification failed. Please try again."));
      setIsLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setOtpError(null);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
      });

      if (resendError) {
        setOtpError(resendError.message);
        return;
      }

      startResendCooldown();
      setOtpDigits(Array.from({ length: EMAIL_OTP_LENGTH }, () => ""));
      otpInputRefs.current[0]?.focus();
    } catch {
      setOtpError("Failed to resend code. Please try again.");
    }
  };

  // Everything below stays inside the page component.

  // OTP Verification Screen
  if (showOtpScreen) {
    return (
      <div className="min-h-[100dvh] overflow-y-auto bg-white px-4 py-[calc(1.5rem+env(safe-area-inset-top,0px))] sm:flex sm:items-center sm:justify-center sm:p-6">
        <div className="mx-auto flex min-h-[calc(100dvh-3rem-env(safe-area-inset-top,0px))] w-full max-w-md flex-col justify-center sm:min-h-0">
          <div className="text-center mb-6 sm:mb-8">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-black mb-2">
              Verify Your Email
            </h1>
            <p className="text-gray-600">
              We sent an {EMAIL_OTP_LENGTH}-digit code to<br />
              <span className="font-medium text-black">{email}</span>
            </p>
          </div>

          {/* OTP Input */}
          <div className="grid grid-cols-6 gap-2.5 sm:gap-3 mb-6">
            {otpDigits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { otpInputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={EMAIL_OTP_LENGTH}
                value={digit}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(index, e)}
                onFocus={(e) => e.target.select()}
                className="h-12 min-w-0 rounded-xl border-2 border-gray-300 bg-gray-50 text-center text-lg font-bold text-black transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 sm:h-14 sm:text-xl"
                autoFocus={index === 0}
              />
            ))}
          </div>

          {/* OTP Error */}
          {otpError && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm mb-4 text-center">
              {otpError}
            </div>
          )}

          {/* Verify Button */}
          <Button
            onClick={handleVerifyOtp}
            disabled={isLoading || otpDigits.join("").length !== EMAIL_OTP_LENGTH}
            className="h-14 rounded-full w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 border-0 disabled:opacity-60 disabled:cursor-not-allowed mb-4"
          >
            {isLoading ? "Verifying..." : "Verify & Continue"}
          </Button>

          {/* Resend Code */}
          <p className="text-gray-600 text-sm text-center">
            Didn&apos;t receive the code?{" "}
            {resendCooldown > 0 ? (
              <span className="text-gray-400">
                Resend in {resendCooldown}s
              </span>
            ) : (
              <button
                onClick={handleResendOtp}
                className="text-cyan-600 hover:text-cyan-700 font-medium"
              >
                Resend Code
              </button>
            )}
          </p>

          {/* Back to signup */}
          <button
            onClick={() => {
              setShowOtpScreen(false);
              setOtpError(null);
              setOtpDigits(Array.from({ length: EMAIL_OTP_LENGTH }, () => ""));
            }}
            className="text-gray-500 hover:text-gray-700 text-sm text-center w-full mt-4 transition-colors"
          >
            Back to signup
          </button>
        </div>
      </div>
    );
  }

  // Signup Form Screen
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black mb-2">
            {selectedPlan === "free" ? "Create Your Free Account" : "Create Account"}
          </h1>
          <p className="text-black">
            {selectedPlan === "free"
              ? getFreeTierSignupDescription()
              : "Sign up to get started with SeekEatz"}
          </p>
        </div>

        {!emailOnly ? (
          <AuthProviders
            oauthRedirectPath={redirectTo}
            className="mb-6"
            onBeforeRedirect={() => {
              if (shouldStartTutorial && typeof window !== "undefined") {
                localStorage.setItem("seekeatz_start_app_tutorial", "true");
              }
            }}
          />
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-black mb-2 block">First Name</Label>
              <Input
                type="text"
                placeholder="First"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="h-14 rounded-2xl bg-gray-50 border-gray-300 text-black placeholder:text-gray-400 focus:border-cyan-500 focus:ring-cyan-500/20"
                autoComplete="given-name"
              />
            </div>
            <div>
              <Label className="text-black mb-2 block">Last Name</Label>
              <Input
                type="text"
                placeholder="Last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="h-14 rounded-2xl bg-gray-50 border-gray-300 text-black placeholder:text-gray-400 focus:border-cyan-500 focus:ring-cyan-500/20"
                autoComplete="family-name"
              />
            </div>
          </div>

          <div>
            <Label className="text-black mb-2 block">Email</Label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-500" />
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-14 pl-12 rounded-2xl bg-gray-50 border-gray-300 text-black placeholder:text-gray-400 focus:border-cyan-500 focus:ring-cyan-500/20"
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <Label className="text-black mb-2 block">Password</Label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-500" />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-14 pl-12 pr-12 rounded-2xl bg-gray-50 border-gray-300 text-black placeholder:text-gray-400 focus:border-cyan-500 focus:ring-cyan-500/20"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-cyan-500 hover:text-cyan-600 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <div>
            <Label className="text-black mb-2 block">
              Confirm Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-500" />
              <Input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="h-14 pl-12 pr-12 rounded-2xl bg-gray-50 border-gray-300 text-black placeholder:text-gray-400 focus:border-cyan-500 focus:ring-cyan-500/20"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() =>
                  setShowConfirmPassword((prev) => !prev)
                }
                className="absolute right-4 top-1/2 -translate-y-1/2 text-cyan-500 hover:text-cyan-600 transition-colors"
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm">
              <div className="mb-2">{error}</div>
              {(error.includes("already exists") || error.includes("already registered")) && (
                <button
                  onClick={() => router.push(`/auth/signin?redirectTo=${encodeURIComponent(redirectTo)}&switch=1${isMasterMode ? "&master=1" : ""}`)}
                  className="text-cyan-600 hover:text-cyan-700 font-medium underline mt-2"
                >
                  Go to Sign In
                </button>
              )}
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="h-14 rounded-full w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 border-0 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? "Creating Account..." : "Create Account"}
          </Button>
        </form>

        <p className="text-black text-sm text-center mt-6">
          Already have an account?{" "}
          <button
            onClick={() => router.push(`/auth/signin?redirectTo=${encodeURIComponent(redirectTo)}&switch=1${isMasterMode ? "&master=1" : ""}`)}
            className="text-cyan-600 hover:text-cyan-700 font-medium"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}
