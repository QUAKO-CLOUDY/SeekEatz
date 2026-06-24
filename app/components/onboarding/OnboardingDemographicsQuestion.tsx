"use client";

import { useMemo, useState } from "react";
import { Input } from "../ui/input";
import { OnboardingField } from "./OnboardingField";
import { OnboardingQuestionLayout } from "./OnboardingQuestionLayout";
import { NUTRITION_INPUT_COUNT } from "./nutrition-questions";
import {
  mergeOnboardingProfileDraft,
  readOnboardingProfileDraft,
} from "./onboarding-profile";
import {
  calculateBmr,
  heightToTotalInches,
  inchesToCm,
  poundsToKg,
  type Gender,
} from "@/lib/nutrition-calculations";

type Props = {
  stepIndex: number;
  onBack: () => void;
  onAdvance: () => void;
  onSkip: () => void;
};

function parseInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isDemographicsValid(args: {
  gender?: Gender;
  age: number | null;
  heightFt: number | null;
  heightIn: number | null;
  weightLbs: number | null;
}) {
  if (!args.gender) {
    return false;
  }

  if (args.age == null || args.age < 13 || args.age > 120) {
    return false;
  }

  if (args.heightFt == null || args.heightFt < 3 || args.heightFt > 8) {
    return false;
  }

  if (args.heightIn == null || args.heightIn < 0 || args.heightIn > 11) {
    return false;
  }

  if (args.weightLbs == null || args.weightLbs < 50 || args.weightLbs > 600) {
    return false;
  }

  return true;
}

export function OnboardingDemographicsQuestion({ stepIndex, onBack, onAdvance, onSkip }: Props) {
  const draft = readOnboardingProfileDraft();

  const [gender, setGender] = useState<Gender | undefined>(
    draft.gender as Gender | undefined,
  );
  const [age, setAge] = useState(draft.age != null ? String(draft.age) : "");
  const [heightFt, setHeightFt] = useState(
    draft.height_ft != null ? String(draft.height_ft) : "",
  );
  const [heightIn, setHeightIn] = useState(
    draft.height_in != null ? String(draft.height_in) : "",
  );
  const [weightLbs, setWeightLbs] = useState(
    draft.weight_lbs != null ? String(draft.weight_lbs) : "",
  );

  const parsed = useMemo(
    () => ({
      age: parseInteger(age),
      heightFt: parseInteger(heightFt),
      heightIn: parseInteger(heightIn),
      weightLbs: parseInteger(weightLbs),
    }),
    [age, heightFt, heightIn, weightLbs],
  );

  const isValid = isDemographicsValid({ gender, ...parsed });

  const handleContinue = () => {
    if (!isValid || !gender || parsed.age == null || parsed.heightFt == null || parsed.heightIn == null || parsed.weightLbs == null) {
      return;
    }

    const totalInches = heightToTotalInches(parsed.heightFt, parsed.heightIn);
    const bmr = Math.round(
      calculateBmr({
        gender,
        age: parsed.age,
        heightCm: inchesToCm(totalInches),
        weightKg: poundsToKg(parsed.weightLbs),
      }),
    );

    mergeOnboardingProfileDraft({
      gender,
      age: parsed.age,
      height_ft: parsed.heightFt,
      height_in: parsed.heightIn,
      weight_lbs: parsed.weightLbs,
      bmr,
    });

    onAdvance();
  };

  const inputClassName =
    "h-12 rounded-xl border-border/80 bg-background text-base shadow-sm focus-visible:border-cyan-500 focus-visible:ring-cyan-500/20";

  return (
    <OnboardingQuestionLayout
      stepKey="demographics"
      stepIndex={stepIndex}
      totalSteps={NUTRITION_INPUT_COUNT}
      eyebrow="Personalization"
      title="Tell us about yourself"
      description="We'll use your age, height, and weight to calculate your recommended daily targets."
      onBack={onBack}
      onNext={handleContinue}
      nextDisabled={!isValid}
      secondaryAction={{
        label: "Skip, I already know my macros and calories",
        onClick: onSkip,
      }}
    >
      <div className="space-y-5">
        <OnboardingField label="Gender">
          <div className="grid grid-cols-2 gap-3">
            {(["male", "female"] as const).map((option) => {
              const isSelected = gender === option;
              const label = option === "male" ? "Male" : "Female";

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setGender(option)}
                  className={`h-12 rounded-xl border text-sm font-medium transition-all ${
                    isSelected
                      ? "border-cyan-500 bg-cyan-500/10 text-foreground shadow-sm"
                      : "border-border/80 bg-background text-muted-foreground hover:border-cyan-500/30 hover:bg-muted/30"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </OnboardingField>

        <OnboardingField label="Age" htmlFor="onboarding-age">
          <Input
            id="onboarding-age"
            type="number"
            inputMode="numeric"
            min={13}
            max={120}
            placeholder="Years"
            value={age}
            onChange={(event) => setAge(event.target.value)}
            className={inputClassName}
          />
        </OnboardingField>

        <OnboardingField label="Height">
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <Input
                id="onboarding-height-ft"
                type="number"
                inputMode="numeric"
                min={3}
                max={8}
                placeholder="Feet"
                value={heightFt}
                onChange={(event) => setHeightFt(event.target.value)}
                className={`${inputClassName} pr-10`}
                aria-label="Height in feet"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                ft
              </span>
            </div>
            <div className="relative">
              <Input
                id="onboarding-height-in"
                type="number"
                inputMode="numeric"
                min={0}
                max={11}
                placeholder="Inches"
                value={heightIn}
                onChange={(event) => setHeightIn(event.target.value)}
                className={`${inputClassName} pr-10`}
                aria-label="Height in inches"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                in
              </span>
            </div>
          </div>
        </OnboardingField>

        <OnboardingField label="Weight" htmlFor="onboarding-weight">
          <div className="relative">
            <Input
              id="onboarding-weight"
              type="number"
              inputMode="numeric"
              min={50}
              max={600}
              placeholder="Weight"
              value={weightLbs}
              onChange={(event) => setWeightLbs(event.target.value)}
              className={`${inputClassName} pr-12`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              lbs
            </span>
          </div>
        </OnboardingField>
      </div>
    </OnboardingQuestionLayout>
  );
}
