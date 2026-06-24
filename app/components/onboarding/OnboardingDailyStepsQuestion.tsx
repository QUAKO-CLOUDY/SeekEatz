"use client";

import { useState } from "react";
import { OnboardingQuestionLayout } from "./OnboardingQuestionLayout";
import { OnboardingSingleSelectCards } from "./OnboardingSingleSelectCards";
import {
  DAILY_STEPS_OPTIONS,
  NUTRITION_INPUT_COUNT,
  type DailyStepsRange,
} from "./nutrition-questions";
import {
  mergeOnboardingProfileDraft,
  readOnboardingProfileDraft,
} from "./onboarding-profile";

type Props = {
  stepIndex: number;
  onBack: () => void;
  onAdvance: () => void;
};

export function OnboardingDailyStepsQuestion({ stepIndex, onBack, onAdvance }: Props) {
  const draft = readOnboardingProfileDraft();
  const [value, setValue] = useState<DailyStepsRange | undefined>(
    draft.daily_steps_range as DailyStepsRange | undefined,
  );

  const handleContinue = () => {
    if (!value) {
      return;
    }

    mergeOnboardingProfileDraft({ daily_steps_range: value });
    onAdvance();
  };

  return (
    <OnboardingQuestionLayout
      stepKey="daily-steps"
      stepIndex={stepIndex}
      totalSteps={NUTRITION_INPUT_COUNT}
      eyebrow="Personalization"
      title="On average, how many steps do you take each day?"
      onBack={onBack}
      onNext={handleContinue}
      nextDisabled={!value}
    >
      <OnboardingSingleSelectCards
        options={DAILY_STEPS_OPTIONS}
        value={value}
        onChange={(next) => setValue(next as DailyStepsRange)}
      />
    </OnboardingQuestionLayout>
  );
}
