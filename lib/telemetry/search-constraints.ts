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

  const macroFilters = searchParams.macroFilters;

  return Boolean(
    searchParams.calorieCap ||
      searchParams.minCalories ||
      searchParams.maxCalories ||
      searchParams.minProtein ||
      searchParams.maxProtein ||
      searchParams.minCarbs ||
      searchParams.maxCarbs ||
      searchParams.maxFat ||
      searchParams.maxFats ||
      searchParams.minFats ||
      searchParams.restaurant ||
      searchParams.diet ||
      searchParams.location ||
      macroFilters?.proteinMin ||
      macroFilters?.proteinMax ||
      macroFilters?.caloriesMax ||
      macroFilters?.caloriesMin ||
      macroFilters?.carbsMax ||
      macroFilters?.carbsMin ||
      macroFilters?.fatsMax ||
      macroFilters?.fatsMin
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
    maxFats: searchParams.maxFats,
    minFats: searchParams.minFats,
    restaurant: searchParams.restaurant,
    diet: searchParams.diet,
    location: searchParams.location,
    macroFilters: searchParams.macroFilters,
  };
}
