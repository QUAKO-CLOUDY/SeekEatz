"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { onboardingTransition } from "./onboarding-motion";
import { OnboardingNav } from "./OnboardingNav";
import { OnboardingProgressBar } from "./OnboardingProgressBar";
import { OnboardingShell } from "./OnboardingShell";
import { OnboardingStepCard } from "./OnboardingStepCard";

type Props = {
  stepKey: string | number;
  stepIndex: number;
  totalSteps: number;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
};

export function OnboardingQuestionLayout({
  stepKey,
  stepIndex,
  totalSteps,
  eyebrow,
  title,
  description,
  children,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  showBack,
  secondaryAction,
}: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <OnboardingShell align="top">
      <OnboardingStepCard stepKey={stepKey}>
        <OnboardingProgressBar currentStep={stepIndex} totalSteps={totalSteps} />

        {eyebrow ? (
          <motion.p
            initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={onboardingTransition(reduceMotion, 0.05)}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-600"
          >
            {eyebrow}
          </motion.p>
        ) : null}

        <motion.h1
          initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={onboardingTransition(reduceMotion, 0.08)}
          className={`text-2xl font-semibold leading-tight text-foreground sm:text-3xl ${eyebrow ? "mt-3" : ""}`}
        >
          {title}
        </motion.h1>

        {description ? (
          <motion.p
            initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={onboardingTransition(reduceMotion, 0.12)}
            className="mt-3 text-base leading-relaxed text-muted-foreground"
          >
            {description}
          </motion.p>
        ) : null}

        <motion.div
          initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={onboardingTransition(reduceMotion, 0.16)}
          className="mt-8"
        >
          {children}
        </motion.div>

        <motion.div
          initial={{ opacity: reduceMotion ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={onboardingTransition(reduceMotion, 0.22)}
          className="mt-8"
        >
          <OnboardingNav
            onBack={onBack}
            onNext={onNext}
            nextLabel={nextLabel}
            nextDisabled={nextDisabled}
            showBack={showBack}
            secondaryAction={secondaryAction}
          />
        </motion.div>
      </OnboardingStepCard>
    </OnboardingShell>
  );
}
