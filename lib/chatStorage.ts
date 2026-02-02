/**
 * Chat Storage Utility
 * Handles sessionStorage persistence for chat state with debouncing
 */

const STORAGE_KEY = 'seekEatz.aiChat.v1';
const DEBOUNCE_MS = 300;

interface StoredChatState {
  messages: any[];
  visibleMealsCount: Record<string, number>;
  lastActiveAt: number;
}

let debounceTimer: NodeJS.Timeout | null = null;

/**
 * Load chat state from sessionStorage
 */
export function loadChatState(): StoredChatState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    return {
      messages: parsed.messages || [],
      visibleMealsCount: parsed.visibleMealsCount || {},
      lastActiveAt: parsed.lastActiveAt || Date.now(),
    };
  } catch (e) {
    console.error('[ChatStorage] Failed to load chat state:', e);
    return null;
  }
}

/**
 * Save chat state to sessionStorage (debounced)
 */
export function saveChatState(state: StoredChatState): void {
  if (typeof window === 'undefined') {
    return;
  }

  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Set new timer
  debounceTimer = setTimeout(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('[ChatStorage] Failed to save chat state:', e);
    }
    debounceTimer = null;
  }, DEBOUNCE_MS);
}

/**
 * Clear chat state from sessionStorage
 */
export function clearChatState(): void {
  if (typeof window === 'undefined') {
    return;
  }

  // Clear debounce timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('[ChatStorage] Failed to clear chat state:', e);
  }
}

/**
 * Immediately save chat state (no debounce) - use for logout/clear operations
 */
export function saveChatStateImmediate(state: StoredChatState): void {
  if (typeof window === 'undefined') {
    return;
  }

  // Clear any pending debounced save
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('[ChatStorage] Failed to save chat state immediately:', e);
  }
}

