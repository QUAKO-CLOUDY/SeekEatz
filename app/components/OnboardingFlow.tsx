"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "./ui/button";
import { createClient } from "@/utils/supabase/client";
import { bootstrapAccount } from "@/lib/bootstrap-account";
import type { UserProfile } from "@/app/types";
import {
  ONBOARDING_QUESTION_COUNT,
  OnboardingProfileQuestions,
} from "./onboarding/OnboardingProfileQuestions";
import {
  NUTRITION_INPUT_COUNT,
  NUTRITION_QUESTION_COUNT,
  OnboardingNutritionQuestions,
} from "./onboarding/OnboardingNutritionQuestions";
import { OnboardingNutritionProfileIntro } from "./onboarding/OnboardingNutritionProfileIntro";
import { OnboardingProfileProgressScreen } from "./onboarding/OnboardingProfileProgressScreen";
import { OnboardingRecommendedTargets } from "./onboarding/OnboardingRecommendedTargets";
import { applyNutritionTargetsToProfile } from "./onboarding/apply-nutrition-targets";
import {
  BENEFIT_SLIDE_COUNT,
  FIRST_QUESTION_STEP,
  getFirstNutritionStep,
  getProfileProgressStep,
  getRecommendedTargetsStep,
  PERSONALIZATION_INTRO_STEP,
} from "./onboarding/onboarding-steps";
import { onboardingTransition, onboardingScreenVariants } from "./onboarding/onboarding-motion";
import { mergeOnboardingProfileDraft, readOnboardingProfileDraft } from "./onboarding/onboarding-profile";
import { OnboardingNav } from "./onboarding/OnboardingNav";
import { OnboardingShell } from "./onboarding/OnboardingShell";
import { OnboardingStepCard } from "./onboarding/OnboardingStepCard";

type Props = {
  onComplete: () => void;
  onSkipToSignup?: () => void;
  initialStep?: number;
};

const PROFILE_PROGRESS_STEP = getProfileProgressStep(ONBOARDING_QUESTION_COUNT);
const FIRST_NUTRITION_STEP = getFirstNutritionStep(ONBOARDING_QUESTION_COUNT);
const RECOMMENDED_TARGETS_STEP = getRecommendedTargetsStep(
  ONBOARDING_QUESTION_COUNT,
  NUTRITION_QUESTION_COUNT,
);

type BenefitSlide = {
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  glow: string;
  buttonClass: string;
};

const benefitSlides: BenefitSlide[] = [
  {
    title: "Eat Anywhere",
    description:
      "Whether you're on the go, in a new city, or eating out locally, SeekEatz finds meals that fit your goals.",
    icon: MapPin,
    accent: "text-teal-500",
    glow: "from-teal-500 to-blue-500",
    buttonClass: "from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 shadow-teal-500/20",
  },
  {
    title: "AI Menu Scraper",
    description:
      "Our AI scans restaurant menus and highlights the best meals for your calorie and macro goals.",
    icon: Sparkles,
    accent: "text-purple-500",
    glow: "from-purple-500 to-pink-500",
    buttonClass: "from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-purple-500/20",
  },
  {
    title: "No Guesswork",
    description:
      "SeekEatz pulls nutrition from real restaurant nutritional menus and databases, eliminating crowdsourced guesses, made up numbers, and AI hallucinations.",
    icon: ShieldCheck,
    accent: "text-orange-500",
    glow: "from-orange-500 to-amber-500",
    buttonClass: "from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-orange-500/20",
  },
];

