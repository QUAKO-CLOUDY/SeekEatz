import {
  calculateNutritionTargets,
  type ActivityLevel,
  type DailyStepsRange,
  type Gender,
} from "@/lib/nutrition-calculations";
import type { OnboardingProfileDraft } from "./onboarding-profile";
import { mergeOnboardingProfileDraft } from "./onboarding-profile";

export function applyNutritionTargetsToProfile(
  draft: OnboardingProfileDraft,
): OnboardingProfileDraft | null {
  const {
    gender,
    age,
    height_ft: heightFt,
    height_in: heightIn,
    weight_lbs: weightLbs,
    activity_level: activityLevel,
    daily_steps_range: dailyStepsRange,
  } = draft;

  if (
    !gender ||
    age == null ||
    heightFt == null ||
    heightIn == null ||
    weightLbs == null ||
    !activityLevel
  ) {
    return null;
  }

  const targets = calculateNutritionTargets({
    gender: gender as Gender,
    age,
    heightFt,
    heightIn,
    weightLbs,
    activityLevel: activityLevel as ActivityLevel,
    dailyStepsRange: dailyStepsRange as DailyStepsRange | undefined,
  });

  return mergeOnboardingProfileDraft({
    bmr: targets.bmr,
    target_calories: targets.maintenanceCalories,
    target_protein_g: targets.proteinG,
    target_carbs_g: targets.carbsG,
    target_fats_g: targets.fatG,
  });
}
