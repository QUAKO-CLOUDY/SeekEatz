/**
 * UsageGate utility – trial limits have been disabled.
 * All users (guest or authenticated) now have full access.
 */

export type FeatureType = 'chat' | 'search';

/**
 * Always allow feature usage. Trial credits are no longer enforced.
 */
export async function canUseFeature(feature: FeatureType): Promise<boolean> {
  void feature;
  return true;
}

/**
 * No-op usage increment. Returns 0 to indicate we don't track trial counts anymore.
 */
export async function incrementUsage(feature: FeatureType): Promise<number> {
  void feature;
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



