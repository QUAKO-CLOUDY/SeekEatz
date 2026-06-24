"use client";

import type { ReactNode } from "react";
import { EatOutFrequencyQuestion } from "./EatOutFrequencyQuestion";
import { EatingOutExperiencesQuestion } from "./EatingOutExperiencesQuestion";
import { MacroConfidenceQuestion } from "./MacroConfidenceQuestion";
import { SocialSkipFrequencyQuestion } from "./SocialSkipFrequencyQuestion";
import { ONBOARDING_QUESTION_COUNT } from "./onboarding-questions";

export { ONBOARDING_QUESTION_COUNT };

type Props = {
  questionIndex: number;
  onBack: () => void;
  onComplete: () => void;
  onAdvance: () => void;
};

export function OnboardingProfileQuestions({
  questionIndex,
  onBack,
  onAdvance,
}: Props): ReactNode {
  switch (questionIndex) {
    case 0:
      return <EatOutFrequencyQuestion onBack={onBack} onAdvance={onAdvance} />;
    case 1:
      return (
        <SocialSkipFrequencyQuestion
          stepIndex={1}
          onBack={onBack}
          onAdvance={onAdvance}
        />
      );
    case 2:
      return (
        <EatingOutExperiencesQuestion
          stepIndex={2}
          onBack={onBack}
          onAdvance={onAdvance}
        />
      );
    case 3:
      return (
        <MacroConfidenceQuestion
          stepIndex={3}
          onBack={onBack}
          onAdvance={onAdvance}
        />
      );
    default:
      return null;
  }
}
