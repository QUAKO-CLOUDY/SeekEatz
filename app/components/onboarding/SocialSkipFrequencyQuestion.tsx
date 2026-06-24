"use client";

import { useState } from "react";
import { OnboardingQuestionLayout } from "./OnboardingQuestionLayout";
import { OnboardingSingleSelectCards } from "./OnboardingSingleSelectCards";
import {
  ONBOARDING_QUESTION_COUNT,
  SOCIAL_SKIP_FREQUENCY_OPTIONS,
  type SocialSkipFrequency,
} from "./onboarding-questions";
import {
  mergeOnboardingProfileDraft,
  readOnboardingProfileDraft,
} from "./onboarding-profile";

type Props = {
  stepIndex: number;
  onBack: () => void;
  onAdvance: () => void;
};

export function SocialSkipFrequencyQuestion({ stepIndex, onBack, onAdvance }: Props) {
  const draft = readOnboardingProfileDraft();
  const [value, setValue] = useState<SocialSkipFrequency | undefined>(
    draft.social_skip_frequency as SocialSkipFrequency | undefined,
  );

  const handleContinue = () => {
    if (!value) {
      return;
    }

    mergeOnboardingProfileDraft({ social_skip_frequency: value });
    onAdvance();
  };

  return (
    <OnboardingQuestionLayout
      stepKey="social-skip-frequency"
      stepIndex={stepIndex}
      totalSteps={ONBOARDING_QUESTION_COUNT}
      eyebrow="Nutrition profile"
      title="How often have you skipped a restaurant, social event, or dinner plans because you were worried about staying on track?"
      onBack={onBack}
      onNext={handleContinue}
      nextDisabled={!value}
    >
      <OnboardingSingleSelectCards
        value={value}
        options={SOCIAL_SKIP_FREQUENCY_OPTIONS}
        onChange={(next) => setValue(next as SocialSkipFrequency)}
      />
    </OnboardingQuestionLayout>
  );
}
