import type { Meal } from '@/app/types';

export type ManualMealFormValues = {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fats: string;
};

export function canSubmitManualMeal(values: ManualMealFormValues): boolean {
  return Boolean(
    values.name.trim() ||
      values.calories.trim() ||
      values.protein.trim() ||
      values.carbs.trim() ||
      values.fats.trim()
  );
}

export function buildManualMealFromForm(
  values: ManualMealFormValues,
  overrides?: Partial<Meal>
): Meal {
  return {
    id: overrides?.id ?? `manual-${Date.now()}`,
    name: values.name.trim() || 'Manual meal',
    restaurant: overrides?.restaurant ?? 'Manual Entry',
    rating: overrides?.rating ?? 0,
    category: overrides?.category ?? 'restaurant',
    image: overrides?.image ?? '/logos/default.png',
    calories: parseInt(values.calories, 10) || 0,
    protein: parseInt(values.protein, 10) || 0,
    carbs: parseInt(values.carbs, 10) || 0,
    fats: parseInt(values.fats, 10) || 0,
  };
}

export const manualLogButtonBaseClassName =
  'flex-1 h-12 rounded-full font-medium inline-flex items-center justify-center gap-2 transition-all';

export const manualLogButtonActiveClassName =
  'bg-gradient-to-r from-sky-400 to-cyan-400 text-white shadow-md shadow-sky-300/25 hover:from-sky-500 hover:to-cyan-500 dark:shadow-sky-500/15';

export const manualLogButtonDisabledClassName =
  'bg-muted text-muted-foreground cursor-not-allowed';

/** @deprecated Prefer getManualLogButtonClassName for consistent disabled layout */
export const manualLogButtonClassName = `${manualLogButtonBaseClassName} ${manualLogButtonActiveClassName}`;

export function getManualLogButtonClassName(isValid: boolean): string {
  return `${manualLogButtonBaseClassName} ${
    isValid ? manualLogButtonActiveClassName : manualLogButtonDisabledClassName
  }`;
}
