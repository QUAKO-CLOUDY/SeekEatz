"use client";

import { useRouter } from "next/navigation";

type Props = {
  open: boolean;
  onDismiss: () => void;
};

export function WaitlistTrialEndedModal({ open, onDismiss }: Props) {
  const router = useRouter();

  return (
    <div
      className={`fixed inset-0 z-[130] flex items-end justify-center transition-colors duration-300 ${
        open
          ? "bg-slate-950/75 backdrop-blur-sm"
          : "pointer-events-none bg-slate-950/0 backdrop-blur-0"
      }`}
    >
      <div
        className={`w-full max-w-md rounded-t-[2rem] border border-white/40 bg-white p-6 pb-8 shadow-2xl transition-transform duration-300 ease-out dark:border-slate-800 dark:bg-slate-950 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <p className="text-base leading-7 text-foreground">
          Your one month free trial has ended. Purchase a subscription to continue having full
          access to the app.
        </p>

        <button
          type="button"
          onClick={() => {
            onDismiss();
            router.push("/upgrade");
          }}
          className="mt-6 w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-cyan-500/25"
        >
          View subscription plans
        </button>
      </div>
    </div>
  );
}
