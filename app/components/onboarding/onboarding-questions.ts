export type EatOutFrequency =
  | "rarely"
  | "1-2"
  | "3-5"
  | "6-9"
  | "10-14"
  | "15-plus";

export const EAT_OUT_FREQUENCY_OPTIONS: Array<{
  value: EatOutFrequency;
  label: string;
}> = [
  { value: "rarely", label: "Rarely (Less than 1 meal per week)" },
  { value: "1-2", label: "1–2 meals per week" },
  { value: "3-5", label: "3–5 meals per week" },
  { value: "6-9", label: "6–9 meals per week" },
  { value: "10-14", label: "10–14 meals per week" },
  { value: "15-plus", label: "15+ meals per week" },
];

export const ONBOARDING_QUESTION_COUNT = 4;

export type MacroConfidenceImpact =
  | "yes-significantly"
  | "yes-somewhat"
  | "not-sure"
  | "probably-not"
  | "no";

export const MACRO_CONFIDENCE_IMPACT_OPTIONS: Array<{
  value: MacroConfidenceImpact;
  label: string;
}> = [
  { value: "yes-significantly", label: "Yes, significantly" },
  { value: "yes-somewhat", label: "Yes, somewhat" },
  { value: "not-sure", label: "Not sure" },
  { value: "probably-not", label: "Probably not" },
  { value: "no", label: "No" },
];

export type EatingOutExperience =
  | "checked-menus-before-going-out"
  | "ordered-healthy-regretted"
  | "spent-10-min-comparing"
  | "logged-meal-uncertain-data"
  | "felt-guilty-after-eating-out"
  | "no-idea-what-fit-macros";

export const EATING_OUT_EXPERIENCE_OPTIONS: Array<{
  value: EatingOutExperience;
  label: string;
}> = [
  { value: "checked-menus-before-going-out", label: "Checked menus before going out" },
  { value: "ordered-healthy-regretted", label: 'Ordered something "healthy" and regretted it later' },
  { value: "spent-10-min-comparing", label: "Spent 10+ minutes comparing menu items" },
  {
    value: "logged-meal-uncertain-data",
    label: "Tried to log your meal after the fact and not confident about your data",
  },
  { value: "felt-guilty-after-eating-out", label: "Felt guilty after eating out" },
  { value: "no-idea-what-fit-macros", label: "Had no idea what fit your macros" },
];

export type SocialSkipFrequency =
  | "never"
  | "once-or-twice"
  | "occasionally"
  | "frequently"
  | "all-the-time";

export const SOCIAL_SKIP_FREQUENCY_OPTIONS: Array<{
  value: SocialSkipFrequency;
  label: string;
}> = [
  { value: "never", label: "Never" },
  { value: "once-or-twice", label: "Once or twice" },
  { value: "occasionally", label: "Occasionally" },
  { value: "frequently", label: "Frequently" },
  { value: "all-the-time", label: "All the time" },
];
