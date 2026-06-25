import {
  getNearbySearchPayload,
  mergeNearbyCachePayload,
  saveNearbyContextFromResponse,
  getStoredNearbyContext,
  type NearbyCachePayload,
  type NearbySearchPayload,
} from '@/lib/nearby-context';

export function buildNearbySearchRequestFields(
  lat: number,
  lng: number,
  radiusMiles: number,
): NearbySearchPayload {
  return getNearbySearchPayload(lat, lng, radiusMiles);
}

export function persistNearbyCacheFromResponse(
  nearbyCache: NearbyCachePayload | null | undefined,
): void {
  if (!nearbyCache?.matches?.length) {
    return;
  }

  const existing = getStoredNearbyContext();
  saveNearbyContextFromResponse(mergeNearbyCachePayload(existing, nearbyCache));
}
