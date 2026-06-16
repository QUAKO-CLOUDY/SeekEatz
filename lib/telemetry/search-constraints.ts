import type { SearchParams } from '@/app/types';
import {
  extractMacroConstraintsFromText,
  hasConstraints,
} from '@/lib/extractMacroConstraintsFromText';

export function searchParamsHaveConstraints(
  searchParams: SearchParams,
  queryText: string
): boolean {
  const extracted = extractMacroConstraintsFromText(queryText);
  if (hasConstraints(extracted)) {
    return true;
  }

  return Boolean(
    searchParams.calorieCap ||
      searchParams.minCalories ||
      searchParams.maxCalories ||
      searchParams.minProtein ||
      searchParams.maxProtein ||
      searchParams.minCarbs ||
      searchParams.maxCarbs ||
      searchParams.maxFat ||
      searchParams.minFats ||
      searchParams.restaurant ||
      searchParams.dietType ||
      (searchParams.dietaryOptions && searchParams.dietaryOptions.length > 0)
  );
}

export function buildConstraintsPayload(
  searchParams: SearchParams,
  queryText: string
): Record<string, unknown> {
  const extracted = extractMacroConstraintsFromText(queryText);
  return {
    ...extracted,
    calorieCap: searchParams.calorieCap,
    minCalories: searchParams.minCalories,
    maxCalories: searchParams.maxCalories,
    minProtein: searchParams.minProtein,
    maxProtein: searchParams.maxProtein,
    minCarbs: searchParams.minCarbs,
    maxCarbs: searchParams.maxCarbs,
    maxFat: searchParams.maxFat,
    minFats: searchParams.minFats,
    restaurant: searchParams.restaurant,
    dietType: searchParams.dietType,
    dietaryOptions: searchParams.dietaryOptions,
  };
}
