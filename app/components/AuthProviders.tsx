"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type Props = {
  mode?: "signin" | "signup";
  emailHref?: string;
  oauthRedirectPath?: string;
  className?: string;
};

export function AuthProviders({
  mode = "signup",
  emailHref,
  oauthRedirectPath = "/chat",
  className = "",
}: Props) {
  const router = useRouter();
  const [isLoadingProvider, setIsLoadingProvider] = useState<string | null>(null);
  const showGoogle = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";

  const buttonBase =
    "w-full rounded-2xl border px-4 py-3 text-sm font-medium transition-colors";
  const emailLabel = mode === "signin" ? "Sign in with email" : "Create account with email";

  const signInWithProvider = async (provider: "google") => {
    setIsLoadingProvider(provider);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}${oauthRedirectPath}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (error) {
        console.error(`OAuth sign-in failed for ${provider}:`, error);
      }
    } finally {
      setIsLoadingProvider(null);
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {showGoogle && (
        <button
          type="button"
          onClick={() => signInWithProvider("google")}
          className={`${buttonBase} border-gray-300 bg-white text-gray-900 hover:bg-gray-50`}
        >
          {isLoadingProvider === "google" ? "Connecting to Google..." : "Continue with Google"}
        </button>
      )}
      <button
        type="button"
        onClick={() => router.push(emailHref || (mode === "signin" ? "/auth/signin" : "/auth/signup"))}
        className={`${buttonBase} border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 flex items-center justify-center gap-2`}
      >
        <Mail className="h-4 w-4" />
        {emailLabel}
      </button>
    </div>
  );
}
