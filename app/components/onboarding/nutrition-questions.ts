import type { ActivityLevel, DailyStepsRange } from "@/lib/nutrition-calculations";

/** Total nutrition input screens before Recommended Targets. */
export const NUTRITION_INPUT_COUNT = 3;

export const NUTRITION_QUESTION_COUNT = 3;

export type { DailyStepsRange };

export const DAILY_STEPS_OPTIONS: Array<{
  value: DailyStepsRange;
  label: string;
}> = [
  { value: "under-5000", label: "Less than 5,000" },
  { value: "5000-7000", label: "5,000–7,000" },
  { value: "7000-10000", label: "7,000–10,000" },
  { value: "10000-15000", label: "10,000–15,000" },
  { value: "15000-20000", label: "15,000–20,000" },
  { value: "20000-plus", label: "20,000+" },
];

export const ACTIVITY_LEVEL_OPTIONS: Array<{
  value: ActivityLevel;
  label: string;
  description: string;
}> = [
  {
    value: "sedentary",
    label: "Sedentary",
    description: "Little to no exercise and just steps throughout the day.",
  },
  {
    value: "lightly-active",
    label: "Lightly Active",
    description: "Light exercise 1–3 days per week or a moderately active job.",
  },
  {
    value: "moderately-active",
    label: "Moderately Active",
    description: "Exercise 3–5 days per week and regular daily movement.",
  },
  {
    value: "very-active",
    label: "Very Active",
    description: "Exercise 6–7 days per week or a physically demanding job.",
  },
  {
    value: "extremely-active",
    label: "Extremely Active",
    description: "Intense training, competitive athletics, or highly physical work most days.",
  },
];
