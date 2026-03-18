import type { Meal } from '@/app/types';

/**
 * Diversifies a list of meals by restaurant while preserving all nutrition constraints.
 *
 * Algorithm:
 * - Group meals by restaurant (restaurant_name or restaurant).
 * - Shuffle restaurant order on each call.
 * - Shuffle meals within each restaurant.
 * - Take one meal per restaurant in round‑robin passes until:
 *   - all meals are exhausted, or
 *   - the optional limit is reached.
 */
export function diversifyMealsByRestaurant(meals: Meal[], limit?: number): Meal[] {
  if (!meals || meals.length === 0) return [];

  const targetLimit = typeof limit === 'number' && limit > 0 ? limit : meals.length;

  // Group meals by restaurant identifier
  const groups = new Map<string, Meal[]>();
  for (const meal of meals) {
    const key = (meal.restaurant_name || meal.restaurant || 'unknown').trim() || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(meal);
  }

  const restaurantKeys = Array.from(groups.keys());

  // Edge case: only one restaurant – still return meals from that restaurant,
  // but shuffle within the restaurant for some variety.
  if (restaurantKeys.length === 1) {
    const onlyKey = restaurantKeys[0];
    const onlyMeals = shuffleArray(groups.get(onlyKey) || []);
    return onlyMeals.slice(0, targetLimit);
  }

  // Shuffle restaurant order and meals within each restaurant
  const shuffledRestaurants = shuffleArray(restaurantKeys.slice());
  const shuffledGroups = new Map<string, Meal[]>();
  for (const key of shuffledRestaurants) {
    const mealsForRestaurant = groups.get(key) || [];
    shuffledGroups.set(key, shuffleArray(mealsForRestaurant.slice()));
  }

  // Round‑robin selection: take one meal per restaurant per pass
  const result: Meal[] = [];
  const indices = new Map<string, number>();
  for (const key of shuffledRestaurants) {
    indices.set(key, 0);
  }

  let exhausted = false;
  while (!exhausted && result.length < targetLimit) {
    exhausted = true;

    for (const key of shuffledRestaurants) {
      if (result.length >= targetLimit) break;

      const groupMeals = shuffledGroups.get(key) || [];
      const idx = indices.get(key) ?? 0;

      if (idx < groupMeals.length) {
        result.push(groupMeals[idx]);
        indices.set(key, idx + 1);
        exhausted = false;
      }
    }
  }

  // If the result set is still smaller than limit and we exhausted all groups,
  // just return everything we have; do NOT relax nutrition constraints.
  return result;
}

/**
 * Simple in‑place Fisher‑Yates shuffle using Math.random().
 * Used only after strict filtering has already been applied.
 */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

