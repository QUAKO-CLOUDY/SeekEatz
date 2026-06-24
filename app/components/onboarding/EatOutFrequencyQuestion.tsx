"use client";

import { useState } from "react";
import { OnboardingQuestionLayout } from "./OnboardingQuestionLayout";
import { OnboardingSingleSelectCards } from "./OnboardingSingleSelectCards";
import {
  EAT_OUT_FREQUENCY_OPTIONS,
  ONBOARDING_QUESTION_COUNT,
  type EatOutFrequency,
} from "./onboarding-questions";
import {
  mergeOnboardingProfileDraft,
  readOnboardingProfileDraft,
} from "./onboarding-profile";

type Props = {
  onBack: () => void;
  onAdvance: () => void;
};

export function EatOutFrequencyQuestion({ onBack, onAdvance }: Props) {
  const draft = readOnboardingProfileDraft();
  const [value, setValue] = useState<EatOutFrequency | undefined>(
    draft.eat_out_frequency as EatOutFrequency | undefined,
  );

  const handleContinue = () => {
    if (!value) {
      return;
    }

    mergeOnboardingProfileDraft({ eat_out_frequency: value });
    onAdvance();
  };

  return (
    <OnboardingQuestionLayout
      stepKey="eat-out-frequency"
      stepIndex={0}
      totalSteps={ONBOARDING_QUESTION_COUNT}
      eyebrow="Nutrition profile"
      title="How often do you eat out from restaurants each week?"
      onBack={onBack}
      onNext={handleContinue}
      nextDisabled={!value}
    >
      <OnboardingSingleSelectCards
        value={value}
        options={EAT_OUT_FREQUENCY_OPTIONS}
        onChange={(next) => setValue(next as EatOutFrequency)}
      />
    </OnboardingQuestionLayout>
  );
}
