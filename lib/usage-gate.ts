/**
 * UsageGate utility – trial limits have been disabled.
 * All users (guest or authenticated) now have full access.
 */

export type FeatureType = 'chat' | 'search';

/**
 * Always allow feature usage. Trial credits are no longer enforced.
 */
export async function canUseFeature(_feature: FeatureType): Promise<boolean> {
  return true;
}

/**
 * No-op usage increment. Returns 0 to indicate we don't track trial counts anymore.
 */
export async function incrementUsage(_feature: FeatureType): Promise<number> {
  return 0;
}

/**
 * Trial count is always 0 now that limits are removed.
 */
export function getTrialCount(): number {
  return 0;
}

/**
 * Trial limit is never reached now that limits are removed.
 */
export async function hasReachedLimit(): Promise<boolean> {
  return false;
}




