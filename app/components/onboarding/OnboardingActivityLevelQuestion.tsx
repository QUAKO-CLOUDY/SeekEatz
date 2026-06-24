"use client";

import { useState } from "react";
import { OnboardingQuestionLayout } from "./OnboardingQuestionLayout";
import { OnboardingSingleSelectCards } from "./OnboardingSingleSelectCards";
import {
  ACTIVITY_LEVEL_OPTIONS,
  NUTRITION_INPUT_COUNT,
} from "./nutrition-questions";
import {
  mergeOnboardingProfileDraft,
  readOnboardingProfileDraft,
} from "./onboarding-profile";
import type { ActivityLevel } from "@/lib/nutrition-calculations";

type Props = {
  stepIndex: number;
  onBack: () => void;
  onAdvance: () => void;
};

export function OnboardingActivityLevelQuestion({ stepIndex, onBack, onAdvance }: Props) {
  const draft = readOnboardingProfileDraft();
  const [value, setValue] = useState<ActivityLevel | undefined>(
    draft.activity_level as ActivityLevel | undefined,
  );

  const handleContinue = () => {
    if (!value) {
      return;
    }

    mergeOnboardingProfileDraft({ activity_level: value });
    onAdvance();
  };

  return (
    <OnboardingQuestionLayout
      stepKey="activity-level"
      stepIndex={stepIndex}
      totalSteps={NUTRITION_INPUT_COUNT}
      eyebrow="Personalization"
      title="How would you describe your typical activity level?"
      onBack={onBack}
      onNext={handleContinue}
      nextDisabled={!value}
    >
      <OnboardingSingleSelectCards
        options={ACTIVITY_LEVEL_OPTIONS}
        value={value}
        onChange={(next) => setValue(next as ActivityLevel)}
      />
    </OnboardingQuestionLayout>
  );
}
