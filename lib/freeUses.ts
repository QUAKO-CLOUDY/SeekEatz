/**
 * Free use counter for anonymous users
 * Tracks successful "use" actions (meal search/recommendation calls)
 * Stored in localStorage, persists across sessions
 */

const FREE_USES_KEY = 'mm_free_uses';
const MAX_FREE_USES = 3;

/**
 * Get current free use count (0-3)
 */
export function getFreeUseCount(): number {
  if (typeof window === 'undefined') return 0;

  try {
    const storage = window.localStorage;
    const countRaw = storage.getItem(FREE_USES_KEY);

    if (!countRaw) {
      return 0;
    }

    const count = parseInt(countRaw, 10);
    return Number.isNaN(count) ? 0 : Math.max(0, Math.min(MAX_FREE_USES, count));
  } catch (e) {
    console.error('Failed to get free use count:', e);
    return 0;
  }
}

/**
 * Increment free use count
 * Only increments if count is less than MAX_FREE_USES
 * Returns the new count
 */
export function incrementFreeUseCount(): number {
  if (typeof window === 'undefined') return 0;

  const current = getFreeUseCount();
  if (current >= MAX_FREE_USES) {
    return current; // Don't increment beyond max
  }

  const newCount = current + 1;

  try {
    window.localStorage.setItem(FREE_USES_KEY, newCount.toString());
    return newCount;
  } catch (e) {
    console.error('Failed to increment free use count:', e);
    return current;
  }
}

/**
 * Reset free use count to 0
 * Called after successful authentication/account creation
 */
export function resetFreeUseCount(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(FREE_USES_KEY, '0');
  } catch (e) {
    console.error('Failed to reset free use count:', e);
  }
}

/**
 * Check if user has reached the free use limit
 * Returns true if count >= MAX_FREE_USES
 */
export function hasReachedFreeUseLimit(): boolean {
  return getFreeUseCount() >= MAX_FREE_USES;
}

