"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Props = {
  oauthRedirectPath?: string;
  className?: string;
  onBeforeRedirect?: () => void;
};

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M15.2 2.3c0 1-.4 2-1.1 2.7-.8.8-1.8 1.2-2.8 1.1-.1-1 .4-2 1.1-2.7.7-.8 1.9-1.3 2.8-1.1ZM18.7 18.2c-.6 1.3-.9 1.9-1.7 3-.9 1.2-2.1 2.6-3.6 2.6-1.3 0-1.6-.8-3.3-.8-1.7 0-2.1.8-3.4.8-1.4 0-2.5-1.2-3.4-2.4C.8 18 .2 13.8 2.4 10.5 4 8.2 6.4 6.8 8.7 6.8c1.4 0 2.7.9 3.5.9.8 0 2.4-1.1 4.1-1 .7 0 2.7.3 4 2.2-3.5 1.9-2.9 6.8.4 8.1Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.2 14.7 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.5-4 9.5-9.6 0-.6-.1-1.1-.1-1.5H12Z" />
      <path fill="#34A853" d="M3.3 7.4 6.5 9.8C7.4 7.6 9.5 6 12 6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.2 14.7 2.2 12 2.2 8.2 2.2 4.9 4.4 3.3 7.4Z" />
      <path fill="#FBBC05" d="M12 21.8c2.6 0 4.8-.9 6.4-2.5l-3-2.5c-.8.6-1.9 1.2-3.4 1.2-3.9 0-5.2-2.6-5.5-3.8l-3.2 2.5c1.6 3 4.7 5.1 8.7 5.1Z" />
      <path fill="#4285F4" d="M21.5 12.2c0-.6-.1-1.1-.1-1.5H12v3.9h5.5c-.3 1-1 2-2.1 2.7l3 2.5c1.8-1.6 3.1-4 3.1-7.6Z" />
    </svg>
  );
}

const OAUTH_GENERIC_ERROR = "Login failed. Please try again or use email login.";

export function AuthProviders({
  oauthRedirectPath = "/chat",
  className = "",
  onBeforeRedirect,
}: Props) {
  const [isLoadingProvider, setIsLoadingProvider] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Keep social providers opt-in so App Review never sees unsupported-provider errors.
  const showApple = process.env.NEXT_PUBLIC_ENABLE_APPLE_AUTH === "true";
  const showGoogle = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";
  const hasProviders = showApple || showGoogle;

  const buttonBase =
    "w-full rounded-2xl border px-4 py-3 text-sm font-medium transition-colors";

  if (!hasProviders) {
    return null;
  }

  const signInWithProvider = async (provider: "google" | "apple") => {
    setIsLoadingProvider(provider);
    setAuthError(null);

    try {
      onBeforeRedirect?.();
      const supabase = createClient();
      const redirectTo = `${window.location.origin}${oauthRedirectPath}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (error) {
        console.error(`OAuth sign-in failed for ${provider}:`, error);
        setAuthError(OAUTH_GENERIC_ERROR);
      }
    } catch (error) {
      console.error(`Unexpected OAuth sign-in failure for ${provider}:`, error);
      setAuthError(OAUTH_GENERIC_ERROR);
    } finally {
      setIsLoadingProvider(null);
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {showApple && (
        <button
          type="button"
          onClick={() => signInWithProvider("apple")}
          className={`${buttonBase} border-gray-300 bg-black text-white hover:bg-gray-900 flex items-center justify-center gap-2`}
        >
          <AppleIcon />
          {isLoadingProvider === "apple" ? "Connecting to Apple..." : "Continue with Apple"}
        </button>
      )}
      {showGoogle && (
        <button
          type="button"
          onClick={() => signInWithProvider("google")}
          className={`${buttonBase} border-gray-300 bg-white text-gray-900 hover:bg-gray-50 flex items-center justify-center gap-2`}
        >
          <GoogleIcon />
          {isLoadingProvider === "google" ? "Connecting to Google..." : "Continue with Google"}
        </button>
      )}

      {authError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {authError}
        </p>
      ) : null}
    </div>
  );
}
