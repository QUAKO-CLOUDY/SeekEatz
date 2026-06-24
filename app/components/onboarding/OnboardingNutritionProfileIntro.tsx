"use client";

import { motion, useReducedMotion } from "framer-motion";
import { onboardingTransition } from "./onboarding-motion";
import { OnboardingNav } from "./OnboardingNav";
import { OnboardingShell } from "./OnboardingShell";
import { OnboardingStepCard } from "./OnboardingStepCard";

type Props = {
  onBack: () => void;
  onContinue: () => void;
};

export function OnboardingNutritionProfileIntro({ onBack, onContinue }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <OnboardingShell>
      <OnboardingStepCard stepKey="nutrition-profile-intro">
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
          transition={onboardingTransition(reduceMotion, 0.1)}
          className="mt-4 text-center text-2xl font-semibold leading-tight text-foreground sm:text-3xl"
        >
          Let&apos;s personalize your experience.
        </motion.h1>

        <motion.p
          initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={onboardingTransition(reduceMotion, 0.14)}
          className="mt-4 text-center text-base leading-relaxed text-muted-foreground"
        >
          We&apos;ll learn a little about your goals, eating habits, and lifestyle so we can recommend
          meals tailored to you.
        </motion.p>

        <motion.div
          initial={{ opacity: reduceMotion ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={onboardingTransition(reduceMotion, 0.22)}
          className="mt-10"
        >
          <OnboardingNav
            onBack={onBack}
            onNext={onContinue}
            nextLabel="Continue"
            primaryClassName="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 shadow-cyan-500/20"
          />
        </motion.div>
      </OnboardingStepCard>
    </OnboardingShell>
  );
}
