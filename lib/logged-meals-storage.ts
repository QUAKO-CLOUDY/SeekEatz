import type { LoggedMeal } from "@/app/components/LogScreen";

const GUEST_SUFFIX = "guest";
const LEGACY_LOGGED_MEALS_KEY = "seekeatz_logged_meals";
const LEGACY_LAST_RESET_DATE_KEY = "seekeatz_last_reset_date";

export function getLoggedMealsStorageKey(userId?: string | null): string {
  return userId ? `seekeatz_logged_meals:${userId}` : `seekeatz_logged_meals:${GUEST_SUFFIX}`;
}

export function getLastResetDateStorageKey(userId?: string | null): string {
  return userId
    ? `seekeatz_last_reset_date:${userId}`
    : `seekeatz_last_reset_date:${GUEST_SUFFIX}`;
}

export function migrateLegacyLoggedMealsStorage(userId?: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  const scopedMealsKey = getLoggedMealsStorageKey(userId);
  const scopedResetKey = getLastResetDateStorageKey(userId);

  const scopedMeals = localStorage.getItem(scopedMealsKey);
  const scopedReset = localStorage.getItem(scopedResetKey);
  const legacyMeals = localStorage.getItem(LEGACY_LOGGED_MEALS_KEY);
  const legacyReset = localStorage.getItem(LEGACY_LAST_RESET_DATE_KEY);

  if (!scopedMeals && legacyMeals) {
    localStorage.setItem(scopedMealsKey, legacyMeals);
  }

  if (!scopedReset && legacyReset) {
    localStorage.setItem(scopedResetKey, legacyReset);
  }

  if (scopedMealsKey !== LEGACY_LOGGED_MEALS_KEY) {
    localStorage.removeItem(LEGACY_LOGGED_MEALS_KEY);
  }

  if (scopedResetKey !== LEGACY_LAST_RESET_DATE_KEY) {
    localStorage.removeItem(LEGACY_LAST_RESET_DATE_KEY);
  }
}

export function clearLoggedMealsStorageForUser(userId?: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(getLoggedMealsStorageKey(userId));
  localStorage.removeItem(getLastResetDateStorageKey(userId));

  if (userId) {
    localStorage.removeItem(LEGACY_LOGGED_MEALS_KEY);
    localStorage.removeItem(LEGACY_LAST_RESET_DATE_KEY);
  }
}

export function readLoggedMealsFromStorage(userId?: string | null): LoggedMeal[] {
  if (typeof window === "undefined") {
    return [];
  }

  migrateLegacyLoggedMealsStorage(userId);
  const raw = localStorage.getItem(getLoggedMealsStorageKey(userId));

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LoggedMeal[]) : [];
  } catch {
    return [];
  }
}
