"use client";

import { motion, useReducedMotion } from "framer-motion";
import { onboardingProgressSpring } from "./onboarding-motion";

type Props = {
  currentStep: number;
  totalSteps: number;
};

export function OnboardingProgressBar({ currentStep, totalSteps }: Props) {
  const reduceMotion = useReducedMotion();

  const progress =
    totalSteps <= 1 ? 100 : ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>
          Step {currentStep + 1} of {totalSteps}
        </span>
        <motion.span
          key={Math.round(progress)}
          initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.25 }}
        >
          {Math.round(progress)}%
        </motion.span>
      </div>

      <div className="flex gap-1.5">
        {Array.from({ length: totalSteps }, (_, index) => {
          const filled = index <= currentStep;

          return (
            <motion.div
              key={index}
              className="h-2 flex-1 overflow-hidden rounded-full bg-muted/60"
              initial={false}
            >
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500/80 to-blue-500/80"
                initial={false}
                animate={{ width: filled ? "100%" : "0%" }}
                transition={reduceMotion ? { duration: 0 } : onboardingProgressSpring}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
