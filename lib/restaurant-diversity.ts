import type { Meal } from '@/app/types';

export interface RestaurantDiversityHistory {
  seenMealIds?: Set<string>;
  restaurantExposure?: Map<string, number>;
}

/**
 * Diversify a list of meals by restaurant while preserving already-filtered results.
 * Preference order:
 * 1. restaurants shown less often in the current chat session
 * 2. unseen meal cards before previously shown cards
 * 3. one meal per restaurant per pass before repeating a restaurant
 */
export function diversifyMealsByRestaurant(
  meals: Meal[],
  limit?: number,
  history?: RestaurantDiversityHistory
): Meal[] {
  if (!meals || meals.length === 0) return [];

  const targetLimit = typeof limit === 'number' && limit > 0 ? limit : meals.length;
  const seenMealIds = history?.seenMealIds ?? new Set<string>();
  const restaurantExposure = history?.restaurantExposure ?? new Map<string, number>();

  const groups = new Map<string, Meal[]>();
  for (const meal of meals) {
    const key = getRestaurantKey(meal);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(meal);
  }

  const prioritizedRestaurants = Array.from(groups.keys()).sort((a, b) => {
    const exposureDiff = (restaurantExposure.get(a) ?? 0) - (restaurantExposure.get(b) ?? 0);
    if (exposureDiff !== 0) {
      return exposureDiff;
    }
    return a.localeCompare(b);
  });

  const prioritizedGroups = new Map<string, Meal[]>();
  for (const key of prioritizedRestaurants) {
    const mealsForRestaurant = groups.get(key) ?? [];
    prioritizedGroups.set(
      key,
      mealsForRestaurant.slice().sort((left, right) => {
        const seenDiff =
          Number(seenMealIds.has(left.id)) - Number(seenMealIds.has(right.id));
        if (seenDiff !== 0) {
          return seenDiff;
        }

        const calorieDiff = left.calories - right.calories;
        if (calorieDiff !== 0) {
          return calorieDiff;
        }

        return left.name.localeCompare(right.name);
      })
    );
  }

  if (prioritizedRestaurants.length === 1) {
    const onlyMeals = prioritizedGroups.get(prioritizedRestaurants[0]) ?? [];
    return onlyMeals.slice(0, targetLimit);
  }

  const result: Meal[] = [];
  const indices = new Map<string, number>();
  for (const key of prioritizedRestaurants) {
    indices.set(key, 0);
  }

  let exhausted = false;
  while (!exhausted && result.length < targetLimit) {
    exhausted = true;

    for (const key of prioritizedRestaurants) {
      if (result.length >= targetLimit) break;

      const groupMeals = prioritizedGroups.get(key) ?? [];
      const idx = indices.get(key) ?? 0;

      if (idx < groupMeals.length) {
        result.push(groupMeals[idx]);
        indices.set(key, idx + 1);
        exhausted = false;
      }
    }
  }

  return result;
}

function getRestaurantKey(meal: Meal): string {
  return (meal.restaurant_name || meal.restaurant || 'unknown').trim().toLowerCase() || 'unknown';
}
