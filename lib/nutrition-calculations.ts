export type Gender = "male" | "female";

export type ActivityLevel =
  | "sedentary"
  | "lightly-active"
  | "moderately-active"
  | "very-active"
  | "extremely-active";

export type DailyStepsRange =
  | "under-5000"
  | "5000-7000"
  | "7000-10000"
  | "10000-15000"
  | "15000-20000"
  | "20000-plus";

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  "lightly-active": 1.375,
  "moderately-active": 1.55,
  "very-active": 1.725,
  "extremely-active": 1.9,
};

/** Subtle nudge applied on top of activity multiplier (max +0.08 / −0.03). */
export const DAILY_STEPS_MULTIPLIER_ADJUSTMENT: Record<DailyStepsRange, number> = {
  "under-5000": -0.03,
  "5000-7000": 0,
  "7000-10000": 0.02,
  "10000-15000": 0.04,
  "15000-20000": 0.06,
  "20000-plus": 0.08,
};

export function getActivityMultiplier(
  activityLevel: ActivityLevel,
  dailyStepsRange?: DailyStepsRange,
): number {
  const base = ACTIVITY_MULTIPLIERS[activityLevel];
  if (!dailyStepsRange) {
    return base;
  }

  const adjustment = DAILY_STEPS_MULTIPLIER_ADJUSTMENT[dailyStepsRange] ?? 0;
  return Math.min(2, Math.max(1.1, base + adjustment));
}

export type NutritionTargets = {
  bmr: number;
  maintenanceCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

const LBS_TO_KG = 2.20462;
const INCHES_TO_CM = 2.54;

export function poundsToKg(weightLbs: number): number {
  return weightLbs / LBS_TO_KG;
}

export function inchesToCm(totalInches: number): number {
  return totalInches * INCHES_TO_CM;
}

export function heightToTotalInches(heightFt: number, heightIn: number): number {
  return heightFt * 12 + heightIn;
}

export function roundToNearest25(value: number): number {
  return Math.round(value / 25) * 25;
}

export function calculateBmr(args: {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
}): number {
  const { gender, age, heightCm, weightKg } = args;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;

  if (gender === "male") {
    return base + 5;
  }

  return base - 161;
}

export function calculateMaintenanceCalories(
  bmr: number,
  activityLevel: ActivityLevel,
  dailyStepsRange?: DailyStepsRange,
): number {
  return roundToNearest25(bmr * getActivityMultiplier(activityLevel, dailyStepsRange));
}

/** Grams of protein per pound of body weight for recommended targets. */
export const PROTEIN_GRAMS_PER_LB = 0.9;

export function calculateMacroTargets(maintenanceCalories: number, weightLbs: number) {
  const proteinG = Math.round(weightLbs * PROTEIN_GRAMS_PER_LB);
  const proteinCalories = proteinG * 4;
  const fatCalories = maintenanceCalories * 0.25;
  const fatG = Math.round(fatCalories / 9);
  const carbCalories = maintenanceCalories - proteinCalories - fatG * 9;
  const carbsG = Math.max(0, Math.round(carbCalories / 4));

  return {
    proteinG,
    carbsG,
    fatG,
  };
}

export function calculateNutritionTargets(args: {
  gender: Gender;
  age: number;
  heightFt: number;
  heightIn: number;
  weightLbs: number;
  activityLevel: ActivityLevel;
  dailyStepsRange?: DailyStepsRange;
}): NutritionTargets {
  const totalInches = heightToTotalInches(args.heightFt, args.heightIn);
  const heightCm = inchesToCm(totalInches);
  const weightKg = poundsToKg(args.weightLbs);
  const bmr = calculateBmr({
    gender: args.gender,
    age: args.age,
    heightCm,
    weightKg,
  });
  const maintenanceCalories = calculateMaintenanceCalories(
    bmr,
    args.activityLevel,
    args.dailyStepsRange,
  );
  const macros = calculateMacroTargets(maintenanceCalories, args.weightLbs);

  return {
    bmr: Math.round(bmr),
    maintenanceCalories,
    proteinG: macros.proteinG,
    carbsG: macros.carbsG,
    fatG: macros.fatG,
  };
}

export function formatCalories(value: number): string {
  return `${value.toLocaleString()} calories/day`;
}
