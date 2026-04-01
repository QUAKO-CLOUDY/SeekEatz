"use client";

import { useRouter } from "next/navigation";

type Props = {
  open: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
};

const premiumBenefits = [
  "Unlimited AI searches",
  "Smarter results",
  "AI swaps",
  "Meal logging",
  "Saved meals",
];

export function UpgradeModal({
  open,
  title = "You're one step away from always knowing what to order.",
  subtitle = "Unlock the premium tools that turn meal discovery into a repeatable system.",
  onClose,
}: Props) {
  const router = useRouter();

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/75 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-[2rem] bg-white p-6 pb-8 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600">
              Premium
            </p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight text-slate-900">
              {title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-slate-500"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-3 rounded-[1.5rem] bg-slate-50 p-5">
          {premiumBenefits.map((benefit) => (
            <div key={benefit} className="flex items-center gap-3 text-sm text-slate-700">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
                +
              </span>
              <span>{benefit}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            onClose();
            router.push("/upgrade");
          }}
          className="mt-6 w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-cyan-500/25"
        >
          See plans
        </button>
      </div>
    </div>
  );
}
