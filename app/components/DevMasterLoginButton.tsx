"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  onSuccess?: () => void;
  className?: string;
};

export function DevMasterLoginButton({ onSuccess, className = "" }: Props) {
  const router = useRouter();
  const enabled = process.env.NEXT_PUBLIC_ENABLE_MASTER_LOGIN === "true";
  const email = process.env.NEXT_PUBLIC_MASTER_LOGIN_EMAIL ?? "";

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!enabled || !email) {
    return null;
  }

  const handleMasterLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      router.push("/auth/signin?master=1");
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Master login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleMasterLogin}
        className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
      >
        {isLoading ? "Signing in with master login..." : "Use master login"}
      </button>
      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
