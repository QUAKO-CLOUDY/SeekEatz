/**
 * GuestSession utility for managing guest user session data
 * Stores data in sessionStorage with inactivity timeout (30 minutes)
 * Resets on tab close or 30 minutes of inactivity
 */

const GUEST_SESSION_ID_KEY = 'seekeatz_guest_session_id';
const GUEST_TRIAL_COUNT_KEY = 'guest_trial_count';
const GUEST_LAST_ACTIVITY_KEY = 'seekeatz_chat_lastActivityAt';
const GUEST_CHAT_MESSAGES_KEY = 'seekeatz_chat_messages';
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export interface GuestChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meals?: any[];
  mealSearchContext?: any;
  isGateMessage?: boolean;
}

/**
 * Get or create a guest session ID (UUID)
 */
export function getGuestSessionId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const storage = window.sessionStorage;
    let sessionId = storage.getItem(GUEST_SESSION_ID_KEY);

    if (!sessionId) {
      // Generate a proper UUID
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        sessionId = crypto.randomUUID();
      } else {
        // Fallback UUID v4 generation
        sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }
      storage.setItem(GUEST_SESSION_ID_KEY, sessionId);
    }

    return sessionId;
  } catch (e) {
    console.error('Failed to get/create guest session ID:', e);
    return '';
  }
}

/**
 * Rotate session ID (create new one)
 */
export function rotateGuestSessionId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const storage = window.sessionStorage;
    // Generate a new UUID
    let sessionId: string;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      sessionId = crypto.randomUUID();
    } else {
      // Fallback UUID v4 generation
      sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    storage.setItem(GUEST_SESSION_ID_KEY, sessionId);
    return sessionId;
  } catch (e) {
    console.error('Failed to rotate guest session ID:', e);
    return '';
  }
}

/**
 * Check if guest session has expired due to inactivity
 */
function checkInactivity(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const storage = window.sessionStorage;
    const lastActivityRaw = storage.getItem(GUEST_LAST_ACTIVITY_KEY);

    if (!lastActivityRaw) {
      // No activity recorded - treat as expired
      return true;
    }

    const lastActivity = parseInt(lastActivityRaw, 10);
    if (Number.isNaN(lastActivity)) {
      return true;
    }

    const now = Date.now();
    const timeSinceActivity = now - lastActivity;

    return timeSinceActivity > INACTIVITY_TIMEOUT_MS;
  } catch (e) {
    console.error('Failed to check inactivity:', e);
    return true; // Treat errors as expired for safety
  }
}

/**
 * Update last activity timestamp (alias for touchGuestActivity)
 */
export function updateGuestActivity(): void {
  touchGuestActivity();
}

/**
 * Touch guest activity (update timestamp)
 */
export function touchGuestActivity(): void {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(GUEST_LAST_ACTIVITY_KEY, Date.now().toString());
  } catch (e) {
    console.error('Failed to touch guest activity:', e);
  }
}

/**
 * Get guest trial count (0-3)
 */
export function getGuestTrialCount(): number {
  if (typeof window === 'undefined') return 0;

  // Check inactivity first
  if (checkInactivity()) {
    clearGuestSession();
    return 0;
  }

  try {
    const storage = window.sessionStorage;
    const countRaw = storage.getItem(GUEST_TRIAL_COUNT_KEY);

    if (!countRaw) {
      return 0;
    }

    const count = parseInt(countRaw, 10);
    return Number.isNaN(count) ? 0 : Math.max(0, Math.min(3, count));
  } catch (e) {
    console.error('Failed to get guest trial count:', e);
    return 0;
  }
}

/**
 * Increment guest trial count
 */
export function incrementGuestTrialCount(): number {
  if (typeof window === 'undefined') return 0;

  const current = getGuestTrialCount();
  const newCount = Math.min(3, current + 1);

  try {
    window.sessionStorage.setItem(GUEST_TRIAL_COUNT_KEY, newCount.toString());
    updateGuestActivity();
    return newCount;
  } catch (e) {
    console.error('Failed to increment guest trial count:', e);
    return current;
  }
}

/**
 * Get guest chat messages
 */
export function getGuestChatMessages(): GuestChatMessage[] {
  if (typeof window === 'undefined') return [];

  // Check inactivity first
  if (checkInactivity()) {
    clearGuestSession();
    return [];
  }

  try {
    const storage = window.sessionStorage;
    const messagesRaw = storage.getItem(GUEST_CHAT_MESSAGES_KEY);

    if (!messagesRaw) {
      return [];
    }

    const parsed = JSON.parse(messagesRaw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to get guest chat messages:', e);
    return [];
  }
}

/**
 * Save guest chat messages
 */
export function saveGuestChatMessages(messages: GuestChatMessage[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(GUEST_CHAT_MESSAGES_KEY, JSON.stringify(messages));
    updateGuestActivity();
  } catch (e) {
    console.error('Failed to save guest chat messages:', e);
  }
}

/**
 * Clear all guest session data (chat messages, but NOT trial count)
 */
export function clearGuestSession(): void {
  if (typeof window === 'undefined') return;

  try {
    const storage = window.sessionStorage;
    // Clear chat data but keep trial count
    storage.removeItem(GUEST_CHAT_MESSAGES_KEY);
    storage.removeItem(GUEST_LAST_ACTIVITY_KEY);
    // Rotate session ID to start fresh
    rotateGuestSessionId();
  } catch (e) {
    console.error('Failed to clear guest session:', e);
  }
}

/**
 * Clear guest session including trial count (for sign out)
 */
export function clearGuestSessionFull(): void {
  if (typeof window === 'undefined') return;

  try {
    const storage = window.sessionStorage;
    storage.removeItem(GUEST_SESSION_ID_KEY);
    storage.removeItem(GUEST_TRIAL_COUNT_KEY);
    storage.removeItem(GUEST_LAST_ACTIVITY_KEY);
    storage.removeItem(GUEST_CHAT_MESSAGES_KEY);
  } catch (e) {
    console.error('Failed to clear guest session fully:', e);
  }
}

/**
 * Get current session ID (for claiming during signup)
 */
export function getCurrentSessionId(): string {
  return getGuestSessionId();
}

/**
 * Migrate guest chat messages (for use during signup)
 * Returns the messages and session ID, but does NOT clear sessionStorage
 * (caller should handle clearing after successful migration)
 */
export function getGuestChatForMigration(): { sessionId: string; messages: GuestChatMessage[] } {
  const sessionId = getGuestSessionId();
  const messages = getGuestChatMessages();
  return { sessionId, messages };
}

