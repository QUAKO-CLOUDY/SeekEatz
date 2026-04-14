/**
 * Deprecated client-side gate shim.
 *
 * Free-tier enforcement now lives in server routes and premium surface
 * restrictions live in the app shell. Keep this permissive until any old call
 * sites are deleted so we do not double-gate the experience.
 */

export type FeatureType = 'chat' | 'search';

export async function canUseFeature(feature: FeatureType): Promise<boolean> {
  void feature;
  return true;
}

export async function incrementUsage(feature: FeatureType): Promise<number> {
  void feature;
  return 0;
}

export function getTrialCount(): number {
  return 0;
}

export async function hasReachedLimit(): Promise<boolean> {
  return false;
}
