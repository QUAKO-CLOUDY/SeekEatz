"use client";

import { useState } from "react";
import { OnboardingQuestionLayout } from "./OnboardingQuestionLayout";
import { OnboardingMultiSelectField } from "./OnboardingMultiSelectField";
import {
  EATING_OUT_EXPERIENCE_OPTIONS,
  ONBOARDING_QUESTION_COUNT,
  type EatingOutExperience,
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

export function EatingOutExperiencesQuestion({ stepIndex, onBack, onAdvance }: Props) {
  const draft = readOnboardingProfileDraft();
  const [value, setValue] = useState<EatingOutExperience[]>(
    (draft.eating_out_experiences as EatingOutExperience[] | undefined) ?? [],
  );

  const handleContinue = () => {
    mergeOnboardingProfileDraft({ eating_out_experiences: value });
    onAdvance();
  };

  return (
    <OnboardingQuestionLayout
      stepKey="eating-out-experiences"
      stepIndex={stepIndex}
      totalSteps={ONBOARDING_QUESTION_COUNT}
      eyebrow="Nutrition profile"
      title="Have you ever done any of these?"
      description="Select all that apply."
      onBack={onBack}
      onNext={handleContinue}
    >
      <OnboardingMultiSelectField
        options={EATING_OUT_EXPERIENCE_OPTIONS}
        value={value}
        onChange={(next) => setValue(next as EatingOutExperience[])}
      />
    </OnboardingQuestionLayout>
  );
}
