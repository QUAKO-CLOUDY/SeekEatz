"use client";

import { useState } from "react";
import { OnboardingQuestionLayout } from "./OnboardingQuestionLayout";
import { OnboardingSingleSelectCards } from "./OnboardingSingleSelectCards";
import {
  MACRO_CONFIDENCE_IMPACT_OPTIONS,
  ONBOARDING_QUESTION_COUNT,
  type MacroConfidenceImpact,
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

export function MacroConfidenceQuestion({ stepIndex, onBack, onAdvance }: Props) {
  const draft = readOnboardingProfileDraft();
  const [value, setValue] = useState<MacroConfidenceImpact | undefined>(
    draft.macro_confidence_impact as MacroConfidenceImpact | undefined,
  );

  const handleContinue = () => {
    if (!value) {
      return;
    }

    mergeOnboardingProfileDraft({ macro_confidence_impact: value });
    onAdvance();
  };

  return (
    <OnboardingQuestionLayout
      stepKey="macro-confidence"
      stepIndex={stepIndex}
      totalSteps={ONBOARDING_QUESTION_COUNT}
      eyebrow="Nutrition profile"
      title="If you knew the calories and macros before ordering, would you feel more confident eating out?"
      onBack={onBack}
      onNext={handleContinue}
      nextDisabled={!value}
    >
      <OnboardingSingleSelectCards
        value={value}
        options={MACRO_CONFIDENCE_IMPACT_OPTIONS}
        onChange={(next) => setValue(next as MacroConfidenceImpact)}
      />
    </OnboardingQuestionLayout>
  );
}
