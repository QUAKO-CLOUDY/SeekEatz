"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

type Props = {
  children: ReactNode;
  align?: "center" | "top";
};

export function OnboardingShell({ children, align = "center" }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={`relative flex min-h-screen overflow-hidden bg-background p-6 ${
        align === "top" ? "items-start pt-10 sm:items-center sm:pt-6" : "items-center justify-center"
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-background to-blue-50 dark:from-slate-950 dark:via-background dark:to-slate-900" />
      <motion.div
        className="absolute -top-24 right-[-4rem] h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl"
        animate={reduceMotion ? undefined : { scale: [1, 1.06, 1], opacity: [0.4, 0.55, 0.4] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
      <motion.div
        className="absolute -bottom-24 left-[-4rem] h-56 w-56 rounded-full bg-blue-500/20 blur-3xl"
        animate={reduceMotion ? undefined : { scale: [1, 1.08, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}
