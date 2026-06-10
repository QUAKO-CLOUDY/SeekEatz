"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Crown, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { PREMIUM_PLAN_BENEFITS } from "@/lib/premium-benefits";

type Props = {
  onContinue: () => void;
};

export function WaitlistWelcomeScreen({ onContinue }: Props) {
  const reduceMotion = useReducedMotion();
  const motionDelay = (delay: number) => ({
    duration: reduceMotion ? 0 : 0.45,
    delay: reduceMotion ? 0 : delay,
    ease: [0.22, 1, 0.36, 1] as const,
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-background to-blue-50 dark:from-slate-950 dark:via-background dark:to-slate-900" />
      <motion.div
        className="absolute -top-24 right-[-4rem] h-56 w-56 rounded-full bg-cyan-400/25 blur-3xl"
        animate={reduceMotion ? undefined : { scale: [1, 1.08, 1], opacity: [0.45, 0.7, 0.45] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-24 left-[-4rem] h-56 w-56 rounded-full bg-blue-500/20 blur-3xl"
        animate={reduceMotion ? undefined : { scale: [1, 1.12, 1], opacity: [0.35, 0.6, 0.35] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
      />

      <div className="relative z-10 w-full max-w-md">
        <motion.div
          initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={motionDelay(0)}
          className="rounded-[2rem] border border-white/40 bg-white/90 p-8 text-center shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/85"
        >
          <motion.div
            className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30"
            animate={reduceMotion ? undefined : { rotate: [0, -4, 4, 0] }}
            transition={{ duration: 1.2, delay: 0.35, ease: "easeOut" }}
          >
            <Crown className="h-10 w-10" aria-hidden />
          </motion.div>

          <motion.div
            initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionDelay(0.1)}
            className="mb-6 flex justify-center"
          >
            <div className="relative h-16 w-16">
              <Image
                src="/logos/seekeatz.png"
                alt="SeekEatz logo"
                fill
                className="object-contain"
                priority
              />
            </div>
          </motion.div>

          <motion.p
            initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionDelay(0.15)}
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Waitlist reward unlocked
          </motion.p>

          <motion.h1
            initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionDelay(0.22)}
            className="mt-4 text-3xl font-semibold leading-tight text-foreground"
          >
            You&apos;re in! Thanks for joining the waitlist.
          </motion.h1>

          <motion.p
            initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionDelay(0.3)}
            className="mt-4 text-base leading-7 text-muted-foreground"
          >
            Enjoy 1 month of Premium, free with unlimited search, AI chat, swaps, and more.
          </motion.p>

          <motion.ul
            initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionDelay(0.36)}
            className="mt-6 space-y-3 text-left text-sm text-muted-foreground"
          >
            {PREMIUM_PLAN_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-600">
                  <Check className="h-4 w-4" aria-hidden />
                </span>
                <span>{benefit}</span>
              </li>
            ))}
          </motion.ul>

          <motion.div
            initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionDelay(0.5)}
            className="mt-8"
          >
            <Button
              onClick={onContinue}
              className="h-12 w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-base font-semibold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-600 hover:to-blue-700"
            >
              Next
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
