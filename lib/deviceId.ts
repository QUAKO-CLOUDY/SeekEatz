/**
 * Device ID utility for stable anonymous user identification
 * Uses localStorage to persist device_id across sessions
 */

const DEVICE_ID_KEY = 'mm_device_id';

/**
 * Get or create a stable device ID
 * Returns a UUID stored in localStorage, persisting across sessions
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const storage = window.localStorage;
    let deviceId = storage.getItem(DEVICE_ID_KEY);

    if (!deviceId) {
      // Generate a proper UUID
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        deviceId = crypto.randomUUID();
      } else {
        // Fallback UUID v4 generation
        deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }
      storage.setItem(DEVICE_ID_KEY, deviceId);
    }

    return deviceId;
  } catch (e) {
    console.error('Failed to get/create device ID:', e);
    return '';
  }
}

/**
 * Clear device ID (for testing or account migration)
 */
export function clearDeviceId(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(DEVICE_ID_KEY);
  } catch (e) {
    console.error('Failed to clear device ID:', e);
  }
}

