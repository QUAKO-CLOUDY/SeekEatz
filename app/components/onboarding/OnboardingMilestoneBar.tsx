"use client";

import { Check } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { onboardingTransition } from "./onboarding-motion";

type Props = {
  label?: string;
  delay?: number;
};

export function OnboardingMilestoneBar({ label = "Complete", delay = 0.2 }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="rounded-2xl border border-cyan-500/15 bg-gradient-to-br from-cyan-500/[0.06] to-blue-500/[0.04] px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">Profile section</p>
        <motion.div
          initial={{ opacity: reduceMotion ? 1 : 0, scale: reduceMotion ? 1 : 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={onboardingTransition(reduceMotion, delay + 0.55, 0.35)}
          className="flex items-center gap-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-400"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
            <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          </span>
          {label}
        </motion.div>
      </div>

      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((segment, index) => (
          <motion.div
            key={segment}
            className="h-2 flex-1 overflow-hidden rounded-full bg-muted/60"
            initial={false}
          >
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500/80 to-blue-500/80"
              initial={{ width: reduceMotion ? "100%" : "0%" }}
              animate={{ width: "100%" }}
              transition={onboardingTransition(reduceMotion, delay + index * 0.08, 0.5)}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
