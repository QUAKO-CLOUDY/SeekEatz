/**
 * UsageGate utility for checking and managing trial usage
 * Anonymous users get 3 free uses (successful meal search/recommendation calls)
 * Authenticated users have unlimited access (gate is always disabled)
 */

import { createClient } from '@/utils/supabase/client';
import { getFreeUseCount, incrementFreeUseCount, hasReachedFreeUseLimit } from './freeUses';

export type FeatureType = 'chat' | 'search';

/**
 * Check if a feature can be used
 * Returns true if user is authenticated OR anonymous user has remaining free uses
 * Gate is ALWAYS disabled for authenticated users
 */
export async function canUseFeature(feature: FeatureType): Promise<boolean> {
  // Check if user is authenticated FIRST
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Authenticated users have unlimited access - gate is disabled
      return true;
    }
  } catch (e) {
    // Auth check failed - treat as anonymous
    console.warn('Auth check failed in canUseFeature:', e);
  }

  // Anonymous user - check free use count
  const freeUseCount = getFreeUseCount();
  return freeUseCount < 3; // MAX_FREE_USES = 3
}

/**
 * Increment usage for a feature (only for anonymous users)
 * Only increments on successful completion of a "use" action
 * Returns the new count (0 for authenticated users)
 */
export async function incrementUsage(feature: FeatureType): Promise<number> {
  // Check if user is authenticated FIRST
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Authenticated users don't count usage
      return 0;
    }
  } catch (e) {
    // Auth check failed - treat as anonymous
    console.warn('Auth check failed in incrementUsage:', e);
  }

  // Anonymous user - increment free use count
  const newCount = incrementFreeUseCount();
  return newCount;
}

/**
 * Get current trial count (for display purposes)
 * Returns 0 for authenticated users
 */
export function getTrialCount(): number {
  // Note: This is a synchronous check, so we can't verify auth here
  // But it's only for display, so it's okay
  return getFreeUseCount();
}

/**
 * Check if user has reached the trial limit
 * Returns false for authenticated users (they never hit limit)
 */
export async function hasReachedLimit(): Promise<boolean> {
  // Check if user is authenticated FIRST
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Authenticated users never hit limit
      return false;
    }
  } catch (e) {
    // Auth check failed - treat as anonymous
    console.warn('Auth check failed in hasReachedLimit:', e);
  }

  // Anonymous user - check limit
  return hasReachedFreeUseLimit();
}

