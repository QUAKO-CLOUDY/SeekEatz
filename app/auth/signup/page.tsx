"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

import { createClient } from "@/utils/supabase/client";
import { Label } from "@/app/components/ui/label";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";

const THIRTY_MINUTES = 30 * 60 * 1000;

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 🧠 Guard: if already logged in + onboarding done + last login < 30 min → skip this screen
  useEffect(() => {
    const checkExistingSession = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || typeof window === "undefined") return;

      const completed = localStorage.getItem("macroMatch_completedOnboarding");
      const lastLoginStr = localStorage.getItem("macroMatch_lastLogin");
      const lastLogin = lastLoginStr ? Number(lastLoginStr) : 0;

      if (
        completed === "true" &&
        lastLogin &&
        Date.now() - lastLogin < THIRTY_MINUTES
      ) {
        router.replace("/home"); // TODO: change to your real main app route
      }
    };

    checkExistingSession();
  }, [router, supabase]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setIsLoading(true);

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
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
        const now = Date.now();
        
        // Load pending onboarding profile if it exists
        let profile = null;
        const pendingProfile = localStorage.getItem("pendingOnboardingProfile");
        if (pendingProfile) {
          try {
            profile = JSON.parse(pendingProfile);
            localStorage.removeItem("pendingOnboardingProfile");
          } catch (e) {
            console.warn("Failed to parse pending onboarding profile:", e);
          }
        }

        // Save profile to Supabase (don't mark onboarding as complete yet - that happens after location step)
        try {
          await supabase
            .from("profiles")
            .upsert({
              id: signUpData.user.id,
              has_completed_onboarding: false, // Will be true after location step
              last_login: new Date(now).toISOString(),
              user_profile: profile || undefined,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "id",
            });
        } catch (profileErr) {
          console.warn("Error saving profile:", profileErr);
        }

        // Set last login (but don't mark onboarding as complete yet - that happens after location step)
        localStorage.setItem(`macroMatch_lastLogin_${signUpData.user.id}`, now.toString());
        localStorage.setItem("macroMatch_lastLogin", now.toString());
        
        // Mark that onboarding questions are complete (but not full onboarding yet)
        localStorage.setItem("macroMatch_onboardingQuestionsComplete", "true");
        
        if (profile) {
          localStorage.setItem("userProfile", JSON.stringify(profile));
        }

        // Wait a moment for database to propagate
        await new Promise(resolve => setTimeout(resolve, 500));

        // Redirect to onboarding flow (skip welcome and auth, start with onboarding screens)
        router.replace("/onboarding");
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  // ⬇️ Everything below is *inside* the function now
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-black mb-2">
            Create Account
          </h1>
          <p className="text-black">
            Sign up to get started with SeekEatz
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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
                  onClick={() => router.push("/auth/signin")}
                  className="text-cyan-600 hover:text-cyan-700 font-medium underline mt-2"
                >
                  Go to Sign In →
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
            onClick={() => router.push("/auth/signin")}
            className="text-cyan-600 hover:text-cyan-700 font-medium"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
