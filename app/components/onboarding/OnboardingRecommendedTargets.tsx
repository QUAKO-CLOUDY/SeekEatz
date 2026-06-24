"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Beef, Wheat, Droplets } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { OnboardingCalculatingAnimation } from "./OnboardingCalculatingAnimation";
import { onboardingTransition } from "./onboarding-motion";
import { applyNutritionTargetsToProfile } from "./apply-nutrition-targets";
import { readOnboardingProfileDraft } from "./onboarding-profile";
import type { OnboardingProfileDraft } from "./onboarding-profile";
import { OnboardingNav } from "./OnboardingNav";
import { OnboardingShell } from "./OnboardingShell";
import { OnboardingStepCard } from "./OnboardingStepCard";
import { AnimatedNumber } from "../AnimatedNumber";

type Props = {
  onBack: () => void;
  onContinue: () => void;
};

type Phase = "calculating" | "results";

const CALCULATION_MESSAGES = [
  "Reviewing your profile",
  "Calculating basal metabolic rate",
  "Applying your activity level",
  "Factoring in your daily steps",
  "Building your macro targets",
];

const CALCULATION_DURATION_MS = 2600;

type MacroCard = {
  label: string;
  value: number;
  suffix: string;
  icon: LucideIcon;
  accent: string;
  glow: string;
};

export function OnboardingRecommendedTargets({ onBack, onContinue }: Props) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduceMotion ? "results" : "calculating");
  const [messageIndex, setMessageIndex] = useState(0);
  const [targets, setTargets] = useState<OnboardingProfileDraft>(() =>
    applyNutritionTargetsToProfile(readOnboardingProfileDraft()) ?? readOnboardingProfileDraft(),
  );

  useEffect(() => {
    const calculated = applyNutritionTargetsToProfile(readOnboardingProfileDraft());
    if (calculated) {
      setTargets(calculated);
    }

    if (reduceMotion) {
      setPhase("results");
      return;
    }

    const messageTimer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % CALCULATION_MESSAGES.length);
    }, 650);

    const phaseTimer = window.setTimeout(() => {
      setPhase("results");
    }, CALCULATION_DURATION_MS);

    return () => {
      window.clearInterval(messageTimer);
      window.clearTimeout(phaseTimer);
    };
  }, [reduceMotion]);

  const calories = targets.target_calories ?? 0;
  const macroCards: MacroCard[] = [
    {
      label: "Protein",
      value: targets.target_protein_g ?? 0,
      suffix: "g",
      icon: Beef,
      accent: "text-cyan-600",
      glow: "from-cyan-500/20 to-blue-500/10",
    },
    {
      label: "Carbs",
      value: targets.target_carbs_g ?? 0,
      suffix: "g",
      icon: Wheat,
      accent: "text-amber-600",
      glow: "from-amber-500/20 to-orange-500/10",
    },
    {
      label: "Fat",
      value: targets.target_fats_g ?? 0,
      suffix: "g",
      icon: Droplets,
      accent: "text-violet-600",
      glow: "from-violet-500/20 to-purple-500/10",
    },
  ];

  return (
    <OnboardingShell align="top">
      <OnboardingStepCard stepKey={`recommended-targets-${phase}`}>
        <AnimatePresence mode="wait">
          {phase === "calculating" ? (
            <motion.div
              key="calculating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={onboardingTransition(reduceMotion, 0, 0.25)}
              className="flex min-h-[420px] flex-col items-center justify-center py-6 text-center"
            >
              <OnboardingCalculatingAnimation className="mb-8" />

              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-600">
                Personalization
              </p>
              <h1 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">
                Calculating your targets
              </h1>

              <div className="mt-6 h-8 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={messageIndex}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={onboardingTransition(reduceMotion, 0, 0.2)}
                    className="text-base text-muted-foreground"
                  >
                    {CALCULATION_MESSAGES[messageIndex]}…
                  </motion.p>
                </AnimatePresence>
              </div>

              <div className="mt-8 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: CALCULATION_DURATION_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="results"
              initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={onboardingTransition(reduceMotion, 0.05, 0.45)}
            >
              <motion.p
                initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={onboardingTransition(reduceMotion, 0.04)}
                className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-600"
              >
                Personalization
              </motion.p>

              <motion.h1
                initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={onboardingTransition(reduceMotion, 0.08)}
                className="mt-3 text-2xl font-semibold leading-tight text-foreground sm:text-3xl"
              >
                Recommended Targets
              </motion.h1>

              <motion.p
                initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={onboardingTransition(reduceMotion, 0.12)}
                className="mt-3 text-base leading-relaxed text-muted-foreground"
              >
                Your daily maintenance calories and macros, tailored from your profile. Adjust
                anytime in Settings.
              </motion.p>

              <motion.div
                initial={{ opacity: reduceMotion ? 1 : 0, scale: reduceMotion ? 1 : 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={onboardingTransition(reduceMotion, 0.16, 0.4)}
                className="relative mt-8 overflow-hidden rounded-[1.75rem] border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-background to-blue-500/10 p-6 text-center shadow-lg shadow-cyan-500/10"
              >
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cyan-400/20 blur-2xl" />
                <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-blue-500/20 blur-2xl" />
                <div className="relative">
                  <p className="text-sm font-medium text-muted-foreground">Maintenance Calories</p>
                  <div className="mt-2 flex items-end justify-center gap-1">
                    <span className="text-5xl font-bold tracking-tight text-foreground">
                      <AnimatedNumber value={calories} displayValue={calories.toLocaleString()} />
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-cyan-700 dark:text-cyan-400">
                    calories/day
                  </p>
                </div>
              </motion.div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                {macroCards.map((macro, index) => {
                  const Icon = macro.icon;

                  return (
                    <motion.div
                      key={macro.label}
                      initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={onboardingTransition(reduceMotion, 0.2 + index * 0.06, 0.35)}
                      className={`rounded-2xl border border-border/60 bg-gradient-to-br ${macro.glow} p-3 text-center sm:p-4`}
                    >
                      <div className={`mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-background/80 ${macro.accent}`}>
                        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      </div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
                        {macro.label}
                      </p>
                      <p className="mt-1 text-xl font-bold text-foreground sm:text-2xl">
                        <AnimatedNumber
                          value={macro.value}
                          suffix={macro.suffix}
                          displayValue={`${macro.value}${macro.suffix}`}
                        />
                      </p>
                    </motion.div>
                  );
                })}
              </div>

              <motion.div
                initial={{ opacity: reduceMotion ? 1 : 0 }}
                animate={{ opacity: 1 }}
                transition={onboardingTransition(reduceMotion, 0.34)}
                className="mt-8"
              >
                <OnboardingNav
                  onBack={onBack}
                  onNext={onContinue}
                  nextLabel="Continue"
                  primaryClassName="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 shadow-cyan-500/20"
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </OnboardingStepCard>
    </OnboardingShell>
  );
}