function BenefitProgressDots({ activeStep }: { activeStep: number }) {
  return (
    <div className="mb-8 flex justify-center gap-2">
      {benefitSlides.map((slide, index) => (
        <div
          key={slide.title}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            index === activeStep ? "w-10 bg-gradient-to-r " + slide.glow : "w-6 bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

export function OnboardingFlow({ onComplete, onSkipToSignup, initialStep = -1 }: Props) {
  const supabase = createClient();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(initialStep);
  const [direction, setDirection] = useState(1);

  const goToStep = useCallback((next: number) => {
    setStep((current) => {
      setDirection(next >= current ? 1 : -1);
      return next;
    });
  }, []);

  const finishOnboarding = useCallback(async () => {
    try {
      const now = Date.now();
      let user = null;

      try {
        const {
          data: { user: fetchedUser },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError && userError.message && !userError.message.includes("Auth session missing")) {
          console.warn("Auth error (non-session):", userError);
        }

        if (fetchedUser) {
          user = fetchedUser;
        }
      } catch (error: unknown) {
        if (
          !(error instanceof Error) ||
          (!error.message.includes("Auth session missing") && error.name !== "AuthSessionMissingError")
        ) {
          console.warn("Unexpected auth error:", error);
        }
      }

      const pendingProfile = mergeOnboardingProfileDraft({});
      if (Object.keys(pendingProfile).length > 0) {
        localStorage.setItem("userProfile", JSON.stringify(pendingProfile));
        localStorage.setItem("seekEatz_onboardingQuestionsComplete", "true");
      }

      localStorage.setItem("hasCompletedOnboarding", "true");
      localStorage.setItem("onboarded", "true");
      localStorage.setItem("onboardingCompletedTimestamp", now.toString());
      localStorage.setItem("seekeatz_current_screen", "home");
      localStorage.setItem("seekeatz_nav_history", JSON.stringify(["home"]));

      if (user) {
        try {
          let userProfile: Partial<UserProfile> | null = null;
          try {
            const savedProfile = localStorage.getItem("userProfile");
            if (savedProfile) {
              userProfile = JSON.parse(savedProfile) as Partial<UserProfile>;
            }
          } catch (e) {
            console.warn("Failed to parse userProfile from localStorage:", e);
          }

          await bootstrapAccount({
            profile: userProfile,
            hasCompletedOnboarding: true,
          });
        } catch (error) {
          console.error("Error updating profile:", error);
        }

        localStorage.setItem(`seekEatz_hasCompletedOnboarding_${user.id}`, "true");
        localStorage.setItem(`seekEatz_lastLogin_${user.id}`, now.toString());
        localStorage.setItem("seekEatz_lastLogin", now.toString());
      } else {
        localStorage.setItem("seekEatz_lastLogin", now.toString());
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
      onComplete();
    } catch (error) {
      console.error("Error completing onboarding:", error);
      onComplete();
    }
  }, [onComplete, supabase]);

  const advanceFromBenefitSlides = useCallback(() => {
    goToStep(PERSONALIZATION_INTRO_STEP);
  }, [goToStep]);

  const advanceFromPersonalizationIntro = useCallback(() => {
    goToStep(FIRST_QUESTION_STEP);
  }, [goToStep]);

  const renderWelcome = () => (
    <OnboardingShell>
      <OnboardingStepCard stepKey="welcome">
        <motion.div
          initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={onboardingTransition(reduceMotion, 0.04)}
          className="text-center"
        >
          <div className="mx-auto mb-8 flex justify-center">
            <div className="relative h-24 w-24">
              <Image
                src="/logos/seekeatz.png"
                alt="SeekEatz logo"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600">
            Welcome to SeekEatz
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-foreground">
            Find meals that fit your goals before you order.
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Search restaurant menus with real nutrition data, smarter filters, and AI guidance built for eating out.
          </p>

          <Button
            onClick={() => goToStep(0)}
            className="mt-10 h-14 w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-base font-semibold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-600 hover:to-blue-700"
          >
            Get Started
            <ChevronRight className="ml-2 h-5 w-5" />
          </Button>
        </motion.div>
      </OnboardingStepCard>
    </OnboardingShell>
  );

  const renderBenefitSlide = (slideIndex: number) => {
    const slide = benefitSlides[slideIndex];
    const Icon = slide.icon;

    return (
      <OnboardingShell>
        <OnboardingStepCard stepKey={`benefit-${slideIndex}`}>
          <div className="text-center">
            <motion.div
              initial={{ opacity: reduceMotion ? 1 : 0, scale: reduceMotion ? 1 : 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={onboardingTransition(reduceMotion, 0.06)}
              className="mb-8 flex justify-center"
            >
              <div className="relative">
                <div className={`absolute inset-0 rounded-full bg-gradient-to-r ${slide.glow} blur-2xl opacity-20`} />
                <Icon className={`relative h-20 w-20 ${slide.accent}`} strokeWidth={1.5} />
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={onboardingTransition(reduceMotion, 0.1)}
              className="mb-4 text-3xl font-bold text-foreground"
            >
              {slide.title}
            </motion.h1>

            <motion.p
              initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={onboardingTransition(reduceMotion, 0.14)}
              className="mb-12 text-lg leading-relaxed text-muted-foreground"
            >
              {slide.description}
            </motion.p>

            <BenefitProgressDots activeStep={slideIndex} />

            <OnboardingNav
              showBack={slideIndex > 0}
              onBack={slideIndex > 0 ? () => goToStep(slideIndex - 1) : undefined}
              onNext={() => {
                if (slideIndex < BENEFIT_SLIDE_COUNT - 1) {
                  goToStep(slideIndex + 1);
                  return;
                }

                advanceFromBenefitSlides();
              }}
              nextLabel={slideIndex === BENEFIT_SLIDE_COUNT - 1 ? "Continue" : "Next"}
              primaryClassName={`bg-gradient-to-r ${slide.buttonClass} text-white shadow-lg`}
            />
          </div>
        </OnboardingStepCard>
      </OnboardingShell>
    );
  };

  const renderQuestionStep = (questionIndex: number) => (
    <OnboardingProfileQuestions
      questionIndex={questionIndex}
      onBack={() => {
        if (questionIndex === 0) {
          goToStep(PERSONALIZATION_INTRO_STEP);
          return;
        }

        goToStep(FIRST_QUESTION_STEP + questionIndex - 1);
      }}
      onAdvance={() => {
        if (questionIndex < ONBOARDING_QUESTION_COUNT - 1) {
          goToStep(FIRST_QUESTION_STEP + questionIndex + 1);
          return;
        }

        goToStep(PROFILE_PROGRESS_STEP);
      }}
      onComplete={() => {
        goToStep(PROFILE_PROGRESS_STEP);
      }}
    />
  );

  const renderNutritionStep = (questionIndex: number) => (
    <OnboardingNutritionQuestions
      questionIndex={questionIndex}
      onBack={() => {
        if (questionIndex === 0) {
          goToStep(PROFILE_PROGRESS_STEP);
          return;
        }

        goToStep(FIRST_NUTRITION_STEP + questionIndex - 1);
      }}
      onSkip={() => {
        if (onSkipToSignup) {
          void onSkipToSignup();
          return;
        }

        void finishOnboarding();
      }}
      onAdvance={() => {
        if (questionIndex < NUTRITION_QUESTION_COUNT - 1) {
          goToStep(FIRST_NUTRITION_STEP + questionIndex + 1);
          return;
        }

        if (NUTRITION_QUESTION_COUNT >= NUTRITION_INPUT_COUNT) {
          goToStep(RECOMMENDED_TARGETS_STEP);
          return;
        }

        void finishOnboarding();
      }}
      onComplete={() => {
        if (NUTRITION_QUESTION_COUNT >= NUTRITION_INPUT_COUNT) {
          goToStep(RECOMMENDED_TARGETS_STEP);
          return;
        }

        void finishOnboarding();
      }}
    />
  );

  let content = null;

  if (step === -1) {
    content = renderWelcome();
  } else if (step >= 0 && step < BENEFIT_SLIDE_COUNT) {
    content = renderBenefitSlide(step);
  } else if (step === PERSONALIZATION_INTRO_STEP) {
    content = (
      <OnboardingNutritionProfileIntro
        onBack={() => goToStep(BENEFIT_SLIDE_COUNT - 1)}
        onContinue={advanceFromPersonalizationIntro}
      />
    );
  } else if (step >= FIRST_QUESTION_STEP && step < FIRST_QUESTION_STEP + ONBOARDING_QUESTION_COUNT) {
    content = renderQuestionStep(step - FIRST_QUESTION_STEP);
  } else if (step === PROFILE_PROGRESS_STEP) {
    content = (
      <OnboardingProfileProgressScreen
        onBack={() => goToStep(FIRST_QUESTION_STEP + ONBOARDING_QUESTION_COUNT - 1)}
        onContinue={() => goToStep(FIRST_NUTRITION_STEP)}
      />
    );
  } else if (
    step >= FIRST_NUTRITION_STEP &&
    step < FIRST_NUTRITION_STEP + NUTRITION_QUESTION_COUNT
  ) {
    content = renderNutritionStep(step - FIRST_NUTRITION_STEP);
  } else if (step === RECOMMENDED_TARGETS_STEP) {
    content = (
      <OnboardingRecommendedTargets
        onBack={() => goToStep(FIRST_NUTRITION_STEP + NUTRITION_QUESTION_COUNT - 1)}
        onContinue={() => {
          applyNutritionTargetsToProfile(readOnboardingProfileDraft());
          void finishOnboarding();
        }}
      />
    );
  }

  return (
    <AnimatePresence mode="wait" custom={{ reduceMotion, direction }}>
      <motion.div
        key={step}
        custom={{ reduceMotion, direction }}
        variants={onboardingScreenVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={onboardingTransition(reduceMotion, 0, 0.38)}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}
