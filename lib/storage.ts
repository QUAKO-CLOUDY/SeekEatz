/**
 * User-scoped localStorage helpers
 * Prevents cross-account data bleed by namespacing keys with userId
 */

/**
 * Generate a user-scoped key
 */
export function getUserScopedKey(key: string, userId: string | null | undefined): string {
  if (!userId) {
    // For anonymous users, use device-scoped key (fallback to global if no device ID)
    if (typeof window !== 'undefined') {
      try {
        const deviceId = localStorage.getItem('mm_device_id');
        if (deviceId) {
          return `${key}:device:${deviceId}`;
        }
      } catch (e) {
        console.warn('Failed to get device ID for scoping:', e);
      }
    }
    // Fallback to global key for anonymous (legacy support)
    return key;
  }
  return `${key}:${userId}`;
}

/**
 * Set a user-scoped localStorage item
 */
export function setUserItem(key: string, userId: string | null | undefined, value: any): void {
  if (typeof window === 'undefined') return;
  
  try {
    const scopedKey = getUserScopedKey(key, userId);
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(scopedKey, serialized);
  } catch (e) {
    console.error(`Failed to set user-scoped item ${key}:`, e);
  }
}

/**
 * Get a user-scoped localStorage item
 */
export function getUserItem<T = any>(key: string, userId: string | null | undefined): T | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const scopedKey = getUserScopedKey(key, userId);
    const item = localStorage.getItem(scopedKey);
    if (item === null) return null;
    
    try {
      return JSON.parse(item) as T;
    } catch {
      // If parsing fails, return as string
      return item as T;
    }
  } catch (e) {
    console.error(`Failed to get user-scoped item ${key}:`, e);
    return null;
  }
}

/**
 * Remove a user-scoped localStorage item
 */
export function removeUserItem(key: string, userId: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  
  try {
    const scopedKey = getUserScopedKey(key, userId);
    localStorage.removeItem(scopedKey);
  } catch (e) {
    console.error(`Failed to remove user-scoped item ${key}:`, e);
  }
}

/**
 * Clear multiple user-scoped items
 */
export function clearUserScopedItems(userId: string | null | undefined, keys: string[]): void {
  if (typeof window === 'undefined') return;
  
  keys.forEach(key => {
    removeUserItem(key, userId);
  });
}

/**
 * Clear all user-scoped items for a given userId
 * Scans localStorage for keys matching the pattern and removes them
 */
export function clearAllUserScopedItems(userId: string | null | undefined): void {
  if (typeof window === 'undefined' || !userId) return;
  
  try {
    const prefix = `:${userId}`;
    const keysToRemove: string[] = [];
    
    // Scan all localStorage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.endsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    
    // Remove all matching keys
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
  } catch (e) {
    console.error('Failed to clear all user-scoped items:', e);
  }
}

/**
 * Legacy key migration helper
 * Migrates old global keys to user-scoped keys
 */
export function migrateLegacyKey(legacyKey: string, newKey: string, userId: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  
  try {
    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue !== null) {
      // Migrate to user-scoped key
      setUserItem(newKey, userId, legacyValue);
      // Optionally remove legacy key (uncomment if desired)
      // localStorage.removeItem(legacyKey);
    }
  } catch (e) {
    console.error(`Failed to migrate legacy key ${legacyKey}:`, e);
  }
}

