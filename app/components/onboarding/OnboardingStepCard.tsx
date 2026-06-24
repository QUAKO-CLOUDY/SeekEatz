"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { onboardingStepVariants, onboardingTransition } from "./onboarding-motion";

type Props = {
  children: ReactNode;
  stepKey: string | number;
  className?: string;
};

export function OnboardingStepCard({ children, stepKey, className = "" }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      key={stepKey}
      custom={reduceMotion}
      variants={onboardingStepVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={onboardingTransition(reduceMotion)}
      className={`rounded-[2rem] border border-white/40 bg-white/90 p-8 shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 ${className}`}
    >
      {children}
    </motion.div>
  );
}
