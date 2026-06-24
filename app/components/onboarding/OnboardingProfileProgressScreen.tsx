"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { onboardingTransition } from "./onboarding-motion";
import { OnboardingMilestoneBar } from "./OnboardingMilestoneBar";
import { OnboardingNav } from "./OnboardingNav";
import { OnboardingShell } from "./OnboardingShell";
import { OnboardingStepCard } from "./OnboardingStepCard";

type Props = {
  onBack: () => void;
  onContinue: () => void;
};

export function OnboardingProfileProgressScreen({ onBack, onContinue }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <OnboardingShell>
      <OnboardingStepCard stepKey="profile-progress">
        <motion.div
          initial={{ opacity: reduceMotion ? 1 : 0, scale: reduceMotion ? 1 : 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={onboardingTransition(reduceMotion, 0.06)}
          className="flex justify-center"
        >
          <div className="relative h-32 w-32">
            <Image
              src="/logos/seekeatz.png"
              alt="SeekEatz logo"
              fill
              className="object-contain"
              priority
            />
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={onboardingTransition(reduceMotion, 0.12)}
          className="mt-6 text-center text-2xl font-semibold leading-tight text-foreground sm:text-3xl"
        >
          Good news! You&apos;re exactly who SeekEatz was built for.
        </motion.h1>

        <motion.p
          initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={onboardingTransition(reduceMotion, 0.16)}
          className="mt-4 text-center text-base leading-relaxed text-muted-foreground"
        >
          Whether you&apos;re eating out once a week or every day, SeekEatz helps you find meals that fit
          your goals in seconds. Giving you the confidence to enjoy restaurants without second-guessing
          your choices and not shy away from social events.
        </motion.p>

        <motion.div
          initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={onboardingTransition(reduceMotion, 0.2)}
          className="mt-8"
        >
          <OnboardingMilestoneBar label="Complete" delay={0.24} />
        </motion.div>

        <motion.div
          initial={{ opacity: reduceMotion ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={onboardingTransition(reduceMotion, 0.3)}
          className="mt-8"
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
