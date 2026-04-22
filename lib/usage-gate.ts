/**
 * Client-side compatibility shim for legacy call sites.
 *
 * Free-tier enforcement lives in server routes and uses a rolling 24-hour
 * window. Keep this permissive to avoid double-gating client interactions.
 */

import { FREE_DAILY_QUERY_LIMIT } from "@/lib/entitlements";

export type FeatureType = 'chat' | 'search';
export const FREE_TIER_WINDOW_HOURS = 24;

export async function canUseFeature(feature: FeatureType): Promise<boolean> {
  void feature;
  return true;
}

export async function incrementUsage(feature: FeatureType): Promise<number> {
  void feature;
  return FREE_DAILY_QUERY_LIMIT;
}

export function getTrialCount(): number {
  return FREE_DAILY_QUERY_LIMIT;
}

export async function hasReachedLimit(): Promise<boolean> {
  return false;
}
