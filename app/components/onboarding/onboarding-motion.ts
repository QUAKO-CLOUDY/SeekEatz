import type { Transition, Variants } from "framer-motion";

export const ONBOARDING_EASE = [0.22, 1, 0.36, 1] as const;

export function onboardingTransition(
  reduceMotion: boolean | null,
  delay = 0,
  duration = 0.42,
): Transition {
  return {
    duration: reduceMotion ? 0 : duration,
    delay: reduceMotion ? 0 : delay,
    ease: ONBOARDING_EASE,
  };
}

export const onboardingStepVariants = {
  initial: (reduceMotion: boolean | null) => ({
    opacity: reduceMotion ? 1 : 0,
    y: reduceMotion ? 0 : 8,
  }),
  animate: {
    opacity: 1,
    y: 0,
  },
  exit: (reduceMotion: boolean | null) => ({
    opacity: reduceMotion ? 1 : 0,
    y: reduceMotion ? 0 : -6,
  }),
};

export const onboardingScreenVariants: Variants = {
  initial: (custom: { reduceMotion: boolean | null; direction: number }) => ({
    opacity: custom.reduceMotion ? 1 : 0,
    x: custom.reduceMotion ? 0 : custom.direction * 28,
  }),
  animate: {
    opacity: 1,
    x: 0,
  },
  exit: (custom: { reduceMotion: boolean | null; direction: number }) => ({
    opacity: custom.reduceMotion ? 1 : 0,
    x: custom.reduceMotion ? 0 : custom.direction * -28,
  }),
};

export const onboardingProgressSpring: Transition = {
  type: "spring",
  stiffness: 90,
  damping: 22,
  mass: 0.8,
};
