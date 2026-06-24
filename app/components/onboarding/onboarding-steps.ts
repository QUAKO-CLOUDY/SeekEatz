export const BENEFIT_SLIDE_COUNT = 3;

/** Personalization intro — after benefit slides, before profile questions. */
export const PERSONALIZATION_INTRO_STEP = BENEFIT_SLIDE_COUNT;

export const FIRST_QUESTION_STEP = PERSONALIZATION_INTRO_STEP + 1;

export function getProfileProgressStep(questionCount: number) {
  return FIRST_QUESTION_STEP + questionCount;
}

export function getFirstNutritionStep(questionCount: number) {
  return getProfileProgressStep(questionCount) + 1;
}

export function getRecommendedTargetsStep(
  questionCount: number,
  nutritionQuestionCount: number,
) {
  return getFirstNutritionStep(questionCount) + nutritionQuestionCount;
}
