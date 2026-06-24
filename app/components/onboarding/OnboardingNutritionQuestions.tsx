"use client";

import type { ReactNode } from "react";
import { OnboardingActivityLevelQuestion } from "./OnboardingActivityLevelQuestion";
import { OnboardingDailyStepsQuestion } from "./OnboardingDailyStepsQuestion";
import { OnboardingDemographicsQuestion } from "./OnboardingDemographicsQuestion";
import { NUTRITION_INPUT_COUNT, NUTRITION_QUESTION_COUNT } from "./nutrition-questions";

export { NUTRITION_INPUT_COUNT, NUTRITION_QUESTION_COUNT };

type Props = {
  questionIndex: number;
  onBack: () => void;
  onAdvance: () => void;
  onComplete: () => void;
  onSkip: () => void;
};

export function OnboardingNutritionQuestions({
  questionIndex,
  onBack,
  onAdvance,
  onComplete,
  onSkip,
}: Props): ReactNode {
  switch (questionIndex) {
    case 0:
      return (
        <OnboardingDemographicsQuestion
          stepIndex={0}
          onBack={onBack}
          onAdvance={onAdvance}
          onSkip={onSkip}
        />
      );
    case 1:
      return (
        <OnboardingActivityLevelQuestion
          stepIndex={1}
          onBack={onBack}
          onAdvance={onAdvance}
        />
      );
    case 2:
      return (
        <OnboardingDailyStepsQuestion
          stepIndex={2}
          onBack={onBack}
          onAdvance={onAdvance}
        />
      );
    default:
      return null;
  }
}
